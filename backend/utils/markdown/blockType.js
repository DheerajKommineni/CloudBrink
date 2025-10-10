// backend/utils/markdown/blockType.js
import { linesToText } from './wordType.js';

export const BlockType = {
  H1: block => '# ' + linesToText(block.items),
  H2: block => '## ' + linesToText(block.items),
  H3: block => '### ' + linesToText(block.items),
  H4: block => '#### ' + linesToText(block.items),
  H5: block => '##### ' + linesToText(block.items),
  H6: block => '###### ' + linesToText(block.items),
  TOC: block => linesToText(block.items),
  FOOTNOTES: block => linesToText(block.items),
  CODE: block => '```\n' + linesToText(block.items) + '\n```',
  LIST: block => linesToText(block.items),
  PARAGRAPH: block => linesToText(block.items),
};

/**
 * Converts a structured block to Markdown text.
 */
export function blockToText(block) {
  if (!block || !block.items) return '';
  if (block.type && BlockType[block.type]) {
    return BlockType[block.type](block);
  }
  return linesToText(block.items);
}
