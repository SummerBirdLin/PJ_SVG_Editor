import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SetCommand } from '../../src/commands/SetCommand.js';
import { GShape } from '../../src/domain/shape/GShape.js';
import { RectShape } from '../../src/domain/shape/RectShape.js';
import { TextShape } from '../../src/domain/shape/TextShape.js';
import type { Shape } from '../../src/domain/shape/Shape.js';
import { EditorError } from '../../src/domain/EditorError.js';
import { AttributeChanges } from '../../src/plugin-api/AttributeChanges.js';
import type { AttributeHandler, AttributeHandlerLookup } from '../../src/plugin-api/AttributeHandler.js';
import type { ShapeTarget } from '../../src/plugin-api/ShapeTarget.js';
import { CommandHarness } from '../support/CommandHarness.js';

/** 与注册表同语义的最小查找器：只返回 `handles` 为真的处理器，按优先级降序。 */
class HandlerLookup implements AttributeHandlerLookup {
  constructor(private readonly handlers: readonly AttributeHandler[]) {}

  handlersFor(target: ShapeTarget, attribute: string): readonly AttributeHandler[] {
    return this.handlers
      .filter((handler) => handler.handles(target, attribute))
      .sort((left, right) => right.priority - left.priority);
  }
}

/** 造一个"复合图形"：`g` 容器 + 内部 rect + 内部 text，用于验证一处 set 改多个子部件。 */
function appendComposite(harness: CommandHarness, id: string): GShape {
  const group = new GShape(id);
  group.append(new RectShape(`${id}-rect`, 10, 20, 30, 40));
  group.append(new TextShape(`${id}-label`, 12, 45, 'old'));
  harness.document.canvas().append(group);
  return group;
}

function setCommand(id: string, attribute: string, value: string): SetCommand {
  return SetCommand.parse([id, attribute, value], {} as never);
}

test('set：无处理器命中 → 阶段 1 白名单路径逐字不变', () => {
  const harness = new CommandHarness(new HandlerLookup([]));
  harness.document.canvas().append(new RectShape('r1', 0, 0, 10, 10));

  assert.equal(harness.run(setCommand('r1', 'fill', 'red')), 'rect#r1 updated: fill=red');
  assert.equal(harness.undo(), 'rect#r1 updated: fill=none');
  assert.equal(harness.redo(), 'rect#r1 updated: fill=red');

  assert.throws(
    () => harness.run(setCommand('r1', 'label', 'x')),
    (error: unknown) => error instanceof EditorError && error.message === 'unknown attribute: label',
  );
});

test('set：处理器命中 → 一次 set 改两个子部件，一次 undo 整体恢复、一次 redo 整体重做', () => {
  const compositeHandler: AttributeHandler = {
    handlerName: 'composite-attributes',
    priority: 10,
    handles: (target) => target.typeName === 'g' && target.children().length === 2,
    apply: (target, attribute, value, changes) => {
      const rect = target.child(`${target.shape.id()}-rect`);
      const label = target.child(`${target.shape.id()}-label`);
      if (rect === null || label === null) {
        throw new EditorError(`composite shape is incomplete: ${target.shape.id()}`);
      }
      if (attribute === 'fill') {
        changes.setAttribute(rect, 'fill', value);
        return;
      }
      changes.setAttribute(label, 'text', value);
    },
  };
  const harness = new CommandHarness(new HandlerLookup([compositeHandler]));
  appendComposite(harness, 'n1');

  const rect = harness.document.findById('n1-rect') as RectShape;
  const label = harness.document.findById('n1-label') as TextShape;

  assert.equal(harness.run(setCommand('n1', 'fill', '#f5a623')), 'g#n1 updated: fill=#f5a623');
  assert.equal(rect.attributeValue('fill'), '#f5a623');
  assert.equal(harness.undo(), 'g#n1 updated: fill=none');
  assert.equal(rect.attributeValue('fill'), null);
  assert.equal(harness.redo(), 'g#n1 updated: fill=#f5a623');
  assert.equal(rect.attributeValue('fill'), '#f5a623');

  assert.equal(harness.run(setCommand('n1', 'label', '处理数据 v2')), 'g#n1 updated: label=处理数据 v2');
  assert.equal(label.textContent(), '处理数据 v2');
  assert.equal(harness.undo(), 'g#n1 updated: label=old');
  assert.equal(label.textContent(), 'old');
});

