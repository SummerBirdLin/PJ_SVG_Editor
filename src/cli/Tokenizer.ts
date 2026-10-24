import { EditorError } from '../domain/EditorError.js';

/**
 * 引号感知的分词：双引号内的空格属于同一个参数，引号本身被移除。
 * `#` 注释由 Repl 在行首处理（避免把颜色值 `#4a90d9` 当注释）。
 */
export class Tokenizer {
  tokenize(line: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let hasToken = false;
    let inQuotes = false;

    for (const character of line) {
      if (inQuotes) {
        if (character === '"') {
          inQuotes = false;
        } else {
          current += character;
        }
        hasToken = true;
        continue;
      }
      if (character === '"') {
        inQuotes = true;
        hasToken = true;
        continue;
      }
      if (character === ' ' || character === '\t') {
        if (hasToken) {
          tokens.push(current);
          current = '';
          hasToken = false;
        }
        continue;
      }
      current += character;
      hasToken = true;
    }

    if (inQuotes) {
      throw new EditorError('unterminated quote in command');
    }
    if (hasToken) {
      tokens.push(current);
    }
    return tokens;
  }
}
