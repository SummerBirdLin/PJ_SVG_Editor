import { readFileSync, writeFileSync } from 'node:fs';
import { EditorError } from '../domain/EditorError.js';
import type { FileStore } from '../ports/FileStore.js';

/** `FileStore` 的 Node 实现：把系统错误统一翻译成需求规定的错误文案。 */
export class NodeFileStore implements FileStore {
  readText(path: string): string {
    try {
      return readFileSync(path, 'utf8');
    } catch {
      throw new EditorError(`cannot read file: ${path}`);
    }
  }

  writeText(path: string, content: string): void {
    try {
      writeFileSync(path, content, 'utf8');
    } catch {
      throw new EditorError(`cannot write file: ${path}`);
    }
  }
}
