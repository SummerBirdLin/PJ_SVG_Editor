import { EditorError } from '../EditorError.js';
import { NumberFormat } from '../NumberFormat.js';
import type { ContainerShape } from './ContainerShape.js';

/** 一个 (属性名, 属性值) 对，值一律是"已格式化"的文本。 */
export type AttributeEntry = readonly [string, string];

/** 所有图形共享的样式属性（与具体几何无关）。 */
const STYLE_ATTRIBUTES: ReadonlySet<string> = new Set(['fill', 'stroke', 'stroke-width']);

/**
 * 图形抽象基类（Composite 模式中的 Component）。
 *
 * 职责：
 * - 持有 id 与父子关系；
 * - 用虚方法表达几何语义（move / scale / 属性读写 / 文本表示），
 *   **没有任何按 tag 字符串的 switch 分派**；
 * - 提供序列化与展示所需的统一视图：`attributes()`、`inlineText()`、`detailLines()`。
 *
 * 子类只负责自己的几何字段与属性白名单。
 */
export abstract class Shape {
  private readonly shapeId: string;
  private readonly shapeTypeName: string;
  private readonly shapeTagName: string;
  private parentContainer: ContainerShape | null = null;

  private fillColor: string | null = null;
  private strokeColor: string | null = null;
  private strokeWidthValue: number | null = null;

  /** 读入时未能识别的属性（如 data-*、fill-opacity、transform），原样保留以便 round-trip。 */
  private readonly extras = new Map<string, string>();

  constructor(id: string, typeName: string, tagName: string) {
    this.shapeId = id;
    this.shapeTypeName = typeName;
    this.shapeTagName = tagName;
  }

  id(): string {
    return this.shapeId;
  }

  typeName(): string {
    return this.shapeTypeName;
  }

  svgTag(): string {
    return this.shapeTagName;
  }

  /** `rect#bg` 形式的可读标识。 */
  label(): string {
    return `${this.typeName()}#${this.id()}`;
  }

  parent(): ContainerShape | null {
    return this.parentContainer;
  }

  /** 由容器在插入/移除时调用，维护双向关系。 */
  attachTo(parent: ContainerShape | null): void {
    this.parentContainer = parent;
  }

  // ---------------------------------------------------------------- 几何语义

  abstract move(dx: number, dy: number): void;

  abstract scale(factor: number): void;

  /** 位置的可读表示：`(x,y)`；直线为 `(x1,y1) -> (x2,y2)`。 */
  abstract positionText(): string;

  /** tree 的内联几何摘要（缩写形式，如 `x=.. w=..`）。 */
  abstract geometryInline(): string;

  /** 几何属性的有序视图（SVG 全名，如 `width=`），用于序列化与 show。 */
  abstract geometryAttributeEntries(): AttributeEntry[];

  /** 本类型允许通过 `set` 修改的几何属性名。 */
  abstract settableGeometryAttributes(): readonly string[];

  /** 子类实现：把字符串解析为自己的几何字段；非法值抛 EditorError。 */
  protected abstract setGeometryAttribute(name: string, value: string): void;

  /** 本类型在 SVG 中表现为"子文本"而非属性的特殊可设置项（text 图形用）。 */
  protected specialAttributeNames(): readonly string[] {
    return [];
  }

  /** 与 `specialAttributeNames()` 配套：读取特殊可设置项的值。 */
  protected specialAttributeValue(_name: string): string | null {
    return null;
  }

  // ---------------------------------------------------------------- 属性读写

  /** `set` 命令的统一入口：先公共样式，再本类型几何，最后报 unknown attribute。 */
  setAttribute(name: string, value: string): void {
    if (STYLE_ATTRIBUTES.has(name)) {
      this.setStyleAttribute(name, value);
      return;
    }
    if (this.settableGeometryAttributes().includes(name)) {
      this.setGeometryAttribute(name, value);
      return;
    }
    throw new EditorError(`unknown attribute: ${name}`);
  }

  /** 撤销 `set` 时用：仅样式属性支持"移除"，其余属性恒有值。 */
  unsetAttribute(name: string): void {
    if (name === 'fill') {
      this.fillColor = null;
      return;
    }
    if (name === 'stroke') {
      this.strokeColor = null;
      return;
    }
    if (name === 'stroke-width') {
      this.strokeWidthValue = null;
      return;
    }
    throw new EditorError(`unknown attribute: ${name}`);
  }

