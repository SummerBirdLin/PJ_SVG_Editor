# SVG 编辑器（CLI + VSCode 扩展）— 阶段 2 设计文档

> **核心定位**：阶段 1 解决"功能怎么实现"，阶段 2 解决"新功能装在哪里"。
> 内核仅保留 **4 个扩展点**与**1 条统一的装配/校验路径**，`box` 复合图形、`stats`/`dir` 命令、`modified-star`/`(box)` 树标签均以**独立插件包**接入，内核与既有插件零改动。另附独立子包形式的 VSCode 扩展（资源管理器 `.svg` 徽标 + 原生大纲）。

| 阶段 | 内容 | 证据与入口 |
|---|---|---|
| 阶段 1（tag `final`） | CLI 编辑器：19 条命令、6 种图形、SVG 读写、undo/redo | [`doc/phase1-design.md`](phase1-design.md) |
| 阶段 2（tag `p2`，本文件） | 插件框架（4 扩展点 + 2 装配方式）、4 个核心插件 + `diamond` 拓展、VSCode 扩展 | `npm test`、`node tools/verify-phase2.mjs`、[`docs/metrics/report.md`](../docs/metrics/report.md) |

---

## 0. 目录结构与快速开始

```text
.
├── src/
│   ├── domain/        # 图形/文档/校验（零外部依赖）；ShapeProvider 扩展点定义
│   ├── plugin-api/    # ★新增：4 个扩展点接口 + 注册表 + 插件上下文 + 文档事件
│   ├── commands/      # 编辑命令（Command 模式）；SetCommand 接入属性处理器
│   ├── ports/ & io/   # 存储与编解码端口；SvgReader/SvgWriter/NodeFileStore
│   ├── app/ & cli/    # EditorSession（CommandHost）、REPL、命令表、Presenter
│   ├── builtin/       # ★新增：内置 6 种图形与 10 条编辑命令，以插件形式装配
│   ├── host/          # ★新增：组合根、插件加载器、配置装配、会话动作
│   └── main.ts        # 仅调用 runCliMain
├── plugins/           # ★新增：独立插件包（npm workspaces）：stats / dir / shape-box / tree-star / shape-diamond
├── vscode-extension/  # ★新增：Part A 的 VSCode 扩展（独立 npm 包、独立测试）
├── doc/ & docs/metrics/ # 设计文档、ADR、PlantUML、transcript、evidence；自动生成的指标报告
└── tools/ & test/     # verify-phase2.mjs、metrics/report.mjs；内核 + 跨插件集成 + transcript 测试
```

常用命令：

```bash
npm ci                                        # 安装依赖（含 plugins/* 与 vscode-extension workspaces）
npm test                                      # 全量用例（内核 + 插件框架 + 各插件包，158 用例）
npm run typecheck                             # 内核与各插件包分别 tsc --noEmit
npm run cli                                   # 代码装配启动 CLI
npm run cli -- --config plugins.config.json   # 配置装配启动 CLI（与代码装配输出逐字节一致）
node tools/verify-phase2.mjs                  # 阶段 2 一键验收（20 项，含 tag final 兼容性对照）
node tools/metrics/report.mjs                 # 重新生成 docs/metrics/report.md（final → 当前）
```

> 过程节点（VSCode 实践 → 插件框架 → 命令插件 → `box` → 树标签 → 文档与验收）均为普通提交，仅最终提交打 annotated tag **`p2`**；阶段 1 的 tag `final` 保持不变。

---

## 1. 扩展点设计

### 1.1 四个扩展点

扩展点接口集中定义在 `src/plugin-api/`（仅依赖 `domain`），插件包只允许依赖 `domain` + `plugin-api`。每个扩展点在内核中均有真实调用点：

