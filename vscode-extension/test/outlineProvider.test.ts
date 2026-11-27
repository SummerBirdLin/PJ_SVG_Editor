import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { OutlineElement } from '../src/outline/OutlineElement';
import { OutlineParser } from '../src/outline/OutlineParser';
import { SvgOutlineProvider } from '../src/outline/SvgOutlineProvider';
import type { DocumentSymbolLike } from '../src/ports/VscodeLike';
import { FakeDocument, FakeUri, FakeVscode } from './support/FakeVscode';

const SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">',
  '  <g id="layer1">',
  '    <rect id="r1" x="1" y="2" width="3" height="4"/>',
  '    <g>',
  '      <circle id="c1" cx="5" cy="5" r="2"/>',
  '    </g>',
  '  </g>',
  '</svg>',
].join('\n');

function build(text: string): { provider: SvgOutlineProvider; document: FakeDocument; vscode: FakeVscode } {
  const vscode = new FakeVscode();
  return {
    provider: new SvgOutlineProvider(vscode),
    document: new FakeDocument(new FakeUri('/w/demo.svg'), text),
    vscode,
  };
}

function childAt(symbol: DocumentSymbolLike, index: number): DocumentSymbolLike {
  const child = symbol.children[index];
  assert.ok(child !== undefined, `expected child #${index} of ${symbol.name}`);
  return child;
}

function only(symbols: readonly DocumentSymbolLike[]): DocumentSymbolLike {
  const [symbol] = symbols;
  assert.ok(symbol !== undefined, 'expected exactly one root symbol');
  return symbol;
}

test('大纲返回层级化结构：根元素 / 容器 / 叶子，children 表达嵌套', () => {
  const { provider, document } = build(SVG);
  const root = only(provider.provideDocumentSymbols(document));

  assert.equal(root.name, 'svg');
  assert.equal(root.children.length, 1);

  const layer = childAt(root, 0);
  assert.equal(layer.name, 'g#layer1');
  assert.equal(layer.children.length, 2, '矩形与内层分组都是 layer1 的子节点');

  const rect = childAt(layer, 0);
  assert.equal(rect.name, 'rect#r1');
  assert.equal(rect.children.length, 0, '叶子节点没有 children');

  const inner = childAt(layer, 1);
  assert.equal(inner.name, 'g', '无 id 的元素只显示标签名');
  assert.equal(childAt(inner, 0).name, 'circle#c1');
});

test('节点类型：根用 symbolKinds.root，有子元素用 container，其余用 leaf', () => {
  const { provider, document, vscode } = build(SVG);
  const root = only(provider.provideDocumentSymbols(document));
  assert.equal(root.kind, vscode.symbolKinds.root);

  const layer = childAt(root, 0);
  assert.equal(layer.kind, vscode.symbolKinds.container);
  assert.equal(childAt(layer, 0).kind, vscode.symbolKinds.leaf);
  assert.equal(childAt(layer, 1).kind, vscode.symbolKinds.container);
});

function positionOf(offset: number): { line: number; character: number } {
  const before = SVG.slice(0, offset);
  return { line: before.split('\n').length - 1, character: offset - (before.lastIndexOf('\n') + 1) };
}

test('range 覆盖整个元素、selectionRange 覆盖起始标签（点击定位到源码）', () => {
  const { provider, document } = build(SVG);
  const root = only(provider.provideDocumentSymbols(document));
  const layer = childAt(root, 0);
  const rect = childAt(layer, 0);

  const svgStart = SVG.indexOf('<svg');
  const svgEnd = SVG.indexOf('</svg>') + '</svg>'.length;
  assert.deepEqual(root.range.start, positionOf(svgStart));
  assert.deepEqual(root.range.end, positionOf(svgEnd), '结束于 </svg> 之后');

  const rootTagEnd = SVG.indexOf('>') + 1;
  assert.deepEqual(root.selectionRange.start, positionOf(svgStart));
  assert.deepEqual(root.selectionRange.end, positionOf(rootTagEnd), '只覆盖起始标签，不覆盖整个根元素');

  const layerStart = SVG.indexOf('<g id="layer1">');
  const layerTagEnd = SVG.indexOf('>', layerStart) + 1;
  const layerEnd = SVG.lastIndexOf('</g>', svgEnd) + '</g>'.length;
  assert.deepEqual(layer.range.start, positionOf(layerStart));
  assert.deepEqual(layer.range.end, positionOf(layerEnd), '覆盖 <g>…</g> 整体');
  assert.deepEqual(layer.selectionRange.start, positionOf(layerStart));
  assert.deepEqual(layer.selectionRange.end, positionOf(layerTagEnd));

  const rectStart = SVG.indexOf('<rect');
  assert.deepEqual(rect.range, rect.selectionRange, '自闭合元素的整体范围就是标签本身');
  assert.deepEqual(rect.range.start, positionOf(rectStart));
});

