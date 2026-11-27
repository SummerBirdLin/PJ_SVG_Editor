import type { UndoableEdit } from '../plugin-api/EditHost.js';

/**
 * undo/redo 双栈。
 *
 * 两阶段提交：`peekUndo()`/`peekRedo()` 只看不取，调用方执行命令成功后再
 * `commitUndo()`/`commitRedo()` 移栈。这样"undo 本身失败"时历史与文档都不会被破坏
 * （评审发现的隐患：旧实现先移栈后执行，失败即丢命令）。
 *
 * - 一条编辑命令 = 一个单元（`group` 收编多条图形仍是一个命令对象）；
 * - redo 只在"撤销后没有新编辑"时可用：`record()` 会清空 redo 栈；
 * - IO 命令由 EditorSession 调用 `clear()`；
 * - 栈里存的是 `UndoableEdit`（内核接口），因此插件命令提交的编辑同样可撤销。
 */
export class History {
  private readonly undoStack: UndoableEdit[] = [];

  private readonly redoStack: UndoableEdit[] = [];

  record(command: UndoableEdit): void {
    this.undoStack.push(command);
    this.redoStack.length = 0;
  }

  peekUndo(): UndoableEdit | null {
    return this.undoStack[this.undoStack.length - 1] ?? null;
  }

  commitUndo(): void {
    const command = this.undoStack.pop();
    if (command !== undefined) {
      this.redoStack.push(command);
    }
  }

  peekRedo(): UndoableEdit | null {
    return this.redoStack[this.redoStack.length - 1] ?? null;
  }

  commitRedo(): void {
    const command = this.redoStack.pop();
    if (command !== undefined) {
      this.undoStack.push(command);
    }
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** 历史深度（= 已提交的编辑条数），供标签插件判断"保存点之后的编辑"。 */
  depth(): number {
    return this.undoStack.length;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}
