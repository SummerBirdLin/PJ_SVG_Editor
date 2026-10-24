import { EditorError } from '../domain/EditorError.js';
import type { ContainerShape } from '../domain/shape/ContainerShape.js';
import type { Shape } from '../domain/shape/Shape.js';
import { Command } from './Command.js';
import type { CommandContext } from './CommandContext.js';
import type { CommandParseContext } from './CommandParseContext.js';

/** `front <id>`：把图形调到同级最前（父容器 children 末尾）。 */
export class FrontCommand extends Command {
  static readonly commandName = 'front';

  static readonly usage = 'front <id>';

  static readonly summary = 'bring a shape to the front of its sibling order';

  private shape: Shape | null = null;

  private parent: ContainerShape | null = null;

  private oldIndex = -1;

  private constructor(private readonly shapeId: string) {
    super();
  }

  static parse(args: string[], _context: CommandParseContext): FrontCommand {
    if (args.length !== 1) {
      throw new EditorError(`usage: ${FrontCommand.usage}`);
    }
    return new FrontCommand(args[0] ?? '');
  }

  execute(context: CommandContext): string {
    const found = Command.locateOrFail(context.document, this.shapeId);
    this.shape = found.shape;
    this.parent = found.parent;
    this.oldIndex = found.index;
    found.parent.remove(found.shape);
    found.parent.insert(found.parent.childCount(), found.shape);
    return `${found.shape.label()} moved to front`;
  }

  undo(_context: CommandContext): string {
    const shape = this.shape;
    const parent = this.parent;
    if (shape === null || parent === null) {
      throw new EditorError('cannot undo front: command was never executed');
    }
    parent.remove(shape);
    parent.insert(this.oldIndex, shape);
    return `${shape.label()} moved back to index ${this.oldIndex}`;
  }
}
