/**
 * VSCode API 的最小外观（Port）。
 *
 * 为什么不直接 `import * as vscode from 'vscode'`：VSCode 的 API 只在扩展宿主进程里存在，
 * 单元测试无法加载它。本接口只声明插件真正用到的几件事——"注册两个 Provider" +
 * "构造 VSCode 要求的具体值对象（Uri/Range/Position/FileDecoration/DocumentSymbol）"，
 * 于是 `ExtensionBootstrap`、`SvgOutlineProvider`、`SvgFileDecorationProvider` 全部可以
 * 在纯 Node 环境里用假实现单测（见 `test/support/FakeVscode.ts`），
 * 真实实现在 `src/vscode/VscodeBinding.ts` 里一处收敛。
 */

/** `vscode.Uri` 中插件用到的部分：要不要加标记只需要 scheme + path，缓存键用 toString()。 */
export interface UriLike {
  readonly scheme: string;
  readonly path: string;
  toString(): string;
}

/** `vscode.Position` 的结构镜像。 */
export interface PositionLike {
  readonly line: number;
  readonly character: number;
}

/** `vscode.Range` 的结构镜像。 */
export interface RangeLike {
  readonly start: PositionLike;
  readonly end: PositionLike;
}

/** VSCode 的 `Disposable`：注册即返回，卸载时 dispose。 */
export interface DisposableLike {
  dispose(): void;
}

/**
 * `vscode.DocumentFilter` 中插件用到的部分。
 *
 * `scheme` 可选：不写 = 任意 scheme。`.svg` 在 Remote-SSH / Dev Container 窗口里的 Uri scheme 是
 * `vscode-remote`，写死 `'file'` 会让大纲在远端失效（见 `ExtensionBootstrap.SVG_SELECTOR`）。
 */
export interface DocumentSelectorLike {
  readonly scheme?: string;
  readonly pattern: string;
}

/**
 * `vscode.TextDocument` 中插件用到的部分：大纲只需要全量文本 + 身份标识。
 * 注意这里**没有** languageId —— `.svg` 在不同 VSCode/插件组合下可能被标成 xml 或 plaintext，
 * 大纲靠文件扩展名（DocumentFilter 的 pattern）选中，不靠语言 id。
 */
export interface TextDocumentLike {
  readonly uri: UriLike;
  getText(): string;
}

/** `vscode.FileDecoration` 的结构镜像（badge 上限 2 字符，见 `DecorationMark`）。 */
export interface FileDecorationLike {
  readonly badge: string;
  readonly tooltip: string;
}

/** `vscode.DocumentSymbol` 的结构镜像：层级靠 `children` 表达。 */
export interface DocumentSymbolLike {
  readonly name: string;
  readonly detail: string;
  readonly kind: number;
  readonly range: RangeLike;
  readonly selectionRange: RangeLike;
  readonly children: readonly DocumentSymbolLike[];
}

/** 构造 `DocumentSymbol` 所需的一切（子节点先建好再传入，避免依赖可变数组）。 */
export interface DocumentSymbolSpec {
  readonly name: string;
  readonly detail: string;
  readonly kind: number;
  readonly range: RangeLike;
  readonly selectionRange: RangeLike;
  readonly children: readonly DocumentSymbolLike[];
}

/** 大纲里三类节点的 `vscode.SymbolKind`：根元素 / 容器 / 叶子。 */
export interface SymbolKindsLike {
  readonly root: number;
  readonly container: number;
  readonly leaf: number;
}

/** 文件装饰 Provider 的端口形态（真实实现要额外包一层 `onDidChangeFileDecorations` 事件）。 */
export interface FileDecorationProviderLike {
  provideFileDecoration(uri: UriLike): FileDecorationLike | undefined;
  /** 供真实绑定转成 `vscode.Event`；返回的 Disposable 用于注销监听。 */
  subscribeChanged(listener: (uri: UriLike) => void): DisposableLike;
}

/** 文档符号 Provider 的端口形态。 */
export interface DocumentSymbolProviderLike {
  provideDocumentSymbols(document: TextDocumentLike): readonly DocumentSymbolLike[];
}

/** 注入给组合根的 VSCode 外观。 */
export interface VscodeLike {
  readonly symbolKinds: SymbolKindsLike;

  /** `vscode.window.registerFileDecorationProvider`。 */
  registerFileDecorationProvider(provider: FileDecorationProviderLike): DisposableLike;

  /** `vscode.languages.registerDocumentSymbolProvider`。 */
  registerDocumentSymbolProvider(
    selector: DocumentSelectorLike,
    provider: DocumentSymbolProviderLike,
  ): DisposableLike;

  /** `vscode.workspace.fs.stat` 的投影：返回 FileType 位标志，失败返回 null（不抛错）。 */
  fileTypeOf(uri: UriLike): Promise<number | null>;

  /** FileType 位标志（真实绑定取 `vscode.FileType.File` / `.Directory`）。 */
  readonly fileTypes: { readonly file: number; readonly directory: number };

  createFileDecoration(badge: string, tooltip: string): FileDecorationLike;

  createDocumentSymbol(spec: DocumentSymbolSpec): DocumentSymbolLike;
}
