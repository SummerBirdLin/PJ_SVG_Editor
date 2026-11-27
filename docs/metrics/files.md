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

## 阶段 2 新增的源码文件清单与职责（61 个 `.ts`）

清单来自 `git diff --name-only --diff-filter=A final HEAD`；**职责列取自各文件头部的注释首句**（少数文件在此做了人工改写），
**行数与复杂度一律不在这里填**——见 [report.md](./report.md) 第 6 节（脚本按 git 状态生成，含"新增/变更/保留"）。

分类口径与 [report.md](./report.md) §2 完全一致：内核 / 装配处 / 插件，VSCode 扩展与工具脚本单列。


### 1. 内核 · 其它

目录：`src/`　文件数：3

| 文件 | 职责 |
|---|---|
| `src/cli/PluginCommandEntry.ts` | 插件命令 → 注册表条目的适配器（Adapter）。 |
| `src/commands/EditCommandContribution.ts` | 编辑命令类的静态侧（create/move/…）：插件用它在注册表里登记一条命令。 |
| `src/domain/shape/provider/ShapeProviderLookup.ts` | 图形类型注册表的**只读视图**（领域侧接口）。 |

### 1. 内核 · 扩展点层

目录：`src/plugin-api/`　文件数：13

| 文件 | 职责 |
|---|---|
| `src/plugin-api/AttributeChanges.ts` | 属性修改的**事务记录**（一次 `set` = 一个 undo 单元）。 |
| `src/plugin-api/AttributeHandler.ts` | 扩展点 4/4：**属性在某类图形上的领域语义**。 |
| `src/plugin-api/CommandContribution.ts` | 命令插件解析参数时能拿到的东西（如 `create` 需要问工厂"该类型要哪些属性"）。 |
| `src/plugin-api/ContributionDeclarations.ts` | `package.json` 的 `contributes` 使用的四类名称列表（缺省为空）。 |
| `src/plugin-api/ContributionRegistry.ts` | 一次插件激活的暂存区：注册先进这里，`commit` 才并入内核。 |
| `src/plugin-api/DocumentEvent.ts` | 文档状态事件：装饰器据此维护自己的状态（如"自上次保存以来被改过的 id"）。 |
| `src/plugin-api/EditHost.ts` | 一条可撤销编辑在执行/撤销时能拿到的**宿主能力**。 |
| `src/plugin-api/PluginContext.ts` | 插件看到的**唯一装配面**：四个 `register*` 方法对应四个扩展点。 |
| `src/plugin-api/PluginErrors.ts` | 插件相关错误的统一分类：加载器据此生成 `error: …` 文案（见 doc/README.md 的加载契约）。 |
| `src/plugin-api/ShapeSnapshot.ts` | 图形内容的**可比较签名**：类型、标签、属性、文本、父节点、在父节点中的序号。 |
| `src/plugin-api/ShapeTarget.ts` | 处理器眼中的"目标图形"：只暴露公开查询能力，字段仍然封装在图形里。 |
| `src/plugin-api/TreeDecorator.ts` | 一行树对应上下文；`shape === null` 表示根 `svg` 那一行。 |
| `src/plugin-api/index.ts` | 内核对外公开的插件 API（插件只允许 import 这里与 `domain` 的公开抽象）。 |

### 2. 装配处

目录：`src/host/`（组合根 + 加载器 + 两条装配路径）　文件数：11

| 文件 | 职责 |
|---|---|
| `src/host/Application.ts` | 应用装配结果：把注册表、文档会话、命令表与 Presenter 组装成可运行的 `Application`。 |
| `src/host/CliMain.ts` | CLI 入口：解析命令行（`--config <file>`）、装配内置与可选插件、把 REPL 跑起来。 |
| `src/host/CodeAssembly.ts` | 方式 A：**改代码**装配。 |
| `src/host/CodePlugins.ts` | 方式 A（改代码）的**唯一**装配点：本阶段的可选插件清单。 |
| `src/host/CommandSetup.ts` | 装配处决定命令表的顺序与来源（注册表只做查重与分派）。 |
| `src/host/ConfigAssembly.ts` | 方式 B：**改配置**装配。 |
| `src/host/PluginActivation.ts` | 插件激活的**唯一**入口：代码装配与配置装配都调用它。 |
| `src/host/PluginAssembly.ts` | 装配方式的抽象：代码装配与配置装配都只是"往同一个注册表里装插件"的不同实现。 |
| `src/host/PluginConfig.ts` | `plugins.config.json` 的结构（见 doc/README.md 的"配置装配"一节）。 |
| `src/host/PluginModuleResolver.ts` | 配置装配的模块解析器：把 `module`（包名或相对路径）解析成插件模块，四条失败路径的判定都在这里。 |
| `src/host/SessionActions.ts` | 内置会话动作（9 条）：init/read/save/canvas/tree/show/help/undo/redo。 |

### 3. 插件 · `dir`

目录：`plugins/dir/`　文件数：4

| 文件 | 职责 |
|---|---|
| `plugins/dir/src/DirCommand.ts` | `dir`：列出 CLI 进程当前工作目录的直接子项（需求 §2.2）。 |
| `plugins/dir/src/DirectoryReader.ts` | 目录访问**端口**（Port）：`dir` 命令只认识这个接口，不认识 Node 的 `fs`。 |
| `plugins/dir/src/NodeDirectoryReader.ts` | 真实文件系统**适配器**：Node `fs` → `DirectoryReader` 端口。 |
| `plugins/dir/src/index.ts` | `@svgframe/plugin-dir`：以插件形式提供 `dir` 命令（默认导出类；`options.cwd` 可覆盖工作目录）。 |

