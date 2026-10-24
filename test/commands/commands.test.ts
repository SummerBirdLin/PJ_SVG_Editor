import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CreateCommand } from '../../src/commands/CreateCommand.js';
import { DeleteCommand } from '../../src/commands/DeleteCommand.js';
import { MoveCommand } from '../../src/commands/MoveCommand.js';
import { ScaleCommand } from '../../src/commands/ScaleCommand.js';
import { SetCommand } from '../../src/commands/SetCommand.js';
import { GroupCommand } from '../../src/commands/GroupCommand.js';
import { UngroupCommand } from '../../src/commands/UngroupCommand.js';
import { AddToCommand } from '../../src/commands/AddToCommand.js';
import { FrontCommand } from '../../src/commands/FrontCommand.js';
import { BackCommand } from '../../src/commands/BackCommand.js';
import { GShape } from '../../src/domain/shape/GShape.js';
import { RectShape } from '../../src/domain/shape/RectShape.js';
import { TextShape } from '../../src/domain/shape/TextShape.js';
import { CommandHarness } from '../support/CommandHarness.js';

function create(harness: CommandHarness, args: string[]): string {
  return harness.run(CreateCommand.parse(args, harness.parseContext));
}

function childIds(harness: CommandHarness, id: string | null = null): string[] {
  if (id === null) {
    return harness.document.canvas().children().map((child) => child.id());
  }
  const shape = harness.document.findById(id);
  assert.ok(shape instanceof GShape);
  return shape.children().map((child) => child.id());
}

test('create: 根级 / in 容器 / undo / redo 的回显与结构', () => {
  const harness = new CommandHarness();
  assert.equal(create(harness, ['rect', 'bg', '0', '0', '800', '600', '#ffffff']), 'rect#bg created');
  assert.equal(create(harness, ['g', 'flow']), 'g#flow created');
  assert.equal(
    create(harness, ['rect', 'start', '120', '100', '160', '60', '#4a90d9', 'in', 'flow']),
    'rect#start created in g#flow',
  );
  assert.equal(
    create(harness, ['text', 'label', '155', '135', '开始', 'in', 'flow']),
    'text#label created in g#flow',
  );

  const flow = harness.document.findById('flow');
  assert.ok(flow instanceof GShape);
  assert.deepEqual(flow.children().map((child) => child.id()), ['start', 'label']);
  assert.equal(harness.document.elementCount(), 4);

  assert.equal(harness.undo(), 'text#label deleted');
  assert.equal(harness.undo(), 'rect#start deleted');
  assert.equal(harness.redo(), 'rect#start created in g#flow');
  assert.equal(harness.document.elementCount(), 3);
});

test('create: 错误路径（id 重复、容器不存在/不是容器、类型未知、参数个数）', () => {
  const harness = new CommandHarness();
  create(harness, ['rect', 'r1', '0', '0', '10', '10']);
  create(harness, ['circle', 'c1', '5', '5', '3']);

  assert.throws(() => create(harness, ['rect', 'r1', '0', '0', '1', '1']), /id already exists: r1/);
  assert.throws(
    () => create(harness, ['rect', 'r2', '0', '0', '1', '1', 'in', 'nope']),
    /no such container: nope/,
  );
  assert.throws(
    () => create(harness, ['rect', 'r2', '0', '0', '1', '1', 'in', 'c1']),
    /not a container: c1/,
  );
  assert.throws(
    () => create(harness, ['box', 'b1', '0', '0', '1', '1']),
    /unknown shape type: box \(is the plugin loaded\?\)/,
  );
  assert.throws(() => create(harness, ['rect', 'r2', '0', '0']), /usage: create rect/);
});

test('delete: 容器连同子孙删除；undo 恢复到原父的原索引', () => {
  const harness = new CommandHarness();
  create(harness, ['rect', 'bg', '0', '0', '800', '600']);
  create(harness, ['g', 'markers']);
  create(harness, ['circle', 'c1', '100', '100', '20', 'in', 'markers']);
  create(harness, ['rect', 'box', '200', '80', '60', '60']);
  create(harness, ['circle', 'c2', '5', '5', '2', 'in', 'markers']);

  assert.equal(harness.run(DeleteCommand.parse(['markers'], harness.parseContext)), 'g#markers deleted');
  assert.deepEqual(childIds(harness), ['bg', 'box']);
  assert.equal(harness.document.findById('c1'), null);

  assert.equal(harness.undo(), 'g#markers restored into svg');
  assert.deepEqual(childIds(harness), ['bg', 'markers', 'box']);
  assert.deepEqual(childIds(harness, 'markers'), ['c1', 'c2']);

  assert.equal(harness.redo(), 'g#markers deleted');
  assert.deepEqual(childIds(harness), ['bg', 'box']);
});

