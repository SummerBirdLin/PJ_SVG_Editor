# 指标产物：CLI 代码指标（final → 目标 ref）

> **本文件由脚本生成，不得手填。** 重新生成（幂等，产物不含时间戳）：
>
> ```bash
> node tools/metrics/report.mjs --from final --to HEAD
> ```

数据全部取自 **git 历史**（`git ls-tree -r --name-only <ref>` 枚举文件 + `git show <ref>:<path>` 读内容），不读工作区，因此未提交改动不会污染数字。

## 1. Ref 与生成命令

| 项 | 值 |
|---|---|
| 基线 ref（`--from`） | `final` → annotated tag 对象 `52f24b5` → commit `5e7e7cb` |
| 目标 ref（`--to`） | `HEAD` → commit `d3251e0` |
| 生成命令 | `node tools/metrics/report.mjs --from final --to HEAD` |
| 基线内容来源 | `git ls-tree -r --name-only final` / `git show final:<path>`（扫描 88 个 TS 文件） |
| 目标内容来源 | `git ls-tree -r --name-only HEAD` / `git show HEAD:<path>`（扫描 88 个 TS 文件） |
| 统计口径版本 | `1`（口径说明见 [README.md](./README.md)） |

## 2. 按分区的行数 / 圈复杂度对照表

分区口径（固定，脚本内 `CATEGORY_DEFS` 以前缀表表达）：

| 类别 | 命中路径前缀 | 归类理由 |
|---|---|---|
| **内核** | `src/domain/`、`src/commands/`、`src/ports/`、`src/io/`、`src/app/`、`src/cli/`、`src/plugin-api/` | 这些目录是「不依赖具体装配方式」的业务与技术内核；plugin-api 放的是扩展点接口，属于内核一侧（插件只实现它） |
| **装配处** | `src/host/`、`src/main.ts`、`plugins.config.json` | 只做「把谁装给谁」的接线，不含业务规则；插件加载器同样是装配职责 |
| **插件** | `src/builtin/`、`plugins/` | 可被装卸的扩展单元；阶段 1 没有插件目录，自然为空 |
| 未分类（兜底） | 兜底：CLI 范围内未匹配上面三类的 TS 文件 | 兜底行：出现即提示审阅者把新目录登记进 CATEGORY_DEFS 的某一类 |

当前「未分类」为空：所有 CLI 范围 TS 文件都落在上面三类里。

### 2.1 代码行数（主指标：非空、非注释行）

| 类别 | 文件数 | 代码行（final） | 代码行（目标） | 代码行增量 | 注释行（目标） | 空行（目标） | 物理行（目标） |
|---|---:|---:|---:|---:|---:|---:|---:|
| **内核** | 73 | 2985 | 2985 | 0 | 297 | 546 | 3828 |
| **装配处** | 1 | 33 | 33 | 0 | 4 | 4 | 41 |
| **插件** | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| **未分类** | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| **合计（CLI）** | **74** | **3018** | **3018** | **0** | **301** | **550** | **3869** |

行数口径：**代码行 = 非空、非注释行**（行内既有代码又有行尾注释时算代码行）；**注释行 / 空行 / 物理行（`wc -l` 口径）另列**，不参与增量结论。注释区间由词法扫描得到，不是用正则猜的。

### 2.2 圈复杂度（CC，逐文件逐函数累加）

| 类别 | 函数数（目标） | CC（final） | CC（目标） | CC 增量 | 最大函数 CC（目标） |
|---|---:|---:|---:|---:|---|
| **内核** | 316 | 719 | 719 | 0 | 32（`src/cli/DisplayWidth.ts` → `DisplayWidth.isWide`） |
| **装配处** | 2 | 4 | 4 | 0 | 3（`src/main.ts` → `main`） |
| **插件** | 0 | 0 | 0 | 0 | — |
| **未分类** | 0 | 0 | 0 | 0 | — |
| **合计（CLI）** | **318** | **723** | **723** | **0** | 32（`src/cli/DisplayWidth.ts` → `DisplayWidth.isWide`） |

