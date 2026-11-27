import type { PluginContext } from '../../../src/plugin-api/index.js';
import { ModifiedStarDecorator } from './ModifiedStarDecorator.js';

/**
 * `@svgframe/plugin-tree-star`：以插件形式提供 `modified-star` 树标签。
 *
 * 它只实现 `TreeDecorator` 这一个扩展点，与 `(box)` 标签互不感知：
 * 两者各自维护自己的状态、各自决定加不加标签，内核只按注册顺序拼接。
 */
export default class TreeStarPlugin {
  readonly name = '@svgframe/plugin-tree-star';

  activate(context: PluginContext): void {
    context.registerTreeDecorator(new ModifiedStarDecorator());
  }
}

export { ModifiedStarDecorator } from './ModifiedStarDecorator.js';
