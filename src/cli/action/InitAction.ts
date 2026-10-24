import type { EditorSession } from '../../app/EditorSession.js';
import { EditorError } from '../../domain/EditorError.js';
import { NumberFormat } from '../../domain/NumberFormat.js';
import type { ActionContext } from '../ActionContext.js';
import type { Runnable } from '../Runnable.js';

/** `init [w] [h]`：新建空画布（默认 800×600）。 */
export class InitAction implements Runnable {
  static readonly commandName = 'init';

  static readonly usage = 'init [w] [h]';

  static readonly summary = 'create a new empty canvas (default 800x600)';

  static parse(args: string[], _context: ActionContext): InitAction {
    if (args.length > 2) {
      throw new EditorError(`usage: ${InitAction.usage}`);
    }
    const width = args[0] === undefined ? 800 : NumberFormat.parse(args[0]);
    const height = args[1] === undefined ? 600 : NumberFormat.parse(args[1]);
    return new InitAction(width, height);
  }

  private readonly width: number;

  private readonly height: number;

  private constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  run(session: EditorSession): string[] {
    return [session.init(this.width, this.height)];
  }
}
