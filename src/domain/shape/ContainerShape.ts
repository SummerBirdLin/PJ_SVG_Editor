import { EditorError } from '../EditorError.js';
import { Shape, type AttributeEntry } from './Shape.js';

/**
 * 容器基类（Composite 模式中的 Composite）。
 *
 * 与叶子共享同一接口：`move`/`scale` 递归到每个子孙，
 * 子节点数组只有本类可以修改；父指针由插入/移除时维护。
 */
export abstract class ContainerShape extends Shape {
  private readonly childList: Shape[] = [];

  children(): readonly Shape[] {
    return this.childList;
  }

  childCount(): number {
    return this.childList.length;
  }

  append(child: Shape): void {
    this.childList.push(child);
    child.attachTo(this);
  }

  insert(index: number, child: Shape): void {
    const bounded = Math.max(0, Math.min(index, this.childList.length));
    this.childList.splice(bounded, 0, child);
    child.attachTo(this);
  }

  remove(child: Shape): boolean {
    const index = this.childList.indexOf(child);
    if (index < 0) {
      return false;
    }
    this.childList.splice(index, 1);
    child.attachTo(null);
    return true;
  }

  indexOf(child: Shape): number {
    return this.childList.indexOf(child);
  }

  override move(dx: number, dy: number): void {
    for (const child of this.childList) {
      child.move(dx, dy);
    }
  }

  override scale(factor: number): void {
    for (const child of this.childList) {
      child.scale(factor);
    }
  }

  override positionText(): string {
    return '';
  }

  override geometryInline(): string {
    return '';
  }

  override geometryAttributeEntries(): AttributeEntry[] {
    return [];
  }

  override settableGeometryAttributes(): readonly string[] {
    return [];
  }

  /** 容器没有自己的几何属性，走到这里说明白名单实现有误。 */
  protected override setGeometryAttribute(name: string, _value: string): void {
    throw new EditorError(`unknown attribute: ${name}`);
  }

  override detailLines(): string[] {
    return [...super.detailLines(), `children=${this.childCount()}`];
  }

  override contains(shape: Shape): boolean {
    if (this === shape) {
      return true;
    }
    return this.childList.some((child) => child.contains(shape));
  }

  override findById(id: string): Shape | null {
    if (this.id() === id) {
      return this;
    }
    for (const child of this.childList) {
      const found = child.findById(id);
      if (found !== null) {
        return found;
      }
    }
    return null;
  }

  override elementCount(): number {
    return this.childList.reduce((total, child) => total + child.elementCount(), 1);
  }
}
