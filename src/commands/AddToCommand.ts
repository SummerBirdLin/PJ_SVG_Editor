import { EditorError } from '../domain/EditorError.js';
import type { ContainerShape } from '../domain/shape/ContainerShape.js';
import type { Shape } from '../domain/shape/Shape.js';
import { Command } from './Command.js';
import type { CommandContext } from './CommandContext.js';
import type { CommandParseContext } from './CommandParseContext.js';

/**
 * `addto <gid> <id>`：把已有图形移入容器（作为最后一个子节点）。
 * 与 `group` 共用祖先检查：不允许把祖先挂进自己的子孙（否则子树自包含，会破坏 tree/save）。
 */
export class AddToCommand extends Command {
  static readonly commandName = 'addto';

  static readonly usage = 'addto <gid> <id>';

  static readonly summary = 'move an existing shape into a container (as last child)';

  private shape: Shape | null = null;

  private oldParent: ContainerShape | null = null;

  private oldIndex = -1;

  private target: ContainerShape | null = null;

  private constructor(
    private readonly groupId: string,
    private readonly shapeId: string,
  ) {
    super();
  }

  static parse(args: string[], _context: CommandParseContext): AddToCommand {
    if (args.length !== 2) {
      throw new EditorError(`usage: ${AddToCommand.usage}`);
    }
    return new AddToCommand(args[0] ?? '', args[1] ?? '');
  }

  execute(context: CommandContext): string {
    const document = context.document;
    const target = Command.locateContainerOrFail(document, this.groupId);
    const found = Command.locateOrFail(document, this.shapeId);

    if (found.shape === target) {
      throw new EditorError(`cannot move a container into its own descendant: ${this.groupId}`);
    }
    if (found.shape.contains(target)) {
      throw new EditorError(`cannot move a container into its own descendant: ${found.shape.id()}`);
    }

    this.shape = found.shape;
    this.oldParent = found.parent;
    this.oldIndex = found.index;
    this.target = target;

    found.parent.remove(found.shape);
    target.append(found.shape);
    return `${found.shape.label()} moved into ${target.label()}`;
  }

  undo(_context: CommandContext): string {
    const shape = this.shape;
    const oldParent = this.oldParent;
    const target = this.target;
    if (shape === null || oldParent === null || target === null) {
      throw new EditorError('cannot undo addto: command was never executed');
    }
    target.remove(shape);
    oldParent.insert(this.oldIndex, shape);
    return `${shape.label()} moved back to ${oldParent.label()}`;
  }
}
