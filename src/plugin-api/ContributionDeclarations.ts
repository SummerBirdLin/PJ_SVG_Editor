import { PluginContractError } from './PluginErrors.js';

/** `package.json` 的 `contributes` 使用的四类名称列表（缺省为空）。 */
export type ContributionCategory = 'shapes' | 'commands' | 'decorators' | 'attributes';

export const CONTRIBUTION_CATEGORIES: readonly ContributionCategory[] = [
  'shapes',
  'commands',
  'decorators',
  'attributes',
];

/**
 * 插件清单声明：从 `package.json` 的 `contributes` 解析，用于与实际注册比对。
 *
 * 未知类别被忽略（向前兼容），已知类别必须是字符串数组；
 * 结构不合法时抛 `PluginContractError`，由加载器折算成 manifest mismatch 文案。
 */
export class ContributionDeclarations {
  private readonly names = new Map<ContributionCategory, readonly string[]>();

  private constructor(source: ReadonlyMap<ContributionCategory, readonly string[]>) {
    for (const [category, list] of source) {
      this.names.set(category, list);
    }
  }

  static empty(): ContributionDeclarations {
    return new ContributionDeclarations(new Map());
  }

  /** `raw` 为 `package.json` 的 `contributes` 字段（可能缺失）。 */
  static fromPlain(raw: unknown, pluginName: string): ContributionDeclarations {
    if (raw === undefined || raw === null) {
      return ContributionDeclarations.empty();
    }
    if (typeof raw !== 'object' || Array.isArray(raw)) {
      throw new PluginContractError(pluginName, 'contributes must be an object');
    }
    const record = raw as Record<string, unknown>;
    const parsed = new Map<ContributionCategory, readonly string[]>();
    for (const category of CONTRIBUTION_CATEGORIES) {
      const value = record[category];
      if (value === undefined) {
        continue;
      }
      if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
        throw new PluginContractError(pluginName, `contributes.${category} must be a string array`);
      }
      parsed.set(category, [...(value as string[])]);
    }
    return new ContributionDeclarations(parsed);
  }

  namesOf(category: ContributionCategory): readonly string[] {
    return this.names.get(category) ?? [];
  }

  isEmpty(): boolean {
    return CONTRIBUTION_CATEGORIES.every((category) => this.namesOf(category).length === 0);
  }

  /** `declared: shapes=[box] decorators=[box-type-label]`（空清单显示 `(none)`）。 */
  describe(): string {
    const parts = CONTRIBUTION_CATEGORIES
      .filter((category) => this.namesOf(category).length > 0)
      .map((category) => `${category}=[${[...this.namesOf(category)].sort().join(', ')}]`);
    return parts.length === 0 ? '(none)' : parts.join(' ');
  }

  /** 与"实际注册"比对；不一致时返回两段可读文本。 */
  compareAgainst(registered: ReadonlyMap<ContributionCategory, readonly string[]>): {
    readonly declared: string;
    readonly registered: string;
  } | null {
    const declaredText = this.describe();
    const registeredText = ContributionDeclarations.describeRegistered(registered);
    for (const category of CONTRIBUTION_CATEGORIES) {
      const declaredSet = new Set(this.namesOf(category));
      const registeredSet = new Set(registered.get(category) ?? []);
      if (declaredSet.size !== registeredSet.size) {
        return { declared: declaredText, registered: registeredText };
      }
      for (const name of declaredSet) {
        if (!registeredSet.has(name)) {
          return { declared: declaredText, registered: registeredText };
        }
      }
    }
    return null;
  }

  static describeRegistered(registered: ReadonlyMap<ContributionCategory, readonly string[]>): string {
    const parts = CONTRIBUTION_CATEGORIES
      .filter((category) => (registered.get(category) ?? []).length > 0)
      .map((category) => `${category}=[${[...(registered.get(category) ?? [])].sort().join(', ')}]`);
    return parts.length === 0 ? '(none)' : parts.join(' ');
  }
}
