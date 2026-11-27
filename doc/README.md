# SVG 编辑器（CLI + VSCode 扩展）— 阶段 2 设计文档

> **一句话**：阶段 1 解决"功能怎么实现"，阶段 2 解决"新功能装在哪里"——
> 内核只保留四个扩展点与一条统一的装配/校验路径，`box` 图形、`stats`/`dir` 命令、
> `modified-star`/`(box)` 树标签全部以**独立插件包**接入，内核与既有插件零改动。
> 另附一个 VSCode 扩展（资源管理器 `.svg` 标记 + 原生大纲）。

| 阶段 | 内容 | 证据 |
|---|---|---|
| 阶段 1（tag `final`） | CLI 编辑器：19 条命令、6 种图形、SVG 读写、undo/redo | [`doc/phase1-design.md`](phase1-design.md) |
| 阶段 2（tag `p2`，本文件） | 插件框架（4 扩展点 + 2 装配方式）、4 个插件、`dir` 适配器、VSCode 扩展（Part A） | `npm test`、`node tools/verify-phase2.mjs`、[`docs/metrics/report.md`](../docs/metrics/report.md) |

---

## 0. 交付物与快速开始

### 0.1 目录结构

```text
.
├── src/
│   ├── domain/        # 图形/文档/校验（零外部依赖）；ShapeProvider 扩展点定义
│   ├── plugin-api/    # ★阶段 2 新增：四个扩展点接口 + 注册表 + 插件上下文 + 文档事件
│   ├── commands/      # 编辑命令（Command 模式）；SetCommand 接入属性处理器
│   ├── ports/         # 文件存储/编解码端口
│   ├── io/            # SvgReader/SvgWriter/NodeFileStore（Adapter）
│   ├── app/           # EditorSession（门面，兼命令宿主 CommandHost）
│   ├── cli/           # REPL、命令表、三个 Presenter
│   ├── builtin/       # ★阶段 2 新增：内置图形/编辑命令也以插件形式装配
│   ├── host/          # ★阶段 2 新增：装配处（组合根、插件加载器、配置装配）
│   └── main.ts        # 只调用 runCliMain
├── plugins/           # ★阶段 2 新增：可选插件（npm workspaces，各自独立包/独立测试）
│   ├── stats/         #   stats 命令插件
│   ├── dir/           #   dir 命令插件（含 DirectoryReader 端口 + NodeDirectoryReader 适配器）
│   ├── shape-box/     #   box 复合图形插件（图形 + fill/label 属性语义 + (box) 树标签）
│   └── tree-star/     #   modified-star 树标签插件
├── vscode-extension/  # ★阶段 2 新增：Part A 的 VSCode 扩展（独立 npm 包、独立测试）
├── doc/               # 设计文档、ADR、依赖图、可执行会话契约
├── docs/metrics/      # ★由 tools/metrics/report.mjs 生成的指标产物（不得手填）
├── tools/             # 验收脚本与指标脚本
└── test/              # 内核测试 + 跨插件集成测试 + transcript 回放
```

### 0.2 常用命令

```bash
npm ci                            # 安装依赖（含 plugins/* 与 vscode-extension 的 workspaces）
npm test                          # 全部用例：内核 + 各插件包（node:test + tsx）
npm run typecheck                 # 内核 + 每个插件包分别 tsc --noEmit
npm run cli                       # 交互式 CLI（tsx 直跑 TS 源码；代码装配）
npm run cli -- --config plugins.config.json   # 同一份插件清单的配置装配
npm run build                     # 编译内核到 dist/（node dist/main.js 可运行）
node tools/verify-phase2.mjs      # 阶段 2 一键验收（含与 tag final 的兼容性对照）
node tools/metrics/report.mjs     # 重新生成 docs/metrics/report.md（final → 当前）
```

### 0.3 节点与 tag

- 过程节点是**普通提交/合并提交**，不打标签：节点 1 VSCode 实践 → 节点 2 插件框架 → 节点 3 命令插件 → 节点 4 `box` → 节点 5 树标签 → 节点 6 文档与验收。
- 只有最终提交带 annotated tag **`p2`**；阶段 1 的 tag `final` 保持不动（`git rev-parse final` 恒为阶段 1 提交）。

---

## 1. 插件框架：四个扩展点

### 1.1 扩展点清单

四个扩展点的接口都放在 `src/plugin-api/`（**只依赖 `domain`**，插件也因此只被允许依赖 `domain` + `plugin-api`）。
"内核调用点"一列给出真实代码位置，便于核对"框架真的在用它，而不是摆设"。

