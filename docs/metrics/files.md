# 文件清单与职责（CLI 范围）

本文件是**人工维护**的说明部分：逐文件一句话职责 + 所属类别（内核 / 装配处 / 插件），类别口径与
[`report.md`](./report.md) 第 2 节、[`README.md`](./README.md) 完全一致（同一套前缀规则）：

- **内核** = `src/domain/`、`src/commands/`、`src/ports/`、`src/io/`、`src/app/`、`src/cli/`、`src/plugin-api/`
- **装配处** = `src/host/`、`src/main.ts`、`plugins.config.json`
- **插件** = `src/builtin/`、`plugins/`

> 数字（行数、CC）不在本文件里手写：一律看脚本生成的 [`report.md`](./report.md) / [`report.json`](./report.json)。
> 本文件只负责「这个文件是干什么的、归哪一类」。
>
> 覆盖范围：阶段 1 定稿（tag `final`，提交 `5e7e7cb`）的 `src/` 全部 74 个 TS 文件。

## src/main.ts（装配处）

| 路径 | 职责 | 类别 |
|---|---|---|
| `src/main.ts` | 组合根：唯一允许 import 全部模块的地方，按运行模式（TTY / 管道）接上 REPL | 装配处 |

## src/app/

| 路径 | 职责 | 类别 |
|---|---|---|
| `src/app/EditorSession.ts` | 应用层门面：CLI 只与它交互（init/read/save/canvas/execute/undo/redo） | 内核 |

## src/cli/

| 路径 | 职责 | 类别 |
|---|---|---|
| `src/cli/ActionContext.ts` | 命令条目解析参数时可拿到的上下文（`help` 需要注册表本身） | 内核 |
| `src/cli/ActionEntry.ts` | 会话级动作 → 注册表条目的适配器，动作类自己负责参数解析 | 内核 |
| `src/cli/ActionStatic.ts` | 会话级动作类的静态侧协议（init/read/save/…） | 内核 |
| `src/cli/CommandEntry.ts` | 注册表里的一条：名字 + 用法 + 摘要 + 语法解析入口 | 内核 |
| `src/cli/CommandRegistry.ts` | 命令注册表与按名分派（需求允许的两处「按名分派」之一，已标注待重构） | 内核 |
| `src/cli/DisplayWidth.ts` | 终端显示宽度：CJK / 全角占 2 列，供 tree 对齐 | 内核 |
| `src/cli/EditCommandClass.ts` | 编辑命令类的静态侧协议（create/move/…），供注册表统一构造 | 内核 |
| `src/cli/EditCommandEntry.ts` | 编辑命令 → 注册表条目的适配器（命令层不依赖 CLI 上下文） | 内核 |
| `src/cli/Repl.ts` | REPL 主循环：行 → 分词 → 注册表 → 打印，统一 `error: ` 前缀 | 内核 |
| `src/cli/ReplOptions.ts` | REPL 可选外观（banner / prompt），管道回放时置空 | 内核 |
| `src/cli/Runnable.ts` | 所有命令条目的统一产物：可执行、产出若干输出行 | 内核 |
| `src/cli/TextOutput.ts` | 输出端口：REPL 只写文本，不关心 stdout / 缓冲 / 测试替身 | 内核 |
| `src/cli/Tokenizer.ts` | 引号感知的分词（引号本身被移除，颜色值 `#4a90d9` 不当注释） | 内核 |

### src/cli/action/

