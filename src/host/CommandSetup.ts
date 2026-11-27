import type { CommandRegistry } from '../cli/CommandRegistry.js';
import { CommandRegistry as Registry } from '../cli/CommandRegistry.js';
import { PluginCommandEntry } from '../cli/PluginCommandEntry.js';
import type { CommandEntry } from '../cli/CommandEntry.js';
import type { ShapeFactory } from '../domain/shape/ShapeFactory.js';
import type { ContributionRegistry } from '../plugin-api/ContributionRegistry.js';
import type { TreeDecorator } from '../plugin-api/TreeDecorator.js';
import { displaySessionActions, documentSessionActions } from './SessionActions.js';

/**
 * 装配处决定**命令表的顺序与来源**（注册表只做查重与分派）：
 *
 * 1. 文档命令（init/read/save/canvas）——宿主会话动作；
 * 2. 编辑命令与第三方命令——全部来自插件目录（`CommandCatalog`），顺序 = 注册顺序；
 * 3. 显示/撤销命令（tree/show/help/undo/redo）——宿主会话动作。
 *
 * 这个顺序就是阶段 1 的 `help` 输出顺序，因此插件化之后 `help` 逐字节不变。
 */
export function createCommandRegistry(
  shapes: ShapeFactory,
  contributions: ContributionRegistry,
  decorators: readonly TreeDecorator[],
): CommandRegistry {
  const pluginEntries: CommandEntry[] = contributions
    .commands()
    .map((contribution) => new PluginCommandEntry(contribution, { shapes }));
  const entries: CommandEntry[] = [
    ...documentSessionActions(),
    ...pluginEntries,
    ...displaySessionActions(),
  ];
  return new Registry(shapes, entries, decorators);
}
