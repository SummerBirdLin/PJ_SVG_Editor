import { NumberFormat } from '../NumberFormat.js';
import { Shape, type AttributeEntry } from './Shape.js';

/** 圆 `<circle>`：圆心 (cx, cy) + 半径 r。 */
export class CircleShape extends Shape {
  private cxValue: number;
  private cyValue: number;
  private radiusValue: number;

  constructor(id: string, cx = 0, cy = 0, radius = 0) {
    super(id, 'circle', 'circle');
    this.cxValue = cx;
    this.cyValue = cy;
    this.radiusValue = radius;
  }

  cx(): number {
    return this.cxValue;
  }

  cy(): number {
    return this.cyValue;
  }

  radius(): number {
    return this.radiusValue;
  }

  override move(dx: number, dy: number): void {
    this.cxValue += dx;
    this.cyValue += dy;
  }

  override scale(factor: number): void {
    this.cxValue *= factor;
    this.cyValue *= factor;
    this.radiusValue *= factor;
  }

  override positionText(): string {
    return `(${this.fmt(this.cxValue)},${this.fmt(this.cyValue)})`;
  }

  override geometryInline(): string {
    return `cx=${this.fmt(this.cxValue)} cy=${this.fmt(this.cyValue)} r=${this.fmt(this.radiusValue)}`;
  }

  override geometryAttributeEntries(): AttributeEntry[] {
    return [
      ['cx', this.fmt(this.cxValue)],
      ['cy', this.fmt(this.cyValue)],
      ['r', this.fmt(this.radiusValue)],
    ];
  }

  override settableGeometryAttributes(): readonly string[] {
    return ['cx', 'cy', 'r'];
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
    if (name === 'r') {
      this.radiusValue = NumberFormat.parseNonNegative(value, 'r');
      return;
    }
    throw new Error(`CircleShape does not know attribute: ${name}`);
  }

  private fmt(value: number): string {
    return NumberFormat.format(value);
  }
}
