import type { FileKind, FileKindProbe } from '../../src/ports/FileKindProbe';
import type {
  DisposableLike,
  DocumentSelectorLike,
  DocumentSymbolLike,
  DocumentSymbolProviderLike,
  DocumentSymbolSpec,
  FileDecorationLike,
  FileDecorationProviderLike,
  TextDocumentLike,
  UriLike,
  VscodeLike,
} from '../../src/ports/VscodeLike';

/** 假 Uri：真实 `vscode.Uri` 的结构镜像里插件只用 scheme/path/toString。 */
export class FakeUri implements UriLike {
  private readonly uriScheme: string;
  private readonly uriPath: string;

  constructor(path: string, scheme = 'file') {
    this.uriScheme = scheme;
    this.uriPath = path;
  }

  get scheme(): string {
    return this.uriScheme;
  }

  get path(): string {
    return this.uriPath;
  }

  toString(): string {
    return `${this.uriScheme}://${this.uriPath}`;
  }
}

/** 假文档：`setText` 用来模拟"用户编辑后大纲随之更新"。 */
export class FakeDocument implements TextDocumentLike {
  readonly uri: FakeUri;
  private text: string;

  constructor(uri: FakeUri, text: string) {
    this.uri = uri;
    this.text = text;
  }

  setText(text: string): void {
    this.text = text;
  }

  getText(): string {
    return this.text;
  }
}

/**
 * 假 VSCode 外观：记录注册了什么，并让测试直接驱动两个 Provider。
 * `fileTypes` 用假的位标志（真实值是 File=1 / Directory=2），借以确认判定走的是位运算而不是相等比较。
 */
export class FakeVscode implements VscodeLike {
  readonly symbolKinds = { root: 11, container: 12, leaf: 13 };

  readonly fileTypes = { file: 1, directory: 2 };

  decorationProviders: FileDecorationProviderLike[] = [];

  symbolRegistrations: Array<{ selector: DocumentSelectorLike; provider: DocumentSymbolProviderLike }> = [];

  /** path → FileType 位标志；缺省视为"stat 失败"。 */
  private readonly fileTypesByPath = new Map<string, number>();

  readonly statCalls: string[] = [];

  registerFileDecorationProvider(provider: FileDecorationProviderLike): DisposableLike {
    this.decorationProviders.push(provider);
    return {
      dispose: () => {
        this.decorationProviders = this.decorationProviders.filter((item) => item !== provider);
      },
    };
  }

  registerDocumentSymbolProvider(
    selector: DocumentSelectorLike,
    provider: DocumentSymbolProviderLike,
  ): DisposableLike {
    const registration = { selector, provider };
    this.symbolRegistrations.push(registration);
    return {
      dispose: () => {
        this.symbolRegistrations = this.symbolRegistrations.filter((item) => item !== registration);
      },
    };
  }

  setFileType(path: string, fileType: number): void {
    this.fileTypesByPath.set(path, fileType);
  }

  async fileTypeOf(uri: UriLike): Promise<number | null> {
    this.statCalls.push(uri.path);
    await Promise.resolve();
    return this.fileTypesByPath.get(uri.path) ?? null;
  }

  createFileDecoration(badge: string, tooltip: string): FileDecorationLike {
    return { badge, tooltip };
  }

  createDocumentSymbol(spec: DocumentSymbolSpec): DocumentSymbolLike {
    return spec;
  }
}

/**
 * 可控的文件类型探测：命中 `fixed` 就立刻返回，否则挂起等测试 `resolve()`/`fail()`，
 * 用来验证"异步探测未完成时不加标记、完成后触发一次刷新、失败时不加标记"。
 */
export class ManualFileKindProbe implements FileKindProbe {
  readonly calls: string[] = [];

  private readonly fixed = new Map<string, FileKind>();

  private readonly waiting = new Map<string, { resolve: (kind: FileKind) => void; reject: () => void }>();

  constructor(fixed: ReadonlyMap<string, FileKind> = new Map()) {
    for (const [key, kind] of fixed) {
      this.fixed.set(key, kind);
    }
  }

  kindOf(uri: UriLike): Promise<FileKind> {
    const key = uri.toString();
    this.calls.push(key);
    const immediate = this.fixed.get(key);
    if (immediate !== undefined) {
      return Promise.resolve(immediate);
    }
    return new Promise<FileKind>((resolve, reject) => {
      this.waiting.set(key, { resolve, reject: () => reject(new Error('stat failed')) });
    });
  }

  resolve(key: string, kind: FileKind): void {
    const waiting = this.waiting.get(key);
    this.waiting.delete(key);
    if (waiting !== undefined) {
      waiting.resolve(kind);
      return;
    }
    this.fixed.set(key, kind);
  }

  fail(key: string): void {
    const waiting = this.waiting.get(key);
    this.waiting.delete(key);
    waiting?.reject();
  }
}
