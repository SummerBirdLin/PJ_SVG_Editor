import * as vscode from 'vscode';
import type {
  DisposableLike,
  DocumentSelectorLike,
  DocumentSymbolLike,
  DocumentSymbolProviderLike,
  DocumentSymbolSpec,
  FileDecorationLike,
  FileDecorationProviderLike,
  UriLike,
  VscodeLike,
} from '../ports/VscodeLike';

/**
 * `VscodeLike` 端口的唯一真实实现：整个扩展里**只有本文件在运行时 import `vscode`**。
 *
 * 这样做的好处：所有与 VSCode API 形状的纠缠（事件桥接、`ProviderResult`、结构镜像与真实类的差异）
 * 都收敛在一处，其余模块可以在纯 Node 下测试。
 */
export class VscodeBinding implements VscodeLike {
  readonly symbolKinds = {
    root: vscode.SymbolKind.Namespace,
    container: vscode.SymbolKind.Struct,
    leaf: vscode.SymbolKind.Object,
  };

  readonly fileTypes = {
    file: vscode.FileType.File,
    directory: vscode.FileType.Directory,
  };

  registerFileDecorationProvider(provider: FileDecorationProviderLike): DisposableLike {
    const emitter = new vscode.EventEmitter<vscode.Uri | undefined>();
    const subscription = provider.subscribeChanged((uri) => {
      emitter.fire(uri as vscode.Uri);
    });
    const registration = vscode.window.registerFileDecorationProvider({
      provideFileDecoration: (uri) => provider.provideFileDecoration(uri),
      onDidChangeFileDecorations: emitter.event,
    });
    return {
      dispose: () => {
        subscription.dispose();
        emitter.dispose();
        registration.dispose();
      },
    };
  }

  registerDocumentSymbolProvider(
    selector: DocumentSelectorLike,
    provider: DocumentSymbolProviderLike,
  ): DisposableLike {
    const filter: vscode.DocumentFilter =
      selector.scheme === undefined
        ? { pattern: selector.pattern }
        : { scheme: selector.scheme, pattern: selector.pattern };
    const registration = vscode.languages.registerDocumentSymbolProvider(filter, {
      // 端口返回的是结构镜像；实际对象由 createDocumentSymbol 造出来，就是 vscode.DocumentSymbol。
      provideDocumentSymbols: (document) =>
        provider.provideDocumentSymbols(document) as unknown as vscode.DocumentSymbol[],
    });
    return { dispose: () => registration.dispose() };
  }

  async fileTypeOf(uri: UriLike): Promise<number | null> {
    try {
      const stat = await vscode.workspace.fs.stat(uri as vscode.Uri);
      return stat.type;
    } catch {
      return null; // 被删/无权限/不存在的路径：按"类型未知"处理，不加标记
    }
  }

  createFileDecoration(badge: string, tooltip: string): FileDecorationLike {
    // vscode.FileDecoration 的字段是可选的，端口接口把它们声明成必填（调用点保证非空）。
    return new vscode.FileDecoration(badge, tooltip) as FileDecorationLike;
  }

  createDocumentSymbol(spec: DocumentSymbolSpec): DocumentSymbolLike {
    const range = new vscode.Range(
      spec.range.start.line,
      spec.range.start.character,
      spec.range.end.line,
      spec.range.end.character,
    );
    const selectionRange = new vscode.Range(
      spec.selectionRange.start.line,
      spec.selectionRange.start.character,
      spec.selectionRange.end.line,
      spec.selectionRange.end.character,
    );
    const symbol = new vscode.DocumentSymbol(spec.name, spec.detail, spec.kind, range, selectionRange);
    symbol.children = spec.children as unknown as vscode.DocumentSymbol[];
    return symbol;
  }
}
