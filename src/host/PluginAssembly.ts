import type { ContributionRegistry } from '../plugin-api/ContributionRegistry.js';

/**
 * 装配方式的抽象：代码装配与配置装配都只是"往同一个注册表里装插件"的不同实现。
 *
 * `report` 接收**已经格式化好**的 `error: …` 行（由装配实现决定具体文案），
 * 装配过程不得抛错终止启动——失败的插件只影响自己，主程序继续运行。
 */
export interface PluginAssembly {
  apply(registry: ContributionRegistry, report: (line: string) => void): void | Promise<void>;
}