| 扩展点 | 接口（`src/plugin-api/`） | 内核调用点 | 内置实现 | 本阶段新增实现 | 不装插件时的行为 | 违约时的文案 |
|---|---|---|---|---|---|---|
| **`ShapeProvider`**<br>图形类型 | `src/domain/shape/provider/ShapeProvider.ts`：`typeName`、`svgTag`、`dataKind`、`creationAttributes`、`create(id, init)`、`afterChildren(shape)` | `src/domain/shape/ShapeFactory.ts`（按类型名/标签查表，经 `ShapeProviderLookup`）；`src/io/SvgReader.ts:59` 按标签取 Provider、`:119` 读回后调 `afterChildren` | 7 个（`svg`/`g`/`rect`/`circle`/`ellipse`/`line`/`text`） | `box` | `create box …` → `error: unknown shape type: box`；读入 `data-kind="box"` → `warning: unknown shape kind 'box', kept as plain g` 并降级为 `g` | `error: duplicate registration: shapes/box`（重名）；`error: plugin manifest mismatch: …`（清单不符）；`afterChildren` 抛错 → 整个 `read` 失败 |
| **`Command`**<br>命令 | `src/plugin-api/CommandContribution.ts`：`commandName`、`usage`、`summary`、`create(args, env) → { run(host) }` | `src/host/CommandSetup.ts:19` `createCommandRegistry()` 组装命令表（顺序：文档动作 → 插件命令 → 显示动作）；`src/cli/CommandRegistry.ts` 按名字分派；适配器 `src/cli/PluginCommandEntry.ts` | 10 个编辑命令（`src/builtin/BuiltinEditCommands.ts`，经 `EditCommandContribution`） | `stats`、`dir` | `error: unknown command: stats`（与阶段 1 的未知命令一致） | `error: duplicate registration: commands/stats`；缺 `usage`/`summary`/`commandName` → 契约错误（`error: plugin failed to activate: … (plugin contract violated: …)`） |
| **`TreeDecorator`**<br>树标签 | `src/plugin-api/TreeDecorator.ts`：`decoratorName`、`labelFor(ctx)`、`onDocumentEvent(event)` | `src/cli/presenter/TreePresenter.ts:84`（逐行调用、按注册顺序用空格拼接、异常折算文案）；`src/cli/action/TreeAction.ts` 把装饰器注入 `ActionContext`；`src/app/EditorSession.ts` 通过 `DocumentEventBus` 发事件 | 无（阶段 1 的树输出就是"没有装饰器"） | `box-type-label`（`(box)`）、`modified-star`（`*`） | `tree` 输出与阶段 1 **逐字节相同**（不追加空格） | `error: tree decorator failed: <name> (<reason>)`（抛异常或返回非字符串） |
| **`AttributeHandler`**<br>属性语义 | `src/plugin-api/AttributeHandler.ts`：`handlerName`、`priority`、`handles(target, attr)`、`apply(target, attr, value, changes)`；写操作统一走 `src/plugin-api/AttributeChanges.ts` | `src/commands/SetCommand.ts`（按 `priority` 降序选一个处理器；命中则整条 `set` 交它执行；失败回滚并**不写历史**） | 无（阶段 1 的白名单逻辑保留为"没有处理器命中"时的缺省路径） | `box-attributes`（`fill` → 内部矩形，`label` → 内部文字） | `set n1 label …` → `error: unknown attribute: label`（阶段 1 白名单行为） | `error: ambiguous attribute handler: label (box-attributes, other)`（最高优先级并列 → 拒绝而非按注册顺序取） |

### 1.2 哪些**不是**扩展点（有意为之）

需求只列出上述四个变化点，其余"看起来也常变"的东西本阶段**不**做成插件，理由一并记在这里，避免"框架过度抽象"：

| 内容 | 现状 | 为什么不做成扩展点 |
|---|---|---|
| `init`/`read`/`save`/`canvas`/`tree`/`show`/`help`/`undo`/`redo` 共 9 条**会话动作** | `src/host/SessionActions.ts` 里注册为"文档动作/显示动作"，由 `CommandSetup` 排在插件命令之前/之后 | 它们操作的是 `EditorSession` 的生命周期与 IO，属于**宿主**职责；插件拿到的 `CommandHost` 已经能读文档、能提交编辑，把会话动作也开放出去会破坏"文档只能经 session 替换"的不变式 |
| 画布尺寸、`undo`/`redo` 的栈策略 | `src/app/EditorSession.ts` + `src/commands/History.ts` | 属于内核契约（一个 `set` = 一个 undo 单元、IO 命令清空历史），做成插件会让"撤销语义"依赖装配顺序 |
| 输出格式（数字格式、树形符号、错误文案前缀） | `src/domain/NumberFormat.ts`、`src/cli/presenter/*` | 需求要求跨阶段**逐字节兼容**，这类格式一旦可插拔就无法保证契约稳定 |

### 1.3 注册与校验路径（同一套，两条装配方式共用）

```text
装配处（host）
 ├─ 方式 A：CodePlugins.ts → new XxxPlugin(options)            ┐
 └─ 方式 B：plugins.config.json → PluginModuleResolver 解析模块 ┘
                    │
                    ▼
        activatePlugin(plugin, registry, beginPlugin)          ← src/host/PluginActivation.ts:17
                    │
                    ├─ ① beginPlugin(name, contributes) 开一个暂存区（PluginStaging）
                    ├─ ② plugin.activate(staging)       所有 register* 只写暂存区
                    ├─ ③ registry.commit(staging)       跨插件查重 → 清单比对 → 并入内核
                    └─ ④ 任一步失败 → registry.discard(staging) + 打印 error: 文案，继续启动
```

三个关键性质（都有测试）：

1. **失败零残留**：花费在暂存区里的注册从未进入内核，失败插件不会留下半个扩展（`test/plugin/loader.test.ts` 的 `throws` 夹具先注册一个合法标签再抛错，断言注册表为空）。
2. **清单是硬约束**：`package.json` 的 `contributes` 与"实际注册的类别-名字集合"必须相等，否则 `plugin manifest mismatch`。校验发生在 **commit 时**，因此插件无法"先注册再改清单"绕过（ADR-4）。
3. **插件之间互不感知**：注册表只按"类别 + 名字"存贡献，一个插件看不到、也不会 import 另一个插件；`(box)` 标签只读 `Shape.typeName()`，`modified-star` 只比内容快照，两者协作完全靠公共契约。

### 1.4 内核怎样做到"不按名字枚举"

| 关注点 | 阶段 1（`final`） | 阶段 2 |
|---|---|---|
| 图形类型表 | `ShapeFactory` 里硬编码 7 个 Provider 的 `Map` | 注入 `ShapeProviderLookup`，`ShapeFactory` 只做"查表 + 校验"；查不到就是 `unknown shape type` |
| 命令表 | `CliMain` 里手工 new 19 条命令并硬编码名字 | `host/CommandSetup` 按"文档动作 → 插件命令 → 显示动作"装配 `CommandRegistry`，注册表里没有任何具体命令名 |
| `set` 的属性语义 | 一张白名单 + `switch` 到各个 `setXxx` | 属性处理器链（`AttributeChanges` 事务）优先；无命中才走阶段 1 白名单（保证兼容） |
| 树标签 | 不存在（`TreePresenter` 直接输出行） | 装饰器列表按注册顺序拼接；空列表时输出逐字节不变 |
| 读回校验 | 内建类型各自校验 | `ShapeProvider.afterChildren(shape)` 通用钩子：插件自己决定"读到什么才算合法" |

