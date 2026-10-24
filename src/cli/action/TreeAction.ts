import type { EditorSession } from '../../app/EditorSession.js';
import { EditorError } from '../../domain/EditorError.js';
import type { ActionContext } from '../ActionContext.js';
import { TreePresenter } from '../presenter/TreePresenter.js';
import type { Runnable } from '../Runnable.js';

/** `tree [id]`：结构树（默认全文档）。 */
export class TreeAction implements Runnable {
  static readonly commandName = 'tree';

  static readonly usage = 'tree [id]';

  static readonly summary = 'print the document tree (or the subtree rooted at <id>)';

  static parse(args: string[], _context: ActionContext): TreeAction {
    if (args.length > 1) {
      throw new EditorError(`usage: ${TreeAction.usage}`);
    }
    return new TreeAction(args[0]);
  }

  private readonly rootId: string | undefined;

  private constructor(rootId: string | undefined) {
    this.rootId = rootId;
  }

  run(session: EditorSession): string[] {
    return new TreePresenter().render(session.document, this.rootId);
  }
}
