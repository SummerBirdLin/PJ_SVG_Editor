import type { ActionContext } from './ActionContext.js';
import type { ActionStatic } from './ActionStatic.js';
import type { CommandEntry } from './CommandEntry.js';
import type { Runnable } from './Runnable.js';

/** 会话级动作 → 注册表条目的适配器；动作类自身负责参数解析。 */
export class ActionEntry implements CommandEntry {
  private readonly actionClass: ActionStatic;

  constructor(actionClass: ActionStatic) {
    this.actionClass = actionClass;
  }

  get commandName(): string {
    return this.actionClass.commandName;
  }

  get usage(): string {
    return this.actionClass.usage;
  }

  get summary(): string {
    return this.actionClass.summary;
  }

  parse(args: string[], context: ActionContext): Runnable {
    return this.actionClass.parse(args, context);
  }
}
