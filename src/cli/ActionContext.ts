import type { ShapeFactory } from '../domain/shape/ShapeFactory.js';
import type { TreeDecorator } from '../plugin-api/TreeDecorator.js';
import type { CommandRegistry } from './CommandRegistry.js';

/**
 * 命令条目在解析参数时能拿到的上下文：
 * - `help` 需要注册表本身来生成命令表；
 * - `tree` 需要装饰器列表（标签由插件提供，渲染器只负责拼接）。
 */
export interface ActionContext {
  readonly shapes: ShapeFactory;

  readonly registry: CommandRegistry;

  readonly decorators: readonly TreeDecorator[];
}