| 路径 | 职责 | 类别 |
|---|---|---|
| `src/cli/action/CanvasAction.ts` | `canvas [w] [h]`：显示或修改画布尺寸（IO 命令，置 undo 闸门） | 内核 |
| `src/cli/action/EditAction.ts` | 把一条编辑命令适配成注册表可执行的动作 | 内核 |
| `src/cli/action/HelpAction.ts` | `help`：显示全部命令与语法（命令表来自注册表） | 内核 |
| `src/cli/action/InitAction.ts` | `init [w] [h]`：新建空画布（默认 800×600） | 内核 |
| `src/cli/action/ReadAction.ts` | `read <file.svg>`：读入 SVG 作为当前文档，告警先于结果行输出 | 内核 |
| `src/cli/action/RedoAction.ts` | `redo`：重做 | 内核 |
| `src/cli/action/SaveAction.ts` | `save [file.svg]`：保存当前文档，无参时存回读入路径 | 内核 |
| `src/cli/action/ShowAction.ts` | `show <id>`：单个图形的属性明细 | 内核 |
| `src/cli/action/TreeAction.ts` | `tree [id]`：结构树（默认全文档） | 内核 |
| `src/cli/action/UndoAction.ts` | `undo`：撤销上一次编辑命令（IO 命令之后被闸门拒绝） | 内核 |

### src/cli/presenter/

| 路径 | 职责 | 类别 |
|---|---|---|
| `src/cli/presenter/HelpPresenter.ts` | `help` 的格式化（Strategy），新命令自动出现在 help 里 | 内核 |
| `src/cli/presenter/ShowPresenter.ts` | `show <id>` 的格式化：首行 label + parent，随后缩进明细 | 内核 |
| `src/cli/presenter/TreePresenter.ts` | `tree` 的格式化：只读模型、兄弟节点成组对齐 | 内核 |

## src/commands/

| 路径 | 职责 | 类别 |
|---|---|---|
| `src/commands/AddToCommand.ts` | `addto <gid> <id>`：把已有图形移入容器（含祖先检查） | 内核 |
| `src/commands/BackCommand.ts` | `back <id>`：把图形调到同级最后 | 内核 |
| `src/commands/Command.ts` | 编辑命令基类：execute / undo，redo = 再次 execute | 内核 |
| `src/commands/CommandContext.ts` | 命令执行上下文：当前文档 + 图形工厂 | 内核 |
| `src/commands/CommandParseContext.ts` | 命令语法解析依赖（`create` 需向工厂询问该类型的属性表） | 内核 |
| `src/commands/CreateCommand.ts` | `create <type> <id> [params…] [in <containerId>]` | 内核 |
| `src/commands/DeleteCommand.ts` | `delete <id>`：容器连同子孙一起删除（一个 undo 单元） | 内核 |
| `src/commands/FrontCommand.ts` | `front <id>`：把图形调到同级最前 | 内核 |
| `src/commands/GroupCommand.ts` | `group <newGid> <id1> <id2>…`：新建容器并收编已有图形 | 内核 |
| `src/commands/History.ts` | undo / redo 双栈（两阶段提交，执行成功后才真正出栈） | 内核 |
| `src/commands/MoveCommand.ts` | `move <id> <dx> <dy>`：增量平移 | 内核 |
| `src/commands/ScaleCommand.ts` | `scale <id> <factor>`：等比缩放，undo 用旧几何精确还原 | 内核 |
| `src/commands/SetCommand.ts` | `set <id> <attr> <value>`：设置属性（白名单由图形类型决定） | 内核 |
| `src/commands/UngroupCommand.ts` | `ungroup <gid>`：解散容器，子图形原位提升 | 内核 |

## src/domain/

| 路径 | 职责 | 类别 |
|---|---|---|
| `src/domain/EditorError.ts` | 统一的可预期错误类型（只承载给用户看的单行消息） | 内核 |
| `src/domain/NumberFormat.ts` | 数字解析与文本化（CLI、SVG 输出、tree/show 共用的唯一入口） | 内核 |
| `src/domain/SvgDocument.ts` | 当前文档：画布 + 图形树，id → 节点的定位收敛在 `locate()` | 内核 |

### src/domain/shape/

