import { OutlineElement } from './OutlineElement';

/**
 * 面向"大纲"的容错 SVG 扫描器。
 *
 * 与 Phase 1 `src/io/xml/XmlParser.ts` 的分工差异（见 `doc/README.md` §5.4）：
 * - **记录源码偏移**：每个元素保存"起始标签"与"整个元素"两段字符偏移，
 *   大纲的 `range`/`selectionRange`（点击定位）完全靠它；XmlNode 只有名字/属性/子节点，没有位置。
 * - **容错优先**：编辑到一半时（未闭合、标签不匹配、注释没写完）直接返回空大纲，
 *   而不是抛错——VSCode 在每个编辑动作后都会调用 Provider，抛错会污染整个 Outline 视图。
 * - **只保留展示需要的东西**：名字、`id`、子元素；几何/样式属性一律不解析（大纲不关心）。
 *
 * 返回 `[]` 的语义是"当前文本给不出可信的大纲"，与"文件是空的"对调用方无差别。
 */
export class OutlineParser {
  /** 防御性上限：与 Phase 1 XmlParser 同口径（256 层），超深嵌套直接放弃而不是把扩展拖死。 */
  private static readonly MAX_DEPTH = 256;

  parse(text: string): readonly OutlineElement[] {
    const roots: OutlineElement[] = [];
    const stack: OutlineElement[] = [];
    let position = 0;

    while (position < text.length) {
      const nextTag = text.indexOf('<', position);
      if (nextTag < 0) {
        break; // 尾部纯文本（SVG 无意义）直接忽略
      }
      position = nextTag;

      const skipped = this.skipMarkup(text, position);
      if (skipped !== null) {
        if (skipped < 0) {
          return []; // 注释/CDATA/指令未闭合：正在编辑
        }
        position = skipped;
        continue;
      }

      if (text.startsWith('</', position)) {
        position = this.closeTag(text, position, stack);
        if (position < 0) {
          return [];
        }
        continue;
      }

      position = this.openTag(text, position, stack, roots);
      if (position < 0) {
        return [];
      }
      if (stack.length > OutlineParser.MAX_DEPTH) {
        return [];
      }
    }

    if (stack.length > 0) {
      return []; // 还有未闭合的元素：不在半截树上给定位
    }
    return roots;
  }

  /**
   * 跳过不产生大纲节点的标记段。
   * 返回 null = 当前位置不是这类标记；返回 -1 = 标记未闭合（调用方按"不完整"处理）；
   * 返回正数 = 跳过之后的偏移。
   */
  private skipMarkup(text: string, position: number): number | null {
    if (text.startsWith('<!--', position)) {
      const end = text.indexOf('-->', position + 4);
      return end < 0 ? -1 : end + 3;
    }
    if (text.startsWith('<![CDATA[', position)) {
      const end = text.indexOf(']]>', position + 9);
      return end < 0 ? -1 : end + 3;
    }
    if (text.startsWith('<?', position)) {
      const end = text.indexOf('?>', position + 2);
      return end < 0 ? -1 : end + 2;
    }
    if (text.startsWith('<!', position)) {
      const end = this.findTagEnd(text, position);
      return end < 0 ? -1 : end + 1;
    }
    return null;
  }

  /** 处理起始标签；返回下一个扫描位置，-1 表示文本已不可信。 */
  private openTag(
    text: string,
    position: number,
    stack: OutlineElement[],
    roots: OutlineElement[],
  ): number {
    const tagEnd = this.findTagEnd(text, position);
    if (tagEnd < 0) {
      return -1;
    }
    const tag = this.readStartTag(text, position, tagEnd);
    if (tag === null) {
      return -1;
    }
    const element = new OutlineElement(tag.name, tag.id, position, tagEnd + 1);
    const parent = stack[stack.length - 1];
    if (parent === undefined) {
      roots.push(element);
    } else {
      parent.appendChild(element);
    }
    if (!tag.selfClosing) {
      stack.push(element);
    }
    return tagEnd + 1;
  }

  /** 处理结束标签；返回下一个扫描位置，-1 表示文本已不可信。 */
  private closeTag(text: string, position: number, stack: OutlineElement[]): number {
    const tagEnd = this.findTagEnd(text, position);
    if (tagEnd < 0) {
      return -1;
    }
    const name = text.slice(position + 2, tagEnd).trim();
    const open = stack.pop();
    if (open === undefined || open.name() !== name) {
      return -1; // 多余的结束标签或标签不匹配
    }
    open.closeAt(tagEnd + 1);
    return tagEnd + 1;
  }

  /** 找到起始标签的 `>`（引号内的 `>` 不算）；-1 = 标签未闭合。 */
  private findTagEnd(text: string, position: number): number {
    let quote: string | null = null;
    for (let index = position + 1; index < text.length; index += 1) {
      const character = text[index];
      if (character === undefined) {
        break;
      }
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
    return -1;
  }

  /**
   * 读取起始标签的标签名与 `id`。
   * 属性解析只服务"取 id"，其余属性（含无引号的脏写法）宽松跳过——
   * 大纲要的是"尽量画出来"，不是 XML 校验。
   */
  private readStartTag(
    text: string,
    position: number,
    tagEnd: number,
  ): { name: string; id: string | null; selfClosing: boolean } | null {
    let index = position + 1;
    const body = text.slice(index, tagEnd);
    const selfClosing = body.trimEnd().endsWith('/');

    while (index < tagEnd && OutlineParser.isWhitespace(text[index])) {
      index += 1;
    }
    const nameStart = index;
    while (index < tagEnd && !OutlineParser.isWhitespace(text[index]) && text[index] !== '/') {
      index += 1;
    }
    const name = text.slice(nameStart, index);
    if (name.length === 0) {
      return null; // `<` 后面不是标签名：多半是 `<` 文本或半截输入
    }

    let id: string | null = null;
    while (index < tagEnd) {
      while (index < tagEnd && OutlineParser.isWhitespace(text[index])) {
        index += 1;
      }
      if (index >= tagEnd) {
        break;
      }
      if (text[index] === '/') {
        index += 1;
        continue;
      }
      const attributeStart = index;
      while (
        index < tagEnd &&
        !OutlineParser.isWhitespace(text[index]) &&
        text[index] !== '=' &&
        text[index] !== '/'
      ) {
        index += 1;
      }
      const attributeName = text.slice(attributeStart, index);
      while (index < tagEnd && OutlineParser.isWhitespace(text[index])) {
        index += 1;
      }
      if (text[index] !== '=') {
        continue; // 无值属性：跳过，不影响大纲
      }
      index += 1;
      while (index < tagEnd && OutlineParser.isWhitespace(text[index])) {
        index += 1;
      }
      const quote = text[index];
      if (quote !== '"' && quote !== "'") {
        // 引号还没打出来（`id=` 后紧跟结尾）：跳过本属性，不让整个大纲失败
        continue;
      }
      index += 1;
      const valueStart = index;
      while (index < tagEnd && text[index] !== quote) {
        index += 1;
      }
      if (index >= tagEnd) {
        return null; // 引号未闭合：标签结构已被破坏
      }
      if (attributeName === 'id') {
        const value = text.slice(valueStart, index).trim();
        id = value.length === 0 ? null : value;
      }
      index += 1;
    }
    return { name, id, selfClosing };
  }

  private static isWhitespace(character: string | undefined): boolean {
    return character === ' ' || character === '\t' || character === '\n' || character === '\r';
  }
}
