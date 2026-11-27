import type { TreeDecorator, TreeLineContext } from '../../../src/plugin-api/TreeDecorator.js';

/**
 * `(box)` 树标签（`TreeDecorator` 扩展点实现）。
 *
 * 只依赖公开的 `Shape.typeName()`，**不 import `BoxShape`**：
 * 因此标签插件与图形插件互不感知，任何声明自己类型名为 `box` 的图形都会得到标注。
 * 该实例没有可变状态，不需要 `onDocumentEvent`。
 */
export class BoxTypeLabelDecorator implements TreeDecorator {
  readonly decoratorName = 'box-type-label';

  labelFor(context: TreeLineContext): string {
    return context.shape?.typeName() === 'box' ? '(box)' : '';
  }
}
