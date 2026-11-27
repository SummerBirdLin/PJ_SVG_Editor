import { EditorError } from '../domain/EditorError.js';
import type { ShapeFactory } from '../domain/shape/ShapeFactory.js';
import type { CommandCatalog } from '../plugin-api/CommandContribution.js';
import type { TreeDecorator } from '../plugin-api/TreeDecorator.js';
import type { ActionContext } from './ActionContext.js';
import { PluginCommandEntry } from './PluginCommandEntry.js';
import type { CommandEntry } from './CommandEntry.js';
import type { Runnable } from './Runnable.js';

/**
 * 命令注册表：**命令名 → 条目**的唯一分派点，也是 `help` 的数据源。
 *
 * 阶段 2 起本类不再硬编码任何命令名：
 * - 9 条**会话动作**（init/read/save/canvas/tree/show/help/undo/redo）由装配处注入——
 *   它们需要完整会话门面，因此不属于"插件命令"这一扩展点；
 * - 10 条**编辑命令**与第三方命令都来自插件目录（`CommandCatalog`），
 *   经 `PluginCommandEntry` 适配成同一种条目，因此冲突校验、`help` 与分派只有一条路。
 */
export class CommandRegistry {
  private readonly shapes: ShapeFactory;

  private readonly entries = new Map<string, CommandEntry>();

  private readonly ordered: CommandEntry[] = [];

  private readonly decoratorsValue: readonly TreeDecorator[];

  constructor(shapes: ShapeFactory, entries: readonly CommandEntry[], decorators: readonly TreeDecorator[]) {
    this.shapes = shapes;
    this.decoratorsValue = decorators;
    for (const entry of entries) {
      this.add(entry);
    }
  }

  parseAndCreate(commandName: string, args: string[]): Runnable {
    const entry = this.entries.get(commandName);
    if (entry === undefined) {
      throw new EditorError(`unknown command: ${commandName}`);
    }
    return entry.parse(args, this.context());
  }

  entriesList(): readonly CommandEntry[] {
    return this.ordered;
  }

  decorators(): readonly TreeDecorator[] {
    return this.decoratorsValue;
  }

  /** 命令名冲突在校验阶段就拒绝（装配期就报错，而不是等到运行期静默覆盖）。 */
  private add(entry: CommandEntry): void {
    if (this.entries.has(entry.commandName)) {
      throw new EditorError(`duplicate command: ${entry.commandName}`);
    }
    this.entries.set(entry.commandName, entry);
    this.ordered.push(entry);
  }

  private context(): ActionContext {
    return { shapes: this.shapes, registry: this, decorators: this.decoratorsValue };
  }
}
