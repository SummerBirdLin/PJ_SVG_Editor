import type { Command } from './Command.js';

/**
 * undo/redo 双栈。
 *
 * - 一条编辑命令 = 一个单元（`group` 收编多条图形仍是一个命令对象）；
 * - redo 只在"撤销后没有新编辑"时可用：`record()` 会清空 redo 栈；
 * - IO 命令（init/read/save/canvas 带参）由 EditorSession 调用 `clear()`。
 */
export class History {
  private readonly undoStack: Command[] = [];
  private readonly redoStack: Command[] = [];

  record(command: Command): void {
    this.undoStack.push(command);
    this.redoStack.length = 0;
  }

  /** 弹出最近一条命令交给调用方执行 undo；返回 null 表示栈空。 */
  popForUndo(): Command | null {
    const command = this.undoStack.pop();
    if (command === undefined) {
      return null;
    }
    this.redoStack.push(command);
    return command;
  }

  /** 弹出最近一条被撤销的命令交给调用方执行 redo；返回 null 表示栈空。 */
  popForRedo(): Command | null {
    const command = this.redoStack.pop();
    if (command === undefined) {
      return null;
    }
    this.undoStack.push(command);
    return command;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}
