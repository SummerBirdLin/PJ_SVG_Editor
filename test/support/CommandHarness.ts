import type { Command } from '../../src/commands/Command.js';
import type { CommandContext } from '../../src/commands/CommandContext.js';
import type { CommandParseContext } from '../../src/commands/CommandParseContext.js';
import { History } from '../../src/commands/History.js';
import { SvgDocument } from '../../src/domain/SvgDocument.js';
import { ShapeFactory } from '../../src/domain/shape/ShapeFactory.js';

/**
 * 测试用的"最小会话"：命令 + 文档 + **真实 History**（不再自实现双栈，
 * 保证命令级测试覆盖的 undo/redo 语义与产品代码一致）。
 */
export class CommandHarness {
  readonly document = new SvgDocument(800, 600);

  readonly shapes = new ShapeFactory();

  readonly context: CommandContext = { document: this.document, shapes: this.shapes };

  readonly parseContext: CommandParseContext = { shapes: this.shapes };

  private readonly history = new History();

  run(command: Command): string {
    const message = command.execute(this.context);
    this.history.record(command);
    return message;
  }

  undo(): string {
    const command = this.history.peekUndo();
    if (command === null) {
      throw new Error('nothing to undo');
    }
    const message = command.undo(this.context);
    this.history.commitUndo();
    return message;
  }

  redo(): string {
    const command = this.history.peekRedo();
    if (command === null) {
      throw new Error('nothing to redo');
    }
    const message = command.execute(this.context);
    this.history.commitRedo();
    return message;
  }

  canRedo(): boolean {
    return this.history.canRedo();
  }

  ids(): string[] {
    return this.document.canvas().children().map((child) => child.id());
  }
}
