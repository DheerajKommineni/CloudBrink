// backend/utils/pdfToMarkdown.js
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { exec } from 'child_process';
import { promisify } from 'util';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execAsync = promisify(exec);
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

/**
 * Parse pdfimages -list output to get image->page mapping
 */
function getImagePageMap(pdfPath) {
  try {
    const result = execSync(`pdfimages -list "${pdfPath}"`, {
      encoding: 'utf8',
    });

    // Check if result is undefined or empty
    if (!result || typeof result !== 'string') {
      console.log('  ⚠ pdfimages -list returned no output');
      return {};
    }

    const lines = result.split('\n').slice(2); // Skip header
    const map = {};

    lines.forEach(line => {
      const match = line.match(/^\s*(\d+)\s+(\d+)/);
      if (match) {
        const [, page, num] = match;
        const imgNum = num.padStart(3, '0');
        map[`img-${imgNum}`] = parseInt(page, 10);
      }
    });

    return map;
  } catch (error) {
    console.error('  ⚠ Failed to get image page map:', error.message);
    return {};
  }
}

/**
 * Render a single PDF page to PNG with margin cropping
 */
async function renderPageToPng(pdfPath, pageNum, outputPath) {
  try {
    const tempPath = outputPath.replace('.png', '-temp');

    // Render page at high DPI
    await execAsync(
      `pdftoppm -png -r 150 -f ${pageNum} -l ${pageNum} "${pdfPath}" "${tempPath}"`,
    );

    // pdftoppm adds -1 suffix
    const actualTemp = `${tempPath}-1.png`;

    // Check if file was created
    if (!fs.existsSync(actualTemp)) {
      console.error(`  ✗ Page render failed: output file not found`);
      return false;
    }

    // Crop margins
    await sharp(actualTemp)
      .trim(10) // Remove 10px white borders
      .toFile(outputPath);

    // Cleanup
    fs.unlinkSync(actualTemp);

    console.log(`  ✓ Rendered page ${pageNum} to ${path.basename(outputPath)}`);
    return true;
  } catch (error) {
    console.error(`  ✗ Failed to render page ${pageNum}:`, error.message);
    return false;
  }
}

async function mergeLayeredDiagrams(imageDir, files, pdfPath, imagePageMap) {
  const processed = new Set();
  const layerGroups = [];

  for (let i = 0; i < files.length; i++) {
    if (processed.has(i)) continue;

    const file = files[i];
    if (!/^img-\d{3}\.(png|ppm|pbm|jpg)$/i.test(file)) continue;
    const filePath = path.join(imageDir, file);

    try {
      const metadata = await sharp(filePath).metadata();
      const stats = await sharp(filePath).stats();
      const avgBrightness =
        stats.channels.reduce((sum, ch) => sum + ch.mean, 0) /
        stats.channels.length;

      // Only group black-background layers
      if (avgBrightness < 50) {
        const layerGroup = [
          {
            file,
            path: filePath,
            width: metadata.width,
            height: metadata.height,
            brightness: avgBrightness,
          },
        ];
        processed.add(i);

        // Find other black layers with matching dimensions
        for (let j = i + 1; j < files.length; j++) {
          if (processed.has(j)) continue;

          const nextFile = files[j];
          if (!/^img-\d{3}\.(png|ppm|pbm|jpg)$/i.test(nextFile)) continue;

          const nextPath = path.join(imageDir, nextFile);
          const nextMeta = await sharp(nextPath).metadata();
          const nextStats = await sharp(nextPath).stats();
          const nextBrightness =
            nextStats.channels.reduce((sum, ch) => sum + ch.mean, 0) /
            nextStats.channels.length;

          // Dimensions must roughly match and be black-background
          if (
            Math.abs(nextMeta.width - metadata.width) < 10 &&
            Math.abs(nextMeta.height - metadata.height) < 10 &&
            nextBrightness < 50
          ) {
            layerGroup.push({
              file: nextFile,
              path: nextPath,
              width: nextMeta.width,
              height: nextMeta.height,
              brightness: nextBrightness,
            });
            processed.add(j);
            console.log(
              `  ➕ Added black layer: ${nextFile} (brightness ${nextBrightness.toFixed(
                1,
              )})`,
            );
          }
        }

        if (layerGroup.length > 1) {
          layerGroups.push(layerGroup);
          console.log(
            `  ✅ Found ${layerGroup.length} black layers to merge (skipped white layers).`,
          );
        }
      }
    } catch (err) {
      console.error(`Error analyzing ${file}:`, err.message);
    }
  }

  // Now merge each group
  for (const group of layerGroups) {
    try {
      const baseMeta = await sharp(group[0].path).metadata();
      const width = baseMeta.width || group[0].width;
      const height = baseMeta.height || group[0].height;

      const firstBase = path.basename(
        group[0].path,
        path.extname(group[0].path),
      );
      const mergedPath = path.join(imageDir, `${firstBase}-merged.png`);

      // Progressive lighten-blend for all layers
      let baseBuffer = await sharp(group[0].path)
        .ensureAlpha()
        .toFormat('png')
        .toBuffer();

      for (let i = 1; i < group.length; i++) {
        const overlayBuffer = await sharp(group[i].path)
          .ensureAlpha()
          .toFormat('png')
          .toBuffer();

        baseBuffer = await sharp(baseBuffer)
          .composite([{ input: overlayBuffer, blend: 'lighten' }])
          .toBuffer();
      }

      await sharp(baseBuffer).toFile(mergedPath);

      console.log(
        `  ✅ Merged ${group.length} black layers → ${path.basename(
          mergedPath,
        )}`,
      );

      // Optional sanity check for brightness (ensure it’s not blank)
      const mergedStats = await sharp(mergedPath).stats();
      const mergedBrightness =
        mergedStats.channels.reduce((sum, ch) => sum + ch.mean, 0) /
        mergedStats.channels.length;
      const variance =
        mergedStats.channels.reduce((sum, ch) => sum + ch.stdev ** 2, 0) /
        mergedStats.channels.length;

      if (mergedBrightness > 240 || variance < 100) {
        console.log('  ⚠ Merged result too bright — re-rendering from page...');
        const imgNum = group[0].file.match(/img-(\d{3})/)?.[1];
        const pageNum = imagePageMap[`img-${imgNum}`];
        if (pageNum && pdfPath) {
          const success = await renderPageToPng(pdfPath, pageNum, mergedPath);
          if (success)
            console.log(`  ✓ Replaced with rendered page ${pageNum}`);
        }
      }

      // Clean up originals
      for (const layer of group) {
        try {
          fs.unlinkSync(layer.path);
        } catch (_) {}
      }
    } catch (err) {
      console.error('Merge failed:', err.message);
    }
  }
}

