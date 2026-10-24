import type { Command } from '../commands/Command.js';
import type { CommandParseContext } from '../commands/CommandParseContext.js';

/** 编辑命令类的静态侧（create/move/…）：供注册表统一构造。 */
export interface EditCommandClass {
  readonly commandName: string;

  readonly usage: string;

  readonly summary: string;

  parse(args: string[], context: CommandParseContext): Command;
}