### 3. 插件 · `shape-box`

目录：`plugins/shape-box/`　文件数：5

| 文件 | 职责 |
|---|---|
| `plugins/shape-box/src/BoxAttributesHandler.ts` | `box` 的属性语义（`AttributeHandler` 扩展点实现）。 |
| `plugins/shape-box/src/BoxProvider.ts` | `box` 的图形类型描述者（`ShapeProvider` 扩展点实现）。 |
| `plugins/shape-box/src/BoxShape.ts` | `box`：由"矩形 + 文字"组成的复合图形（容器型插件图形）。 |
| `plugins/shape-box/src/BoxTypeLabelDecorator.ts` | `(box)` 树标签（`TreeDecorator` 扩展点实现）。 |
| `plugins/shape-box/src/index.ts` | `@svgframe/plugin-shape-box`：一次提供三类扩展（图形 + 属性语义 + 树标签）。 |

### 3. 插件 · `shape-diamond`

目录：`plugins/shape-diamond/`　文件数：3

| 文件 | 职责 |
|---|---|
| `plugins/shape-diamond/src/DiamondProvider.ts` | `diamond` 的图形类型描述者。 |
| `plugins/shape-diamond/src/DiamondShape.ts` | `diamond`：菱形（可选拓展任务，用来二次验证"新增基本图形也不改内核"）。 |
| `plugins/shape-diamond/src/index.ts` | `@svgframe/plugin-shape-diamond`（可选拓展任务）：只贡献一个 `ShapeProvider`，却获得 create/tree/show/set/move/scale/save/read 全部行为。 |

### 3. 插件 · `stats`

目录：`plugins/stats/`　文件数：3

| 文件 | 职责 |
|---|---|
| `plugins/stats/src/StatsCommand.ts` | `stats`：图形统计（需求 §2.1）。 |
| `plugins/stats/src/StatsCounter.ts` | `stats` 的计数口径：按子节点顺序深度优先，叶子按类型首次出现顺序、容器（g/box）单列，根 svg 不计。 |
| `plugins/stats/src/index.ts` | `@svgframe/plugin-stats`：以插件形式提供 `stats` 命令。 |

### 3. 插件 · `tree-star`

目录：`plugins/tree-star/`　文件数：2

| 文件 | 职责 |
|---|---|
| `plugins/tree-star/src/ModifiedStarDecorator.ts` | `modified-star`：为"与上次保存点内容不一致"的行追加 `*`（ADR-3）。 |
| `plugins/tree-star/src/index.ts` | `@svgframe/plugin-tree-star`：以插件形式提供 `modified-star` 树标签。 |

### 3. 插件 · 内置

目录：`src/builtin/`（与第三方插件同权：走同一注册路径）　文件数：3

| 文件 | 职责 |
|---|---|
| `src/builtin/BuiltinEditCommands.ts` | 内置编辑命令插件：阶段 1 的 10 条可撤销命令，经 `EditCommandContribution` 注册（与第三方命令同权）。 |
| `src/builtin/BuiltinShapes.ts` | 内置图形插件：阶段 1 的六种图形，**以插件形式**装配。 |
| `src/builtin/index.ts` | 内置插件集合：默认装配（禁用任何外部插件）时提供阶段 1 的全部能力。 |

### 4. VSCode 扩展

目录：`vscode-extension/src/`（**单列，不计入 CLI 增量**）　文件数：13

| 文件 | 职责 |
|---|---|
| `vscode-extension/src/app/ExtensionBootstrap.ts` | 组合根（对应 Phase 1 `src/main.ts` 的位置）：把两个 Provider 组装出来并注册进 VSCode。 |
| `vscode-extension/src/decoration/DecorationMark.ts` | Explorer 里显示的文件徽标。 |
| `vscode-extension/src/decoration/FacadeFileKindProbe.ts` | `FileKindProbe` 的实现：把 VSCode 的 `FileType` 位标志翻译成三态。 |
| `vscode-extension/src/decoration/SvgDecorationJudge.ts` | 装饰判定（需求 A.1）：什么 Uri 该加 `[]` 标记。 |
| `vscode-extension/src/decoration/SvgFileDecorationProvider.ts` | 文件装饰 Provider（`vscode.window.registerFileDecorationProvider` 的实现方）。 |
| `vscode-extension/src/extension.ts` | 扩展入口（`package.json` 的 `main` 指向打包后的本文件）。 |
| `vscode-extension/src/outline/LineIndex.ts` | 偏移量 → (行, 列) 的换算。 |
| `vscode-extension/src/outline/OutlineElement.ts` | 大纲里的一个元素节点：只保留"展示 + 定位"需要的领域事实，以及**源码偏移量**。 |
| `vscode-extension/src/outline/OutlineParser.ts` | 面向"大纲"的容错 SVG 扫描器。 |
| `vscode-extension/src/outline/SvgOutlineProvider.ts` | SVG 大纲 Provider（`vscode.languages.registerDocumentSymbolProvider` 的实现方）。 |
| `vscode-extension/src/ports/FileKindProbe.ts` | 探测结论：文件 / 目录 / 未知（stat 失败）。 |
| `vscode-extension/src/ports/VscodeLike.ts` | VSCode API 的最小外观（Port）。 |
| `vscode-extension/src/vscode/VscodeBinding.ts` | `VscodeLike` 端口的唯一真实实现：整个扩展里**只有本文件在运行时 import `vscode`**。 |

### 4. VSCode 扩展 · 工具

目录：`vscode-extension/tools/`　文件数：1

| 文件 | 职责 |
|---|---|
| `vscode-extension/tools/evidence.ts` | 无 GUI 环境下的"等价证据"生成器。 |
