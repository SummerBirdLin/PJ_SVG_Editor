import { EditorError } from '../../../src/domain/EditorError.js';
import type { Shape } from '../../../src/domain/shape/Shape.js';
import type { ShapeInit } from '../../../src/domain/shape/ShapeInit.js';
import type { CreationAttribute } from '../../../src/domain/shape/CreationAttribute.js';
import { ShapeProvider } from '../../../src/domain/shape/provider/ShapeProvider.js';
import { DiamondShape } from './DiamondShape.js';

/**
 * `diamond` 的图形类型描述者。
 *
 * - 命令创建：`create diamond d1 100 100 80 80` → 直接给外接矩形；
 * - 读回：`<polygon points="140,100 180,140 140,180 100,140"/>` → 由 `points` 反算外接矩形。
 *
 * 只有一个扩展点实现，内核零改动——这是对"新增基本图形"的第二次开闭原则验证。
 */
export class DiamondProvider extends ShapeProvider {
  readonly typeName = 'diamond';

  readonly svgTag = 'polygon';

  readonly creationAttributes: readonly CreationAttribute[] = [
    { name: 'x', required: true },
    { name: 'y', required: true },
    { name: 'width', required: true },
    { name: 'height', required: true },
  ];

  create(id: string, init: ShapeInit): Shape {
    const points = init.attributes.get('points');
    if (points !== undefined) {
      const parsed = DiamondProvider.parsePoints(id, points);
      const box = DiamondShape.boundingBoxOf(parsed);
      return new DiamondShape(id, box.x, box.y, box.width, box.height);
    }
    return new DiamondShape(
      id,
      this.readNumber(init, 'x'),
      this.readNumber(init, 'y'),
      this.readSize(init, 'width'),
      this.readSize(init, 'height'),
    );
  }

  private static parsePoints(id: string, text: string): Array<readonly [number, number]> {
    const pairs = text
      .trim()
      .split(/\s+/)
      .filter((token) => token.length > 0)
      .map((token) => {
        const parts = token.split(',');
        if (parts.length !== 2) {
          throw new EditorError(`invalid diamond ${id}: bad point '${token}'`);
        }
        const x = Number(parts[0]);
        const y = Number(parts[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          throw new EditorError(`invalid diamond ${id}: bad point '${token}'`);
        }
        return [x, y] as const;
      });
    if (pairs.length !== 4) {
      throw new EditorError(`invalid diamond ${id}: expected 4 points, got ${pairs.length}`);
    }
    return pairs;
  }
}