`rg` 抽查（需求 §6 的判据之一，`node tools/verify-phase2.mjs` 会自动跑同类检查）：

```bash
# 加载器目录里不应出现任何具体插件的名字/import/分支
rg -n "import|require|switch" src/host/ConfigAssembly.ts src/host/PluginModuleResolver.ts src/host/PluginActivation.ts src/host/PluginConfig.ts
# 期望：只有 node:fs/node:path/node:module 与内核自身模块；没有任何 '@svgframe/plugin-*'
```

---

## 2. 两种装配方式

同一条注册与校验路径（§1.3），入口有两个。两者**产出的注册结果完全相同**，因此 `npm run cli` 与
`npm run cli -- --config plugins.config.json` 跑同一份会话的输出逐字节一致（§2.5 有脚本证据）。

### 2.1 方式 A：改代码（组合根）

只有**一个**顶层装配文件需要动：`src/host/CodePlugins.ts`。

```ts
// src/host/CodePlugins.ts
import DirPlugin from '@svgframe/plugin-dir';
import ShapeBoxPlugin from '@svgframe/plugin-shape-box';
import StatsPlugin from '@svgframe/plugin-stats';
import TreeStarPlugin from '@svgframe/plugin-tree-star';
import type { PluginModule } from '../plugin-api/PluginContext.js';

export function optionalPlugins(): readonly PluginModule[] {
  return [
    new StatsPlugin(),
    new DirPlugin(),
    new ShapeBoxPlugin(),
    new TreeStarPlugin(),
  ];
}
```

接入一个新插件 = 在这里加 `import` + 加一行 `new XxxPlugin(options)`（若有 `options`，就是构造参数）。
`src/host/CliMain.ts` 只负责 `new CodeAssembly(optionalPlugins())`，不需要改。

### 2.2 方式 B：改配置（`plugins.config.json`）

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

运行：`npm run cli -- --config plugins.config.json`（缺省不传 `--config` 就走方式 A）。

### 2.3 配置文件格式

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `plugins` | 数组 | 是 | 每项一个插件；**数组顺序 = 注册顺序**（决定树标签的拼接顺序） |
| `plugins[].module` | 字符串 | 是 | 模块名（`@scope/name`、包名）或**相对于配置文件所在目录**的路径（`./x/y.js`） |
| `plugins[].options` | 任意 JSON | 否 | 传给插件：默认导出是**类**时作为构造参数；是**实例**时忽略（不覆盖已有实例状态） |
| `plugins[].enabled` | 布尔 | 否 | `false` = 显式跳过（便于临时关闭某个插件而不删配置） |

加载细则：

- 相对路径以**配置文件所在目录**为基准（`ConfigAssembly` 里解析，测试用临时配置验证过）；
- 裸模块名用 `createRequire(import.meta.url).resolve()` 解析，因此 `plugins/*` 作为 npm workspaces 能被按包名找到；
- 默认导出可以是**类**（用 `new exported(options)` 实例化）或**普通对象/实例**（直接用）；
- 对象的 `contributes` 字段用"原型安全的包装"读取（不 `spread`），因此 class 实例的原型方法不会丢（这条是修复过的一个真实 bug，见 §5.2）。

### 2.4 加载失败：四条路径 + 回滚 + 继续启动

| 场景 | 输出（逐字） | 之后 |
|---|---|---|
| 模块解析不到 | `error: plugin not found: <module>` | 该插件跳过，其余继续 |
| 模块存在但求值抛错 | `error: plugin failed to activate: <module> (<reason>)` | 同上（**不会**误报成 "not found"） |
| 没有默认导出 | `error: plugin has no default export: <module>` | 同上 |
| 清单与实际注册不一致 | `error: plugin manifest mismatch: <name> (declared: …, registered: …)` | 暂存区丢弃，内核无残留 |
| `activate` 抛错 | `error: plugin failed to activate: <name> (<reason>)` | 同上 |
| 跨插件重名注册 | `error: duplicate registration: <category>/<name>` | 后一个插件整体不生效 |
| 配置文件结构不合法 | `error: invalid plugin config` | 以"没有可选插件"启动（内置 6 种图形与阶段 1 的 19 条命令仍在） |

对应测试：`test/plugin/loader.test.ts`（12 个用例，含 `enabled:false`、`options` 传递、注册顺序）。

### 2.5 双装配一致性的证据

```bash
$ node tools/verify-phase2.mjs
[PASS] A1 兼容性（禁用全部插件 vs final 基线）：输出与期望逐字节一致
[PASS] A2 基线来源（tag final 重放）：tag final 的输出与 cli-1.baseline.expected 一致
[PASS] B cli-1：代码装配 vs 配置装配：输出与期望逐字节一致
[PASS] B cli-1（默认装配 vs cli-1.expected）：输出与期望逐字节一致
[PASS] B box：代码装配 vs 配置装配 / B box（默认装配 vs box.expected）
[PASS] B commands：代码装配 vs 配置装配 / B commands（默认装配 vs commands.expected）
[PASS] C dir 工作目录内容在验证期间未改变
[PASS] D1/D2/D3/D4 开闭原则判据（见 §3.4）
[PASS] E 加载器独立性：无具体插件 import / require / 模块名分支
[PASS] F 指标脚本可运行（final → HEAD）
=== 汇总：13/13 项通过 ===
```

