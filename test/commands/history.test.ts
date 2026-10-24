import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Command } from '../../src/commands/Command.js';
import type { CommandContext } from '../../src/commands/CommandContext.js';
import { History } from '../../src/commands/History.js';

class StubCommand extends Command {
  private readonly failUndo: boolean;

  constructor(failUndo = false) {
    super();
    this.failUndo = failUndo;
  }

  execute(_context: CommandContext): string {
    return 'executed';
  }

  undo(_context: CommandContext): string {
    if (this.failUndo) {
      throw new Error('boom');
    }
    return 'undone';
  }
}

test('History: 两阶段提交——undo 抛错时双栈不变；成功后才移栈', () => {
  const history = new History();
  const good = new StubCommand();
  const bad = new StubCommand(true);
  history.record(good);
  history.record(bad);

  // 模拟 EditorSession.undo：peek → 执行（抛错）→ 不 commit
  assert.throws(() => {
    const command = history.peekUndo();
    assert.equal(command, bad);
    command?.undo({} as CommandContext);
    history.commitUndo();
  }, /boom/);

  assert.equal(history.peekUndo(), bad, '失败后待撤销项不能被丢掉');
  assert.equal(history.canRedo(), false, '失败后不应产生 redo 项');

  // 成功路径：undo 成功后 commit，命令进入 redo 栈
  const okHistory = new History();
  const command = new StubCommand();
  okHistory.record(command);
  const target = okHistory.peekUndo();
  assert.equal(target, command);
  assert.equal(target?.undo({} as CommandContext), 'undone');
  okHistory.commitUndo();
  assert.equal(okHistory.canUndo(), false);
  assert.equal(okHistory.peekRedo(), command);

  // redo 侧同样两阶段：执行成功才 commit
  const redoTarget = okHistory.peekRedo();
  redoTarget?.execute({} as CommandContext);
  okHistory.commitRedo();
  assert.equal(okHistory.peekUndo(), command);
  assert.equal(okHistory.canRedo(), false);
});
