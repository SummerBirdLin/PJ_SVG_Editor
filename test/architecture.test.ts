import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

/**
 * 依赖方向的自动化守护：把 §1.3 的矩阵变成可执行断言。
 * 违反规则 = 测试失败，因此"一致性自查"不是靠人工抽样。
 */

type ModuleName =
  | 'domain'
  | 'plugin-api'
  | 'commands'
  | 'ports'
  | 'io'
  | 'app'
  | 'cli'
  | 'builtin'
  | 'host'
  | 'main';

/**
 * 阶段 2 的依赖矩阵：
 * - `plugin-api` 是内核的扩展点层，只依赖 domain（插件只允许依赖它与 domain）；
 * - `commands` 可以问 `plugin-api` 要属性处理器，方向仍是"向上用接口"；
 * - `builtin`（内置插件）只依赖 domain/commands/plugin-api，不比第三方插件多任何特权；
 * - `host` 是装配处（组合根 + 加载器），唯一允许认识所有人的地方。
 */
const ALLOWED: Readonly<Record<ModuleName, readonly ModuleName[]>> = {
  domain: [],
  'plugin-api': ['domain'],
  commands: ['domain', 'plugin-api'],
  ports: ['domain'],
  io: ['domain', 'ports'],
  app: ['domain', 'commands', 'ports', 'plugin-api'],
  cli: ['domain', 'commands', 'app', 'plugin-api'],
  builtin: ['domain', 'commands', 'plugin-api'],
  host: ['domain', 'plugin-api', 'commands', 'ports', 'io', 'app', 'cli', 'builtin'],
  main: ['host'],
};

const NODE_BUILTIN_ALLOWED: readonly ModuleName[] = ['io', 'host'];

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

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * 支持多行 import / `export … from` / 副作用 import；
 * 先去掉注释，避免把注释里的 import 当成真实依赖。
 */
function parseImports(file: string): ImportStatement[] {
  const source = stripComments(readFileSync(file, 'utf8'));
  const statements: ImportStatement[] = [];
  const pattern = /(?:^|\n)\s*(?:import|export)\s+(type\s+)?[\s\S]*?\bfrom\s+['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(pattern)) {
    statements.push({
      fromFile: file,
      fromModule: moduleOf(file),
      specifier: match[2] ?? '',
      typeOnly: match[1] !== undefined,
    });
  }
  const barePattern = /(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(barePattern)) {
    statements.push({
      fromFile: file,
      fromModule: moduleOf(file),
      specifier: match[1] ?? '',
      typeOnly: false,
    });
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
