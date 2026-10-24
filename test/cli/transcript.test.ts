import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { CliHarness } from '../support/CliHarness.js';

const DEMO = 'test/.tmp/demo.svg';
const FLOWCHART = 'test/.tmp/flowchart.svg';

test('transcript：需求 §6 的完整会话（含 tree/show/undo/redo/io 闸门/自动补 id）', async () => {
  mkdirSync('test/.tmp', { recursive: true });
  const harness = new CliHarness();
  const output = await harness.run([
    '# 需求文档 §6：完整会话',
    'init 800 600',
    'create rect bg 0 0 800 600 #ffffff',
    'create text title 20 40 "My Diagram"',
    'create circle c1 100 100 20 red',
    'create rect box 200 80 60 60 #3366ff',
    'group markers c1 box',
    'tree',
    'move c1 30 0',
    'undo',
    'redo',
    'set title text "My Diagram v2"',
    'undo',
    'group bad c1 markers',
    'delete box',
    'undo',
    `save ${DEMO}`,
    'undo',
    'read test/fixtures/other.svg',
    'tree',
  ].join('\n'));

  const expected = [
    'canvas 800x600 created',
    'rect#bg created',
    'text#title created',
    'circle#c1 created',
    'rect#box created',
    'g#markers created with 2 children',
    'svg (800x600)',
    '├── rect#bg     x=0 y=0 w=800 h=600 fill=#ffffff',
    '├── text#title  (20,40) "My Diagram"',
    '└── g#markers',
    '    ├── circle#c1  cx=100 cy=100 r=20 fill=red',
    '    └── rect#box   x=200 y=80 w=60 h=60 fill=#3366ff',
    'circle#c1 moved to (130,100)',
    'circle#c1 moved back to (100,100)',
    'circle#c1 moved to (130,100)',
    'text#title updated: text="My Diagram v2"',
    'text#title updated: text="My Diagram"',
    'error: cannot group a container into its own descendant: markers',
    'rect#box deleted',
    'rect#box restored into g#markers',
    `saved to ${DEMO} (5 elements)`,
    'error: undo not allowed after io command',
    'warning: assigned id rect1 to unnamed <rect>',
    'read test/fixtures/other.svg (7 elements)',
    'svg (400x300)',
    '├── rect#rect1  x=0 y=0 w=400 h=300 fill=#ffffff',
    '├── text#t1     (10,290) "imported"',
    '├── circle#c1   cx=50 cy=50 r=10',
    '├── g#g1',
    '│   ├── rect#r2    x=0 y=0 w=10 h=10',
    '│   └── circle#c2  cx=5 cy=5 r=2',
    '└── ellipse#e1  cx=1 cy=2 rx=3 ry=4',
    '',
  ].join('\n');

  assert.equal(output, expected);

  const saved = readFileSync(DEMO, 'utf8');
  assert.equal(saved, [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">',
    '  <rect id="bg" x="0" y="0" width="800" height="600" fill="#ffffff"/>',
    '  <text id="title" x="20" y="40">My Diagram</text>',
    '  <g id="markers">',
    '    <circle id="c1" cx="130" cy="100" r="20" fill="red"/>',
    '    <rect id="box" x="200" y="80" width="60" height="60" fill="#3366ff"/>',
    '  </g>',
    '</svg>',
    '',
  ].join('\n'));
});

