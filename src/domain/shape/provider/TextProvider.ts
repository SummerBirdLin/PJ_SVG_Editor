import { TextShape } from '../TextShape.js';
import type { CreationAttribute } from '../CreationAttribute.js';
import type { Shape } from '../Shape.js';
import type { ShapeInit } from '../ShapeInit.js';
import { ShapeProvider } from './ShapeProvider.js';

/** `text`：x y "content"。 */
export class TextProvider extends ShapeProvider {
  readonly typeName = 'text';

  readonly svgTag = 'text';

  readonly creationAttributes: readonly CreationAttribute[] = [
    { name: 'x', required: true },
    { name: 'y', required: true },
  ];

  override readonly hasTextContent = true;

  create(id: string, init: ShapeInit): Shape {
    return new TextShape(id, this.readNumber(init, 'x'), this.readNumber(init, 'y'), init.textContent ?? '');
  }
}
