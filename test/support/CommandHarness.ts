import type { Command } from '../../src/commands/Command.js';
import type { CommandContext } from '../../src/commands/CommandContext.js';
import type { CommandParseContext } from '../../src/commands/CommandParseContext.js';
import { SvgDocument } from '../../src/domain/SvgDocument.js';
import { ShapeFactory } from '../../src/domain/shape/ShapeFactory.js';

/**
 * 测试用的"最小会话"：只保留命令 + 文档 + 双栈，
 * 用于在没有 IO/CLI 的情况下验证命令语义与 undo/redo。
 */
export class CommandHarness {
  readonly document = new SvgDocument(800, 600);

  readonly shapes = new ShapeFactory();

  readonly context: CommandContext = { document: this.document, shapes: this.shapes };

  readonly parseContext: CommandParseContext = { shapes: this.shapes };

  private readonly undoStack: Command[] = [];

  private readonly redoStack: Command[] = [];

  run(command: Command): string {
    const message = command.execute(this.context);
    this.undoStack.push(command);
    this.redoStack.length = 0;
    return message;
  }

  undo(): string {
    const command = this.undoStack.pop();
    if (command === undefined) {
      throw new Error('nothing to undo');
    }
    const message = command.undo(this.context);
    this.redoStack.push(command);
    return message;
  }

  redo(): string {
    const command = this.redoStack.pop();
    if (command === undefined) {
      throw new Error('nothing to redo');
    }
    const message = command.execute(this.context);
    this.undoStack.push(command);
    return message;
  }

  ids(): string[] {
    return this.document.canvas().children().map((child) => child.id());
  }
}
