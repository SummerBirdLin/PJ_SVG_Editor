# ADR-2：复合图形 `box` 的读回策略（`data-kind`、降级与拒绝）

- **状态**：已采纳（阶段 2）
- **相关代码**：`plugins/shape-box/src/BoxProvider.ts`、`plugins/shape-box/src/BoxShape.ts`、`src/io/SvgReader.ts`、`src/domain/shape/provider/ShapeProvider.ts`、`src/commands/CreateCommand.ts`
- **相关测试**：`plugins/shape-box/test/box.test.ts`、`test/plugin/box.integration.test.ts`

## 背景

`box` 的 SVG 表示必须是**合法 SVG**（否则外部工具打不开），但 `<g>` 无法表达"这是一个复合图形"。
同时有两个必须回答的问题：

1. 读入时怎么知道某个 `<g>` 是 `box`？没装插件时怎么办？
2. 装了插件、但文件里的 `box` 结构不完整（缺 `-rect`/`-label`、类型被改、id 重复）怎么办？

## 决策

### 1) 用 `data-kind` 标注类型，读回按 `data-kind` 找回 Provider

`BoxProvider` 声明 `dataKind = 'box'`；序列化写成 `<g id="n1" data-kind="box">`。
`SvgReader` 的既有规则（阶段 1 已实现并测试）正好对上：

- 先按 SVG 标签找到 Provider（`<g>` → GroupProvider）；
- 若元素带 `data-kind` 且该名字是**已注册的类型**，就用它创建（`box`）；
- 若 `data-kind` 未知（**未装插件**），告警 `warning: unknown shape kind 'box', kept as plain g`，
  退化为普通 `<g>` —— 图形树的其余部分照常读入，`save` 也能原样写回（`data-kind` 留在 `extras` 里）。

这条路径完全在阶段 1 就写好了，本阶段只是"第一个真正用到它的插件"。

### 2) 已装插件但结构不合法 → **拒绝整个读入**

`box` 的必要子部件是 `<id>-rect`（`RectShape`）与 `<id>-label`（`TextShape`），
`BoxShape` 自己守住不变量（`append`/`insert` 只接受这两个派生 id，`remove` 拒绝移除它们）。
读入侧由 `ShapeProvider.afterChildren(shape)` 钩子在"子节点全部读入后"校验：
缺子部件、类型不对、子部件数量不是 2 → 抛 `EditorError`。

`SvgReader` 对这个钩子的错误**不再降级**（区别于"未支持元素跳过"）：异常直接上抛，
`read` 整条命令失败，**原文档保持不变**（`EditorSession.read` 只在成功时替换文档）。

选择"拒绝"而不是"警告并降级为普通分组"的理由：

| 方案 | 问题 |
|---|---|
| 警告 + 降级为 `<g>` | 需要内核知道"哪些图形可降级、降级成什么"，等于把 `box` 的知识搬回内核；而且用户以为自己在编辑 `box`，实际已变成 `g`，后续 `set n1 fill` 语义会静默改变。 |
| 跳过该元素、继续读其余部分 | 会产生"缺一块"的文档，`save` 后文件被永久截断，属于数据损失。 |
| **拒绝整个读入** | 明确失败、原文档不动、用户能立刻看到是哪一行不合法（错误信息带 box id 与期望的子部件 id）。 |

代价是"一个坏 box 拖垮整次 read"。考虑到 `box` 由本工具写出（round-trip 稳定），
坏结构只可能来自手改文件，明确报错优于静默降级。

### 3) 子部件 id 派生：`<id>-rect` / `<id>-label`

- 可预测：用户可以直接 `show n1-rect`、`tree n1`，也能用外部工具定位；
- 可校验：读回时"子部件 id 是否符合派生规则"就是结构校验的一部分；
- 与需求一致（§4 边界明确给出这两个后缀）。

派生带来的副作用：`create box n1` 会一次占用 3 个 id。因此内核提供了一条**通用**不变式
（在接入 `box` 之前的一次独立提交中完成，不在接入提交里）：
`CreateCommand` 在 `append` 之前检查**整棵新增子树的 id** 是否与文档冲突，冲突则整条命令失败、
文档零残留（`error: id already exists: <id>`）。任何复合图形插件都受益，内核不知道 `box`。

### 4) 读入时 id 重复的处理

阶段 1 的 `IdAllocator` 会对重复 id **重新分配**并告警。对 `box` 子部件来说，重新分配会破坏
派生规则，于是 `afterChildren` 校验失败 → 整个读入被拒绝（满足"重复 id 不能仅靠降级消除，必须拒绝"）。
box 之外的重复 id 仍沿用阶段 1 的"重命名 + 告警"行为，不在本阶段改动。

## 后果

- `box` 的序列化是"合法 SVG + 一个 `data-kind`"，外部工具可打开；卸载插件后仍可编辑成普通分组。
- 读回路径有明确的三态：**未装插件 → 降级为 g**；**装了且合法 → 还原为 box**；**装了但不合法 → 拒绝整个读入**。
- 插件为守住不变量而覆写 `append`/`insert`/`remove`：这些都是 `ContainerShape` 的公开方法，
  不需要内核为 `box` 开后门；代价是插件作者要理解"容器的子节点顺序 = 复合图形的插槽"。

## 验证

| 需求点 | 用例 |
|---|---|
| 序列化带 `data-kind`、不重复写几何 | `plugins/shape-box/test/box.test.ts`：`序列化带 data-kind…` |
| 未装插件时降级为 `g` 并告警 | `test/plugin/box.integration.test.ts`：`未装插件时读回降级为普通 g…` |
| 装了插件且合法 → 还原 box | 同上：`save 写出 data-kind="box"，read 读回仍是 box` |
| 缺子部件/类型错误 → 拒绝（不产生半个 box） | `plugins/shape-box/test/box.test.ts`：`afterChildren 校验必要子部件…` |
| 子部件 id 冲突 → 整条命令失败、零残留 | `test/plugin/box.integration.test.ts`：`新增子树的 id 冲突时整条命令失败…` |
| 删除/移走必要子部件被拒绝 | 同上：`不变量由插件守住…` |
