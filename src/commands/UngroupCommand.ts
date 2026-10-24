import { EditorError } from '../domain/EditorError.js';
import { CanvasShape } from '../domain/shape/CanvasShape.js';
import { GShape } from '../domain/shape/GShape.js';
import type { ContainerShape } from '../domain/shape/ContainerShape.js';
import type { Shape } from '../domain/shape/Shape.js';
import { Command } from './Command.js';
import type { CommandContext } from './CommandContext.js';
import type { CommandParseContext } from './CommandParseContext.js';

/**
 * `ungroup <gid>`：解散容器，子图形提升到原父级、占据原容器的位置（原位替换）。
 * 根级容器（`svg` 直接子节点）拒绝解散——需求 §4.2 的明确约定。
 */
export class UngroupCommand extends Command {
  static readonly commandName = 'ungroup';

  static readonly usage = 'ungroup <gid>';

  static readonly summary = 'dissolve a group; children take its place in the parent';

  private container: GShape | null = null;

  private parent: ContainerShape | null = null;

  private oldIndex = -1;

  private children: Shape[] = [];

  private constructor(private readonly groupId: string) {
    super();
  }

  static parse(args: string[], _context: CommandParseContext): UngroupCommand {
    if (args.length !== 1) {
      throw new EditorError(`usage: ${UngroupCommand.usage}`);
    }
    return new UngroupCommand(args[0] ?? '');
  }

  execute(context: CommandContext): string {
    const found = Command.locateOrFail(context.document, this.groupId);
    if (!(found.shape instanceof GShape)) {
      throw new EditorError(`not a container: ${this.groupId}`);
    }
    if (found.parent instanceof CanvasShape) {
      throw new EditorError(`cannot ungroup top-level container: ${this.groupId}`);
    }

    this.container = found.shape;
    this.parent = found.parent;
    this.oldIndex = found.index;
    this.children = [...found.shape.children()];

    this.parent.remove(this.container);
    this.children.forEach((child, offset) => {
      this.parent?.insert(this.oldIndex + offset, child);
    });

    return `${this.container.label()} ungrouped `
      + `(${this.children.length} children moved to ${this.parent.label()})`;
  }

  undo(_context: CommandContext): string {
    const container = this.container;
    const parent = this.parent;
    if (container === null || parent === null) {
      throw new EditorError('cannot undo ungroup: command was never executed');
    }
    for (const child of this.children) {
      parent.remove(child);
    }
    parent.insert(this.oldIndex, container);
    return `${container.label()} restored`;
  }
}
