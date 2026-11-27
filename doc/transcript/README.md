# 会话回放与验收证据（阶段 2）

本目录的文件全部是**可执行的输出契约**：输入只含命令与注释，期望输出由
`tools/verify-phase2.mjs` 现场比对（`--update` 只用于重新生成期望值）。

| 文件 | 内容 |
|---|---|
| `cli-1.txt` / `cli-1.expected` | 需求 §6 的基础会话（阶段 1 原样），启用全部可选插件时的输出 |
| `cli-1.baseline.expected` | 同一输入在 **tag `final`** 的代码上跑出的输出（阶段 1 冻结基线） |
| `box.txt` / `box.expected` | `box` 复合图形会话：`tree`（`(box)` + `modified-star` 并存）、`stats`、`set fill`/`set label`、`undo`/`redo`、`move`、`save` |
| `commands.txt` / `commands.expected` | 新增命令会话：`stats`（按类型计数）、`dir`（固定工作目录） |
| `dir-workdir/` | `dir` 用的**内容固定的工作目录夹具**（两个子目录 + 两个文件） |
| `plugins-none.config.json` | 配置装配下的"禁用全部可选插件"入口，用于阶段 1 兼容性对照 |

## 手工回放

```bash
# 默认（代码装配；含全部可选插件）
npm run cli --silent < doc/transcript/cli-1.txt
npm run cli --silent < doc/transcript/box.txt

# 配置装配（同一份清单写在 plugins.config.json）
npm run cli --silent -- --config plugins.config.json < doc/transcript/cli-1.txt

# 禁用全部可选插件（与 tag final 的输出逐字节一致）
npm run cli --silent -- --config doc/transcript/plugins-none.config.json < doc/transcript/cli-1.txt

# dir 会话需要在夹具目录里跑（日志写到目录之外，避免影响列表）
tmp=$(mktemp -d) && cp -r doc/transcript/dir-workdir "$tmp/workdir" && mkdir "$tmp/logs"
(cd "$tmp/workdir" && "$OLDPWD/node_modules/.bin/tsx" "$OLDPWD/src/main.ts" < "$OLDPWD/doc/transcript/commands.txt")
```

## 一键验收

```bash
node tools/verify-phase2.mjs
```

脚本会跑：阶段 1 兼容性（含用 tag `final` 现场重放核对基线）、双装配逐字节一致、
`dir` 固定目录与"目录未被修改"、两条演示分支的 OCP 判据、加载器独立性静态检查、指标脚本。
