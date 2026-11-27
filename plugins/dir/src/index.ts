import type { PluginContext } from '../../../src/plugin-api/index.js';
import { DirCommand } from './DirCommand.js';
import { NodeDirectoryReader } from './NodeDirectoryReader.js';
import type { DirectoryReader } from './DirectoryReader.js';

interface DirPluginOptions {
  /** 覆盖"当前工作目录"（测试用；缺省 = `process.cwd()`）。 */
  readonly cwd?: string;
}

/**
 * `@svgframe/plugin-dir`：以插件形式提供 `dir` 命令。
 *
 * 默认导出是**类**：配置装配用 `options` 构造它，代码装配在组合根 `new DirPlugin()`。
 * 两条路都使用同一个 `DirCommand` 与同一个 `NodeDirectoryReader`（同一目录访问接口）。
 */
export default class DirPlugin {
  readonly name = '@svgframe/plugin-dir';

  private readonly command: DirCommand;

  constructor(options?: unknown) {
    const parsed = (options ?? {}) as DirPluginOptions;
    const reader: DirectoryReader = new NodeDirectoryReader();
    const fixedCwd = parsed.cwd;
    this.command = fixedCwd === undefined
      ? new DirCommand(reader)
      : new DirCommand(reader, () => fixedCwd);
  }

  activate(context: PluginContext): void {
    context.registerCommand(this.command);
  }
}

export { DirCommand };
export { NodeDirectoryReader };
export { DirectoryReadError } from './DirectoryReader.js';
export type { DirectoryEntry, DirectoryEntryKind, DirectoryReader } from './DirectoryReader.js';
