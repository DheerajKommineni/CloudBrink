// backend/utils/markdown/wordFormat.js
export const WordFormat = {
  BOLD: { start: '**', end: '**' },
  ITALIC: { start: '_', end: '_' },
  BOLD_ITALIC: { start: '**_', end: '_**' },
};

/**
 * Wraps a string with a Markdown format (bold, italic, etc.)
 */
export function applyFormat(str, format) {
  if (!format) return str;
  return `${format.start}${str}${format.end}`;
}
