import { EditorError } from '../domain/EditorError.js';
import type { Shape } from '../domain/shape/Shape.js';
import { AttributeChanges } from '../plugin-api/AttributeChanges.js';
import { ShapeTargetView } from '../plugin-api/ShapeTarget.js';
import { Command } from './Command.js';
import type { CommandContext } from './CommandContext.js';
import type { CommandParseContext } from './CommandParseContext.js';

/**
 * `set <id> <attr> <value>`：设置属性。
 *
 * 阶段 2 的调用契约（见 doc/adr 的 ADR-1）：
 * 1. 先问注册表"有没有处理器负责 `(图形, 属性)`"；
 * 2. 有 → 由处理器执行，修改全部记进 `AttributeChanges`（一次 set = 一个 undo 单元）；
 *    多个命中按 `priority` 降序取最高，最高优先级并列则拒绝（不静默覆盖）；
 *    处理器抛错 → 整体回滚，文档与 undo/redo 历史保持命令执行前的状态；
 * 3. 没有 → 走阶段 1 的属性白名单：允许则改，否则 `unknown attribute: <attr>`。
 *
 * 缺省路径与阶段 1 逐字节一致（回显、undo 文案都不变），插件路径只是多了一层事务记录。
 */
export class SetCommand extends Command {
  static readonly commandName = 'set';

  static readonly usage = 'set <id> <attr> <value>';

  static readonly summary = 'set an attribute (fill/stroke/stroke-width, geometry, or text content)';

  private oldValue: string | null = null;

  private hadOldValue = false;

  /** 处理器路径的事务记录；缺省路径为 null。 */
  private changes: AttributeChanges | null = null;

  private constructor(
    private readonly shapeId: string,
    private readonly attributeName: string,
    private readonly attributeValue: string,
  ) {
    super();
  }

  static parse(args: string[], _context: CommandParseContext): SetCommand {
    if (args.length !== 3) {
      throw new EditorError(`usage: ${SetCommand.usage}`);
    }
    return new SetCommand(args[0] ?? '', args[1] ?? '', args[2] ?? '');
  }

  execute(context: CommandContext): string {
    const found = Command.locateOrFail(context.document, this.shapeId);
    const target = new ShapeTargetView(found.shape);
    const handlers = this.matchingHandlers(context, target);

    if (handlers.length === 0) {
      return this.applyDefaultPath(found.shape);
    }

    const selected = handlers[0];
    if (selected === undefined) {
      throw new EditorError(`unknown attribute: ${this.attributeName}`);
    }
    const tied = handlers.filter((handler) => handler.priority === selected.priority);
    if (tied.length > 1) {
      const names = tied.map((handler) => handler.handlerName).join(', ');
      throw new EditorError(`ambiguous attribute handler: ${this.attributeName} (${names})`);
    }

    const changes = new AttributeChanges();
    try {
      selected.apply(target, this.attributeName, this.attributeValue, changes);
    } catch (error) {
      // 处理器可能已经改了一部分：整体回滚，且不写 undo 栈（execute 抛出即不 record）
      changes.revertQuietly();
      throw error instanceof EditorError
        ? error
        : new EditorError(
          `attribute handler failed: ${selected.handlerName} (${error instanceof Error ? error.message : String(error)})`,
        );
    }
    this.changes = changes;
    const after = found.shape.attributeValue(this.attributeName) ?? this.attributeValue;
    return `${found.shape.label()} updated: ${this.render(after)}`;
  }

  /** 阶段 1 的缺省路径：白名单语义、回显文案、undo 行为都保持不变。 */
  private applyDefaultPath(shape: Shape): string {
    this.oldValue = shape.attributeValue(this.attributeName);
    this.hadOldValue = this.oldValue !== null;
    shape.setAttribute(this.attributeName, this.attributeValue);
    this.changes = null;
    return `${shape.label()} updated: ${this.render(shape.attributeValue(this.attributeName))}`;
  }

  undo(context: CommandContext): string {
    const found = Command.locateOrFail(context.document, this.shapeId);
    const changes = this.changes;
    if (changes !== null) {
      changes.revert();
      const before = changes.firstBefore(this.attributeName) ?? changes.firstBeforeAny();
      return `${found.shape.label()} updated: ${this.render(before)}`;
    }
    if (this.hadOldValue && this.oldValue !== null) {
      found.shape.setAttribute(this.attributeName, this.oldValue);
    } else {
      found.shape.unsetAttribute(this.attributeName);
    }
    return `${found.shape.label()} updated: ${this.render(this.oldValue)}`;
  }

  private matchingHandlers(context: CommandContext, target: ShapeTargetView) {
    try {
      return context.attributeHandlers.handlersFor(target, this.attributeName);
    } catch (error) {
      throw error instanceof EditorError
        ? error
        : new EditorError(
          `attribute handler failed: registry (${error instanceof Error ? error.message : String(error)})`,
        );
    }
  }

  private render(value: string | null): string {
    if (value === null) {
      return `${this.attributeName}=none`;
    }
    if (this.attributeName === 'text') {
      return `text="${value}"`;
    }
    return `${this.attributeName}=${value}`;
  }
}
