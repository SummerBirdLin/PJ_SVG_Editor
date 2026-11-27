import { EditorError } from '../../../src/domain/EditorError.js';
import type {
  CommandContribution,
  CommandEnvironment,
  CommandInvocation,
} from '../../../src/plugin-api/index.js';
import { DirectoryReadError, type DirectoryEntry, type DirectoryReader } from './DirectoryReader.js';

/**
 * `dir`：列出 CLI 进程当前工作目录的直接子项（需求 §2.2）。
 *
 * 只读命令：不碰文档、不碰 dirty、不碰 undo/redo，也不要求已 `init`/`read`。
 * 目录访问通过 `DirectoryReader` 端口完成（适配器模式），因此：
 * - 测试替身可以覆盖"混合文件与子目录 / 空目录 / 隐藏项 / 读取失败"；
 * - 真实文件系统由 `NodeDirectoryReader` 适配，两种装配方式用的是同一个实现。
 */
export class DirCommand implements CommandContribution {
  readonly commandName = 'dir';

  readonly usage = 'dir';

  readonly summary = 'list files and subdirectories of the process working directory';

  private readonly reader: DirectoryReader;

  private readonly resolveCwd: () => string;

  constructor(reader: DirectoryReader, resolveCwd: () => string = () => process.cwd()) {
    this.reader = reader;
    this.resolveCwd = resolveCwd;
  }

  create(args: string[], _environment: CommandEnvironment): CommandInvocation {
    if (args.length !== 0) {
      throw new EditorError(`usage: ${this.usage}`);
    }
    return {
      run: () => this.renderDirectory(this.resolveCwd()),
    };
  }

  /** 目录在前、文件在后，各组按名称升序；空目录给出明确提示。 */
  private renderDirectory(target: string): string[] {
    let entries: readonly DirectoryEntry[];
    try {
      entries = this.reader.read(target);
    } catch (error) {
      if (error instanceof DirectoryReadError) {
        throw new EditorError(`cannot read directory: ${target}`);
      }
      throw error;
    }
    if (entries.length === 0) {
      return ['(empty directory)'];
    }
    const directories = entries
      .filter((entry) => entry.kind === 'directory')
      .sort((left, right) => DirCommand.compareNames(left.name, right.name));
    const files = entries
      .filter((entry) => entry.kind === 'file')
      .sort((left, right) => DirCommand.compareNames(left.name, right.name));
    const others = entries
      .filter((entry) => entry.kind === 'other')
      .sort((left, right) => DirCommand.compareNames(left.name, right.name));
    // 每个子项一行（REPL 逐行打印），目录 → 文件 → 特殊项
    return [
      ...directories.map((entry) => `[DIR]  ${entry.name}`),
      ...files.map((entry) => `[FILE] ${entry.name}`),
      ...others.map((entry) => `[OTHER] ${entry.name}`),
    ];
  }

  /** 稳定排序：按码位比较（不受 locale 环境影响），同一输入输出顺序恒定。 */
  private static compareNames(left: string, right: string): number {
    if (left === right) {
      return 0;
    }
    return left < right ? -1 : 1;
  }
}
