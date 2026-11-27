import type { Shape } from '../domain/shape/Shape.js';

/**
 * 处理器眼中的"目标图形"：只暴露公开查询能力，字段仍然封装在图形里。
 *
 * `child(id)` 让复合图形（如 `box`）的处理器能定位自己的子部件，
 * 而不需要知道子部件的具体类型，也不需要用 `instanceof` 判断。
 */
export interface ShapeTarget {
  readonly shape: Shape;

  readonly typeName: string;

  /** 本图形子树内按 id 查找子部件（不含自身）；找不到返回 null。 */
  child(id: string): Shape | null;

  /** 直接子部件（叶子为空数组）。 */
  children(): readonly Shape[];
}

/** `ShapeTarget` 的标准实现（处理器拿到的就是它）。 */
export class ShapeTargetView implements ShapeTarget {
  readonly shape: Shape;

  readonly typeName: string;

  constructor(shape: Shape) {
    this.shape = shape;
    this.typeName = shape.typeName();
  }

  child(id: string): Shape | null {
    const found = this.shape.findById(id);
    return found === null || found === this.shape ? null : found;
  }

  children(): readonly Shape[] {
    const candidate = this.shape as Shape & { children?: () => readonly Shape[] };
    return typeof candidate.children === 'function' ? candidate.children() : [];
  }
}
