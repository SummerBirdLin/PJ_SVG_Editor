import type { CommandParseContext } from '../commands/CommandParseContext.js';
import type { Command } from '../commands/Command.js';
import type { ActionContext } from './ActionContext.js';
import type { CommandEntry } from './CommandEntry.js';
import { EditAction } from './action/EditAction.js';
import type { EditCommandClass } from './EditCommandClass.js';
import type { Runnable } from './Runnable.js';

/**
 * 编辑命令 → 注册表条目的适配器（Adapter）：
 * 命令层只认识 `CommandParseContext`，这里把它接到 CLI 的 `ActionContext`。
 */
export class EditCommandEntry implements CommandEntry {
  private readonly commandClass: EditCommandClass;

  constructor(commandClass: EditCommandClass) {
    this.commandClass = commandClass;
  }

  get commandName(): string {
    return this.commandClass.commandName;
  }

  get usage(): string {
    return this.commandClass.usage;
  }

  get summary(): string {
    return this.commandClass.summary;
  }

  parse(args: string[], context: ActionContext): Runnable {
    const parseContext: CommandParseContext = { shapes: context.shapes };
    const command = this.commandClass.parse(args, parseContext);
    return new EditAction(command);
  }
}
