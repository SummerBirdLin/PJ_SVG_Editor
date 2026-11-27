import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApplication } from '../../src/host/Application.js';
import { CodeAssembly } from '../../src/host/CodeAssembly.js';
import { optionalPlugins } from '../../src/host/CodePlugins.js';
import { NodeFileStore } from '../../src/io/NodeFileStore.js';
import { BufferOutput } from '../support/BufferOutput.js';

/**
 * 会话回放：`doc/transcript/<name>.txt` 是**只含命令与注释**的输入，
 * `<name>.expected` 是逐字节期望输出。两者一起提交，改动行为必须改期望值，
 * 因此它们是"输出契约"的可执行版本（需求 §6 的双装配一致性也基于同一份输入）。
 */
async function replay(name: string): Promise<string[]> {
  const script = readFileSync(join('doc', 'transcript', `${name}.txt`), 'utf8');
  const output = new BufferOutput();
  const app = await createApplication({
    files: new NodeFileStore(),
    output,
    optionalAssembly: new CodeAssembly(optionalPlugins()),
  });
  await app.repl.run(linesOf(script.split('\n')));
  return output.value().split('\n').filter((line) => line.length > 0);
}

async function* linesOf(items: readonly string[]): AsyncIterable<string> {
  for (const item of items) {
    yield item;
  }
}

for (const name of ['box']) {
  test(`transcript ${name}：回放输出与 .expected 逐字节一致`, async () => {
    const expected = readFileSync(join('doc', 'transcript', `${name}.expected`), 'utf8')
      .split('\n')
      .filter((line) => line.length > 0);
    assert.deepEqual(await replay(name), expected);
  });
}
