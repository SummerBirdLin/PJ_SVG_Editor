import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NumberFormat } from '../../src/domain/NumberFormat.js';
import { EditorError } from '../../src/domain/EditorError.js';
import { RectShape } from '../../src/domain/shape/RectShape.js';
import { CircleShape } from '../../src/domain/shape/CircleShape.js';
import { LineShape } from '../../src/domain/shape/LineShape.js';
import { TextShape } from '../../src/domain/shape/TextShape.js';
import { GShape } from '../../src/domain/shape/GShape.js';
import { CanvasShape } from '../../src/domain/shape/CanvasShape.js';

test('NumberFormat: 整数不带小数点，浮点噪声被抹平，-0 输出 0', () => {
  assert.equal(NumberFormat.format(20), '20');
  assert.equal(NumberFormat.format(0.1 + 0.2), '0.3');
  assert.equal(NumberFormat.format(-0), '0');
  assert.equal(NumberFormat.format(1.23456789), '1.234568');
  assert.equal(NumberFormat.parse(' 12.5 '), 12.5);
  assert.throws(() => NumberFormat.parse('abc'), (error: unknown) =>
    error instanceof EditorError && error.message === 'invalid number: abc');
});

test('RectShape: move/scale/set/attributes 的顺序与格式', () => {
  const rect = new RectShape('r1', 10, 20, 100, 50);
  rect.setAttribute('fill', '#eee');
  assert.deepEqual(rect.attributes(), [
    ['id', 'r1'],
    ['x', '10'],
    ['y', '20'],
    ['width', '100'],
    ['height', '50'],
    ['fill', '#eee'],
  ]);
  rect.setAttribute('stroke-width', '2');
  assert.equal(rect.inlineText(), 'x=10 y=20 w=100 h=50 fill=#eee');
  assert.deepEqual(rect.detailLines(), [
    'x=10 y=20 width=100 height=50',
    'fill=#eee',
    'stroke-width=2',
  ]);

  rect.move(5, -5);
  assert.equal(rect.positionText(), '(15,15)');
  rect.scale(2);
  assert.equal(rect.positionText(), '(30,30)');
  assert.equal(rect.width(), 200);
});

test('RectShape: 几何属性校验（负数与非法数字）', () => {
  const rect = new RectShape('r1');
  assert.throws(() => rect.setAttribute('width', '-1'), /width must be non-negative/);
  assert.throws(() => rect.setAttribute('height', 'x'), /invalid number: x/);
  assert.throws(() => rect.setAttribute('opacity', '0.5'), /unknown attribute: opacity/);
  assert.throws(() => rect.setAttribute('r', '3'), /unknown attribute: r/);
});

test('CircleShape/EllipseShape/LineShape/TextShape 的位置与内联文本', () => {
  const circle = new CircleShape('c1', 100, 100, 20);
  circle.setAttribute('fill', 'red');
  assert.equal(circle.inlineText(), 'cx=100 cy=100 r=20 fill=red');
  assert.equal(circle.positionText(), '(100,100)');

  const line = new LineShape('l1', 280, 130, 520, 130);
  line.setAttribute('stroke', 'black');
  assert.equal(line.inlineText(), '(280,130) -> (520,130)');
  assert.equal(line.detailLines().join('|'), 'x1=280 y1=130 x2=520 y2=130|stroke=black');

  const text = new TextShape('t1', 20, 40, 'My Diagram');
  text.setAttribute('text', 'My Diagram v2');
  assert.equal(text.textContent(), 'My Diagram v2');
  assert.equal(text.inlineText(), '(20,40) "My Diagram v2"');
  assert.equal(text.attributeValue('text'), 'My Diagram v2');
  assert.ok(text.detailLines().includes('text="My Diagram v2"'));
  assert.throws(() => text.setAttribute('width', '10'), /unknown attribute: width/);
});

test('GShape: move/scale 递归到子孙，容器自身无几何属性', () => {
  const group = new GShape('g1');
  const child = new RectShape('r1', 0, 0, 10, 10);
  group.append(child);
  group.move(10, 20);
  assert.equal(child.x(), 10);
  assert.equal(child.y(), 20);
  group.scale(2);
  assert.equal(child.width(), 20);
  assert.equal(group.inlineText(), '');
  assert.equal(group.elementCount(), 2);
  assert.throws(() => group.setAttribute('x', '1'), /unknown attribute: x/);
});

test('CanvasShape: 尺寸只能经 resize；作为图形被操作时显式报错', () => {
  const canvas = new CanvasShape(800, 600);
  assert.equal(canvas.sizeText(), '800x600');
  canvas.resize(1024, 768);
  assert.equal(canvas.sizeText(), '1024x768');
  assert.throws(() => canvas.resize(0, 100), /canvas size must be positive/);
  assert.throws(() => canvas.move(1, 2), /cannot modify the canvas as a shape/);
  assert.throws(() => canvas.scale(2), /cannot modify the canvas as a shape/);
  assert.throws(() => canvas.setAttribute('fill', 'red'), /cannot modify the canvas as a shape/);
  assert.equal(canvas.label(), 'svg');
});

test('NumberFormat: 极大/极小值用科学计数法，不产生 1e+3 或 Infinity', () => {
  assert.equal(NumberFormat.format(1e21), '1e+21');
  assert.equal(NumberFormat.format(1e300), '1e+300');
  assert.equal(NumberFormat.format(1e-7), '1e-7');
  assert.equal(NumberFormat.format(1e-6), '0.000001');
  assert.throws(() => NumberFormat.format(Number.POSITIVE_INFINITY), /invalid number/);
});

test('几何运算溢出时报错，且不把 Infinity 写进图形', () => {
  const rect = new RectShape('r1', 0, 0, 10, 10);
  rect.move(1e308, 0);
  assert.equal(rect.x(), 1e308);
  assert.throws(() => rect.move(1e308, 0), /x is out of range/);
  assert.equal(rect.x(), 1e308, '溢出时原值必须保持不变');
  assert.throws(() => rect.scale(Number.MAX_VALUE), /width is out of range|x is out of range/);
});