/**
 * Enhanced PDF to Markdown converter with image extraction
 */
export async function pdfToMarkdown(pdfPath, outputDir) {
  const baseName = path.basename(pdfPath, '.pdf');
  const imageDir = path.join(
    outputDir || path.dirname(pdfPath),
    'images',
    baseName,
  );

  // Extract images first
  let images = [];
  const imagesExist =
    fs.existsSync(imageDir) && fs.readdirSync(imageDir).length > 0;

  if (imagesExist) {
    console.log(`Using cached images for: ${baseName}`);
    images = loadExistingImages(imageDir, baseName);
  } else {
    console.log(`Extracting images for: ${baseName}`);
    images = await extractImagesFromPDF(pdfPath, outputDir);
  }

  // Skip Python parser - just use JavaScript fallback
  console.log(`Using JavaScript parser for: ${baseName}`);
  const dataBuffer = fs.readFileSync(pdfPath);
  const pdfData = await pdf(dataBuffer, { max: 0 });
  let text = pdfData.text;
  text = preprocessText(text);
  text = convertToMarkdown(text, images);
  return text;
}

/**
 * Load already extracted images
 */
function loadExistingImages(imageDir, baseName) {
  const images = [];
  const files = fs
    .readdirSync(imageDir)
    .filter(f => /\.(png|jpg|jpeg)$/i.test(f))
    .sort();

  files.forEach((file, index) => {
    images.push({
      page: index + 1,
      path: `/api/images/${baseName}/${file}`,
      alt: `Diagram ${index + 1}`,
      filename: file,
    });
  });

  return images;
}

/**
 * Calculate image similarity using pixel data
 */
async function calculateImageSimilarity(imagePath1, imagePath2) {
  try {
    const size = 100;

    const img1 = await sharp(imagePath1)
      .resize(size, size, { fit: 'fill' })
      .raw()
      .toBuffer();

    const img2 = await sharp(imagePath2)
      .resize(size, size, { fit: 'fill' })
      .raw()
      .toBuffer();

    let diff = 0;
    for (let i = 0; i < img1.length; i++) {
      diff += Math.abs(img1[i] - img2[i]);
    }

    const maxDiff = 255 * img1.length;
    return diff / maxDiff;
  } catch (error) {
    console.error('Error comparing images:', error.message);
    return 1;
  }
}

/**
 * Extract images from PDF - WITH RELAXED THRESHOLDS FOR HOW-TO GUIDES
 */
