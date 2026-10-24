import { EditorError } from '../../domain/EditorError.js';

/** 极简 XML 元素节点：只服务于 SVG 读写，不追求成为通用 XML 库。 */
export class XmlNode {
  readonly name: string;

  private readonly attributeEntries: Array<readonly [string, string]> = [];

  /** 文本片段与子元素按文档顺序保存（`<text>a<tspan>b</tspan>c</text>` 的 a/b/c 不会乱序）。 */
  private readonly contentParts: Array<string | XmlNode> = [];

  constructor(name: string) {
    this.name = name;
  }

  addAttribute(name: string, value: string): void {
    this.attributeEntries.push([name, value]);
  }

  attribute(name: string): string | null {
    for (const [key, value] of this.attributeEntries) {
      if (key === name) {
        return value;
      }
    }
    return null;
  }

  attributes(): readonly (readonly [string, string])[] {
    return this.attributeEntries;
  }

  appendChild(child: XmlNode): void {
    this.contentParts.push(child);
  }

  appendText(chunk: string): void {
    const last = this.contentParts[this.contentParts.length - 1];
    if (typeof last === 'string') {
      this.contentParts[this.contentParts.length - 1] = last + chunk;
      return;
    }
    this.contentParts.push(chunk);
  }

  children(): readonly XmlNode[] {
    return this.contentParts.filter((part): part is XmlNode => typeof part !== 'string');
  }

  /** 直接文本（不含子元素里的文本）。 */
  text(): string {
    return this.contentParts.filter((part): part is string => typeof part === 'string').join('');
  }

  /** 把子元素里的文本也按顺序展开（用于 `<text><tspan>…</tspan></text>` 的容错读入）。 */
  contentText(): string {
    return this.contentParts
      .map((part) => (typeof part === 'string' ? part : part.contentText()))
      .join('');
  }

  /** 仅取第一个同名子元素，够 SVG 场景使用。 */
  child(name: string): XmlNode | null {
    for (const node of this.children()) {
      if (node.name === name) {
        return node;
      }
    }
    return null;
  }

  requireChild(name: string): XmlNode {
    const found = this.child(name);
    if (found === null) {
      throw new EditorError(`invalid svg: missing <${name}> element`);
    }
    return found;
  }
}
