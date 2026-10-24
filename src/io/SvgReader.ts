import { EditorError } from '../domain/EditorError.js';
import { NumberFormat } from '../domain/NumberFormat.js';
import { SvgDocument } from '../domain/SvgDocument.js';
import { ContainerShape } from '../domain/shape/ContainerShape.js';
import type { Shape } from '../domain/shape/Shape.js';
import type { ShapeInit } from '../domain/shape/ShapeInit.js';
import { ShapeFactory } from '../domain/shape/ShapeFactory.js';
import type { DecodeResult, SvgDecoder } from '../ports/SvgDecoder.js';
import { IdAllocator } from './IdAllocator.js';
import { XmlNode } from './xml/XmlNode.js';
import { XmlParser } from './xml/XmlParser.js';

/**
 * SVG → 文档。
 *
 * 容错策略（附录 A.7）：
 * - 缺 id / 空 id → 按"标签名 + 递增序号"补 id 并告警；
 * - 重复 id → 后出现者重新分配并告警；
 * - 未支持的元素/非法几何 → 跳过并告警（不中断整个读入）；
 * - `<text>` 的子元素（如 `<tspan>`）→ 文本按顺序展平并告警，不静默丢内容；
 * - `<g>` 的 transform → 原样保留并在 save 写回，但**不参与坐标计算**，同时告警；
 * - 未知 data-kind（阶段 2 插件类型未安装）→ 降级为普通 `<g>` 并告警；
 * - 画布尺寸：优先 width/height，其次 viewBox，最后 800×600。
 */
export class SvgReader implements SvgDecoder {
  private readonly shapes: ShapeFactory;

  constructor(shapes: ShapeFactory) {
    this.shapes = shapes;
  }

  decode(text: string): DecodeResult {
    const root = new XmlParser().parse(text);
    if (root.name !== 'svg') {
      throw new EditorError(`invalid svg: root element must be <svg>, got <${root.name}>`);
    }

    const box = this.viewBox(root.attribute('viewBox'));
    const width = this.dimension(root.attribute('width')) ?? box?.width ?? 800;
    const height = this.dimension(root.attribute('height')) ?? box?.height ?? 600;

    const document = new SvgDocument(width, height);
    const warnings: string[] = [];
    const allocator = new IdAllocator(this.collectExplicitIds(root));

    for (const child of root.children()) {
      this.readElement(child, document.canvas(), warnings, allocator);
    }
    return { document, warnings };
  }

  private readElement(
    node: XmlNode,
    parent: ContainerShape,
    warnings: string[],
    allocator: IdAllocator,
  ): void {
    const tag = node.name;
    const provider = this.shapes.providerForTag(tag);
    if (provider === null) {
      warnings.push(`warning: unsupported element <${tag}> ignored`);
      return;
    }

    const id = this.assignId(node, tag, warnings, allocator);

    const attributes = new Map<string, string>();
    for (const [name, value] of node.attributes()) {
      if (name === 'id') {
        continue;
      }
      attributes.set(name, value);
    }
    if (attributes.has('transform')) {
      warnings.push(`warning: transform not applied: ${tag}#${id}`);
    }

    const kind = attributes.get('data-kind') ?? null;
    let typeName = provider.typeName;
    if (kind !== null && kind !== typeName) {
      if (this.shapes.hasType(kind)) {
        typeName = kind;
      } else {
        warnings.push(`warning: unknown shape kind '${kind}', kept as plain ${tag}`);
      }
    }

    let textContent: string | null = null;
    if (provider.hasTextContent) {
      textContent = node.contentText().trim();
      if (node.children().length > 0) {
        warnings.push(`warning: flattened nested elements in ${tag}#${id}`);
      }
    }

    const init: ShapeInit = { attributes, textContent };
    let shape: Shape | null;
    try {
      shape = this.shapes.create(typeName, id, init);
    } catch (error) {
      if (error instanceof EditorError) {
        warnings.push(`warning: skipped <${tag}> ${tag}#${id}: ${error.message}`);
        return;
      }
      throw error;
    }
    if (shape === null) {
      return;
    }
    parent.append(shape);
    if (shape instanceof ContainerShape) {
      for (const child of node.children()) {
        this.readElement(child, shape, warnings, allocator);
      }
    }
  }

  private assignId(
    node: XmlNode,
    tag: string,
    warnings: string[],
    allocator: IdAllocator,
  ): string {
    const requested = node.attribute('id');
    if (requested === null || requested.trim().length === 0) {
      const assigned = allocator.allocate(tag);
      warnings.push(`warning: assigned id ${assigned} to unnamed <${tag}>`);
      return assigned;
    }
    if (allocator.keep(requested)) {
      return requested;
    }
    const assigned = allocator.allocate(tag);
    warnings.push(`warning: assigned id ${assigned} to duplicate id ${requested}`);
    return assigned;
  }

  private collectExplicitIds(node: XmlNode): string[] {
    const ids: string[] = [];
    const id = node.attribute('id');
    if (id !== null && id.trim().length > 0) {
      ids.push(id);
    }
    for (const child of node.children()) {
      ids.push(...this.collectExplicitIds(child));
    }
    return ids;
  }

  private dimension(raw: string | null): number | null {
    if (raw === null) {
      return null;
    }
    try {
      const parsed = NumberFormat.parse(raw.replace(/px$/, ''));
      return parsed > 0 ? parsed : null;
    } catch {
      return null;
    }
  }

  private viewBox(raw: string | null): { width: number; height: number } | null {
    if (raw === null) {
      return null;
    }
    const parts = raw.trim().split(/[\s,]+/).filter((part) => part.length > 0);
    if (parts.length !== 4) {
      return null;
    }
    try {
      const width = NumberFormat.parse(parts[2] ?? '');
      const height = NumberFormat.parse(parts[3] ?? '');
      return width > 0 && height > 0 ? { width, height } : null;
    } catch {
      return null;
    }
  }
}
