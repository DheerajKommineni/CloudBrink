// backend/utils/pdfToMarkdown.js
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

/**
 * Enhanced PDF to Markdown converter that preserves exact formatting
 */
export async function pdfToMarkdown(pdfPath) {
  const dataBuffer = fs.readFileSync(pdfPath);
  const pdfData = await pdf(dataBuffer, {
    max: 0,
  });

  let text = pdfData.text;

  // Clean and convert to proper Markdown
  text = preprocessText(text);
  text = convertToMarkdown(text);

  return text;
}

/**
 * Preprocess PDF text to clean artifacts
 */
function preprocessText(text) {
  // Normalize line endings
  text = text.replace(/\r\n/g, '\n');
  text = text.replace(/\r/g, '\n');

  // Replace non-breaking spaces
  text = text.replace(/\u00A0/g, ' ');
  text = text.replace(/\u2022/g, '•');

  // Remove copyright notices - match across multiple lines if needed
  // Pattern: Everything from © through "respective owners."
  text = text.replace(/©\s*\d{4}\s+Cloudbrink.*?respective owners\./gis, '');

  // Remove Corporate Headquarters and address blocks
  text = text.replace(/Corporate Headquarters.*?CA\s+\d{5}/gis, '');
  text = text.replace(/\d+\s+Lakeside\s+Drive.*?CA\s+\d{5}/gis, '');

  // Remove concatenated header/footer text that appears as one line
  // Pattern: "...owners.New Features..." or similar concatenations
  text = text.replace(
    /respective owners\.\s*(?=New Features|Release Notes)/gi,
    'respective owners.\n\n',
  );

  // Remove page numbers and footers
  text = text.replace(
    /^.*(Admin Guide|Administrator Guide)\s*\|\s*\d+.*$/gim,
    '',
  );
  text = text.replace(/^.*Software Defined Mobility.*$/gim, '');
  text = text.replace(/^\s*\d+\s*$/gm, '');
  text = text.replace(/^Page\s+\d+\s+of\s+\d+$/gim, '');
  text = text.replace(/^Hybrid Access [Aa]s [Aa] Service\s*$/gim, '');
  text = text.replace(/^.*Release Notes - Cloudbrink \d+\.\d+.*$/gim, '');

  // Remove excessive blank lines but preserve paragraph spacing
  text = text.replace(/\n{4,}/g, '\n\n\n');

  return text.trim();
}

/**
 * Convert to Markdown with precise formatting
 */
function convertToMarkdown(text) {
  const lines = text.split('\n');
  const result = [];
  let i = 0;
  let currentParagraph = [];

  const flushParagraph = () => {
    if (currentParagraph.length > 0) {
      result.push(currentParagraph.join(' '));
      currentParagraph = [];
    }
  };

  while (i < lines.length) {
    let line = lines[i].trim();

    // Skip empty lines - they mark paragraph boundaries
    if (!line) {
      flushParagraph();
      if (result.length > 0 && result[result.length - 1] !== '') {
        result.push('');
      }
      i++;
      continue;
    }

    // Check for main document title (first significant line, large heading)
    if (i < 5 && isMainTitle(line)) {
      flushParagraph();
      result.push(`# ${line}`);
      result.push('');
      i++;
      continue;
    }

    // Check for major section headers (all caps, short lines)
    if (isSectionHeader(line)) {
      flushParagraph();
      result.push('');
      result.push(`## ${line}`);
      result.push('');
      i++;
      continue;
    }

    // Check for subsection headers
    if (isSubsectionHeader(line, lines, i)) {
      flushParagraph();
      result.push('');
      result.push(`### ${line}`);
      result.push('');
      i++;
      continue;
    }

    // Handle NOTE/IMPORTANT/WARNING labels (only the label is bold)
    const noteLabelMatch = line.match(
      /^(NOTE|IMPORTANT|WARNING|TIP|CAUTION)(\s*\([^)]+\))?:\s*(.*)$/i,
    );
    if (noteLabelMatch) {
      flushParagraph();
      const [, label, parenthetical, restOfText] = noteLabelMatch;
      const boldPart = parenthetical ? `${label}${parenthetical}` : label;

      result.push('');
      currentParagraph = [`**${boldPart}:**`, restOfText];

      // Continue reading until we hit a blank line or new section
      let j = i + 1;
      while (j < lines.length) {
        const nextLine = lines[j].trim();
        if (!nextLine) {
          break;
        }
        if (isNewSection(nextLine, lines, j)) {
          break;
        }
        currentParagraph.push(nextLine);
        j++;
      }

      flushParagraph();
      result.push('');
      i = j;
      continue;
    }

    // Handle "Use Cases:" style labels (bold label only)
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
      if (restOfText.trim()) {
        result.push(`**${label}:** ${restOfText}`);
      } else {
        result.push(`**${label}:**`);
      }
      result.push('');
      i++;
      continue;
    }

    // Handle numbered lists (1), 2), etc.)
    const numberedMatch = line.match(/^(\d+)\)\s+(.+)$/);
    if (numberedMatch) {
      flushParagraph();
      const [, num, content] = numberedMatch;
      result.push(`${num}. ${content}`);
      i++;
      continue;
    }

    // Handle Roman numeral sub-items (i), ii), iii))
    const romanMatch = line.match(/^([ivxIVX]+)\)\s+(.+)$/);
    if (romanMatch) {
      flushParagraph();
      const [, roman, content] = romanMatch;
      result.push(`   - **${roman})** ${content}`);
      i++;
      continue;
    }

    // Handle bullet points
    if (line.startsWith('•') || line.startsWith('●')) {
      flushParagraph();
      line = line.replace(/^[•●]\s*/, '- ');
      result.push(line);
      i++;
      continue;
    }

    // Regular text - accumulate into paragraph
    currentParagraph.push(line);
    i++;
  }

  // Flush any remaining paragraph
  flushParagraph();

  // Clean up result
  let finalText = result.join('\n');

  // Remove excessive blank lines (max 2 consecutive)
  finalText = finalText.replace(/\n{3,}/g, '\n\n');

  return finalText.trim();
}

