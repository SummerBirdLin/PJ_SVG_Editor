import { EditorError } from '../../domain/EditorError.js';
import type { SvgDocument } from '../../domain/SvgDocument.js';
import { ContainerShape } from '../../domain/shape/ContainerShape.js';
import type { Shape } from '../../domain/shape/Shape.js';
import type { TreeDecorator } from '../../plugin-api/TreeDecorator.js';
import { DisplayWidth } from '../DisplayWidth.js';

/**
 * `tree` 的格式化（Strategy）：只读模型、不写模型。
 *
 * 对齐规则（附录 A.3）：同一父节点的兄弟为一组，
 * 组内 label 补齐到"最长 label + 2"；无内联属性的行不补尾随空格。
 *
 * 阶段 2 起行尾标签由**装饰器**提供：本类只按注册顺序把标签用空格拼到行尾，
 * 不认识任何具体标签（`*`、`(box)`…）。没有装饰器时输出与阶段 1 逐字节相同。
 */
export class TreePresenter {
  private readonly displayWidth = new DisplayWidth();

  private readonly decorators: readonly TreeDecorator[];

  constructor(decorators: readonly TreeDecorator[] = []) {
    this.decorators = decorators;
  }

  render(document: SvgDocument, rootId?: string): string[] {
    if (rootId === undefined) {
      const lines: string[] = [];
      lines.push(this.decorate(`svg (${document.canvas().sizeText()})`, null, document));
      lines.push(...this.renderChildren(document.canvas(), '', document));
      return lines;
    }

    const located = document.locate(rootId);
    if (located === null) {
      throw new EditorError(`no such shape: ${rootId}`);
    }
    const lines: string[] = [this.decorate(this.compose('', located.shape, null), located.shape, document)];
    if (located.shape instanceof ContainerShape) {
      lines.push(...this.renderChildren(located.shape, '', document));
    }
    return lines;
  }

  private renderChildren(container: ContainerShape, prefix: string, document: SvgDocument): string[] {
    const children = container.children();
    if (children.length === 0) {
      return [];
    }
    const longestLabel = Math.max(...children.map((child) => this.displayWidth.width(child.label())));
    const lines: string[] = [];
    children.forEach((child, index) => {
      const isLast = index === children.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      lines.push(this.decorate(this.compose(prefix + connector, child, longestLabel), child, document));
      if (child instanceof ContainerShape) {
        lines.push(...this.renderChildren(child, prefix + (isLast ? '    ' : '│   '), document));
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

  /** 行尾标签：多个装饰器按注册顺序拼接；装饰器违反契约时给出可定位的错误。 */
  private decorate(line: string, shape: Shape | null, document: SvgDocument): string {
    const labels: string[] = [];
    for (const decorator of this.decorators) {
      let label: string;
      try {
        label = decorator.labelFor({ shape, document });
      } catch (error) {
        throw new EditorError(
          `tree decorator failed: ${decorator.decoratorName} (${error instanceof Error ? error.message : String(error)})`,
        );
      }
      if (typeof label !== 'string') {
        throw new EditorError(`tree decorator failed: ${decorator.decoratorName} (label must be a string)`);
      }
      if (label.length > 0) {
        labels.push(label);
      }
    }
    return labels.length === 0 ? line : `${line} ${labels.join(' ')}`;
  }
}
