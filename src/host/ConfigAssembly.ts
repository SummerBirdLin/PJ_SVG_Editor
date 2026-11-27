import { dirname } from 'node:path';
import type { ContributionRegistry } from '../plugin-api/ContributionRegistry.js';
import type { PluginAssembly } from './PluginAssembly.js';
import { activatePlugin, describeActivationFailure, reasonOf } from './PluginActivation.js';
import { parsePluginConfig, type PluginConfig } from './PluginConfig.js';
import {
  PluginModuleEvaluationError,
  PluginModuleNotFoundError,
  PluginModuleResolver,
  PluginNoDefaultExportError,
} from './PluginModuleResolver.js';

/**
 * 方式 B：**改配置**装配。
 *
 * 只读 `plugins.config.json`：按数组顺序加载，`enabled: false` 完全跳过，
 * `options` 原样传给插件类构造函数；四类失败各自打印规定的 `error:` 文案后继续启动。
 * 本类不认识任何具体插件（无导入、无名字映射、无分支），接入新插件只改配置。
 */
export class ConfigAssembly implements PluginAssembly {
  private readonly configPath: string;

  private readonly readText: (path: string) => string;

  constructor(configPath: string, readText: (path: string) => string) {
    this.configPath = configPath;
    this.readText = readText;
  }

  async apply(registry: ContributionRegistry, report: (line: string) => void): Promise<void> {
    const config = this.loadConfig(report);
    if (config === null) {
      return;
    }
    const resolver = new PluginModuleResolver(dirname(this.configPath));
    for (const entry of config.plugins) {
      if (entry.enabled === false) {
        continue;
      }
      let loaded;
      try {
        loaded = await resolver.load(entry.module, entry.options);
      } catch (error) {
        report(this.describeLoadFailure(entry.module, error));
        continue;
      }
      try {
        activatePlugin(registry, loaded.plugin, loaded.pluginName);
      } catch (error) {
        report(describeActivationFailure(loaded.pluginName, error));
      }
    }
  }

  /** 配置缺失/语法不合法 → 打印一行并按"默认内置能力"继续。 */
  private loadConfig(report: (line: string) => void): PluginConfig | null {
    let text: string;
    try {
      text = this.readText(this.configPath);
    } catch {
      report('error: invalid plugin config');
      return null;
    }
    try {
      return parsePluginConfig(JSON.parse(text));
    } catch {
      report('error: invalid plugin config');
      return null;
    }
  }

  private describeLoadFailure(moduleSpecifier: string, error: unknown): string {
    if (error instanceof PluginModuleNotFoundError) {
      return `error: plugin not found: ${moduleSpecifier}`;
    }
    if (error instanceof PluginNoDefaultExportError) {
      return `error: plugin has no default export: ${moduleSpecifier}`;
    }
    if (error instanceof PluginModuleEvaluationError) {
      // "模块存在但求值或其依赖失败"属于加载失败，不能误报成顶层模块找不到
      return `error: plugin failed to activate: ${moduleSpecifier} (${error.reason})`;
    }
    return `error: plugin failed to activate: ${moduleSpecifier} (${reasonOf(error)})`;
  }
}
