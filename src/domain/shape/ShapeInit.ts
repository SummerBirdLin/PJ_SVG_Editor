/** 创建图形时交给 Provider 的输入：SVG 属性（字符串）+ 可能的子文本内容。 */
export interface ShapeInit {
  readonly attributes: ReadonlyMap<string, string>;
  readonly textContent: string | null;
}
