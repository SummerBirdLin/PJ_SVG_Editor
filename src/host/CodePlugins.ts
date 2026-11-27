import DirPlugin from '@svgframe/plugin-dir';
import StatsPlugin from '@svgframe/plugin-stats';
import type { PluginModule } from '../plugin-api/PluginContext.js';

/**
 * 方式 A（改代码）的**唯一**装配点：本阶段的可选插件清单。
 *
 * 接入一个新插件 = 在本函数里加一行（`new XxxPlugin(options)`），
 * 不改内核、不改加载器、不改既有插件；配置装配（`plugins.config.json`）则
 * 用模块名 + options 表达同一份清单，两条路经 `activatePlugin` 的同一注册与校验路径。
 */
export function optionalPlugins(): readonly PluginModule[] {
  return [
    new StatsPlugin(),
    new DirPlugin(),
  ];
}
