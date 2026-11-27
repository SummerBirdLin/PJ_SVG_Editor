import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditorError } from '../../../src/domain/EditorError.js';
import type { ShapeInit } from '../../../src/domain/shape/ShapeInit.js';
import ShapeDiamondPlugin from '../src/index.js';
import { DiamondProvider } from '../src/DiamondProvider.js';
import { DiamondShape } from '../src/DiamondShape.js';
import { FakePluginContext } from './support/FakePluginContext.js';

function init(attributes: Record<string, string> = {}): ShapeInit {
  return { attributes: new Map(Object.entries(attributes)), textContent: null };
}

test('diamond：命令创建时按外接矩形生成四个角点，序列化为 <polygon points>', () => {
  const shape = new DiamondProvider().create(
    'd1',
    init({ x: '100', y: '100', width: '80', height: '80' }),
  ) as DiamondShape;
  assert.equal(shape.typeName(), 'diamond');
  assert.equal(shape.svgTag(), 'polygon');
  assert.deepEqual(shape.points(), [[140, 100], [180, 140], [140, 180], [100, 140]]);
  assert.deepEqual(shape.geometryAttributeEntries(), [['points', '140,100 180,140 140,180 100,140']]);
  assert.equal(shape.geometryInline(), 'x=100 y=100 w=80 h=80');
});

test('diamond：读回时由 points 反算外接矩形（round-trip 稳定）', () => {
  const provider = new DiamondProvider();
  const read = provider.create('d2', init({ points: '140,100 180,140 140,180 100,140' })) as DiamondShape;
  assert.deepEqual([read.x(), read.y(), read.width(), read.height()], [100, 100, 80, 80]);
  assert.deepEqual(read.geometryAttributeEntries(), [['points', '140,100 180,140 140,180 100,140']]);
});

test('diamond：points 不合法时拒绝读入（点数不足 / 坐标不是数字）', () => {
  const provider = new DiamondProvider();
  assert.throws(
    () => provider.create('d3', init({ points: '1,1 2,2' })),
    (error: unknown) => error instanceof EditorError && /expected 4 points, got 2/.test(error.message),
  );
  assert.throws(
    () => provider.create('d4', init({ points: '1,1 2,2 x,4 5,5' })),
    (error: unknown) => error instanceof EditorError && /bad point 'x,4'/.test(error.message),
  );
});

test('diamond：move/scale/set 几何走内核统一路径', () => {
  const shape = new DiamondShape('d5', 0, 0, 40, 20);
  shape.move(10, 5);
  assert.deepEqual([shape.x(), shape.y()], [10, 5]);
  shape.scale(2);
  assert.deepEqual([shape.x(), shape.y(), shape.width(), shape.height()], [20, 10, 80, 40]);
  shape.setAttribute('width', '100');
  assert.equal(shape.width(), 100);
  shape.setAttribute('x', '5');
  assert.equal(shape.x(), 5);
});

test('diamond：插件只贡献一个 ShapeProvider', () => {
  const context = new FakePluginContext();
  new ShapeDiamondPlugin().activate(context);
  assert.deepEqual(context.shapes.map((provider) => provider.typeName), ['diamond']);
  assert.deepEqual(context.commands, []);
  assert.deepEqual(context.decorators, []);
});

test('diamond：属性回显走用户书写形式（x/y/width/height），points 只是序列化形式', () => {
  const shape = new DiamondShape('d6', 10, 20, 30, 40);
  assert.equal(shape.attributeValue('x'), '10');
  assert.equal(shape.attributeValue('y'), '20');
  assert.equal(shape.attributeValue('width'), '30');
  assert.equal(shape.attributeValue('height'), '40');
  // points 由 geometryAttributeEntries 派生，可读不可写
  assert.equal(shape.attributeValue('points'), '25,20 40,40 25,60 10,40');
  assert.deepEqual(shape.attributes().find(([name]) => name === 'points'), ['points', '25,20 40,40 25,60 10,40']);
});
