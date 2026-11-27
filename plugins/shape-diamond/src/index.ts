import type { PluginContext } from '../../../src/plugin-api/index.js';
import { DiamondProvider } from './DiamondProvider.js';

/**
 * `@svgframe/plugin-shape-diamond`（可选拓展任务）：
 * 只贡献一个 `ShapeProvider`，却同时获得 `create`/`tree`/`show`/`set x|y|width|height`/
 * `move`/`scale`/`save`/`read` 的全部行为——这正是"扩展点选在变化轴上"的收益。
 */
export default class ShapeDiamondPlugin {
  readonly name = '@svgframe/plugin-shape-diamond';

  activate(context: PluginContext): void {
    context.registerShape(new DiamondProvider());
  }
}

export { DiamondProvider } from './DiamondProvider.js';
export { DiamondShape } from './DiamondShape.js';
