import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication, type Application } from '../../src/host/Application.js';
import { CodeAssembly } from '../../src/host/CodeAssembly.js';
import ShapeBoxPlugin from '@svgframe/plugin-shape-box';
import { NodeFileStore } from '../../src/io/NodeFileStore.js';
import { BufferOutput } from '../support/BufferOutput.js';

/** 只装 box 插件：本文件只验证 box 语义，树标签的效果由 labels.integration 覆盖。 */
async function run(script: readonly string[], withPlugins = true): Promise<{ app: Application; lines: string[] }> {
  const output = new BufferOutput();
  const app = await createApplication({
    files: new NodeFileStore(),
    output,
    optionalAssembly: new CodeAssembly(withPlugins ? [new ShapeBoxPlugin()] : []),
  });
  await app.repl.run(linesOf(script));
  return { app, lines: output.value().split('\n').filter((line) => line.length > 0) };
}

async function* linesOf(items: readonly string[]): AsyncIterable<string> {
  for (const item of items) {
    yield item;
  }
}

const BOX = 'create box n1 120 100 160 60 "开始"';

test('box：创建后 tree 显示 box#n1 (box) 与两个必要子部件', async () => {
  const { lines } = await run(['init 800 600', BOX, 'tree']);
  assert.deepEqual(lines.slice(0, 3), [
    'canvas 800x600 created',
    'box#n1 created',
    'svg (800x600)',
  ]);
  assert.deepEqual(lines.slice(3), [
    '└── box#n1 (box)',
    '    ├── rect#n1-rect   x=120 y=100 w=160 h=60',
    '    └── text#n1-label  (140,135) "开始"',
  ]);
});

test('box：set fill / set label 各自是一个 undo 单元（undo 一次恢复，redo 一次重做）', async () => {
  const { lines } = await run([
    'init 800 600',
    BOX,
    'set n1 fill #f5a623',
    'set n1 label "处理数据 v2"',
    'tree',
    'undo',
    'tree',
    'redo',
    'tree',
  ]);
  assert.equal(lines[2], 'box#n1 updated: fill=#f5a623');
  assert.equal(lines[3], 'box#n1 updated: label=处理数据 v2');
  const first = lines.slice(4, 8);
  assert.ok(first.includes('    ├── rect#n1-rect   x=120 y=100 w=160 h=60 fill=#f5a623'));
  assert.ok(first.includes('    └── text#n1-label  (140,135) "处理数据 v2"'));

  assert.equal(lines[8], 'box#n1 updated: label=开始');
  const afterUndo = lines.slice(9, 13);
  assert.ok(afterUndo.includes('    └── text#n1-label  (140,135) "开始"'));
  assert.ok(afterUndo.includes('    ├── rect#n1-rect   x=120 y=100 w=160 h=60 fill=#f5a623'));

  assert.equal(lines[13], 'box#n1 updated: label=处理数据 v2');
  assert.ok(lines.slice(14).includes('    └── text#n1-label  (140,135) "处理数据 v2"'));
});

test('box：不变量由插件守住——删除/移走必要子部件、加第三个子部件、ungroup 都被拒绝', async () => {
  const { lines } = await run([
    'init 800 600',
    BOX,
    'create rect r2 0 0 10 10',
    'delete n1-rect',
    'addto n1 r2',
    'ungroup n1',
    'tree',
  ]);
  assert.deepEqual(lines.slice(3, 6), [
    'error: cannot remove required part of box: n1-rect',
    'error: not a container: n1',
    'error: not a container: n1',
  ]);
  // 三次被拒绝都没有改变结构
  assert.ok(lines.some((line) => line.includes('rect#n1-rect')));
  assert.ok(!lines.some((line) => line.startsWith('error') && line.includes('deleted')));
});

test('box：新增子树的 id 冲突时整条命令失败，不留容器或子部件', async () => {
  const { lines } = await run([
    'init 800 600',
    BOX,
    'create rect n1-label 0 0 5 5',
    'create box n1 0 0 10 10 "x"',
    'tree',
  ]);
  assert.equal(lines[2], 'error: id already exists: n1-label');
  assert.equal(lines[3], 'error: id already exists: n1');
  // 文档里只有一个 box（B O X 创建成功一次），失败的命令没有留下任何容器
  assert.equal(lines.filter((line) => line === 'box#n1 (box)' || line.includes('└── box#n1 (box)')).length, 1);
  assert.equal(lines.filter((line) => line.includes('box#n1')).length, 2); // 创建回显 + tree 行
});

test('box：save 写出 data-kind="box"，read 读回仍是 box（工厂/属性/结构一致）', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'svgframe-box-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'box.svg');

  const saved = await run(['init 800 600', BOX, 'set n1 fill #f5a623', `save ${path}`]);
  assert.equal(saved.lines.at(-1), `saved to ${path} (3 elements)`);
  const xml = readFileSync(path, 'utf8');
  assert.match(xml, /<g id="n1" data-kind="box">/);
  assert.match(xml, /<rect id="n1-rect" x="120" y="100" width="160" height="60" fill="#f5a623"\/>/);
  assert.match(xml, /<text id="n1-label" x="140" y="135">开始<\/text>/);

  const reloaded = await run([`read ${path}`, 'tree', 'set n1 label "新标题"']);
  assert.deepEqual(reloaded.lines.slice(0, 1), [`read ${path} (3 elements)`]);
  assert.ok(reloaded.lines.includes('└── box#n1 (box)'));
  assert.equal(reloaded.lines.at(-1), 'box#n1 updated: label=新标题');
});

test('box：未装插件时读回降级为普通 g（并给出 warning），行为与阶段 1 一致', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'svgframe-box-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'box.svg');
  await run(['init 800 600', BOX, `save ${path}`]);

  const { lines } = await run([`read ${path}`, 'tree', 'stats'], false);
  assert.equal(lines[0], "warning: unknown shape kind 'box', kept as plain g");
  assert.deepEqual(lines.slice(1, 2), [`read ${path} (3 elements)`]);
  assert.ok(lines.includes('└── g#n1'));
  assert.equal(lines.at(-1), 'error: unknown command: stats');
});

test('box：move/scale 作用于整体（两个子部件一起动）', async () => {
  const { lines } = await run(['init 800 600', BOX, 'move n1 10 20', 'scale n1 2', 'tree']);
  assert.equal(lines[2], 'box#n1 moved by (10,20)');
  assert.equal(lines[3], 'box#n1 scaled by 2');
  const tree = lines.slice(4);
  assert.ok(tree.includes('    ├── rect#n1-rect   x=260 y=240 w=320 h=120'));
  assert.ok(tree.includes('    └── text#n1-label  (300,310) "开始"'));
});
