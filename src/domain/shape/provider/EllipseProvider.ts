import { EllipseShape } from '../EllipseShape.js';
import type { CreationAttribute } from '../CreationAttribute.js';
import type { Shape } from '../Shape.js';
import type { ShapeInit } from '../ShapeInit.js';
import { ShapeProvider } from './ShapeProvider.js';

/** `ellipse`：cx cy rx ry [fill]。 */
export class EllipseProvider extends ShapeProvider {
  readonly typeName = 'ellipse';

  readonly svgTag = 'ellipse';

  readonly creationAttributes: readonly CreationAttribute[] = [
    { name: 'cx', required: true },
    { name: 'cy', required: true },
    { name: 'rx', required: true },
    { name: 'ry', required: true },
    { name: 'fill', required: false },
  ];

  create(id: string, init: ShapeInit): Shape {
    return new EllipseShape(
      id,
      this.readNumber(init, 'cx'),
      this.readNumber(init, 'cy'),
      this.readSize(init, 'rx'),
      this.readSize(init, 'ry'),
    );
  }
}