test('set：多个处理器命中同一属性 → 按优先级取最高，低优先级不执行', () => {
  const executed: string[] = [];
  const makeHandler = (name: string, priority: number): AttributeHandler => ({
    handlerName: name,
    priority,
    handles: (_target, attribute) => attribute === 'label',
    apply: (target, _attribute, value, changes) => {
      executed.push(name);
      changes.setAttribute(target.shape, 'fill', value);
    },
  });
  const harness = new CommandHarness(new HandlerLookup([makeHandler('low', 1), makeHandler('high', 5)]));
  harness.document.canvas().append(new RectShape('r1', 0, 0, 10, 10));

  harness.run(setCommand('r1', 'label', 'blue'));
  assert.deepEqual(executed, ['high']);
  assert.equal((harness.document.findById('r1') as Shape).attributeValue('fill'), 'blue');
});

test('set：最高优先级并列 → 拒绝并报 ambiguous attribute handler，文档不变', () => {
  const makeHandler = (name: string): AttributeHandler => ({
    handlerName: name,
    priority: 3,
    handles: (_target, attribute) => attribute === 'label',
    apply: (target, _attribute, value, changes) => {
      changes.setAttribute(target.shape, 'fill', value);
    },
  });
  const harness = new CommandHarness(new HandlerLookup([makeHandler('alpha'), makeHandler('beta')]));
  harness.document.canvas().append(new RectShape('r1', 0, 0, 10, 10));

  assert.throws(
    () => harness.run(setCommand('r1', 'label', 'blue')),
    (error: unknown) => error instanceof EditorError
      && error.message === 'ambiguous attribute handler: label (alpha, beta)',
  );
  assert.equal(harness.document.findById('r1')?.attributeValue('fill'), null);
  assert.equal(harness.historyDepth(), 0);
});

test('set：处理器改了子部件后抛错 → 文档整体回滚，undo/redo 历史不变', () => {
  const flakyHandler: AttributeHandler = {
    handlerName: 'flaky',
    priority: 1,
    handles: (target) => target.typeName === 'g' && target.children().length === 2,
    apply: (target, attribute, value, changes) => {
      const rect = target.child(`${target.shape.id()}-rect`);
      if (rect !== null) {
        changes.setAttribute(rect, 'fill', value);
      }
      if (attribute === 'label') {
        throw new EditorError('label is not supported here');
      }
    },
  };
  const harness = new CommandHarness(new HandlerLookup([flakyHandler]));
  appendComposite(harness, 'n1');
  const rect = harness.document.findById('n1-rect') as RectShape;

  assert.throws(
    () => harness.run(setCommand('n1', 'label', 'red')),
    (error: unknown) => error instanceof EditorError && error.message === 'label is not supported here',
  );
  assert.equal(rect.attributeValue('fill'), null);
  assert.equal(harness.historyDepth(), 0);
  assert.equal(harness.canUndoRedo(), false);
});

test('set：处理器内部抛非 EditorError → 折算成可定位的 attribute handler failed', () => {
  const brokenHandler: AttributeHandler = {
    handlerName: 'broken',
    priority: 1,
    handles: (_target, attribute) => attribute === 'label',
    apply: () => {
      throw new TypeError('boom');
    },
  };
  const harness = new CommandHarness(new HandlerLookup([brokenHandler]));
  harness.document.canvas().append(new RectShape('r1', 0, 0, 10, 10));

  assert.throws(
    () => harness.run(setCommand('r1', 'label', 'x')),
    (error: unknown) => error instanceof EditorError
      && error.message === 'attribute handler failed: broken (boom)',
  );
});

test('AttributeChanges：setAttribute 只在写入成功后才登记，回滚可逆序恢复', () => {
  const rect = new RectShape('r1', 0, 0, 10, 10);
  const changes = new AttributeChanges();
  changes.setAttribute(rect, 'fill', 'red');
  changes.setAttribute(rect, 'stroke-width', '2');

  assert.throws(() => changes.setAttribute(rect, 'unknown-attr', 'x'), /unknown attribute/);
  assert.deepEqual(changes.touchedAttributes(), ['fill', 'stroke-width']);
  assert.equal(changes.firstBefore('stroke-width'), null);

  changes.revert();
  assert.equal(rect.attributeValue('fill'), null);
  assert.equal(rect.attributeValue('stroke-width'), null);
});

test('set：处理器对「非目标类型」不命中时仍走缺省路径（普通矩形的 label 报未知属性）', () => {
  const compositeHandler: AttributeHandler = {
    handlerName: 'composite-only',
    priority: 1,
    handles: (target) => target.typeName === 'g',
    apply: () => {
      throw new Error('should not be called');
    },
  };
  const harness = new CommandHarness(new HandlerLookup([compositeHandler]));
  harness.document.canvas().append(new RectShape('r1', 0, 0, 10, 10));
  assert.throws(() => harness.run(setCommand('r1', 'label', 'x')), /unknown attribute: label/);
});
