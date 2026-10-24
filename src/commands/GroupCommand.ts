import { EditorError } from '../domain/EditorError.js';
import { GShape } from '../domain/shape/GShape.js';
import type { ContainerShape } from '../domain/shape/ContainerShape.js';
import type { Shape } from '../domain/shape/Shape.js';
import { Command } from './Command.js';
import type { CommandContext } from './CommandContext.js';
import type { CommandParseContext } from './CommandParseContext.js';

interface TargetEntry {
  readonly shape: Shape;
  readonly parent: ContainerShape;
  readonly index: number;
}

/**
 * `group <newGid> <id1> <id2>…`：新建容器并收编已有图形。
 *
 * 语义（附录 A.9）：成员按命令行顺序从各自原父容器摘出；
 * 新 `<g>` 追加到"第一个目标所在父容器"的末尾；整体是一个 undo 单元。
 */
export class GroupCommand extends Command {
  static readonly commandName = 'group';

  static readonly usage = 'group <newGid> <id1> <id2>…';

  static readonly summary = 'create a group that adopts existing shapes (one undo unit)';

  private container: GShape | null = null;

  private insertionParent: ContainerShape | null = null;

  private entries: TargetEntry[] = [];

  private constructor(
    private readonly newId: string,
    private readonly targetIds: readonly string[],
  ) {
    super();
  }

  static parse(args: string[], _context: CommandParseContext): GroupCommand {
    if (args.length < 3) {
      throw new EditorError(`usage: ${GroupCommand.usage}`);
    }
    return new GroupCommand(args[0] ?? '', args.slice(1));
  }

  execute(context: CommandContext): string {
    const document = context.document;
    if (document.isIdTaken(this.newId)) {
      throw new EditorError(`id already exists: ${this.newId}`);
    }

    const located = this.targetIds.map((id) => Command.locateOrFail(document, id));
    for (let first = 0; first < located.length; first += 1) {
      for (let second = first + 1; second < located.length; second += 1) {
        const a = located[first]?.shape;
        const b = located[second]?.shape;
        if (a === undefined || b === undefined) {
          continue;
        }
        if (a === b) {
          throw new EditorError(`duplicate shape in group: ${a.id()}`);
        }
        if (a.contains(b)) {
          throw new EditorError(`cannot group a container into its own descendant: ${a.id()}`);
        }
        if (b.contains(a)) {
          throw new EditorError(`cannot group a container into its own descendant: ${b.id()}`);
        }
      }
    }

    const firstTarget = located[0];
    if (firstTarget === undefined) {
      throw new EditorError(`usage: ${GroupCommand.usage}`);
    }
    this.entries = located.map((entry) => ({
      shape: entry.shape,
      parent: entry.parent,
      index: entry.index,
    }));
    this.insertionParent = firstTarget.parent;

    for (const entry of this.entries) {
      entry.parent.remove(entry.shape);
    }

    const created = context.shapes.create('g', this.newId, {
      attributes: new Map<string, string>(),
      textContent: null,
    });
    if (!(created instanceof GShape)) {
      throw new EditorError('internal error: group provider did not create a container');
    }
    this.container = created;
    this.insertionParent.append(created);
    for (const entry of this.entries) {
      created.append(entry.shape);
    }

    return `${created.label()} created with ${this.entries.length} children`;
  }

  undo(_context: CommandContext): string {
    const container = this.container;
    const insertionParent = this.insertionParent;
    if (container === null || insertionParent === null) {
      throw new EditorError('cannot undo group: command was never executed');
    }
    insertionParent.remove(container);

    const byParent = new Map<ContainerShape, TargetEntry[]>();
    for (const entry of this.entries) {
      const siblings = byParent.get(entry.parent) ?? [];
      siblings.push(entry);
      byParent.set(entry.parent, siblings);
    }
    for (const [parent, siblings] of byParent) {
      const ordered = [...siblings].sort((left, right) => left.index - right.index);
      for (const entry of ordered) {
        parent.insert(entry.index, entry.shape);
      }
    }
    return `${container.label()} dissolved (${this.entries.length} children restored)`;
  }
}
