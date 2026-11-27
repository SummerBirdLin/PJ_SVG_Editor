import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApplication, type Application } from '../../src/host/Application.js';
import { CodeAssembly } from '../../src/host/CodeAssembly.js';
import { ConfigAssembly } from '../../src/host/ConfigAssembly.js';
import { optionalPlugins } from '../../src/host/CodePlugins.js';
import { NodeFileStore } from '../../src/io/NodeFileStore.js';
import type { PluginAssembly } from '../../src/host/PluginAssembly.js';
import { BufferOutput } from '../support/BufferOutput.js';

const CONFIG_PATH = join('test', '.tmp', 'plugins.config.json');

async function runScript(
  assembly: PluginAssembly,
  script: string | readonly string[],
): Promise<{ app: Application; lines: string[] }> {
  const output = new BufferOutput();
  const app = await createApplication({ files: new NodeFileStore(), output, optionalAssembly: assembly });
  const scriptLines = typeof script === 'string' ? script.split('\n') : [...script];
  await app.repl.run(linesOf(scriptLines));
  return { app, lines: output.value().split('\n').filter((line) => line.length > 0) };
}

async function* linesOf(items: string[]): AsyncIterable<string> {
  for (const item of items) {
    yield item;
  }
}

/** 固定的临时工作目录：内容在测试期间不变，日志不写进这个目录。 */
function makeFixedDirectory(): string {
  const root = mkdtempSync(join(tmpdir(), 'svgframe-cwd-'));
  mkdirSync(join(root, 'docs'));
  mkdirSync(join(root, 'plugins'));
  writeFileSync(join(root, 'demo.svg'), '<svg/>', 'utf8');
  writeFileSync(join(root, 'package.json'), '{}', 'utf8');
  return root;
}

function withWorkingDirectory<T>(target: string, action: () => Promise<T>): Promise<T> {
  const original = process.cwd();
  process.chdir(target);
  return action().finally(() => process.chdir(original));
}

test('stats：代码装配下可用，出现在 help 中，执行不进入 undo 栈', async () => {
  const { app, lines } = await runScript(
    new CodeAssembly(optionalPlugins()),
    ['init 100 100', 'create rect r1 0 0 10 10', 'stats', 'undo', 'stats'],
  );
  assert.deepEqual(lines.slice(0, 2), ['canvas 100x100 created', 'rect#r1 created']);
  assert.deepEqual(lines.slice(2, 5), [
    'rect: 1  (total 1, containers 0)',
    'rect#r1 deleted',
    '(total 0, containers 0)',
  ]);
  // undo 撤销的是 create 而不是 stats（证明 stats 不进入 undo 栈）
  assert.equal(app.session.history.canRedo(), true);
  assert.equal(app.session.document.canvas().children().length, 0);
});

test('stats/dir：未装插件时是未知命令（缺省行为），装上后出现在 help', async () => {
  const unloaded = await runScript(new CodeAssembly([]), ['stats', 'dir', 'help']);
  assert.deepEqual(unloaded.lines.slice(0, 2), [
    'error: unknown command: stats',
    'error: unknown command: dir',
  ]);
  assert.ok(!unloaded.lines.some((line) => line.includes('  stats ')));

  const loaded = await runScript(new CodeAssembly(optionalPlugins()), ['help']);
  assert.ok(loaded.lines.some((line) => /^ {2}stats\b/.test(line)), 'help 应列出 stats');
  assert.ok(loaded.lines.some((line) => /^ {2}dir\b/.test(line)), 'help 应列出 dir');
});

test('dir：未 init/read 时可用，且不改变文档与 undo 历史', async (t) => {
  const root = makeFixedDirectory();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  await withWorkingDirectory(root, async () => {
    const fresh = await runScript(new CodeAssembly(optionalPlugins()), ['dir']);
    assert.deepEqual(fresh.lines, [
      '[DIR]  docs',
      '[DIR]  plugins',
      '[FILE] demo.svg',
      '[FILE] package.json',
    ]);

    const withDocument = await runScript(
      new CodeAssembly(optionalPlugins()),
      ['init 100 100', 'create rect r1 0 0 10 10', 'dir', 'undo'],
    );
    // dir 的输出夹在中间，但 undo 撤销的仍是 create（dir 没有进历史）
    assert.deepEqual(withDocument.lines.slice(0, 2), ['canvas 100x100 created', 'rect#r1 created']);
    assert.equal(withDocument.lines.at(-1), 'rect#r1 deleted');
    assert.deepEqual(withDocument.app.session.document.canvas().children(), []);
  });
});

test('dir：读取失败后仍可继续执行其它命令', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'svgframe-cwd-missing-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const missing = join(root, 'does-not-exist');
  const configPath = writeConfig([{ module: '@svgframe/plugin-dir', options: { cwd: missing } }]);
  t.after(() => rmSync(join('test', '.tmp'), { recursive: true, force: true }));

  const { lines } = await runScript(new ConfigAssembly(configPath, readText), ['dir', 'init 50 50']);
  assert.deepEqual(lines, [`error: cannot read directory: ${missing}`, 'canvas 50x50 created']);
});

test('双装配一致：同一固定目录、同一会话，代码装配与配置装配输出逐字节相同', async (t) => {
  const root = makeFixedDirectory();
  // 直接使用仓库自带的 plugins.config.json：任何"代码装配与配置清单不一致"都会在此失败
  const configPath = resolve('plugins.config.json');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  t.after(() => rmSync(join('test', '.tmp'), { recursive: true, force: true }));

  const script = [
    'init 800 600',
    'create rect bg 0 0 800 600 #ffffff',
    'create g flow',
    'create rect r1 10 20 30 40 in flow',
    'stats',
    'dir',
    'tree',
    'undo',
    'stats',
    'help',
  ];

  const byCode = await withWorkingDirectory(root, () => runScript(new CodeAssembly(optionalPlugins()), script.join('\n')));
  const byConfig = await withWorkingDirectory(root, () => runScript(new ConfigAssembly(configPath, readText), script.join('\n')));
  assert.deepEqual(byConfig.lines, byCode.lines);
  assert.deepEqual(
    byConfig.app.contributions.treeDecorators().map((item) => item.decoratorName),
    byCode.app.contributions.treeDecorators().map((item) => item.decoratorName),
  );
});

function writeConfig(plugins: readonly { module: string; options?: unknown }[]): string {
  mkdirSync(join('test', '.tmp'), { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify({ plugins }, null, 2), 'utf8');
  // 配置装配以"配置文件所在目录"为相对路径基准，测试里会临时 chdir，必须用绝对路径
  return resolve(CONFIG_PATH);
}

function readText(path: string): string {
  return readFileSync(path, 'utf8');
}
