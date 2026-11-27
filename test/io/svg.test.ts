import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditorError } from '../../src/domain/EditorError.js';
import { ShapeFactory } from '../../src/domain/shape/ShapeFactory.js';
import { GShape } from '../../src/domain/shape/GShape.js';
import { SvgReader } from '../../src/io/SvgReader.js';
import { SvgWriter } from '../../src/io/SvgWriter.js';
import { XmlParser } from '../../src/io/xml/XmlParser.js';
import { createTestShapes } from '../support/Kernel.js';

const SVG_HEAD = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">';

function decode(body: string): ReturnType<SvgReader['decode']> {
  return new SvgReader(createTestShapes()).decode(`${SVG_HEAD}${body}</svg>`);
}

test('XmlParser: 声明/注释/实体/自闭合/嵌套文本', () => {
  const root = new XmlParser().parse(
    '<?xml version="1.0"?>\n<!-- c --><svg width="10"><text>a &amp; b &lt;c&gt; &#65;</text><rect/></svg>',
  );
  assert.equal(root.name, 'svg');
  assert.equal(root.attribute('width'), '10');
  assert.equal(root.children().length, 2);
  const text = root.children()[0];
  assert.ok(text !== undefined);
  assert.equal(text.text(), 'a & b <c> A');
  assert.equal(root.children()[1]?.name, 'rect');
});

test('XmlParser: 结构错误给出 invalid svg 前缀的单行错误', () => {
  assert.throws(() => new XmlParser().parse('<svg><rect></svg>'), /invalid svg: mismatched closing tag/);
  assert.throws(() => new XmlParser().parse(''), /invalid svg: no root element/);
  assert.throws(() => new XmlParser().parse('<svg><rect>'), /invalid svg: unclosed element <rect>/);
  assert.throws(() => new XmlParser().parse('<svg a=1></svg>'), /invalid svg: unquoted attribute value/);
});

test('SvgReader: 读入结构与属性；缺 id 自动补并告警', () => {
  const result = decode(`
    <rect x="0" y="0" width="400" height="300" fill="#ffffff"/>
    <text id="t1" x="10" y="290">imported</text>
    <g id="g1"><circle id="c2" cx="5" cy="5" r="2"/></g>
  `);
  assert.deepEqual(result.warnings, ['warning: assigned id rect1 to unnamed <rect>']);
  assert.equal(result.document.width(), 400);
  assert.equal(result.document.elementCount(), 4);
  const rect = result.document.findById('rect1');
  assert.ok(rect !== null);
  assert.equal(rect.attributeValue('fill'), '#ffffff');
  const group = result.document.findById('g1');
  assert.ok(group instanceof GShape);
  assert.deepEqual(group.children().map((child) => child.id()), ['c2']);
});

test('SvgReader: 重复 id 重新分配、未支持元素跳过、非法几何跳过', () => {
  const result = decode(`
    <rect id="r1" width="10" height="10"/>
    <circle id="r1" cx="1" cy="1" r="1"/>
    <polygon points="0,0 1,1 2,2"/>
    <rect id="bad" width="-5" height="10"/>
  `);
  assert.deepEqual(result.warnings, [
    'warning: assigned id circle1 to duplicate id r1',
    'warning: unsupported element <polygon> ignored',
    'warning: skipped <rect> rect#bad: width must be non-negative',
  ]);
  assert.equal(result.document.elementCount(), 2);
});

test('SvgReader: transform 保留但不参与坐标；未知 data-kind 降级为 g', () => {
  const result = decode(`
    <g id="diagram" transform="translate(60,40)">
      <rect id="a" x="0" y="0" width="10" height="10"/>
      <g id="n1" data-kind="box"><rect id="n1-rect" x="0" y="0" width="5" height="5"/></g>
    </g>
  `);
  assert.deepEqual(result.warnings, [
    'warning: transform not applied: g#diagram',
    "warning: unknown shape kind 'box', kept as plain g",
  ]);
  const diagram = result.document.findById('diagram');
  assert.ok(diagram instanceof GShape);
  const child = result.document.findById('a');
  assert.ok(child !== null);
  assert.equal(child.attributeValue('x'), '0');

  const saved = new SvgWriter().encode(result.document);
  assert.ok(saved.includes('transform="translate(60,40)"'), '未知属性（transform）应原样写回');
  assert.ok(saved.includes('data-kind="box"'), 'data-kind 应原样写回');
});

test('SvgWriter: 属性顺序、缩进、text 子文本与转义', () => {
  const factory = createTestShapes();
  const reader = new SvgReader(factory);
  const { document } = reader.decode(
    `${SVG_HEAD}<rect id="r1" x="1" y="2" width="3" height="4" fill="red" fill-opacity="0.5"/>`
      + '<text id="t1" x="5" y="6">a &lt; b &amp; "c"</text>'
      + '<g id="empty"/></svg>',
  );
  const output = new SvgWriter().encode(document);
  assert.equal(output, [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">',
    '  <rect id="r1" x="1" y="2" width="3" height="4" fill="red" fill-opacity="0.5"/>',
    '  <text id="t1" x="5" y="6">a &lt; b &amp; "c"</text>',
    '  <g id="empty"/>',
    '</svg>',
    '',
  ].join('\n'));
});

test('SvgReader/SvgWriter: 编码→解码→编码 幂等（round-trip）', () => {
  const factory = createTestShapes();
  const first = new SvgReader(factory).decode(
    `${SVG_HEAD}<g id="flow"><rect id="a" x="1.5" y="2" width="10" height="20" fill="#4a90d9"/>`
      + '<line id="e" x1="0" y1="0" x2="10" y2="10" stroke="black"/></g></svg>',
  ).document;
  const writer = new SvgWriter();
  const text = writer.encode(first);
  const second = new SvgReader(createTestShapes()).decode(text);
  assert.equal(second.warnings.length, 0);
  assert.equal(writer.encode(second.document), text);
});

test('SvgReader: 缺 width/height 回退 800x600；根元素必须是 svg', () => {
  const result = new SvgReader(createTestShapes()).decode('<svg><rect id="a"/></svg>');
  assert.equal(result.document.width(), 800);
  assert.equal(result.document.height(), 600);
  assert.throws(
    () => new SvgReader(createTestShapes()).decode('<g id="a"/>'),
    (error: unknown) =>
      error instanceof EditorError
      && error.message === 'invalid svg: root element must be <svg>, got <g>',
  );
  assert.throws(
    () => new SvgReader(createTestShapes()).decode('<svg><rect></svg>'),
    /invalid svg: mismatched closing tag/,
  );
});

test('SvgReader: text 子元素按顺序展平并告警；viewBox 回退画布尺寸', () => {
  const result = new SvgReader(createTestShapes()).decode(
    '<svg viewBox="0 0 200 100"><text id="t1" x="1" y="2">a<tspan>中</tspan>b</text></svg>',
  );
  assert.deepEqual(result.warnings, ['warning: flattened nested elements in text#t1']);
  assert.equal(result.document.width(), 200);
  assert.equal(result.document.height(), 100);
  const text = result.document.findById('t1');
  assert.ok(text !== null);
  assert.equal(text.textContent(), 'a中b');
});

test('XmlParser: 超深嵌套报 invalid svg，而不是栈溢出崩溃', () => {
  const deep = `<svg>${'<g>'.repeat(300)}${'</g>'.repeat(300)}</svg>`;
  assert.throws(() => new XmlParser().parse(deep), /invalid svg: nesting too deep/);
  assert.throws(
    () => new SvgReader(createTestShapes()).decode(deep),
    /invalid svg: nesting too deep/,
  );
});
