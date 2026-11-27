import type { ShapeProvider } from './ShapeProvider.js';

/**
 * 图形类型注册表的**只读视图**（领域侧接口）。
 *
 * `ShapeFactory` 只依赖这个接口，因此 domain 不需要知道"插件注册"的存在：
 * 阶段 1 的硬编码 Provider 表被替换成"由外部注入的查找表"，
 * 具体实现（`ContributionRegistry`）在内核的插件层，domain 保持零依赖。
 */
export interface ShapeProviderLookup {
  /** 按类型名查找；未注册时抛 `unknown shape type: <name>`。 */
  providerForType(typeName: string): ShapeProvider;

  /** 按 SVG 标签查找；未注册返回 null（读入时由 Reader 告警并跳过）。 */
  providerForTag(tagName: string): ShapeProvider | null;

  hasType(typeName: string): boolean;

  /** 已注册类型名，按注册顺序。 */
  typeNames(): readonly string[];
}
