import { CircleShape } from '../CircleShape.js';
import type { CreationAttribute } from '../CreationAttribute.js';
import type { Shape } from '../Shape.js';
import type { ShapeInit } from '../ShapeInit.js';
import { ShapeProvider } from './ShapeProvider.js';

/** `circle`：cx cy r [fill]。 */
export class CircleProvider extends ShapeProvider {
  readonly typeName = 'circle';

  readonly svgTag = 'circle';

  readonly creationAttributes: readonly CreationAttribute[] = [
    { name: 'cx', required: true },
    { name: 'cy', required: true },
    { name: 'r', required: true },
    { name: 'fill', required: false },
  ];

  create(id: string, init: ShapeInit): Shape {
    return new CircleShape(
      id,
      this.readNumber(init, 'cx'),
      this.readNumber(init, 'cy'),
      this.readSize(init, 'r'),
    );
  }
}
