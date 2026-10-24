import type { EditorSession } from '../../app/EditorSession.js';
import type { Command } from '../../commands/Command.js';
import type { Runnable } from '../Runnable.js';

/** 把一条编辑命令适配成注册表可执行的动作（命令层不依赖 session）。 */
export class EditAction implements Runnable {
  private readonly command: Command;

  constructor(command: Command) {
    this.command = command;
  }

  run(session: EditorSession): string[] {
    return [session.execute(this.command)];
  }
}