| 路径 | 职责 | 类别 |
|---|---|---|
| `src/domain/shape/CanvasShape.ts` | 画布（`<svg>` 根）：是可容器但不是可编辑图形，尺寸只能 `resize()` | 内核 |
| `src/domain/shape/CircleShape.ts` | 圆 `<circle>`：圆心 (cx, cy) + 半径 r | 内核 |
| `src/domain/shape/ContainerShape.ts` | 容器基类（Composite 的 Composite）：move/scale 递归到子孙 | 内核 |
| `src/domain/shape/CreationAttribute.ts` | 创建图形所需的属性项（名字 + 是否必填，顺序即位置参数顺序） | 内核 |
| `src/domain/shape/EllipseShape.ts` | 椭圆 `<ellipse>`：圆心 + 两个半径 | 内核 |
| `src/domain/shape/GShape.ts` | 分组容器 `<g>`（阶段 2 的 `box` 复合图形复用本类作落点） | 内核 |
| `src/domain/shape/LineShape.ts` | 直线 `<line>`：两个端点 | 内核 |
| `src/domain/shape/RectShape.ts` | 矩形 `<rect>`：位置 + 尺寸 | 内核 |
| `src/domain/shape/Shape.ts` | 图形抽象基类（Composite 的 Component）：几何语义 + 属性读写 + 文本表示 | 内核 |
| `src/domain/shape/ShapeFactory.ts` | 图形工厂：按类型名 / SVG 标签分派（需求允许的两处按名分派之一） | 内核 |
| `src/domain/shape/ShapeInit.ts` | 交给 Provider 的创建输入：SVG 属性字符串 + 可能的子文本 | 内核 |
| `src/domain/shape/TextShape.ts` | 文字 `<text>`：锚点 + 文本内容（内容走子文本通道） | 内核 |

### src/domain/shape/provider/

| 路径 | 职责 | 类别 |
|---|---|---|
| `src/domain/shape/provider/CircleProvider.ts` | `circle` 类型的描述者：cx cy r [fill] | 内核 |
| `src/domain/shape/provider/EllipseProvider.ts` | `ellipse` 类型的描述者：cx cy rx ry [fill] | 内核 |
| `src/domain/shape/provider/GroupProvider.ts` | `g` 类型：空容器，之后用 in / addto / group 填充 | 内核 |
| `src/domain/shape/provider/LineProvider.ts` | `line` 类型的描述者：x1 y1 x2 y2 [stroke] | 内核 |
| `src/domain/shape/provider/RectProvider.ts` | `rect` 类型的描述者：x y width height [fill] | 内核 |
| `src/domain/shape/provider/ShapeProvider.ts` | 图形类型描述者接口（阶段 2 的 ShapeProvider 插件插槽） | 内核 |
| `src/domain/shape/provider/TextProvider.ts` | `text` 类型的描述者：x y "content" | 内核 |

## src/io/

| 路径 | 职责 | 类别 |
|---|---|---|
| `src/io/IdAllocator.ts` | 读入 SVG 时为「缺 id / 重复 id」分配新 id 的策略 | 内核 |
| `src/io/NodeFileStore.ts` | `FileStore` 的 Node 实现，把系统错误翻译成需求规定的文案 | 内核 |
| `src/io/SvgReader.ts` | SVG → 文档（容错：补 id、跳过未支持元素并告警） | 内核 |
| `src/io/SvgWriter.ts` | 文档 → SVG 文本（缩进、属性顺序、自闭合标签等格式约定） | 内核 |

### src/io/xml/

| 路径 | 职责 | 类别 |
|---|---|---|
| `src/io/xml/XmlNode.ts` | 极简 XML 元素节点（仅服务 SVG 读写，不追求通用 XML 库） | 内核 |
| `src/io/xml/XmlParser.ts` | 零依赖极简 XML 解析器（声明 / 注释 / CDATA / 自闭合 / 实体） | 内核 |
| `src/io/xml/XmlWriter.ts` | XML 输出小工具：标签 / 属性 / 文本的转义与拼装 | 内核 |

## src/ports/

| 路径 | 职责 | 类别 |
|---|---|---|
| `src/ports/FileStore.ts` | 文本文件的抽象边界（实现方须把底层错误转成 `EditorError`） | 内核 |
| `src/ports/SvgDecoder.ts` | `SVG 文本 → 文档 + 告警` 的端口接口 | 内核 |
| `src/ports/SvgEncoder.ts` | `文档 → SVG 文本` 的端口接口 | 内核 |

