import type { Shape } from '../../../../src/domain/shape/Shape.js';
import { RectShape } from '../../../../src/domain/shape/RectShape.js';

/** 注册一个与内置 `rect` 同名的图形类型：应报 duplicate registration: shapes/rect。 */
export default {
  activate(context: { registerShape(provider: unknown): void }): void {
    context.registerShape({
      typeName: 'rect',
      svgTag: 'rect',
      creationAttributes: [],
      create: (id: string): Shape => new RectShape(id),
    });
  },
};
