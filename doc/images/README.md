# Part A 截图（A.1 文件标记 / A.2 原生大纲）

本目录存放 VSCode 扩展的**真机截图**，对应需求第一部分的两张效果图。

| 文件 | 对应 | 画面内容 | 拍摄环境 |
|---|---|---|---|
| `vscode-badge.png` | 图 A.1 | `examples/` 下 `box.svg`、`demo.svg`、`flowchart.svg`、`other.svg` 右侧各有 `[]` 徽标；同目录的 `transcript-6.txt`、`transcript-61.txt` 与各文件夹**没有**徽标；文件名与内容都没被改动。右侧同时打开 `flowchart.svg`，大纲选中 `text#start-label`，编辑器高亮第 6 行。 | macOS 本地 VSCode，打开 OrbStack 虚拟机共享目录中的本仓库；`svg-marker-outline.vsix` 装在**本地**扩展宿主 |
| `vscode-outline.png` | 图 A.2 | `vscode-extension/sample/nested.svg` 的原生「大纲」：`svg → title / defs → linearGradient#sky → stop, stop / g#layer1 → rect#bg / g（无 id）/ g#labels → text#caption / text（无 id） / rect`；选中 `circle#sun` 时编辑器定位到对应源码行。 | 同上 |

两张图共同说明需求强调的四件事：

- 徽标是**视图装饰**：只出现在 Explorer 行尾，文件名与文件内容都不变；
- **目录不加标记**：`examples/` 下的子目录没有徽标（与图 A.1 对照）；
- 大纲按**真实嵌套层级**展开，且**无 id 元素只显示标签名**（`g`、`text`），不臆造 id；
- `<title>`、`<defs>`、`<linearGradient>`、`<stop>` 这类**非图形元素**照样进大纲（Phase 1 的模型不建这些节点）。

## 补充：无 GUI 环境下的等价证据

本仓库的开发容器（Linux）没有 `code` CLI、Xvfb 与浏览器运行库，**无法启动 Extension Development Host**，
因此当时**没有伪造截图**，而是先用真实扩展代码生成两份可复现的文本证据：

- [`doc/evidence/vscode-badge.txt`](../evidence/vscode-badge.txt)：徽标决策表（哪些 Uri 得到 `[]`、哪些连 `stat` 都不发、两段式刷新次数、Remote scheme 同样生效）；
- [`doc/evidence/vscode-outline.txt`](../evidence/vscode-outline.txt)：`DocumentSymbol` 的层级与 `range`/`selectionRange`、XML 不完整时清空而非崩溃、改名后重新询问即更新。

两份文本由 `vscode-extension/tools/evidence.ts` 用**真实扩展代码**生成（`cd vscode-extension && npm run evidence`），
验收脚本 E2 项会重新生成并逐字节核对，因此不能手改。扩展本身的 39 个用例、`npm run build` 与 VSIX 打包在无 GUI 环境下同样可验证
（VSCode API 由 `vscode-extension/test/support/FakeVscode.ts` 充当）。

## 复现步骤（拍同款）

```bash
cd vscode-extension
npm install
npm run package                      # 产出 svg-marker-outline.vsix（7 文件 / 12.6KB，纯 JS）
```

VSCode 里：Extensions → `…` → **Install from VSIX…** 选 `svg-marker-outline.vsix` → `Developer: Reload Window`。
打开含 `.svg` 的文件夹即出现 `[]`；把 `.svg` 以**文本编辑器**打开（不是图片预览），左侧「大纲」即出现层级树。

> 远端窗口注意：徽标由 UI 侧装饰提供、本地装了也看得见，但**大纲必须由文件所在那一侧的扩展宿主提供**——
> Remote/Dev Container 场景要把 VSIX 装到远端。本目录的两张截图是本地窗口拍的。
