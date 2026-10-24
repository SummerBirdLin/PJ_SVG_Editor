import { EditorError } from '../domain/EditorError.js';
import { NumberFormat } from '../domain/NumberFormat.js';
import { ContainerShape } from '../domain/shape/ContainerShape.js';
import type { AttributeEntry, Shape } from '../domain/shape/Shape.js';
import { Command } from './Command.js';
import type { CommandContext } from './CommandContext.js';
import type { CommandParseContext } from './CommandParseContext.js';

/**
 * `scale <id> <factor>`：等比缩放，factor 同乘到全部几何属性（位置与尺寸）。
 * 容器递归到每个子孙。undo 用"子树旧几何"精确还原，而不是按 1/factor 反算，避免浮点漂移。
 */
export class ScaleCommand extends Command {
  static readonly commandName = 'scale';

  static readonly usage = 'scale <id> <factor>';

  static readonly summary = 'scale a shape (or a whole container) by a positive factor';

  private readonly snapshots = new Map<Shape, AttributeEntry[]>();

  private constructor(
    private readonly shapeId: string,
    private readonly factor: number,
  ) {
    super();
  }

  static parse(args: string[], _context: CommandParseContext): ScaleCommand {
    if (args.length !== 2) {
      throw new EditorError(`usage: ${ScaleCommand.usage}`);
    }
    const factor = NumberFormat.parse(args[1] ?? '');
    if (factor <= 0) {
      throw new EditorError('scale factor must be positive');
    }
    return new ScaleCommand(args[0] ?? '', factor);
  }

  execute(context: CommandContext): string {
    const found = Command.locateOrFail(context.document, this.shapeId);
    this.snapshots.clear();
    this.collect(found.shape);
    found.shape.scale(this.factor);
    return `${found.shape.label()} scaled by ${NumberFormat.format(this.factor)}`;
  }

  undo(context: CommandContext): string {
    const found = Command.locateOrFail(context.document, this.shapeId);
    for (const [shape, entries] of this.snapshots) {
      for (const [name, value] of entries) {
        shape.setAttribute(name, value);
      }
    }
    return `${found.shape.label()} scaled back by ${NumberFormat.format(this.factor)}`;
  }

  private collect(shape: Shape): void {
    this.snapshots.set(shape, shape.snapshotGeometry());
    if (shape instanceof ContainerShape) {
      for (const child of shape.children()) {
        this.collect(child);
      }
    }
  }
}
