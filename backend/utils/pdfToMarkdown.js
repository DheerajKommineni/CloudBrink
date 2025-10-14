// backend/utils/pdfToMarkdown.js
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { exec } from 'child_process';
import { promisify } from 'util';
import sharp from 'sharp';

const execAsync = promisify(exec);
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

/**
 * Enhanced PDF to Markdown converter with image extraction
 */
export async function pdfToMarkdown(pdfPath, outputDir) {
  const dataBuffer = fs.readFileSync(pdfPath);
  const baseName = path.basename(pdfPath, '.pdf');
  const imageDir = path.join(
    outputDir || path.dirname(pdfPath),
    'images',
    baseName,
  );

  // Check if images already extracted
  const imagesExist =
    fs.existsSync(imageDir) && fs.readdirSync(imageDir).length > 0;

  let images = [];
  if (imagesExist) {
    console.log(`Using cached images for: ${baseName}`);
    images = loadExistingImages(imageDir, baseName);
  } else {
    console.log(`Extracting images for: ${baseName}`);
    images = await extractImagesFromPDF(pdfPath, outputDir);
  }

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
 * Merge split diagram layers (detects black background images that need merging)
 */
async function mergeLayeredDiagrams(imageDir, files) {
  const processed = new Set();
  const layerGroups = [];

  for (let i = 0; i < files.length; i++) {
    if (processed.has(i)) continue;

    const file = files[i];
    if (!/^img-\d{3}\.(png|ppm|pbm|jpg)$/.test(file)) continue;

    const filePath = path.join(imageDir, file);

    try {
      const metadata = await sharp(filePath).metadata();
      const stats = await sharp(filePath).stats();
      const avgBrightness =
        stats.channels.reduce((sum, ch) => sum + ch.mean, 0) /
        stats.channels.length;

      if (avgBrightness < 50) {
        const layerGroup = [
          {
            file,
            path: filePath,
            width: metadata.width,
            height: metadata.height,
          },
        ];
        processed.add(i);

        for (let j = i + 1; j < files.length; j++) {
          if (processed.has(j)) continue;

          const nextFile = files[j];
          if (!/^img-\d{3}\.(png|ppm|pbm|jpg)$/.test(nextFile)) continue;

          const nextPath = path.join(imageDir, nextFile);
          const nextMeta = await sharp(nextPath).metadata();

          if (
            Math.abs(nextMeta.width - metadata.width) < 10 &&
            Math.abs(nextMeta.height - metadata.height) < 10
          ) {
            layerGroup.push({
              file: nextFile,
              path: nextPath,
              width: nextMeta.width,
              height: nextMeta.height,
            });
            processed.add(j);
          }
        }

        if (layerGroup.length > 1) {
          layerGroups.push(layerGroup);
        }
      }
    } catch (err) {
      console.error(`Error analyzing ${file}:`, err.message);
    }
  }

  for (const group of layerGroups) {
    try {
      let composite = sharp(group[0].path);
      const compositeOps = [];

      for (let i = 1; i < group.length; i++) {
        const layerBuffer = await sharp(group[i].path).toBuffer();
        compositeOps.push({ input: layerBuffer, blend: 'lighten' });
      }

      const mergedPath = group[0].path.replace(/\.(png|jpg)$/, '-merged.$1');
      await composite.composite(compositeOps).toFile(mergedPath);

      for (const layer of group) {
        fs.unlinkSync(layer.path);
      }

      //   console.log(
      //     `Merged ${group.length} layers into ${path.basename(mergedPath)}`,
      //   );
    } catch (err) {
      console.error('Merge failed:', err.message);
    }
  }
}

/**
 * Extract images from PDF using pdfimages command-line tool
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

    if (files.length > 1) {
      await mergeLayeredDiagrams(imageDir, files);
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

        const knownLogoBannerSizes = [
          { w: 568, h: 130 },
          { w: 2559, h: 357 },
          { w: 2625, h: 230 },
          { w: 653, h: 133 },
          { w: 530, h: 108 },
        ];

        const isKnownLogo = knownLogoBannerSizes.some(
          size =>
            Math.abs(width - size.w) <= 5 && Math.abs(height - size.h) <= 5,
        );

        if (
          isKnownLogo ||
          sizeKB < 5 ||
          aspectRatio > 7 ||
          aspectRatio < 0.15 ||
          height < 200
        ) {
          continue;
        }

        const isReasonableSize = width > 600 && height > 300;
        const isLargeFile = sizeKB > 30;

        if (!isReasonableSize && !isLargeFile) {
          continue;
        }

        let isSimilar = false;
        for (const accepted of acceptedImages) {
          const widthDiff = Math.abs(width - accepted.width);
          const heightDiff = Math.abs(height - accepted.height);
          const dimensionMatch = widthDiff < 10 && heightDiff < 10;

          if (dimensionMatch) {
            const sizeDiffRatio =
              Math.abs(sizeKB - accepted.sizeKB) /
              Math.max(sizeKB, accepted.sizeKB);

            if (sizeDiffRatio > 0.001) {
              continue;
            }

            const similarity = await calculateImageSimilarity(
              filePath,
              accepted.path,
            );

            if (similarity < 0.01) {
              isSimilar = true;
              break;
            }
          }
        }

        if (isSimilar) continue;

        const imageData = {
          file,
          width,
          height,
          sizeKB,
          aspectRatio,
          path: filePath,
        };
        meaningfulImages.push(imageData);
        acceptedImages.push(imageData);
      } catch (err) {
        console.error(`Error reading ${file}:`, err.message);
      }
    }

    // console.log(`Extracted ${meaningfulImages.length} images from ${baseName}`);

    meaningfulImages.forEach((img, index) => {
      images.push({
        page: index + 1,
        path: `/api/images/${baseName}/${img.file}`,
        alt: `Diagram ${index + 1}`,
        filename: img.file,
        dimensions: `${img.width}x${img.height}`,
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
 * Preprocess PDF text to clean artifacts
 */
function preprocessText(text) {
  text = text.replace(/\r\n/g, '\n');
  text = text.replace(/\r/g, '\n');
  text = text.replace(/\u00A0/g, ' ');
  text = text.replace(/\u2022/g, '•');

  text = text.replace(/Hybrid Access As A Service\s*/gi, '');
  text = text.replace(/^Software Defined Mobility\s*$/gim, '');
  text = text.replace(/^Cloudbrink Software Defined Mobility\s*$/gim, '');

  text = text.replace(/^.*?\|\s*\d+.*$/gim, '');
  text = text.replace(/^\|\s*\d+[A-Za-z\s]*$/gim, '');
  text = text.replace(/^Bridge Mode (User|Admin) Guide\s*\|\s*\d+.*$/gim, '');

  text = text.replace(
    /©\s*\d{4}\s+Cloudbrink,?\s*Inc\..*?respective owners\./gis,
    '',
  );
  text = text.replace(
    /Corporate Headquarters\s+Cloudbrink,?\s*Inc\.\s*\n.*?CA\s+\d{5}/gis,
    '',
  );
  text = text.replace(
    /530\s+Lakeside\s+Drive,?\s+Suite\s+190,?\s+Sunnyvale,?\s+CA\s+94085/gi,
    '',
  );

  text = text.replace(/^Page\s+\d+\s+of\s+\d+$/gim, '');
  text = text.replace(/^\s*\d+\s*$/gm, '');

  text = text.replace(/\s*-\s*Continued\s*$/gim, '');

  const lines = text.split('\n');
  const seen = new Set();
  const filtered = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (
      line.match(
        /^(Bridge Mode User Config|Introduction|Prerequisites|Bridge Mode Important Notes)$/i,
      )
    ) {
      const normalized = line.toLowerCase();
      if (seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
    }
    filtered.push(lines[i]);
  }

  text = filtered.join('\n');

  const bridgeModeMatch = text.match(/Bridge Mode User Guide/i);
  if (bridgeModeMatch) {
    const firstIndex = text.indexOf(bridgeModeMatch[0]);
    text =
      text.substring(0, firstIndex + bridgeModeMatch[0].length) +
      text
        .substring(firstIndex + bridgeModeMatch[0].length)
        .replace(/Bridge Mode User Guide/gi, '');
  }

  text = text.replace(/\n{4,}/g, '\n\n');

  return text.trim();
}

/**
 * Convert to Markdown with images
 */
function convertToMarkdown(text, images) {
  const lines = text.split('\n');
  const result = [];
  let i = 0;
  let currentParagraph = [];
  let imageIndex = 0;

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
    }
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

    if (i < 5 && isMainTitle(line)) {
      flushParagraph();
      result.push(`# ${line}`);
      result.push('');
      i++;
      continue;
    }

    if (isSectionHeader(line)) {
      flushParagraph();
      result.push('');
      result.push(`## ${line}`);
      result.push('');

      if (line.toLowerCase().includes('introduction')) {
        insertNextImage();
      }

      i++;
      continue;
    }

    if (isSubsectionHeader(line, lines, i)) {
      flushParagraph();
      const cleanLine = line.replace(/\s*-\s*Continued\s*$/i, '');
      result.push('');
      result.push(`### ${cleanLine}`);
      result.push('');
      i++;
      continue;
    }

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
      while (j < lines.length) {
        const nextLine = lines[j].trim();
        if (!nextLine || isNewSection(nextLine, lines, j)) break;
        result.push(`> ${nextLine}`);
        j++;
      }
      result.push('');
      i = j;
      continue;
    }

    const labelMatch = line.match(/^([A-Z][a-zA-Z\s]{2,30}):\s*(.*)$/);
    if (
      labelMatch &&
      !line.includes(' the ') &&
      !line.includes(' is ') &&
      line.length < 50
    ) {
      flushParagraph();
      const [, label, restOfText] = labelMatch;
      result.push('');
      result.push(
        restOfText.trim() ? `**${label}:** ${restOfText}` : `**${label}:**`,
      );
      result.push('');
      i++;
      continue;
    }

    const numberedMatch = line.match(/^(\d+)\.\s+(.+)$/);
    const romanMatch = line.match(/^([ivxIVX]+)\)\s+(.+)$/);

    if (numberedMatch || romanMatch) {
      flushParagraph();

      if (numberedMatch) {
        const [, num, content] = numberedMatch;
        const itemLines = [content];
        let j = i + 1;

        while (j < lines.length) {
          const nextLine = lines[j].trim();
          if (!nextLine || isNewSection(nextLine, lines, j)) break;
          itemLines.push(nextLine);
          j++;
        }

        result.push(`${num}. ${itemLines.join(' ')}`);
        result.push('');
        insertNextImage();
        i = j - 1;
      } else if (romanMatch) {
        const [, roman, content] = romanMatch;

        if (roman.toLowerCase() === 'i' && imageIndex < images.length) {
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

        i = j - 1;
      }

      i++;
      continue;
    }

    if (line.startsWith('•') || line.startsWith('●') || line.startsWith('○')) {
      flushParagraph();
      line = line.replace(/^[•●○]\s*/, '- ');
      result.push(line);
      i++;
      continue;
    }

    currentParagraph.push(line);
    i++;
  }

  flushParagraph();

  while (imageIndex < images.length) {
    result.push('');
    result.push(`![${images[imageIndex].alt}](${images[imageIndex].path})`);
    imageIndex++;
  }

  let finalText = result.join('\n');
  finalText = finalText.replace(/\n{3,}/g, '\n\n');
  return finalText.trim();
}

