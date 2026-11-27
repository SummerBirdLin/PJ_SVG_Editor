import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { ContributionDeclarations } from '../plugin-api/ContributionDeclarations.js';
import type { PluginModule } from '../plugin-api/PluginContext.js';
import { reasonOf } from './PluginActivation.js';

/** 模块解析不到（包名不存在 / 相对路径不存在）。 */
export class PluginModuleNotFoundError extends Error {
  constructor(readonly specifier: string) {
    super(`plugin not found: ${specifier}`);
    this.name = 'PluginModuleNotFoundError';
  }
}

/** 模块能解析到文件，但求值（或其依赖）失败。 */
export class PluginModuleEvaluationError extends Error {
  constructor(
    readonly specifier: string,
    readonly reason: string,
  ) {
    super(`plugin module failed to evaluate: ${specifier} (${reason})`);
    this.name = 'PluginModuleEvaluationError';
  }
}

/** 模块没有可用的默认导出（缺失，或不是对象/类）。 */
export class PluginNoDefaultExportError extends Error {
  constructor(readonly specifier: string) {
    super(`plugin has no default export: ${specifier}`);
    this.name = 'PluginNoDefaultExportError';
  }
}

export interface LoadedPlugin {
  readonly plugin: PluginModule;
  readonly pluginName: string;
  readonly entryPath: string;
}

/**
 * 按运行环境的模块解析规则把**字符串模块名**变成插件实例。
 *
 * - 相对路径（`./plugins/tree-star`）以**配置文件所在目录**为基准；
 * - 包名（`@svgframe/plugin-shape-box`）交给 Node 的解析规则（`require.resolve`，
 *   因此 npm workspaces 的软链接、`exports` 字段都按标准行为生效）；
 * - 本类**不认识任何具体插件**：没有导入、没有名字映射表、没有分支。
 */
export class PluginModuleResolver {
  private readonly baseDirectory: string;

  constructor(baseDirectory: string) {
    this.baseDirectory = baseDirectory;
  }

  async load(specifier: string, options: unknown): Promise<LoadedPlugin> {
    const entryPath = this.resolveEntry(specifier);
    let moduleNamespace: Record<string, unknown>;
    try {
      moduleNamespace = (await import(pathToFileURL(entryPath).href)) as Record<string, unknown>;
    } catch (error) {
      throw new PluginModuleEvaluationError(specifier, reasonOf(error));
    }

    const exported = moduleNamespace['default'];
    if (exported === undefined || exported === null) {
      throw new PluginNoDefaultExportError(specifier);
    }
    const manifest = this.readPackageManifest(entryPath);
    const plugin = PluginModuleResolver.instantiate(exported, options, specifier);
    const pluginName = plugin.name !== undefined && plugin.name.trim().length > 0
      ? plugin.name
      : manifest.name ?? specifier;
    // 注意：类实例的 activate 在原型上，不能用对象展开复制（会丢方法），
    // 因此这里用闭包补齐 contributes 而不是 `{...plugin}`。
    const withManifest: PluginModule = plugin.contributes !== undefined
      ? plugin
      : {
        name: pluginName,
        contributes: ContributionDeclarations.fromPlain(manifest.contributes, pluginName),
        activate: (context) => {
          plugin.activate(context);
        },
      };
    return { plugin: withManifest, pluginName, entryPath };
  }

  private resolveEntry(specifier: string): string {
    if (specifier.startsWith('.') || isAbsolute(specifier)) {
      const target = resolve(this.baseDirectory, specifier);
      if (!existsSync(target)) {
        throw new PluginModuleNotFoundError(specifier);
      }
      if (statSync(target).isDirectory()) {
        const manifest = this.readPackageManifestFromDirectory(target);
        const entry = manifest.entry;
        if (entry === null) {
          throw new PluginModuleNotFoundError(specifier);
        }
        const candidate = join(target, entry);
        if (!existsSync(candidate)) {
          throw new PluginModuleNotFoundError(specifier);
        }
        return candidate;
      }
      return target;
    }
    try {
      return createRequire(import.meta.url).resolve(specifier);
    } catch {
      throw new PluginModuleNotFoundError(specifier);
    }
  }

  private readPackageManifest(entryPath: string): PackageManifest {
    let directory = dirname(entryPath);
    for (;;) {
      const candidate = join(directory, 'package.json');
      if (existsSync(candidate)) {
        return PluginModuleResolver.parseManifest(candidate);
      }
      const parent = dirname(directory);
      if (parent === directory) {
        return { name: undefined, contributes: undefined, entry: null };
      }
      directory = parent;
    }
  }

  private readPackageManifestFromDirectory(directory: string): PackageManifest {
    const candidate = join(directory, 'package.json');
    if (!existsSync(candidate)) {
      return { name: undefined, contributes: undefined, entry: null };
    }
    return PluginModuleResolver.parseManifest(candidate);
  }

  private static parseManifest(path: string): PackageManifest {
    try {
      const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
      const exportsField = raw['exports'];
      let entry: string | null = null;
      if (typeof exportsField === 'string') {
        entry = exportsField;
      } else if (typeof exportsField === 'object' && exportsField !== null) {
        const root = (exportsField as Record<string, unknown>)['.'];
        if (typeof root === 'string') {
          entry = root;
        } else if (typeof root === 'object' && root !== null) {
          const imported = (root as Record<string, unknown>)['import'];
          if (typeof imported === 'string') {
            entry = imported;
          }
        }
      }
      if (entry === null && typeof raw['main'] === 'string') {
        entry = raw['main'];
      }
      return {
        name: typeof raw['name'] === 'string' ? raw['name'] : undefined,
        contributes: raw['contributes'],
        entry,
      };
    } catch {
      return { name: undefined, contributes: undefined, entry: null };
    }
  }

  /** 默认导出可以是**实例**（对象）或**类**（用 `options` 构造）。 */
  private static instantiate(exported: unknown, options: unknown, specifier: string): PluginModule {
    if (typeof exported === 'function') {
      try {
        const created = new (exported as new (options?: unknown) => unknown)(options);
        return PluginModuleResolver.requirePlugin(created, specifier);
      } catch (error) {
        if (error instanceof Error && /not a constructor/i.test(error.message)) {
          const created = (exported as (options?: unknown) => unknown)(options);
          return PluginModuleResolver.requirePlugin(created, specifier);
        }
        throw error;
      }
    }
    return PluginModuleResolver.requirePlugin(exported, specifier);
  }

  private static requirePlugin(candidate: unknown, specifier: string): PluginModule {
    if (typeof candidate !== 'object' || candidate === null) {
      throw new PluginNoDefaultExportError(specifier);
    }
    const plugin = candidate as PluginModule;
    if (typeof plugin.activate !== 'function') {
      throw new PluginNoDefaultExportError(specifier);
    }
    return plugin;
  }
}

interface PackageManifest {
  readonly name: string | undefined;
  readonly contributes: unknown;
  readonly entry: string | null;
}
