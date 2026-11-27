# SVG Marker & Outline（阶段 2 第一部分）

一个独立的 VSCode 扩展子包（不属于根 CLI 包，不参与根 `npm test`）：

| 功能 | 需求 | 实现位置 |
|---|---|---|
| Explorer 中给 `.svg` 文件加 `[]` 徽标 | A.1 | `src/decoration/SvgFileDecorationProvider.ts` + `SvgDecorationJudge.ts` + `DecorationMark.ts` |
| 原生 Outline（大纲）展示 SVG 元素树，`标签名#id`，可点击定位，随编辑更新 | A.2 | `src/outline/SvgOutlineProvider.ts` + `OutlineParser.ts` + `OutlineElement.ts` + `LineIndex.ts` |
| 注册进 VSCode（`activate`） | A.1/A.2 | `src/extension.ts` → `src/app/ExtensionBootstrap.ts` → `src/vscode/VscodeBinding.ts` |
| 示例 SVG | A.3 | `sample/nested.svg` |

行为要点：

* 徽标只有 `.svg` **文件**有；目录（包括名字以 `.svg` 结尾的目录）没有，非 SVG 文件也没有。
* 大纲节点显示 `标签名#id`，没有 `id` 时只显示 `标签名`；`range` 覆盖整个元素，`selectionRange` 只覆盖起始标签，所以点击节点会把光标放在 `<g id="layer1">` 上。
* 编辑到一半（标签未闭合、属性引号没写完）时**大纲暂时为空**，扩展不会报错，也不会弹异常；补全后大纲立即恢复。
* 不修改文件名、文件内容，也不要求图形预览或完整 SVG 校验。

## 安装与启动

前置：Node ≥ 18、VSCode ≥ 1.75（`FileDecoration.badge` 需要 1.75 之前的 1.61+，本包 `engines.vscode` 定在 `^1.75.0`）。

```bash
cd vscode-extension
npm install          # 只装 devDependencies（typescript / tsx / @types/vscode / esbuild / @vscode/vsce）
npm run typecheck    # tsc --noEmit（strict）
npm test             # node --import tsx --test "test/**/*.test.ts"
npm run build        # esbuild 打包成 dist/extension.js（vscode 作为 external）
```

### 方式一：F5 调试（改代码立刻看到效果）

1. 用 VSCode **打开 `vscode-extension/` 目录本身**作为工作区（`File > Open Folder…`）；
2. `npm install && npm run build`；
3. 按 `F5`（`.vscode/launch.json` 里已有 `extensionHost` 配置，`preLaunchTask` 会先跑 `npm: build`）；
4. 弹出的 **Extension Development Host** 窗口会打开 `sample/` 目录：
   * Explorer 里 `nested.svg` 右侧出现 `[]` 徽标；
   * 双击打开 `nested.svg`，左侧 **资源管理器面板下方的「大纲 / Outline」** 显示 `svg → g#layer1 → rect#bg / g / g#labels …`；
   * 点大纲里的节点 → 光标跳到对应标签；改一处标签（例如加一个 `<g id="new">`）→ 大纲立刻更新。

### 方式二：打包成 VSIX 安装

```bash
cd vscode-extension
npm run package      # = npm run build && vsce package --no-dependencies --out svg-marker-outline.vsix
code --install-extension svg-marker-outline.vsix
```

装完重载窗口（`Developer: Reload Window`）即可。命令行不可用时，也可以在 VSCode 的 Extensions 视图右上角 `…` → `Install from VSIX…`。

### 方式三：Remote-SSH / Dev Container（远端窗口）

扩展的 **文件装饰 Provider 与文档符号 Provider 都跑在"扩展宿主"进程里**，而 Remote 场景下扩展宿主在**远端**。所以：

