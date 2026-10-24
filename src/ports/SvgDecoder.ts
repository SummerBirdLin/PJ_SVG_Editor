import type { SvgDocument } from '../domain/SvgDocument.js';

/** 解码结果：文档 + 读入过程中产生的告警（缺 id、未支持元素等，逐行输出）。 */
export interface DecodeResult {
  readonly document: SvgDocument;
  readonly warnings: readonly string[];
}

/** SVG 文本 → 文档。实现方抛 EditorError（如 `invalid svg: …`）。 */
export interface SvgDecoder {
  decode(text: string): DecodeResult;
}