async function extractImagesFromPDF(pdfPath, outputDir) {
  const images = [];
  const baseName = path.basename(pdfPath, '.pdf');
  const imageDir = path.join(
    outputDir || path.dirname(pdfPath),
    'images',
    baseName,
  );

  if (!fs.existsSync(imageDir)) {
    fs.mkdirSync(imageDir, { recursive: true });
  }

  try {
    const imagePrefix = path.join(imageDir, 'img');

    // Get image->page mapping
    const imagePageMap = getImagePageMap(pdfPath);

    const { stderr } = await execAsync(
      `pdfimages -all "${pdfPath}" "${imagePrefix}"`,
    );

    if (stderr && !stderr.includes('Syntax Warning')) {
      console.log('pdfimages stderr:', stderr);
    }

    let files = fs
      .readdirSync(imageDir)
      .filter(
        f =>
          f.endsWith('.png') ||
          f.endsWith('.ppm') ||
          f.endsWith('.pbm') ||
          f.endsWith('.jpg'),
      )
      .sort();

    // Merge layered diagrams with fallback rendering
    if (files.length > 1) {
      await mergeLayeredDiagrams(imageDir, files, pdfPath, imagePageMap);
      files = fs
        .readdirSync(imageDir)
        .filter(
          f =>
            f.endsWith('.png') ||
            f.endsWith('.ppm') ||
            f.endsWith('.pbm') ||
            f.endsWith('.jpg'),
        )
        .sort();
    }

    const meaningfulImages = [];
    const acceptedImages = [];

    // Detect if this is a How-To guide
    const isHowToGuide = baseName.match(/how-?to/i);

    // Detect if filename contains "HowTo"
    const hasHowToInFilename = baseName.includes('HowTo');

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!/^img-\d{3}.*\.(png|ppm|pbm|jpg)$/.test(file)) continue;

      const filePath = path.join(imageDir, file);

      try {
        const metadata = await sharp(filePath).metadata();
        const width = metadata.width;
        const height = metadata.height;
        const sizeKB = Math.round(fs.statSync(filePath).size / 1024);
        const aspectRatio = width / height;

        console.log(
          `Analyzing ${file}: ${width}×${height}, ${sizeKB}KB, ratio=${aspectRatio.toFixed(
            2,
          )}`,
        );

        // Known logos to filter (including top-right logo)
        const knownLogoBannerSizes = [
          { w: 568, h: 130 },
          { w: 2559, h: 357 },
          { w: 808, h: 187 },
          { w: 530, h: 108 },
          { w: 2625, h: 230 },
          { w: 2559, h: 192 },
          { w: 653, h: 133 },
          { w: 707, h: 127 },
          { w: 982, h: 201 },
          { w: 171, h: 38 },
          { w: 170, h: 38 },
          { w: 172, h: 38 },
        ];

        const isKnownLogo = knownLogoBannerSizes.some(
          size =>
            Math.abs(width - size.w) <= 5 && Math.abs(height - size.h) <= 5,
        );

        // For files WITHOUT "HowTo" in filename, filter out known logos completely
        if (isKnownLogo && !hasHowToInFilename) {
          console.log(`  ❌ Filtered: Known logo`);
          continue;
        }

        // ====== CRITICAL: For files with "HowTo" in filename, keep 751×175 logo but mark as hidden ======
        let isHiddenLogo = false;
        if (
          hasHowToInFilename &&
          Math.abs(width - 751) <= 5 &&
          Math.abs(height - 175) <= 5
        ) {
          console.log(
            `  ⚠️  Marked as hidden: HowTo guide logo (751×175) - keeping for position`,
          );
          isHiddenLogo = true;
          // Don't continue - we want to keep this in the array
        }

        // Skip other known logos in files with "HowTo" in filename
        if (hasHowToInFilename && isKnownLogo && !isHiddenLogo) {
          console.log(`  ❌ Filtered: Known logo (non-position-critical)`);
          continue;
        }

        // HOW-TO GUIDE RULE: Skip first image if it's the top-right logo
        if (
          isHowToGuide &&
          i === 0 &&
          width < 200 &&
          height < 50 &&
          !isHiddenLogo
        ) {
          console.log(`  ❌ Filtered: First image (likely logo)`);
          continue;
        }

        // ====== CRITICAL FIX: Always accept merged architecture diagrams ======
        if (/-merged\.(png|jpg)$/i.test(file) || file.includes('-merged')) {
          console.log(
            `  ✅ Accepted: merged architecture diagram${
              isHiddenLogo ? ' (hidden)' : ''
            }`,
          );
          const imageData = {
            file,
            width,
            height,
            sizeKB,
            aspectRatio,
            path: filePath,
            isArchitectureDiagram: true,
            isHiddenLogo: isHiddenLogo,
          };
          meaningfulImages.push(imageData);
          acceptedImages.push(imageData);
          continue;
        }
        // ====== End of critical fix ======

        // If it's a hidden logo, accept it without further checks
        if (isHiddenLogo) {
          console.log(`  ✅ Accepted: hidden logo (keeping for position)`);
          const imageData = {
            file,
            width,
            height,
            sizeKB,
            aspectRatio,
            path: filePath,
            isArchitectureDiagram: false,
            isHiddenLogo: true,
          };
          meaningfulImages.push(imageData);
          acceptedImages.push(imageData);
          continue;
        }

        // Check if image is blank/white
        const stats = await sharp(filePath).stats();
        const avgBrightness =
          stats.channels.reduce((sum, ch) => sum + ch.mean, 0) /
          stats.channels.length;

        if (avgBrightness > 250) {
          console.log(
            `  ❌ Filtered: Blank white (brightness: ${avgBrightness.toFixed(
              0,
            )})`,
          );
          continue;
        }

        // Keep architecture diagrams
        const isArchitectureDiagram =
          avgBrightness < 50 && file.includes('-merged');

        // HOW-TO GUIDE: RELAXED thresholds for small screenshots
        let minSizeKB = 2;
        let minWidth = 200;
        let minHeight = 100;

        if (isHowToGuide) {
          minSizeKB = 1;
          minWidth = 100;
          minHeight = 50;
        }

        if (sizeKB < minSizeKB) {
          console.log(`  ❌ Filtered: Too small (${sizeKB}KB)`);
          continue;
        }

        if (aspectRatio > 10 || aspectRatio < 0.1) {
          console.log(
            `  ❌ Filtered: Extreme aspect ratio (${aspectRatio.toFixed(2)})`,
          );
          continue;
        }

        const isReasonableSize = width > minWidth && height > minHeight;
        const isLargeFile = sizeKB > 10;

        if (!isReasonableSize && !isLargeFile) {
          console.log(
            `  ❌ Filtered: Too small (${width}×${height}, ${sizeKB}KB)`,
          );
          continue;
        }

        // Duplicate check (skip for architecture diagrams)
        let isSimilar = false;
        if (!isArchitectureDiagram) {
          for (const accepted of acceptedImages) {
            const widthDiff = Math.abs(width - accepted.width);
            const heightDiff = Math.abs(height - accepted.height);
            const dimensionMatch = widthDiff < 10 && heightDiff < 10;

            if (dimensionMatch) {
              const sizeDiffRatio =
                Math.abs(sizeKB - accepted.sizeKB) /
                Math.max(sizeKB, accepted.sizeKB);

              if (sizeDiffRatio < 0.001) {
                const similarity = await calculateImageSimilarity(
                  filePath,
                  accepted.path,
                );

                if (similarity < 0.01) {
                  isSimilar = true;
                  console.log(`  ❌ Filtered: Duplicate of ${accepted.file}`);
                  break;
                }
              }
            }
          }
        }

        if (isSimilar) continue;

        console.log(`  ✅ Accepted`);
        const imageData = {
          file,
          width,
          height,
          sizeKB,
          aspectRatio,
          path: filePath,
          isArchitectureDiagram,
          isHiddenLogo: false,
        };
        meaningfulImages.push(imageData);
        acceptedImages.push(imageData);
      } catch (err) {
        console.error(`Error reading ${file}:`, err.message);
      }
    }

    console.log(
      `\nExtracted ${meaningfulImages.length} meaningful images from ${baseName}`,
    );

    meaningfulImages.forEach((img, index) => {
      images.push({
        page: index + 1,
        path: `/api/images/${baseName}/${img.file}`,
        alt: img.isArchitectureDiagram
          ? `Architecture Diagram ${index + 1}`
          : `Diagram ${index + 1}`,
        filename: img.file,
        dimensions: `${img.width}x${img.height}`,
        isHiddenLogo: img.isHiddenLogo || false,
      });
    });
  } catch (error) {
    console.error('Error extracting images:', error.message);
    if (
      error.message.includes('command not found') ||
      error.message.includes('pdfimages')
    ) {
      console.log('pdfimages not found. Install poppler-utils');
    }
  }

  return images;
}

/**
 * Extract text with formatting using pdf.js
 */