test('编辑更新：同一份文档文本变化后，大纲随之更新（新增/删除/改名/改结构都能反映）', () => {
  const { provider, document } = build('<svg><g id="a"><rect id="r1"/></g></svg>');
  assert.equal(only(provider.provideDocumentSymbols(document)).children.length, 1);

  // 1) 新增一个分组
  document.setText('<svg><g id="a"><rect id="r1"/></g><g id="b"/></svg>');
  let root = only(provider.provideDocumentSymbols(document));
  assert.equal(root.children.length, 2);
  assert.equal(childAt(root, 1).name, 'g#b');

  // 2) 删除叶子：只剩内层分组
  document.setText('<svg><g id="a"><g/></g><g id="b"/></svg>');
  root = only(provider.provideDocumentSymbols(document));
  assert.equal(childAt(root, 0).children.length, 1);
  assert.equal(childAt(childAt(root, 0), 0).name, 'g');

  // 3) 改 id：节点显示文本跟着变
  document.setText('<svg><g id="renamed"><rect id="r1"/></g><g id="b"/></svg>');
  root = only(provider.provideDocumentSymbols(document));
  assert.equal(childAt(root, 0).name, 'g#renamed');

  // 4) 移动节点：嵌套关系跟着变
  document.setText('<svg><g id="b"><g id="a"/></g></svg>');
  root = only(provider.provideDocumentSymbols(document));
  assert.equal(childAt(root, 0).name, 'g#b');
  assert.equal(childAt(childAt(root, 0), 0).name, 'g#a');
});

test('编辑过程中的行数变化会让定位重新计算（不是缓存的旧位置）', () => {
  const { provider, document } = build('<svg>\n  <rect id="r1"/>\n</svg>');
  assert.deepEqual(childAt(only(provider.provideDocumentSymbols(document)), 0).range.start, {
    line: 1,
    character: 2,
  });

  document.setText('<svg>\n\n\n  <rect id="r1"/>\n</svg>');
  assert.deepEqual(childAt(only(provider.provideDocumentSymbols(document)), 0).range.start, {
    line: 3,
    character: 2,
  });
});

test('不完整 XML：返回空大纲且不抛错（编辑中途不会崩）', () => {
  const { provider, document } = build(SVG);
  for (const broken of [
    '<svg><g id="a">',
    '<svg><g id="a"></svg></g>',
    '<svg><!-- 正在写注释',
    '<svg><rect id="r1"',
    '<svg><rect id="r1" x="1/></svg>',
    '',
  ]) {
    document.setText(broken);
    assert.deepEqual(provider.provideDocumentSymbols(document), [], `broken text: ${JSON.stringify(broken)}`);
  }
});

test('从"坏掉"回到"完好"后大纲恢复（编辑中断不是永久失效）', () => {
  const { provider, document } = build(SVG);
  document.setText('<svg><g id="a"><rect id="r1"');
  assert.deepEqual(provider.provideDocumentSymbols(document), []);

  document.setText(SVG);
  const root = only(provider.provideDocumentSymbols(document));
  assert.equal(childAt(childAt(root, 0), 0).name, 'rect#r1');
});

test('CRLF 文档的行列换算正确', () => {
  const { provider, document } = build('<svg>\r\n  <g id="a">\r\n    <rect id="r1"/>\r\n  </g>\r\n</svg>');
  const root = only(provider.provideDocumentSymbols(document));
  assert.deepEqual(childAt(root, 0).range.start, { line: 1, character: 2 });
  assert.deepEqual(childAt(childAt(root, 0), 0).range.start, { line: 2, character: 4 });
});

test('解析器内部异常被兜底成空大纲，不会把错误抛给 VSCode', () => {
  class ThrowingParser extends OutlineParser {
    override parse(): readonly OutlineElement[] {
      throw new Error('boom');
    }
  }

  const vscode = new FakeVscode();
  const provider = new SvgOutlineProvider(vscode, new ThrowingParser());
  const document = new FakeDocument(new FakeUri('/w/bad.svg'), '<svg/>');
  assert.deepEqual(provider.provideDocumentSymbols(document), []);
});
