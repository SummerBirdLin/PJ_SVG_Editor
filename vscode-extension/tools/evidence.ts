/**
 * 无 GUI 环境下的"等价证据"生成器。
 *
 * 本机没有 `code` CLI / Xvfb，无法启动 Extension Development Host，因此**不伪造截图**。
 * 这个脚本用**真实扩展代码**（`ExtensionBootstrap` 注册的同一套 Provider）驱动一份假 VSCode 外观，
 * 把两件事以文本形式落盘，供人工在无 GUI 的情况下核对：
 *
 *   1. Explorer 徽标决策：哪些 Uri 会得到 `[]`、哪些不会、以及"为什么不去 stat"；
 *   2. 原生大纲的数据：`DocumentSymbol` 的层级、`range`/`selectionRange`（点击定位的依据）、
 *      以及"编辑到一半（XML 不完整）时大纲清空而不是崩溃"。
 *
 * 用法（在仓库根目录）：
 *   node_modules/.bin/tsx vscode-extension/tools/evidence.ts [--out-dir <dir>]
 * 产物：doc/evidence/vscode-badge.txt、doc/evidence/vscode-outline.txt
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ExtensionBootstrap } from '../src/app/ExtensionBootstrap';
import type { DocumentSymbolLike, RangeLike } from '../src/ports/VscodeLike';
import { FakeDocument, FakeUri, FakeVscode } from '../test/support/FakeVscode';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXT_ROOT = resolve(HERE, '..');
const REPO_ROOT = resolve(EXT_ROOT, '..');
const outDirFlag = process.argv.indexOf('--out-dir');
const OUT_DIR = outDirFlag >= 0 && process.argv[outDirFlag + 1] !== undefined
  ? resolve(process.argv[outDirFlag + 1])
  : join(REPO_ROOT, 'doc', 'evidence');

const HEADER = (title: string, how: string): string => `# ${title}

> 本文件由 \`${how}\` 生成，不是截图：本机没有 \`code\` CLI / Xvfb，无法启动 Extension Development Host。
> 界面截图（Explorer 的 \`[]\` 徽标、大纲面板）仍需在 VSCode Remote 里安装 VSIX 后拍摄，见 doc/images/README.md。
> 但下面每一行都是**真实扩展代码**跑出来的（同一个 \`ExtensionBootstrap\`、同一套 Provider），只是渲染结果被文本化。

`;

async function flush(): Promise<void> {
  for (let round = 0; round < 6; round += 1) {
    await new Promise<void>((resolveTick) => setImmediate(resolveTick));
  }
}

interface BadgeCase {
  readonly path: string;
  readonly type: 'file' | 'directory' | 'stat-fails';
  readonly comment: string;
}

const BADGE_CASES: readonly BadgeCase[] = [
  { path: '/work/diagram.svg', type: 'file', comment: '普通 SVG 文件 → 应加 []' },
  { path: '/work/picture.SVG', type: 'file', comment: '大写后缀也算 SVG（后缀判定不区分大小写）' },
  { path: '/work/notes.md', type: 'file', comment: '非 SVG → 不加标记，且**连 stat 都不发**' },
  { path: '/work/svg.json', type: 'file', comment: '名字里有 svg 但不是 .svg 后缀 → 不加标记' },
  { path: '/work/folder.svg', type: 'directory', comment: '名字以 .svg 结尾的**目录** → 不加标记（需求要求目录不加）' },
  { path: '/work/deleted.svg', type: 'stat-fails', comment: 'stat 失败（已删除/无权限）→ 不加标记，且不反复重试' },
  { path: '/remote/workspace/a.svg#vscode-remote', type: 'file', comment: 'Remote 窗口（scheme=vscode-remote）同样生效' },
];

async function collectBadgeEvidence(): Promise<string> {
  const vscode = new FakeVscode();
  new ExtensionBootstrap(vscode).activate();
  const provider = vscode.decorationProviders[0];
  if (provider === undefined) {
    throw new Error('没有注册文件装饰 Provider');
  }

  const lines: string[] = [HEADER('Explorer 徽标决策（A.1 等价证据）', 'node_modules/.bin/tsx vscode-extension/tools/evidence.ts')];
  lines.push('说明：`provideFileDecoration` 是**同步**接口，而"是不是目录"只能异步 `stat`，');
  lines.push('所以第一轮先答"没有"，探测完成后用 `onDidChangeFileDecorations` 让 VSCode 再来问一次。');
  lines.push('');
  lines.push('| Uri | 类型 | 第一轮（同步） | 刷新事件 | 第二轮（命中缓存） | 说明 |');
  lines.push('|---|---|---|---|---|---|');

  for (const testCase of BADGE_CASES) {
    const [pathPart, schemePart] = testCase.path.split('#');
    const uri = new FakeUri(pathPart ?? '', schemePart ?? 'file');
    if (testCase.type === 'file') {
      vscode.setFileType(uri.path, vscode.fileTypes.file);
    } else if (testCase.type === 'directory') {
      vscode.setFileType(uri.path, vscode.fileTypes.directory);
    }

    const refreshed: string[] = [];
    provider.subscribeChanged((changed) => refreshed.push(changed.path));

    const first = provider.provideFileDecoration(uri);
    await flush();
    const second = provider.provideFileDecoration(uri);

    lines.push(
      `| \`${schemePart === undefined ? '' : `${schemePart}://`}${pathPart ?? ''}\` `
      + `| ${testCase.type} `
      + `| ${first === undefined ? '（无）' : `\`${first.badge}\``} `
      + `| ${refreshed.length === 0 ? '—' : `${refreshed.length} 次`} `
      + `| ${second === undefined ? '（无）' : `\`${second.badge}\` / ${second.tooltip}`} `
      + `| ${testCase.comment} |`,
    );
  }

  lines.push('');
  lines.push(`实际发出的 stat 次数：**${String(vscode.statCalls.length)}**（路径：${vscode.statCalls.map((path) => `\`${path}\``).join('、') || '（无）'}）`);
  lines.push('');
  lines.push('结论：非 `.svg` 的 Uri 一次 stat 都没有发（后缀判定在探测之前），');
  lines.push('目录与 stat 失败的 Uri 只探测一次并被缓存，第二轮不会重复请求。');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function formatRange(range: RangeLike): string {
  return `[${range.start.line}:${range.start.character} → ${range.end.line}:${range.end.character}]`;
}

function renderSymbols(symbols: readonly DocumentSymbolLike[], depth = 0): string[] {
  const lines: string[] = [];
  for (const symbol of symbols) {
    const indent = '  '.repeat(depth);
    lines.push(
      `${indent}- ${symbol.name}  (kind=${String(symbol.kind)}, range=${formatRange(symbol.range)}, selection=${formatRange(symbol.selectionRange)})`,
    );
    lines.push(...renderSymbols(symbol.children, depth + 1));
  }
  return lines;
}

async function collectOutlineEvidence(): Promise<string> {
  const vscode = new FakeVscode();
  new ExtensionBootstrap(vscode).activate();
  const registration = vscode.symbolRegistrations[0];
  if (registration === undefined) {
    throw new Error('没有注册文档符号 Provider');
  }

  const sample = readFileSync(join(EXT_ROOT, 'sample', 'nested.svg'), 'utf8');
  const lines: string[] = [HEADER('原生大纲数据（A.2 等价证据）', 'node_modules/.bin/tsx vscode-extension/tools/evidence.ts')];

  lines.push(`文档选择器：\`${JSON.stringify(registration.selector)}\`（不写 scheme、不写 language，Remote 与 .svg 语言归属都不受影响）`);
  lines.push('');
  lines.push(`## 1. 正常文件：\`vscode-extension/sample/nested.svg\`（${String(sample.split('\n').length)} 行）`);
  lines.push('');
  lines.push('```text');
  const symbols = registration.provider.provideDocumentSymbols(new FakeDocument(new FakeUri('/work/sample/nested.svg'), sample));
  lines.push(...renderSymbols(symbols));
  lines.push('```');
  lines.push('');
  lines.push('`range` = 整个元素（编辑器里高亮的范围）；`selectionRange` = 起始标签（点击大纲时光标落在哪里）。');
  lines.push('有 id 的元素显示 `标签名#id`，没有 id 的元素只显示标签名（不臆造 id）。');
  lines.push('');

  const cut = sample.indexOf('</g>');
  const broken = sample.slice(0, cut >= 0 ? cut : Math.floor(sample.length / 2));
  const brokenSymbols = registration.provider.provideDocumentSymbols(new FakeDocument(new FakeUri('/work/broken.svg'), broken));
  lines.push(`## 2. 编辑到一半（XML 不完整）：截断到第 ${String(broken.split('\n').length)} 行`);
  lines.push('');
  lines.push('```text');
  lines.push(brokenSymbols.length === 0 ? '（大纲为空，扩展不抛错；需求允许"暂时清空"）' : renderSymbols(brokenSymbols).join('\n'));
  lines.push('```');
  lines.push('');

  const edited = sample.replace('id="bg"', 'id="bg2"');
  const editedSymbols = registration.provider.provideDocumentSymbols(new FakeDocument(new FakeUri('/work/sample/nested.svg'), edited));
  lines.push('## 3. 编辑后重新询问（把 `bg` 改成 `bg2`）');
  lines.push('');
  lines.push('```text');
  lines.push(...renderSymbols(editedSymbols).filter((line) => line.includes('bg')));
  lines.push('```');
  lines.push('');
  lines.push('VSCode 在文档变更后会自己重新调用 `provideDocumentSymbols`，插件每次全量重算，因此改名立即反映到大纲。');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const badgeText = await collectBadgeEvidence();
  const outlineText = await collectOutlineEvidence();
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'vscode-badge.txt'), badgeText, 'utf8');
  writeFileSync(join(OUT_DIR, 'vscode-outline.txt'), outlineText, 'utf8');
  process.stdout.write(`已写出 ${join(OUT_DIR, 'vscode-badge.txt')}\n已写出 ${join(OUT_DIR, 'vscode-outline.txt')}\n`);
}

void main();
