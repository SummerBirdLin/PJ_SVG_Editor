/**
 * 目录访问**端口**（Port）：`dir` 命令只认识这个接口，不认识 Node 的 `fs`。
 *
 * 适配器模式的三方角色：
 * - **Target**：本接口（客户端 `DirCommand` 期望的抽象）；
 * - **Adaptee**：Node `fs.readdirSync`（返回 `Dirent`，语义与展示无关）；
 * - **Adapter**：`NodeDirectoryReader`（把 `Dirent` 翻译成 `DirectoryEntry`）。
 *
 * 测试替身实现同一个接口，因此命令逻辑（排序、分组、空目录、失败文案）
 * 可以完全不碰文件系统地被验证。
 */
export type DirectoryEntryKind = 'directory' | 'file' | 'other';

export interface DirectoryEntry {
  readonly name: string;
  readonly kind: DirectoryEntryKind;
}

/** 读目录失败（权限、不存在、不是目录…）统一抛出，由命令折算成 `error:` 文案。 */
export class DirectoryReadError extends Error {
  constructor(
    readonly target: string,
    readonly reason: string,
  ) {
    super(`cannot read directory: ${target} (${reason})`);
    this.name = 'DirectoryReadError';
  }
}

export interface DirectoryReader {
  /** 只列**直接**子项，不递归；`.` / `..` 由适配器负责不出现。 */
  read(target: string): readonly DirectoryEntry[];
}
