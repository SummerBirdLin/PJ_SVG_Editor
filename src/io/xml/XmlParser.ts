import { EditorError } from '../../domain/EditorError.js';
import { XmlNode } from './XmlNode.js';

/**
 * 极简 XML 解析器（零依赖）：
 * 支持 XML 声明、注释、CDATA、自闭合标签、单/双引号属性、常用实体。
 * 不支持命名空间前缀与 DTD 校验——SVG 场景足够，不足时换实现即可（io 内部子模块）。
 */
export class XmlParser {
  parse(text: string): XmlNode {
    const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    const stack: XmlNode[] = [];
    let root: XmlNode | null = null;
    let position = 0;

    while (position < source.length) {
      const nextTag = source.indexOf('<', position);
      if (nextTag < 0) {
        this.appendText(stack, source.slice(position));
        break;
      }
      if (nextTag > position) {
        this.appendText(stack, source.slice(position, nextTag));
      }
      position = nextTag;

      if (source.startsWith('<?', position)) {
        position = this.skipTo(source, position, '?>');
        continue;
      }
      if (source.startsWith('<!--', position)) {
        position = this.skipTo(source, position, '-->');
        continue;
      }
      if (source.startsWith('<![CDATA[', position)) {
        const end = source.indexOf(']]>', position + 9);
        if (end < 0) {
          throw new EditorError('invalid svg: unterminated CDATA section');
        }
        const current = stack[stack.length - 1];
        if (current !== undefined) {
          current.appendText(source.slice(position + 9, end));
        }
        position = end + 3;
        continue;
      }
      if (source.startsWith('<!', position)) {
        position = this.skipTo(source, position, '>');
        continue;
      }

      if (source.startsWith('</', position)) {
        position = this.closeTag(source, position, stack);
        continue;
      }

      const end = this.findTagEnd(source, position);
      const raw = source.slice(position + 1, end);
      position = end + 1;
      const trimmed = raw.trimEnd();
      const selfClosing = trimmed.endsWith('/');
      const body = selfClosing ? trimmed.slice(0, -1) : raw;
      const node = this.parseTag(body);

      const parent = stack[stack.length - 1];
      if (parent === undefined) {
        if (root !== null) {
          throw new EditorError('invalid svg: multiple root elements');
        }
        root = node;
      } else {
        parent.appendChild(node);
      }
      if (!selfClosing) {
        stack.push(node);
      }
    }

    if (root === null) {
      throw new EditorError('invalid svg: no root element');
    }
    const unclosed = stack[stack.length - 1];
    if (unclosed !== undefined) {
      throw new EditorError(`invalid svg: unclosed element <${unclosed.name}>`);
    }
    return root;
  }

  private closeTag(source: string, position: number, stack: XmlNode[]): number {
    const end = source.indexOf('>', position + 2);
    if (end < 0) {
      throw new EditorError('invalid svg: unterminated closing tag');
    }
    const name = source.slice(position + 2, end).trim();
    const open = stack.pop();
    if (open === undefined) {
      throw new EditorError(`invalid svg: unexpected closing tag </${name}>`);
    }
    if (open.name !== name) {
      throw new EditorError(`invalid svg: mismatched closing tag </${name}>`);
    }
    return end + 1;
  }

  private appendText(stack: XmlNode[], chunk: string): void {
    const current = stack[stack.length - 1];
    if (current !== undefined) {
      current.appendText(XmlParser.decodeEntities(chunk));
    }
  }

  private findTagEnd(source: string, position: number): number {
    let quote: string | null = null;
    for (let index = position + 1; index < source.length; index += 1) {
      const character = source[index];
      if (quote !== null) {
        if (character === quote) {
          quote = null;
        }
        continue;
      }
      if (character === '"' || character === "'") {
        quote = character;
        continue;
      }
      if (character === '>') {
        return index;
      }
    }
    throw new EditorError('invalid svg: unterminated tag');
  }

  private skipTo(source: string, from: number, marker: string): number {
    const end = source.indexOf(marker, from);
    if (end < 0) {
      throw new EditorError('invalid svg: unterminated markup');
    }
    return end + marker.length;
  }

  private parseTag(body: string): XmlNode {
    let index = 0;
    while (index < body.length && XmlParser.isWhitespace(body[index])) {
      index += 1;
    }
    const nameStart = index;
    while (index < body.length && !XmlParser.isWhitespace(body[index])) {
      index += 1;
    }
    const name = body.slice(nameStart, index);
    if (name.length === 0) {
      throw new EditorError('invalid svg: empty tag name');
    }
    const node = new XmlNode(name);

    while (true) {
      while (index < body.length && XmlParser.isWhitespace(body[index])) {
        index += 1;
      }
      if (index >= body.length) {
        break;
      }
      const attributeStart = index;
      while (index < body.length && !XmlParser.isWhitespace(body[index]) && body[index] !== '=') {
        index += 1;
      }
      const attributeName = body.slice(attributeStart, index);
      while (index < body.length && XmlParser.isWhitespace(body[index])) {
        index += 1;
      }
      if (body[index] !== '=') {
        throw new EditorError(`invalid svg: malformed attribute in <${name}>`);
      }
      index += 1;
      while (index < body.length && XmlParser.isWhitespace(body[index])) {
        index += 1;
      }
      const quote = body[index];
      if (quote !== '"' && quote !== "'") {
        throw new EditorError(`invalid svg: unquoted attribute value in <${name}>`);
      }
      index += 1;
      const valueStart = index;
      while (index < body.length && body[index] !== quote) {
        index += 1;
      }
      if (index >= body.length) {
        throw new EditorError(`invalid svg: unterminated attribute value in <${name}>`);
      }
      node.addAttribute(attributeName, XmlParser.decodeEntities(body.slice(valueStart, index)));
      index += 1;
    }
    return node;
  }

  private static isWhitespace(character: string | undefined): boolean {
    return character === ' ' || character === '\t' || character === '\n' || character === '\r';
  }

  private static decodeEntities(text: string): string {
    return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
      if (entity.startsWith('#x') || entity.startsWith('#X')) {
        const code = Number.parseInt(entity.slice(2), 16);
        return Number.isNaN(code) ? match : String.fromCodePoint(code);
      }
      if (entity.startsWith('#')) {
        const code = Number.parseInt(entity.slice(1), 10);
        return Number.isNaN(code) ? match : String.fromCodePoint(code);
      }
      if (entity === 'amp') {
        return '&';
      }
      if (entity === 'lt') {
        return '<';
      }
      if (entity === 'gt') {
        return '>';
      }
      if (entity === 'quot') {
        return '"';
      }
      if (entity === 'apos') {
        return "'";
      }
      return match;
    });
  }
}