async function extractFormattedText(pdfPath) {
  try {
    const dataBuffer = fs.readFileSync(pdfPath);
    const typedArray = new Uint8Array(dataBuffer);

    // Load PDF with pdf.js
    const loadingTask = pdfjs.getDocument({ data: typedArray });
    const pdfDocument = await loadingTask.promise;

    let fullText = '';
    const boldPatterns = new Set(); // Track bold text patterns

    // Process each page
    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const textContent = await page.getTextContent();

      let pageText = '';
      let lastY = null;

      for (const item of textContent.items) {
        // Check if new line (Y position changed significantly)
        if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
          pageText += '\n';
        }
        lastY = item.transform[5];

        const text = item.str;

        // Detect bold text by font name
        const fontName = item.fontName || '';
        const isBold =
          fontName.toLowerCase().includes('bold') ||
          fontName.includes('Bold') ||
          fontName.includes('Heavy') ||
          fontName.includes('Black');

        if (isBold && text.trim().length > 0) {
          // Add bold markdown
          pageText += `**${text}**`;
          boldPatterns.add(text.trim());
        } else {
          pageText += text;
        }

        // Add space if needed
        if (item.hasEOL || (item.width > 0 && !text.endsWith(' '))) {
          pageText += ' ';
        }
      }

      fullText += pageText + '\n\n';
    }

    return { text: fullText, boldPatterns: Array.from(boldPatterns) };
  } catch (error) {
    console.error('Error extracting formatted text:', error.message);
    return null;
  }
}

/**
 * Fallback: Heuristic-based bold detection
 * Use this when pdf.js is not available
 */
function detectAndMarkBoldText(text) {
  // Common patterns that are typically bold in your PDFs
  const boldPatterns = [
    // Section headers
    /^(Introduction|Prerequisites|Use Cases|IMPORTANT|NOTE|WARNING|TIP|CAUTION)$/gm,

    // Labels followed by colons
    /^([A-Z][A-Za-z\s]+):(?=\s)/gm,

    // All caps words (3+ letters)
    /\b([A-Z]{3,})\b/g,

    // Keywords commonly bold in your docs
    /\b(Admin Portal|Bridge Mode|QOE Analytics|Connector VM|Enterprise Portal)\b/g,
  ];

  let processedText = text;

  for (const pattern of boldPatterns) {
    processedText = processedText.replace(pattern, '**$1**');
  }

  // Clean up double-bolding
  processedText = processedText.replace(/\*\*\*\*/g, '**');

  return processedText;
}

/**
 * Update the pdfToMarkdown function to use formatted text
 */
export async function pdfToMarkdownWithBold(pdfPath, outputDir) {
  const baseName = path.basename(pdfPath, '.pdf');
  const imageDir = path.join(
    outputDir || path.dirname(pdfPath),
    'images',
    baseName,
  );

  // Extract images first
  let images = [];
  const imagesExist =
    fs.existsSync(imageDir) && fs.readdirSync(imageDir).length > 0;

  if (imagesExist) {
    console.log(`Using cached images for: ${baseName}`);
    images = loadExistingImages(imageDir, baseName);
  } else {
    console.log(`Extracting images for: ${baseName}`);
    images = await extractImagesFromPDF(pdfPath, outputDir);
  }

  console.log(`Parsing PDF with formatting: ${baseName}`);

  // Try to extract formatted text with pdf.js
  const formatted = await extractFormattedText(pdfPath);

  let text;
  if (formatted) {
    text = formatted.text;
    console.log(`Found ${formatted.boldPatterns.length} bold text patterns`);
  } else {
    // Fallback to pdf-parse
    console.log('Using fallback parser with heuristic bold detection');
    const dataBuffer = fs.readFileSync(pdfPath);
    const pdfData = await pdf(dataBuffer, { max: 0 });
    text = detectAndMarkBoldText(pdfData.text);
  }

  text = preprocessText(text);
  text = convertToMarkdown(text, images);
  return text;
}

/**
 * Preprocess PDF text to clean artifacts
 */