| 扩展点 | 核心接口与契约 | 内核调用点 | 内置实现 | 本阶段新增 | 未装插件 / 违约行为 |
|---|---|---|---|---|---|
| **`ShapeProvider`**<br>图形类型 | `src/domain/shape/provider/ShapeProvider.ts`：`typeName`、`svgTag`、`dataKind`、`creationAttributes`、`create()`、`afterChildren()` | `ShapeFactory`（查表创建）；`SvgReader`（按标签取 Provider，读回后调 `afterChildren`） | 6 种基本图形（`rect`/`circle`/`ellipse`/`line`/`text`/`g`） | `box`、`diamond` | 未装时 `create box` 报 `unknown shape type`；读入 `data-kind="box"` 告警并降级为普通 `g`；`afterChildren` 抛错则整份 `read` 失败 |
| **`Command`**<br>命令 | `src/plugin-api/CommandContribution.ts`：`commandName`、`usage`、`summary`、`create(args, env) → { run(host) }` | `src/host/CommandSetup.ts` 组装命令表；`CommandRegistry` 按名分派；`PluginCommandEntry` 适配 | 10 条编辑命令（`BuiltinEditCommands`） | `stats`、`dir` | 未装时报 `unknown command`；缺必需字段触发契约错误并整体回滚 |
| **`TreeDecorator`**<br>树标签 | `src/plugin-api/TreeDecorator.ts`：`decoratorName`、`labelFor(ctx)`、`onDocumentEvent(event)` | `TreePresenter` 逐行调用并按注册顺序空格拼接；`EditorSession` 通过 `DocumentEventBus` 派发事件 | 无（阶段 1 即空装饰器） | `box-type-label` (`(box)`)、`modified-star` (`*`) | 无装饰器时 `tree` 输出与阶段 1 **逐字节一致**（无尾随空格）；抛错或返回非字符串时输出 `tree decorator failed` |
| **`AttributeHandler`**<br>属性语义 | `src/plugin-api/AttributeHandler.ts`：`handlerName`、`priority`、`handles(target, attr)`、`apply(target, attr, value, changes)` | `SetCommand` 按 `priority` 降序择一执行；写操作统一经 `AttributeChanges` 事务提交 | 无（沿用阶段 1 白名单） | `box-attributes`（`fill` → 内部矩形，`label` → 内部文字） | 未装时 `set n1 label` 报 `unknown attribute`；最高优先级并列则报 `ambiguous attribute handler` 并拒绝；失败整体回滚且不写历史 |

### 1.2 有意不做成扩展点的部分

为避免过度抽象与破坏跨阶段兼容性，以下能力明确保留在内核/宿主：

- **9 条会话动作**（`init`/`read`/`save`/`canvas`/`tree`/`show`/`help`/`undo`/`redo`）：操作 `EditorSession` 生命周期与 IO，属**宿主职责**（`src/host/SessionActions.ts`）。开放给插件会破坏"文档只能经 session 替换"的不变式。
- **画布尺寸与撤销栈策略**：属于内核契约（一次 `set` = 一个 undo 单元、IO 命令清空历史），做成插件会使撤销语义依赖装配顺序。
- **基础输出格式**：数字格式、树形符号、错误文案前缀需与阶段 1 **逐字节兼容**，不可插拔。

### 1.3 统一注册与校验路径

两条装配入口共享同一套 `activatePlugin()`（`src/host/PluginActivation.ts`）校验与提交机制：

```text
装配处（host）
 ├─ 方式 A：CodePlugins.ts → new XxxPlugin(options)             ┐
 └─ 方式 B：plugins.config.json → PluginModuleResolver 解析模块  ┘
                    │
                    ▼
        activatePlugin(plugin, registry, beginPlugin)
                    ├─ ① beginPlugin(name, contributes) 开辟暂存区（PluginStaging）
                    ├─ ② plugin.activate(staging)       所有 register* 只写入暂存区
                    ├─ ③ registry.commit(staging)       跨插件查重 → 清单比对 → 并入内核
                    └─ ④ 任一步失败 → registry.discard(staging) + 打印 error:，继续启动
```

