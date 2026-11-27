import { EditorError } from '../../../src/domain/EditorError.js';
import { ContainerShape } from '../../../src/domain/shape/ContainerShape.js';
import { RectShape } from '../../../src/domain/shape/RectShape.js';
import { TextShape } from '../../../src/domain/shape/TextShape.js';
import type { Shape, AttributeEntry } from '../../../src/domain/shape/Shape.js';

/**
 * `box`：由"矩形 + 文字"组成的复合图形（容器型插件图形）。
 *
 * 不变量（本类自己守住，内核不需要知道 `box` 的存在）：
 * - 子部件固定两个，id 由 `<id>-rect` / `<id>-label` 派生；
 * - `append` 只接受"id 匹配派生规则的前两个子部件"（`read` 读入时天然满足），
 *   因此 `addto box x` 之类会破坏结构的操作被拒绝；
 * - `remove` 拒绝移除必要子部件（`delete n1-rect` 被拒绝）；
 * - 整体 `move`/`scale` 由 `ContainerShape` 递归到两个子部件（整体平移/缩放）；
 * - 序列化为 `<g data-kind="box">`，读回时按 `data-kind` 找回本插件。
 *
 * 标签文本的位置约定（插件内部约定，内核不参与）：
 * `(x + 20, y + height/2 + 5)`，与需求 §5 示例中的 `(140,135)` 一致。
 */
export class BoxShape extends ContainerShape {
  /** 左侧内边距与文字基线偏移（`box` 插件的排版约定）。 */
  static readonly LABEL_PADDING_X = 20;

  static readonly LABEL_BASELINE_OFFSET = 5;

  constructor(id: string) {
    super(id, 'box', 'g');
  }

  rectId(): string {
    return `${this.id()}-rect`;
  }

  labelId(): string {
    return `${this.id()}-label`;
  }

  /** 内部矩形（结构不完整时返回 null，供属性处理器给出明确错误）。 */
  rectPart(): RectShape | null {
    const found = super.findById(this.rectId());
    return found instanceof RectShape ? found : null;
  }

  /** 内部文字（同上）。 */
  labelPart(): TextShape | null {
    const found = super.findById(this.labelId());
    return found instanceof TextShape ? found : null;
  }

  /** 供 Provider 在创建阶段一次性装入两个子部件（绕开 append 的派生 id 检查）。 */
  fillParts(rect: RectShape, label: TextShape): void {
    super.append(rect);
    super.append(label);
  }

  override append(child: Shape): void {
    this.requireAllowedChild(child);
    super.append(child);
  }

  override insert(index: number, child: Shape): void {
    this.requireAllowedChild(child);
    super.insert(index, child);
  }

  override remove(child: Shape): boolean {
    if (child.id() === this.rectId() || child.id() === this.labelId()) {
      throw new EditorError(`cannot remove required part of box: ${child.id()}`);
    }
    return super.remove(child);
  }

  /** 序列化带上 `data-kind`，并把读入时残留的同名属性去重（保证 round-trip 稳定）。 */
  override extraEntries(): AttributeEntry[] {
    const inherited = super.extraEntries().filter(([name]) => name !== 'data-kind');
    return [...inherited, ['data-kind', 'box']];
  }

  /** `box` 自身没有可 `set` 的几何属性（`fill`/`label` 由属性处理器负责）。 */
  override settableGeometryAttributes(): readonly string[] {
    return [];
  }

  /**
   * `box` 的几何属于内部矩形：创建参数里的 `x/y/width/height` 已被 Provider 消费，
   * 不能再落进 `extras`，否则序列化会在 `<g>` 上写出一份多余坐标（并影响读回判定）。
   * `data-kind` 同理——它由 `extraEntries()` 统一输出。
   */
  override applyImportedAttributes(attributes: ReadonlyMap<string, string>): void {
    const consumed = new Set(['x', 'y', 'width', 'height', 'data-kind']);
    const rest = new Map<string, string>();
    for (const [name, value] of attributes) {
      if (!consumed.has(name)) {
        rest.set(name, value);
      }
    }
    super.applyImportedAttributes(rest);
  }

  private requireAllowedChild(child: Shape): void {
    const expectedIds = [this.rectId(), this.labelId()];
    const slot = this.childCount();
    const expected = expectedIds[slot];
    if (expected !== child.id()) {
      throw new EditorError(
        `cannot add child to box ${this.id()}: expected ${expectedIds.join(' / ')}, got ${child.id()}`,
      );
    }
    const typeMatches = slot === 0 ? child instanceof RectShape : child instanceof TextShape;
    if (!typeMatches) {
      throw new EditorError(`cannot add child to box ${this.id()}: wrong type for ${child.id()}`);
    }
  }
}