* 用 UI 安装：在远端窗口的 Extensions 视图里安装，VSCode 会自动装到远端（按钮上显示 `Install in SSH: <host>`）；
* 用 VSIX 安装：VSIX 必须在**远端**安装，命令要在远端执行（远端窗口里的集成终端，或 `code --remote ssh-remote+<host> --install-extension svg-marker-outline.vsix`）；
* 只在本地安装**不会**生效：本地扩展宿主看不到远端工作区的文件，`workspace.fs.stat` 也探测不到。

本包的大纲选择器故意写成 `{ pattern: '**/*.svg' }`（不带 `scheme: 'file'`）：远端窗口里文件 Uri 的 scheme 是 `vscode-remote`，写死 `file` 会让大纲在远端失效。

## 目录结构

```
vscode-extension/
├── package.json            # 扩展清单：main / activationEvents / scripts
├── tsconfig.json           # strict，module: CommonJS（VSCode 扩展宿主用 require 加载）
├── .vscode/launch.json     # F5 调试配置
├── sample/nested.svg       # 示例 SVG（嵌套 g、带 id 与不带 id 的元素、defs/title）
├── src/
│   ├── extension.ts        # activate/deactivate：装配 + 注册，注册项进 context.subscriptions
│   ├── app/ExtensionBootstrap.ts      # 组合根：造两个 Provider 并注册（只依赖端口）
│   ├── ports/VscodeLike.ts            # 最小 VSCode 外观（测试注入假实现）
│   ├── ports/FileKindProbe.ts         # 文件类型探测端口
│   ├── vscode/VscodeBinding.ts        # VscodeLike 的唯一真实实现（全包唯一 import vscode 的地方）
│   ├── outline/OutlineParser.ts       # 容错扫描器：产出带源码偏移的元素树
│   ├── outline/OutlineElement.ts      # 大纲节点（name/id/两段偏移/子节点/label()）
│   ├── outline/LineIndex.ts           # 偏移 → (行, 列)
│   ├── outline/SvgOutlineProvider.ts  # DocumentSymbol[]（层级用 children）
│   ├── decoration/DecorationMark.ts        # 徽标值对象（badge = '[]'）
│   ├── decoration/SvgDecorationJudge.ts    # 判定 + 缓存 + 异步探测 + 刷新通知
│   ├── decoration/FacadeFileKindProbe.ts   # FileType 位标志 → file/directory/unknown
│   └── decoration/SvgFileDecorationProvider.ts
└── test/                   # Node 内置 test runner + tsx
    ├── outlineParser.test.ts    # 嵌套分组、无 id、偏移、不完整 XML
    ├── outlineProvider.test.ts  # 层级/定位/编辑更新/兜底
    ├── decoration.test.ts       # 非 SVG、目录、大小写、Remote、失败、缓存、刷新
    ├── activation.test.ts       # 注册了什么、选择器、dispose、端到端
    └── support/FakeVscode.ts    # 假外观 / 假 Uri / 假文档 / 可控探测
```

## 已知限制（都有代码注释与文档记录）

| 限制 | 原因 | 处理 |
|---|---|---|
| 徽标最多 2 字符 | `FileDecoration.badge` 的硬限制 | 用 `[]`（需求的字面形式，正好 2 字符） |
| 首次看到某个 `.svg` 时可能晚一拍才出现徽标 | `provideFileDecoration` 同步，而"是不是目录"只能异步 `stat` | 探测完成后经 `onDidChangeFileDecorations` 刷新一次（`SvgDecorationJudge`） |
| 文件被删/改名后旧缓存不会自动失效 | 缓存只按 `uri.toString()` 记 | 重新加载窗口或重新打开文件夹即可；标记本身无害 |
| XML 不完整时大纲清空 | 需求允许；半截树上的定位可能错乱 | `OutlineParser` 返回空数组而不是抛错 |
| 不校验 SVG 规范 | 大纲只表达"文件里有什么元素" | 未知元素（`defs`/`path`/自定义标签）照样显示 |
| 不用 `.svg` 语言 id 选择文档 | `.svg` 可能被识别成 xml/plaintext | 选择器只按 `**/*.svg` 路径匹配 |
