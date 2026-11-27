# 指标产物（metrics）：口径、复现与声明

本目录是阶段 2 需求里 **`docs/metrics/`** 的交付物，回答三个问题：

1. 阶段 2 的重构把代码**分到哪几层**（内核 / 装配处 / 插件），每层多大规模？
2. 重构（`final` → `p2`）**带来了多少圈复杂度增量**，加在哪些文件上？
3. 这些数字**怎么算出来的、怎么复查**——而不是手填的一串数。

| 文件 | 性质 | 内容 |
|---|---|---|
| `report.mjs`（在 `tools/metrics/`） | 脚本（唯一数据源） | 从 git 历史算行数 / 圈复杂度，生成后两个文件 |
| [`report.md`](./report.md) | **脚本生成，不得手改** | 人读的对照表：三类行数、文件数、CC 总量与增量、Top-10 变化文件、测试与 VSCode 单列 |
| [`report.json`](./report.json) | **脚本生成，不得手改** | 机器可读的同源数据（含逐文件明细），供复查/二次统计 |
| [`files.md`](./files.md) | 人工维护 | 逐文件一句话职责 + 所属类别；阶段 2 新增目录留空待补 |

## 1. 声明：数字由脚本生成，不接受手填

`report.md` / `report.json` 里的每一个数字都由 `tools/metrics/report.mjs` 从 **git 历史**算出：

```bash
node tools/metrics/report.mjs --from final --to p2     # 或用 npm run metrics -- --from final --to p2
```

- 脚本**不读工作区**：文件清单来自 `git ls-tree -r --name-only <ref>`，文件内容来自 `git show <ref>:<path>`。
  因此未提交改动、未跟踪文件、别人的本地实验都不会污染对比结果。
- 产物里**不写时间戳**：同一对 ref 重复生成得到字节相同的文件（幂等）。可复查性由产物里记录的
  ref 名 + tag/commit 对象 sha 保证，而不是由「什么时候生成的」保证。
- 三类行数、CC 总量与增量的口径固定在脚本里（`CATEGORY_DEFS` + 词法扫描规则），
  `report.md` 也会把同样的规则表打印出来，审阅者可直接对照核对。

## 2. 目录 / 分类口径（CLI 范围）

「CLI 范围」= 本项目 CLI 源码，**排除** VSCode 扩展、测试与 fixtures、依赖包、构建产物。

| 类别 | 命中路径前缀 | 归类理由 |
|---|---|---|
| **内核** | `src/domain/`、`src/commands/`、`src/ports/`、`src/io/`、`src/app/`、`src/cli/`、`src/plugin-api/` | 不依赖具体装配方式的业务/技术内核；`plugin-api` 放的是扩展点接口，插件只实现它，接口本身属于内核一侧 |
| **装配处** | `src/host/`、`src/main.ts`、`plugins.config.json` | 只决定「把谁装给谁」，不含业务规则；插件加载器同样属于装配职责 |
| **插件** | `src/builtin/`、`plugins/` | 可被装卸的扩展单元（内置图形/命令也走插件形式注册）；阶段 1 没有这些目录，自然为空 |
| 未分类（兜底） | 其余 CLI 范围 TS 文件 | 兜底行：一旦非 0，说明出现了未登记目录，需要把它登记进某一类 |

阶段 1（tag `final` / 提交 `5e7e7cb`）没有 `plugin-api` / `host` / `builtin` / `plugins`，
所以「装配处」只有 `src/main.ts` 一个文件、「插件」为 0——这是**规则按 ref 自适应**的正常结果，不是漏算。

`plugins.config.json` 属于装配处，但它是 JSON 配置而非 `*.ts`，按口径**不计行数/CC**（`report.md` 会注明它的存在）。

## 3. 行数口径

- **代码行（主指标）= 非空、非注释行**。行内既有代码又有行尾注释时，算代码行（注释不重复计行）。
- **注释行**（整行只有注释）、**空行**、**物理行**（`wc -l` 口径）**另列**，不参与增量结论。
- 注释区间由词法扫描得到（`//`、`/* */`），不是用正则逐行猜的；所以 `"a // b"` 这类字符串里的 `//`、
  模板串里的文本不会被误判成注释。
- 多行模板串/字符串的内容行记为代码行（它们是程序里的字面量，不是注释）。

## 4. 圈复杂度（CC）口径

**逐文件、逐函数**统计，最终汇总到分区与总量。函数归界如下：

1. 先做词法扫描：跳过注释、字符串、模板串文本、正则字面量（模板串 `${ ... }` 内部是代码，照常扫描）；
2. 决策点逐个计数：`if`、`for`、`while`、`do`、`case`、`catch`、`&&`、`||`、`??`、三元 `? :`；
3. `else`、`default`、`try`、`finally` 本身**不**加点；`else if` 只由其中的 `if` 计一次；
   `do { … } while (…)` 的收尾 `while` 不重复计点；复合赋值 `&&=` / `||=` / `??=` 不算分支；
