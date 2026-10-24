/** XML 输出的小工具：标签/属性/文本的转义与拼装（缩进由 SvgWriter 负责）。 */
export class XmlWriter {
  declaration(): string {
    return '<?xml version="1.0" encoding="UTF-8"?>';
  }

  openTag(name: string, attributes: readonly (readonly [string, string])[]): string {
    const rendered = this.renderAttributes(attributes);
    return rendered.length === 0 ? `<${name}>` : `<${name} ${rendered}>`;
  }

  selfClosingTag(name: string, attributes: readonly (readonly [string, string])[]): string {
    const rendered = this.renderAttributes(attributes);
    return rendered.length === 0 ? `<${name}/>` : `<${name} ${rendered}/>`;
  }

  closeTag(name: string): string {
    return `</${name}>`;
  }

  escapeText(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private renderAttributes(attributes: readonly (readonly [string, string])[]): string {
    return attributes.map(([name, value]) => `${name}="${this.escapeAttribute(value)}"`).join(' ');
  }

  private escapeAttribute(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