该路径保证了三条关键性质（均由 `test/plugin/loader.test.ts` 与 `registry.test.ts` 覆盖）：
1. **失败零残留**：插件在 `activate` 中先注册合法项再抛错时，暂存区被整体丢弃，内核注册表零污染。
2. **清单硬约束**：`package.json` 的 `contributes` 声明与实际注册的 `类别/名字` 集合必须完全一致，且在 `commit` 时校验（ADR-4）。
3. **插件间零耦合**：注册表仅按 `类别 + 名字` 索引贡献，插件之间互不 import；`(box)` 与 `*` 完全通过公共领域模型与事件总线协作。

### 1.4 本阶段新增插件语义摘要

| 插件包 | 核心能力与语义约定 |
|---|---|
| `@svgframe/plugin-stats` | 只读命令 `stats`，按**类型首次出现顺序**统计叶子图形（如 `rect: 3  circle: 1  (total 4, containers 1)`）；容器（`g`/`box`）不计入类型列表而单列 `containers`（根 `svg` 不计），`box` 内部叶子照常计数；不进 undo 栈 |
| `@svgframe/plugin-dir` | 只读命令 `dir`，列出工作目录（目录在前、文件其次、`[OTHER]` 最后，各组按码位升序；隐藏项照列；空目录输出 `(empty directory)`）；与文档状态无关，不进 undo 栈 |
| `@svgframe/plugin-shape-box` | 复合图形 `box`（`create box <id> <x> <y> <w> <h> ["label"]`），由 `<id>-rect` 与 `<id>-label` 组成，`move`/`scale` 整体联动；`set <id> fill/label` 分别修改内部矩形与文字；`tree` 行尾附 `(box)` |
| `@svgframe/plugin-tree-star` | 树标签 `*`，基于内容快照与保存点比对（`undo` 回到保存点后 `*` 自动消失），根行汇总整个文档 |
| `@svgframe/plugin-shape-diamond` | 可选拓展：`create diamond` 仅实现一个 `ShapeProvider`，序列化为 `<polygon points="..."/>`，读回时由 `points` 反算外接矩形 |

---

## 2. 插件装配方式

### 2.1 方式 A（代码装配）与方式 B（配置装配）

- **方式 A（组合根，`src/host/CodePlugins.ts`）**：仅需在一个顶层文件中 `import` 并实例化可选插件（`new StatsPlugin()`、`new DirPlugin()`、`new ShapeBoxPlugin()`、`new TreeStarPlugin()`），`CliMain.ts` 通过 `new CodeAssembly(optionalPlugins())` 加载，无需改动内核。
- **方式 B（配置装配，`plugins.config.json`）**：通过 `npm run cli -- --config plugins.config.json` 启动，数组顺序即注册顺序（决定树标签拼接顺序）：

```json
{
  "plugins": [
    { "module": "@svgframe/plugin-stats" },
    { "module": "@svgframe/plugin-dir" },
    { "module": "@svgframe/plugin-shape-box" },
    { "module": "@svgframe/plugin-tree-star" }
  ]
}
```

配置项支持字段：`module`（必填，包名或相对于配置文件所在目录的路径）、`options`（可选，作为插件类构造参数传入）、`enabled`（可选，为 `false` 时跳过加载）。解析细节上，裸模块名通过 `createRequire` 解析 npm workspace，默认导出兼容类或实例对象，并以**原型安全包装**读取 `activate`（避免对象展开丢失原型方法）。

### 2.2 加载失败处理与双装配一致性