function preprocessText(text) {
  // Fix line endings
  text = text.replace(/\r\n/g, '\n');
  text = text.replace(/\r/g, '\n');

  // Fix encoding issues
  text = text.replace(/â€™/g, "'");
  text = text.replace(/â€œ/g, '"');
  text = text.replace(/â€/g, '"');
  text = text.replace(/â€"/g, '–');
  text = text.replace(/â€"—/g, '—');
  text = text.replace(/â†'/g, '→');
  text = text.replace(/â—/g, '●');
  text = text.replace(/Â©/g, '©');
  text = text.replace(/Â /g, '');
  text = text.replace(/\u00A0/g, ' ');
  text = text.replace(/\u2022/g, '•');

  // Remove header elements
  text = text.replace(/^Hybrid Access [Aa]s [Aa] Service\s*$/gim, '');
  text = text.replace(/^Software Defined Mobility\s*$/gim, '');
  text = text.replace(/^Cloudbrink Software Defined Mobility\s*$/gim, '');

  // Remove page numbers and footers
  text = text.replace(/^.*?\|\s*\d+.*$/gim, '');
  text = text.replace(/^\|\s*\d+[A-Za-z\s]*$/gim, '');
  text = text.replace(/^Bridge Mode (User|Admin) Guide\s*\|\s*\d+.*$/gim, '');
  text = text.replace(/^Cloudbrink Connector - VMware\s*\|\s*\d+.*$/gim, '');
  text = text.replace(/^Page\s+\d+\s+of\s+\d+$/gim, '');

  // Remove standalone page numbers
  const lines = text.split('\n');
  const filtered = lines.filter(line => {
    const trimmed = line.trim();
    if (/^\d+$/.test(trimmed) && trimmed.length < 3) return false;
    return true;
  });
  text = filtered.join('\n');

  // REMOVE ALL FOOTER CONTENT - it will be added as a standard footer later
  // Remove corporate headquarters address (all variations)
  text = text.replace(
    /Corporate Headquarters\s+Cloudbrink,?\s*Inc\.?\s*\n?\s*530\s+Lakeside.*?CA\s+\d{5}/gis,
    '',
  );

  // Remove standalone address lines
  text = text.replace(
    /530\s+Lakeside\s+Drive,?\s+Suite\s+190,?\s+Sunnyvale,?\s+CA\s+94085/gi,
    '',
  );

  // Remove copyright text (all variations, including 2021, 2023, etc.)
  text = text.replace(
    /©\s*20\d{2}\s+Cloudbrink,?\s*Inc\..*?property\s+of\s+their\s+respective\s+owners\.?/gis,
    '',
  );

  text = text.replace(/\s*-\s*Continued\s*$/gim, '');

  // Remove duplicate section headers
  const seenHeaders = new Set();
  const finalLines = [];

  for (const line of text.split('\n')) {
    const trimmed = line.trim();

    if (
      trimmed.match(
        /^(Bridge Mode User Config|Introduction|Prerequisites|Bridge Mode Important Notes)$/i,
      )
    ) {
      const normalized = trimmed.toLowerCase();
      if (seenHeaders.has(normalized)) {
        continue;
      }
      seenHeaders.add(normalized);
    }
    finalLines.push(line);
  }

  text = finalLines.join('\n');

  // Remove duplicate title occurrences
  const titleMatch = text.match(/Bridge Mode (User|Admin) Guide/i);
  if (titleMatch) {
    const firstIndex = text.indexOf(titleMatch[0]);
    text =
      text.substring(0, firstIndex + titleMatch[0].length) +
      text
        .substring(firstIndex + titleMatch[0].length)
        .replace(/Bridge Mode (User|Admin) Guide/gi, '');
  }

  text = text.replace(/\n{4,}/g, '\n\n');

  return text.trim();
}

/**
 * Restore bold formatting for common patterns
 */
function restoreBoldPatterns(text) {
  // Pattern 1: NOTE, IMPORTANT, WARNING labels (already handled in markdown conversion, but ensure it's bold)
  text = text.replace(
    /\b(NOTE|IMPORTANT|WARNING|TIP|CAUTION)(\s*\([^)]+\))?:/gi,
    '**$1$2**:',
  );

  // Pattern 2: Key section names when they appear mid-text
  text = text.replace(
    /\b(Admin Portal|Bridge Mode|Connector VM|Enterprise Portal|QOE Analytics|Software Defined Mobility|Hybrid Access)\b/g,
    '**$1**',
  );

  // Pattern 3: Figure labels
  text = text.replace(/^(Figure\s+\d+:)/gim, '**$1**');

  // Pattern 4: Common bold keywords in instructions
  text = text.replace(
    /\b(Prerequisites|Configuration|Installation|Deployment|Login|Validation|Create|Assign|Published|Generate)\b(?=:|\s+[A-Z])/g,
    '**$1**',
  );

  // Pattern 5: Step numbers at start of lines (already handled in conversion)
  // But ensure numbered items like "1." at line start are bold
  text = text.replace(/^(\d+\.)\s/gm, '**$1** ');

  // Clean up any double-bolding
  text = text.replace(/\*\*\*\*/g, '**');

  // Clean up bold around existing markdown (avoid **## Header**)
  text = text.replace(/\*\*(#+)\s+/g, '$1 ');

  return text;
}

/**
 * Generate standard footer for all documents
 */
function generateStandardFooter() {
  return `---
  
  **Corporate Headquarters Cloudbrink, Inc.**  
  *530 Lakeside Drive, Suite 190, Sunnyvale, CA 94085*

  <sub>© 2021 Cloudbrink, Inc. All rights reserved. Cloudbrink, the Cloudbrink logo, and all product and service names mentioned herein are registered trademarks or trademarks of Cloudbrink, Inc. in the United States and other countries. All other trademarks, service marks, registered marks, or registered service marks mentioned herein are for identification purposes only and are the property of their respective owners.</sub>`;
}

/**
 * Convert to Markdown with images - ROUTER FUNCTION
 */
function convertToMarkdown(text, images) {
  let markdown;

  // Check if this is a table-based document
  if (isTableDocument(text)) {
    markdown = convertTableDocument(text, images);
  }
  // Check if this is a How-To guide by looking at the first image path
  else if (images.length > 0 && images[0].path.includes('HowTo')) {
    console.log('Using How-To conversion logic');
    markdown = convertHowToMarkdown(text, images);
  } else {
    console.log('Using standard conversion logic');
    markdown = convertStandardMarkdown(text, images);
  }

  // Apply bold patterns AFTER conversion
  return restoreBoldPatterns(markdown);
}

/**
 * Convert How-To guides to Markdown - SIMPLIFIED
 */
function convertHowToMarkdown(text, images) {
  const lines = text.split('\n');
  const result = [];
  let i = 0;
  let currentParagraph = [];
  let imageIndex = 0;
  let inTableOfContents = false;

  const flushParagraph = () => {
    if (currentParagraph.length > 0) {
      result.push(currentParagraph.join(' '));
      currentParagraph = [];
    }
  };

  const insertNextImage = () => {
    if (imageIndex < images.length) {
      // Skip hidden logos but still increment the index
      if (images[imageIndex].isHiddenLogo) {
        imageIndex++;
        return false;
      }

      result.push('');
      result.push(`![${images[imageIndex].alt}](${images[imageIndex].path})`);
      result.push('');
      imageIndex++;
      return true;
    }
    return false;
  };

  // 🧠 Detect if this file is a How-to guide but doesn't contain "HowTo" in the name
  const baseName = images?.[0]?.path?.split('/')?.[3] || '';
  const isRegularHowTo = /HowTo/i.test(baseName) ? false : true;

  let firstHeadingPromoted = false; // Whether we've promoted H3→H1
  let h1Locked = false; // Whether we forbid more H1s after content

  while (i < lines.length) {
    let line = lines[i].trim();

    if (!line) {
      flushParagraph();
      if (result.length > 0 && result[result.length - 1] !== '') {
        result.push('');
      }
      // Once first H1 is followed by normal content, lock future H1s
      if (firstHeadingPromoted && !h1Locked) {
        const lastAdded = result[result.length - 1] || '';
        if (
          lastAdded &&
          !lastAdded.startsWith('#') &&
          !lastAdded.startsWith('>') &&
          !lastAdded.startsWith('-')
        ) {
          h1Locked = true;
        }
      }

      // If any new H1 appears after lock, downgrade it
      if (h1Locked && /^# /.test(line)) {
        line = line.replace(/^# /, '## ');
      }

      i++;
      continue;
    }

    // Skip copyright/footer lines
    if (
      line.startsWith('©') ||
      line.match(
        /Corporate Headquarters|530 Lakeside|Software Defined Mobility/i,
      )
    ) {
      i++;
      continue;
    }

    // Main title (H1) - Handle multi-line titles
    if (i < 5 && isMainTitle(line)) {
      flushParagraph();

      // Check if the next line is a continuation of the title
      let fullTitle = line;
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        // If next line is short and doesn't look like a section header, it's part of the title
        if (
          nextLine &&
          nextLine.length < 50 &&
          !isSectionHeader(nextLine) &&
          !isTableOfContentsEntry(nextLine)
        ) {
          fullTitle += ' ' + nextLine;
          i++; // Skip the next line since we consumed it
        }
      }

      result.push(`# ${fullTitle}`);
      result.push('');
      inTableOfContents = true;
      i++;
      continue;
    }

    // Skip table of contents entries
    if (inTableOfContents && isTableOfContentsEntry(line)) {
      i++;
      continue;
    }

    // Section headers (H2)
    if (isSectionHeader(line)) {
      flushParagraph();
      result.push('');
      result.push(`## ${line}`);
      result.push('');
      inTableOfContents = false;

      // Insert image after Introduction
      if (line.toLowerCase().includes('introduction')) {
        insertNextImage();
      }

      i++;
      continue;
    }

    // Subsection headers (H3) - Including "Figure X:" and section names
    if (isHowToSubsectionHeader(line)) {
      flushParagraph();
      result.push('');

      // 🪄 Promote first H3 → H1 only for regular How-to files
      if (isRegularHowTo && !firstHeadingPromoted && !h1Locked) {
        result.push(`# ${line}`);
        firstHeadingPromoted = true;
      } else {
        result.push(`### ${line}`);
      }

      result.push('');

      // Insert image after Figure headers
      if (line.match(/^Figure\s+\d+:/i)) {
        insertNextImage();
      }

      i++;
      continue;
    }

    // Numbered lists with sub-items (2.1., 3.3.1., etc.)
    const numberedMatch = line.match(/^(\d+(?:\.\d+)*[\.)]\s+)(.+)$/);
    if (numberedMatch) {
      flushParagraph();
      const [, prefix, content] = numberedMatch;
      result.push('');
      result.push(`${prefix}${content}`);
      i++;
      continue;
    }

    // Bullet points
    if (line.startsWith('•') || line.startsWith('●') || line.startsWith('-')) {
      flushParagraph();
      line = line.replace(/^[•●-]\s*/, '- ');
      result.push(line);
      i++;
      continue;
    }

    // Regular paragraph
    currentParagraph.push(line);
    i++;
  }

  flushParagraph();

  // Insert any remaining images at the end
  while (imageIndex < images.length) {
    insertNextImage();
  }

  // Add standard footer
  result.push('');
  result.push(generateStandardFooter());

  let finalText = result.join('\n');
  finalText = finalText.replace(/\n{3,}/g, '\n\n');

  return finalText.trim();
}

/**
 * Convert standard documents to Markdown - ORIGINAL LOGIC
 */
function convertStandardMarkdown(text, images) {
  const lines = text.split('\n');
  const result = [];
  let i = 0;
  let currentParagraph = [];
  let imageIndex = 0;

  // Track which section we're in
  let inDetailedInstructions = false;
  let inUserConfig = false;

  const flushParagraph = () => {
    if (currentParagraph.length > 0) {
      result.push(currentParagraph.join(' '));
      currentParagraph = [];
    }
  };

  const insertNextImage = () => {
    if (imageIndex < images.length) {
      result.push('');
      result.push(`![${images[imageIndex].alt}](${images[imageIndex].path})`);
      result.push('');
      imageIndex++;
      return true;
    }
    return false;
  };

  while (i < lines.length) {
    let line = lines[i].trim();

    if (!line) {
      flushParagraph();
      if (result.length > 0 && result[result.length - 1] !== '') {
        result.push('');
      }
      i++;
      continue;
    }

    // Skip any remaining copyright/footer lines
    if (
      line.startsWith('©') ||
      line.match(
        /Corporate Headquarters|530 Lakeside|Software Defined Mobility/i,
      )
    ) {
      i++;
      continue;
    }

    // Main title (H1)
    if (i < 5 && isMainTitle(line)) {
      flushParagraph();
      result.push(`# ${line}`);
      result.push('');
      i++;
      continue;
    }

    // Section headers (H2)
    if (isSectionHeader(line)) {
      flushParagraph();
      result.push('');
      result.push(`## ${line}`);
      result.push('');

      // Insert image after Introduction heading
      if (line.toLowerCase().includes('introduction')) {
        insertNextImage();
      }

      // Insert image after "QOE Analytics Functionality"
      if (line.match(/QOE Analytics Functionality/i)) {
        let hasRomanNumerals = false;
        let j = i + 1;
        while (j < lines.length && j < i + 20) {
          if (lines[j].trim().match(/^[ivxIVX]+\)\s+/)) {
            hasRomanNumerals = true;
            break;
          }
          j++;
        }

        if (!hasRomanNumerals) {
          insertNextImage();
        }
      }

      // Track if we're entering special sections
      if (
        line.match(
          /Admin Portal Detailed Instructions|Connector VM.*Detailed Instructions/i,
        )
      ) {
        inDetailedInstructions = true;
        inUserConfig = false;
      } else if (
        line.match(/Bridge Mode.*User Config|Bridge Mode.*End User Config/i)
      ) {
        inUserConfig = true;
        inDetailedInstructions = false;
      } else if (
        !line.match(/Admin Portal High Level|Connector VM.*High Level/i)
      ) {
        inDetailedInstructions = false;
        inUserConfig = false;
      }

      i++;
      continue;
    }

    // Subsection headers (H3)
    if (isSubsectionHeader(line, lines, i)) {
      flushParagraph();
      const cleanLine = line.replace(/\s*-\s*Continued\s*$/i, '');
      result.push('');
      result.push(`### ${cleanLine}`);
      result.push('');

      if (
        cleanLine.match(
          /Admin Portal Detailed Instructions|Connector VM.*Detailed Instructions/i,
        )
      ) {
        inDetailedInstructions = true;
        inUserConfig = false;
      } else if (cleanLine.match(/Bridge Mode.*End User Config/i)) {
        inUserConfig = true;
        inDetailedInstructions = false;
      }

      i++;
      continue;
    }

    // NOTE/IMPORTANT blocks
    const noteLabelMatch = line.match(
      /^(NOTE|IMPORTANT|WARNING|TIP|CAUTION)(\s*\([^)]+\))?:\s*(.*)$/i,
    );
    if (noteLabelMatch) {
      flushParagraph();
      const [, label, parenthetical, restOfText] = noteLabelMatch;
      const boldPart = parenthetical ? `${label}${parenthetical}` : label;

      result.push('');
      result.push(`> **${boldPart}:** ${restOfText}`);

      let j = i + 1;
      let blankLineCount = 0;

      while (j < lines.length) {
        const nextLine = lines[j].trim();

        if (!nextLine) {
          blankLineCount++;
          if (blankLineCount >= 1) {
            j++;
            break;
          }
          j++;
          continue;
        }

        blankLineCount = 0;

        if (
          nextLine.match(/^Use Cases:/i) ||
          isNewSection(nextLine, lines, j)
        ) {
          break;
        }

        result.push(`> ${nextLine}`);
        j++;
      }

      result.push('');
      i = j;
      continue;
    }

    // "Use Cases:" special header
    if (line.match(/^Use Cases:$/i)) {
      flushParagraph();
      result.push('');
      result.push(`## Use Cases`);
      result.push('');
      i++;
      continue;
    }

    // Numbered lists (1., 2., etc.)
    const numberedMatch = line.match(/^(\d+)[\.)]\s+(.+)$/);
    if (numberedMatch) {
      flushParagraph();
      const [, num, content] = numberedMatch;
      const itemLines = [content];
      let j = i + 1;

      while (j < lines.length) {
        const nextLine = lines[j].trim();
        if (!nextLine || isNewSection(nextLine, lines, j)) break;
        itemLines.push(nextLine);
        j++;
      }

      result.push('');
      result.push(`${num}. ${itemLines.join(' ')}`);
      result.push('');

      if (inDetailedInstructions || inUserConfig) {
        insertNextImage();
      }

      i = j;
      continue;
    }

    // Roman numeral lists
    const romanMatch = line.match(/^([ivxIVX]+)\)\s+(.+)$/);
    if (romanMatch) {
      flushParagraph();
      const [, roman, content] = romanMatch;

      const isFirstRomanNumeral = roman.toLowerCase() === 'i';
      const hasQOESection = result.some(r =>
        /QOE Analytics Functionality/i.test(r),
      );

      if (isFirstRomanNumeral && hasQOESection && imageIndex < images.length) {
        result.push('');
        insertNextImage();
      }

      result.push('');
      result.push(`**${roman})** ${content}`);

      let j = i + 1;
      const continuationLines = [];
      while (j < lines.length) {
        const nextLine = lines[j].trim();
        if (
          !nextLine ||
          /^[ivxIVX]+\)\s+/.test(nextLine) ||
          isNewSection(nextLine, lines, j)
        )
          break;
        continuationLines.push(nextLine);
        j++;
      }

      if (continuationLines.length > 0) {
        result.push('');
        result.push(continuationLines.join(' '));
      }

      i = j;
      continue;
    }

    // Bullet points
    if (
      line.startsWith('•') ||
      line.startsWith('●') ||
      line.startsWith('○') ||
      line.startsWith('-')
    ) {
      flushParagraph();
      line = line.replace(/^[•●○-]\s*/, '- ');
      result.push(line);
      i++;
      continue;
    }

    // Regular paragraph
    currentParagraph.push(line);
    i++;
  }

  flushParagraph();

  // Add standard footer
  result.push('');
  result.push(generateStandardFooter());

  let finalText = result.join('\n');
  finalText = finalText.replace(/\n{3,}/g, '\n\n');

  return finalText.trim();
}

