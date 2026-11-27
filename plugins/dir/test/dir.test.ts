import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditorError } from '../../../src/domain/EditorError.js';
import type { CommandHost } from '../../../src/plugin-api/index.js';
import { DirCommand } from '../src/DirCommand.js';
import DirPlugin from '../src/index.js';
import { FakeDirectoryReader } from './support/FakeDirectoryReader.js';
import { FakePluginContext } from './support/FakePluginContext.js';

const CWD = '/virtual/work';

function host(): CommandHost {
  // `dir` 不碰文档：宿主只需满足类型，运行时不会被访问
  return {} as unknown as CommandHost;
}

function runDir(reader: FakeDirectoryReader, cwd = CWD): string[] {
  const command = new DirCommand(reader, () => cwd);
  return command.create([], {} as never).run(host());
}

test('dir：目录在前、文件在后，各组按名称升序；隐藏项列出，不含 . 与 ..', () => {
  const reader = new FakeDirectoryReader({
    [CWD]: [
      { name: 'package.json', kind: 'file' },
      { name: 'zeta', kind: 'directory' },
      { name: 'demo.svg', kind: 'file' },
      { name: 'alpha', kind: 'directory' },
      { name: '.gitignore', kind: 'file' },
      { name: '.hidden-dir', kind: 'directory' },
    ],
  });

  assert.deepEqual(runDir(reader), [
    '[DIR]  .hidden-dir',
    '[DIR]  alpha',
    '[DIR]  zeta',
    '[FILE] .gitignore',
    '[FILE] demo.svg',
    '[FILE] package.json',
  ]);
});

test('dir：空目录输出 (empty directory)', () => {
  const reader = new FakeDirectoryReader({ [CWD]: [] });
  assert.deepEqual(runDir(reader), ['(empty directory)']);
});

test('dir：读取失败报 error: cannot read directory: <path>，且不抛异常退出', () => {
  const command = new DirCommand(new FakeDirectoryReader({}), () => CWD);
  const invocation = command.create([], {} as never);
  assert.throws(
    () => invocation.run(host()),
    (error: unknown) => error instanceof EditorError
      && error.message === `cannot read directory: ${CWD}`,
  );
});

test('dir：特殊项（符号链接/设备等）单独标记为 [OTHER]，不遍历其目标', () => {
  const reader = new FakeDirectoryReader({
    [CWD]: [
      { name: 'link', kind: 'other' },
      { name: 'file.txt', kind: 'file' },
      { name: 'sub', kind: 'directory' },
    ],
  });
  assert.deepEqual(runDir(reader), ['[DIR]  sub', '[FILE] file.txt', '[OTHER] link']);
});

test('dir：同一输入多次执行输出逐字节一致（稳定排序）', () => {
  const entries = [
    { name: 'b', kind: 'file' as const },
    { name: 'a', kind: 'directory' as const },
    { name: 'B', kind: 'file' as const },
  ];
  const first = runDir(new FakeDirectoryReader({ [CWD]: entries }));
  const second = runDir(new FakeDirectoryReader({ [CWD]: entries }));
  assert.deepEqual(first, second);
  assert.deepEqual(first, ['[DIR]  a', '[FILE] B', '[FILE] b']);
});

test('dir：不接受参数，多给参数报 usage', () => {
  const command = new DirCommand(new FakeDirectoryReader({}), () => CWD);
  assert.throws(
    () => command.create(['x'], {} as never),
    (error: unknown) => error instanceof EditorError && error.message === 'usage: dir',
  );
});

test('dir：插件注册一个命令，名字/用法/摘要自洽', () => {
  const context = new FakePluginContext();
  new DirPlugin({ cwd: CWD }).activate(context);
  assert.equal(context.commands.length, 1);
  assert.equal(context.commands[0]?.commandName, 'dir');
  assert.equal(context.commands[0]?.usage, 'dir');
  assert.match(context.commands[0]?.summary ?? '', /working directory/);
});