| 失败场景 | 错误输出 | 后续行为 |
|---|---|---|
| 模块未找到 | `error: plugin not found: <module>` | 跳过该插件，继续加载其余插件 |
| 模块求值抛错 / `activate` 抛错 | `error: plugin failed to activate: <name> (<reason>)` | 丢弃暂存区，内核无残留，继续启动 |
| 缺少默认导出 | `error: plugin has no default export: <module>` | 跳过该插件，继续启动 |
| 清单与实际注册不一致 | `error: plugin manifest mismatch: <name> (...)` | 丢弃暂存区，内核无残留 |
| 跨插件重名注册 | `error: duplicate registration: <category>/<name>` | 后一个插件整体回滚 |
| 配置文件结构非法 | `error: invalid plugin config` | 降级为"无可选插件"启动（保留阶段 1 全部能力） |

双装配一致性由 `node tools/verify-phase2.mjs` 自动化验证：三份会话契约（`cli-1`、`box`、`commands`）在代码装配与配置装配下的输出**逐字节一致**；禁用全部插件时与 `git archive final` 重放输出**逐字节一致**。

---

## 3. 重构前后的架构变化与设计决策

### 3.1 架构演进与依赖约束

- 重构前（`final`）：[`doc/diagrams/architecture-before.puml`](diagrams/architecture-before.puml)
- 重构后（`p2`）：[`doc/diagrams/architecture-after.puml`](diagrams/architecture-after.puml)

核心结构变化：

| 关注点 | 阶段 1（`final`） | 阶段 2（`p2`） |
|---|---|---|
| **组合根与装配** | `main.ts` 手工 `new` 所有图形与命令 | `main.ts` 退化为单行调用；新增 `src/host` 作为**唯一**允许认识全部实现的装配处 |
| **扩展点隔离** | 无扩展点概念 | 新增 `src/plugin-api` 层（只依赖 `domain`），集中 4 个扩展点接口与注册表 |
| **内置能力地位** | `ShapeFactory`、`CliMain` 硬编码 6 图形与 19 命令 | 新增 `src/builtin`，内置 6 图形与 10 编辑命令以插件形式注册，与第三方插件同权 |
| **内核去枚举化** | `SetCommand` 用 `switch` 分发属性；`TreePresenter` 硬编码输出 | `ShapeFactory` 注入查表；`SetCommand` 优先走属性处理器链；`TreePresenter` 拼接装饰器列表 |

`test/architecture.test.ts` 将依赖矩阵写成可执行守护测试：保证目录无环、`domain` 零外部依赖、`node:` 内置模块仅限 `io`/`host`、**插件包只允许被 `host` 按包名引用**，且加载器目录（`ConfigAssembly`、`PluginModuleResolver`、`PluginActivation`）内不允许出现任何具体插件名或 `switch` 分支。

### 3.2 开闭原则（OCP）验证

分别在两条独立演示分支上验证新增 `box` 插件的改动边界（已纳入 `verify-phase2.mjs` D1–D4 检查）：
- **`demo/assembly-code`（方式 A）**：仅新增 `plugins/shape-box/**`、更新 `package-lock.json` 与 `src/host/CodePlugins.ts`；`src/domain`、`src/commands`、`src/cli`、`src/app`、`src/io`、`src/plugin-api`、`src/builtin` 及既有插件的 `git diff` **完全为空**。
- **`demo/assembly-config`（方式 B）**：仅新增 `plugins/shape-box/**`、更新 `package-lock.json` 与 `plugins.config.json`；`src/` 目录下运行代码的 `git diff` **完全为空**。
- **二次验证**：`plugins/shape-diamond` 仅实现一个 `ShapeProvider` 即完成 `diamond` 图形接入。

### 3.3 适配器模式在 `dir` 插件中的应用

`plugins/dir` 采用**端口 + 适配器**隔离文件系统细节：

```text
DirCommand（只依赖抽象） ──▶ DirectoryReader（端口：read(target) → DirectoryEntry[]）
                                ▲
                                ├── NodeDirectoryReader（Adapter：fs.readdirSync + statSync）
                                └── FakeDirectoryReader（测试替身：脱离文件系统测试排序/分组/异常）
```

