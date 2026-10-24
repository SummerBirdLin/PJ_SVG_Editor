import type { ShapeFactory } from '../domain/shape/ShapeFactory.js';
import type { SvgDocument } from '../domain/SvgDocument.js';

/** 命令执行时能拿到的东西：当前文档 + 图形工厂（构造新节点时用）。 */
export interface CommandContext {
  readonly document: SvgDocument;
  readonly shapes: ShapeFactory;
}
