import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditorError } from '../../src/domain/EditorError.js';
import { SvgDocument } from '../../src/domain/SvgDocument.js';
import { ShapeFactory } from '../../src/domain/shape/ShapeFactory.js';
import type { ShapeInit } from '../../src/domain/shape/ShapeInit.js';
import { GShape } from '../../src/domain/shape/GShape.js';
import { createTestShapes } from '../support/Kernel.js';

function init(attributes: Record<string, string> = {}, textContent: string | null = null): ShapeInit {
  return { attributes: new Map(Object.entries(attributes)), textContent };
}

test('ShapeFactory: create 六种内置类型，未注册类型报插件提示', () => {
  const factory = createTestShapes();
  const rect = factory.create('rect', 'r1', init({ x: '1', y: '2', width: '3', height: '4', fill: '#eee' }));
  assert.equal(rect.label(), 'rect#r1');
  assert.deepEqual(rect.attributes(), [
    ['id', 'r1'],
    ['x', '1'],
    ['y', '2'],
    ['width', '3'],
    ['height', '4'],
    ['fill', '#eee'],
  ]);

  assert.equal(factory.create('g', 'g1', init()).label(), 'g#g1');
  assert.ok(factory.create('text', 't1', init({ x: '1', y: '2' }, 'hi')) instanceof Object);

  assert.throws(
    () => factory.create('box', 'b1', init()),
    (error: unknown) =>
      error instanceof EditorError
      && error.message === 'unknown shape type: box (is the plugin loaded?)',
  );
});

test('ShapeFactory: applyImportedAttributes 保留未知属性、样式与几何各归其位', () => {
  const factory = createTestShapes();
  const rect = factory.create('rect', 'r1', init({
    x: '1', y: '2', width: '3', height: '4',
    fill: 'red',
    'fill-opacity': '0.5',
    'data-kind': 'box',
  }));
  assert.deepEqual(rect.attributes(), [
    ['id', 'r1'],
    ['x', '1'],
    ['y', '2'],
    ['width', '3'],
    ['height', '4'],
    ['fill', 'red'],
    ['fill-opacity', '0.5'],
    ['data-kind', 'box'],
  ]);
});

test('SvgDocument: locate 返回父容器与索引；elementCount 不含画布；isIdTaken', () => {
  const factory = createTestShapes();
  const document = new SvgDocument(400, 300);
  const group = factory.create('g', 'g1', init()) as GShape;
  const rect = factory.create('rect', 'r1', init({ x: '0', y: '0', width: '10', height: '10' }));
  document.canvas().append(group);
  group.append(rect);

  const located = document.locate('r1');
  assert.ok(located !== null);
  assert.equal(located.parent.id(), 'g1');
  assert.equal(located.index, 0);
  assert.equal(document.locate('g1')?.parent.label(), 'svg');
  assert.equal(document.locate('nope'), null);
  assert.equal(document.elementCount(), 2);
  assert.equal(document.isIdTaken('g1'), true);
  assert.equal(document.isIdTaken('svg'), false);
  assert.equal(document.findById('r1'), rect);
});