test('move: 叶子回显终点、容器回显位移；undo 反方向', () => {
  const harness = new CommandHarness();
  create(harness, ['circle', 'c1', '100', '100', '20']);
  create(harness, ['g', 'node2']);
  create(harness, ['rect', 'r2', '0', '0', '10', '10', 'in', 'node2']);

  assert.equal(harness.run(MoveCommand.parse(['c1', '30', '0'], harness.parseContext)), 'circle#c1 moved to (130,100)');
  assert.equal(harness.undo(), 'circle#c1 moved back to (100,100)');
  assert.equal(harness.redo(), 'circle#c1 moved to (130,100)');

  assert.equal(harness.run(MoveCommand.parse(['node2', '0', '100'], harness.parseContext)), 'g#node2 moved by (0,100)');
  const rect = harness.document.findById('r2');
  assert.ok(rect instanceof RectShape);
  assert.equal(rect.y(), 100);
  assert.equal(harness.undo(), 'g#node2 moved back by (0,-100)');

  assert.throws(() => harness.run(MoveCommand.parse(['nope', '1', '1'], harness.parseContext)), /no such shape: nope/);
  assert.throws(() => harness.run(MoveCommand.parse(['c1', 'x', '1'], harness.parseContext)), /invalid number: x/);
});

test('scale: 乘到全部几何属性；undo 用旧几何精确还原（不按 1/f 反算）', () => {
  const harness = new CommandHarness();
  create(harness, ['rect', 'r1', '0.1', '0.2', '10', '20']);
  create(harness, ['line', 'l1', '0', '0', '10', '10']);
  create(harness, ['g', 'grp']);
  create(harness, ['circle', 'c1', '10', '10', '5', 'in', 'grp']);

  assert.equal(harness.run(ScaleCommand.parse(['grp', '3'], harness.parseContext)), 'g#grp scaled by 3');
  const circle = harness.document.findById('c1');
  assert.ok(circle !== null);
  assert.deepEqual(circle.geometryAttributeEntries(), [['cx', '30'], ['cy', '30'], ['r', '15']]);

  assert.equal(harness.run(ScaleCommand.parse(['r1', '3'], harness.parseContext)), 'rect#r1 scaled by 3');
  const rect = harness.document.findById('r1');
  assert.ok(rect instanceof RectShape);
  assert.deepEqual(rect.geometryAttributeEntries(), [
    ['x', '0.3'],
    ['y', '0.6'],
    ['width', '30'],
    ['height', '60'],
  ]);
  assert.equal(harness.undo(), 'rect#r1 scaled back by 3');
  assert.equal(rect.x(), 0.1);
  assert.equal(rect.width(), 10);

  assert.throws(() => ScaleCommand.parse(['r1', '0'], harness.parseContext), /scale factor must be positive/);
  assert.throws(() => ScaleCommand.parse(['r1', '-2'], harness.parseContext), /scale factor must be positive/);
});

test('set: 样式 / 几何 / text 内容的回显与 undo（含旧值不存在时移除属性）', () => {
  const harness = new CommandHarness();
  create(harness, ['rect', 'r1', '10', '20', '100', '50']);
  create(harness, ['text', 'title', '20', '40', 'My Diagram']);

  assert.equal(harness.run(SetCommand.parse(['r1', 'fill', 'red'], harness.parseContext)), 'rect#r1 updated: fill=red');
  const rect = harness.document.findById('r1');
  assert.ok(rect instanceof RectShape);
  assert.equal(rect.attributeValue('fill'), 'red');
  assert.equal(harness.undo(), 'rect#r1 updated: fill=none');
  assert.equal(rect.attributeValue('fill'), null);

  assert.equal(harness.run(SetCommand.parse(['title', 'text', 'My Diagram v2'], harness.parseContext)), 'text#title updated: text="My Diagram v2"');
  const title = harness.document.findById('title');
  assert.ok(title instanceof TextShape);
  assert.equal(title.textContent(), 'My Diagram v2');
  assert.equal(harness.undo(), 'text#title updated: text="My Diagram"');
  assert.equal(title.textContent(), 'My Diagram');

  assert.equal(harness.run(SetCommand.parse(['r1', 'x', '30'], harness.parseContext)), 'rect#r1 updated: x=30');
  assert.equal(rect.x(), 30);
  assert.equal(harness.undo(), 'rect#r1 updated: x=10');

  assert.throws(() => harness.run(SetCommand.parse(['r1', 'opacity', '0.5'], harness.parseContext)), /unknown attribute: opacity/);
});