三份会话输入在 `doc/transcript/`（`cli-1`、`box`、`commands`），期望输出与之一并提交，
因此"双装配一致"不是一次性人工结论，而是每次跑脚本都重新验证的契约。

---

## 3. 架构

### 3.1 模块划分（阶段 2）

| 层 | 目录 | 职责 | 新增/变化 |
|---|---|---|---|
| 核心域 | `src/domain` | 图形、文档、属性校验、Provider 扩展点定义 | `ShapeProvider` 增加 `dataKind` 与 `afterChildren`；`ShapeFactory` 改为注入 `ShapeProviderLookup` |
| 扩展点层 | `src/plugin-api` | 四个扩展点接口、`PluginStaging`/`ContributionRegistry`、`AttributeChanges`、`DocumentEventBus`、`ShapeSnapshot`、错误类型 | **全新** |
| 命令层 | `src/commands` | `Command`（execute/undo）、`History`、`SetCommand` 接入属性处理器 | `SetCommand` 变复杂（优先级/事务/回滚），其余不变 |
| 端口/IO | `src/ports`、`src/io` | 文件与编解码端口；SVG 读写适配器 | `SvgReader` 增加 `afterChildren` 校验点 |
| 应用层 | `src/app` | `EditorSession`：文档替换/保存/编辑的唯一入口，兼 `CommandHost` | 增加事件发布与 `commitEdit` |
| 表现层 | `src/cli` | REPL、命令表、Presenter | `CommandRegistry` 改为吃"排好序的条目"；`TreePresenter` 支持装饰器 |
| 内置插件 | `src/builtin` | 7 个图形 Provider + 10 个编辑命令，以插件形式注册 | **全新**（代码来自阶段 1，改为贡献项） |
| 装配处 | `src/host`、`src/main.ts` | 组合根、加载器、配置装配、CLI 入口、会话动作 | **全新** |
| 可选插件 | `plugins/*` | 4 个独立插件包（各自 `package.json`/`tsconfig`/测试） | **全新** |

### 3.2 依赖矩阵（`test/architecture.test.ts` 强制执行）

| 模块 | 允许依赖 |
|---|---|
| `domain` | （无） |
| `plugin-api` | `domain` |
| `commands` | `domain`、`plugin-api` |
| `ports` | `domain` |
| `io` | `domain`、`ports` |
| `app` | `domain`、`commands`、`ports`、`plugin-api` |
| `cli` | `domain`、`commands`、`app`、`plugin-api` |
| `builtin` | `domain`、`commands`、`plugin-api` |
| `host` | 以上全部（**唯一**允许认识所有人的地方） |
| `main` | `host` |

守护测试还断言：目录无环、`node:` 内置模块只允许出现在 `io`/`host`、
**插件包只能由装配处（`host`）按包名引用**（内核与插件本身都不许 import 具体插件）。

### 3.3 重构前后的模块依赖图（PlantUML）

- 重构前（tag `final`）：[`doc/diagrams/architecture-before.puml`](diagrams/architecture-before.puml)
- 重构后（tag `p2`）：[`doc/diagrams/architecture-after.puml`](diagrams/architecture-after.puml)
- 阶段 1 的类级组件图（保留）：[`doc/diagrams/architecture.puml`](diagrams/architecture.puml)

关键差异：

1. 新增 `plugin-api` 层，把"可变点"集中成四个接口；`domain` 仍然零依赖，但不再硬编码类型表。
2. 新增**装配处** `host`：阶段 1 的 `main.ts` 是"手工 new 一切"的组合根，现在它退化成一行 `runCliMain(...)`，
   所有"认识全部实现"的知识集中在 `host`。
3. 插件是**叶子**：`plugins/*` 只依赖 `domain` + `plugin-api`，彼此不 import；`builtin` 与第三方插件同权（没有特权 API）。
4. 依赖方向没有出现环，也没有"插件反向依赖内核命令/CLI"的捷径——`test/architecture.test.ts` 会拦。

### 3.4 开闭原则的证据

设 `C` = "把 `box` 插件接入项目"的那次提交。同一个插件包，两种接入方式各演示一次，落在两条独立分支上：

| 分支 | 接入方式 | 提交 |
|---|---|---|
| `demo/assembly-code` | 改代码：`src/host/CodePlugins.ts` 加一行 | `feat(plugin): 接入 box 插件（方式 A：仅改一个顶层装配文件）` |
| `demo/assembly-config` | 改配置：`plugins.config.json` 加一项 | `feat(plugin): 接入 box 插件（方式 B：只改配置，运行代码一行不动）` |

```bash
# 方式 A
$ git diff --name-status demo/assembly-code^ demo/assembly-code
M	package-lock.json
A	plugins/shape-box/package.json
A	plugins/shape-box/src/BoxAttributesHandler.ts
A	plugins/shape-box/src/BoxProvider.ts
A	plugins/shape-box/src/BoxShape.ts
A	plugins/shape-box/src/BoxTypeLabelDecorator.ts
A	plugins/shape-box/src/index.ts
A	plugins/shape-box/test/box.test.ts
A	plugins/shape-box/test/support/FakePluginContext.ts
A	plugins/shape-box/tsconfig.json
M	src/host/CodePlugins.ts

# 排除新插件包后，内核与既有插件的差异（必须为空）
$ git diff --name-status demo/assembly-code^ demo/assembly-code -- \
    src/domain src/commands src/cli src/app src/io src/plugin-api src/builtin plugins/stats plugins/dir
（空）

# 方式 B
$ git diff --name-status demo/assembly-config^ demo/assembly-config
M	package-lock.json
M	plugins.config.json
A	plugins/shape-box/…（同上 9 个文件）

# 方式 B 的运行代码差异（必须为空）
$ git diff --name-status demo/assembly-config^ demo/assembly-config -- src/
（空）
```

