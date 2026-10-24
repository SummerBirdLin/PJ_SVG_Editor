import type { EditorSession } from '../../app/EditorSession.js';
import { EditorError } from '../../domain/EditorError.js';
import type { ActionContext } from '../ActionContext.js';
import type { Runnable } from '../Runnable.js';

/** `redo`：重做；撤销后若有新编辑，redo 栈已被清空。 */
export class RedoAction implements Runnable {
  static readonly commandName = 'redo';

  static readonly usage = 'redo';

  static readonly summary = 'redo the last undone edit command';

  static parse(args: string[], _context: ActionContext): RedoAction {
    if (args.length !== 0) {
      throw new EditorError(`usage: ${RedoAction.usage}`);
    }
    return new RedoAction();
  }

  run(session: EditorSession): string[] {
    return [session.redo()];
  }
}
