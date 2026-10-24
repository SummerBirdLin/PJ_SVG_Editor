import { CreateCommand } from '../commands/CreateCommand.js';
import { DeleteCommand } from '../commands/DeleteCommand.js';
import { MoveCommand } from '../commands/MoveCommand.js';
import { ScaleCommand } from '../commands/ScaleCommand.js';
import { SetCommand } from '../commands/SetCommand.js';
import { GroupCommand } from '../commands/GroupCommand.js';
import { UngroupCommand } from '../commands/UngroupCommand.js';
import { AddToCommand } from '../commands/AddToCommand.js';
import { FrontCommand } from '../commands/FrontCommand.js';
import { BackCommand } from '../commands/BackCommand.js';
import { EditorError } from '../domain/EditorError.js';
import type { ShapeFactory } from '../domain/shape/ShapeFactory.js';
import { ActionEntry } from './ActionEntry.js';
import type { ActionContext } from './ActionContext.js';
import { InitAction } from './action/InitAction.js';
import { ReadAction } from './action/ReadAction.js';
import { SaveAction } from './action/SaveAction.js';
import { CanvasAction } from './action/CanvasAction.js';
import { TreeAction } from './action/TreeAction.js';
import { ShowAction } from './action/ShowAction.js';
import { HelpAction } from './action/HelpAction.js';
import { UndoAction } from './action/UndoAction.js';
import { RedoAction } from './action/RedoAction.js';
import { EditCommandEntry } from './EditCommandEntry.js';
import type { CommandEntry } from './CommandEntry.js';
import type { Runnable } from './Runnable.js';

/**
 * 命令注册表：**命令名分派（需求允许的两处之一，另一处是 ShapeFactory）**，已标注为待重构。
 *
 * 19 条命令全部登记在这里：4 个文档命令 + 10 个编辑命令 + 3 个显示命令 + undo/redo。
 * Repl 因此不需要任何 `if/else` 特判，`help` 也直接由这张表生成。
 */
export class CommandRegistry {
  private readonly shapes: ShapeFactory;

  private readonly entries = new Map<string, CommandEntry>();

  private readonly ordered: CommandEntry[] = [];

  constructor(shapes: ShapeFactory) {
    this.shapes = shapes;
    const entries: readonly CommandEntry[] = [
      new ActionEntry(InitAction),
      new ActionEntry(ReadAction),
      new ActionEntry(SaveAction),
      new ActionEntry(CanvasAction),
      new EditCommandEntry(CreateCommand),
      new EditCommandEntry(DeleteCommand),
      new EditCommandEntry(MoveCommand),
      new EditCommandEntry(ScaleCommand),
      new EditCommandEntry(SetCommand),
      new EditCommandEntry(GroupCommand),
      new EditCommandEntry(UngroupCommand),
      new EditCommandEntry(AddToCommand),
      new EditCommandEntry(FrontCommand),
      new EditCommandEntry(BackCommand),
      new ActionEntry(TreeAction),
      new ActionEntry(ShowAction),
      new ActionEntry(HelpAction),
      new ActionEntry(UndoAction),
      new ActionEntry(RedoAction),
    ];
    for (const entry of entries) {
      this.entries.set(entry.commandName, entry);
      this.ordered.push(entry);
    }
  }

  parseAndCreate(commandName: string, args: string[]): Runnable {
    const entry = this.entries.get(commandName);
    if (entry === undefined) {
      throw new EditorError(`unknown command: ${commandName}`);
    }
    return entry.parse(args, this.context());
  }

  entriesList(): readonly CommandEntry[] {
    return this.ordered;
  }

  private context(): ActionContext {
    return { shapes: this.shapes, registry: this };
  }
}
