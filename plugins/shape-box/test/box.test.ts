import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditorError } from '../../../src/domain/EditorError.js';
import { RectShape } from '../../../src/domain/shape/RectShape.js';
import { TextShape } from '../../../src/domain/shape/TextShape.js';
import { GShape } from '../../../src/domain/shape/GShape.js';
import { AttributeChanges } from '../../../src/plugin-api/AttributeChanges.js';
import { ShapeTargetView } from '../../../src/plugin-api/ShapeTarget.js';
import type { ShapeInit } from '../../../src/domain/shape/ShapeInit.js';
import ShapeBoxPlugin from '../src/index.js';
import { BoxAttributesHandler } from '../src/BoxAttributesHandler.js';
import { BoxProvider } from '../src/BoxProvider.js';
import { BoxShape } from '../src/BoxShape.js';
import { BoxTypeLabelDecorator } from '../src/BoxTypeLabelDecorator.js';
import { FakePluginContext } from './support/FakePluginContext.js';

function init(attributes: Record<string, string> = {}, textContent: string | null = null): ShapeInit {
  return { attributes: new Map(Object.entries(attributes)), textContent };
}

function createBox(id = 'n1'): BoxShape {
  return new BoxProvider().create(id, init({ x: '120', y: '100', width: '160', height: '60' }, '开始')) as BoxShape;
}

test('box：命令创建时按派生规则造出 -rect 与 -label，位置沿用插件约定', () => {
  const box = createBox();
  assert.equal(box.typeName(), 'box');
  assert.equal(box.svgTag(), 'g');
  assert.equal(box.label(), 'box#n1');
  assert.deepEqual(box.children().map((child) => child.id()), ['n1-rect', 'n1-label']);

  const rect = box.rectPart();
  const label = box.labelPart();
  assert.ok(rect instanceof RectShape);
  assert.ok(label instanceof TextShape);
  assert.deepEqual([rect.x(), rect.y(), rect.width(), rect.height()], [120, 100, 160, 60]);
  // (x + 20, y + height/2 + 5) = (140, 135)，与需求 §5 示例一致
  assert.deepEqual([label.x(), label.y()], [140, 135]);
  assert.equal(label.textContent(), '开始');
});

test('box：序列化带 data-kind="box"，且不重复写入几何', () => {
  const box = createBox();
  const attributes = new Map(box.attributes());
  assert.equal(attributes.get('data-kind'), 'box');
  assert.equal(attributes.get('x'), undefined);
  assert.deepEqual(box.extraEntries(), [['data-kind', 'box']]);

  // 读回时 data-kind 不会被重复登记进 extras
  box.applyImportedAttributes(new Map([['data-kind', 'box'], ['x', '1'], ['width', '2']]));
  assert.deepEqual(box.extraEntries(), [['data-kind', 'box']]);
});

test('box：append/insert 只接受派生的子部件（第三子部件、错误 id、错误类型都被拒绝）', () => {
  const box = createBox();
  assert.throws(
    () => box.append(new RectShape('other', 0, 0, 1, 1)),
    (error: unknown) => error instanceof EditorError && /expected n1-rect \/ n1-label, got other/.test(error.message),
  );
  // 第三个子部件即使 id 复用了已用过的槽位也会被拒绝
  assert.throws(
    () => box.append(new RectShape('n1-rect', 0, 0, 1, 1)),
    (error: unknown) => error instanceof EditorError && /expected n1-rect \/ n1-label, got n1-rect/.test(error.message),
  );

  const fresh = new BoxShape('m1');
  assert.throws(
    () => fresh.insert(0, new TextShape('m1-rect', 0, 0, 'x')),
    (error: unknown) => error instanceof EditorError && /wrong type/.test(error.message),
  );
});

test('box：remove 拒绝移除必要子部件', () => {
  const box = createBox();
  const rect = box.rectPart();
  assert.ok(rect !== null);
  assert.throws(
    () => box.remove(rect),
    (error: unknown) => error instanceof EditorError
      && error.message === 'cannot remove required part of box: n1-rect',
  );
  assert.equal(box.childCount(), 2);
});

test('box：afterChildren 校验必要子部件，缺失或类型错误都拒绝（不产生半个 box）', () => {
  const provider = new BoxProvider();
  const empty = provider.create('n2', init()) as BoxShape;
  assert.throws(
    () => provider.afterChildren(empty),
    (error: unknown) => error instanceof EditorError && /invalid box n2: expected n2-rect and n2-label/.test(error.message),
  );

  const half = provider.create('n3', init()) as BoxShape;
  half.append(new RectShape('n3-rect', 0, 0, 1, 1));
  assert.throws(
    () => provider.afterChildren(half),
    (error: unknown) => error instanceof EditorError && /invalid box n3/.test(error.message),
  );

  const ok = provider.create('n4', init()) as BoxShape;
  ok.append(new RectShape('n4-rect', 0, 0, 1, 1));
  ok.append(new TextShape('n4-label', 0, 0, 'x'));
  assert.doesNotThrow(() => provider.afterChildren(ok));
});

test('box：属性处理器把 fill 落到内部矩形、label 落到内部文字，且都在同一个事务里', () => {
  const box = createBox();
  const target = new ShapeTargetView(box);
  const handler = new BoxAttributesHandler();

  assert.equal(handler.handles(target, 'fill'), true);
  assert.equal(handler.handles(target, 'label'), true);
  assert.equal(handler.handles(target, 'stroke'), false);
  assert.equal(handler.handles(new ShapeTargetView(new GShape('g1')), 'fill'), false);

  const changes = new AttributeChanges();
  handler.apply(target, 'fill', '#f5a623', changes);
  handler.apply(target, 'label', '处理数据 v2', changes);
  assert.equal(box.rectPart()?.attributeValue('fill'), '#f5a623');
  assert.equal(box.labelPart()?.textContent(), '处理数据 v2');
  assert.equal(changes.changeCount, 2);

  changes.revert();
  assert.equal(box.rectPart()?.attributeValue('fill'), null);
  assert.equal(box.labelPart()?.textContent(), '开始');
});

test('box：属性处理器在结构不完整时给出可定位的错误', () => {
  const broken = new BoxProvider().create('x1', init()) as BoxShape;
  const handler = new BoxAttributesHandler();
  assert.throws(
    () => handler.apply(new ShapeTargetView(broken), 'fill', 'red', new AttributeChanges()),
    (error: unknown) => error instanceof EditorError && /box shape is incomplete: x1/.test(error.message),
  );
});

test('box：树标签只标注 box 行，其它图形与根行不加', () => {
  const decorator = new BoxTypeLabelDecorator();
  const box = createBox();
  assert.equal(decorator.labelFor({ shape: box, document: null as never }), '(box)');
  assert.equal(decorator.labelFor({ shape: new GShape('g1'), document: null as never }), '');
  assert.equal(decorator.labelFor({ shape: null, document: null as never }), '');
});

test('box：插件一次注册图形/属性/标签三类贡献', () => {
  const context = new FakePluginContext();
  new ShapeBoxPlugin().activate(context);
  assert.deepEqual(context.shapes.map((provider) => provider.typeName), ['box']);
  assert.deepEqual(context.handlers.map((handler) => handler.handlerName), ['box-attributes']);
  assert.deepEqual(context.decorators.map((decorator) => decorator.decoratorName), ['box-type-label']);
});
