import type { AttributeChanges } from './AttributeChanges.js';
import type { ShapeTarget } from './ShapeTarget.js';

/**
 * 扩展点 4/4：**属性在某类图形上的领域语义**。
 *
 * 内核在 `SetCommand.execute` 里先问"有没有处理器负责 `(图形, 属性)`"，
 * 有人负责就交给它改，没人负责才走阶段 1 的属性白名单。
 * 因此 `box` 的 `label` 不需要进内核白名单，`set` 里也不需要 `if (type === 'box')`。
 */
export interface AttributeHandler {
  /** 稳定的注册名（配置装配的清单校验按这个名字比对）。 */
  readonly handlerName: string;

  /** 越大越优先；同优先级多命中 = 冲突（见 ADR-1）。 */
  readonly priority: number;

  /** 是否负责"该图形 + 该属性"；**不得修改文档状态**。 */
  handles(target: ShapeTarget, attribute: string): boolean;

  /** 执行修改：必须通过 `changes` 改，才能参与回滚与 undo。 */
  apply(target: ShapeTarget, attribute: string, value: string, changes: AttributeChanges): void;
}

/** 内核按 `(图形, 属性)` 查询处理器（按优先级降序返回）。 */
export interface AttributeHandlerLookup {
  handlersFor(target: ShapeTarget, attribute: string): readonly AttributeHandler[];
}

/** 一个不负责任何属性的处理器（装配缺省值用）。 */
export const NO_ATTRIBUTE_HANDLERS: AttributeHandlerLookup = {
  handlersFor: (): readonly AttributeHandler[] => [],
};
