# ADR-4：插件清单（`contributes`）的校验时机与失败回滚

- **状态**：已采纳（阶段 2）
- **相关代码**：`src/plugin-api/ContributionDeclarations.ts`、`src/plugin-api/ContributionRegistry.ts`、`src/host/PluginActivation.ts`、`src/host/PluginModuleResolver.ts`、`src/host/ConfigAssembly.ts`
- **相关测试**：`test/plugin/registry.test.ts`、`test/plugin/loader.test.ts`

## 背景

需求要求：`package.json` 的 `contributes` 与插件实际注册的类别/名字集合必须一致；不一致、
重复注册或 `activate` 抛错时都要打印规定文案、**撤销该插件的全部暂存注册**并继续启动。
关键问题是**校验放在哪一步**——如果一边注册一边合并进内核，失败时就会留下半个插件。

## 决策

采用"**暂存区 + 一次性提交**"：

1. 加载器/装配处为每个插件开一个 `PluginStaging`（实现 `PluginContext`），所有 `register*` 只写暂存区；
   注册时就地做**契约校验**（必需成员、非空名字、函数类型）与**插件内查重**。
2. `ContributionRegistry.commit(staging)` 依次做三件事，任一失败即整体不生效：
   - 跨插件查重（`shapes/commands/decorators/attributes` 四类名字都全局唯一）→
     `error: duplicate registration: <category>/<name>`；
   - 清单比对（声明的类别-名字集合 vs 暂存区实际注册）→
     `error: plugin manifest mismatch: <name> (declared: …, registered: …)`；
   - 全部通过后才真正合并，并把插件名记入 `loadedPlugins()`。
3. `activate` 抛错或上面任一步失败 → `discard(staging)`（暂存区从未并入，丢弃引用即可），
   已成功的插件不受影响，后续插件继续加载。

清单缺省（`contributes` 为空）表示"**不声明任何扩展**"，而不是"跳过校验"：注册了东西就是不一致。
只有"**没有清单**"（代码装配里的测试替身、`contributes` 字段不存在且模块也未提供）才跳过比对——
这一点由 `beginPlugin(name, null)` 与 `beginPlugin(name, declarations)` 的区别表达。

## 后果

- 失败插件零残留，天然满足"加载失败不影响已成功插件"；测试用 `throws` 夹具验证
  "先注册一个标签再抛错"后注册表里什么都没有。
- 清单校验发生在 **commit 时**而不是加载时：插件可以先注册再被统一比对，
  因此插件作者无法通过"先注册、后改清单"绕过校验。
- 代价：插件不能"注册一半、先让别的插件用"。本阶段不存在这种需求，且它会让回滚语义变复杂。
- 副作用（有意为之）：`activate` 期间的注册在内核里**不可见**，因此插件无法探测"我刚注册了什么"来
  动态决定后续注册；这保证了 `contributes` 必须是静态可声明的。

## 备选方案

| 方案 | 否决理由 |
|---|---|
| 边注册边合并，失败后按记录反向删除 | 删除路径要覆盖四类容器与"覆盖已有名字"的情形，容易漏；且失败瞬间内核已处于不一致状态（其他线程/命令可能看到半个插件）。 |
| 加载时（import 后）立即比对清单，再调 `activate` | 清单只能描述"打算注册什么"，无法校验"实际注册了什么"，等于没校验。 |
| 清单不一致时降级为"只保留清单里声明的部分" | 静默裁剪会让插件行为与作者意图不符，且无法在启动日志里解释清楚；需求要求报错。 |

## 验证

| 失败路径 | 期望输出 | 用例 |
|---|---|---|
| 模块找不到 | `error: plugin not found: <module>` | `配置装配：模块找不到 …` |
| 没有默认导出 | `error: plugin has no default export: <module>` | `配置装配：没有默认导出 …` |
| 清单与实际注册不一致 | `error: plugin manifest mismatch: <name> (declared: …, registered: …)` | `配置装配：清单声明与实际注册不一致 …` |
| `activate` 抛错 | `error: plugin failed to activate: <name> (<reason>)` | `配置装配：activate 抛错 …`（并断言暂存注册被撤销） |
| 重复注册 | `error: duplicate registration: <category>/<name>` | `配置装配：重复注册 …`、`注册表：跨插件重复注册拒绝后一个…` |
| 配置结构不合法 | `error: invalid plugin config`（继续以默认内置能力启动） | `配置装配：结构不合法 …` |
| 模块求值失败 | `error: plugin failed to activate: <module> (<reason>)`（不误报"模块找不到"） | `配置装配：模块存在但求值失败 …` |
