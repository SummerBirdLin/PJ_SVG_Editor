import { NumberFormat } from '../domain/NumberFormat.js';
import type { SvgDocument } from '../domain/SvgDocument.js';
import { ContainerShape } from '../domain/shape/ContainerShape.js';
import type { Shape } from '../domain/shape/Shape.js';
import type { SvgEncoder } from '../ports/SvgEncoder.js';
import { XmlWriter } from './xml/XmlWriter.js';

/**
 * 文档 → SVG 文本（格式约定见附录 A.6）：
 * 2 空格缩进；属性顺序 id → 几何 → 样式 → 保留的未知属性；
 * `<text>` 的内容写成子文本节点；空容器写自闭合标签。
 */
export class SvgWriter implements SvgEncoder {
  private readonly xml = new XmlWriter();

  encode(document: SvgDocument): string {
    const canvas = document.canvas();
    const width = NumberFormat.format(canvas.width());
    const height = NumberFormat.format(canvas.height());
    const rootAttributes: Array<readonly [string, string]> = [
      ['xmlns', 'http://www.w3.org/2000/svg'],
      ['width', width],
      ['height', height],
      ['viewBox', `0 0 ${width} ${height}`],
    ];

    const lines: string[] = [this.xml.declaration()];
    const children = canvas.children();
    if (children.length === 0) {
      lines.push(this.xml.selfClosingTag('svg', rootAttributes));
    } else {
      lines.push(this.xml.openTag('svg', rootAttributes));
      for (const child of children) {
        this.renderShape(child, 1, lines);
      }
      lines.push(this.xml.closeTag('svg'));
    }
    return `${lines.join('\n')}\n`;
  }

  private renderShape(shape: Shape, depth: number, lines: string[]): void {
    const indent = '  '.repeat(depth);
    const tag = shape.svgTag();
    const attributes = shape.attributes();

    if (shape instanceof ContainerShape) {
      const children = shape.children();
      if (children.length === 0) {
        lines.push(indent + this.xml.selfClosingTag(tag, attributes));
        return;
      }
      lines.push(indent + this.xml.openTag(tag, attributes));
      for (const child of children) {
        this.renderShape(child, depth + 1, lines);
      }
      lines.push(indent + this.xml.closeTag(tag));
      return;
    }

    const content = shape.textContent();
    if (content !== null && content.length > 0) {
      lines.push(indent + this.xml.openTag(tag, attributes) + this.xml.escapeText(content) + this.xml.closeTag(tag));
      return;
    }
    lines.push(indent + this.xml.selfClosingTag(tag, attributes));
  }
}
