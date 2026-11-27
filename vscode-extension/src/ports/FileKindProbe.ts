import type { UriLike } from './VscodeLike';

/** 探测结论：文件 / 目录 / 未知（stat 失败）。 */
export type FileKind = 'file' | 'directory' | 'unknown';

/**
 * 文件类型探测端口。
 *
 * `provideFileDecoration` 是**同步**的，而"这个 Uri 是文件还是目录"只能异步问 VSCode，
 * 所以把探测抽成端口：判定逻辑（缓存 + 何时刷新）在 `SvgDecorationJudge` 里，
 * 探测实现可以是真实的 `workspace.fs.stat`，也可以是测试里的假实现。
 */
export interface FileKindProbe {
  kindOf(uri: UriLike): Promise<FileKind>;
}
