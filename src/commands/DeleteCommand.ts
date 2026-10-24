import { EditorError } from '../domain/EditorError.js';
import type { ContainerShape } from '../domain/shape/ContainerShape.js';
import type { Shape } from '../domain/shape/Shape.js';
import { Command } from './Command.js';
import type { CommandContext } from './CommandContext.js';
import type { CommandParseContext } from './CommandParseContext.js';

/** `delete <id>`：容器则连同全部子孙一起删除（一个 undo 单元）。 */
export class DeleteCommand extends Command {
  static readonly commandName = 'delete';

  static readonly usage = 'delete <id>';

  static readonly summary = 'delete a shape (a container takes all descendants with it)';

  private removedShape: Shape | null = null;

  private oldParent: ContainerShape | null = null;

  private oldIndex = -1;

  private constructor(private readonly shapeId: string) {
    super();
  }

  static parse(args: string[], _context: CommandParseContext): DeleteCommand {
    if (args.length !== 1) {
      throw new EditorError(`usage: ${DeleteCommand.usage}`);
    }
    return new DeleteCommand(args[0] ?? '');
  }

  execute(context: CommandContext): string {
    const found = Command.locateOrFail(context.document, this.shapeId);
    found.parent.remove(found.shape);
    this.removedShape = found.shape;
    this.oldParent = found.parent;
    this.oldIndex = found.index;
    return `${found.shape.label()} deleted`;
  }

  undo(_context: CommandContext): string {
    const shape = this.removedShape;
    const parent = this.oldParent;
    if (shape === null || parent === null) {
      throw new EditorError('cannot undo delete: command was never executed');
    }
    parent.insert(this.oldIndex, shape);
    return `${shape.label()} restored into ${parent.label()}`;
  }
}