/**
 * Convert table-based documents (release notes) - WITH STANDARD FOOTER
 */
function convertTableDocument(text, images) {
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l);

  // Find and extract the title
  let titleLine = '';

  for (const line of lines) {
    if (line.match(/(Release|Patch) Notes.*Cloudbrink.*\d+\.\d+/i)) {
      const titleMatch = line.match(
        /((Release|Patch) Notes.*Cloudbrink.*\d+\.\d+[\.\d]*)/i,
      );
      if (titleMatch) {
        titleLine = titleMatch[1];
      }
    }
  }

  const result = [];

  // Add title
  if (titleLine) {
    result.push(`# ${titleLine}`);
    result.push('');
  }

  // Process sections
  let i = 0;

  // Skip to first section
  while (i < lines.length) {
    if (
      lines[i].match(/^(New Features|Issues Resolved|Support Information)$/i)
    ) {
      break;
    }
    i++;
  }

  // Process content
  while (i < lines.length) {
    const line = lines[i];

    if (!line) {
      i++;
      continue;
    }

    // Skip footer content
    if (
      line.startsWith('©') ||
      line.match(
        /530 Lakeside|Corporate Headquarters|Software Defined Mobility/i,
      ) ||
      line === titleLine
    ) {
      i++;
      continue;
    }

    // Section headers
    if (line.match(/^(New Features|Issues Resolved|Support Information)$/i)) {
      result.push('');
      result.push(`## ${line}`);
      result.push('');
      i++;

      // Check for table header
      if (
        i < lines.length &&
        lines[i].match(/^(Feature|Item)\s+Description$/i)
      ) {
        i = parseTableIntoResult(lines, i, result);
        continue;
      }
      continue;
    }

    // Support Information content
    if (line.match(/^We would love to hear/i)) {
      result.push('');
      const supportLines = [];

      while (i < lines.length) {
        const curr = lines[i];
        if (
          !curr ||
          curr.startsWith('©') ||
          curr.match(
            /530 Lakeside|Corporate Headquarters|Software Defined Mobility/i,
          )
        ) {
          break;
        }
        supportLines.push(curr);
        i++;
      }

      result.push(supportLines.join(' '));
      result.push('');
      continue;
    }

    i++;
  }

  // Add standard footer
  result.push('');
  result.push(generateStandardFooter());

  return result.join('\n').trim();
}