增量口径：`HEAD` − `final`。CC 判定项：`if`、`for`、`while`、`do`、`case`、`catch`、`&&`、`||`、`??`、三元 `? :`（`else if` 由其中的 `if` 计一次）；每个函数基础值 1，文件 CC ＝ 各函数 CC 之和（含顶层伪函数）。**这是词法级估算值**，用于趋势与增量对比，详见 [README.md](./README.md)。

### 2.3 变化最大的文件（Top-10，按 |CC 增量| 降序）

基线 ref 与目标 ref 的文件级指标完全一致：没有变化文件（本次增量全为 0）。

## 3. 测试与 fixtures（单独一行，不计入三类、不计入 CC 增量）

| 范围 | 文件数 | 代码行（final） | 代码行（目标） | 代码行增量 | CC（仅供参考） |
|---|---:|---:|---:|---:|---:|
| `test/`（含 `*.test.ts`） | 14 | 1337 | 1337 | 0 | 139 |

测试代码衡量的是「测试量」，不属于重构后交付源码的规模，因此单列；它不参与内核/装配处/插件的行数与 CC 增量。

## 4. VSCode 扩展（单独一节，不计入 CLI 增量）

| 范围 | 文件数 | 代码行（final） | 代码行（目标） | 代码行增量 | CC（仅供参考） |
|---|---:|---:|---:|---:|---:|
| `vscode-extension/` | 0 | 0 | 0 | 0 | 0 |

VSCode 扩展是 CLI 之外的另一个交付物（自己的打包与依赖），把它混进 CLI 增量会掩盖真正的重构收益，因此口径上完全隔离：只列数字，不进第 2 节的任何一行。

## 5. 排除项

| 排除对象 | 原因 |
|---|---|
| `node_modules/` | 第三方依赖（不是本项目写的代码） |
| `dist/` | 构建产物（由 `src/` 编译而来，重复计数会翻倍） |
| `vscode-extension/` | 单独一节（见第 4 节） |
| `test/`、任意层级 `test/`·`tests/` 目录、`*.test.ts`、`*.spec.ts`（含 `plugins/*/test/`） | 测试与 fixtures，单独一行（见第 3 节） |
| 非 `*.ts` 文件 | 本指标只统计 TS 源码（`*.mjs` 脚本、`*.json`、`*.md`、`*.svg` 等不计） |
| 二进制文件、子模块 | `git show` 取不到文本内容，跳过（本次跳过 0 个） |

## 6. 文件级明细（目标 ref，全量）

`状态`：新增 / 变更 / 保留 / 删除（相对基线 ref）。CC 为每文件「逐函数 CC 之和」。

### 6.1 CLI 范围

