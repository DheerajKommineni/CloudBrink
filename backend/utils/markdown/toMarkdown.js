// backend/utils/markdown/toMarkdown.js
import { blockToText } from './blockType.js';

/**
 * Combine multiple parsed PDF pages into final Markdown string
 */
export function toMarkdown(pages) {
  let markdown = '';

  pages.forEach(page => {
    page.items.forEach(block => {
      const blockText = blockToText(block);
      if (blockText.trim().length > 0) {
        markdown += blockText + '\n\n';
      }
    });
  });

  return markdown.trim();
}