/**
 * Parse table and add to result
 */
function parseTableIntoResult(lines, startIndex, result) {
  let i = startIndex;
  const headerLine = lines[i] || '';

  const isFeatureTable = headerLine.includes('Feature');
  const col1Name = isFeatureTable ? 'Feature' : 'Item';

  result.push('');
  result.push(`| # | ${col1Name} | Description |`);
  result.push('|---|---|---|');
  i++;

  // Collect table lines
  const tableLines = [];

  while (i < lines.length) {
    const line = lines[i];

    if (!line) {
      i++;
      continue;
    }

    // Stop at section or noise
    if (
      line.match(/^(New Features|Issues Resolved|Support Information)$/i) ||
      line.startsWith('©') ||
      line.match(/530 Lakeside|Corporate Headquarters|Hybrid Access/i)
    ) {
      break;
    }

    tableLines.push(line);
    i++;
  }

  // Parse rows with better splitting
  const rows = parseTableRowsSmart(tableLines, isFeatureTable);

  rows.forEach(row => {
    result.push(
      `| ${row.num} | ${escapeMarkdown(row.feature)} | ${escapeMarkdown(
        row.description,
      )} |`,
    );
  });

  result.push('');

  return i;
}

/**
 * Smart table row parsing with better feature/description detection
 */
