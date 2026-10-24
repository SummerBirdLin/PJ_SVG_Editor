import type { ActionContext } from './ActionContext.js';
import type { Runnable } from './Runnable.js';

/** 会话级动作类的静态侧（init/read/save/…）：用统一协议接入同一张命令表。 */
export interface ActionStatic {
  readonly commandName: string;

  readonly usage: string;

  readonly summary: string;

  parse(args: string[], context: ActionContext): Runnable;
}
