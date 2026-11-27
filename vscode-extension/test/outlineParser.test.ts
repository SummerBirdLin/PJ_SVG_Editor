import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OutlineElement } from '../src/outline/OutlineElement';
import { OutlineParser } from '../src/outline/OutlineParser';

const parser = new OutlineParser();

function parseOk(text: string): readonly OutlineElement[] {
  const roots = parser.parse(text);
  assert.ok(roots.length > 0, 'expected a non-empty outline');
  return roots;
}

function first(roots: readonly OutlineElement[]): OutlineElement {
  const [root] = roots;
  assert.ok(root !== undefined, 'expected a root element');
  return root;
}

function childAt(element: OutlineElement, index: number): OutlineElement {
  const child = element.children()[index];
  assert.ok(child !== undefined, `expected child #${index} of <${element.label()}>`);
  return child;
}

test('嵌套分组：<svg> → <g> → <g> → 叶子，层级与 Phase 1 的 Composite 结构一致', () => {
  const text = [
    '<svg xmlns="http://www.w3.org/2000/svg">',
    '  <g id="layer1">',
    '    <g>',
    '      <rect id="r1" x="1" y="2" width="3" height="4" />',
    '    </g>',
    '    <circle id="c1" cx="5" cy="5" r="2"/>',
    '  </g>',
    '</svg>',
  ].join('\n');

  const root = first(parseOk(text));
  assert.equal(root.name(), 'svg');
  assert.equal(root.label(), 'svg', '根元素没有 id 时只显示标签名');
  assert.equal(root.children().length, 1);

  const layer = childAt(root, 0);
  assert.equal(layer.label(), 'g#layer1');
  assert.equal(layer.children().length, 2);

  const inner = childAt(layer, 0);
  assert.equal(inner.label(), 'g', '无 id 的 <g> 只显示标签名');
  assert.equal(childAt(inner, 0).label(), 'rect#r1');

  const circle = childAt(layer, 1);
  assert.equal(circle.label(), 'circle#c1');
  assert.equal(circle.children().length, 0);
});

test('无 id 元素：label() 不臆造 id（Phase 1 的 SvgReader 会给它补 id，这正是不能复用模型的原因）', () => {
  const root = first(parseOk('<svg><rect x="0" y="0" width="1" height="1"/></svg>'));
  assert.equal(childAt(root, 0).label(), 'rect');
  assert.equal(childAt(root, 0).id(), null);
});

test('偏移量：range 覆盖整个元素，selectionRange 只覆盖起始标签', () => {
  const text = '<svg>\n  <g id="a">\n    <rect id="r"/>\n  </g>\n</svg>';
  const root = first(parseOk(text));
  const group = childAt(root, 0);
  const rect = childAt(group, 0);

  assert.equal(text.slice(root.start(), root.end()), text);
  assert.equal(text.slice(group.start(), group.end()), '<g id="a">\n    <rect id="r"/>\n  </g>');
  assert.equal(text.slice(group.start(), group.tagEnd()), '<g id="a">');
  assert.equal(text.slice(rect.start(), rect.end()), '<rect id="r"/>');
  assert.equal(text.slice(rect.tagEnd(), rect.end()), '', '自闭合元素的结束位置就是起始标签末尾');
});

test('空白、声明、注释、DOCTYPE、CDATA 都不产生节点，也不会错位', () => {
  const text = [
    '\uFEFF',
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">',
    '<!-- 顶层注释 -->',
    '<svg>',
    '  <!-- 注释里的 <rect id="ghost"/> 不应出现 -->',
    '  <style><![CDATA[ .a { fill: red; } ]]></style>',
    '  <rect id="r1"/>',
    '</svg>',
  ].join('\n');

  const root = first(parseOk(text));
  assert.equal(root.children().length, 2);
  assert.equal(childAt(root, 0).label(), 'style', 'CDATA 内容被跳过，不产生伪节点');
  assert.equal(childAt(root, 1).label(), 'rect#r1');
  assert.equal(text.slice(root.children()[1]?.start() ?? -1, root.children()[1]?.end() ?? -1), '<rect id="r1"/>');
});