test('transcript：需求 §6.1 两节点流程图（in 子句自顶向下建树）', async () => {
  mkdirSync('test/.tmp', { recursive: true });
  const harness = new CliHarness();
  const output = await harness.run([
    'init 800 600',
    'create g flowchart',
    'create g node1 in flowchart',
    'create rect start 120 100 160 60 #4a90d9 in node1',
    'create text start-label 155 135 "开始" in node1',
    'create g node2 in flowchart',
    'create rect process 520 100 160 60 #f5a623 in node2',
    'create text process-label 545 135 "处理数据" in node2',
    'create line arrow1 280 130 520 130 black in flowchart',
    'tree',
    'move node2 0 100',
    'undo',
    'set process-label text "处理数据 v2"',
    `save ${FLOWCHART}`,
  ].join('\n'));

  const expected = [
    'canvas 800x600 created',
    'g#flowchart created',
    'g#node1 created in g#flowchart',
    'rect#start created in g#node1',
    'text#start-label created in g#node1',
    'g#node2 created in g#flowchart',
    'rect#process created in g#node2',
    'text#process-label created in g#node2',
    'line#arrow1 created in g#flowchart',
    'svg (800x600)',
    '└── g#flowchart',
    '    ├── g#node1',
    '    │   ├── rect#start        x=120 y=100 w=160 h=60 fill=#4a90d9',
    '    │   └── text#start-label  (155,135) "开始"',
    '    ├── g#node2',
    '    │   ├── rect#process        x=520 y=100 w=160 h=60 fill=#f5a623',
    '    │   └── text#process-label  (545,135) "处理数据"',
    '    └── line#arrow1  (280,130) -> (520,130)',
    'g#node2 moved by (0,100)',
    'g#node2 moved back by (0,-100)',
    'text#process-label updated: text="处理数据 v2"',
    `saved to ${FLOWCHART} (8 elements)`,
    '',
  ].join('\n');

  assert.equal(output, expected);
});

test('transcript：tree <id> / show / help / 注释与空行 / exit', async () => {
  const harness = new CliHarness();
  const output = await harness.run([
    '',
    '# 注释行不产生输出',
    'init 400 300',
    'create g node1',
    'create rect r1 10 20 30 40 #eee in node1',
    'tree node1',
    'show r1',
    'help',
    'exit',
    'create rect never 0 0 1 1',
  ].join('\n'));

  const lines = output.split('\n');
  assert.deepEqual(lines.slice(0, 8), [
    'canvas 400x300 created',
    'g#node1 created',
    'rect#r1 created in g#node1',
    'g#node1',
    '└── rect#r1  x=10 y=20 w=30 h=40 fill=#eee',
    'rect#r1  parent=g#node1',
    '  x=10 y=20 width=30 height=40',
    '  fill=#eee',
  ]);
  assert.ok(output.includes('help'));
  assert.ok(output.includes('create <type> <id> [params…] [in <containerId>]'));
  assert.ok(!output.includes('rect#never'), 'exit 之后的命令不应执行');
});

test('transcript：错误路径（未 init、未知命令、参数错误、文件不存在）', async () => {
  const harness = new CliHarness();
  const output = await harness.run([
    'tree',
    'create rect r1 0 0 1 1',
    'foo bar',
    'init',
    'create rect r1 0 0',
    'move r9 1 1',
    'read missing.svg',
    'save',
    'undo',
  ].join('\n'));

  assert.equal(output, [
    "error: no document. use 'init' or 'read' first",
    "error: no document. use 'init' or 'read' first",
    'error: unknown command: foo',
    'canvas 800x600 created',
    'error: usage: create rect <id> <x> <y> <width> <height> [fill]',
    'error: no such shape: r9',
    'error: cannot read file: missing.svg',
    "error: no file path: use 'save <file.svg>'",
    // init 之后没有任何成功的编辑命令 → IO 闸门仍然生效（而非 nothing to undo）
    'error: undo not allowed after io command',
    '',
  ].join('\n'));
});

test('transcript: canvas 单参只改宽度（高度沿用），双参才完整修改', async () => {
  const harness = new CliHarness();
  const output = await harness.run([
    'init 800 600',
    'canvas 400',
    'canvas',
    'canvas 500 300',
    'canvas',
  ].join('\n'));

  assert.equal(output, [
    'canvas 800x600 created',
    'canvas resized to 400x600',
    'canvas 400x600',
    'canvas resized to 500x300',
    'canvas 500x300',
    '',
  ].join('\n'));
});
