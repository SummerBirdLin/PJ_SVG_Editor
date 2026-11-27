#!/usr/bin/env node
/**
 * 阶段 2 验收脚本（全部证据都由脚本现场跑出来，不靠手写结论）。
 *
 *   node tools/verify-phase2.mjs            # 只校验
 *   node tools/verify-phase2.mjs --update   # 重新生成 doc/transcript/*.expected
 *
 * 覆盖：
 *  A. 阶段 1 兼容性：用 tag `final` 的代码重放 doc/transcript/cli-1.txt，
 *     与 doc/transcript/cli-1.baseline.expected 逐字节比对，并再与"当前代码 + 禁用全部插件"比对。
 *  B. 双装配一致性：同一份输入分别在「代码装配（默认）」与「配置装配（--config plugins.config.json）」
 *     下回放，输出必须逐字节相同（cli-1 / box / commands 三份会话）。
 *  C. `dir` 固定工作目录：把 doc/transcript/dir-workdir 复制到临时目录后在其中回放，
 *     日志写到该目录之外，两种装配都要一致。
 *  D. OCP 判据：两条演示分支上"接入插件的那次提交"的 git diff 检查，
 *     以及"排除新插件包后内核与既有插件差异为空"。
 *  E. 加载器独立性：静态检查加载器目录里没有具体插件的 import/映射表/分支。
 *  F. 指标：调用 tools/metrics/report.mjs（存在时）。
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TSX = join(REPO, 'node_modules', '.bin', 'tsx');
const TRANSCRIPT_DIR = join(REPO, 'doc', 'transcript');
const UPDATE = process.argv.includes('--update');

const results = [];
let failed = 0;

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) {
    failed += 1;
  }
  const mark = ok ? 'PASS' : 'FAIL';
  process.stdout.write(`[${mark}] ${name}${detail === '' ? '' : `\n        ${detail.replace(/\n/g, '\n        ')}`}\n`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: REPO, encoding: 'utf8', ...options });
  if (result.error) {
    throw result.error;
  }
  return result;
}

function runCli(args, { cwd, input }) {
  const result = run(TSX, [join(REPO, 'src', 'main.ts'), ...args], { cwd, input });
  if (result.status !== 0) {
    throw new Error(`CLI 退出码 ${String(result.status)}: ${result.stderr}`);
  }
  return result.stdout;
}

function expectedPath(name) {
  return join(TRANSCRIPT_DIR, `${name}.expected`);
}

function readExpected(name) {
  const path = expectedPath(name);
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

function compareOutput(label, actual, expected) {
  if (actual === expected) {
    record(`${label}：输出与期望逐字节一致`, true);
    return true;
  }
  const actualLines = actual.split('\n');
  const expectedLines = (expected ?? '').split('\n');
  const firstDiff = actualLines.findIndex((line, index) => line !== expectedLines[index]);
  record(
    `${label}：输出与期望逐字节一致`,
    false,
    `首个差异在第 ${String(firstDiff + 1)} 行\n实际: ${JSON.stringify(actualLines[firstDiff] ?? '<无>')}\n期望: ${JSON.stringify(expectedLines[firstDiff] ?? '<无>')}`,
  );
  return false;
}

// ---------------------------------------------------------------- A. 阶段 1 兼容性

function checkBaselineCompatibility() {
  const input = readFileSync(join(TRANSCRIPT_DIR, 'cli-1.txt'), 'utf8');
  const baseline = readReadmeSafe(join(TRANSCRIPT_DIR, 'cli-1.baseline.expected'));
  const now = runCli(['--config', join(TRANSCRIPT_DIR, 'plugins-none.config.json')], { cwd: REPO, input });
  compareOutput('A1 兼容性（禁用全部插件 vs final 基线）', now, baseline);

  // 动态核对基线本身确实来自 tag final
  const tagExists = run('git', ['rev-parse', '--verify', '--quiet', 'final']).status === 0;
  if (!tagExists) {
    record('A2 基线来源（tag final 重放）', false, '本地没有 tag final，跳过动态核对');
    return;
  }
  const temp = mkdtempSync(join(tmpdir(), 'svgframe-final-'));
  try {
    run('git', ['archive', 'final'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const archive = run('git', ['archive', 'final']);
    const tar = spawnSync('tar', ['-x', '-C', temp], { input: archive.stdout, cwd: REPO });
    if (tar.status !== 0) {
      record('A2 基线来源（tag final 重放）', false, '解包 git archive 失败');
      return;
    }
    const finalOut = spawnSync(TSX, [join(temp, 'src', 'main.ts')], {
      cwd: temp,
      input,
      encoding: 'utf8',
    });
    record(
      'A2 基线来源（tag final 重放）',
      finalOut.status === 0 && finalOut.stdout === baseline,
      finalOut.status === 0 ? 'tag final 的输出与 cli-1.baseline.expected 一致' : `退出码 ${String(finalOut.status)}`,
    );
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

function readReadmeSafe(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

// ---------------------------------------------------------------- B/C. 双装配一致性

function replayBothAssemblies(label, input, cwd, logDir) {
  const byCode = runCli([], { cwd, input });
  const byConfig = runCli(['--config', join(REPO, 'plugins.config.json')], { cwd, input });
  const ok = compareOutput(`B ${label}：代码装配 vs 配置装配`, byCode, byConfig);
  if (logDir !== undefined) {
    mkdirSync(logDir, { recursive: true });
    writeFileSync(join(logDir, `${label}-code.log`), byCode, 'utf8');
    writeFileSync(join(logDir, `${label}-config.log`), byConfig, 'utf8');
  }
  return { byCode, byConfig, ok };
}

function checkDualAssembly() {
  const cli1 = readFileSync(join(TRANSCRIPT_DIR, 'cli-1.txt'), 'utf8');
  const cli1Expected = readExpected('cli-1');
  const cli1Run = replayBothAssemblies('cli-1', cli1, REPO);
  if (cli1Expected === null && UPDATE) {
    writeFileSync(expectedPath('cli-1'), cli1Run.byCode, 'utf8');
    record('B cli-1：写入期望输出', true, `已写入 ${expectedPath('cli-1')}`);
  } else {
    compareOutput('B cli-1（默认装配 vs cli-1.expected）', cli1Run.byCode, cli1Expected);
  }

  const box = readFileSync(join(TRANSCRIPT_DIR, 'box.txt'), 'utf8');
  const boxExpected = readExpected('box');
  const boxRun = replayBothAssemblies('box', box, REPO);
  if (boxExpected === null && UPDATE) {
    writeFileSync(expectedPath('box'), boxRun.byCode, 'utf8');
    record('B box：写入期望输出', true, `已写入 ${expectedPath('box')}`);
  } else {
    compareOutput('B box（默认装配 vs box.expected）', boxRun.byCode, boxExpected);
  }

  // `dir` 会话：固定夹具目录 + 日志写到目录之外
  const fixture = join(TRANSCRIPT_DIR, 'dir-workdir');
  const temp = mkdtempSync(join(tmpdir(), 'svgframe-cwd-'));
  const workdir = join(temp, 'workdir');
  const logDir = join(temp, 'logs');
  cpSync(fixture, workdir, { recursive: true });
  mkdirSync(logDir, { recursive: true });
  try {
    const commands = readFileSync(join(TRANSCRIPT_DIR, 'commands.txt'), 'utf8');
    const commandsExpected = readExpected('commands');
    const { byCode } = replayBothAssemblies('commands', commands, workdir, logDir);
    if (commandsExpected === null && UPDATE) {
      writeFileSync(expectedPath('commands'), byCode, 'utf8');
      record('B commands：写入期望输出', true, `已写入 ${expectedPath('commands')}`);
    } else {
      compareOutput('B commands（默认装配 vs commands.expected）', byCode, commandsExpected);
    }
    const listing = readdirSync(workdir).sort();
    record(
      'C dir 工作目录内容在验证期间未改变',
      JSON.stringify(listing) === JSON.stringify(['demo.svg', 'docs', 'package.json', 'plugins']),
      `目录内容: ${listing.join(', ')}`,
    );
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- D. OCP 判据

const KERNEL_AND_EXISTING = [
  'src/domain',
  'src/commands',
  'src/cli',
  'src/app',
  'src/io',
  'src/plugin-api',
  'src/builtin',
  'plugins/stats',
  'plugins/dir',
];

/**
 * 演示分支可能只以远端跟踪分支存在（`git clone` 只给默认分支建本地分支），
 * 因此这里先找本地同名分支，再退回 `origin/<branch>`。
 */
