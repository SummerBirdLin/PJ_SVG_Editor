import type { EditorSession } from '../../app/EditorSession.js';
import { EditorError } from '../../domain/EditorError.js';
import type { ActionContext } from '../ActionContext.js';
import type { Runnable } from '../Runnable.js';

/** `read <file.svg>`：读入 SVG 作为当前文档；告警先于结果行输出。 */
export class ReadAction implements Runnable {
  static readonly commandName = 'read';

  static readonly usage = 'read <file.svg>';

  static readonly summary = 'load an SVG file as the current document';

  static parse(args: string[], _context: ActionContext): ReadAction {
    if (args.length !== 1) {
      throw new EditorError(`usage: ${ReadAction.usage}`);
    }
    return new ReadAction(args[0] ?? '');
  }

  private readonly path: string;

  private constructor(path: string) {
    this.path = path;
  }

  run(session: EditorSession): string[] {
    return session.read(this.path);
  }
}