4. **函数基础值 1** → 函数 CC = 1 + 决策点数；
5. 文件 CC = 各函数 CC 之和；顶层代码若含决策点，计为一条 `<模块顶层>` 记录；
6. 分区 CC = Σ 文件 CC；总量 = Σ 三个分区。

输出口径：每文件给出 CC 总量、最高单函数 CC（含函数名与文件），以及每个分区的
`final` 值、目标 ref 值、增量；`report.md` 另有「变化最大的 10 个文件」。

**这是估算值，不是 MCCabe 工具链的精确输出。** 它基于词法而非 TS 语法树，已知近似：

- 箭头函数的**简写体**（`x => a || b`，无花括号）没有独立函数体，其决策点归入外层函数；
  带块体的箭头函数（`x => { … }`）正常独立计算。
- 返回类型是对象类型字面量的函数（`f(): { a: string } { … }`，极罕见）会被当成块而非函数体。
- 表达式位置上的 `?` 用上下文启发式判定三元（已排除 `?.`、`a?: T`、`foo?()` 等形态），
  极端写法仍可能个别偏差。

因此它适合**趋势与增量对比**（重构前后谁涨谁降），不适合当绝对质量门限。

## 5. 排除项（为什么排除）

| 排除对象 | 原因 |
|---|---|
| `node_modules/` | 第三方依赖，不是本项目的代码 |
| `dist/` | 构建产物，由 `src/` 编译而来，计入会重复计数 |
| **`vscode-extension/`** | **单独一节**：它是 CLI 之外另一个交付物，有自己的打包与依赖；混进 CLI 增量会掩盖真正的重构收益，因此只列数字、不进 CLI 三类与任何 CLI 增量 |
| **`test/`、任意层级 `test/`·`tests/` 目录、`*.test.ts`、`*.spec.ts`（含 `plugins/*/test/`）** | **单独一行**：测试衡量的是「测试量」，不是交付源码的规模；混进三类会让「内核膨胀」之类的结论失真 |
| 非 `*.ts` 文件 | 本指标只统计 TS 源码（`tools/metrics/report.mjs` 自身是 `.mjs`，`plugins.config.json` 是 JSON，都不计） |
| 二进制文件、子模块 | `git show` 取不到文本内容，脚本会跳过并在 `report.md` / `report.json` 里记录跳过个数 |

VSCode 扩展与测试**都只列「文件数 / 代码行 / CC（参考）」**，明确标注「不计入 CLI 增量」。

## 6. 如何复现

前置：Node.js ≥ 20（开发环境 v24），本脚本零第三方依赖，**不需要联网安装任何东西**。

```bash
# 1) 默认：final → HEAD（阶段 2 的 p2 tag 还不存在时用这个）
node tools/metrics/report.mjs

# 2) 阶段 2 打 tag 之后：final → p2（正式产物）
node tools/metrics/report.mjs --from final --to p2
npm run metrics -- --from final --to p2        # 等价的 npm script

# 3) 想看别的基线：任意 ref 都行（分支、tag、commit sha）
node tools/metrics/report.mjs --from final --to main

# 4) 口径自检（不读仓库，纯词法/CC 用例）
node tools/metrics/report.mjs --selftest

# 5) 幂等自检：连跑两次，产物应字节相同
node tools/metrics/report.mjs --from final --to HEAD
sha256sum docs/metrics/report.md docs/metrics/report.json
node tools/metrics/report.mjs --from final --to HEAD
sha256sum docs/metrics/report.md docs/metrics/report.json
```

参数与退出码：

| 参数 | 默认 | 说明 |
|---|---|---|
| `--from <ref>` | `final` | 基线 ref |
| `--to <ref>` | `HEAD` | 目标 ref（阶段 2 完成后用 `p2`） |
| `--out-dir <dir>` | `docs/metrics` | 产物目录 |
| `--selftest` | — | 只跑内置用例 |
| `--help` | — | 帮助 |

退出码：`0` 成功；`1` 自检失败；`2` 参数错误 / 不是 git 仓库 / ref 解析不到。
ref 不存在时会打印可用 ref 提示并以 `2` 退出（不会写出半成品产物）。

## 7. 审阅时怎么核对

1. 打开 `report.md` 第 2 节：分类规则表 + 三类行数/CC 对照表（`final` 与目标 ref 两端都在，增量可手算验证）。
2. 打开 `report.json`：`files[]` 里每个文件都有 `codeLines` / `commentLines` / `blankLines` / `cc` / `maxFn`，
   可与第 6 节表格逐行对账；`method` 字段把口径（分类前缀、CC 决策点、排除项）机器可读地写清楚了。
3. 任意抽一个文件复核 CC：`node tools/metrics/report.mjs --selftest` 覆盖了
   `if/else if`、`switch/case`、`do-while`、`catch`、字符串/注释/正则/模板串里的假决策点、可选链与三元、除法与正则歧义、
   返回类型标注、类字段箭头函数、顶层伪函数等 19 个用例。
