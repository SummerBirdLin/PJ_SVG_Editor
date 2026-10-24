import { EditorError } from '../EditorError.js';
import type { Shape } from './Shape.js';
import type { ShapeInit } from './ShapeInit.js';
import { ShapeProvider } from './provider/ShapeProvider.js';
import { CircleProvider } from './provider/CircleProvider.js';
import { EllipseProvider } from './provider/EllipseProvider.js';
import { GroupProvider } from './provider/GroupProvider.js';
import { LineProvider } from './provider/LineProvider.js';
import { RectProvider } from './provider/RectProvider.js';
import { TextProvider } from './provider/TextProvider.js';

/**
 * 图形工厂（需求允许的两处"按名分派"之一，已标注为待重构）。
 *
 * 阶段 2 会把构造这段的硬编码表换成运行时插件注册（ShapeProvider 插槽），
 * 届时新增 `box` 类型无需改动本类以外的任何代码。
 */
export class ShapeFactory {
  private readonly providersByType = new Map<string, ShapeProvider>();
  private readonly providersByTag = new Map<string, ShapeProvider>();

  constructor() {
    const providers: readonly ShapeProvider[] = [
      new RectProvider(),
      new CircleProvider(),
      new EllipseProvider(),
      new LineProvider(),
      new TextProvider(),
      new GroupProvider(),
    ];
    for (const provider of providers) {
      this.providersByType.set(provider.typeName, provider);
      this.providersByTag.set(provider.svgTag, provider);
    }
  }

  /** 未注册类型统一报错（含阶段 2 的插件提示语）。 */
  providerForType(typeName: string): ShapeProvider {
    const provider = this.providersByType.get(typeName);
    if (provider === undefined) {
      throw new EditorError(`unknown shape type: ${typeName} (is the plugin loaded?)`);
    }
    return provider;
  }

  /** 读入 SVG 时按标签找 Provider；未支持的标签返回 null（由 Reader 告警并跳过）。 */
  providerForTag(tagName: string): ShapeProvider | null {
    return this.providersByTag.get(tagName) ?? null;
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
    return this.providersByType.has(typeName);
  }

  typeNames(): readonly string[] {
    return [...this.providersByType.keys()];
  }
}
