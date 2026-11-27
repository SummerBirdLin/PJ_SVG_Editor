# ADR-3：`modified-star` 的 dirty 语义、祖先传播与标签拼接顺序

- **状态**：已采纳（阶段 2）
- **相关代码**：`plugins/tree-star/src/ModifiedStarDecorator.ts`、`src/plugin-api/ShapeSnapshot.ts`、`src/cli/presenter/TreePresenter.ts`
- **相关测试**：`plugins/tree-star/test/modified-star.test.ts`、`test/plugin/labels.integration.test.ts`

## 背景

需求要求 `modified-star` 为"未保存变化"追加 `*`，并留了三处取舍：

1. dirty 判定按"内容与上次保存不一致"（`undo` 回到保存点后 `*` 消失），还是按"发生过编辑命令"（`undo` 不消失）？
2. 子图形修改时，祖先容器行是否也标 `*`？
3. 同一行多个标签的拼接顺序？

## 决策

### 1) 语义：按**内容**与保存点比较（`undo` 回到保存点后 `*` 消失）

`modified-star` 保存一份**保存点快照**（`id → 内容签名`，签名见 `ShapeSnapshot`：
类型、标签、全部属性、文本、父节点 id、兄弟序号），并订阅文档事件：

| 事件 | 动作 |
|---|---|
| `replaced`（`init`/`read` 建立文档） | 把当前快照记为保存点（刚打开的文件没有未保存变化） |
| `saved` | 同上（保存成功即新保存点） |
| `changed`（`execute`/`undo`/`redo`/`canvas`） | 只把"当前快照缓存"作废，等渲染时重算 |

判定规则：某行 dirty ⇔ 该 id 的内容签名与保存点不同；**保存点里不存在的 id 视为 dirty**
（因此新建节点立即可见 `*`）。

选择"内容比较"而不是"编辑过与否"的布尔标记：

- 与用户对"未保存修改"的直觉一致，且 `undo`/`redo` 不需要额外记账（事件里带的是文档本身）；
- 一个布尔标记无法回答"哪一行脏"，只能整棵树一起亮，信息量低；
- 事件的语义保持极窄（只带 `kind + document`），内核不需要知道标签怎么记账。

代价：每次渲染要算一次快照（O(n)），文档很大时会慢；本阶段文档规模小，
且 `changed` 之后才失效缓存，连续 `tree` 只算一次。

### 2) 祖先传播：**不向祖先传播**（根行汇总整个文档）

- 普通行只看**自己**的签名：容器行不因子孙变化而标 `*`；
- 根行（`svg`）代表整个文档：画布尺寸变化，或任一图形签名不同 → 标 `*`。

理由：需求 §5 的示例正是这种形态——`rect#n1-rect … *` 而它的祖先 `g#n1`、`g#flowchart` 无星，
只有根行 `svg (800x600) *` 汇总。另外"容器自己的内容有没有变"和"里面某个孩子有没有变"
是两件事，前者不传播更贴近"这一行的内容是否未保存"。

### 3) 拼接顺序：**注册顺序**，用单个空格连接

`TreePresenter` 按注册顺序遍历装饰器，把非空标签用空格拼到行尾；
没有装饰器时**不追加任何字符**（因此阶段 1 的 `tree` 输出逐字节不变，无尾随空格）。
当前装配顺序是 `box-type-label` 在 `modified-star` 之前，因此 box 行形如：

```text
├── box#n1 (box)
│   └── rect#n1-rect   x=120 y=100 w=160 h=60 fill=#f5a623 *
```

注册顺序即装配顺序：代码装配由 `host/CodePlugins` 的数组顺序决定，配置装配由
`plugins.config.json` 的数组顺序决定——两者一致才能保证双装配输出逐字节相同（有专门用例）。

## 后果

- 两个标签插件互不感知：`box-type-label` 只看 `typeName()`，`modified-star` 只看快照差异；
  内核与渲染器都不需要为新增标签改动（"新增任一标签时内核与渲染器差异为 0"）。
- `*` 是"内容级"的：手工改文件后 `read` 就不会带星（`replaced` 重置保存点）。
- 若将来要"祖先汇总"，只需在 `ModifiedStarDecorator` 内部把判定改成"子树内任一行 dirty"，
  内核与渲染器仍不动——这正是把状态放在装饰器实例里的收益。

## 验证

| 需求点 | 用例 |
|---|---|
| 状态机：编辑 → 保存 → 再编辑 → undo 回到保存点 | `plugins/tree-star/test/modified-star.test.ts`：`modified-star 状态机…` |
| 新建节点立即标记 | 同上：`新建节点立即带星…` |
| 祖先不传播、根行汇总 | 同上：`编辑后只有被改的行与根行带星…` |
| 状态封装在实例字段（无模块级变量） | 同上：`两个实例互不影响…` |
| 两个标签并存、顺序稳定 | `test/plugin/labels.integration.test.ts`：`(box) 与 modified-star 并存…` |
| 没有标签时树输出逐字节不变 | 同上：`树基线…`、`test/plugin/decorators.test.ts` |
