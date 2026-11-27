import { EditorError } from '../../../src/domain/EditorError.js';
import type { AttributeChanges } from '../../../src/plugin-api/AttributeChanges.js';
import type { AttributeHandler } from '../../../src/plugin-api/AttributeHandler.js';
import type { ShapeTarget } from '../../../src/plugin-api/ShapeTarget.js';
import { BoxShape } from './BoxShape.js';

/**
 * `box` 的属性语义（`AttributeHandler` 扩展点实现）。
 *
 * | 命令 | 属性含义 | 实际修改 |
 * |---|---|---|
 * | `set n1 fill red` | 框体填充 | 内部矩形 `n1-rect` 的 `fill` |
 * | `set n1 label "开始"` | 框体标题 | 内部文字 `n1-label` 的文本内容 |
 *
 * 两个修改都经 `AttributeChanges` 完成，因此一次 `set` 就是一个 undo 单元；
 * `label` 不需要进入内核的属性白名单（内核压根不校验它）。
 */
export class BoxAttributesHandler implements AttributeHandler {
  readonly handlerName = 'box-attributes';

  readonly priority = 10;

  handles(target: ShapeTarget, attribute: string): boolean {
    return target.typeName === 'box' && (attribute === 'fill' || attribute === 'label');
  }

  apply(target: ShapeTarget, attribute: string, value: string, changes: AttributeChanges): void {
    const box = target.shape;
    if (!(box instanceof BoxShape)) {
      throw new EditorError(`box-attributes handler requires a box shape: ${box.id()}`);
    }
    if (attribute === 'fill') {
      const rect = this.requireRect(box);
      changes.setAttribute(rect, 'fill', value);
      return;
    }
    if (attribute === 'label') {
      const label = this.requireLabel(box);
      changes.setAttribute(label, 'text', value);
      return;
    }
    throw new EditorError(`unknown attribute: ${attribute}`);
  }

  private requireRect(box: BoxShape) {
    const rect = box.rectPart();
    if (rect === null) {
      throw new EditorError(`box shape is incomplete: ${box.id()} (missing ${box.rectId()})`);
    }
    return rect;
  }

  private requireLabel(box: BoxShape) {
    const label = box.labelPart();
    if (label === null) {
      throw new EditorError(`box shape is incomplete: ${box.id()} (missing ${box.labelId()})`);
    }
    return label;
  }
}
