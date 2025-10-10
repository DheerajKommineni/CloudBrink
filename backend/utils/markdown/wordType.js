// backend/utils/markdown/wordType.js

/**
 * Converts word types like links, footnotes, etc.
 */
export const WordType = {
  LINK: str => `[${str}](${str})`,
  FOOTNOTE_LINK: str => `^${str}`,
  FOOTNOTE: str => `(^${str})`,
};

/**
 * Converts an array of line items to plain text or formatted text.
 */
export function linesToText(lines, disableInlineFormats = false) {
  let text = '';
  let openFormat = null;

  const closeFormat = () => {
    if (openFormat) {
      text += openFormat.end;
      openFormat = null;
    }
  };

  lines.forEach((line, lineIndex) => {
    if (!line.words) return;

    line.words.forEach((word, i) => {
      const { string, type, format } = word;

      if (openFormat && (!format || format !== openFormat)) closeFormat();

      // Add space if not punctuation or attached footnote
      if (i > 0 && !['.', ',', '!', '?', ')', ':'].includes(string)) {
        text += ' ';
      }

      // Open format
      if (format && !disableInlineFormats && !openFormat) {
        openFormat = format;
        text += format.start;
      }

      // Apply word type (links, footnotes)
      if (type && WordType[type]) {
        text += WordType[type](string);
      } else {
        text += string;
      }
    });

    if (openFormat && lineIndex === lines.length - 1) closeFormat();
    text += '\n';
  });

  return text.trim();
}
