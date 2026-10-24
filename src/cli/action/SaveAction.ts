import type { EditorSession } from '../../app/EditorSession.js';
import { EditorError } from '../../domain/EditorError.js';
import type { ActionContext } from '../ActionContext.js';
import type { Runnable } from '../Runnable.js';

/** `save [file.svg]`：保存当前文档；无参数时存回读入时的路径。 */
export class SaveAction implements Runnable {
  static readonly commandName = 'save';

  static readonly usage = 'save [file.svg]';

  static readonly summary = 'write the current document (defaults to the path it was read from)';

  static parse(args: string[], _context: ActionContext): SaveAction {
    if (args.length > 1) {
      throw new EditorError(`usage: ${SaveAction.usage}`);
    }
    return new SaveAction(args[0]);
  }

  private readonly path: string | undefined;

  private constructor(path: string | undefined) {
    this.path = path;
  }

  run(session: EditorSession): string[] {
    return [session.save(this.path)];
  }
}
