import type { ContributionRegistry } from '../plugin-api/ContributionRegistry.js';
import type { PluginModule } from '../plugin-api/PluginContext.js';
import type { PluginAssembly } from './PluginAssembly.js';
import { activatePlugin, describeActivationFailure, pluginNameOf } from './PluginActivation.js';

/**
 * 方式 A：**改代码**装配。
 *
 * 组合根把插件模块直接交给本类（类型检查完整、调试直接），
 * 装配失败同样走统一文案并继续启动；接入新插件 = 在组合根的列表里加一行。
 */
export class CodeAssembly implements PluginAssembly {
  private readonly plugins: readonly PluginModule[];

  constructor(plugins: readonly PluginModule[]) {
    this.plugins = plugins;
  }

  apply(registry: ContributionRegistry, report: (line: string) => void): void {
    for (const plugin of this.plugins) {
      const fallbackName = pluginNameOf(plugin, '<anonymous>');
      try {
        activatePlugin(registry, plugin, fallbackName);
      } catch (error) {
        report(describeActivationFailure(fallbackName, error));
      }
    }
  }
}
