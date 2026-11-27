import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EditorError } from '../../../src/domain/EditorError.js';
import type { CommandHost } from '../../../src/plugin-api/index.js';
import { DirCommand } from '../src/DirCommand.js';
import { DirectoryReadError } from '../src/DirectoryReader.js';
import { NodeDirectoryReader } from '../src/NodeDirectoryReader.js';

const host = {} as unknown as CommandHost;

/** 固定的临时目录：测试期间不修改其内容（只读），保证输出可断言。 */
function makeFixtureDirectory(): string {
  const root = mkdtempSync(join(tmpdir(), 'svgframe-dir-'));
  mkdirSync(join(root, 'docs'));
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'demo.svg'), '<svg/>', 'utf8');
  writeFileSync(join(root, 'package.json'), '{}', 'utf8');
  writeFileSync(join(root, '.env'), 'SECRET=1', 'utf8');
  try {
    symlinkSync(join(root, 'docs'), join(root, 'docs-link'));
  } catch {
    // 某些文件系统禁止创建符号链接：用例退化为不检查链接行
  }
  return root;
}

test('NodeDirectoryReader：真实文件系统下的混合目录（含隐藏项与符号链接）', (t) => {
  const root = makeFixtureDirectory();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const entries = new NodeDirectoryReader().read(root);
  const names = entries.map((entry) => entry.name).sort();
  assert.deepEqual(names, ['.env', 'demo.svg', 'docs', 'docs-link', 'package.json', 'src'].sort());

  const byName = new Map(entries.map((entry) => [entry.name, entry.kind]));
  assert.equal(byName.get('docs'), 'directory');
  assert.equal(byName.get('src'), 'directory');
  assert.equal(byName.get('demo.svg'), 'file');
  assert.equal(byName.get('.env'), 'file');
  // 符号链接跟随一次目标类型：指向目录 → directory
  if (byName.has('docs-link')) {
    assert.equal(byName.get('docs-link'), 'directory');
  }
});

test('DirCommand + 真实适配器：输出与固定目录内容一一对应（目录在前、文件在后）', (t) => {
  const root = makeFixtureDirectory();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const command = new DirCommand(new NodeDirectoryReader(), () => root);
  const lines = command.create([], {} as never).run(host);
  const hasLink = lines.some((line) => line.includes('docs-link'));
  assert.deepEqual(
    lines.filter((line) => !line.includes('docs-link')),
    [
      '[DIR]  docs',
      '[DIR]  src',
      '[FILE] .env',
      '[FILE] demo.svg',
      '[FILE] package.json',
    ],
  );
  if (hasLink) {
    assert.ok(lines.includes('[DIR]  docs-link'));
  }
});

test('NodeDirectoryReader：不存在的路径抛 DirectoryReadError（含目标路径）', () => {
  const missing = join(tmpdir(), 'svgframe-dir-definitely-missing');
  assert.throws(
    () => new NodeDirectoryReader().read(missing),
    (error: unknown) => error instanceof DirectoryReadError && error.target === missing,
  );
});

test('DirCommand：真实适配器读取失败时折算成 error: cannot read directory', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'svgframe-dir-file-'));
  const file = join(root, 'not-a-directory.txt');
  writeFileSync(file, 'x', 'utf8');
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const command = new DirCommand(new NodeDirectoryReader(), () => file);
  assert.throws(
    () => command.create([], {} as never).run(host),
    (error: unknown) => error instanceof EditorError && error.message === `cannot read directory: ${file}`,
  );
});

test('DirCommand + 真实适配器：空目录输出 (empty directory)', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'svgframe-dir-empty-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const command = new DirCommand(new NodeDirectoryReader(), () => root);
  assert.deepEqual(command.create([], {} as never).run(host), ['(empty directory)']);
});