## 阶段 2 新增（按目录说明职责）

阶段 2 的新增文件**逐文件的行数/CC 由脚本生成**，不再在本文件里手工维护一份会过期的清单
（手工抄数字正是需求禁止的做法）。逐文件明细见 [report.md](./report.md) 第 6 节
（`6.1 内核` / `6.2 装配处与插件` / `6.3 VSCode 扩展`，含"新增/变更/保留"状态）。

这里只保留**职责**说明（人写，属于设计信息）：

| 路径 | 职责 | 类别 |
|---|---|---|
| `src/plugin-api/EditHost.ts`、`CommandContribution.ts` | 命令扩展点：命令只拿到"文档 + 提交编辑 + 属性处理器"三样东西 | 内核（扩展点层） |
| `src/plugin-api/TreeDecorator.ts`、`ShapeTarget.ts`、`AttributeHandler.ts` | 树标签 / 属性语义扩展点（含目标视图与处理器接口） | 内核（扩展点层） |
| `src/plugin-api/AttributeChanges.ts` | 属性写入事务记录：一次 `set` 的 undo 单元 | 内核（扩展点层） |
| `src/plugin-api/ContributionRegistry.ts`、`ContributionDeclarations.ts`、`PluginContext.ts`、`PluginErrors.ts` | 暂存区 + 注册表：跨插件查重、清单比对、回滚 | 内核（扩展点层） |
| `src/plugin-api/DocumentEvent.ts`、`ShapeSnapshot.ts` | 文档事件总线（replaced/saved/changed）与内容快照（dirty 判定素材） | 内核（扩展点层） |
| `src/domain/shape/provider/ShapeProviderLookup.ts` | 类型/标签 → Provider 的查表接口（`ShapeFactory` 不再硬编码类型表） | 内核 |
| `src/host/Application.ts`、`CliMain.ts`、`SessionActions.ts` | 组合根、CLI 入口、会话动作（9 条非扩展点命令） | 装配处 |
| `src/host/PluginAssembly.ts`、`CodeAssembly.ts`、`ConfigAssembly.ts`、`CodePlugins.ts` | 两条装配路径；代码装配的唯一改动点就是 `CodePlugins.ts` | 装配处 |
| `src/host/PluginModuleResolver.ts`、`PluginActivation.ts`、`PluginConfig.ts` | 插件解析/实例化、激活与回滚、配置文件解析（四条失败路径） | 装配处 |
| `src/host/CommandSetup.ts` | 命令表装配顺序（文档动作 → 插件命令 → 显示动作） | 装配处 |
| `src/builtin/BuiltinShapes.ts`、`BuiltinEditCommands.ts`、`index.ts` | 内置 7 个图形与 10 个编辑命令以插件形式注册（与第三方插件同权） | 插件 |
| `src/cli/PluginCommandEntry.ts`、`src/commands/EditCommandContribution.ts` | 贡献项 → CLI 条目 / 编辑命令的适配器 | 内核 |
| `plugins/stats/**` | `stats` 命令插件（计数口径见 `StatsCounter`） | 插件 |
| `plugins/dir/**` | `dir` 命令插件：`DirectoryReader` 端口 + `NodeDirectoryReader` 适配器 | 插件 |
| `plugins/shape-box/**` | `box` 复合图形：`BoxShape`/`BoxProvider`/`BoxAttributesHandler`/`BoxTypeLabelDecorator` | 插件 |
| `plugins/shape-diamond/**` | `diamond` 基本图形（可选拓展）：只含一个 `ShapeProvider` | 插件 |
| `plugins/tree-star/**` | `modified-star` 树标签（内容 vs 保存点） | 插件 |
| `plugins.config.json` | 插件装配配置（JSON，非 `*.ts`，不计行数/CC） | 装配处 |
| `vscode-extension/**` | VSCode 扩展（单独一节，不计入 CLI 增量） | 不在 CLI 三类内 |
| `tools/verify-phase2.mjs`、`tools/metrics/report.mjs` | 验收脚本与指标脚本（不计入产品代码指标） | 工具 |