test('属性值里出现 > 不会提前截断标签', () => {
  const text = '<svg><text id="t1" data-note="a > b">hi</text></svg>';
  const root = first(parseOk(text));
  assert.equal(childAt(root, 0).label(), 'text#t1');
  assert.equal(root.children().length, 1);
});

test('未识别的元素照样进大纲（大纲是文件结构，不是 Phase 1 的模型）', () => {
  const text = '<svg><defs><linearGradient id="lg1"><stop offset="0"/></linearGradient></defs><path id="p1" d="M0 0"/></svg>';
  const root = first(parseOk(text));
  const defs = childAt(root, 0);
  assert.equal(defs.label(), 'defs');
  assert.equal(childAt(defs, 0).label(), 'linearGradient#lg1');
  assert.equal(childAt(childAt(defs, 0), 0).label(), 'stop');
  assert.equal(childAt(root, 1).label(), 'path#p1');
});

test('不完整 XML：未闭合元素 → 空大纲（不是抛错）', () => {
  assert.deepEqual(parser.parse('<svg><g id="a">'), []);
  assert.deepEqual(parser.parse('<svg><g>'), []);
  assert.deepEqual(parser.parse('<svg>'), []);
});

test('不完整 XML：标签不匹配 / 多余结束标签 → 空大纲', () => {
  assert.deepEqual(parser.parse('<svg><g id="a"></svg></g>'), []);
  assert.deepEqual(parser.parse('<svg></g></svg>'), []);
});

test('不完整 XML：注释、标签、属性值未闭合 → 空大纲', () => {
  assert.deepEqual(parser.parse('<svg><!-- 正在输入'), []);
  assert.deepEqual(parser.parse('<svg><rect id="a"'), []);
  assert.deepEqual(parser.parse('<svg><rect id="a" x="1/></svg>'), []);
  assert.deepEqual(parser.parse('<?xml version="1.0"'), []);
});

test('空文件 / 纯文本 / 只有注释 → 空大纲，且不抛错', () => {
  assert.deepEqual(parser.parse(''), []);
  assert.deepEqual(parser.parse('   \n\t  '), []);
  assert.deepEqual(parser.parse('not xml at all'), []);
  assert.deepEqual(parser.parse('<!-- only a comment -->'), []);
});

test('编辑中的半截输入不会让解析器崩溃（逐字符截断全量扫一遍）', () => {
  const full = '<svg xmlns="x"><g id="a"><rect id="r1" x="1"/><circle id="c1" r="2"/></g></svg>';
  for (let length = 0; length <= full.length; length += 1) {
    const result = parser.parse(full.slice(0, length));
    assert.ok(Array.isArray(result), `prefix ${length} 必须返回数组`);
    for (const element of result) {
      assert.ok(element.start() >= 0 && element.end() >= element.start());
    }
  }
});

test('多个根元素：各自成为顶层节点（容错，不当成致命错误）', () => {
  const roots = parseOk('<svg><rect id="a"/></svg><svg><rect id="b"/></svg>');
  assert.equal(roots.length, 2);
  const [firstRoot, secondRoot] = roots;
  assert.ok(firstRoot !== undefined && secondRoot !== undefined);
  assert.equal(childAt(firstRoot, 0).label(), 'rect#a');
  assert.equal(childAt(secondRoot, 0).label(), 'rect#b');
});

test('超深嵌套（>256 层）直接放弃，返回空大纲而不是把栈打爆', () => {
  const depth = 300;
  const text = '<svg>' + '<g>'.repeat(depth) + '</g>'.repeat(depth) + '</svg>';
  assert.deepEqual(parser.parse(text), []);
});

test('边界内的深嵌套（100 层）正常返回', () => {
  const depth = 100;
  const text = '<svg>' + '<g>'.repeat(depth) + '</g>'.repeat(depth) + '</svg>';
  const roots = parseOk(text);
  let current = first(roots);
  let count = 0;
  while (current.children().length > 0) {
    current = childAt(current, 0);
    count += 1;
  }
  assert.equal(count, depth);
});
