import type { PluginContext } from '../../../src/plugin-api/index.js';
import { StatsCommand } from './StatsCommand.js';

/**
 * `@svgframe/plugin-stats`：以插件形式提供 `stats` 命令。
 *
 * 默认导出是**类**——配置装配时用它接收 `options`（本插件暂不读取任何选项），
 * 代码装配时组合根直接 `new StatsPlugin()`；两条路注册的是同一个 `StatsCommand`。
 */
export default class StatsPlugin {
  readonly name = '@svgframe/plugin-stats';

  activate(context: PluginContext): void {
    context.registerCommand(new StatsCommand());
  }
}

export { StatsCommand };
export { StatsCounter } from './StatsCounter.js';
