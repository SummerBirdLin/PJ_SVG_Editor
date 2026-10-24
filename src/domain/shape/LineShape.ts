import { NumberFormat } from '../NumberFormat.js';
import { Shape, type AttributeEntry } from './Shape.js';

/** 直线 `<line>`：两个端点 (x1, y1) -> (x2, y2)。 */
export class LineShape extends Shape {
  private x1Value: number;
  private y1Value: number;
  private x2Value: number;
  private y2Value: number;

  constructor(id: string, x1 = 0, y1 = 0, x2 = 0, y2 = 0) {
    super(id, 'line', 'line');
    this.x1Value = x1;
    this.y1Value = y1;
    this.x2Value = x2;
    this.y2Value = y2;
  }

  x1(): number {
    return this.x1Value;
  }

  y1(): number {
    return this.y1Value;
  }

  x2(): number {
    return this.x2Value;
  }

  y2(): number {
    return this.y2Value;
  }

  override move(dx: number, dy: number): void {
    this.x1Value = this.requireFinite(this.x1Value + dx, 'x1');
    this.y1Value = this.requireFinite(this.y1Value + dy, 'y1');
    this.x2Value = this.requireFinite(this.x2Value + dx, 'x2');
    this.y2Value = this.requireFinite(this.y2Value + dy, 'y2');
  }

  override scale(factor: number): void {
    this.x1Value = this.requireFinite(this.x1Value * factor, 'x1');
    this.y1Value = this.requireFinite(this.y1Value * factor, 'y1');
    this.x2Value = this.requireFinite(this.x2Value * factor, 'x2');
    this.y2Value = this.requireFinite(this.y2Value * factor, 'y2');
  }

  override positionText(): string {
    return `(${this.fmt(this.x1Value)},${this.fmt(this.y1Value)}) -> `
      + `(${this.fmt(this.x2Value)},${this.fmt(this.y2Value)})`;
  }

  override geometryInline(): string {
    return this.positionText();
  }

  override geometryAttributeEntries(): AttributeEntry[] {
    return [
      ['x1', this.fmt(this.x1Value)],
      ['y1', this.fmt(this.y1Value)],
      ['x2', this.fmt(this.x2Value)],
      ['y2', this.fmt(this.y2Value)],
    ];
  }

  override settableGeometryAttributes(): readonly string[] {
    return ['x1', 'y1', 'x2', 'y2'];
  }

  protected override setGeometryAttribute(name: string, value: string): void {
    if (name === 'x1') {
      this.x1Value = NumberFormat.parse(value);
      return;
    }
    if (name === 'y1') {
      this.y1Value = NumberFormat.parse(value);
      return;
    }
    if (name === 'x2') {
      this.x2Value = NumberFormat.parse(value);
      return;
    }
    if (name === 'y2') {
      this.y2Value = NumberFormat.parse(value);
      return;
    }
    throw new Error(`LineShape does not know attribute: ${name}`);
  }

  private fmt(value: number): string {
    return NumberFormat.format(value);
  }
}
