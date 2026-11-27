import type {
  CommandContribution,
  CommandEnvironment,
  CommandInvocation,
} from '../plugin-api/index.js';
import type { Command } from './Command.js';
import type { CommandParseContext } from './CommandParseContext.js';

/** 编辑命令类的静态侧（create/move/…）：插件用它在注册表里登记一条命令。 */
export interface EditCommandStatic {
  readonly commandName: string;

  readonly usage: string;

  readonly summary: string;

  parse(args: string[], context: CommandParseContext): Command;
}

/**
 * 编辑命令 → 命令扩展点的**适配器**。
 *
 * 命令层只认识 `CommandParseContext`；这里把"一条命令"接到插件 API 的
 * `CommandContribution` 上，使内置的 10 条编辑命令与第三方命令走同一条注册路径
 * （同一份冲突校验、同一个 undo 栈）。执行时只调用 `host.commitEdit`，
 * 因此本适配器不需要知道 `EditorSession` 的存在。
 */
export class EditCommandContribution implements CommandContribution {
  private readonly commandClass: EditCommandStatic;

  constructor(commandClass: EditCommandStatic) {
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

  create(args: string[], environment: CommandEnvironment): CommandInvocation {
    const command = this.commandClass.parse(args, { shapes: environment.shapes });
    return {
      run: (host) => [host.commitEdit(command)],
    };
  }
}
