import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApplication, type Application } from '../../src/host/Application.js';
import { CodeAssembly } from '../../src/host/CodeAssembly.js';
import { ConfigAssembly } from '../../src/host/ConfigAssembly.js';
import { optionalPlugins } from '../../src/host/CodePlugins.js';
import TreeStarPlugin from '@svgframe/plugin-tree-star';
import { NodeFileStore } from '../../src/io/NodeFileStore.js';
import type { PluginAssembly } from '../../src/host/PluginAssembly.js';
import { BufferOutput } from '../support/BufferOutput.js';

async function run(
  script: readonly string[],
  assembly: PluginAssembly = new CodeAssembly(optionalPlugins()),
): Promise<{ app: Application; lines: string[] }> {
  const output = new BufferOutput();
  const app = await createApplication({ files: new NodeFileStore(), output, optionalAssembly: assembly });
  await app.repl.run(linesOf(script));
  return { app, lines: output.value().split('\n').filter((line) => line.length > 0) };
}

async function* linesOf(items: readonly string[]): AsyncIterable<string> {
  for (const item of items) {
    yield item;
  }
}

/** 取出从 `fromIndex` 开始的一块连续树行（遇到非树行即停止）。 */
function treeBlock(lines: readonly string[], fromIndex: number): string[] {
  const block: string[] = [];
  for (let index = fromIndex; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (!/^(svg |[\u2502\u251c\u2514]| {4})/.test(line)) {
      break;
    }
    block.push(line);
  }
  return block;
}

test('标签：`(box)` 与 `modified-star` 并存且互不感知（同一行按注册顺序拼接）', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'svgframe-labels-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'savepoint.svg');

  const { lines } = await run([
    'init 400 300',
    'create box n1 10 10 100 40 "开始"',
    'create rect r2 0 0 10 10',
    `save ${path}`,
    'tree',
    'set n1 fill red',
    'tree',
    'undo',
    'tree',
  ]);

  const treeStarts = lines
    .map((line, index) => (line.startsWith('svg (') ? index : -1))
    .filter((index) => index >= 0);
  assert.equal(treeStarts.length, 3, '会话里有三次 tree');

  // ① 保存点之后：只有 (box) 标签，没有 *
  const afterSave = treeBlock(lines, treeStarts[0] ?? 0);
  assert.ok(afterSave.includes('├── box#n1 (box)'));
  assert.ok(afterSave.every((line) => !line.endsWith('*')));

  // ② 编辑 box 的 fill（落在内部矩形上）→ 该叶子行带 *，box 行仍只有 (box)
  const afterEdit = treeBlock(lines, treeStarts[1] ?? 0);
  assert.ok(afterEdit.includes('├── box#n1 (box)'));
  assert.ok(afterEdit.some((line) => line.includes('rect#n1-rect') && line.endsWith('*')));
  assert.equal(afterEdit[0], 'svg (400x300) *');

  // ③ undo 回到保存点 → * 消失，(box) 仍在
  const afterUndo = treeBlock(lines, treeStarts[2] ?? 0);
  assert.ok(afterUndo.every((line) => !line.endsWith('*')));
  assert.ok(afterUndo.includes('├── box#n1 (box)'));
});

test('标签：只有 modified-star 时的缺省行为（不装 box 插件也没有 (box) 标签）', async () => {
  const { lines } = await run(
    ['init 100 100', 'create g g1', 'create rect r1 0 0 5 5 in g1', 'tree'],
    new CodeAssembly([new TreeStarPlugin()]),
  );
  assert.ok(lines.includes('└── g#g1 *'));
  assert.ok(!lines.some((line) => line.includes('(box)')));
});

test('树基线：没有标签插件时 tree 输出与阶段 1 逐字节一致（无尾随空格）', async () => {
  const { lines } = await run(['init 100 100', 'create g g1', 'create rect r1 0 0 5 5 in g1', 'tree'], new CodeAssembly([]));
  assert.deepEqual(lines.slice(3), ['svg (100x100)', '└── g#g1', '    └── rect#r1  x=0 y=0 w=5 h=5']);
  assert.ok(lines.every((line) => line === line.trimEnd()));
});

test('双装配：box 会话在代码装配与配置装配下输出逐字节一致（含两个标签）', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'svgframe-dual-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const script = readFileSync(join('doc', 'transcript', 'box.txt'), 'utf8').split('\n');
  const configPath = resolve('plugins.config.json');

  const byCode = await run(script);
  const byConfig = await run(script, new ConfigAssembly(configPath, (path) => readFileSync(path, 'utf8')));

  // box.txt 里 save 写到 examples/box.svg（仓库内、已被 .gitignore 排除）
  assert.deepEqual(byConfig.lines, byCode.lines);
  assert.deepEqual(
    byConfig.app.contributions.treeDecorators().map((item) => item.decoratorName),
    ['box-type-label', 'modified-star'],
  );
});
