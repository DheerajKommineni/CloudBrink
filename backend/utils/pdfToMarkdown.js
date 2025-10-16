// backend/utils/pdfToMarkdown.js
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { exec } from 'child_process';
import { promisify } from 'util';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execAsync = promisify(exec);
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

// Configure worker path for PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = path.join(
  path.dirname(require.resolve('pdfjs-dist/build/pdf.mjs')),
  '../build/pdf.worker.mjs',
);
global.pdfjsLib = pdfjsLib;

// Load table extractor dynamically
let pdfTableExtractor = null;
try {
  pdfTableExtractor = (await import('./pdf-table-extractor.js')).default;
  console.log('✓ PDF table extractor loaded');
} catch (e) {
  console.log('⚠ PDF table extractor not available, using fallback');
  console.error('Load error:', e.message);
}

// 1️⃣ Normalize uneven row lengths to preserve missing columns (Agent / Connector)
function normalizeTableColumns(rows) {
  const maxCols = Math.max(...rows.map(r => r.length));
  return rows.map(row => {
    const copy = [...row];
    while (copy.length < maxCols) copy.push('');
    return copy;
  });
}

function mergeMultiPageTables(tables) {
  const merged = [];
  let buffer = null;

  const normalizeHeader = h =>
    (h || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const headerKey = t => normalizeHeader((t.tables?.[0] || []).join(' '));

  for (const t of tables) {
    const currentHeader = headerKey(t);
    const hasHeader = /feature|item|description|requirement/i.test(
      currentHeader,
    );

    // ✅ continuation if current table has NO header but buffer exists
    const isContinuation = !hasHeader && buffer;

    const isSameHeader =
      buffer &&
      hasHeader &&
      similarityScore(headerKey(buffer), currentHeader) > 0.8;

    if (isContinuation || isSameHeader) {
      // append body rows only (skip potential headers)
      buffer.tables.push(...t.tables.slice(hasHeader ? 1 : 0));
    } else {
      if (buffer) merged.push(buffer);
      buffer = t;
    }
  }

  if (buffer) merged.push(buffer);
  return merged;
}

/** Simple similarity helper (Jaccard-style overlap on header words) */
function similarityScore(a, b) {
  const aWords = new Set(a.split(/\s+/));
  const bWords = new Set(b.split(/\s+/));
  const intersection = new Set([...aWords].filter(x => bWords.has(x)));
  return intersection.size / Math.max(aWords.size, bWords.size);
}

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

async function extractTablesFromPDF(pdfPath) {
  console.log(`\n🔬 extractTablesFromPDF CALLED`);
  console.log(`   Path: ${pdfPath}`);

  if (!pdfTableExtractor || !pdfjsLib) {
    console.log(`   ❌ EARLY EXIT: Missing dependencies`);
    console.log(`      pdfTableExtractor: ${!!pdfTableExtractor}`);
    console.log(`      pdfjsLib: ${!!pdfjsLib}`);
    return null;
  }

  try {
    console.log(`   ✓ Reading PDF file...`);
    const dataBuffer = fs.readFileSync(pdfPath);
    const typedArray = new Uint8Array(dataBuffer);
    console.log(`   ✓ File size: ${typedArray.length} bytes`);

    console.log(`   ✓ Loading PDF document...`);
    const loadingTask = pdfjsLib.getDocument({
      data: typedArray,
      cMapUrl: path.join(process.cwd(), 'node_modules/pdfjs-dist/cmaps/'),
      cMapPacked: true,
    });

    const pdfDoc = await loadingTask.promise;
    console.log(`   ✓ PDF loaded: ${pdfDoc.numPages} pages`);

    console.log(`   ✓ Calling pdfTableExtractor function...`);
    const result = await pdfTableExtractor(pdfDoc);

    console.log(`   ✓ pdfTableExtractor returned:`);
    console.log(
      `      result.pageTables: ${result?.pageTables?.length || 0} tables`,
    );
    console.log(`      result.numPages: ${result?.numPages}`);
    console.log(`      result.currentPages: ${result?.currentPages}`);

    if (result && result.pageTables && result.pageTables.length > 0) {
      console.log(
        `\n   ✅ SUCCESS: Found ${result.pageTables.length} table(s)`,
      );
      return result.pageTables;
    } else {
      console.log(`\n   ⚠️  No tables detected in PDF`);
      return null;
    }
  } catch (error) {
    console.error(`\n   ❌ ERROR in extractTablesFromPDF:`);
    console.error(`      Message: ${error.message}`);
    console.error(`      Stack: ${error.stack}`);
    return null;
  }
}

export async function pdfToMarkdown(pdfPath, outputDir) {
  const baseName = path.basename(pdfPath, '.pdf');
  console.log(`\n🔍 Processing: ${baseName}`);

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

  // Try to extract tables with border detection first
  let extractedTables = null;
  console.log(`\n📋 Checking if table extraction needed for: ${baseName}`);

  if (baseName.match(/(Release|Patch).*Notes/i)) {
    console.log(`✓ Filename matches Release/Patch Notes pattern`);
    console.log(`✓ pdfTableExtractor available: ${!!pdfTableExtractor}`);
    console.log(`✓ pdfjsLib available: ${!!pdfjsLib}`);

    if (pdfTableExtractor && pdfjsLib) {
      console.log(`\n🚀 CALLING extractTablesFromPDF...`);
      extractedTables = await extractTablesFromPDF(pdfPath);

      if (extractedTables) {
        console.log(`\n✅ TABLE EXTRACTION SUCCESS!`);
        console.log(`   Found ${extractedTables.length} table(s)`);
        extractedTables.forEach((table, idx) => {
          console.log(
            `   Table ${idx + 1}: ${table.width}x${table.height} on page ${
              table.page
            }`,
          );
        });
      } else {
        console.log(`\n❌ TABLE EXTRACTION RETURNED NULL`);
      }
    } else {
      console.log(`\n❌ Table extractor not available:`);
      console.log(`   pdfTableExtractor: ${!!pdfTableExtractor}`);
      console.log(`   pdfjsLib: ${!!pdfjsLib}`);
    }
  } else {
    console.log(`✗ Filename does NOT match Release/Patch Notes pattern`);
  }

  // Parse text
  console.log(`\n📝 Parsing PDF text...`);
  const dataBuffer = fs.readFileSync(pdfPath);
  const pdfData = await pdfParse(dataBuffer, { max: 0 });
  let text = pdfData.text;
  text = preprocessText(text);

  // Pass extracted tables to markdown converter
  console.log(`\n📄 Converting to markdown...`);
  console.log(
    `   extractedTables passed to converter: ${extractedTables ? 'YES' : 'NO'}`,
  );
  if (extractedTables) {
    console.log(`   Number of tables: ${extractedTables.length}`);
  }

  text = convertToMarkdown(text, images, extractedTables);
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

    // Fallback: render first few pages if no images detected
    if (files.length === 0) {
      console.log('  ⚠ No images found, using pdftoppm fallback rendering');
      const pdfData = execSync(`pdfinfo "${pdfPath}"`, { encoding: 'utf8' });
      const pageMatch = pdfData.match(/Pages:\s+(\d+)/);
      const totalPages = pageMatch ? parseInt(pageMatch[1]) : 0;

      for (let p = 1; p <= Math.min(totalPages, 3); p++) {
        const outPath = path.join(
          imageDir,
          `page-${String(p).padStart(2, '0')}.png`,
        );
        try {
          execSync(
            `pdftoppm -png -r 150 -f ${p} -l ${p} "${pdfPath}" "${outPath.replace(
              /\.png$/,
              '',
            )}"`,
          );
          console.log(`  ✓ Rendered fallback image for page ${p}`);
        } catch (err) {
          console.warn(`  ⚠ Failed to render page ${p}:`, err.message);
        }
      }
    }

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
    const pdfData = await pdfParse(dataBuffer, { max: 0 });
    text = detectAndMarkBoldText(pdfData.text);
  }

  text = preprocessText(text);
  const markdownContent = convertToMarkdown(text, images);

  // Append footer outside parsed content
  const finalOutput = markdownContent + '\n\n' + generateStandardFooter();

  return finalOutput;
}

