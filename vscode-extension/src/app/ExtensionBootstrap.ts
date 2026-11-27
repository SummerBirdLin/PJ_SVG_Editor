import { SvgFileDecorationProvider } from '../decoration/SvgFileDecorationProvider';
import { SvgOutlineProvider } from '../outline/SvgOutlineProvider';
import type { DisposableLike, DocumentSelectorLike, VscodeLike } from '../ports/VscodeLike';

/**
 * 组合根（对应 Phase 1 `src/main.ts` 的位置）：把两个 Provider 组装出来并注册进 VSCode。
 *
 * 全部依赖走 `VscodeLike` 端口，所以这里没有一行 `import ... from 'vscode'`，
 * 单测可以用假外观断言"注册了什么、选中什么、返回什么"。
 */
export class ExtensionBootstrap {
  /**
   * 文档选择器：**只按文件模式匹配，不用语言 id**。
   *
   * `.svg` 在 VSCode 里可能被标成 xml、plaintext，甚至被别的扩展改成自定义 id，
   * 用 `{ language: 'svg' }` 会漏；`pattern` 只认路径。
   * 也**故意不写 `scheme: 'file'`**：Remote-SSH / Dev Container 里文件 Uri 的 scheme 是
   * `vscode-remote`，带上 scheme 会让大纲在远端窗口里失效；不带 scheme 则 file/remote 都命中。
   */
  static readonly SVG_SELECTOR: DocumentSelectorLike = { pattern: '**/*.svg' };

  private readonly vscode: VscodeLike;

  constructor(vscode: VscodeLike) {
    this.vscode = vscode;
  }

  /** 注册顺序无关紧要；返回的 Disposable 由 `activate` 收进 `context.subscriptions`。 */
  activate(): readonly DisposableLike[] {
    return [
      this.vscode.registerFileDecorationProvider(new SvgFileDecorationProvider(this.vscode)),
      this.vscode.registerDocumentSymbolProvider(
        ExtensionBootstrap.SVG_SELECTOR,
        new SvgOutlineProvider(this.vscode),
      ),
    ];
  }
}