| 允许的改动 | 说明 |
|---|---|
| `plugins/shape-box/**` | 新插件包本身（源码、`package.json`、`tsconfig`、自带测试） |
| `src/host/CodePlugins.ts`（方式 A） | **唯一**的顶层装配文件，加 2 行（import + 实例化） |
| `plugins.config.json`（方式 B） | **唯一**的配置改动，加 1 项 |
| `package-lock.json` | 依赖元数据：新增 `@svgframe/plugin-shape-box` 的 workspace 条目，**没有**新增任何第三方依赖 |

`node tools/verify-phase2.mjs` 的 D1–D4 四项会重新跑上述判据（分支不存在或改动越界都会 FAIL）。

### 3.5 本阶段新增的能力一览

| 能力 | 类型 | 插件包 | 关键测试 |
|---|---|---|---|
| `box` 复合图形（矩形 + 标题，`data-kind="box"`） | `ShapeProvider` | `plugins/shape-box` | `plugins/shape-box/test/box.test.ts`、`test/plugin/box.integration.test.ts` |
| `set <box> fill` / `set <box> label` | `AttributeHandler` | `plugins/shape-box` | `test/plugin/attributes.test.ts`、`box.integration.test.ts` |
| `(box)` 树标签 | `TreeDecorator` | `plugins/shape-box` | `test/plugin/labels.integration.test.ts` |
| `*` 未保存标记 | `TreeDecorator` | `plugins/tree-star` | `plugins/tree-star/test/modified-star.test.ts` |
| `stats` 图形统计 | `Command` | `plugins/stats` | `plugins/stats/test/stats.test.ts`、`test/plugin/commands.test.ts` |
| `dir` 列当前目录 | `Command` + 适配器 | `plugins/dir` | `plugins/dir/test/*.test.ts`、`test/plugin/commands.test.ts` |

---

## 4. `dir` 的目录访问接口与适配器模式

### 4.1 三方角色

```text
DirCommand（客户端，只认识抽象）
      │  依赖
      ▼
DirectoryReader（Target/端口：plugins/dir/src/DirectoryReader.ts）
      ▲  实现
      ├── NodeDirectoryReader（Adapter：fs.readdirSync + statSync → DirectoryEntry[]）
      └── FakeDirectoryReader（测试替身：直接给定条目，不碰文件系统）
```

- **端口（Target）**：`DirectoryReader.read(target) → readonly DirectoryEntry[]`，`DirectoryEntry = { name, kind }`，
  `kind ∈ {'directory','file','other'}`；失败抛 `DirectoryReadError(target, reason)`。
- **适配器（Adapter）**：`NodeDirectoryReader` 把 `Dirent`/`Stats` 的语义翻译成展示语义，
  并把所有 `fs` 异常折算成带目标路径的 `DirectoryReadError`。
- **Adaptee**：`node:fs` 的 `readdirSync`/`statSync`（返回的是 `Dirent`，与"目录/文件/其它"的三分法并不对应）。

命令只依赖端口，因此"排序、分组、空目录、失败文案"这些**行为**可以完全脱离文件系统被验证
（`plugins/dir/test/dir.test.ts`），真实适配器另有一组用例（`node-adapter.test.ts`：临时目录、隐藏项、符号链接、非目录路径）。

### 4.2 语义细则

| 情况 | 行为 |
|---|---|
| 排序 | 目录在前、文件其次、`[OTHER]` 最后；每组按**码位**升序（不受 locale 影响，输出稳定可断言） |
| 隐藏项 | 照常列出（`.env`、`.gitignore` 都属于用户想知道的内容），不列 `.`/`..`（`readdirSync` 默认不含） |
| 符号链接 | 跟随一次 `stat` 判定目标类型（目录→`[DIR]`、文件→`[FILE]`）；目标不可读 → `[OTHER]`；**不递归**遍历 |
| 特殊项（FIFO/socket/设备） | `[OTHER]` |
| 空目录 | `(empty directory)` |
| 读取失败 | `error: cannot read directory: <path>`（REPL 打印后继续接受命令，不退出、不改文档、不进历史） |
| 未 `init`/`read` | 可用（`dir` 与文档无关）；此时文档类命令仍报 `error: no document` |
| 有文档时 | 不改变文档、不改变 dirty 状态、不进入 undo 栈（`test/plugin/commands.test.ts` 用 undo 反向验证） |
| 工作目录 | 缺省 `process.cwd()`；插件 `options.cwd` 可覆盖（测试与双装配一致性用它固定目录） |

### 4.3 为什么不在命令里直接 `readdirSync`

1. **可测性**：4 类边界（混合/空/隐藏/失败）与排序规则不必依赖真实文件系统，测试跑得快且不污染工作目录。
2. **可替换**：将来要列"最近打开文件"、远程目录、内存虚拟树，只需再写一个端口实现。
3. **职责**：命令关心"怎么展示"，适配器关心"文件系统怎么说"——`Dirent` 的 8 种判定方法与
   "目录/文件/其它"的三分法之间的翻译只存在于适配器一处。

---

## 5. 阶段 2 的过程记录（AI 生成 → 人工核对 → 修正）

### 5.1 需求逐条核对表

