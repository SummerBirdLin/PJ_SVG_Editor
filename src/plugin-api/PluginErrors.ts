/** 插件相关错误的统一分类：加载器据此生成 `error: …` 文案（见 doc/README.md 的加载契约）。 */

/** 同一类别下重复注册（跨插件或插件内部）。 */
export class DuplicateContributionError extends Error {
  constructor(
    readonly category: string,
    readonly contributionName: string,
  ) {
    super(`duplicate registration: ${category}/${contributionName}`);
    this.name = 'DuplicateContributionError';
  }
}

/** `package.json` 的 `contributes` 与插件实际注册的内容不一致。 */
export class ManifestMismatchError extends Error {
  constructor(
    readonly pluginName: string,
    readonly declared: string,
    readonly registered: string,
  ) {
    super(`plugin manifest mismatch: ${pluginName} (declared: ${declared}, registered: ${registered})`);
    this.name = 'ManifestMismatchError';
  }
}

/** 插件违反扩展点契约（如注册的对象缺少必需成员、名字为空）。 */
export class PluginContractError extends Error {
  constructor(
    readonly pluginName: string,
    readonly reason: string,
  ) {
    super(`plugin contract violated: ${pluginName} (${reason})`);
    this.name = 'PluginContractError';
  }
}
