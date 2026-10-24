import { RectShape } from '../RectShape.js';
import type { CreationAttribute } from '../CreationAttribute.js';
import type { Shape } from '../Shape.js';
import type { ShapeInit } from '../ShapeInit.js';
import { ShapeProvider } from './ShapeProvider.js';

/** `rect`：x y width height [fill]。 */
export class RectProvider extends ShapeProvider {
  readonly typeName = 'rect';

  readonly svgTag = 'rect';

  readonly creationAttributes: readonly CreationAttribute[] = [
    { name: 'x', required: true },
    { name: 'y', required: true },
    { name: 'width', required: true },
    { name: 'height', required: true },
    { name: 'fill', required: false },
  ];

  create(id: string, init: ShapeInit): Shape {
    return new RectShape(
      id,
      this.readNumber(init, 'x'),
      this.readNumber(init, 'y'),
      this.readSize(init, 'width'),
      this.readSize(init, 'height'),
    );
  }
}