| 文件 | 类别 | 状态 | 代码行 | 代码行增量 | 注释行 | 空行 | 函数数 | CC | CC 增量 | 最高函数 |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| `src/app/EditorSession.ts` | 内核 | 保留 | 128 | 0 | 14 | 23 | 15 | 27 | 0 | 3 `EditorSession.init` |
| `src/cli/action/CanvasAction.ts` | 内核 | 保留 | 34 | 0 | 2 | 8 | 3 | 10 | 0 | 7 `CanvasAction.parse` |
| `src/cli/action/EditAction.ts` | 内核 | 保留 | 12 | 0 | 1 | 3 | 2 | 2 | 0 | 1 `EditAction.constructor` |
| `src/cli/action/HelpAction.ts` | 内核 | 保留 | 23 | 0 | 1 | 7 | 3 | 4 | 0 | 2 `HelpAction.parse` |
| `src/cli/action/InitAction.ts` | 内核 | 保留 | 27 | 0 | 1 | 8 | 3 | 6 | 0 | 4 `InitAction.parse` |
| `src/cli/action/ReadAction.ts` | 内核 | 保留 | 22 | 0 | 1 | 7 | 3 | 5 | 0 | 3 `ReadAction.parse` |
| `src/cli/action/RedoAction.ts` | 内核 | 保留 | 18 | 0 | 1 | 5 | 2 | 3 | 0 | 2 `RedoAction.parse` |
| `src/cli/action/SaveAction.ts` | 内核 | 保留 | 22 | 0 | 1 | 7 | 3 | 4 | 0 | 2 `SaveAction.parse` |
| `src/cli/action/ShowAction.ts` | 内核 | 保留 | 23 | 0 | 1 | 7 | 3 | 5 | 0 | 3 `ShowAction.parse` |
| `src/cli/action/TreeAction.ts` | 内核 | 保留 | 23 | 0 | 1 | 7 | 3 | 4 | 0 | 2 `TreeAction.parse` |
| `src/cli/action/UndoAction.ts` | 内核 | 保留 | 18 | 0 | 1 | 5 | 2 | 3 | 0 | 2 `UndoAction.parse` |
| `src/cli/ActionContext.ts` | 内核 | 保留 | 6 | 0 | 1 | 1 | 0 | 0 | 0 | — |
| `src/cli/ActionEntry.ts` | 内核 | 保留 | 22 | 0 | 1 | 6 | 5 | 5 | 0 | 1 `ActionEntry.constructor` |
| `src/cli/ActionStatic.ts` | 内核 | 保留 | 8 | 0 | 1 | 4 | 0 | 0 | 0 | — |
| `src/cli/CommandEntry.ts` | 内核 | 保留 | 8 | 0 | 1 | 4 | 0 | 0 | 0 | — |
| `src/cli/CommandRegistry.ts` | 内核 | 保留 | 72 | 0 | 6 | 7 | 4 | 6 | 0 | 2 `CommandRegistry.constructor` |
| `src/cli/DisplayWidth.ts` | 内核 | 保留 | 32 | 0 | 6 | 2 | 3 | 37 | 0 | 32 `DisplayWidth.isWide` |
| `src/cli/EditCommandClass.ts` | 内核 | 保留 | 8 | 0 | 1 | 4 | 0 | 0 | 0 | — |
| `src/cli/EditCommandEntry.ts` | 内核 | 保留 | 27 | 0 | 4 | 6 | 5 | 5 | 0 | 1 `EditCommandEntry.constructor` |
| `src/cli/presenter/HelpPresenter.ts` | 内核 | 保留 | 16 | 0 | 1 | 3 | 2 | 3 | 0 | 2 `HelpPresenter.render` |
| `src/cli/presenter/ShowPresenter.ts` | 内核 | 保留 | 15 | 0 | 1 | 1 | 1 | 3 | 0 | 3 `ShowPresenter.render` |
| `src/cli/presenter/TreePresenter.ts` | 内核 | 保留 | 52 | 0 | 6 | 5 | 4 | 13 | 0 | 4 `TreePresenter.render` |
| `src/cli/Repl.ts` | 内核 | 保留 | 67 | 0 | 9 | 9 | 3 | 15 | 0 | 12 `Repl.run` |
| `src/cli/ReplOptions.ts` | 内核 | 保留 | 4 | 0 | 1 | 0 | 0 | 0 | 0 | — |
| `src/cli/Runnable.ts` | 内核 | 保留 | 4 | 0 | 5 | 1 | 0 | 0 | 0 | — |
| `src/cli/TextOutput.ts` | 内核 | 保留 | 3 | 0 | 1 | 0 | 0 | 0 | 0 | — |
| `src/cli/Tokenizer.ts` | 内核 | 保留 | 42 | 0 | 4 | 3 | 1 | 10 | 0 | 10 `Tokenizer.tokenize` |
| `src/commands/AddToCommand.ts` | 内核 | 保留 | 56 | 0 | 4 | 14 | 4 | 12 | 0 | 4 `AddToCommand.parse` |
| `src/commands/BackCommand.ts` | 内核 | 保留 | 42 | 0 | 1 | 10 | 4 | 8 | 0 | 3 `BackCommand.parse` |
| `src/commands/Command.ts` | 内核 | 保留 | 31 | 0 | 13 | 5 | 3 | 7 | 0 | 3 `Command.locateContainerOrFail` |
| `src/commands/CommandContext.ts` | 内核 | 保留 | 6 | 0 | 1 | 1 | 0 | 0 | 0 | — |
| `src/commands/CommandParseContext.ts` | 内核 | 保留 | 4 | 0 | 1 | 1 | 0 | 0 | 0 | — |
| `src/commands/CreateCommand.ts` | 内核 | 保留 | 94 | 0 | 7 | 15 | 5 | 30 | 0 | 19 `CreateCommand.parse` |
| `src/commands/DeleteCommand.ts` | 内核 | 保留 | 40 | 0 | 1 | 10 | 4 | 8 | 0 | 3 `DeleteCommand.parse` |
| `src/commands/FrontCommand.ts` | 内核 | 保留 | 42 | 0 | 1 | 10 | 4 | 8 | 0 | 3 `FrontCommand.parse` |
| `src/commands/GroupCommand.ts` | 内核 | 保留 | 104 | 0 | 6 | 17 | 4 | 24 | 0 | 13 `GroupCommand.execute` |
| `src/commands/History.ts` | 内核 | 保留 | 37 | 0 | 11 | 10 | 8 | 12 | 0 | 2 `History.peekUndo` |
| `src/commands/MoveCommand.ts` | 内核 | 保留 | 46 | 0 | 5 | 7 | 4 | 10 | 0 | 5 `MoveCommand.parse` |
| `src/commands/ScaleCommand.ts` | 内核 | 保留 | 53 | 0 | 4 | 9 | 5 | 13 | 0 | 5 `ScaleCommand.parse` |
| `src/commands/SetCommand.ts` | 内核 | 保留 | 49 | 0 | 4 | 10 | 5 | 13 | 0 | 5 `SetCommand.parse` |
| `src/commands/UngroupCommand.ts` | 内核 | 保留 | 57 | 0 | 4 | 14 | 5 | 12 | 0 | 4 `UngroupCommand.undo` |
| `src/domain/EditorError.ts` | 内核 | 保留 | 6 | 0 | 4 | 0 | 1 | 1 | 0 | 1 `EditorError.constructor` |
| `src/domain/NumberFormat.ts` | 内核 | 保留 | 46 | 0 | 11 | 5 | 4 | 13 | 0 | 6 `NumberFormat.format` |
| `src/domain/shape/CanvasShape.ts` | 内核 | 保留 | 43 | 0 | 6 | 11 | 10 | 12 | 0 | 3 `CanvasShape.resize` |
| `src/domain/shape/CircleShape.ts` | 内核 | 保留 | 65 | 0 | 1 | 13 | 12 | 15 | 0 | 4 `CircleShape.setGeometryAttribute` |
| `src/domain/shape/ContainerShape.ts` | 内核 | 保留 | 81 | 0 | 7 | 18 | 17 | 24 | 0 | 4 `ContainerShape.findById` |
| `src/domain/shape/CreationAttribute.ts` | 内核 | 保留 | 4 | 0 | 1 | 0 | 0 | 0 | 0 | — |
| `src/domain/shape/EllipseShape.ts` | 内核 | 保留 | 77 | 0 | 1 | 14 | 13 | 17 | 0 | 5 `EllipseShape.setGeometryAttribute` |
| `src/domain/shape/GShape.ts` | 内核 | 保留 | 6 | 0 | 4 | 1 | 1 | 1 | 0 | 1 `GShape.constructor` |
| `src/domain/shape/LineShape.ts` | 内核 | 保留 | 79 | 0 | 1 | 14 | 13 | 17 | 0 | 5 `LineShape.setGeometryAttribute` |
| `src/domain/shape/provider/CircleProvider.ts` | 内核 | 保留 | 23 | 0 | 1 | 4 | 1 | 1 | 0 | 1 `CircleProvider.create` |
| `src/domain/shape/provider/EllipseProvider.ts` | 内核 | 保留 | 25 | 0 | 1 | 4 | 1 | 1 | 0 | 1 `EllipseProvider.create` |
| `src/domain/shape/provider/GroupProvider.ts` | 内核 | 保留 | 13 | 0 | 1 | 4 | 1 | 1 | 0 | 1 `GroupProvider.create` |
| `src/domain/shape/provider/LineProvider.ts` | 内核 | 保留 | 25 | 0 | 1 | 4 | 1 | 1 | 0 | 1 `LineProvider.create` |
| `src/domain/shape/provider/RectProvider.ts` | 内核 | 保留 | 25 | 0 | 1 | 4 | 1 | 1 | 0 | 1 `RectProvider.create` |
| `src/domain/shape/provider/ShapeProvider.ts` | 内核 | 保留 | 19 | 0 | 11 | 7 | 2 | 4 | 0 | 2 `ShapeProvider.readNumber` |
| `src/domain/shape/provider/TextProvider.ts` | 内核 | 保留 | 17 | 0 | 1 | 5 | 1 | 2 | 0 | 2 `TextProvider.create` |
| `src/domain/shape/RectShape.ts` | 内核 | 保留 | 77 | 0 | 1 | 14 | 13 | 17 | 0 | 5 `RectShape.setGeometryAttribute` |
| `src/domain/shape/Shape.ts` | 内核 | 保留 | 195 | 0 | 39 | 43 | 27 | 54 | 0 | 9 `Shape.attributeValue` |
| `src/domain/shape/ShapeFactory.ts` | 内核 | 保留 | 59 | 0 | 8 | 8 | 7 | 11 | 0 | 2 `ShapeFactory.constructor` |
| `src/domain/shape/ShapeInit.ts` | 内核 | 保留 | 4 | 0 | 1 | 0 | 0 | 0 | 0 | — |
| `src/domain/shape/TextShape.ts` | 内核 | 保留 | 75 | 0 | 4 | 17 | 16 | 20 | 0 | 3 `TextShape.setGeometryAttribute` |
| `src/domain/SvgDocument.ts` | 内核 | 保留 | 54 | 0 | 9 | 11 | 9 | 15 | 0 | 6 `SvgDocument.locateIn` |
| `src/io/IdAllocator.ts` | 内核 | 保留 | 28 | 0 | 5 | 5 | 3 | 8 | 0 | 4 `IdAllocator.allocate` |
| `src/io/NodeFileStore.ts` | 内核 | 保留 | 19 | 0 | 1 | 2 | 2 | 4 | 0 | 2 `NodeFileStore.readText` |
| `src/io/SvgReader.ts` | 内核 | 保留 | 150 | 0 | 12 | 16 | 7 | 44 | 0 | 16 `SvgReader.readElement` |
| `src/io/SvgWriter.ts` | 内核 | 保留 | 56 | 0 | 5 | 6 | 2 | 9 | 0 | 6 `SvgWriter.renderShape` |
| `src/io/xml/XmlNode.ts` | 内核 | 保留 | 60 | 0 | 5 | 14 | 10 | 17 | 0 | 3 `XmlNode.attribute` |
| `src/io/xml/XmlParser.ts` | 内核 | 保留 | 212 | 0 | 6 | 16 | 9 | 73 | 0 | 23 `XmlParser.parseTag` |
| `src/io/xml/XmlWriter.ts` | 内核 | 保留 | 29 | 0 | 1 | 6 | 7 | 9 | 0 | 2 `XmlWriter.openTag` |
| `src/ports/FileStore.ts` | 内核 | 保留 | 4 | 0 | 7 | 1 | 0 | 0 | 0 | — |
| `src/ports/SvgDecoder.ts` | 内核 | 保留 | 8 | 0 | 2 | 2 | 0 | 0 | 0 | — |
| `src/ports/SvgEncoder.ts` | 内核 | 保留 | 4 | 0 | 1 | 1 | 0 | 0 | 0 | — |
| `src/main.ts` | 装配处 | 保留 | 33 | 0 | 4 | 4 | 2 | 4 | 0 | 3 `main` |

