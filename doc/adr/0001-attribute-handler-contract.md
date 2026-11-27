# ADR-1：属性扩展点（`AttributeHandler`）的调用契约与事务边界

- **状态**：已采纳（阶段 2）
- **相关代码**：`src/plugin-api/AttributeHandler.ts`、`src/plugin-api/AttributeChanges.ts`、`src/plugin-api/ShapeTarget.ts`、`src/commands/SetCommand.ts`、`src/plugin-api/ContributionRegistry.ts`
- **相关测试**：`test/plugin/attributes.test.ts`

## 背景

需求给出的初始接口只有 `handles(shapeId, attr)` 与 `apply(shapeId, attr, value)`，没有回答四个必须在实现前定下来的问题：

1. 处理器怎么拿到目标图形、怎么改它的**子部件**（`box` 的 `fill` 落在内部 `rect` 上、`label` 落在内部 `text` 上）？
2. 多个处理器同时命中同一 `(图形, 属性)` 时怎么办？
3. 一次 `set` 改了多个子部件时，怎么保证 **一次 `undo` 整体恢复、一次 `redo` 整体重做**？
4. 处理器改了一半抛错时，怎么恢复文档并保住 undo/redo 历史？

## 决策

### 1) 处理器拿到的是"目标视图"，不是 id 字符串

```ts
export interface ShapeTarget {
  readonly shape: Shape;            // 公开领域对象（字段仍封装）
  readonly typeName: string;        // 便于按类型判断，不需要 instanceof 内部类
  child(id: string): Shape | null;  // 子部件按 id 定位（box 的 -rect / -label）
  children(): readonly Shape[];     // 直接子部件
}
```

处理器通过 `child()` + 图形公开方法（`setAttribute`/`attributeValue`/`textContent`）完成修改，
**不接触任何私有字段**。`ShapeTargetView` 是内核提供的标准实现，插件拿到的就是它。

### 2) 多命中：按 `priority` 降序取最高；最高优先级并列 → 拒绝

- 处理器声明 `readonly priority: number`。
- `ContributionRegistry.handlersFor()` 只返回 `handles()` 为真的处理器，按 `priority` 降序。
- `SetCommand` 取第一个；**若与它同优先级还有别的处理器，报
  `error: ambiguous attribute handler: <attr> (a, b)` 并放弃本次修改**——不静默按注册顺序覆盖，
  因为"谁生效"依赖装配顺序会让行为不可预测，也难以在配置装配里复现。

### 3) 事务：`AttributeChanges` 充当唯一的写入口

处理器只能用 `changes.setAttribute(shape, attr, value)` 改东西（或 `changes.record()` 登记后自己改）：

```ts
setAttribute(shape, attribute, value) {
  const before = shape.attributeValue(attribute);   // 先取旧值
  shape.setAttribute(attribute, value);            // 写失败就不登记（回滚不会撤销没发生过的修改）
  this.recorded.push({ shape, attribute, before });
}
```

- 执行成功：`AttributeChanges` 整份就是 undo 的逆操作，`SetCommand` 把它存为命令的局部状态；
  `undo()` 调 `changes.revert()`（逆序回放），`redo()` 就是再 `execute()`。
- 执行失败：`SetCommand` 在 `catch` 里 `changes.revertQuietly()`（逐条尽力回滚，不掩盖原始错误），
  然后**原样抛出**——因此 `EditorSession.execute()` 不会走到 `history.record()`，
  undo/redo 历史与命令执行前完全一致（不存在"文档改了但历史没记"或"记了但文档没改"）。

### 4) 处理器失败后**不再**转入缺省属性路径

处理器已经命中并开始修改，再退回白名单处理会掩盖错误、甚至二次修改。

## 后果

- **好处**：`set` 里没有任何针对 `box`/`fill`/`label` 的分支；新增属性语义只加一个处理器插件；
  undo 粒度天然是"一次 set"，与图形有几个子部件无关。
- **代价**：处理器必须自律（所有修改都走 `changes`）；如果绕过 `changes` 直接改图形，
  undo 就无法恢复——这一点在扩展点清单里作为"违反契约"写明，并有契约测试兜底
  （`test/plugin/attributes.test.ts` 的回滚用例）。
- **未采纳的替代方案**：
  - *返回"新值"让内核统一写*：无法表达"改内部子部件"（`box` 需要改两个不同对象）。
  - *整文档快照*：违背阶段 1 "不做全量快照"的既定取舍，且 undo 单元会变成整个文档。
  - *按注册顺序执行所有命中处理器*：组合语义不清晰（同一属性被改两次），无法测"最终值"。

## 验证

| 需求点 | 用例（`test/plugin/attributes.test.ts`） |
|---|---|
| 无处理器命中 → 阶段 1 白名单行为不变 | `set：无处理器命中 → 阶段 1 白名单路径逐字不变` |
| 一次 set 改两个子部件、一次 undo 整体恢复 | `set：处理器命中 → 一次 set 改两个子部件…` |
| 多命中按优先级取最高 | `set：多个处理器命中同一属性 → 按优先级取最高…` |
| 同优先级并列 → 拒绝 | `set：最高优先级并列 → 拒绝并报 ambiguous attribute handler…` |
| 部分修改后抛错 → 文档与历史都不变 | `set：处理器改了子部件后抛错 → 文档整体回滚…` |
| 未知属性仍按约定报错 | `set：… 普通矩形的 label 报未知属性` |