  attributeValue(name: string): string | null {
    if (name === 'fill') {
      return this.fillColor;
    }
    if (name === 'stroke') {
      return this.strokeColor;
    }
    if (name === 'stroke-width') {
      return this.strokeWidthValue === null ? null : NumberFormat.format(this.strokeWidthValue);
    }
    if (this.specialAttributeNames().includes(name)) {
      return this.specialAttributeValue(name);
    }
    for (const [key, value] of this.geometryAttributeEntries()) {
      if (key === name) {
        return value;
      }
    }
    return this.extras.get(name) ?? null;
  }

  private setStyleAttribute(name: string, value: string): void {
    if (name === 'fill') {
      this.fillColor = Shape.requireNonEmpty(name, value);
      return;
    }
    if (name === 'stroke') {
      this.strokeColor = Shape.requireNonEmpty(name, value);
      return;
    }
    this.strokeWidthValue = NumberFormat.parseNonNegative(value, 'stroke-width');
  }

  private static requireNonEmpty(name: string, value: string): string {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new EditorError(`invalid value: ${name}`);
    }
    return trimmed;
  }

  // ---------------------------------------------------------------- 统一视图

  /** 样式属性的有序视图：fill / stroke / stroke-width（仅已设置的）。 */
  styleEntries(): AttributeEntry[] {
    const entries: AttributeEntry[] = [];
    if (this.fillColor !== null) {
      entries.push(['fill', this.fillColor]);
    }
    if (this.strokeColor !== null) {
      entries.push(['stroke', this.strokeColor]);
    }
    if (this.strokeWidthValue !== null) {
      entries.push(['stroke-width', NumberFormat.format(this.strokeWidthValue)]);
    }
    return entries;
  }

  /** 序列化视图：id → 几何 → 样式 → 读入时保留的未知属性。 */
  attributes(): AttributeEntry[] {
    return [
      ['id', this.shapeId],
      ...this.geometryAttributeEntries(),
      ...this.styleEntries(),
      ...this.extraEntries(),
    ];
  }

  /** tree 的内联属性文本（几何 + fill；需求示例中不显示 stroke）。 */
  inlineText(): string {
    const geometry = this.geometryInline();
    const fill = this.fillColor === null ? '' : `fill=${this.fillColor}`;
    return [geometry, fill].filter((part) => part.length > 0).join(' ');
  }

  /** show 的明细行：几何一行 + 样式逐行；子类可追加特殊行。 */
  detailLines(): string[] {
    const lines: string[] = [];
    const geometry = this.geometryAttributeEntries()
      .map(([name, value]) => `${name}=${value}`)
      .join(' ');
    if (geometry.length > 0) {
      lines.push(geometry);
    }
    for (const [name, value] of this.styleEntries()) {
      lines.push(`${name}=${value}`);
    }
    lines.push(...this.specialDetailLines());
    return lines;
  }

  /** 子类可追加的明细行（如 text 的文本内容）。 */
  protected specialDetailLines(): string[] {
    return [];
  }

  extraEntries(): AttributeEntry[] {
    return [...this.extras.entries()];
  }

  /** 读入 SVG 时由工厂调用：样式 → 几何（已由 Provider 消费，跳过）→ 其余进 extras。 */
  applyImportedAttributes(attributes: ReadonlyMap<string, string>): void {
    for (const [name, value] of attributes) {
      if (STYLE_ATTRIBUTES.has(name)) {
        try {
          this.setStyleAttribute(name, value);
        } catch {
          this.extras.set(name, value);
        }
        continue;
      }
      if (this.settableGeometryAttributes().includes(name)) {
        continue;
      }
      this.extras.set(name, value);
    }
  }

  // ---------------------------------------------------------------- 树操作

  contains(shape: Shape): boolean {
    return this === shape;
  }

  findById(id: string): Shape | null {
    return this.id() === id ? this : null;
  }

  /** 本子树中的图形元素个数（含自身）。 */
  elementCount(): number {
    return 1;
  }

  /** scale 撤销用的几何快照（整棵子树由命令负责遍历）。 */
  snapshotGeometry(): AttributeEntry[] {
    return this.geometryAttributeEntries();
  }
}