`NodeDirectoryReader` 将 `Dirent`/`Stats` 的多种文件系统状态统一翻译为 `'directory' | 'file' | 'other'` 三态（符号链接跟随一次 `stat` 判定，不可读则归为 `[OTHER]`），并将 `fs` 异常折算为 `DirectoryReadError`。命令本身只关心展示规则（目录→文件→其他、码位升序、不改文档与撤销栈），使 4 类边界测试无需触碰真实磁盘。

### 3.4 关键设计决策（ADR 与边界裁定）

四份架构决策记录存档于 `doc/adr/`：

| ADR | 核心决策与权衡 |
|---|---|
| [ADR-1 属性扩展点契约与事务边界](adr/0001-attribute-handler-contract.md) | 处理器接收 `ShapeTarget` 视图而非 `shapeId`，以便修改 `box` 子部件；按 `priority` 降序择一，最高优先级并列即拒绝（不按注册顺序隐式胜出）；`AttributeChanges` 作为唯一 undo 单元，任一步失败整体回滚且不写入历史。 |
| [ADR-2 `box` 的读回与降级策略](adr/0002-box-readback-degradation.md) | SVG 中用 `data-kind="box"` 标注类型：未装 `box` 插件时降级为普通 `g` 并告警；**已装插件但结构不合法时拒绝整个 `read`**（防止用户误以为在编辑完整 `box`）；子部件 id 固定派生 `<id>-rect` / `<id>-label`。 |
| [ADR-3 dirty 语义与祖先传播](adr/0003-dirty-semantics-and-ancestor-propagation.md) | `*` 标记基于内容快照与保存点比对（`undo` 回到保存点后 `*` 消失），而非简单的布尔脏位；不向祖先容器传播，由根行汇总；多标签按注册顺序空格拼接。 |
| [ADR-4 插件清单校验时机与回滚](adr/0004-plugin-manifest-validation.md) | 采用 `PluginStaging` 暂存 + `commit` 一次性校验：跨插件查重 → 清单比对 → 并入内核；任一环节失败整体丢弃，杜绝半激活状态。 |

**与需求细微差异或未规定处的显式裁定**：
1. **`plugin-api` 与 `builtin` 独立成层**：不塞入 `domain`，防止插件顺手拿到 `ShapeFactory`/`SvgDocument` 内部实现，同时确保内置能力与第三方插件同权。
2. **树节点命名**：需求示例出现 `g#n1 (box)`，实际实现为 `box#n1 (box)`，保持 `类型#id` 规则与 `(box)` 类型标注正交。
3. **`ungroup` 与重复 id 兼容**：`box` 非 `g` 容器，`ungroup` 沿用内核 `not a container` 拒绝（保证接入不改内核）；读回重复 id 时仅 `box` 子部件严格拒绝整个读入，其余图形保留阶段 1 的重命名告警以保兼容。

---

## 4. 与 AI 协作时的检查与修正

阶段 2 代码主要由 AI 生成并经人工逐条核对。通过可执行契约（transcript 逐字节比对）、架构守护测试与验收脚本，拦截并修正了以下典型问题：

### 4.1 拦截并修复的真实缺陷

