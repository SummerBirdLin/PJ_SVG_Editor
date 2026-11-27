import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApplication } from '../../src/host/Application.js';
import { CodeAssembly } from '../../src/host/CodeAssembly.js';
import { ConfigAssembly } from '../../src/host/ConfigAssembly.js';
import { NodeFileStore } from '../../src/io/NodeFileStore.js';
import { BufferOutput } from '../support/BufferOutput.js';

/**
 * 阶段 1 兼容性：**禁用全部可选插件**后重放 §6 基础会话，
 * 输出必须与 `tag final` 的输出逐字节相同。
 *
 * `cli-1.baseline.expected` 是用 `git archive final | tsx src/main.ts` 直接跑出来的冻结基线；
 * 它同时被 `plugins-none.config.json`（配置装配）与 `CodeAssembly([])`（代码装配）两条路验证。
 */
const BASELINE = join('doc', 'transcript', 'cli-1.baseline.expected');

async function replayWith(assembly: CodeAssembly | ConfigAssembly): Promise<string[]> {
  const script = readFileSync(join('doc', 'transcript', 'cli-1.txt'), 'utf8');
  const output = new BufferOutput();
  const app = await createApplication({ files: new NodeFileStore(), output, optionalAssembly: assembly });
  await app.repl.run(linesOf(script.split('\n')));
  return output.value().split('\n').filter((line) => line.length > 0);
}

async function* linesOf(items: readonly string[]): AsyncIterable<string> {
  for (const item of items) {
    yield item;
  }
}

function expected(): string[] {
  return readFileSync(BASELINE, 'utf8').split('\n').filter((line) => line.length > 0);
}

test('兼容性：代码装配禁用全部插件 → 与 final 的输出逐字节一致', async () => {
  assert.deepEqual(await replayWith(new CodeAssembly([])), expected());
});

test('兼容性：配置装配（plugins: []）→ 与 final 的输出逐字节一致', async () => {
  const configPath = join('doc', 'transcript', 'plugins-none.config.json');
  const assembly = new ConfigAssembly(
    configPath,
    (path) => readFileSync(path, 'utf8'),
  );
  assert.deepEqual(await replayWith(assembly), expected());
});

test('兼容性：启用全部插件后输出确实不同（说明对照是有效的，不是两边都没装）', async () => {
  const withPlugins = readFileSync(join('doc', 'transcript', 'cli-1.expected'), 'utf8')
    .split('\n')
    .filter((line) => line.length > 0);
  assert.notDeepEqual(withPlugins, expected());
  // 差异只来自新增的树标签：把行尾的 ` *` 去掉后必须与 final 的输出完全一致
  assert.ok(withPlugins.some((line) => line.endsWith(' *')), '应当出现 modified-star 标记');
  assert.deepEqual(withPlugins.map((line) => line.replace(/ \*$/, '')), expected());
});
