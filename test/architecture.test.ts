import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

/**
 * 依赖方向的自动化守护：把 §1.3 的矩阵变成可执行断言。
 * 违反规则 = 测试失败，因此"一致性自查"不是靠人工抽样。
 */

type ModuleName = 'domain' | 'commands' | 'ports' | 'io' | 'app' | 'cli' | 'main';

const ALLOWED: Readonly<Record<ModuleName, readonly ModuleName[]>> = {
  domain: [],
  commands: ['domain'],
  ports: ['domain'],
  io: ['domain', 'ports'],
  app: ['domain', 'commands', 'ports'],
  cli: ['domain', 'commands', 'app'],
  main: ['domain', 'commands', 'ports', 'io', 'app', 'cli'],
};

const NODE_BUILTIN_ALLOWED: readonly ModuleName[] = ['io', 'main'];

interface ImportStatement {
  readonly fromFile: string;
  readonly fromModule: ModuleName;
  readonly specifier: string;
  readonly typeOnly: boolean;
}

function listSourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      files.push(...listSourceFiles(full));
    } else if (entry.endsWith('.ts')) {
      files.push(full);
    }
  }
  return files;
}

function moduleOf(file: string): ModuleName {
  const relativePath = relative('src', file);
  if (relativePath === 'main.ts') {
    return 'main';
  }
  const firstSegment = relativePath.split(sep)[0];
  return firstSegment as ModuleName;
}

function parseImports(file: string): ImportStatement[] {
  const source = readFileSync(file, 'utf8');
  const statements: ImportStatement[] = [];
  for (const line of source.split('\n')) {
    const fromMatch = /^\s*import\s+(type\s+)?.*\bfrom\s+['"]([^'"]+)['"]/.exec(line);
    if (fromMatch !== null) {
      statements.push({
        fromFile: file,
        fromModule: moduleOf(file),
        specifier: fromMatch[2] ?? '',
        typeOnly: fromMatch[1] !== undefined,
      });
      continue;
    }
    const bareMatch = /^\s*import\s+['"]([^'"]+)['"]/.exec(line);
    if (bareMatch !== null) {
      statements.push({
        fromFile: file,
        fromModule: moduleOf(file),
        specifier: bareMatch[1] ?? '',
        typeOnly: false,
      });
    }
  }
  return statements;
}

function resolveTarget(importingFile: string, specifier: string): string {
  const absolute = resolve(dirname(importingFile), specifier);
  return absolute.replace(/\.js$/, '.ts');
}

test('依赖方向：src 下的 import 必须符合 §1.3 的矩阵', () => {
  const files = listSourceFiles('src');
  const violations: string[] = [];

  for (const file of files) {
    for (const statement of parseImports(file)) {
      const { fromModule, specifier, typeOnly } = statement;

      if (specifier.startsWith('node:') || !specifier.startsWith('.')) {
        if (specifier.startsWith('node:')) {
          if (!NODE_BUILTIN_ALLOWED.includes(fromModule)) {
            violations.push(`${file}: 平台 API 只允许出现在 io/main，实际在 ${fromModule}（${specifier}）`);
          }
        } else {
          violations.push(`${file}: 工程禁止第三方运行时依赖（${specifier}）`);
        }
        continue;
      }

      const targetFile = resolveTarget(file, specifier);
      if (!statSync(targetFile).isFile()) {
        violations.push(`${file}: import 目标不存在 ${specifier}`);
        continue;
      }
      const targetModule = moduleOf(targetFile);
      if (targetModule === fromModule) {
        continue;
      }
      if (!ALLOWED[fromModule].includes(targetModule)) {
        violations.push(`${file}: 越界依赖 ${fromModule} → ${targetModule}（${specifier}）`);
        continue;
      }
      if (fromModule === 'ports' && !typeOnly) {
        violations.push(`${file}: ports → domain 必须使用 import type（${specifier}）`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test('依赖方向：模块级依赖图无环', () => {
  const edges = new Map<ModuleName, Set<ModuleName>>();
  for (const file of listSourceFiles('src')) {
    for (const statement of parseImports(file)) {
      if (!statement.specifier.startsWith('.')) {
        continue;
      }
      const targetModule = moduleOf(resolveTarget(file, statement.specifier));
      if (targetModule === statement.fromModule) {
        continue;
      }
      const targets = edges.get(statement.fromModule) ?? new Set<ModuleName>();
      targets.add(targetModule);
      edges.set(statement.fromModule, targets);
    }
  }

  const visiting = new Set<ModuleName>();
  const visited = new Set<ModuleName>();
  const cycles: string[] = [];

  const visit = (module: ModuleName, path: ModuleName[]): void => {
    if (visiting.has(module)) {
      cycles.push([...path, module].join(' → '));
      return;
    }
    if (visited.has(module)) {
      return;
    }
    visiting.add(module);
    for (const target of edges.get(module) ?? []) {
      visit(target, [...path, module]);
    }
    visiting.delete(module);
    visited.add(module);
  };

  for (const module of ALLOWED ? Object.keys(ALLOWED) as ModuleName[] : []) {
    visit(module, []);
  }
  assert.deepEqual(cycles, []);
});
