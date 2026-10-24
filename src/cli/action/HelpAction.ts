import type { EditorSession } from '../../app/EditorSession.js';
import { EditorError } from '../../domain/EditorError.js';
import type { ActionContext } from '../ActionContext.js';
import { HelpPresenter } from '../presenter/HelpPresenter.js';
import type { Runnable } from '../Runnable.js';

/** `help`：显示全部命令与语法；命令表直接来自注册表。 */
export class HelpAction implements Runnable {
  static readonly commandName = 'help';

  static readonly usage = 'help';

  static readonly summary = 'show all commands and their syntax';

  static parse(args: string[], context: ActionContext): HelpAction {
    if (args.length !== 0) {
      throw new EditorError(`usage: ${HelpAction.usage}`);
    }
    return new HelpAction(new HelpPresenter(context.registry));
  }

  private readonly presenter: HelpPresenter;

  private constructor(presenter: HelpPresenter) {
    this.presenter = presenter;
  }

  run(_session: EditorSession): string[] {
    return this.presenter.render();
  }
}
