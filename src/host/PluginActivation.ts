import { ContributionDeclarations } from '../plugin-api/ContributionDeclarations.js';
import { ContributionRegistry, type PluginStaging } from '../plugin-api/ContributionRegistry.js';
import {
  DuplicateContributionError,
  ManifestMismatchError,
  PluginContractError,
} from '../plugin-api/PluginErrors.js';
import type { PluginModule } from '../plugin-api/PluginContext.js';

/**
 * 插件激活的**唯一**入口：代码装配与配置装配都调用它。
 *
 * 三步：`beginPlugin`（建暂存区）→ `activate`（插件注册）→ `commit`（查重 + 清单校验 + 合并）。
 * 任何一步抛错都 `discard` 暂存区，因此失败插件不会留下半个注册；
 * 已成功的插件不受影响，后续插件继续加载。
 */
export function activatePlugin(
  registry: ContributionRegistry,
  plugin: PluginModule,
  fallbackName: string,
): void {
  const pluginName = pluginNameOf(plugin, fallbackName);
  const declarations: ContributionDeclarations | null = plugin.contributes ?? null;
  const staging: PluginStaging = registry.beginPlugin(pluginName, declarations);
  try {
    plugin.activate(staging);
    registry.commit(staging);
  } catch (error) {
    registry.discard(staging);
    throw error;
  }
}

export function pluginNameOf(plugin: PluginModule, fallbackName: string): string {
  const declared = plugin.name;
  return declared === undefined || declared.trim().length === 0 ? fallbackName : declared;
}

/**
 * 把激活失败折算成需求规定的 `error:` 文案：
 * - 重复注册 → `error: duplicate registration: <category>/<name>`
 * - 清单不一致 → `error: plugin manifest mismatch: <name> (declared: …, registered: …)`
 * - 其余（含 activate 抛错、契约违规）→ `error: plugin failed to activate: <name> (<reason>)`
 */
export function describeActivationFailure(pluginName: string, error: unknown): string {
  if (error instanceof DuplicateContributionError) {
    return `error: ${error.message}`;
  }
  if (error instanceof ManifestMismatchError) {
    return `error: ${error.message}`;
  }
  if (error instanceof PluginContractError) {
    return `error: plugin failed to activate: ${error.pluginName} (${error.reason})`;
  }
  return `error: plugin failed to activate: ${pluginName} (${reasonOf(error)})`;
}

/** 单行化原因，避免把多行堆栈塞进 `error:` 文案。 */
export function reasonOf(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/\s+/g, ' ').trim();
}
