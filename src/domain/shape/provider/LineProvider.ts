import { LineShape } from '../LineShape.js';
import type { CreationAttribute } from '../CreationAttribute.js';
import type { Shape } from '../Shape.js';
import type { ShapeInit } from '../ShapeInit.js';
import { ShapeProvider } from './ShapeProvider.js';

/** `line`：x1 y1 x2 y2 [stroke]。 */
export class LineProvider extends ShapeProvider {
  readonly typeName = 'line';

  readonly svgTag = 'line';

  readonly creationAttributes: readonly CreationAttribute[] = [
    { name: 'x1', required: true },
    { name: 'y1', required: true },
    { name: 'x2', required: true },
    { name: 'y2', required: true },
    { name: 'stroke', required: false },
  ];

  create(id: string, init: ShapeInit): Shape {
    return new LineShape(
      id,
      this.readNumber(init, 'x1'),
      this.readNumber(init, 'y1'),
      this.readNumber(init, 'x2'),
      this.readNumber(init, 'y2'),
    );
  }
}
