import type {
  DisposableLike,
  FileDecorationLike,
  FileDecorationProviderLike,
  UriLike,
  VscodeLike,
} from '../ports/VscodeLike';
import { FacadeFileKindProbe } from './FacadeFileKindProbe';
import { SvgDecorationJudge } from './SvgDecorationJudge';

/**
 * 文件装饰 Provider（`vscode.window.registerFileDecorationProvider` 的实现方）。
 *
 * `provideFileDecoration` 必须同步返回，判定与探测的异步细节全在 `SvgDecorationJudge` 里；
 * 本类只负责把判定结果翻译成 VSCode 的 `FileDecoration`，并把 `subscribeChanged`
 * 交给真实绑定去接 `onDidChangeFileDecorations` 事件。
 */
export class SvgFileDecorationProvider implements FileDecorationProviderLike {
  private readonly vscode: VscodeLike;
  private readonly judge: SvgDecorationJudge;

  constructor(vscode: VscodeLike, judge: SvgDecorationJudge = new SvgDecorationJudge(new FacadeFileKindProbe(vscode))) {
    this.vscode = vscode;
    this.judge = judge;
  }

  provideFileDecoration(uri: UriLike): FileDecorationLike | undefined {
    const mark = this.judge.mark(uri);
    if (mark === null) {
      return undefined;
    }
    return this.vscode.createFileDecoration(mark.badge(), mark.tooltip());
  }

  subscribeChanged(listener: (uri: UriLike) => void): DisposableLike {
    return this.judge.subscribeChanged(listener);
  }
}
