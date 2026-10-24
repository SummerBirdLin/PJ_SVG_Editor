import { NumberFormat } from '../NumberFormat.js';
import { Shape, type AttributeEntry } from './Shape.js';

/** 椭圆 `<ellipse>`：圆心 (cx, cy) + 两个半径 (rx, ry)。 */
export class EllipseShape extends Shape {
  private cxValue: number;
  private cyValue: number;
  private rxValue: number;
  private ryValue: number;

  constructor(id: string, cx = 0, cy = 0, rx = 0, ry = 0) {
    super(id, 'ellipse', 'ellipse');
    this.cxValue = cx;
    this.cyValue = cy;
    this.rxValue = rx;
    this.ryValue = ry;
  }

  cx(): number {
    return this.cxValue;
  }

  cy(): number {
    return this.cyValue;
  }

  rx(): number {
    return this.rxValue;
  }

  ry(): number {
    return this.ryValue;
  }

  override move(dx: number, dy: number): void {
    this.cxValue += dx;
    this.cyValue += dy;
  }

  override scale(factor: number): void {
    this.cxValue *= factor;
    this.cyValue *= factor;
    this.rxValue *= factor;
    this.ryValue *= factor;
  }

  override positionText(): string {
    return `(${this.fmt(this.cxValue)},${this.fmt(this.cyValue)})`;
  }

  override geometryInline(): string {
    return `cx=${this.fmt(this.cxValue)} cy=${this.fmt(this.cyValue)} `
      + `rx=${this.fmt(this.rxValue)} ry=${this.fmt(this.ryValue)}`;
  }

  override geometryAttributeEntries(): AttributeEntry[] {
    return [
      ['cx', this.fmt(this.cxValue)],
      ['cy', this.fmt(this.cyValue)],
      ['rx', this.fmt(this.rxValue)],
      ['ry', this.fmt(this.ryValue)],
    ];
  }

  override settableGeometryAttributes(): readonly string[] {
    return ['cx', 'cy', 'rx', 'ry'];
  }

  protected override setGeometryAttribute(name: string, value: string): void {
    if (name === 'cx') {
      this.cxValue = NumberFormat.parse(value);
      return;
    }
    if (name === 'cy') {
      this.cyValue = NumberFormat.parse(value);
      return;
    }
    if (name === 'rx') {
      this.rxValue = NumberFormat.parseNonNegative(value, 'rx');
      return;
    }
    if (name === 'ry') {
      this.ryValue = NumberFormat.parseNonNegative(value, 'ry');
      return;
    }
    throw new Error(`EllipseShape does not know attribute: ${name}`);
  }

  private fmt(value: number): string {
    return NumberFormat.format(value);
  }
}