| # | 现象 | 根因分析 | 修正方案 |
|---|---|---|---|
| 1 | 重构后 `help` 中 `tree/show/undo` 排到编辑命令之后 | 命令表改为按注册顺序排列，插件命令先于显示动作注册 | 新增 `host/CommandSetup.ts`，强制按"文档动作 → 插件命令 → 显示动作"组装，恢复阶段 1 顺序 |
| 2 | 测试替身 Provider 查不到 `providerForTag` | 替身未实现可选的 `dataKind` 字段，返回 `undefined` | 在 `ContributionRegistry.commit()` 统一归一化为 `dataKind ?? null` |
| 3 | Class 形态插件"注册成功但缺少 `activate`" | 清单封装时用了对象展开 `{...plugin}`，丢失原型方法 | 改为闭包包装 `{ name, contributes, activate: (ctx) => plugin.activate(ctx) }` |
| 4 | `set n1 label` 的 undo 回显 `label=none` | `AttributeChanges` 按子部件属性（`text`）记录，回显按命令参数（`label`）取旧值 | 增加 `AttributeChanges.firstBeforeAny()` 兜底查找，仍未命中才显示 `none` |
| 5 | `dir` 首版将整个目录列表拼成单行字符串 | 命令返回 `string` 而非 `string[]` | 改为返回逐行数组，适配 REPL 逐行输出与契约断言 |
| 6 | `<g id="n1" x="120" …>` 序列化出多余坐标 | `create box` 的几何参数经 `applyImportedAttributes` 漏入 `extras` | 在 `BoxShape.applyImportedAttributes` 中过滤已消费的几何与 `data-kind` 属性 |
| 7 | 接入 `box` 后双装配一致性测试失败 | 测试内联了插件清单，与 `plugins.config.json` 发生漂移 | 测试改为直接读取仓库的 `plugins.config.json`，消除双份维护 |
| 8 | 演示分支误提交 `examples/box.svg` | `git add -A` 误收工作区回放产物 | 被验收脚本 D2 判据拦截为"范围外改动"，amend 清理 |
| 9 | 并发运行测试偶发 `invalid plugin config` | 两个测试文件共用 `test/.tmp` 且互相清理 | 为各测试文件分配独立临时子目录（`test/.tmp/plugin-loader` 等） |
| 10 | 接入 `modified-star` 后 box 集成测试全红 | 测试使用默认全量装配，断言未预期新增的 `*` 后缀 | 将 box 集成测试改为仅装配 box 插件，标签组合由 `labels.integration.test.ts` 专门覆盖 |

### 4.2 否决的 AI 设计建议

- **否决"将 9 条会话动作也做成 `Command` 插件"**：会话动作直接管理 `EditorSession` 与 IO 生命周期，下放会破坏文档替换不变式。
- **否决"读入非法 `box` 时降级为普通 `g` 并告警"**：会把插件结构知识搬回内核，且易让用户误以为在操作完整 `box`（ADR-2）。
- **否决"`modified-star` 用布尔脏标记实现"**：`undo` 回到保存点后 `*` 无法自动消失，改为基于内容快照比对（ADR-3）。

### 4.3 迭代回归节奏

| 节点 | 用例数 | 关键回归手段 |
|---|---|---|
| 阶段 1（`final`） | 59 | transcript 逐字节基线 |
| 节点 2（框架） | 95 | 59 个旧用例 + 两份阶段 1 transcript 逐字节不变 |
| 节点 3（命令插件） | 119 | 未装插件 `unknown command` + 装后 `help` 列表验证 |
| 节点 4（`box`） | 136 | `save`→`read` round-trip 与未装插件降级 |
| 节点 5（树标签） | 152 | 编辑→保存→再编辑→undo 状态机 + 双装配一致性 |
| 节点 6（文档与验收，含 `diamond`） | 158 | `node tools/verify-phase2.mjs` 20 项全绿 |

---

## 5. 质量保证与度量指标

### 5.1 实验需求核对表

