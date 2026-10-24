# SVG 编辑器 CLI（Lab1 Phase 1）

软件设计课程项目第一阶段：一个用 **TypeScript + 面向对象** 编写的 SVG 编辑器命令行工具。设计文档见 [`doc/README.md`](doc/README.md)（架构方案 / 过程记录 / 一致性自查 / 质量保证手段）。

## 快速开始

```bash
npm install          # 仅安装开发依赖（工程零运行时依赖）
npm run cli          # 启动 REPL，提示符 svg>
```

```text
svg-editor 0.1 — type 'help' for commands

svg> init 800 600
canvas 800x600 created
svg> create rect bg 0 0 800 600 #ffffff
rect#bg created
svg> create circle c1 100 100 20 red
circle#c1 created
svg> tree
svg (800x600)
├── rect#bg    x=0 y=0 w=800 h=600 fill=#ffffff
└── circle#c1  cx=100 cy=100 r=20 fill=red
svg> save demo.svg
saved to demo.svg (2 elements)
```

`save` 产出的 `.svg` 可直接用浏览器或 VSCode 的 "SVG Preview" 扩展打开预览。

## 常用脚本

| 命令 | 作用 |
|---|---|
| `npm run cli` | 以 tsx 直接运行 TypeScript 源码（开发/演示用） |
| `npm run build` | 编译到 `dist/` |
| `npm start` | 运行编译产物 |
| `npm test` | 运行全部单元测试与端到端 transcript 测试 |
| `npm run typecheck` | 严格模式类型检查 |

## 目录

```text
doc/                 设计文档、架构图（PlantUML 源 + 渲染版）
src/
  domain/            领域模型（图形树、几何语义、类型工厂），零外部依赖
  commands/          编辑命令（Command 模式）与 undo/redo 历史
  ports/             FileStore / SvgDecoder / SvgEncoder 抽象接口
  io/                SVG 读写、最小 XML 解析、Node fs 适配
  app/               EditorSession 用例门面
  cli/               REPL、命令注册表、tree/show/help 展示器
  main.ts            组合根（唯一装配处）
test/                单元测试、transcript 端到端测试、依赖方向守护测试
```

## 环境

* Node.js ≥ 20（开发环境为 v24）。
* 零运行时依赖；开发依赖仅 `typescript`、`tsx`、`@types/node`。
* 工程内 `.npmrc` 把 npm cache/logs 指向项目目录（`.npm-cache/`、`.npm-logs/`，已 gitignore），便于在受限环境中直接 `npm install`。
