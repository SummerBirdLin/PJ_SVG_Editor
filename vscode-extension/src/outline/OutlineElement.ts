/** 大纲里的一个元素节点：只保留"展示 + 定位"需要的领域事实，以及**源码偏移量**。 */
export class OutlineElement {
  private readonly elementName: string;
  private readonly elementId: string | null;

  /** 起始标签 `<` 的位置。 */
  private readonly startOffset: number;

  /** 起始标签 `>` 之后的位置（selectionRange 的右端）。 */
  private readonly tagEndOffset: number;

  /** 整个元素结束的位置：自闭合 = 起始标签结束；否则 = 结束标签 `>` 之后。 */
  private endOffset: number;

  private readonly childElements: OutlineElement[] = [];

  constructor(name: string, id: string | null, startOffset: number, tagEndOffset: number) {
    this.elementName = name;
    this.elementId = id;
    this.startOffset = startOffset;
    this.tagEndOffset = tagEndOffset;
    this.endOffset = tagEndOffset;
  }

  name(): string {
    return this.elementName;
  }

  id(): string | null {
    return this.elementId;
  }

  /**
   * 节点的显示文本：有 id 时为 `标签名#id`，无 id 时只有标签名。
   * 与 Phase 1 `Shape.label()` 的格式一致（`rect#r1`），但这里**不会**为无 id 元素补 id。
   */
  label(): string {
    return this.elementId === null ? this.elementName : `${this.elementName}#${this.elementId}`;
  }

  start(): number {
    return this.startOffset;
  }

  tagEnd(): number {
    return this.tagEndOffset;
  }

  end(): number {
    return this.endOffset;
  }

  /** 由解析器在读到结束标签时调用。 */
  closeAt(endOffset: number): void {
    this.endOffset = Math.max(this.endOffset, endOffset);
  }

  appendChild(child: OutlineElement): void {
    this.childElements.push(child);
  }

  children(): readonly OutlineElement[] {
    return this.childElements;
  }

  isContainer(): boolean {
    return this.childElements.length > 0;
  }
}