function parseTableRowsSmart(tableLines, isFeatureTable) {
  const rows = [];
  let currentRow = null;

  for (const line of tableLines) {
    const rowMatch = line.match(/^(\d+)\s+(.+)$/);

    if (rowMatch) {
      // Save previous
      if (currentRow) {
        rows.push(currentRow);
      }

      const [, num, rest] = rowMatch;

      // Better splitting logic
      let feature, description;

      if (isFeatureTable) {
        // For features: look for action words that start descriptions
        const descMatch = rest.match(
          /^(.+?)\s+(This feature|Enables|Brink App is|Enhanced|Allows|The |Admins can|Admin can|Customers can|DPA |Updated |Improved |Increased )/i,
        );

        if (descMatch) {
          feature = descMatch[1].trim();
          description = descMatch[2] + rest.substring(descMatch[0].length);
        } else {
          // Fallback: features are typically 2-5 words
          const words = rest.split(/\s+/);
          const splitAt = Math.min(5, words.length > 8 ? 4 : 3);
          feature = words.slice(0, splitAt).join(' ');
          description = words.slice(splitAt).join(' ');
        }
      } else {
        // For issues: look for past tense verbs
        const descMatch = rest.match(
          /^(.+?)\s+(Resolve|Resolved|Fixed|Corrected|We have|Increased )/i,
        );

        if (descMatch) {
          feature = descMatch[1].trim();
          description = descMatch[2] + rest.substring(descMatch[0].length);
        } else {
          // Issues are short: 1-3 words
          const words = rest.split(/\s+/);
          const splitAt = Math.min(3, words.length > 5 ? 2 : 1);
          feature = words.slice(0, splitAt).join(' ');
          description = words.slice(splitAt).join(' ');
        }
      }

      currentRow = { num, feature, description };
    } else if (currentRow && line) {
      // Continuation
      currentRow.description += ' ' + line;
    }
  }

  if (currentRow) {
    rows.push(currentRow);
  }

  return rows;
}

/**
 * Escape markdown
 */
function escapeMarkdown(text) {
  return text ? text.replace(/\|/g, '\\|') : '';
}

/**
 * Detect table documents
 */
function isTableDocument(text) {
  return /(Release|Patch) Notes.*Cloudbrink|New Features|Issues Resolved/is.test(
    text,
  );
}

function isMainTitle(line) {
  if (line.match(/^Cloudbrink.*How-?To.*Guide/i)) return true; // How-To guides
  if (line.match(/^Bridge Mode (User|Admin) Guide$/i)) return true;
  if (line.match(/^App-Level\s+QOE\s+Analytics$/i)) return true;
  if (line.match(/^Release Notes.*Cloudbrink/i)) return true;

  if (line.length < 60 && line.length > 10) {
    const upperCount = (line.match(/[A-Z]/g) || []).length;
    const letterCount = (line.match(/[A-Za-z]/g) || []).length;
    if (letterCount > 0 && upperCount / letterCount > 0.3) return true;
  }
  return false;
}

function isTableOfContentsEntry(line) {
  // Matches "Introduction 1", "Prerequisites 2", etc.
  return /^[A-Z][a-zA-Z\s]+\d+$/.test(line);
}

function isHowToSubsectionHeader(line) {
  // Figure captions
  if (line.match(/^Figure\s+\d+:/i)) return true;

  // Known How-To subsection patterns
  if (
    line.match(
      /^(Login|.*Configuration|.*Validation|Creating a User Group|Application and Enterprise Services|Create an .+|Assign .+|Published .+|Generate .+|Cloud Init .+)$/i,
    )
  ) {
    return true;
  }

  return false;
}

function isSectionHeader(line) {
  if (line.length > 100) return false;

  // Known major sections
  if (
    line.match(
      /^(Introduction|Prerequisites|Bridge Mode Important Notes|Bridge Mode User Config|Use Cases|QOE Analytics Functionality|New Features|Issues Resolved|Support Information)$/i,
    )
  ) {
    return true;
  }

  // All caps headers
  const upperCount = (line.match(/[A-Z]/g) || []).length;
  const letterCount = (line.match(/[A-Za-z]/g) || []).length;
  if (letterCount > 3 && upperCount / letterCount > 0.85) return true;

  return false;
}

function isSubsectionHeader(line, lines, index) {
  if (line.length > 100) return false;
  if (line.match(/^.+\s*-\s*Continued$/i)) return true;

  // Known subsection patterns
  if (
    line.match(
      /^(Admin Portal (High Level|Detailed) Instructions|Bridge Mode - End User Config)/i,
    )
  ) {
    return true;
  }

  // DON'T treat these as headers
  if (
    line.match(
      /Enterprise Portal\)|in the following path|able "Agent Bridge Mode"/i,
    )
  ) {
    return false;
  }

  // Title case without ending punctuation
  if (
    /^[A-Z][a-z]/.test(line) &&
    line.length < 80 &&
    line.length > 15 &&
    !line.endsWith('.') &&
    !line.endsWith(',') &&
    !line.endsWith(':')
  ) {
    if (index < lines.length - 1) {
      const nextLine = lines[index + 1].trim();
      if (nextLine && nextLine.length > 20) return true;
    }
  }
  return false;
}

function isNewSection(line, lines, index) {
  if (!line) return false;
  if (isMainTitle(line)) return true;
  if (isSectionHeader(line)) return true;
  if (isSubsectionHeader(line, lines, index)) return true;
  if (/^(NOTE|IMPORTANT|WARNING|TIP|CAUTION)(\s*\([^)]+\))?:/i.test(line))
    return true;
  if (/^\d+[\.)]\s+/.test(line)) return true;
  if (/^[ivxIVX]+\)\s+/.test(line)) return true;
  if (/^[•●○-]\s+/.test(line)) return true;
  return false;
}