| 阶段 2 需求 | 实现位置 | 验证 |
|---|---|---|
| 四个扩展点各有真实调用点、有实现 | §1.1 表格 | `test/plugin/*`、`test/architecture.test.ts` |
| 内核不出现具体插件名/类型名 | `src/host/CommandSetup.ts`、`ShapeFactory` 注入查表、`SetCommand` 处理器链、`TreePresenter` 装饰器列表 | `node tools/verify-phase2.mjs` 的 E 项 + `rg` 抽查 |
| 禁用插件仍可启动且行为与阶段 1 相同 | `doc/transcript/plugins-none.config.json` | `test/transcript/baseline.test.ts`（与 tag `final` 输出逐字节相同） |
| `stats`（类型首次出现顺序、容器单列、box 内部叶子照常计） | `plugins/stats/src/StatsCounter.ts` | `plugins/stats/test/stats.test.ts` |
| `dir`（适配器、test double + 真实 fs、固定目录、日志在目录外） | `plugins/dir/src/*` | `plugins/dir/test/*.test.ts`、`tools/verify-phase2.mjs` C 项 |
| 两种装配方式、同一注册与校验路径 | `CodePlugins.ts` / `plugins.config.json` | `test/plugin/commands.test.ts`、`verify-phase2.mjs` B 项 |
| 四条失败路径 + 回滚 | `src/host/PluginModuleResolver.ts`、`PluginActivation.ts` | `test/plugin/loader.test.ts` |
| 清单校验与重复注册 | `src/plugin-api/ContributionRegistry.ts` | `test/plugin/registry.test.ts`、`loader.test.ts` |
| `box` 图形/属性语义/树标签、不变量、读回与降级 | `plugins/shape-box/src/*` | `plugins/shape-box/test/box.test.ts`、`test/plugin/box.integration.test.ts` |
| `modified-star` 与 `(box)` 并存、状态不串味 | `plugins/tree-star/src/ModifiedStarDecorator.ts` | 两个标签测试文件 |
| 开闭原则（两条演示分支 + 判据） | `demo/assembly-code`、`demo/assembly-config` | `verify-phase2.mjs` D 项 |
| 指标脚本化（内核/装配处/插件分开、扩展单列） | `tools/metrics/report.mjs` | `docs/metrics/report.md` 由脚本生成 |
| VSCode 扩展（徽标 + 原生大纲 + A.3 分析） | `vscode-extension/` | 见 §9 |

### 5.2 我改回的 AI 建议 / 修掉的真实 bug

阶段 2 的代码几乎全部是 AI 生成、我逐条核对的。下面每条都是**实际发生过**的偏差与修法（保留在提交历史里）：

| # | 现象 | 根因 | 修法 |
|---|---|---|---|
| 1 | 重构后 `help` 里 `tree/show/help/undo/redo` 跑到编辑命令后面 | 命令表改为"注册顺序即顺序"，插件命令先注册 | 引入 `host/CommandSetup.ts`：文档动作 → 插件命令 → 显示动作，恢复阶段 1 顺序；用 transcript 逐字节比对兜底 |
| 2 | 测试替身 Provider 查不到 `providerForTag` | 替身没实现 `dataKind`，查表返回 `undefined` | `ContributionRegistry.commit()` 统一归一为 `dataKind ?? null` |
| 3 | 类形态的插件"注册成功但没有 `activate`" | 清单回退用了对象展开 `{...plugin}`，原型方法不是自有属性 | 改为闭包包装 `{ name, contributes, activate: (ctx) => plugin.activate(ctx) }`（这就是"原型安全包装"存在的原因） |
| 4 | `set n1 label …` 的 undo 回显 `label=none`（应为旧值） | `AttributeChanges` 按**子部件属性名**（`text`）记录，回显按**命令参数名**（`label`）取旧值 | `AttributeChanges.firstBeforeAny()` 兜底，仍未命中才显示 `none` |
| 5 | `dir` 首版把整个列表当一行返回 | 命令返回 `string` 而不是 `string[]` | 改为逐行数组（REPL 逐行打印；测试与外部断言更清晰） |
| 6 | `<g id="n1" x="120" …>` 多出一份坐标 | `create box` 的几何参数经 `applyImportedAttributes` 漏进 `extras` | `BoxShape.applyImportedAttributes` 过滤已消费的 `x/y/width/height/data-kind` |
| 7 | 接入 `box` 后"双装配一致性"用例失败 | 测试里内联了一份插件清单，和 `plugins.config.json` 漂移 | 测试直接读仓库自带 `plugins.config.json`：清单漂移立刻红 |
| 8 | 演示分支误把 `examples/box.svg`（回放产物）提交进去 | `git add -A` 把工作区残留一起收了 | 验收脚本 D2 判据把它当"范围外改动"报出来，amend 修正；`examples/*.svg` 早已在 `.gitignore` |
| 9 | 同时跑多个测试文件偶发 `invalid plugin config` | 两个测试文件共用 `test/.tmp` 且其中一个删整个目录 | 每个测试文件用独立子目录（`test/.tmp/plugin-loader`、`test/.tmp/plugin-commands`） |
| 10 | 接入 `modified-star` 后 box 集成测试全红 | 集成测试用的是"默认装配"（含新标签），断言却没考虑 `*` | box 集成测试改为"只装 box 插件"，标签效果由 labels 集成测试覆盖 |

另外几条**"AI 建议、我裁定不采纳"**：

- AI 提议把 9 条会话动作（`init`/`read`/`save`/…）也做成 `Command` 插件 → 否决：它们操作 `EditorSession` 生命周期与 IO，属宿主职责（理由见 §1.2）。
- AI 提议读入 `box` 结构不合法时"降级为普通 `g` 并告警" → 否决：会把插件知识搬回内核，且用户以为在编辑 `box`（ADR-2）。
- AI 提议 `modified-star` 按"是否执行过编辑命令"记布尔标记 → 否决：`undo` 回到保存点后仍会亮星，与直觉不符（ADR-3）。

### 5.3 迭代与回归

| 节点 | 用例数 | 关键回归手段 |
|---|---|---|
| 阶段 1 完成（`final`） | 59 | transcript 逐字节 |
| 节点 2 框架 | 95 | 阶段 1 的 59 个用例 + 两份阶段 1 transcript 逐字节不变 |
| 节点 3 命令插件 | 119 | 未装插件时 `unknown command`；装上后 `help` 列出 |
| 节点 4 `box` | 136 | round-trip（`save`→`read`）与"未装插件降级" |
| 节点 5 树标签 | 152 | 状态机（编辑→保存→再编辑→undo 回保存点）+ 双装配一致 |
| 节点 6 文档+验收 | 见 §7.1 | `node tools/verify-phase2.mjs` 13 项全绿 |

