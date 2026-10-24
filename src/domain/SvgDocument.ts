import { CanvasShape } from './shape/CanvasShape.js';
import { ContainerShape } from './shape/ContainerShape.js';
import type { Shape } from './shape/Shape.js';

/** locate 的结果：图形本身 + 它所在的父容器 + 在父容器中的索引。 */
export interface LocatedShape {
  readonly shape: Shape;
  readonly parent: ContainerShape;
  readonly index: number;
}

/**
 * 当前编辑的文档：一个画布 + 其下的图形树。
 *
 * id → 节点 的定位**唯一收敛在 `locate()`**（`findById` 是它的投影），
 * 这样将来若改成结构路径寻址，只需替换这一个方法；
 * `group`/`addto`/`delete` 等需要"父节点 + 索引"的命令都走 `locate()`。
 */
export class SvgDocument {
  private readonly canvasShape: CanvasShape;

  constructor(width = 800, height = 600) {
    this.canvasShape = new CanvasShape(width, height);
  }

  canvas(): CanvasShape {
    return this.canvasShape;
  }

  width(): number {
    return this.canvasShape.width();
  }

  height(): number {
    return this.canvasShape.height();
  }

  locate(id: string): LocatedShape | null {
    return this.locateIn(this.canvasShape, id);
  }

  findById(id: string): Shape | null {
    return this.locate(id)?.shape ?? null;
  }

  isIdTaken(id: string): boolean {
    return this.locate(id) !== null;
  }

  /** 画布根以下的图形元素个数（`read`/`save` 的 `(N elements)` 口径）。 */
  elementCount(): number {
    return this.canvasShape.children().reduce((total, child) => total + child.elementCount(), 0);
  }

  private locateIn(container: ContainerShape, id: string): LocatedShape | null {
    const children = container.children();
    for (let index = 0; index < children.length; index += 1) {
      const child = children[index];
      if (child === undefined) {
        continue;
      }
      if (child.id() === id) {
        return { shape: child, parent: container, index };
      }
      if (child instanceof ContainerShape) {
        const found = this.locateIn(child, id);
        if (found !== null) {
          return found;
        }
      }
    }
    return null;
  }
}
