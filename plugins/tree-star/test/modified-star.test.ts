import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GShape } from '../../../src/domain/shape/GShape.js';
import { RectShape } from '../../../src/domain/shape/RectShape.js';
import { TextShape } from '../../../src/domain/shape/TextShape.js';
import { SvgDocument } from '../../../src/domain/SvgDocument.js';
import { TreePresenter } from '../../../src/cli/presenter/TreePresenter.js';
import type { DocumentEvent } from '../../../src/plugin-api/DocumentEvent.js';
import { ModifiedStarDecorator } from '../src/ModifiedStarDecorator.js';
import TreeStarPlugin from '../src/index.js';
import { FakePluginContext } from './support/FakePluginContext.js';

/** 三行树：g#g1 里有 rect#r1 与 text#t1，根级还有 rect#r2。 */
function sampleDocument(): SvgDocument {
  const document = new SvgDocument(800, 600);
  const group = new GShape('g1');
  group.append(new RectShape('r1', 10, 20, 30, 40));
  group.append(new TextShape('t1', 0, 0, 'hi'));
  document.canvas().append(group);
  document.canvas().append(new RectShape('r2', 0, 0, 5, 5));
  return document;
}

function render(document: SvgDocument, decorator: ModifiedStarDecorator): string[] {
  return new TreePresenter([decorator]).render(document);
}

function publish(decorator: ModifiedStarDecorator, kind: DocumentEvent['kind'], document: SvgDocument): void {
  decorator.onDocumentEvent({ kind, document });
}

test('modified-star：刚建立/刚读入的文档没有未保存变化 → 全树无星', () => {
  const document = sampleDocument();
  const decorator = new ModifiedStarDecorator();
  publish(decorator, 'replaced', document);

  const lines = render(document, decorator);
  assert.ok(lines.every((line) => !line.endsWith('*')), lines.join('\n'));
});

test('modified-star：编辑后只有被改的行与根行带星（祖先容器不传播）', () => {
  const document = sampleDocument();
  const decorator = new ModifiedStarDecorator();
  publish(decorator, 'replaced', document);

  const rect = document.findById('r1');
  assert.ok(rect instanceof RectShape);
  rect.setAttribute('fill', 'red');
  publish(decorator, 'changed', document);

  const lines = render(document, decorator);
  assert.equal(lines[0], 'svg (800x600) *');
  assert.ok(lines.some((line) => line.includes('rect#r1') && line.endsWith('*')));
  // 祖先容器行与其它行不加星（ADR-3 的取舍）
  assert.ok(lines.some((line) => line.includes('g#g1') && !line.endsWith('*')));
  assert.ok(lines.some((line) => line.includes('rect#r2') && !line.endsWith('*')));
});

test('modified-star：保存后星全部消失（保存点 = 当前内容）', () => {
  const document = sampleDocument();
  const decorator = new ModifiedStarDecorator();
  publish(decorator, 'replaced', document);

  const rect = document.findById('r1');
  assert.ok(rect instanceof RectShape);
  rect.setAttribute('fill', 'red');
  publish(decorator, 'changed', document);
  publish(decorator, 'saved', document);

  assert.ok(render(document, decorator).every((line) => !line.endsWith('*')));
});

test('modified-star 状态机：编辑 → 保存 → 再编辑 → undo 回到保存点', () => {
  const document = sampleDocument();
  const decorator = new ModifiedStarDecorator();
  publish(decorator, 'replaced', document);
  const rect = document.findById('r1');
  assert.ok(rect instanceof RectShape);

  // ① 编辑
  rect.setAttribute('fill', 'red');
  publish(decorator, 'changed', document);
  assert.ok(render(document, decorator).some((line) => line.includes('rect#r1') && line.endsWith('*')));

  // ② 保存
  publish(decorator, 'saved', document);
  assert.ok(render(document, decorator).every((line) => !line.endsWith('*')));

  // ③ 再编辑
  rect.setAttribute('fill', 'blue');
  publish(decorator, 'changed', document);
  assert.ok(render(document, decorator).some((line) => line.includes('rect#r1') && line.endsWith('*')));

  // ④ undo 回到保存点（内容与保存点一致 → 星消失）
  rect.setAttribute('fill', 'red');
  publish(decorator, 'changed', document);
  assert.ok(render(document, decorator).every((line) => !line.endsWith('*')));
});

test('modified-star：新建节点立即带星，删除节点后根行仍带星', () => {
  const document = sampleDocument();
  const decorator = new ModifiedStarDecorator();
  publish(decorator, 'replaced', document);

  document.canvas().append(new RectShape('r3', 0, 0, 1, 1));
  publish(decorator, 'changed', document);
  const withNew = render(document, decorator);
  assert.ok(withNew.some((line) => line.includes('rect#r3') && line.endsWith('*')));
  assert.equal(withNew[0], 'svg (800x600) *');

  const parent = document.canvas();
  const target = document.findById('r2');
  assert.ok(target !== null);
  parent.remove(target);
  publish(decorator, 'changed', document);
  assert.equal(render(document, decorator)[0], 'svg (800x600) *');
});

test('modified-star：画布尺寸变化也算未保存变化（根行带星）', () => {
  const document = sampleDocument();
  const decorator = new ModifiedStarDecorator();
  publish(decorator, 'replaced', document);
  document.canvas().resize(1024, 768);
  publish(decorator, 'changed', document);
  assert.equal(render(document, decorator)[0], 'svg (1024x768) *');
});

test('modified-star：两个实例互不影响（同进程多标签/多文档不串味）', () => {
  const first = sampleDocument();
  const second = sampleDocument();
  const decoratorA = new ModifiedStarDecorator();
  const decoratorB = new ModifiedStarDecorator();
  publish(decoratorA, 'replaced', first);
  publish(decoratorB, 'replaced', second);

  const rect = first.findById('r1');
  assert.ok(rect instanceof RectShape);
  rect.setAttribute('fill', 'red');
  publish(decoratorA, 'changed', first);

  assert.ok(render(first, decoratorA).some((line) => line.endsWith('*')));
  assert.ok(render(second, decoratorB).every((line) => !line.endsWith('*')));
});

test('modified-star：插件通过上下文注册一个标签，名字稳定', () => {
  const context = new FakePluginContext();
  new TreeStarPlugin().activate(context);
  assert.deepEqual(context.decorators.map((item) => item.decoratorName), ['modified-star']);
});
