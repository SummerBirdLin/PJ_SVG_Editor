import type { Shape } from '../domain/shape/Shape.js';
import type { SvgDocument } from '../domain/SvgDocument.js';
import type { DocumentEvent } from './DocumentEvent.js';

/** 一行树对应上下文；`shape === null` 表示根 `svg` 那一行。 */
export interface TreeLineContext {
  readonly shape: Shape | null;

  readonly document: SvgDocument;
}

/**
 * 扩展点 3/4：**结构树每行行尾的标签**。
 *
 * 渲染器只负责"把每个标签用空格拼到行尾"，不认识任何具体标签；
 * 标签自己维护的状态必须放在实例字段里（不得用模块级变量），
 * 这样同一次进程里切换文档、多个标签并存都不会互相串味。
 */
export interface TreeDecorator {
  /** 稳定的注册名（配置装配的清单校验按这个名字比对）。 */
  readonly decoratorName: string;

  /** 行尾标签；返回空串表示这一行不加。 */
  labelFor(context: TreeLineContext): string;

  /** 可选：接收文档事件以维护自身状态。 */
  onDocumentEvent?(event: DocumentEvent): void;
}

/** 内核向渲染器提供装饰器列表的方式（注册顺序 = 拼接顺序，见 ADR-4）。 */
export interface TreeDecoratorProvider {
  treeDecorators(): readonly TreeDecorator[];
}
