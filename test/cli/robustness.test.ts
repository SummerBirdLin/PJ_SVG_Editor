import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { CliHarness } from '../support/CliHarness.js';

const CJK_SVG = 'test/.tmp/cjk.svg';
const DEEP_SVG = 'test/.tmp/deep.svg';

test('save → read 回读结构一致；CJK id 在 tree 里按显示宽度对齐', async () => {
  mkdirSync('test/.tmp', { recursive: true });
  const harness = new CliHarness();
  const tree = [
    'svg (800x600)',
    '├── rect#中文    x=0 y=0 w=10 h=10',
    '├── text#中文二  (1,2) "x"',
    '└── rect#abc     x=3 y=4 w=5 h=6',
    '',
  ].join('\n');

  const output = await harness.run([
    'init 800 600',
    'create rect 中文 0 0 10 10',
    'create text 中文二 1 2 "x"',
    'create rect abc 3 4 5 6',
    'tree',
    `save ${CJK_SVG}`,
    `read ${CJK_SVG}`,
    'tree',
  ].join('\n'));

  assert.equal(output, [
    'canvas 800x600 created',
    'rect#中文 created',
    'text#中文二 created',
    'rect#abc created',
    tree.trimEnd(),
    `saved to ${CJK_SVG} (3 elements)`,
    `read ${CJK_SVG} (3 elements)`,
    tree.trimEnd(),
    '',
  ].join('\n'));
});

test('异常输入不打断 REPL：悬空 in、空 id、超深嵌套文件', async () => {
  mkdirSync('test/.tmp', { recursive: true });
  writeFileSync(DEEP_SVG, `<svg>${'<g>'.repeat(5000)}${'</g>'.repeat(5000)}</svg>`, 'utf8');

  const harness = new CliHarness();
  const output = await harness.run([
    'init 100 100',
    'create rect r1 0 0 10 10 in',
    'create rect "" 0 0 1 1',
    `read ${DEEP_SVG}`,
    'create circle c1 1 1 2',
    'tree',
  ].join('\n'));

  assert.equal(output, [
    'canvas 100x100 created',
    'error: usage: create <type> <id> [params…] [in <containerId>]',
    'error: invalid id: id must not be empty',
    'error: invalid svg: nesting too deep (max 256)',
    'circle#c1 created',
    'svg (100x100)',
    '└── circle#c1  cx=1 cy=1 r=2',
    '',
  ].join('\n'));
});
