import { NumberFormat } from '../NumberFormat.js';
import { Shape, type AttributeEntry } from './Shape.js';

/** 矩形 `<rect>`：位置 (x, y) + 尺寸 (width, height)。 */
export class RectShape extends Shape {
  private xValue: number;
  private yValue: number;
  private widthValue: number;
  private heightValue: number;

  constructor(id: string, x = 0, y = 0, width = 0, height = 0) {
    super(id, 'rect', 'rect');
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
    return [
      ['x', this.fmt(this.xValue)],
      ['y', this.fmt(this.yValue)],
      ['width', this.fmt(this.widthValue)],
      ['height', this.fmt(this.heightValue)],
    ];
  }

  override settableGeometryAttributes(): readonly string[] {
    return ['x', 'y', 'width', 'height'];
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
    throw new Error(`RectShape does not know attribute: ${name}`);
  }

  private fmt(value: number): string {
    return NumberFormat.format(value);
  }
}
