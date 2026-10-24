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
 * - 缺 id → 按"标签名 + 递增序号"补 id 并告警；
 * - 重复 id → 后出现者重新分配并告警；
 * - 未支持的元素/非法几何 → 跳过并告警（不中断整个读入）；
 * - `<g>` 的 transform → 原样保留并在 save 写回，但**不参与坐标计算**，同时告警；
 * - 未知 data-kind（阶段 2 插件类型未安装）→ 降级为普通 `<g>` 并告警。
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

    const width = this.dimension(root.attribute('width'), 800);
    const height = this.dimension(root.attribute('height'), 600);
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

    const init: ShapeInit = {
      attributes,
      textContent: tag === 'text' ? node.text().trim() : null,
    };

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
    if (requested === null) {
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
    if (id !== null) {
      ids.push(id);
    }
    for (const child of node.children()) {
      ids.push(...this.collectExplicitIds(child));
    }
    return ids;
  }

  private dimension(raw: string | null, fallback: number): number {
    if (raw === null) {
      return fallback;
    }
    try {
      const parsed = NumberFormat.parse(raw.replace(/px$/, ''));
      return parsed > 0 ? parsed : fallback;
    } catch {
      return fallback;
    }
  }
}