function resolveBranch(branch) {
  if (run('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]).status === 0) {
    return branch;
  }
  if (run('git', ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`]).status === 0) {
    return `origin/${branch}`;
  }
  return null;
}

function checkOpenClosedEvidence() {
  const branches = [
    { branch: 'demo/assembly-code', label: 'D1 方式 A（只改一个顶层装配文件）', allowed: ['plugins/shape-box/', 'src/host/CodePlugins.ts', 'package-lock.json'] },
    { branch: 'demo/assembly-config', label: 'D2 方式 B（只改配置）', allowed: ['plugins/shape-box/', 'plugins.config.json', 'package-lock.json'] },
  ];
  for (const { branch, label, allowed } of branches) {
    const ref = resolveBranch(branch);
    if (ref === null) {
      record(label, false, `分支 ${branch} 不存在（本地和 origin 都没有）`);
      continue;
    }
    const changed = run('git', ['diff', '--name-status', `${ref}^`, ref]).stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('\t').pop() ?? '');
    const unexpected = changed.filter((file) => !allowed.some((prefix) => file === prefix || file.startsWith(prefix)));
    record(
      label,
      unexpected.length === 0,
      unexpected.length === 0
        ? `改动 ${String(changed.length)} 个文件，全部在允许范围内`
        : `出现范围外改动: ${unexpected.join(', ')}`,
    );

    const runtimeCode = changed.filter((file) => file.startsWith('src/'));
    if (branch === 'demo/assembly-config') {
      record('D3 方式 B：运行代码零改动', runtimeCode.length === 0, runtimeCode.join(', '));
    } else {
      record(
        'D3 方式 A：只改一个顶层装配文件',
        runtimeCode.length === 1 && runtimeCode[0] === 'src/host/CodePlugins.ts',
        runtimeCode.join(', '),
      );
    }

    const kernelDiff = run('git', ['diff', '--name-status', `${ref}^`, ref, '--', ...KERNEL_AND_EXISTING]).stdout.trim();
    record(`D4 ${branch}：排除新插件包后内核与既有插件差异为空`, kernelDiff === '', kernelDiff);
  }
}

function checkLoaderIndependence() {
  const loaderFiles = [
    join('src', 'host', 'ConfigAssembly.ts'),
    join('src', 'host', 'PluginModuleResolver.ts'),
    join('src', 'host', 'PluginActivation.ts'),
    join('src', 'host', 'PluginConfig.ts'),
  ];
  const offenders = [];
  for (const file of loaderFiles) {
    const text = readFileSync(join(REPO, file), 'utf8');
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (/^import .*from '@svgframe\/plugin-/.test(trimmed) || /\brequire\(/.test(trimmed) || /switch\s*\(\s*module/.test(trimmed)) {
        offenders.push(`${file}: ${trimmed}`);
      }
    }
  }
  record(
    'E 加载器独立性：无具体插件 import / require / 模块名分支',
    offenders.length === 0,
    offenders.join('\n') || '（静态检查通过；按需求说明，这只是辅助人工检查）',
  );
}

/**
 * E2：Part A 的"无 GUI 等价证据"可复现。
 * 用真实扩展代码重新生成一遍，与仓库里提交的两份文本逐字节比对（防止有人手改结论）。
 */
function checkVscodeEvidence() {
  const script = join(REPO, 'vscode-extension', 'tools', 'evidence.ts');
  const committed = ['vscode-badge.txt', 'vscode-outline.txt'].map((name) => join(REPO, 'doc', 'evidence', name));
  if (!existsSync(script) || committed.some((path) => !existsSync(path))) {
    record('E2 VSCode 等价证据可复现', false, 'doc/evidence/ 或 vscode-extension/tools/evidence.ts 缺失');
    return;
  }
  const outDir = mkdtempSync(join(tmpdir(), 'svgframe-evidence-'));
  try {
    const result = run(TSX, [script, '--out-dir', outDir]);
    if (result.status !== 0) {
      record('E2 VSCode 等价证据可复现', false, (result.stderr || result.stdout).slice(0, 300));
      return;
    }
    const mismatched = ['vscode-badge.txt', 'vscode-outline.txt'].filter((name) => {
      const fresh = readFileSync(join(outDir, name), 'utf8');
      const before = readFileSync(join(REPO, 'doc', 'evidence', name), 'utf8');
      return fresh !== before;
    });
    record(
      'E2 VSCode 等价证据可复现',
      mismatched.length === 0,
      mismatched.length === 0 ? '两份文本与现场重算逐字节一致' : `不一致：${mismatched.join('、')}`,
    );
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- F. 指标

/** F：指标脚本可运行。产物写临时目录——验收过程不得弄脏工作区。 */
function checkMetrics() {
  const script = join(REPO, 'tools', 'metrics', 'report.mjs');
  if (!existsSync(script)) {
    record('F 指标脚本', false, 'tools/metrics/report.mjs 不存在');
    return;
  }
  const outDir = mkdtempSync(join(tmpdir(), 'svgframe-metrics-run-'));
  try {
    const result = run('node', [script, '--from', 'final', '--to', 'HEAD', '--out-dir', outDir]);
    const summary = (result.stdout || '')
      .split('\n')
      .filter((line) => /代码行|CC/.test(line))
      .slice(0, 5)
      .join('\n');
    record(
      'F 指标脚本可运行（final → HEAD）',
      result.status === 0,
      summary.trim() || (result.stderr || '').slice(0, 300),
    );
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

/**
 * F2：指标产物可复现。仓库里提交的 report.md 是用同一脚本生成的；
 * 重新按 `--from final --to p2` 算一遍，除了「目标 ref / 命令」那几行，其余必须逐字节一致。
 */
function checkMetricsReproducible() {
  const tagExists = run('git', ['rev-parse', '--verify', '--quiet', 'p2']).status === 0;
  if (!tagExists) {
    record('F2 指标产物可复现（final → p2）', false, '本地还没有 tag p2：打完 tag 后本项才有意义');
    return;
  }
  const outDir = mkdtempSync(join(tmpdir(), 'svgframe-metrics-'));
  try {
    const result = run('node', [join(REPO, 'tools', 'metrics', 'report.mjs'), '--from', 'final', '--to', 'p2', '--out-dir', outDir]);
    if (result.status !== 0) {
      record('F2 指标产物可复现（final → p2）', false, (result.stderr || result.stdout).slice(0, 300));
      return;
    }
    // 只允许"ref 名字"不同的行有差异：目标 ref / 内容来源 / 生成命令 / 增量口径
    const normalize = (text) => text
      .split('\n')
      .filter((line) => !/目标 ref|目标内容来源|生成命令|增量口径：|目标内容/.test(line))
      .filter((line) => !/--to (HEAD|p2)|--from final --to/.test(line))
      .join('\n');
    const committed = normalize(readFileSync(join(REPO, 'docs', 'metrics', 'report.md'), 'utf8'));
    const fresh = normalize(readFileSync(join(outDir, 'report.md'), 'utf8'));
    record(
      'F2 指标产物可复现（final → p2）',
      committed === fresh,
      committed === fresh ? '仓库产物与现场重算一致（仅 ref 行不同）' : '产物与现场重算不一致，请重新生成',
    );
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- main

process.stdout.write(`仓库: ${REPO}\n时间: ${new Date().toISOString()}\n\n`);
checkBaselineCompatibility();
checkDualAssembly();
checkOpenClosedEvidence();
checkLoaderIndependence();
checkVscodeEvidence();
checkMetrics();
checkMetricsReproducible();

process.stdout.write(`\n=== 汇总：${String(results.length - failed)}/${String(results.length)} 项通过 ===\n`);
if (failed > 0) {
  process.stdout.write(`失败 ${String(failed)} 项：\n${results.filter((item) => !item.ok).map((item) => ` - ${item.name}`).join('\n')}\n`);
  process.exitCode = 1;
}
