# 截图（待用户补拍）

本目录用于存放 Part A（VSCode 扩展）的**真机截图**。

| 文件 | 内容 | 拍摄方式 |
|---|---|---|
| `vscode-badge.png` | Explorer 中 `.svg` 文件旁的 `[]` 徽标；同时含一个**名字以 `.svg` 结尾的目录**与一个 `.md` 文件作"无标记"对照 | 安装 VSIX 后打开任意含 SVG 的文件夹，截图资源管理器 |
| `vscode-outline.png` | 打开 `.svg` 后左侧原生「大纲」面板的层级树，并展示点击某节点后光标落在起始标签上 | 同上，展开大纲面板后截图 |

为什么是空的：本工程的开发环境没有 `code` CLI / Xvfb / 图形会话，无法启动 Extension Development Host，
因此**没有伪造截图**。截图之外的**等价证据**已经提交：

- [`doc/evidence/vscode-badge.txt`](../evidence/vscode-badge.txt)：徽标决策表（哪些 Uri 得到 `[]`、哪些连 `stat` 都不发、两段式刷新次数）；
- [`doc/evidence/vscode-outline.txt`](../evidence/vscode-outline.txt)：`DocumentSymbol` 的层级与 `range`/`selectionRange`、XML 不完整时清空而非崩溃。

两份文本由 `vscode-extension/tools/evidence.ts` 用**真实扩展代码**生成（`cd vscode-extension && npm run evidence`），
验收脚本 E2 项会重新生成并逐字节核对，因此不能手改。扩展本身的 39 个用例、`npm run build` 与 VSIX 打包均在无 GUI 环境下可验证
（VSCode API 由 `vscode-extension/test/support/FakeVscode.ts` 充当）。

拍摄步骤：

```bash
cd vscode-extension
npm install && npm run package          # 产出 svg-marker-outline.vsix
# 本地：code --install-extension svg-marker-outline.vsix
# Remote：在远端窗口里执行同一条命令（Remote-SSH 场景要装在远端）
```

装好后重载窗口（`Developer: Reload Window`），打开 `vscode-extension/sample/nested.svg` 即可看到大纲。
