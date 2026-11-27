import type { FileKind, FileKindProbe } from '../ports/FileKindProbe';
import type { DisposableLike, UriLike } from '../ports/VscodeLike';
import { DecorationMark } from './DecorationMark';

/**
 * 装饰判定（需求 A.1）：什么 Uri 该加 `[]` 标记。
 *
 * 两个约束决定了它不像"看后缀就返回"那么简单：
 * 1. **目录不能有标记**：`provideFileDecoration` 是同步的，而"是文件还是目录"只能异步问
 *    `workspace.fs.stat`。所以首次询问时先返回"不加标记"，后台探测完成后通过
 *    `subscribeChanged` 通知上层触发 `onDidChangeFileDecorations` 刷新——此时缓存已就绪，
 *    第二次回调就能同步给出标记。
 * 2. **不能抖动/重复探测**：结论按 `uri.toString()` 缓存（文件/目录/未知都缓存），
 *    并用 `probing` 集合合并并发探测，避免 Explorer 一次滚动就把同一路径 stat 几十次。
 *
 * 探测失败（stat 抛错）按"非文件"处理并缓存，宁可少一个标记，也不要每次刷新都重试。
 */
export class SvgDecorationJudge {
  private static readonly SVG_SUFFIX = '.svg';

  private readonly probe: FileKindProbe;

  /** key = uri.toString()，value = 是否加标记。 */
  private readonly decided = new Map<string, boolean>();

  private readonly probing = new Set<string>();

  private readonly listeners: Array<(uri: UriLike) => void> = [];

  constructor(probe: FileKindProbe) {
    this.probe = probe;
  }

  /** 同步判定：能定就定，定不了就发起一次探测并返回 null（本轮回调不加标记）。 */
  mark(uri: UriLike): DecorationMark | null {
    if (!SvgDecorationJudge.hasSvgPath(uri.path)) {
      return null; // 后缀不是 .svg：不探测、不缓存，直接没有标记
    }
    const key = uri.toString();
    const known = this.decided.get(key);
    if (known === true) {
      return DecorationMark.svg();
    }
    if (known === false) {
      return null;
    }
    void this.probeKind(uri, key);
    return null;
  }

  subscribeChanged(listener: (uri: UriLike) => void): DisposableLike {
    this.listeners.push(listener);
    return {
      dispose: () => {
        const index = this.listeners.indexOf(listener);
        if (index >= 0) {
          this.listeners.splice(index, 1);
        }
      },
    };
  }

  /** 仅供测试与诊断：已缓存的判定条数。 */
  cachedCount(): number {
    return this.decided.size;
  }

  private static hasSvgPath(path: string): boolean {
    return path.toLowerCase().endsWith(SvgDecorationJudge.SVG_SUFFIX);
  }

  private async probeKind(uri: UriLike, key: string): Promise<void> {
    if (this.probing.has(key)) {
      return;
    }
    this.probing.add(key);
    let kind: FileKind;
    try {
      kind = await this.probe.kindOf(uri);
    } catch {
      kind = 'unknown';
    } finally {
      this.probing.delete(key);
    }
    const marked = kind === 'file';
    const previous = this.decided.get(key) ?? false;
    this.decided.set(key, marked);
    if (previous !== marked) {
      this.notify(uri); // 只有"加不加标记"真的变化时才刷新，避免无谓的 Outline/Explorer 重绘
    }
  }

  private notify(uri: UriLike): void {
    for (const listener of [...this.listeners]) {
      listener(uri);
    }
  }
}