### 6.2 测试与 fixtures

| 文件 | 状态 | 代码行 | 代码行增量 | 函数数 | CC（参考） |
|---|---|---|---:|---:|---:|
| `test/app/session.test.ts` | 保留 | 128 | 0 | 13 | 18 |
| `test/architecture.test.ts` | 保留 | 146 | 0 | 8 | 38 |
| `test/cli/registry.test.ts` | 保留 | 35 | 0 | 3 | 5 |
| `test/cli/repl.test.ts` | 保留 | 47 | 0 | 5 | 6 |
| `test/cli/robustness.test.ts` | 保留 | 61 | 0 | 2 | 2 |
| `test/cli/transcript.test.ts` | 保留 | 200 | 0 | 5 | 5 |
| `test/commands/commands.test.ts` | 保留 | 267 | 0 | 15 | 16 |
| `test/commands/history.test.ts` | 保留 | 50 | 0 | 5 | 6 |
| `test/domain/factory.test.ts` | 保留 | 68 | 0 | 5 | 6 |
| `test/domain/shapes.test.ts` | 保留 | 106 | 0 | 8 | 9 |
| `test/io/svg.test.ts` | 保留 | 145 | 0 | 11 | 12 |
| `test/support/BufferOutput.ts` | 保留 | 13 | 0 | 3 | 3 |
| `test/support/CliHarness.ts` | 保留 | 29 | 0 | 3 | 4 |
| `test/support/CommandHarness.ts` | 保留 | 42 | 0 | 7 | 9 |

