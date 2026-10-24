import { NumberFormat } from '../NumberFormat.js';
import { Shape, type AttributeEntry } from './Shape.js';

/**
 * 文字 `<text>`：锚点 (x, y) + 文本内容。
 * 内容是"子文本"而不是属性，因此 `set <id> text "..."` 走特殊属性通道。
 */
export class TextShape extends Shape {
  private xValue: number;
  private yValue: number;
  private contentValue: string;

  constructor(id: string, x = 0, y = 0, content = '') {
    super(id, 'text', 'text');
    this.xValue = x;
    this.yValue = y;
    this.contentValue = content;
  }

  x(): number {
    return this.xValue;
  }

  y(): number {
    return this.yValue;
  }

  override textContent(): string {
    return this.contentValue;
  }

  override move(dx: number, dy: number): void {
    this.xValue += dx;
    this.yValue += dy;
  }

  override scale(factor: number): void {
    this.xValue *= factor;
    this.yValue *= factor;
  }

  override positionText(): string {
    return `(${this.fmt(this.xValue)},${this.fmt(this.yValue)})`;
  }

  override geometryInline(): string {
    return `(${this.fmt(this.xValue)},${this.fmt(this.yValue)}) "${this.contentValue}"`;
  }

  override geometryAttributeEntries(): AttributeEntry[] {
    return [
      ['x', this.fmt(this.xValue)],
      ['y', this.fmt(this.yValue)],
    ];
  }

  override settableGeometryAttributes(): readonly string[] {
    return ['x', 'y'];
  }

  override setAttribute(name: string, value: string): void {
    if (name === 'text') {
      this.contentValue = value;
      return;
    }
    super.setAttribute(name, value);
  }

  protected override specialAttributeNames(): readonly string[] {
    return ['text'];
  }

  protected override specialAttributeValue(name: string): string | null {
    return name === 'text' ? this.contentValue : null;
  }

  protected override specialDetailLines(): string[] {
    return [`text="${this.contentValue}"`];
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
    throw new Error(`TextShape does not know attribute: ${name}`);
  }

  private fmt(value: number): string {
    return NumberFormat.format(value);
  }
}