function isMainTitle(line) {
  if (line.match(/^Bridge Mode User Guide$/i)) return true;
  if (line.match(/^App-Level\s+QOE\s+Analytics$/i)) return true;
  if (line.match(/^Cloudbrink\s+Administrator\s+Guide/i)) return true;

  if (line.length < 60 && line.length > 10) {
    const upperCount = (line.match(/[A-Z]/g) || []).length;
    const letterCount = (line.match(/[A-Za-z]/g) || []).length;
    if (letterCount > 0 && upperCount / letterCount > 0.3) return true;
  }
  return false;
}

function isSectionHeader(line) {
  if (line.length > 100) return false;
  if (
    line.match(
      /^(Introduction|Prerequisites|Bridge Mode Important Notes|Bridge Mode User Config|Use Cases|Troubleshoot)$/i,
    )
  ) {
    return true;
  }

  const upperCount = (line.match(/[A-Z]/g) || []).length;
  const letterCount = (line.match(/[A-Za-z]/g) || []).length;
  if (letterCount > 3 && upperCount / letterCount > 0.85) return true;
  return false;
}

function isSubsectionHeader(line, lines, index) {
  if (line.length > 100) return false;
  if (line.match(/^.+\s*-\s*Continued$/i)) return true;

  if (
    /^[A-Z][a-z]/.test(line) &&
    line.length < 80 &&
    !line.endsWith('.') &&
    !line.endsWith(',')
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
  if (/^\d+\.\s+/.test(line)) return true;
  if (/^[ivxIVX]+\)\s+/.test(line)) return true;
  if (/^[•●○-]\s+/.test(line)) return true;
  return false;
}