### 6.3 VSCode 扩展

（该 ref 下没有 `vscode-extension/` 的 TS 文件）

## 7. 方法与局限（摘要）

1. **数据源**：只读 git 历史（`git ls-tree -r --name-only <ref>` 枚举，`git show <ref>:<path>` 取内容）。工作区里改了一半的文件、未跟踪文件都不会影响对比。
2. **行数**：代码行 = 非空、非注释行；注释行、空行、物理行另列。注释区间来自词法扫描（`//`、`/* */`），不做启发式猜测。
3. **CC 算法**：先做词法扫描（跳过注释、字符串、模板串文本、正则字面量；模板串 `${}` 内部照常扫描），再逐函数累加决策点：`if`、`for`、`while`、`do`、`case`、`catch`、`&&`、`||`、`??`、三元 `? :`；`else`/`default`/`try` 不加点，`else if` 只由其中的 `if` 计一次，`do{}while()` 的收尾 `while` 不重复计点。函数基础值 1。
4. **函数界定**：以带块体的函数/方法/构造器/箭头函数为界（`function f(){…}`、`class C { m(){…} }`、`m(): T[] {…}`、`const f = () => {…}` 都能识别）；顶层代码若含决策点，计为一条 `<模块顶层>` 记录。
5. **估算值**：这是词法级近似（不做 TS 语法分析）；箭头函数的简写体（`x => a || b`，无花括号）的决策点归入外层函数。用途是趋势与增量对比，不适合当绝对质量门限。
6. **幂等**：产物不含时间戳；同一对 ref 重复生成得到字节相同的文件。

机器可读的同源数据见 [report.json](./report.json)；口径细节、复现命令、为什么排除 VSCode 扩展与测试见 [README.md](./README.md)；逐文件职责见 [files.md](./files.md)。
