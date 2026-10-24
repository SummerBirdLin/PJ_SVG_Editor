import type { EditorSession } from '../../app/EditorSession.js';
import { EditorError } from '../../domain/EditorError.js';
import type { ActionContext } from '../ActionContext.js';
import { ShowPresenter } from '../presenter/ShowPresenter.js';
import type { Runnable } from '../Runnable.js';

/** `show <id>`：单个图形的属性明细。 */
export class ShowAction implements Runnable {
  static readonly commandName = 'show';

  static readonly usage = 'show <id>';

  static readonly summary = 'print one shape with its attributes';

  static parse(args: string[], _context: ActionContext): ShowAction {
    if (args.length !== 1) {
      throw new EditorError(`usage: ${ShowAction.usage}`);
    }
    return new ShowAction(args[0] ?? '');
  }

  private readonly shapeId: string;

  private constructor(shapeId: string) {
    this.shapeId = shapeId;
  }

  run(session: EditorSession): string[] {
    return new ShowPresenter().render(session.document, this.shapeId);
  }
}
