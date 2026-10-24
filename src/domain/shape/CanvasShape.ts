import { EditorError } from '../EditorError.js';
import { NumberFormat } from '../NumberFormat.js';
import { ContainerShape } from './ContainerShape.js';

/**
 * 画布（`<svg>` 根）—— 一个容器，但**不是可编辑图形**：
 * 它没有 id、不能 move/scale/set，尺寸只能经 `resize()` 修改。
 * 这样 `in`/`addto` 只认 `GShape` 之后，也不存在"把画布当普通图形"的误用面。
 */
export class CanvasShape extends ContainerShape {
  private canvasWidth: number;
  private canvasHeight: number;

  constructor(width = 800, height = 600) {
    super('', 'svg', 'svg');
    this.canvasWidth = width;
    this.canvasHeight = height;
  }

  override label(): string {
    return 'svg';
  }

  width(): number {
    return this.canvasWidth;
  }

  height(): number {
    return this.canvasHeight;
  }

  sizeText(): string {
    return `${NumberFormat.format(this.canvasWidth)}x${NumberFormat.format(this.canvasHeight)}`;
  }

  /** 画布尺寸的唯一修改入口（`init` 与 `canvas` 命令使用）。 */
  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) {
      throw new EditorError('canvas size must be positive');
    }
    this.canvasWidth = width;
    this.canvasHeight = height;
  }

  override move(_dx: number, _dy: number): void {
    throw new EditorError('cannot modify the canvas as a shape');
  }

  override scale(_factor: number): void {
    throw new EditorError('cannot modify the canvas as a shape');
  }

  override setAttribute(_name: string, _value: string): void {
    throw new EditorError('cannot modify the canvas as a shape');
  }

  override detailLines(): string[] {
    return [];
  }
}
