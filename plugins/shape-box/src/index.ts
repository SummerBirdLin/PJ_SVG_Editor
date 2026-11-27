import type { PluginContext } from '../../../src/plugin-api/index.js';
import { BoxAttributesHandler } from './BoxAttributesHandler.js';
import { BoxProvider } from './BoxProvider.js';
import { BoxTypeLabelDecorator } from './BoxTypeLabelDecorator.js';

/**
 * `@svgframe/plugin-shape-box`：一次提供三类扩展（图形 + 属性语义 + 树标签）。
 *
 * 这正是"同一个插件包可以同时贡献多个扩展点"的例子：内核看不出这三者来自同一包，
 * 它们各自经 `registerShape` / `registerAttributeHandler` / `registerTreeDecorator` 进入注册表。
 */
export default class ShapeBoxPlugin {
  readonly name = '@svgframe/plugin-shape-box';

  activate(context: PluginContext): void {
    context.registerShape(new BoxProvider());
    context.registerAttributeHandler(new BoxAttributesHandler());
    context.registerTreeDecorator(new BoxTypeLabelDecorator());
  }
}

export { BoxAttributesHandler } from './BoxAttributesHandler.js';
export { BoxProvider } from './BoxProvider.js';
export { BoxShape } from './BoxShape.js';
export { BoxTypeLabelDecorator } from './BoxTypeLabelDecorator.js';