/**
 * Check if line is a main document title
 */
function isMainTitle(line) {
  // Very specific patterns for main titles
  if (line.match(/^App-Level\s+QOE\s+Analytics$/i)) return true;
  if (line.match(/^Bridge\s+Mode\s+Admin\s+Guide$/i)) return true;
  if (line.match(/^Cloudbrink\s+Administrator\s+Guide/i)) return true;

  // Short, prominent lines at document start
  if (line.length < 60 && line.length > 10) {
    const upperCount = (line.match(/[A-Z]/g) || []).length;
    const letterCount = (line.match(/[A-Za-z]/g) || []).length;
    if (letterCount > 0 && upperCount / letterCount > 0.3) {
      return true;
    }
  }

  return false;
}

/**
 * Check if line is a major section header (## heading)
 */
function isSectionHeader(line) {
  // Skip very long lines
  if (line.length > 100) return false;

  // Specific known section headers
  if (
    line.match(
      /^(Table of Contents|QOE Analytics Functionality|Introduction|Prerequisites|Troubleshoot|Use Cases)$/i,
    )
  ) {
    return true;
  }

  // All caps or mostly caps
  const upperCount = (line.match(/[A-Z]/g) || []).length;
  const letterCount = (line.match(/[A-Za-z]/g) || []).length;

  if (letterCount > 3 && upperCount / letterCount > 0.85) {
    return true;
  }

  return false;
}

/**
 * Check if line is a subsection header (### heading)
 */
function isSubsectionHeader(line, lines, index) {
  // Skip long lines
  if (line.length > 80) return false;

  // Capitalized, short, followed by paragraph
  if (
    /^[A-Z][a-z]/.test(line) &&
    line.length < 60 &&
    !line.endsWith('.') &&
    !line.endsWith(',')
  ) {
    // Check if next line exists and looks like content
    if (index < lines.length - 1) {
      const nextLine = lines[index + 1].trim();
      if (nextLine && nextLine.length > 20) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if line starts a new section (heading, list, special label)
 */
function isNewSection(line, lines, index) {
  if (!line) return false;
  if (isMainTitle(line)) return true;
  if (isSectionHeader(line)) return true;
  if (isSubsectionHeader(line, lines, index)) return true;
  if (/^(NOTE|IMPORTANT|WARNING|TIP|CAUTION)(\s*\([^)]+\))?:/i.test(line))
    return true;
  if (/^(\d+)\)\s+/.test(line)) return true; // Numbered list
  if (/^([ivxIVX]+)\)\s+/.test(line)) return true; // Roman numeral
  if (/^[•●-]\s+/.test(line)) return true; // Bullet point
  return false;
}