---

## 6. 一致性自查（阶段 2）

### 6.1 模块划分：方案与实际目录

§3.1 的表就是实际目录（`ls src` 可直接核对）。两处**有意**的偏离：

1. `plugin-api` 单独成层而不是塞进 `domain`：插件只允许依赖 `domain` + `plugin-api`，若混进 `domain`，
   插件就能顺手拿到 `ShapeFactory`/`SvgDocument` 的内部实现，"扩展点"的边界就没了。
2. `builtin` 不是 `domain` 的一部分：内置图形/命令也需要走注册表，这样"内置"与"第三方"同权，
   否则一旦地基走捷径，"新增图形零改动"就无法被证明。

### 6.2 依赖方向：规则有没有被违反

`test/architecture.test.ts` 把 §3.2 的矩阵写成可执行断言（含无环、`node:` 只用 `io`/`host`、
插件包只由 `host` 命名引用）。当前 0 违反；`main.ts` 只 import `host`。

### 6.3 与需求不一致 / 需求未规定处的裁定（如实记录）

| # | 需求 | 实现 | 说明 |
|---|---|---|---|
| 1 | §5 示例树写 `g#n1 (box)` | 实现为 `box#n1 (box)` | 需求 §3.1 的命名规则是 `类型#id`，`(box)` 只是类型标注；两者不应互相覆盖，故以 `box#n1` 为准 |
| 2 | §7.4 要求 `docs/metrics/`，而设计文档在 `doc/` | 指标按需求放 `docs/metrics/`，设计文档仍在 `doc/` | 两个目录并存是有意的（不改需求指定路径） |
| 3 | 只规定 `[DIR]`/`[FILE]` 两种标记 | 增加 `[OTHER]` | 符号链接/特殊项的兜底，§4.2 有说明 |
| 4 | `ungroup` 应拒绝 `box` | 拒绝，但文案是 `error: not a container: n1` | `box` 不是 `g`，内核按"非分组容器"拒绝；为保证"接入提交不改内核"，未改文案 |
| 5 | 未规定 `show <box>` 输出 | 只显示通用属性（`id`/`parent`/`children` 数） | `fill`/`label` 要看 `show n1-rect` / `show n1-label`；`show` 未做成扩展点（§1.2） |
| 6 | 重复 id "必须拒绝整个读入" | 对 `box` 子部件生效（`afterChildren` 拒绝）；其它元素仍沿用阶段 1 的"重命名 + 告警" | 改全局行为会破坏阶段 1 兼容性 |
| 7 | 未规定属性处理器多命中 | `priority` 降序取最高；最高并列 → 拒绝并报 `ambiguous attribute handler` | ADR-1 |
| 8 | 未规定祖先行是否标 `*` | 不传播（根行汇总） | ADR-3，与 §5 示例形态一致 |
| 9 | "可选拓展：diamond" | 以 `plugins/shape-diamond` 实现（只加一个 `ShapeProvider`） | §8 的 OCP 二次验证；装配在两条路径各加一行 |

---

## 7. 质量保证

### 7.1 用例分布（每个插件包都能独立跑）

| 范围 | 用例数 | 命令 |
|---|---|---|
| 内核（`test/domain`、`test/commands`、`test/io`、`test/app`、`test/cli`、`test/architecture`） | 59 | `npm test` |
| 插件框架与跨插件集成（`test/plugin`） | 52 | `npm test` |
| 会话契约（`test/transcript`） | 3 | `npm test` |
| `@svgframe/plugin-stats` | 7 | `npm test --workspace @svgframe/plugin-stats` |
| `@svgframe/plugin-dir` | 12 | `npm test --workspace @svgframe/plugin-dir` |
| `@svgframe/plugin-shape-box` | 9 | `npm test --workspace @svgframe/plugin-shape-box` |
| `@svgframe/plugin-tree-star` | 8 | `npm test --workspace @svgframe/plugin-tree-star` |
| VSCode 扩展 | 见 §9 | `cd vscode-extension && npm test` |

插件测试使用**测试替身**提供扩展上下文（`test/support/FakePluginContext.ts`）与外部协作者
（`FakeDirectoryReader`），因此不依赖其它插件、也不依赖文件系统。

### 7.2 可执行契约

- `doc/transcript/*.txt` + `*.expected`：输入只含命令，输出逐字节比对（`test/transcript/*`）。
- `doc/transcript/cli-1.baseline.expected`：tag `final` 的冻结输出，用于阶段 1 兼容性。
- `node tools/verify-phase2.mjs`：把"兼容性 / 双装配 / dir 固定目录 / OCP 判据 / 加载器独立性 / 指标"一次性跑完。

### 7.3 指标（`final → p2`）

见 [`docs/metrics/report.md`](../docs/metrics/report.md)（由 `node tools/metrics/report.mjs` 生成，
脚本同时产出 `report.json` 便于复核；数字不得手填）。口径：

- **内核** = `src/domain`、`src/commands`、`src/ports`、`src/io`、`src/app`、`src/cli`、`src/plugin-api`
- **装配处** = `src/host`、`src/main.ts`、`plugins.config.json`
- **插件** = `src/builtin`、`plugins/**`（排除其测试与 `node_modules`）
- **VSCode 扩展** = `vscode-extension/**`（**单列**，不并入 CLI 差值）

### 7.4 类型与构建

