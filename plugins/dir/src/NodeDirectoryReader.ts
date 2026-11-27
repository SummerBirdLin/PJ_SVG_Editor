import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  DirectoryReadError,
  type DirectoryEntry,
  type DirectoryEntryKind,
  type DirectoryReader,
} from './DirectoryReader.js';

/**
 * 真实文件系统**适配器**：Node `fs` → `DirectoryReader` 端口。
 *
 * 语义取舍（见 doc/README.md 的 `dir` 适配器说明）：
 * - 只读一层（不递归），`readdirSync` 不含 `.` / `..`；
 * - 符号链接：先看 `lstat` 类型，若为链接则 `stat` 跟随一次以判定目标类型
 *   （目录 → `[DIR]`，普通文件 → `[FILE]`），目标不可读时归为 `other` → `[OTHER]`；
 * - 其余特殊项（FIFO、socket、设备文件）一律 `other` → `[OTHER]`；
 * - 失败统一抛 `DirectoryReadError`（带目标路径与原因）。
 */
export class NodeDirectoryReader implements DirectoryReader {
  read(target: string): readonly DirectoryEntry[] {
    let names: string[];
    try {
      names = readdirSync(target);
    } catch (error) {
      throw new DirectoryReadError(target, NodeDirectoryReader.reasonOf(error));
    }
    return names.map((name) => ({ name, kind: this.kindOf(join(target, name)) }));
  }

  private kindOf(path: string): DirectoryEntryKind {
    try {
      const followed = statSync(path);
      if (followed.isDirectory()) {
        return 'directory';
      }
      return followed.isFile() ? 'file' : 'other';
    } catch {
      return 'other';
    }
  }

  private static reasonOf(error: unknown): string {
    if (error instanceof Error) {
      const code = (error as NodeJS.ErrnoException).code;
      return code ?? error.message;
    }
    return String(error);
  }
}
