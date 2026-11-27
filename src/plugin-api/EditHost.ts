import type { SvgDocument } from '../domain/SvgDocument.js';
import type { ShapeFactory } from '../domain/shape/ShapeFactory.js';
import type { AttributeHandlerLookup } from './AttributeHandler.js';

/**
 * 一条可撤销编辑在执行/撤销时能拿到的**宿主能力**。
 *
 * 这是内核与"命令"之间的契约：commands 层的 `Command` 结构性实现本接口，
 * 因此插件命令也能提交内核维护的 undo 单元，而不需要认识 `History` 的内部实现。
 */
export interface EditHost {
  readonly document: SvgDocument;

  readonly shapes: ShapeFactory;

  readonly attributeHandlers: AttributeHandlerLookup;
}

/** 可撤销的编辑：`execute` 做、`undo` 精确回退（redo = 再 execute，与阶段 1 一致）。 */
export interface UndoableEdit {
  execute(host: EditHost): string;

  undo(host: EditHost): string;
}
