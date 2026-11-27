import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigAssembly } from '../../src/host/ConfigAssembly.js';
import { ContributionRegistry } from '../../src/plugin-api/ContributionRegistry.js';
import { builtinShapes } from '../../src/builtin/BuiltinShapes.js';

const CONFIG_DIR = join('test', '.tmp', 'plugin-loader');
const readText = (path: string): string => readFileSync(path, 'utf8');

/** 每个用例重新建目录，避免互相污染（目录本身在 .gitignore 里）。 */
function writeConfig(name: string, content: unknown): string {
  rmSync(CONFIG_DIR, { recursive: true, force: true });
  mkdirSync(CONFIG_DIR, { recursive: true });
  const path = join(CONFIG_DIR, name);
  writeFileSync(path, typeof content === 'string' ? content : JSON.stringify(content, null, 2), 'utf8');
  return path;
}

interface AssemblyResult {
  readonly registry: ContributionRegistry;
  readonly lines: readonly string[];
}

async function assemble(configPath: string): Promise<AssemblyResult> {
  const registry = new ContributionRegistry();
  const lines: string[] = [];
  const staging = registry.beginPlugin('builtin-shapes', builtinShapes.contributes ?? null);
  builtinShapes.activate(staging);
  registry.commit(staging);
  await new ConfigAssembly(configPath, readText).apply(registry, (line) => lines.push(line));
  return { registry, lines };
}

const GOOD = '../../fixtures/plugins/good';
const NO_DEFAULT = '../../fixtures/plugins/no-default';
const MISMATCH = '../../fixtures/plugins/mismatch';
const THROWS = '../../fixtures/plugins/throws';
const DUPLICATE = '../../fixtures/plugins/duplicate';
const EVAL_FAIL = '../../fixtures/plugins/evaluates-fail';
const WITH_OPTIONS = '../../fixtures/plugins/with-options';

test('配置装配：相对路径插件加载成功，注册进入内核且无错误行', async () => {
  const { registry, lines } = await assemble(writeConfig('ok.json', { plugins: [{ module: GOOD }] }));
  assert.deepEqual(lines, []);
  assert.deepEqual(registry.treeDecorators().map((item) => item.decoratorName), ['good-marker']);
  assert.deepEqual(registry.loadedPlugins(), ['builtin-shapes', '@svgframe/test-plugin-good']);
});

test('配置装配：模块找不到 → error: plugin not found: <module>', async () => {
  const { lines } = await assemble(writeConfig('missing.json', { plugins: [{ module: './nope' }] }));
  assert.deepEqual(lines, ['error: plugin not found: ./nope']);
});

test('配置装配：没有默认导出 → error: plugin has no default export: <module>', async () => {
  const { lines } = await assemble(writeConfig('nodefault.json', { plugins: [{ module: NO_DEFAULT }] }));
  assert.deepEqual(lines, [`error: plugin has no default export: ${NO_DEFAULT}`]);
});

test('配置装配：清单声明与实际注册不一致 → error: plugin manifest mismatch: <name> (declared: …, registered: …)', async () => {
  const { registry, lines } = await assemble(writeConfig('mismatch.json', { plugins: [{ module: MISMATCH }] }));
  assert.deepEqual(lines, [
    'error: plugin manifest mismatch: @svgframe/test-plugin-mismatch '
      + '(declared: shapes=[diamond], registered: decorators=[declared-wrong])',
  ]);
  assert.deepEqual(registry.treeDecorators(), []);
});

test('配置装配：activate 抛错 → error: plugin failed to activate: <name> (<reason>)，且其全部注册被撤销', async () => {
  const { registry, lines } = await assemble(writeConfig('throws.json', { plugins: [{ module: THROWS }] }));
  assert.deepEqual(lines, ['error: plugin failed to activate: @svgframe/test-plugin-throws (boom from activate)']);
  assert.deepEqual(registry.treeDecorators(), []);
  assert.deepEqual(registry.loadedPlugins(), ['builtin-shapes']);
});

test('配置装配：重复注册 → error: duplicate registration: <category>/<name>', async () => {
  const { lines } = await assemble(writeConfig('dup.json', { plugins: [{ module: DUPLICATE }] }));
  assert.deepEqual(lines, ['error: duplicate registration: shapes/rect']);
});

test('配置装配：模块存在但求值失败 → 报加载失败，不误报成模块找不到', async () => {
  const { lines } = await assemble(writeConfig('evalfail.json', { plugins: [{ module: EVAL_FAIL }] }));
  assert.equal(lines.length, 1);
  assert.match(lines[0] ?? '', /^error: plugin failed to activate: .+ \(evaluation blew up\)$/);
  assert.doesNotMatch(lines[0] ?? '', /plugin not found/);
});

test('配置装配：结构不合法 → error: invalid plugin config，且以默认内置能力继续启动', async () => {
  const cases: unknown[] = [
    '{ this is not json',
    { plugins: 'not-an-array' },
    { plugins: [{ module: 42 }] },
    { plugins: [{ module: GOOD, enabled: 'yes' }] },
  ];
  for (const [index, content] of cases.entries()) {
    const { registry, lines } = await assemble(writeConfig(`invalid-${index}.json`, content));
    assert.deepEqual(lines, ['error: invalid plugin config'], `case ${index}`);
    assert.deepEqual(registry.loadedPlugins(), ['builtin-shapes'], `case ${index}`);
  }
});

test('配置装配：enabled:false 完全跳过（不加载、不报错）', async () => {
  const { registry, lines } = await assemble(
    writeConfig('disabled.json', { plugins: [{ module: GOOD, enabled: false }] }),
  );
  assert.deepEqual(lines, []);
  assert.deepEqual(registry.treeDecorators(), []);
  assert.deepEqual(registry.loadedPlugins(), ['builtin-shapes']);
});

test('配置装配：options 传给插件类构造函数', async () => {
  const { registry, lines } = await assemble(
    writeConfig('options.json', { plugins: [{ module: WITH_OPTIONS, options: { text: 'hi' } }] }),
  );
  assert.deepEqual(lines, []);
  const decorator = registry.treeDecorators()[0];
  assert.equal(decorator?.labelFor({ shape: null, document: dummyDocument() }), '<hi>');
});

test('配置装配：按配置数组顺序加载，坏插件不影响好插件与后续插件', async () => {
  const { registry, lines } = await assemble(
    writeConfig('mixed.json', {
      plugins: [
        { module: GOOD },
        { module: './nope' },
        { module: WITH_OPTIONS, options: { text: 'tail' } },
      ],
    }),
  );
  assert.deepEqual(lines, ['error: plugin not found: ./nope']);
  assert.deepEqual(
    registry.treeDecorators().map((item) => item.decoratorName),
    ['good-marker', 'options-marker'],
  );
});

test('配置装配：配置文件不存在 → error: invalid plugin config（不抛异常）', async () => {
  const path = writeConfig('unused.json', { plugins: [] });
  rmSync(path);
  const { lines } = await assemble(path);
  assert.deepEqual(lines, ['error: invalid plugin config']);
});

/** labelFor 只需要 document 字段存在；本用例不读它。 */
function dummyDocument(): never {
  return undefined as never;
}
