import type { SvgDocument } from '../domain/SvgDocument.js';

/** 文档 → SVG 文本。 */
export interface SvgEncoder {
  encode(document: SvgDocument): string;
}