/**
 * Preprocess PDF text to clean artifacts
 */
function preprocessText(text) {
  // Fix line endings
  text = text.replace(/\r\n/g, '\n');
  text = text.replace(/\r/g, '\n');
  text = text.replace(/(?<![\.\?\!:])\n(?=[a-z])/g, ' ');
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

  // Fix stray heading markers in middle of text (like "# VPC/VNET")
  text = text.replace(/\n#\s+([A-Z][A-Z\/]+)/g, '\n$1'); // Remove # before acronyms like VPC/VNET
  text = text.replace(/([a-z,])\s*\n#\s+/g, '$1\n'); // Remove # after lowercase or comma
  text = text.replace(/\s#\s([A-Z][A-Z\/]+)/g, ' $1'); // Remove # in middle of line

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

  // Remove embedded "Support Information" sections (to prevent duplicates)
  text = text.replace(/^##?\s*Support Information[\s\S]*?(?=^##\s|\Z)/gim, '');
  text = text.replace(
    /We would love to hear from you!.*?support@cloudbrink\.com[\s\S]*?(?=^##\s|\Z)/gim,
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

  // Remove embedded "Support Information" sections to prevent duplication
  text = text.replace(/^##?\s*Support Information[\s\S]*?(?=^##\s|\Z)/gim, '');
  text = text.replace(
    /We['’]?\s*would\s+love\s+to\s+hear\s+from\s+you!.*?support@cloudbrink\.com[\s\S]*?(?=^##\s|\Z)/gim,
    '',
  );
  text = text.replace(
    /(^|\n)\s*Support Information\s*\n+We['’]?\s*would\s+love\s+to\s+hear\s+from\s+you![\s\S]*?(?=$|\n{2,}|©|Corporate Headquarters)/gim,
    '',
  );

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
  return `
---

## Support Information  
We would love to hear from you! For any questions, concerns, or feedback, please reach out at [support@cloudbrink.com](mailto:support@cloudbrink.com)

<div style="position: relative; background-color:#f4f4f4; color:#333333; font-size:12px; padding:60px 22px 20px 22px; border-radius:6px; margin-top:50px; opacity:0.8;">

  <div style="position:absolute; top:-40px; left:0; background-color:#0097A7; color:#ffffff; padding:18px 24px; border-radius:6px; width:60%; box-shadow:0 4px 10px rgba(0,0,0,0.1);">
    <strong style="font-size:16px; color:#ffffff;">Corporate Headquarters Cloudbrink, Inc.</strong><br>
    <em style="font-size:15px;">530 Lakeside Drive, Suite 190, Sunnyvale, CA 94085</em>
  </div>

  <div style="margin-top:20px;">
    © 2021 Cloudbrink, Inc. All rights reserved. Cloudbrink, the Cloudbrink logo, and all product and service names mentioned herein are registered trademarks or trademarks of Cloudbrink, Inc. in the United States and other countries. 
    All other trademarks, service marks, registered marks, or registered service marks mentioned herein are for identification purposes only and are the property of their respective owners.
  </div>
</div>`;
}

/**
 * Convert to Markdown with images - ROUTER FUNCTION
 */
function convertToMarkdown(text, images, extractedTables = null) {
  let markdown;

  // Check if this is a table-based document
  if (isTableDocument(text)) {
    markdown = convertTableDocument(text, images, extractedTables);
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
      // Around line 625-650 - REPLACES the old lock check
      if (isRegularHowTo && firstHeadingPromoted && !h1Locked) {
        for (let j = result.length - 1; j >= 0; j--) {
          const prevLine = result[j];
          if (prevLine === '') continue;

          if (
            !prevLine.startsWith('#') &&
            !prevLine.startsWith('>') &&
            !prevLine.startsWith('-') &&
            !prevLine.startsWith('![')
          ) {
            h1Locked = true;
            console.log('  🔒 H1 locked after content');
            break;
          }
          break;
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

    // Subsection headers (H3) - Check for ### prefix first
    if (line.startsWith('### ')) {
      flushParagraph();
      result.push('');

      const titleText = line.replace(/^###\s+/, '');

      // Promote first H3 → H1 for regular How-to files (without "HowTo" in filename)
      if (isRegularHowTo && !firstHeadingPromoted && !h1Locked) {
        result.push(`# ${titleText}`);
        firstHeadingPromoted = true;
        console.log(`  ✓ Promoted first H3 to H1: "${titleText}"`);
      } else {
        result.push(`### ${titleText}`);
      }

      result.push('');

      // Insert image after Figure headers
      if (titleText.match(/^Figure\s+\d+:/i)) {
        insertNextImage();
      }

      i++;
      continue;
    }

    // Legacy: Check for specific How-To subsection patterns (without ### prefix)
    if (isHowToSubsectionHeader(line)) {
      flushParagraph();
      result.push('');
      result.push(`### ${line}`);
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
const insertNextImage = () => {
  if (imageIndex < images.length) {
    result.push('');

    // 🔧 HARDCODE FIRST ARCHITECTURE DIAGRAM FOR BRIDGE MODE GUIDES
    if (imageIndex === 0 && isBridgeModeGuide) {
      result.push(
        `![Architecture Diagram 1](/uploads/architecture/architecture.png)`,
      );
      console.log(` 🎨 Using hardcoded architecture diagram for ${baseName}`);
    } else {
      result.push(`![${images[imageIndex].alt}](${images[imageIndex].path})`);
    }

    result.push('');
    imageIndex++;
    return true;
  }
  return false;
};

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

  // 🔧 DETECT IF THIS IS A BRIDGE MODE GUIDE
  const baseName = images?.[0]?.path?.split('/')?.[3] || '';
  const isBridgeModeGuide =
    baseName === 'Bridge_Mode_Admin_Guide' ||
    baseName === 'Bridge_Mode_User_Guide';

  const flushParagraph = () => {
    if (currentParagraph.length > 0) {
      result.push(currentParagraph.join(' '));
      currentParagraph = [];
    }
  };

  const insertNextImage = () => {
    if (imageIndex < images.length) {
      result.push('');

      // 🔧 HARDCODE FIRST ARCHITECTURE DIAGRAM FOR BRIDGE MODE GUIDES
      if (imageIndex === 0 && isBridgeModeGuide) {
        result.push(
          `![Architecture Diagram 1](/uploads/architecture/architecture.png)`,
        );
        console.log(` 🎨 Using hardcoded architecture diagram for ${baseName}`);
      } else {
        result.push(`![${images[imageIndex].alt}](${images[imageIndex].path})`);
      }

      result.push('');
      imageIndex++;
      return true;
    }
    return false;
  };

  while (i < lines.length) {
    let line = lines[i].trim();

    if (i < 5) {
      console.log(`Line ${i}: "${line}"`);
    }

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
    // Subsection headers (H3) - Promote first one to H1
    if (line.startsWith('### ')) {
      flushParagraph();
      result.push('');

      // Check if this is the FIRST heading (promote to H1)
      const hasAnyHeading = result.some(r => /^#+ /.test(r));

      if (!hasAnyHeading) {
        // This is the first heading - promote to H1
        const titleText = line.replace(/^###\s+/, '');
        result.push(`# ${titleText}`);
        console.log(`  ✓ Promoted first H3 to H1: "${titleText}"`);
      } else {
        // Keep subsequent H3s as-is
        result.push(line);
      }

      result.push('');
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
 * Convert extracted table data to Markdown — FIXED CLASSIFICATION & NUMBERING
 */
function convertExtractedTableToMarkdown(tableData) {
  const result = [];
  const rows = normalizeTableColumns(tableData.tables);

  // Detect section label
  const headerRow = rows[0] || [];
  const headerText = headerRow.map(c => (c || '').toLowerCase()).join(' ');

  let sectionLabel = null;
  if (headerText.includes('feature')) sectionLabel = 'New Features';
  else if (headerText.includes('issue') || headerText.includes('item'))
    sectionLabel = 'Issues Resolved';

  // Detect if both sections exist globally (set once at convertTableDocument)
  const hasAgentCols = !!convertExtractedTableToMarkdown.hasAgentCols;
  const continuingTable = !!convertExtractedTableToMarkdown.continuing;

  // ✅ Only start a new section when header explicitly says "feature" or "issue"
  if (sectionLabel && !continuingTable) {
    result.push(`\n## ${sectionLabel}\n`);
    const baseHeader = hasAgentCols
      ? '| # | Feature | Description | Agent | Connector |'
      : '| # | Feature | Description |';
    const baseDivider = hasAgentCols
      ? '|---|---|---|---|---|'
      : '|---|---|---|';
    result.push(baseHeader);
    result.push(baseDivider);
  } else if (continuingTable) {
    console.log('  🔗 Continuing previous table (no new header)');
    // no header repeat
  } else {
    // ✅ Only create a fallback section if no section yet AND table has meaningful rows
    const hasContent = rows.length > 3;
    if (!convertExtractedTableToMarkdown.hasActiveTable && hasContent) {
      const inferredLabel = hasAgentCols
        ? 'New Features'
        : 'Miscellaneous Updates';
      result.push(`\n## ${inferredLabel}\n`);

      const headers = ['#', 'Feature', 'Description'];
      if (hasAgentCols) {
        headers.push('Agent', 'Connector');
      }

      result.push(`| ${headers.join(' | ')} |`);
      result.push(`| ${headers.map(() => '---').join(' | ')} |`);
    }
  }

  convertExtractedTableToMarkdown.hasActiveTable = true;

  // Map likely column indexes
  const firstData = rows[1] || [];
  const hasEmptyLead = firstData.length > 3 && !firstData[0]?.trim();

  const numIdx = hasEmptyLead ? 1 : 0;
  const featIdx = hasEmptyLead ? 2 : 1;
  const descIdx = hasEmptyLead ? 3 : 2;

  let localNum = 1;
  for (const row of rows.slice(1)) {
    const n = row[numIdx]?.trim() || localNum.toString();
    const f = row[featIdx]?.trim() || '';
    const d = row[descIdx]?.trim() || '';
    const a = row[descIdx + 1]?.trim() || '';
    const c = row[descIdx + 2]?.trim() || '';

    // Skip blank or header-like rows
    if (!f && !d) continue;
    if (/^(feature|item|description)$/i.test(f)) continue;
    if (/support information/i.test(f)) continue;

    result.push(
      `| ${localNum} | ${escapeMarkdown(f)} | ${escapeMarkdown(d)} | ${
        a || '-'
      } | ${c || '-'} |`,
    );
    localNum++;
  }

  result.push('');
  return result;
}

/**
 * Detects embedded second headers like "Item Description" inside one table.
 * Splits them into two logical tables.
 */
function splitMergedTables(table) {
  const rows = table.tables;
  const splitIndexes = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i].map(c => c.toLowerCase().trim());
    if (
      row.join(' ').includes('item') &&
      row.join(' ').includes('description')
    ) {
      splitIndexes.push(i);
    }
  }

  if (splitIndexes.length === 0) return [table];

  const parts = [];
  let start = 0;
  for (const idx of splitIndexes) {
    parts.push({ tables: rows.slice(start, idx) });
    start = idx;
  }
  parts.push({ tables: rows.slice(start) });
  return parts.filter(t => t.tables.length > 1);
}

function convertTableDocument(text, images, extractedTables = null) {
  console.log('\n📊 convertTableDocument CALLED');
  const result = [];
  let systemReqProcessed = false; // Track if we've handled System Requirements

  // ---- Title ----
  const titleMatch = text.match(
    /Cloudbrink.*(Release|Patch).*Notes.*\d[\d.]*/i,
  );
  if (titleMatch) {
    result.push(`# ${titleMatch[0].trim()}`);
    result.push('');
  }

  // ---- Use extracted tables if any ----
  if (extractedTables && extractedTables.length > 0) {
    console.log(`   ✅ USING ${extractedTables.length} EXTRACTED TABLES`);

    // Debug: Show what each extracted table looks like BEFORE merging
    extractedTables.forEach((t, idx) => {
      const headerRow = (t.tables?.[0] || []).map(c =>
        (c || '').toLowerCase().trim(),
      );
      console.log(`   Table ${idx + 1} header: [${headerRow.join(', ')}]`);
    });

    const mergedTables = mergeMultiPageTables(extractedTables);

    console.log(`   📊 After merging: ${mergedTables.length} table(s)`);
    mergedTables.forEach((t, idx) => {
      console.log(
        `      Merged table ${idx + 1}: ${t.tables?.length || 0} rows`,
      );
    });

    // Detect if file has both sections
    const hasBothSections =
      /New Features/i.test(text) && /System Requirements/i.test(text);
    convertExtractedTableToMarkdown.hasAgentCols = hasBothSections;

    let lastHeaderTable = null;
    let lastHeaderMarkdown = [];
    let tableCounter = 1;

    for (const rawTable of mergedTables) {
      const tables = splitMergedTables(rawTable);

      for (const t of tables) {
        const allRows = t.tables || [];
        const headerRow = (allRows[0] || []).map(c => c.toLowerCase().trim());

        console.log(`  🔍 Table header: [${headerRow.join(', ')}]`);

        const hasHeader =
          headerRow.join(' ').includes('feature') ||
          headerRow.join(' ').includes('item') ||
          headerRow.join(' ').includes('description') ||
          headerRow.join(' ').includes('requirement');

        // 🖥️ ENHANCED SYSTEM REQUIREMENTS DETECTION
        // Check not just header row, but ALL rows for System Requirements pattern
        let isSystemReq = headerRow.some(c =>
          /(client platform|version supported)/i.test(c),
        );

        // If not found in header, scan through all rows
        if (!isSystemReq) {
          for (let rowIdx = 0; rowIdx < allRows.length; rowIdx++) {
            const rowText = allRows[rowIdx].join(' ').toLowerCase();

            // Look for the "Client Platform" + "Version Supported" pattern
            if (/(client platform|version supported)/i.test(rowText)) {
              console.log(`  🔍 Found System Requirements at row ${rowIdx}`);

              // Split the table at this point
              const beforeRows = allRows.slice(0, rowIdx);
              const sysReqRows = allRows.slice(rowIdx);

              // Process the "before" part as regular table if it has content
              if (beforeRows.length > 1) {
                console.log(
                  `  📊 Processing ${beforeRows.length} rows before System Requirements`,
                );
                const beforeTable = { tables: beforeRows };

                // Process this part recursively (without system req detection)
                const tempHeader = (beforeRows[0] || []).map(c =>
                  c.toLowerCase().trim(),
                );
                const tempHasHeader = tempHeader.join(' ').includes('feature');

                if (tempHasHeader || beforeRows.length > 2) {
                  convertExtractedTableToMarkdown.continuing = false;
                  convertExtractedTableToMarkdown.hasActiveTable = false;
                  const block = convertExtractedTableToMarkdown({
                    tables: beforeRows,
                  });
                  result.push(...block);
                }
              }

              // Now process System Requirements
              isSystemReq = true;
              t.tables = sysReqRows; // Update current table to only System Requirements
              break;
            }
          }
        }

        console.log(`  📋 hasHeader=${hasHeader}, isSystemReq=${isSystemReq}`);

        if (isSystemReq) {
          console.log('  🖥 Detected System Requirements table');
          console.log('  📊 Table has', t.tables.length, 'rows');
          systemReqProcessed = true;

          // Extract introductory text before the table
          const sysStart = text.indexOf('System Requirements');
          if (sysStart !== -1) {
            const sysText = text.slice(sysStart);

            result.push('\n## System Requirements\n');

            const componentMatch = sysText.match(
              /Cloudbrink solution consists of multiple components\./i,
            );
            if (componentMatch) {
              result.push(componentMatch[0] + '\n');
            }

            const introMatch = sysText.match(
              /A\.\s+The Brink App is installed[^\n]+quality of experience features\./i,
            );
            if (introMatch) {
              result.push(introMatch[0] + '\n');
            }
          } else {
            result.push('\n## System Requirements\n');
          }

          result.push('| Client Platform | Version Supported |');
          result.push('|---|---|');

          // Process System Requirements rows from the table
          const rows = normalizeTableColumns(t.tables.slice(1)); // Skip header row

          for (const row of rows) {
            if (row.filter(Boolean).length >= 2) {
              const platform = row[0]?.trim() || '';
              const version = row.slice(1).join(' ').trim();

              // Skip header-like rows
              if (
                platform &&
                version &&
                !/^(Client Platform|Version Supported)$/i.test(platform)
              ) {
                result.push(`| ${platform} | ${version} |`);
                console.log(`    ✓ Added: ${platform} | ${version}`);
              }
            }
          }

          result.push('');
          continue; // Skip normal processing for this table
        }

        // ✅ CONTINUATION CASE — table without header
        if (!hasHeader && lastHeaderTable) {
          console.log('  🔗 Continuing previous table (no header detected)');
          convertExtractedTableToMarkdown.continuing = true;

          const continuationBlock = convertExtractedTableToMarkdown(t);
          // Continue numbering
          const numberedBlock = continuationBlock.map(line => {
            if (line.startsWith('|') && line.includes('|')) {
              const parts = line.split('|').map(p => p.trim());
              if (parts.length > 1 && /^\d+$/.test(parts[1])) {
                parts[1] = tableCounter++;
                return `| ${parts.slice(1).join(' | ')}`;
              }
            }
            return line;
          });

          lastHeaderMarkdown.push(...numberedBlock);
          continue;
        }

        // ✅ NEW HEADER CASE — flush previous continuation
        if (lastHeaderTable && lastHeaderMarkdown.length > 0) {
          result.push(...lastHeaderMarkdown);
          lastHeaderMarkdown = [];
          convertExtractedTableToMarkdown.continuing = false;
        }

        // ✅ Start new table block
        convertExtractedTableToMarkdown.continuing = false;
        convertExtractedTableToMarkdown.hasActiveTable = false;
        const block = convertExtractedTableToMarkdown(t);
        result.push(...block);
        lastHeaderTable = t;

        // Reset numbering for next header
        tableCounter = 1;
      }
    }

    // Flush leftover continuation
    if (lastHeaderMarkdown.length > 0) {
      result.push(...lastHeaderMarkdown);
    }

    // ✅ FALLBACK: If System Requirements wasn't detected in tables, extract from text
    if (!systemReqProcessed && /System Requirements/i.test(text)) {
      console.log(
        '  🧩 System Requirements not found in tables - extracting from text',
      );

      const sysStart = text.indexOf('System Requirements');
      const sysText = text.slice(sysStart);

      result.push('\n## System Requirements\n');

      // Extract "Cloudbrink solution consists..." text
      const componentMatch = sysText.match(
        /Cloudbrink solution consists of multiple components\./i,
      );
      if (componentMatch) {
        result.push(componentMatch[0] + '\n');
      }

      // Extract "A. The Brink App..." text
      const introMatch = sysText.match(
        /A\.\s+The Brink App is installed on end-user desktops for providing secure connectivity and quality of experience features\./i,
      );
      if (introMatch) {
        result.push(introMatch[0] + '\n');
      }

      result.push('| Client Platform | Version Supported |');
      result.push('|---|---|');

      // Extract platform information from text
      const platformLines = sysText
        .split('\n')
        .map(l => l.trim())
        .filter(
          l =>
            /(Windows|Mac|Linux|Ubuntu|FreeBSD|iOS|Android|Chrome|Chromebook)/i.test(
              l,
            ) && !/^(Client Platform|Version Supported)$/i.test(l),
        );

      for (const line of platformLines) {
        // Skip header row
        if (/Client Platform.*Version Supported/i.test(line)) continue;

        // Try to split by multiple spaces or tabs
        const parts = line.split(/\s{2,}|\t+/);
        if (parts.length >= 2) {
          const platform = parts[0].trim();
          const version = parts.slice(1).join(' ').trim();

          if (platform && version) {
            result.push(`| ${platform} | ${version} |`);
          }
        }
      }

      result.push('');
    }

    result.push('');
    result.push(generateStandardFooter());
    return result.join('\n').trim();
  }

  // ---- Fallback: Text-based detection ----
  console.log('   ⚠️  USING TEXT-BASED TABLE FALLBACK');
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  let currentSection = null;
  const pushSection = section => {
    if (section === 'New Features') result.push('\n## New Features\n');
    else if (section === 'Issues Resolved')
      result.push('\n## Issues Resolved\n');
    else result.push(`\n## ${section}\n`);
    result.push('| # | Item | Description |');
    result.push('|---|---|---|');
  };

  let idx = 1;
  for (const line of lines) {
    if (/^(New Features|Issues Resolved|Known Issues)$/i.test(line)) {
      currentSection = line;
      pushSection(currentSection);
      idx = 1;
      continue;
    }

    const m = line.match(/^(\d+)\s+(.+?)\s{2,}(.+)/);
    if (m && currentSection) {
      const [, , feat, desc] = m;
      result.push(
        `| ${idx++} | ${escapeMarkdown(feat)} | ${escapeMarkdown(desc)} |`,
      );
    }
  }

  // ✅ If System Requirements section exists in text, extract it directly
  if (/System Requirements/i.test(text)) {
    console.log('  🧩 Forcing System Requirements extraction from text');
    result.push('\n## System Requirements\n');
    result.push('| Client Platform | Version Supported |');
    result.push('|---|---|');

    const sysStart = text.indexOf('System Requirements');
    const sysSlice = text.slice(sysStart);
    const sysLines = sysSlice
      .split('\n')
      .map(l => l.trim())
      .filter(l =>
        /(Windows|Mac|Linux|Ubuntu|FreeBSD|iOS|Android|Chrome|Chromebook|Client Platform)/i.test(
          l,
        ),
      );

    for (const l of sysLines) {
      const parts = l.split(/\s{2,}/);
      if (parts.length >= 2) {
        const platform = parts[0].trim();
        const version = parts.slice(1).join(' ').trim();
        if (platform && version && !/Client Platform/i.test(platform)) {
          result.push(`| ${platform} | ${version} |`);
        }
      }
    }
  }

  result.push('');
  result.push(generateStandardFooter());
  return result.join('\n').trim();
}

/**
 * Escape markdown special characters
 */
function escapeMarkdown(text) {
  if (!text) return '';
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

/**
 * Parse table rows by analyzing spatial layout and positioning
 * This uses the actual table structure from PDF instead of hardcoded patterns
 */
function parseTableRowsSmart(tableLines, isFeatureTable) {
  const rows = [];
  let currentRow = null;

  // Analyze line patterns to detect column boundaries
  const columnBoundaries = detectColumnBoundaries(tableLines);

  console.log(`  📐 Detected column boundaries:`, columnBoundaries);

  for (let i = 0; i < tableLines.length; i++) {
    const line = tableLines[i];

    // Check if this is a new row (starts with number)
    const rowMatch = line.match(/^(\d+)\s+(.*)$/);

    if (rowMatch) {
      // Save previous row
      if (currentRow) {
        rows.push(currentRow);
      }

      const [, num, rest] = rowMatch;

      // Use column boundaries to split the line
      const { feature, description } = splitByColumns(rest, columnBoundaries);

      currentRow = {
        num,
        feature: feature.trim(),
        description: description.trim(),
      };
    } else if (currentRow && line.trim()) {
      // Continuation line - determine which column it belongs to
      const { feature, description } = splitByColumns(line, columnBoundaries);

      if (description.trim() || currentRow.description) {
        // If we found description content or already have description, add to description
        currentRow.description += ' ' + (description || line).trim();
      } else {
        // Otherwise add to feature
        currentRow.feature += ' ' + (feature || line).trim();
      }
    }
  }

  if (currentRow) {
    rows.push(currentRow);
  }

  return rows;
}

/**
 * Detect column boundaries by analyzing multiple lines
 * Returns the character position where description column typically starts
 */
function detectColumnBoundaries(lines) {
  // Look for patterns in spacing to identify where columns split
  const spacingAnalysis = [];

  for (const line of lines.slice(0, Math.min(20, lines.length))) {
    // Skip very short lines
    if (line.length < 20) continue;

    // Find positions of multiple consecutive spaces (likely column boundaries)
    let pos = 0;
    while (pos < line.length) {
      const match = line.substring(pos).match(/\s{3,}/);
      if (match && match.index !== undefined) {
        const boundaryPos = pos + match.index;
        spacingAnalysis.push(boundaryPos);
        pos = boundaryPos + match[0].length;
      } else {
        break;
      }
    }
  }

  // Find the most common boundary position (median)
  if (spacingAnalysis.length > 0) {
    spacingAnalysis.sort((a, b) => a - b);
    const median = spacingAnalysis[Math.floor(spacingAnalysis.length / 2)];
    return { descriptionStart: median };
  }

  // Fallback: assume description starts after reasonable feature length
  return { descriptionStart: 40 };
}

/**
 * Split line into columns based on detected boundaries
 */
function splitByColumns(line, boundaries) {
  const { descriptionStart } = boundaries;

  // If line is shorter than boundary, it's all in first column
  if (line.length < descriptionStart) {
    return { feature: line, description: '' };
  }

  // Split at the boundary
  const feature = line.substring(0, descriptionStart);
  const description = line.substring(descriptionStart);

  // Check if the split makes sense (feature part shouldn't be all spaces)
  if (feature.trim().length === 0) {
    return { feature: '', description: line };
  }

  return { feature, description };
}

/**
 * Parse table and add to result - FIXED FOR MULTI-PAGE TABLES
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

  // Collect ALL table lines, even across page breaks
  const tableLines = [];
  let consecutiveNonTableLines = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line) {
      i++;
      consecutiveNonTableLines++;
      // Allow some blank lines but stop if too many
      if (consecutiveNonTableLines > 3) break;
      continue;
    }

    // CRITICAL: Don't stop at footer - skip it and continue
    if (
      line.startsWith('©') ||
      line.match(
        /530 Lakeside|Corporate Headquarters|Software Defined Mobility|Cloudbrink Personal SASE|Hybrid Access/i,
      )
    ) {
      console.log(`  ⚠️  Skipping footer line: ${line.substring(0, 50)}...`);
      i++;
      consecutiveNonTableLines++;
      continue;
    }

    // Stop only at actual next section headers
    if (
      line.match(
        /^(New Features|Issues Resolved|Known Issues|Enhancements|Support Information)$/i,
      )
    ) {
      console.log(`  ✓ Found next section: ${line}`);
      break;
    }

    // This is a table content line
    consecutiveNonTableLines = 0;
    tableLines.push(line);
    i++;
  }

  console.log(`  📊 Collected ${tableLines.length} table content lines`);

  // Parse rows with better splitting
  const rows = parseTableRowsSmart(tableLines, isFeatureTable);
  console.log(`  ✓ Parsed ${rows.length} table rows`);

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
 * Detect table documents
 */
function isTableDocument(text) {
  return /(Release|Patch) Notes.*Cloudbrink|New Features|Issues Resolved/is.test(
    text,
  );
}

function isMainTitle(line) {
  if (line.match(/^Cloudbrink.*How-?To.*Guide/i)) return true;
  if (line.match(/^Bridge Mode (User|Admin) Guide$/i)) return true;
  if (line.match(/^App-Level\s+QOE\s+Analytics$/i)) return true;
  if (line.match(/^Release Notes.*Cloudbrink/i)) return true;
  if (line.match(/^Cloudbrink Connector\s*-\s*/i)) return true;

  // ADD THIS LINE for Active-Active docs:
  if (line.match(/^Active-Active\s+Connectors/i)) return true;

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
