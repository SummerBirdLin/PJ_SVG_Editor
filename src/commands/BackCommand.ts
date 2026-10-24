import { EditorError } from '../domain/EditorError.js';
import type { ContainerShape } from '../domain/shape/ContainerShape.js';
import type { Shape } from '../domain/shape/Shape.js';
import { Command } from './Command.js';
import type { CommandContext } from './CommandContext.js';
import type { CommandParseContext } from './CommandParseContext.js';

/** `back <id>`：把图形调到同级最后（父容器 children 开头）。 */
export class BackCommand extends Command {
  static readonly commandName = 'back';

  static readonly usage = 'back <id>';

  static readonly summary = 'send a shape to the back of its sibling order';

  private shape: Shape | null = null;

  private parent: ContainerShape | null = null;

  private oldIndex = -1;

  private constructor(private readonly shapeId: string) {
    super();
  }

  static parse(args: string[], _context: CommandParseContext): BackCommand {
    if (args.length !== 1) {
      throw new EditorError(`usage: ${BackCommand.usage}`);
    }
    return new BackCommand(args[0] ?? '');
  }

  execute(context: CommandContext): string {
    const found = Command.locateOrFail(context.document, this.shapeId);
    this.shape = found.shape;
    this.parent = found.parent;
    this.oldIndex = found.index;
    found.parent.remove(found.shape);
    found.parent.insert(0, found.shape);
    return `${found.shape.label()} moved to back`;
  }

  undo(_context: CommandContext): string {
    const shape = this.shape;
    const parent = this.parent;
    if (shape === null || parent === null) {
      throw new EditorError('cannot undo back: command was never executed');
    }
    parent.remove(shape);
    parent.insert(this.oldIndex, shape);
    return `${shape.label()} moved back to index ${this.oldIndex}`;
  }
}
