import { EditorError } from '../../domain/EditorError.js';
import type { SvgDocument } from '../../domain/SvgDocument.js';
import { ContainerShape } from '../../domain/shape/ContainerShape.js';
import type { Shape } from '../../domain/shape/Shape.js';
import { DisplayWidth } from '../DisplayWidth.js';

/**
 * `tree` 的格式化（Strategy）：只读模型、不写模型。
 *
 * 对齐规则（附录 A.3）：同一父节点的兄弟为一组，
 * 组内 label 补齐到"最长 label + 2"；无内联属性的行不补尾随空格。
 */
export class TreePresenter {
  private readonly displayWidth = new DisplayWidth();

  render(document: SvgDocument, rootId?: string): string[] {
    if (rootId === undefined) {
      const lines: string[] = [`svg (${document.canvas().sizeText()})`];
      lines.push(...this.renderChildren(document.canvas(), ''));
      return lines;
    }

    const located = document.locate(rootId);
    if (located === null) {
      throw new EditorError(`no such shape: ${rootId}`);
    }
    const lines: string[] = [this.compose('', located.shape, null)];
    if (located.shape instanceof ContainerShape) {
      lines.push(...this.renderChildren(located.shape, ''));
    }
    return lines;
  }

  private renderChildren(container: ContainerShape, prefix: string): string[] {
    const children = container.children();
    if (children.length === 0) {
      return [];
    }
    const longestLabel = Math.max(...children.map((child) => this.displayWidth.width(child.label())));
    const lines: string[] = [];
    children.forEach((child, index) => {
      const isLast = index === children.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      lines.push(this.compose(prefix + connector, child, longestLabel));
      if (child instanceof ContainerShape) {
        lines.push(...this.renderChildren(child, prefix + (isLast ? '    ' : '│   ')));
      }
    });
    return lines;
  }

  private compose(prefix: string, shape: Shape, longestLabel: number | null): string {
    const label = shape.label();
    const inline = shape.inlineText();
    if (inline.length === 0) {
      return prefix + label;
    }
    if (longestLabel === null) {
      return `${prefix}${label} ${inline}`;
    }
    return `${prefix}${this.displayWidth.padEnd(label, longestLabel + 2)}${inline}`;
  }
}
