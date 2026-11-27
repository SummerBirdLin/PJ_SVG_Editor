import type { DirectoryEntry, DirectoryReader } from '../../src/DirectoryReader.js';
import { DirectoryReadError } from '../../src/DirectoryReader.js';

/**
 * 目录访问端口的测试替身：不碰文件系统，直接返回给定条目。
 * 用于验证"混合文件与子目录 / 空目录 / 隐藏项 / 读取失败 / 稳定排序"。
 */
export class FakeDirectoryReader implements DirectoryReader {
  private readonly entriesByPath: Map<string, readonly DirectoryEntry[]>;

  readonly calls: string[] = [];

  constructor(entriesByPath: Record<string, readonly DirectoryEntry[]>) {
    this.entriesByPath = new Map(Object.entries(entriesByPath));
  }

  read(target: string): readonly DirectoryEntry[] {
    this.calls.push(target);
    const entries = this.entriesByPath.get(target);
    if (entries === undefined) {
      throw new DirectoryReadError(target, 'ENOENT');
    }
    return entries;
  }
}
