import type { SvgDocument } from '../domain/SvgDocument.js';
import type { ContainerShape } from '../domain/shape/ContainerShape.js';
import type { Shape } from '../domain/shape/Shape.js';

/**
 * 图形内容的**可比较签名**：类型、标签、属性、文本、父节点、在父节点中的序号。
 *
 * `modified-star` 用它与"保存点快照"比较来判断"内容是否与上次保存一致"，
 * 因此 undo 回到保存点后 `*` 会自动消失，不需要维护"编辑过与否"的布尔值。
 */
export class ShapeSnapshot {
  /** id → 签名（按文档顺序遍历，含嵌套）。 */
  static of(document: SvgDocument): Map<string, string> {
    const snapshot = new Map<string, string>();
    ShapeSnapshot.collect(document.canvas(), snapshot);
    return snapshot;
  }

  static signatureOf(shape: Shape): string {
    const attributes = shape
      .attributes()
      .map(([name, value]) => `${name}=${value}`)
      .join(',');
    const parent = shape.parent();
    const parentId = parent === null ? '' : parent.id();
    const siblingIndex = parent === null ? -1 : parent.indexOf(shape);
    return [
      shape.typeName(),
      shape.svgTag(),
      attributes,
      shape.textContent() ?? '',
      parentId,
      String(siblingIndex),
    ].join('|');
  }

  /** `document` 里是否**存在**与 `id` 同名但内容不同的图形（用于"是否新建"的判断）。 */
  static isNewOrChanged(id: string, current: Map<string, string>, baseline: Map<string, string>): boolean {
    const before = baseline.get(id);
    if (before === undefined) {
      return true;
    }
    return before !== current.get(id);
  }

  private static collect(container: ContainerShape, into: Map<string, string>): void {
    for (const child of container.children()) {
      if (child.id().length > 0) {
        into.set(child.id(), ShapeSnapshot.signatureOf(child));
      }
      const nested = child as Shape & { children?: () => readonly Shape[] };
      if (typeof nested.children === 'function') {
        ShapeSnapshot.collect(child as ContainerShape, into);
      }
    }
  }
}
