import type { PluginContext } from '../../../../src/plugin-api/index.js';
import type { ShapeProvider } from '../../../../src/domain/shape/provider/ShapeProvider.js';
import type { AttributeHandler } from '../../../../src/plugin-api/AttributeHandler.js';
import type { CommandContribution } from '../../../../src/plugin-api/CommandContribution.js';
import type { TreeDecorator } from '../../../../src/plugin-api/TreeDecorator.js';

/**
 * 只实现 `PluginContext` 的测试替身：记录插件注册了什么，不做任何校验。
 * 这样插件测试不依赖注册表实现，也不需要装别的插件（满足"插件测试可独立运行"）。
 */
export class FakePluginContext implements PluginContext {
  readonly pluginName = 'test-plugin-context';

  readonly shapes: ShapeProvider[] = [];

  readonly commands: CommandContribution[] = [];

  readonly decorators: TreeDecorator[] = [];

  readonly handlers: AttributeHandler[] = [];

  registerShape(provider: ShapeProvider): void {
    this.shapes.push(provider);
  }

  registerCommand(command: CommandContribution): void {
    this.commands.push(command);
  }

  registerTreeDecorator(decorator: TreeDecorator): void {
    this.decorators.push(decorator);
  }

  registerAttributeHandler(handler: AttributeHandler): void {
    this.handlers.push(handler);
  }
}