- `tsc --noEmit`：内核 `strict` + `noUncheckedIndexedAccess` + `verbatimModuleSyntax`；每个插件包各自一份 `tsconfig.json`（继承根配置）。
- `npm run build` 产物 `dist/` 可用 `node dist/main.js` 直接跑（阶段 1 的用法不变）。

---

## 8. 决策记录（ADR）

| ADR | 结论一句话 |
|---|---|
| [ADR-1 属性扩展点的调用契约与事务边界](adr/0001-attribute-handler-contract.md) | 处理器拿"目标视图"改子部件；`priority` 降序，最高并列即拒绝；`AttributeChanges` 是唯一 undo 单元；失败整体回滚且不写历史 |
| [ADR-2 `box` 的读回策略](adr/0002-box-readback-degradation.md) | `data-kind` 标类型；未装插件 → 降级 `g`；装了但结构不合法 → **拒绝整个读入**；子部件 id 派生 `<id>-rect`/`<id>-label` |
| [ADR-3 dirty 语义与祖先传播](adr/0003-dirty-semantics-and-ancestor-propagation.md) | 按内容与保存点比较（`undo` 回保存点星消失）；祖先不传播、根行汇总；标签按注册顺序空格拼接 |
| [ADR-4 插件清单校验时机与回滚](adr/0004-plugin-manifest-validation.md) | 暂存区 + 一次性 commit：跨插件查重 → 清单比对 → 并入；任一步失败整体丢弃，插件零残留 |

## 9. 第一部分：VSCode 插件实践

<!-- PART_A_PLACEHOLDER -->

---

## 附录 A：CLI 输出约定（阶段 2 增量）

阶段 1 的完整输出约定见 [`doc/phase1-design.md`](phase1-design.md) 附录 A；本阶段只增补以下内容：

### A.1 `stats`

```text
rect: 3  circle: 1  text: 1  (total 5, containers 1)
(total 0, containers 0)                      # 空文档
```

- 叶子按**类型首次出现顺序**列出（不是字母序），容器（`g`、`box`）不计入类型统计，只计 `containers`；
- 根 `svg` 不计入 `containers`（画布不是图形）；
- `box` 内部的矩形/文字照常按叶子计数，`box` 自身计入 `containers`；
- 只读命令：不进入 undo 栈、不改变 dirty 状态。

### A.2 `dir`

```text
[DIR]  docs
[DIR]  plugins
[FILE] demo.svg
[FILE] package.json
```

- 目录在前、文件其次、`[OTHER]` 最后，各组按码位升序；隐藏项照列；空目录输出 `(empty directory)`；
- 每项一行（REPL 逐行打印）。

### A.3 树标签

```text
svg (800x600) *
└── g#flowchart
    ├── box#n1 (box)
    │   ├── rect#n1-rect   x=120 y=100 w=160 h=60 fill=#f5a623 *
    │   └── text#n1-label  (140,135) "处理数据"
    └── line#arrow1  (280,130) -> (520,130)
```

- 标签追加在行尾，多个标签用**一个空格**连接，顺序 = 注册顺序（当前是 `(box)` 在内核里先注册、`*` 在后）；
- 没有装饰器时不追加任何字符（阶段 1 输出逐字节不变，无尾随空格）；
- `*` 语义见 ADR-3：内容与上次保存点不一致（根行汇总整个文档）。

### A.4 `box` 的创建与属性

```text
create box <id> <x> <y> <width> <height> ["<label>"]
set <boxId> fill <color>        # 落在内部矩形 <id>-rect
set <boxId> label "<text>"      # 落在内部文字 <id>-label
```

`tree` 里 `box` 行不显示内联几何（几何属于内部矩形行）；`move`/`scale` 作用于整体（两个子部件一起动）。

## 附录 B：错误信息清单（阶段 2 增量）

| 场景 | 文案 |
|---|---|
| 未知图形类型 | `error: unknown shape type: <type>` |
| 未装插件时 `create box` | `error: unknown shape type: box` |
| 未装插件读回 `data-kind` | `warning: unknown shape kind 'box', kept as plain g` |
| `box` 结构不合法（读回） | `error: invalid box <id>: expected <id>-rect and <id>-label, got [<ids>]` / `error: invalid box <id>: expected 2 parts, got <n>` |
| 删除 `box` 必要子部件 | `error: cannot remove required part of box: <id>` |
| 往 `box` 里塞第三个/错误子部件 | `error: cannot add child to box <id>: expected <a> / <b>, got <id>` / `… wrong type for <id>` |
| 新增子树 id 冲突 | `error: id already exists: <id>`（`create box` 的子部件冲突也走这条） |
| 属性处理器并列 | `error: ambiguous attribute handler: <attr> (<names>)` |
| 属性处理器失败 | 处理器原始错误（文档整体回滚，历史不变） |
| 树装饰器失败 | `error: tree decorator failed: <name> (<reason>)` |
| 插件未找到 / 求值失败 / 无默认导出 / 清单不符 / `activate` 失败 / 重名 / 配置非法 | 见 §2.4 |
| 未知命令（未装插件） | `error: unknown command: <name>` |

## 附录 C：阶段边界（阶段 2 明确不做）

- 不做插件的**热插拔/热卸载**（配置变更需重启 CLI）；
- 不做插件的**权限/沙箱**（同进程加载，信任仓库内插件）；
- 不做**远程插件仓库/版本解析**（`module` 只支持包名与相对路径，无版本约束求解）；
- 不做 VSCode 扩展与 CLI 的**数据联动**（扩展只做"文件标记 + 大纲"，不调用 CLI）；
- 不改阶段 1 的**输出契约**（容器/计数/数字格式/错误前缀一律沿用）。

## 附录 D：阶段 1 文档入口

阶段 1 的完整设计文档（架构方案、设计模式落地、依赖规则、过程记录、一致性自查、附录 A/B/C）
存档在 [`doc/phase1-design.md`](phase1-design.md)，对应 tag `final`。