| 阶段 2 要求 | 实现位置 | 验证方式 |
|---|---|---|
| 4 个扩展点各有真实调用点、内核不按名枚举 | `src/plugin-api/`、`ShapeFactory`、`CommandSetup`、`SetCommand`、`TreePresenter` | `test/plugin/*`、`test/architecture.test.ts`、`verify-phase2.mjs` E 项 |
| 禁用插件仍可启动且与阶段 1 逐字节兼容 | `doc/transcript/plugins-none.config.json` | `test/transcript/baseline.test.ts`、`verify-phase2.mjs` A1/A2 项 |
| 两种装配方式、同一注册路径、4 条失败路径 + 回滚 | `CodePlugins.ts` / `plugins.config.json` / `PluginActivation.ts` | `test/plugin/loader.test.ts`、`verify-phase2.mjs` B 项 |
| `stats` 与 `dir` 命令插件（含适配器与只读语义） | `plugins/stats/`、`plugins/dir/`（`DirectoryReader` + `NodeDirectoryReader`） | `plugins/stats/test/*`、`plugins/dir/test/*`、`test/plugin/commands.test.ts` |
| `box` 复合图形/属性/树标签 + `modified-star` + `diamond` | `plugins/shape-box/`、`plugins/tree-star/`、`plugins/shape-diamond/` | `box.integration.test.ts`、`labels.integration.test.ts`、`diamond.test.ts` |
| 开闭原则证明（新增插件零内核改动） | `demo/assembly-code`、`demo/assembly-config` | `verify-phase2.mjs` D1–D4 项 |
| 度量指标脚本化（内核/装配/插件/扩展分开统计） | `tools/metrics/report.mjs` → `docs/metrics/report.md` | `verify-phase2.mjs` F/F2 项 |
| VSCode 扩展（`.svg` 徽标 + 原生大纲 + A.3 分析） | `vscode-extension/`（独立包，39 用例） | `cd vscode-extension && npm test`、图 A.1/A.2、`verify-phase2.mjs` E2 项 |

### 5.2 测试分布与度量变化（`final → p2`）

- **测试覆盖**：共 **158** 个 CLI 与插件用例（内核 59 + 插件框架与集成 52 + 会话契约 3 + 5 个插件包独立测试 42 + 其余集成），全部由 `npm test` 跑通；每个插件包均通过测试替身（`FakePluginContext`、`FakeDirectoryReader`）实现独立无 IO 测试。
- **代码度量**（由 `node tools/metrics/report.mjs --from final --to p2` 自动生成，详见 [`docs/metrics/report.md`](../docs/metrics/report.md)）：

| 分区 | 文件数 | 代码行 `final → p2` | 代码行增量 | 圈复杂度 `final → p2` | CC 增量 |
|---|---:|---:|---:|---:|---:|
| 内核（`domain`/`commands`/`ports`/`io`/`app`/`cli`/`plugin-api`） | 86 | 2985 → 3696 | **+711** | 719 → 890 | **+171** |
| 装配处（`host`/`main.ts`/`plugins.config.json`） | 12 | 33 → 542 | **+509** | 4 → 115 | **+111** |
| 插件（`builtin`/`plugins`） | 20 | 0 → 763 | **+763** | 0 → 140 | **+140** |
| **CLI 合计** | **118** | 3018 → 5001 | **+1983** | 723 → 1145 | **+422** |
| 测试（单列） / VSCode 扩展（单列） | 43 / 19 | 1337→3164 / 0→1437 | +1827 / +1437 | 139→407 / 0→252 | +268 / +252 |

解读：内核增量约 90% 来自新增 `src/plugin-api` 与 4 处扩展接缝，阶段 1 行为代码未重写；装配处 +509 行为一次性基础设施开销，后续每增一个插件仅增 1 行配置或代码；插件 +763 行可整包卸载。

### 5.3 运行证据（真机截图）

**① 插件与加载器测试**（`npm test`，158 用例全绿，完整日志见 [`doc/evidence/plugin-loader-tests.txt`](evidence/plugin-loader-tests.txt)）：

![插件与加载器测试](images/plugin-loader-tests.png)

**② 功能兼容性验证**（`node tools/verify-phase2.mjs`，20/20 项通过，逐行说明见 [`doc/evidence/compatibility.txt`](evidence/compatibility.txt)）：

![功能兼容性验证](images/compatibility.png)

---

## 6. 第一部分：VSCode 插件实践（Part A 摘要）

