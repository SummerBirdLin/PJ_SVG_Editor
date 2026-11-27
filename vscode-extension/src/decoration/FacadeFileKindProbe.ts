import type { FileKind, FileKindProbe } from '../ports/FileKindProbe';
import type { UriLike, VscodeLike } from '../ports/VscodeLike';

/**
 * `FileKindProbe` 的实现：把 VSCode 的 `FileType` 位标志翻译成三态。
 *
 * 位标志而不是相等比较：符号链接指向文件时 type 是 `File | SymbolicLink`，
 * 必须按位判断才认得出来。
 */
export class FacadeFileKindProbe implements FileKindProbe {
  private readonly vscode: VscodeLike;

  constructor(vscode: VscodeLike) {
    this.vscode = vscode;
  }

  async kindOf(uri: UriLike): Promise<FileKind> {
    const flags = await this.vscode.fileTypeOf(uri);
    if (flags === null) {
      return 'unknown';
    }
    const fileTypes = this.vscode.fileTypes;
    if ((flags & fileTypes.file) !== 0) {
      return 'file';
    }
    if ((flags & fileTypes.directory) !== 0) {
      return 'directory';
    }
    return 'unknown';
  }
}
