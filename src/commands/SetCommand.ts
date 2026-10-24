import { EditorError } from '../domain/EditorError.js';
import { Command } from './Command.js';
import type { CommandContext } from './CommandContext.js';
import type { CommandParseContext } from './CommandParseContext.js';

/**
 * `set <id> <attr> <value>`：设置属性（白名单由图形类型自己决定）。
 * undo 恢复旧值；旧值原本不存在（如未设置的 fill）时移除该属性。
 */
export class SetCommand extends Command {
  static readonly commandName = 'set';

  static readonly usage = 'set <id> <attr> <value>';

  static readonly summary = 'set an attribute (fill/stroke/stroke-width, geometry, or text content)';

  private oldValue: string | null = null;

  private hadOldValue = false;

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
    this.oldValue = found.shape.attributeValue(this.attributeName);
    this.hadOldValue = this.oldValue !== null;
    found.shape.setAttribute(this.attributeName, this.attributeValue);
    return found.shape.label() + ' updated: ' + this.render(found.shape.attributeValue(this.attributeName));
  }

  undo(context: CommandContext): string {
    const found = Command.locateOrFail(context.document, this.shapeId);
    if (this.hadOldValue && this.oldValue !== null) {
      found.shape.setAttribute(this.attributeName, this.oldValue);
    } else {
      found.shape.unsetAttribute(this.attributeName);
    }
    return found.shape.label() + ' updated: ' + this.render(this.oldValue);
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
