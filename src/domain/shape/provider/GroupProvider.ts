import { GShape } from '../GShape.js';
import type { CreationAttribute } from '../CreationAttribute.js';
import type { Shape } from '../Shape.js';
import type { ShapeInit } from '../ShapeInit.js';
import { ShapeProvider } from './ShapeProvider.js';

/** `g`：空容器 `create g <id>`，之后用 `in` / `addto` / `group` 填充。 */
export class GroupProvider extends ShapeProvider {
  readonly typeName = 'g';

  readonly svgTag = 'g';

  readonly creationAttributes: readonly CreationAttribute[] = [];

  create(id: string, _init: ShapeInit): Shape {
    return new GShape(id);
  }
}
