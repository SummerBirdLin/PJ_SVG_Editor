import { EditorError } from '../../domain/EditorError.js';

/** 极简 XML 元素节点：只服务于 SVG 读写，不追求成为通用 XML 库。 */
export class XmlNode {
  readonly name: string;

  private readonly attributeEntries: Array<readonly [string, string]> = [];

  private readonly childNodes: XmlNode[] = [];

  private textValue = '';

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
    this.childNodes.push(child);
  }

  children(): readonly XmlNode[] {
    return this.childNodes;
  }

  appendText(chunk: string): void {
    this.textValue += chunk;
  }

  /** 元素内的文本内容（已做实体解码；子元素文本不会混入父节点的 text）。 */
  text(): string {
    return this.textValue;
  }

  /** 仅取第一个同名子元素，够 SVG 场景使用。 */
  child(name: string): XmlNode | null {
    for (const node of this.childNodes) {
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
