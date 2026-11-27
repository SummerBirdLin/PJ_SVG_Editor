import { EditorError } from '../../../src/domain/EditorError.js';
import { ContainerShape } from '../../../src/domain/shape/ContainerShape.js';
import { RectShape } from '../../../src/domain/shape/RectShape.js';
import { TextShape } from '../../../src/domain/shape/TextShape.js';
import type { Shape } from '../../../src/domain/shape/Shape.js';
import type { ShapeInit } from '../../../src/domain/shape/ShapeInit.js';
import type { CreationAttribute } from '../../../src/domain/shape/CreationAttribute.js';
import { ShapeProvider } from '../../../src/domain/shape/provider/ShapeProvider.js';
import { NumberFormat } from '../../../src/domain/NumberFormat.js';
import { BoxShape } from './BoxShape.js';

/**
 * `box` 的图形类型描述者（`ShapeProvider` 扩展点实现）。
 *
 * 两条创建路径：
 * - **命令创建**（`create box n1 120 100 160 60 "开始"`）：属性里带几何，直接造出两个子部件；
 * - **读回**（`<g data-kind="box">`）：属性里没有几何，先造空盒子，子部件由 `SvgReader`
 *   递归读入后按派生 id 追加；`afterChildren` 负责校验"必要子部件齐全且类型正确"，
 *   不满足时抛错 → **拒绝整个读入**（ADR-2），绝不留下半个 `box`。
 */
export class BoxProvider extends ShapeProvider {
  readonly typeName = 'box';

  readonly svgTag = 'g';

  /** 复合类型靠 `data-kind` 读回，因此不占用 `<g>` 标签的 Provider 位置。 */
  override readonly dataKind = 'box';

  override readonly hasTextContent = true;

  readonly creationAttributes: readonly CreationAttribute[] = [
    { name: 'x', required: true },
    { name: 'y', required: true },
    { name: 'width', required: true },
    { name: 'height', required: true },
  ];

  create(id: string, init: ShapeInit): Shape {
    const box = new BoxShape(id);
    const hasGeometry = init.attributes.has('x') && init.attributes.has('width');
    if (!hasGeometry) {
      // 读回路径：子部件由 Reader 逐个 append（id 必须匹配派生规则）
      return box;
    }
    const x = this.readNumber(init, 'x');
    const y = this.readNumber(init, 'y');
    const width = this.readSize(init, 'width');
    const height = this.readSize(init, 'height');
    const label = init.textContent ?? '';
    box.fillParts(
      new RectShape(box.rectId(), x, y, width, height),
      new TextShape(
        box.labelId(),
        x + BoxShape.LABEL_PADDING_X,
        y + height / 2 + BoxShape.LABEL_BASELINE_OFFSET,
        label,
      ),
    );
    return box;
  }

  override afterChildren(shape: Shape): void {
    if (!(shape instanceof BoxShape)) {
      return;
    }
    const rect = shape.rectPart();
    const label = shape.labelPart();
    if (rect === null || label === null) {
      const ids = shape.children().map((child) => child.id()).join(', ');
      throw new EditorError(
        `invalid box ${shape.id()}: expected ${shape.rectId()} and ${shape.labelId()}, got [${ids}]`,
      );
    }
    if (shape.childCount() !== 2) {
      throw new EditorError(`invalid box ${shape.id()}: expected 2 parts, got ${shape.childCount()}`);
    }
  }

  /** 供属性处理器与测试使用：几何来自内部矩形。 */
  static geometryOf(container: ContainerShape): { x: number; y: number; width: number; height: number } | null {
    const found = container.children()[0];
    if (!(found instanceof RectShape)) {
      return null;
    }
    return {
      x: found.x(),
      y: found.y(),
      width: found.width(),
      height: found.height(),
    };
  }

  /** 数值格式统一走内核的 `NumberFormat`（保证 box 的属性回显与其它图形一致）。 */
  static format(value: number): string {
    return NumberFormat.format(value);
  }
}
