import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ContainerShape } from '../../../src/domain/shape/ContainerShape.js';
import { GShape } from '../../../src/domain/shape/GShape.js';
import { RectShape } from '../../../src/domain/shape/RectShape.js';
import { CircleShape } from '../../../src/domain/shape/CircleShape.js';
import { TextShape } from '../../../src/domain/shape/TextShape.js';
import { SvgDocument } from '../../../src/domain/SvgDocument.js';
import { EditorError } from '../../../src/domain/EditorError.js';
import type { CommandHost } from '../../../src/plugin-api/index.js';
import StatsPlugin from '../src/index.js';
import { StatsCommand } from '../src/StatsCommand.js';
import { StatsCounter } from '../src/StatsCounter.js';
import { FakePluginContext } from './support/FakePluginContext.js';

/** 复合图形替身：只借 `box` 的类型名与容器结构，不依赖 `box` 插件。 */
class TestBoxShape extends ContainerShape {
  constructor(id: string) {
    super(id, 'box', 'g');
  }
}

function hostWith(document: SvgDocument): CommandHost {
  return {
    document,
    hasDocument: () => true,
    commitEdit: () => '',
  } as unknown as CommandHost;
}

test('stats：混合文档按类型计数，容器单独计，根 svg 不计', () => {
  const document = new SvgDocument(800, 600);
  const group = new GShape('flow');
  group.append(new RectShape('r1'));
  group.append(new CircleShape('c1'));
  document.canvas().append(new RectShape('bg'));
  document.canvas().append(group);
  document.canvas().append(new TextShape('t1', 0, 0, 'a'));
  document.canvas().append(new RectShape('r2'));

  assert.equal(StatsCounter.describe(document), 'rect: 3  circle: 1  text: 1  (total 5, containers 1)');
});

test('stats：类型顺序按首次出现顺序，与字母序无关', () => {
  const document = new SvgDocument();
  document.canvas().append(new TextShape('t1', 0, 0, 'a'));
  document.canvas().append(new CircleShape('c1'));
  document.canvas().append(new TextShape('t2', 0, 0, 'b'));

  assert.equal(StatsCounter.describe(document), 'text: 2  circle: 1  (total 3, containers 0)');
});

test('stats：box 计入 containers，内部叶子照常计数（含嵌套）', () => {
  const document = new SvgDocument();
  const box = new TestBoxShape('n1');
  box.append(new RectShape('n1-rect'));
  box.append(new TextShape('n1-label', 0, 0, '处理数据'));
  const outer = new GShape('outer');
  outer.append(box);
  document.canvas().append(outer);

  assert.equal(StatsCounter.describe(document), 'rect: 1  text: 1  (total 2, containers 2)');
});

test('stats：空文档输出 (total 0, containers 0)', () => {
  assert.equal(StatsCounter.describe(new SvgDocument()), '(total 0, containers 0)');
});

test('stats：命令不带参数，多给参数报 usage', () => {
  const command = new StatsCommand();
  assert.throws(
    () => command.create(['extra'], {} as never),
    (error: unknown) => error instanceof EditorError && error.message === 'usage: stats',
  );
});

test('stats：通过插件上下文注册，命令自报名字/用法/摘要', () => {
  const context = new FakePluginContext();
  new StatsPlugin().activate(context);
  assert.equal(context.commands.length, 1);
  const registered = context.commands[0];
  assert.equal(registered?.commandName, 'stats');
  assert.equal(registered?.usage, 'stats');
  assert.match(registered?.summary ?? '', /count shapes/);
});

test('stats：执行后输出一行，且不改变文档状态（只读）', () => {
  const document = new SvgDocument(300, 200);
  document.canvas().append(new RectShape('r1'));
  const before = JSON.stringify([...document.canvas().children()].map((child) => child.attributes()));
  const command = new StatsCommand();
  const invocation = command.create([], {} as never);
  assert.deepEqual(invocation.run(hostWith(document)), ['rect: 1  (total 1, containers 0)']);
  const after = JSON.stringify([...document.canvas().children()].map((child) => child.attributes()));
  assert.equal(after, before);
});