test('group: 收编多个目标、追加到第一个目标父容器末尾、undo 还原顺序与父级', () => {
  const harness = new CommandHarness();
  create(harness, ['rect', 'bg', '0', '0', '800', '600']);
  create(harness, ['circle', 'c1', '100', '100', '20']);
  create(harness, ['rect', 'box', '200', '80', '60', '60']);

  assert.equal(
    harness.run(GroupCommand.parse(['markers', 'c1', 'box'], harness.parseContext)),
    'g#markers created with 2 children',
  );
  assert.deepEqual(childIds(harness), ['bg', 'markers']);
  assert.deepEqual(childIds(harness, 'markers'), ['c1', 'box']);

  assert.equal(harness.undo(), 'g#markers dissolved (2 children restored)');
  assert.deepEqual(childIds(harness), ['bg', 'c1', 'box']);
  assert.equal(harness.redo(), 'g#markers created with 2 children');
  assert.deepEqual(childIds(harness, 'markers'), ['c1', 'box']);
});

test('group: 错误路径（容器收进自己子孙、目标重复、id 已存在）', () => {
  const harness = new CommandHarness();
  create(harness, ['g', 'markers']);
  create(harness, ['circle', 'c1', '5', '5', '2', 'in', 'markers']);
  create(harness, ['circle', 'c2', '50', '50', '2']);

  assert.throws(
    () => harness.run(GroupCommand.parse(['bad', 'c1', 'markers'], harness.parseContext)),
    /cannot group a container into its own descendant: markers/,
  );
  assert.throws(
    () => harness.run(GroupCommand.parse(['bad', 'c1', 'c1'], harness.parseContext)),
    /duplicate shape in group: c1/,
  );
  assert.throws(
    () => harness.run(GroupCommand.parse(['markers', 'c1', 'c2'], harness.parseContext)),
    /id already exists: markers/,
  );
});

test('ungroup: 子图形原位替换；根级容器与叶子图形被拒绝', () => {
  const harness = new CommandHarness();
  create(harness, ['g', 'flowchart']);
  create(harness, ['g', 'node1', 'in', 'flowchart']);
  create(harness, ['rect', 'start', '0', '0', '10', '10', 'in', 'node1']);
  create(harness, ['rect', 'other', '20', '20', '10', '10', 'in', 'flowchart']);

  assert.equal(
    harness.run(UngroupCommand.parse(['node1'], harness.parseContext)),
    'g#node1 ungrouped (1 children moved to g#flowchart)',
  );
  assert.deepEqual(childIds(harness, 'flowchart'), ['start', 'other']);
  assert.equal(harness.undo(), 'g#node1 restored');
  assert.deepEqual(childIds(harness, 'flowchart'), ['node1', 'other']);
  assert.deepEqual(childIds(harness, 'node1'), ['start']);

  assert.throws(
    () => harness.run(UngroupCommand.parse(['flowchart'], harness.parseContext)),
    /cannot ungroup top-level container: flowchart/,
  );
  assert.throws(
    () => harness.run(UngroupCommand.parse(['start'], harness.parseContext)),
    /not a container: start/,
  );
});

test('addto: 移入容器末尾、undo 回原位；禁止把祖先挂进子孙', () => {
  const harness = new CommandHarness();
  create(harness, ['g', 'g1']);
  create(harness, ['g', 'g2']);
  create(harness, ['circle', 'c1', '5', '5', '2', 'in', 'g1']);

  assert.equal(harness.run(AddToCommand.parse(['g1', 'g2'], harness.parseContext)), 'g#g2 moved into g#g1');
  assert.deepEqual(childIds(harness, 'g1'), ['c1', 'g2']);
  assert.equal(harness.undo(), 'g#g2 moved back to svg');
  assert.deepEqual(childIds(harness), ['g1', 'g2']);

  assert.throws(
    () => harness.run(AddToCommand.parse(['g1', 'g1'], harness.parseContext)),
    /cannot move a container into its own descendant: g1/,
  );
  assert.throws(
    () => harness.run(AddToCommand.parse(['nope', 'c1'], harness.parseContext)),
    /no such container: nope/,
  );
  assert.throws(
    () => harness.run(AddToCommand.parse(['c1', 'g1'], harness.parseContext)),
    /not a container: c1/,
  );
});

test('front/back: 调整同级顺序，undo 回到原索引', () => {
  const harness = new CommandHarness();
  create(harness, ['rect', 'a', '0', '0', '1', '1']);
  create(harness, ['rect', 'b', '0', '0', '1', '1']);
  create(harness, ['rect', 'c', '0', '0', '1', '1']);

  assert.equal(harness.run(FrontCommand.parse(['a'], harness.parseContext)), 'rect#a moved to front');
  assert.deepEqual(childIds(harness), ['b', 'c', 'a']);
  assert.equal(harness.undo(), 'rect#a moved back to index 0');
  assert.deepEqual(childIds(harness), ['a', 'b', 'c']);

  assert.equal(harness.run(BackCommand.parse(['c'], harness.parseContext)), 'rect#c moved to back');
  assert.deepEqual(childIds(harness), ['c', 'a', 'b']);
  assert.equal(harness.undo(), 'rect#c moved back to index 2');
  assert.deepEqual(childIds(harness), ['a', 'b', 'c']);
});
