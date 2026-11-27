import { EditorError } from '../../../src/domain/EditorError.js';
import { NumberFormat } from '../../../src/domain/NumberFormat.js';
import { Shape, type AttributeEntry } from '../../../src/domain/shape/Shape.js';

/**
 * `diamond`：菱形（可选拓展任务，用来二次验证"新增基本图形也不改内核"）。
 *
 * 内部状态只有外接矩形 `(x, y, width, height)`；序列化成合法 SVG 的
 * `<polygon points="上 右 下 左">`，读回时由 `points` 反算外接矩形。
 * 因此它既满足"输出是合法 SVG"，也不给内核增加任何新概念。
 */
export class DiamondShape extends Shape {
  private xValue: number;

  private yValue: number;

  private widthValue: number;

  private heightValue: number;

  constructor(id: string, x = 0, y = 0, width = 0, height = 0) {
    super(id, 'diamond', 'polygon');
    this.xValue = x;
    this.yValue = y;
    this.widthValue = width;
    this.heightValue = height;
  }

  x(): number {
    return this.xValue;
  }

  y(): number {
    return this.yValue;
  }

  width(): number {
    return this.widthValue;
  }

  height(): number {
    return this.heightValue;
  }

  /** 四角点：上、右、下、左（顺序固定，round-trip 稳定）。 */
  points(): Array<readonly [number, number]> {
    const centerX = this.xValue + this.widthValue / 2;
    const centerY = this.yValue + this.heightValue / 2;
    return [
      [centerX, this.yValue],
      [this.xValue + this.widthValue, centerY],
      [centerX, this.yValue + this.heightValue],
      [this.xValue, centerY],
    ];
  }

  /** 从 `<polygon points>` 反算外接矩形（四个点 → 包围盒）。 */
  static boundingBoxOf(points: readonly (readonly [number, number])[]): {
    x: number;
    y: number;
    width: number;
    height: number;
  } {
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return {
      x: minX,
      y: minY,
      width: Math.max(...xs) - minX,
      height: Math.max(...ys) - minY,
    };
  }

  override move(dx: number, dy: number): void {
    this.xValue = this.requireFinite(this.xValue + dx, 'x');
    this.yValue = this.requireFinite(this.yValue + dy, 'y');
  }

  override scale(factor: number): void {
    this.xValue = this.requireFinite(this.xValue * factor, 'x');
    this.yValue = this.requireFinite(this.yValue * factor, 'y');
    this.widthValue = this.requireFinite(this.widthValue * factor, 'width');
    this.heightValue = this.requireFinite(this.heightValue * factor, 'height');
  }

  override positionText(): string {
    return `(${this.fmt(this.xValue)},${this.fmt(this.yValue)})`;
  }

  override geometryInline(): string {
    return `x=${this.fmt(this.xValue)} y=${this.fmt(this.yValue)} `
      + `w=${this.fmt(this.widthValue)} h=${this.fmt(this.heightValue)}`;
  }

  override geometryAttributeEntries(): AttributeEntry[] {
    const rounded = this.points()
      .map(([x, y]) => `${this.fmt(x)},${this.fmt(y)}`)
      .join(' ');
    return [['points', rounded]];
  }

  override settableGeometryAttributes(): readonly string[] {
    return ['x', 'y', 'width', 'height'];
  }

  /**
   * `points` 是序列化形式，`x/y/width/height` 才是用户书写的属性：
   * 因此 `show`/`set` 的回显要能回答后者（否则 `set d1 width 100` 会回显 `width=none`）。
   */
  override attributeValue(name: string): string | null {
    if (name === 'x') {
      return this.fmt(this.xValue);
    }
    if (name === 'y') {
      return this.fmt(this.yValue);
    }
    if (name === 'width') {
      return this.fmt(this.widthValue);
    }
    if (name === 'height') {
      return this.fmt(this.heightValue);
    }
    return super.attributeValue(name);
  }

  protected override setGeometryAttribute(name: string, value: string): void {
    if (name === 'x') {
      this.xValue = NumberFormat.parse(value);
      return;
    }
    if (name === 'y') {
      this.yValue = NumberFormat.parse(value);
      return;
    }
    if (name === 'width') {
      this.widthValue = NumberFormat.parseNonNegative(value, 'width');
      return;
    }
    if (name === 'height') {
      this.heightValue = NumberFormat.parseNonNegative(value, 'height');
      return;
    }
    throw new EditorError(`DiamondShape does not know attribute: ${name}`);
  }

  private fmt(value: number): string {
    return NumberFormat.format(value);
  }
}
