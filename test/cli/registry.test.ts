import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CommandRegistry } from '../../src/cli/CommandRegistry.js';
import { HelpPresenter } from '../../src/cli/presenter/HelpPresenter.js';
import { ShapeFactory } from '../../src/domain/shape/ShapeFactory.js';

const EXPECTED_COMMANDS = [
  'init', 'read', 'save', 'canvas',
  'create', 'delete', 'move', 'scale', 'set', 'group', 'ungroup', 'addto', 'front', 'back',
  'tree', 'show', 'help',
  'undo', 'redo',
];

test('注册表：19 条命令齐全，usage 与命令名一致，help 由注册表生成', () => {
  const registry = new CommandRegistry(new ShapeFactory());
  const entries = registry.entriesList();

  assert.deepEqual(entries.map((entry) => entry.commandName), EXPECTED_COMMANDS);
  for (const entry of entries) {
    assert.ok(entry.usage.startsWith(entry.commandName), `${entry.commandName} 的 usage 应以命令名开头`);
    assert.ok(entry.summary.length > 0, `${entry.commandName} 缺少 summary`);
  }

  const helpLines = new HelpPresenter(registry).render();
  assert.equal(helpLines[0], 'commands:');
  for (const entry of entries) {
    assert.ok(helpLines.some((line) => line.includes(entry.usage)), `help 缺少 ${entry.commandName}`);
  }
});

test('注册表：未知命令报 unknown command', () => {
  const registry = new CommandRegistry(new ShapeFactory());
  assert.throws(() => registry.parseAndCreate('frobnicate', []), /unknown command: frobnicate/);
});

test('help 不依赖文档：未 init 也能用', () => {
  const registry = new CommandRegistry(new ShapeFactory());
  const help = registry.parseAndCreate('help', []);
  const lines = help.run({} as never);
  assert.ok(lines.some((line) => line.includes('create <type> <id>')));
});
