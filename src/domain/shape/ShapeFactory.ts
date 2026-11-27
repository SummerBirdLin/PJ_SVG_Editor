import { EditorError } from '../EditorError.js';
import type { Shape } from './Shape.js';
import type { ShapeInit } from './ShapeInit.js';
import type { ShapeProvider } from './provider/ShapeProvider.js';
import type { ShapeProviderLookup } from './provider/ShapeProviderLookup.js';

/**
 * 图形工厂：`类型名 / SVG 标签 → ShapeProvider`，再据 Provider 造对象。
 *
 * 阶段 2 起本类**不再硬编码任何类型表**：Provider 由外部（插件注册表）注入，
 * 且查找是**每次现查**而不是构造时快照——这样"运行期新增一个图形类型"
 * 不需要重建工厂，也不需要改本文件。`box` / `diamond` 插件都是这样接进来的。
 */
export class ShapeFactory {
  private readonly lookup: ShapeProviderLookup;

  constructor(lookup: ShapeProviderLookup) {
    this.lookup = lookup;
  }

  /** 未注册类型统一报错（含"插件是否加载"的提示）。 */
  providerForType(typeName: string): ShapeProvider {
    const provider = this.lookup.providerForType(typeName);
    if (provider === null || provider === undefined) {
      throw new EditorError(`unknown shape type: ${typeName} (is the plugin loaded?)`);
    }
    return provider;
  }

  /** 读入 SVG 时按标签找 Provider；未支持的标签返回 null（由 Reader 告警并跳过）。 */
  providerForTag(tagName: string): ShapeProvider | null {
    return this.lookup.providerForTag(tagName);
  }

  create(typeName: string, id: string, init: ShapeInit): Shape {
    const provider = this.providerForType(typeName);
    const shape = provider.create(id, init);
    shape.applyImportedAttributes(init.attributes);
    return shape;
  }

  createFromTag(tagName: string, id: string, init: ShapeInit): Shape | null {
    const provider = this.providerForTag(tagName);
    if (provider === null) {
      return null;
    }
    const shape = provider.create(id, init);
    shape.applyImportedAttributes(init.attributes);
    return shape;
  }

  hasType(typeName: string): boolean {
    return this.lookup.hasType(typeName);
  }

  typeNames(): readonly string[] {
    return this.lookup.typeNames();
  }
}
