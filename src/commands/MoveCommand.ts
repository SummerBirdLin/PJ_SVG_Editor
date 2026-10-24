import { EditorError } from '../domain/EditorError.js';
import { NumberFormat } from '../domain/NumberFormat.js';
import { ContainerShape } from '../domain/shape/ContainerShape.js';
import { Command } from './Command.js';
import type { CommandContext } from './CommandContext.js';
import type { CommandParseContext } from './CommandParseContext.js';

/**
 * `move <id> <dx> <dy>`：增量平移。
 * 叶子回显终点位置（`moved to (x,y)`），容器回显位移（`moved by (dx,dy)`）——
 * 与需求 transcript 的两种句式一致。
 */
export class MoveCommand extends Command {
  static readonly commandName = 'move';

  static readonly usage = 'move <id> <dx> <dy>';

  static readonly summary = 'translate a shape (or a whole container) by (dx, dy)';

  private constructor(
    private readonly shapeId: string,
    private readonly dx: number,
    private readonly dy: number,
  ) {
    super();
  }

  static parse(args: string[], _context: CommandParseContext): MoveCommand {
    if (args.length !== 3) {
      throw new EditorError(`usage: ${MoveCommand.usage}`);
    }
    return new MoveCommand(
      args[0] ?? '',
      NumberFormat.parse(args[1] ?? ''),
      NumberFormat.parse(args[2] ?? ''),
    );
  }

  execute(context: CommandContext): string {
    const found = Command.locateOrFail(context.document, this.shapeId);
    found.shape.move(this.dx, this.dy);
    if (found.shape instanceof ContainerShape) {
      return `${found.shape.label()} moved by `
        + `(${NumberFormat.format(this.dx)},${NumberFormat.format(this.dy)})`;
    }
    return `${found.shape.label()} moved to ${found.shape.positionText()}`;
  }

  undo(context: CommandContext): string {
    const found = Command.locateOrFail(context.document, this.shapeId);
    found.shape.move(-this.dx, -this.dy);
    if (found.shape instanceof ContainerShape) {
      return `${found.shape.label()} moved back by `
        + `(${NumberFormat.format(-this.dx)},${NumberFormat.format(-this.dy)})`;
    }
    return `${found.shape.label()} moved back to ${found.shape.positionText()}`;
  }
}
