import type { ActionContext } from './ActionContext.js';
import type { Runnable } from './Runnable.js';

/** 命令注册表里的一条：名字 + 用法 + 摘要 + 语法解析入口。 */
export interface CommandEntry {
  readonly commandName: string;

  readonly usage: string;

  readonly summary: string;

  parse(args: string[], context: ActionContext): Runnable;
}
