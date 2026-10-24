import type { ShapeFactory } from '../domain/shape/ShapeFactory.js';

/** 命令语法解析时的依赖：`create` 需要向工厂询问"该类型需要哪些属性"。 */
export interface CommandParseContext {
  readonly shapes: ShapeFactory;
}