VSCode 扩展位于独立子包 [`vscode-extension/`](../vscode-extension/README.md)（独立 `package.json`、`tsconfig.json` 与 39 个单元测试），对根包 `src/`/`test/` **零改动**。运行与安装方式（A.3）：在 `vscode-extension/` 下执行 `npm install && npm run build` 后按 F5 启动调试；或执行 `npm run package` 生成 `svg-marker-outline.vsix`，通过 `code --install-extension` 安装（Remote-SSH / Dev Container 场景需在远端安装）。

### 6.1 核心功能与真机截图

- **A.1 资源管理器 `.svg` 徽标（`[]`）**：通过 `registerFileDecorationProvider` 为 `.svg` 文件附加 `[]` 视图标记（不修改文件名与文件内容），非 `.svg` 文件直接忽略不发 `stat`，目录（含 `.svg` 结尾目录）不加标记。
- **A.2 原生大纲（Outline）**：通过 `registerDocumentSymbolProvider` 注册 `{ pattern: '**/*.svg' }`（不绑定 `scheme`/`language`，兼容 Remote 窗口），递归输出层级化 `DocumentSymbol[]`，有 `id` 显示 `标签名#id`，无 `id` 仅显示标签名，点击跳转至起始标签 `selectionRange`。

![SVG 文件标记](images/vscode-badge.png)

![SVG 大纲与定位](images/vscode-outline.png)

*(等价可复现证据见 [`doc/evidence/vscode-badge.txt`](evidence/vscode-badge.txt) 与 [`doc/evidence/vscode-outline.txt`](evidence/vscode-outline.txt)，`verify-phase2.mjs` E2 项校验其可复现性。)*

### 6.2 关键设计与模式分析

1. **两段式异步文件装饰**：`provideFileDecoration` 为同步 API，无法直接获知是否为目录。工程采用"**首次未知返回 `undefined` + 后台 `workspace.fs.stat` 探测并缓存 + 仅结论变化时触发 `onDidChangeFileDecorations`**"，同时合并并发请求，避免 Explorer 滚动时重复 `stat` 与无谓重绘。
2. **文件装饰的本质（非 GoF Decorator）**：借用了 Decorator "不改主体、附加显示"的意图，但结构上没有同接口包装与转发链，而是**旁挂值对象（`FileDecoration`）+ 回调式 Provider（控制反转）+ 观察者失效通知**；也正因无法包装对象，缓存与失效责任需由插件自行管理。
3. **三向 Adapter 与端口隔离**：`VscodeBinding` 将 `vscode` API 适配为 `VscodeLike` 端口；`FacadeFileKindProbe` 将 `FileType` 位标志适配为三态枚举；`SvgOutlineProvider` / `SvgFileDecorationProvider` 将内部数据适配为结构镜像返回给 VSCode，使 39 个测试可在纯 Node 下运行。
4. **阶段 1 代码复用评估（策略复用 vs 直接 import）**：未直接 `import` Phase 1 的 `XmlParser`/`SvgReader`/`Shape`。原因在于：`XmlNode` 缺少源码字符偏移无法提供 `range`；`XmlParser` 遇未闭合标签即抛 `EditorError`；`SvgReader` 会为无 `id` 元素造假 `id` 并过滤非标准标签。本部分选择**复用跳过注释/引号的扫描策略**，以约 150 行容错扫描器 `OutlineParser` 独立实现（编辑中 XML 不完整时安全返回 `[]` 而不崩溃），避免为 Part A 修改已验证的阶段 1 内核。

---

## 附录：阶段边界与参考入口

- **阶段 2 明确不做**：插件热插拔/热卸载、插件权限沙箱、远程仓库版本解析、VSCode 扩展与 CLI 的数据联动、修改阶段 1 输出契约。
- **延伸阅读**：
  - 阶段 1 完整设计（架构、命令与输出契约）：[`doc/phase1-design.md`](phase1-design.md)
  - 指标自动报告：[`docs/metrics/report.md`](../docs/metrics/report.md)
  - 可执行会话契约与期望输出：[`doc/transcript/`](transcript)
  - 真机证据与等价证据：[`doc/evidence/`](evidence)
