/** `plugins.config.json` 的结构（见 doc/README.md 的"配置装配"一节）。 */
export interface PluginConfigEntry {
  /** 模块名：相对路径以配置文件所在目录为基准，包名按 Node 解析规则。 */
  readonly module: string;

  /** 传给插件类构造函数的选项（对象/标量皆可）。 */
  readonly options?: unknown;

  /** 显式关闭（缺省 = 启用）。 */
  readonly enabled?: boolean;
}

export interface PluginConfig {
  readonly plugins: readonly PluginConfigEntry[];
}

/** 配置语法/结构不合法（调用方据此打印 `error: invalid plugin config`）。 */
export class PluginConfigError extends Error {
  constructor(readonly detail: string) {
    super(`invalid plugin config: ${detail}`);
    this.name = 'PluginConfigError';
  }
}

/**
 * 严格校验配置结构；失败抛 `PluginConfigError`。
 *
 * 允许出现未知键（向前兼容），但四类已知字段的类型必须正确：
 * - 根必须是对象，且 `plugins` 是数组；
 * - 每项必须是对象，`module` 是非空字符串；
 * - `enabled` 若出现必须是布尔，`options` 不限（原样传给插件）。
 */
export function parsePluginConfig(raw: unknown): PluginConfig {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new PluginConfigError('root must be an object');
  }
  const pluginsField = (raw as Record<string, unknown>)['plugins'];
  if (!Array.isArray(pluginsField)) {
    throw new PluginConfigError('`plugins` must be an array');
  }
  const entries: PluginConfigEntry[] = [];
  pluginsField.forEach((item, index) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new PluginConfigError(`plugins[${index}] must be an object`);
    }
    const record = item as Record<string, unknown>;
    const moduleSpecifier = record['module'];
    if (typeof moduleSpecifier !== 'string' || moduleSpecifier.trim().length === 0) {
      throw new PluginConfigError(`plugins[${index}].module must be a non-empty string`);
    }
    const enabled = record['enabled'];
    if (enabled !== undefined && typeof enabled !== 'boolean') {
      throw new PluginConfigError(`plugins[${index}].enabled must be a boolean`);
    }
    entries.push({ module: moduleSpecifier, options: record['options'], enabled });
  });
  return { plugins: entries };
}
