import type { EditorSession } from '../../app/EditorSession.js';
import { EditorError } from '../../domain/EditorError.js';
import type { ActionContext } from '../ActionContext.js';
import type { Runnable } from '../Runnable.js';

/** `undo`：撤销上一次编辑命令；IO 命令之后被闸门拒绝。 */
export class UndoAction implements Runnable {
  static readonly commandName = 'undo';

  static readonly usage = 'undo';

  static readonly summary = 'undo the last edit command';

  static parse(args: string[], _context: ActionContext): UndoAction {
    if (args.length !== 0) {
      throw new EditorError(`usage: ${UndoAction.usage}`);
    }
    return new UndoAction();
  }

  run(session: EditorSession): string[] {
    return [session.undo()];
  }
}
