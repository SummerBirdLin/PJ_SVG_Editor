#!/usr/bin/env node
/**
 * tools/metrics/report.mjs —— 指标产物生成器（阶段 2「指标产物」子任务）
 *
 * 目标：从 **git 历史**（不是工作区）生成可复查的代码指标：
 *   - 文件清单 / 文件数 / 行数，按「内核 / 装配处 / 插件」三类拆分（CLI 范围）；
 *   - 圈复杂度（CC）逐函数估算，给出每文件总分、最高函数值，以及基线 ref → 目标 ref 的增量；
 *   - 测试目录与 VSCode 扩展单独列出，不混入 CLI 增量。
 *
 * 刻意做成零第三方依赖的 Node ESM 脚本，`node tools/metrics/report.mjs` 直接可跑。
 *
 * 用法：
 *   node tools/metrics/report.mjs                       # 等价于 --from final --to HEAD
 *   node tools/metrics/report.mjs --from final --to p2
 *   node tools/metrics/report.mjs --from final --to main --out-dir docs/metrics
 *   node tools/metrics/report.mjs --selftest            # 词法扫描/CC 口径自检（不读仓库）
 *   node tools/metrics/report.mjs --help
 *
 * 设计要点（详见 docs/metrics/README.md）：
 *   1. 数据源只有 git：`git ls-tree -r --name-only <ref>` 列文件、`git show <ref>:<path>` 取内容，
 *      因此未提交/未跟踪的改动不会污染对比结果；
 *   2. 只统计 `*.ts`；`node_modules/`、`dist/`（依赖与构建产物）与 `vscode-extension/` 不进 CLI 范围；
 *      测试（`test/**`、`*.test.ts`）单独一行；
 *   3. 三类划分用**数据表 + 函数**表达（见 CATEGORY_DEFS / classifyPath），输出里也会打印规则，便于审阅；
 *   4. CC 是真词法扫描（跳过注释/字符串/模板串/正则字面量），不是整文件 grep 计数；结果标注为估算值；
 *   5. 幂等：产物里不写时间戳（只有 ref 名与 commit sha），同样输入必然得到同样输出。
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// 0. 常量：分类规则（数据表）、排除规则、CC 口径
// ---------------------------------------------------------------------------

const SCRIPT_PATH = 'tools/metrics/report.mjs';
const DEFAULT_FROM = 'final';
const DEFAULT_TO = 'HEAD';
const DEFAULT_OUT_DIR = 'docs/metrics';

/**
 * 三类划分规则（CLI 范围）。`prefixes` 是路径前缀匹配，顺序无关；
 * 匹配不到任何三类且仍在 CLI 范围内的 TS 文件落入 `other`（未分类），报表里单独一行提示，
 * 这样阶段 2 若新增了未登记的目录，指标不会静默丢失。
 */
const CATEGORY_DEFS = [
  {
    id: 'kernel',
    label: '内核',
    prefixes: [
      'src/domain/',
      'src/commands/',
      'src/ports/',
      'src/io/',
      'src/app/',
      'src/cli/',
      'src/plugin-api/',
    ],
    description:
      '领域模型（domain）、编辑命令（commands）、端口（ports）、IO（io）、应用层（app）、CLI（cli）、插件扩展点接口（plugin-api）',
    rationale:
      '这些目录是「不依赖具体装配方式」的业务与技术内核；plugin-api 放的是扩展点接口，属于内核一侧（插件只实现它）',
  },
  {
    id: 'assembly',
    label: '装配处',
    prefixes: ['src/host/', 'src/main.ts', 'plugins.config.json'],
    description: '组合根 main.ts、host/（组合根 + 插件加载器）、plugins.config.json（装配配置）',
    rationale: '只做「把谁装给谁」的接线，不含业务规则；插件加载器同样是装配职责',
  },
  {
    id: 'plugin',
    label: '插件',
    prefixes: ['src/builtin/', 'plugins/'],
    description: 'src/builtin/（内置图形/命令以插件形式注册）、plugins/<name>/（各插件包，@svgframe/plugin-*）',
    rationale: '可被装卸的扩展单元；阶段 1 没有插件目录，自然为空',
  },
  {
    id: 'other',
    label: '未分类',
    prefixes: [],
    description: '落在 CLI 范围、但不属于上面三类的 TS 文件（阶段 2 若新增未登记目录会出现）',
    rationale: '兜底行：出现即提示审阅者把新目录登记进 CATEGORY_DEFS 的某一类',
  },
];

/** 依赖包 / 构建产物：整条路径直接排除（不进任何统计）。 */
const EXCLUDE_DIR_PREFIXES = ['node_modules/', 'dist/'];

/** VSCode 扩展：单独一节，不混入 CLI 重构增量。 */
const VSCODE_PREFIX = 'vscode-extension/';

/** 测试：单独一行，不混入三类；也不计入 CC 增量。 */
const TEST_DIR_PREFIX = 'test/';
const TEST_FILE_SUFFIXES = ['.test.ts', '.spec.ts'];

/**
 * CC 判定表（词法级）。
 * 口径：函数 CC = 1 + 决策点个数；`else`/`default`/`try` 本身不加点（`else if` 由其中的 `if` 计一次）。
 * `&&`/`||`/`??` 计点；复合赋值 `&&=`/`||=`/`??=` 不计（属于赋值而非分支）。
 * `do { } while (...)` 的 `do` 计 1，配对的收尾 `while` 不再重复计点。
 */
const CC_KEYWORD_DECISIONS = new Set(['if', 'for', 'case', 'catch', 'do']);
const CC_PUNCT_DECISIONS = new Set(['&&', '||', '??']);

// ---------------------------------------------------------------------------
// 1. 词法扫描（tokenizer）
// ---------------------------------------------------------------------------
//
// 只做 CC 统计需要的粗粒度切分：标识符/关键字、数字、字符串、模板串、正则字面量、标点。
// 关键点：
//   - 注释（// 与 /* */）、字符串、模板串文本、正则字面量里的 `if`/`&&`/`?` 都在扫描阶段被吞掉，
//     不会进入决策点统计（这就是「不能整文件 grep 计数」的原因）；
//   - 模板串的 `${ ... }` 内部是真正的代码，递归扫描，里面的决策点照常计数；
//   - `/` 是除号还是正则起始靠上下文判定（前一 token 是否可以结束表达式），
//     `)` / `}` 还要看它闭合的是控制结构还是对象字面量。

const KEYWORDS = new Set([
  'abstract', 'any', 'as', 'asserts', 'async', 'await', 'bigint', 'boolean', 'break', 'case', 'catch',
  'class', 'const', 'constructor', 'continue', 'debugger', 'declare', 'default', 'delete', 'do', 'else',
  'enum', 'export', 'extends', 'false', 'finally', 'for', 'from', 'function', 'get', 'if', 'implements',
  'import', 'in', 'infer', 'instanceof', 'interface', 'is', 'keyof', 'let', 'module', 'namespace', 'never',
  'new', 'null', 'number', 'object', 'of', 'private', 'protected', 'public', 'readonly', 'return',
  'satisfies', 'set', 'static', 'string', 'super', 'switch', 'symbol', 'this', 'throw', 'true', 'try',
  'type', 'typeof', 'undefined', 'unique', 'unknown', 'var', 'void', 'while', 'with', 'yield',
]);

/** 这些关键字出现在 `/` 之前时，`/` 只能是正则字面量的起始。 */
const REGEX_AFTER_KEYWORDS_EXPR = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'case', 'do', 'else', 'throw',
  'yield', 'await', 'default', 'export', 'import', 'satisfies', 'as',
]);

/** 这些关键字/字面量可以结束一个表达式，其后的 `/` 是除号。 */
const REGEX_AFTER_KEYWORDS_LITERAL = new Set([
  'this', 'true', 'false', 'null', 'undefined', 'super',
]);

/** 出现在 `/` 之前时表示「表达式还没结束」，因此 `/` 是正则字面量起始。 */
const REGEX_BEFORE_PUNCT = new Set([
  '(', '[', '{', ',', ';', ':', '=', '==', '===', '!=', '!==', '!', '?', '&&', '||', '??',
  '+', '-', '*', '/', '%', '<', '>', '<=', '>=', '=>', '&', '|', '^', '~',
  '+=', '-=', '*=', '/=', '%=', '&&=', '||=', '??=', '...', '**',
]);

/** 可以结束表达式的标点：其后的 `/` 是除号。 */
const REGEX_AFTER_PUNCT_LITERAL = new Set([')', ']', '}', '++', '--']);

const TYPE_PUNCT = new Set([
  '<', '>', '.', ',', '[', ']', '|', '&', '?', ':', '(', ')', '=>', '{', '}', ';', '*', '=', '...',
]);

const CLASS_KEYWORDS = new Set(['class', 'interface', 'enum', 'namespace', 'module']);
const TYPE_KEYWORDS = new Set([
  'extends', 'implements', 'keyof', 'typeof', 'readonly', 'infer', 'is', 'asserts', 'new', 'void',
  'string', 'number', 'boolean', 'unknown', 'any', 'never', 'object', 'symbol', 'bigint', 'this',
  'true', 'false', 'null', 'undefined', 'in', 'out', 'abstract', 'static', 'public', 'private',
  'protected', 'declare', 'async', 'get', 'set',
]);
const BLOCK_KEYWORDS = new Set([
  'else', 'try', 'finally', 'class', 'interface', 'enum', 'namespace', 'module', 'abstract', 'declare',
  'export', 'static', 'default',
]);
const CONTROL_KEYWORDS = new Set(['if', 'while', 'for', 'switch', 'catch', 'with']);

/** 按长度降序的多字符标点（保证 `>>>=` 先于 `>`、`===` 先于 `==`）。 */
const PUNCTUATORS = [
  '>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '&&=', '||=', '??=', '>>>',
  '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=',
  '&=', '|=', '^=', '**', '<<', '>>',
  '(', ')', '[', ']', '{', '}', '<', '>', '=', '+', '-', '*', '/', '%', '&', '|', '^', '!', '~', '?',
  ':', ';', ',', '.', '@',
];

const IDENT_START_EXTRA = new Set(['_', '$']);

function isDigit(ch) {
  return ch >= '0' && ch <= '9';
}

function isIdentStart(ch) {
  if (ch === undefined) return false;
  const code = ch.codePointAt(0);
  return (
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    IDENT_START_EXTRA.has(ch) ||
    code >= 0x80 // 宽松接受非 ASCII 标识符（本项目里主要是避免中文注释/字符串误判，注释与字符串已先被吞掉）
  );
}

function isIdentPart(ch) {
  if (ch === undefined) return false;
  return isIdentStart(ch) || isDigit(ch);
}

/**
 * 把源码切成 token 列表。
 * token: { k: 'ident'|'kw'|'num'|'str'|'tmpl'|'regex'|'punct', v: string, i: 起始偏移,
 *          paren?: 括号帧, braceFrame?: 花括号帧 }
 */
function tokenize(src) {
  const tokens = [];
  const n = src.length;
  let pos = 0;
  const parenStack = [];
  const braceStack = [];
  const commentRanges = []; // 供行数口径（代码行/注释行/空行）使用

  const last = () => (tokens.length > 0 ? tokens[tokens.length - 1] : null);
  const push = (k, v, start) => {
    const tok = { k, v, i: start };
    tokens.push(tok);
    return tok;
  };

  function regexAllowed() {
    const prev = last();
    if (!prev) return true;
    if (prev.k === 'kw') {
      if (REGEX_AFTER_KEYWORDS_LITERAL.has(prev.v)) return false;
      return REGEX_AFTER_KEYWORDS_EXPR.has(prev.v);
    }
    if (prev.k === 'punct') {
      if (REGEX_AFTER_PUNCT_LITERAL.has(prev.v)) {
        // `)` 与 `}` 的语义取决于它闭合的是什么
        if (prev.v === ')') return Boolean(prev.paren && prev.paren.control);
        if (prev.v === '}') return !prev.braceFrame || prev.braceFrame.kind !== 'object';
        return false;
      }
      return REGEX_BEFORE_PUNCT.has(prev.v);
    }
    return false; // ident / num / str / tmpl / regex 之后是除号
  }

  function scanIdent() {
    const start = pos;
    while (pos < n && isIdentPart(src[pos])) pos += 1;
    const value = src.slice(start, pos);
    push(KEYWORDS.has(value) ? 'kw' : 'ident', value, start);
  }

  function scanNumber() {
    const start = pos;
    if (src[pos] === '0' && /[xXbBoO]/.test(src[pos + 1] ?? '')) {
      pos += 2;
      while (pos < n && /[0-9a-fA-F_]/.test(src[pos])) pos += 1;
    } else {
      while (pos < n && /[0-9_]/.test(src[pos])) pos += 1;
      if (src[pos] === '.') {
        pos += 1;
        while (pos < n && /[0-9_]/.test(src[pos])) pos += 1;
      }
      if (src[pos] === 'e' || src[pos] === 'E') {
        const save = pos;
        pos += 1;
        if (src[pos] === '+' || src[pos] === '-') pos += 1;
        if (isDigit(src[pos])) {
          while (pos < n && /[0-9_]/.test(src[pos])) pos += 1;
        } else {
          pos = save;
        }
      }
    }
    if (src[pos] === 'n') pos += 1; // BigInt
    push('num', src.slice(start, pos), start);
  }

  function scanString(quote) {
    const start = pos;
    pos += 1;
    while (pos < n) {
      const ch = src[pos];
      if (ch === '\\') {
        pos += 2;
        continue;
      }
      if (ch === quote) {
        pos += 1;
        break;
      }
      if (ch === '\n') break; // 未闭合的单行字符串：止于行尾，避免吞掉后续代码
      pos += 1;
    }
    push('str', src.slice(start, pos), start);
  }

  function scanRegex() {
    const start = pos;
    pos += 1; // '/'
    let inClass = false;
    while (pos < n) {
      const ch = src[pos];
      if (ch === '\\') {
        pos += 2;
        continue;
      }
      if (ch === '\n') break;
      if (inClass) {
        if (ch === ']') inClass = false;
        pos += 1;
        continue;
      }
      if (ch === '[') {
        inClass = true;
        pos += 1;
        continue;
      }
      if (ch === '/') {
        pos += 1;
        break;
      }
      pos += 1;
    }
    while (pos < n && /[a-z]/.test(src[pos])) pos += 1; // flags: gimsuy d v
    push('regex', src.slice(start, pos), start);
  }

  function scanTemplate() {
    let chunkStart = pos;
    pos += 1; // '`'
    while (pos < n) {
      const ch = src[pos];
      if (ch === '\\') {
        pos += 2;
        continue;
      }
      if (ch === '`') {
        pos += 1;
        break;
      }
      if (ch === '$' && src[pos + 1] === '{') {
        push('tmpl', src.slice(chunkStart, pos), chunkStart);
        pos += 2;
        scanCode(true); // 递归扫描 `${ ... }` 里的真代码
        if (src[pos] === '}') pos += 1;
        chunkStart = pos;
        continue;
      }
      pos += 1;
    }
    push('tmpl', src.slice(chunkStart, pos), chunkStart);
  }

  function matchPunct() {
    for (const candidate of PUNCTUATORS) {
      if (src.startsWith(candidate, pos)) {
        // `?.` 后紧跟数字时按三元 + 小数处理（`a ? .5 : 1`）
        if (candidate === '?.' && isDigit(src[pos + 2])) continue;
        return candidate;
      }
    }
    return null;
  }

  /**
   * 判定一个 `{` 是函数体 / 类体 / do 块 / 普通块 / 对象（类型）字面量。
   * 见文件头「CC 口径」；这是给 CC 归属和 `/` 判定用的近似，不追求完整 TS 语法树。
   */
  function classifyOpeningBrace(prevIdx) {
    const prev = prevIdx >= 0 ? tokens[prevIdx] : null;
    if (!prev) return { kind: 'block' };
    if (prev.k === 'punct') {
      if (prev.v === '=>') return { kind: 'function', label: arrowLabel(prevIdx) };
      if (prev.v === ')') return parenBrace(prev);
      if (prev.v === ';' || prev.v === '}' || prev.v === '{') return { kind: 'block' };
      // `>` / `]` / `=` 之后的花括号要靠回溯区分：`class C<T> {`、`map(x): T[] {`、`const x = {`
      if (prev.v === '>' || prev.v === ']' || prev.v === '=') return walkBackForBody(prevIdx);
      return { kind: 'object' };
    }
    if (prev.k === 'kw') {
      if (prev.v === 'do') return { kind: 'do' };
      if (BLOCK_KEYWORDS.has(prev.v)) return { kind: 'block' };
      // `width(): number {` 这类「返回类型以关键字收尾」的函数体：
      // 关键字是类型名时向后回溯，找 `(…)` 参数表
      if (TYPE_KEYWORDS.has(prev.v)) return walkBackForBody(prevIdx);
      return { kind: 'object' };
    }
    if (prev.k === 'ident' || prev.k === 'num' || prev.k === 'str' || prev.k === 'tmpl' || prev.k === 'regex') {
      return walkBackForBody(prevIdx);
    }
    return { kind: 'block' };
  }

  /** `)` 之后的花括号：控制结构的块体，还是函数体。 */
  function parenBrace(parenTok) {
    const frame = parenTok.paren;
    if (!frame || frame.control) return { kind: 'block' };
    const before = frame.before;
    if (isFunctionParamsBefore(before)) return { kind: 'function', label: parenLabel(frame) };
    return { kind: 'block' };
  }

  /**
   * 向前回溯跳过「返回类型标注」等类型 token，判断这个 `{` 是不是函数体 / 类体。
   * 覆盖 `foo(a): Promise<void> {`、`class Foo<T> extends Bar {`、`interface X {` 这类形态。
   */
  function walkBackForBody(startIdx) {
    let i = startIdx;
    let steps = 0;
    while (i >= 0 && steps < 64) {
      const tok = tokens[i];
      if (tok.k === 'punct') {
        if (tok.v === ')') return parenBrace(tok);
        if (TYPE_PUNCT.has(tok.v)) {
          i -= 1;
          steps += 1;
          continue;
        }
        return { kind: 'object' };
      }
      if (tok.k === 'kw') {
        if (CLASS_KEYWORDS.has(tok.v)) return { kind: 'class', name: classNameAfter(tok) };
        if (tok.v === 'function') return { kind: 'function', label: '<anonymous function>' };
        if (TYPE_KEYWORDS.has(tok.v)) {
          i -= 1;
          steps += 1;
          continue;
        }
        return { kind: 'object' };
      }
      i -= 1;
      steps += 1;
    }
    return { kind: 'object' };
  }

  function classNameAfter(classTok) {
    const idx = tokens.indexOf(classTok);
    const next = tokens[idx + 1];
    return next && next.k === 'ident' ? next.v : '<anonymous>';
  }

  function isFunctionParamsBefore(before) {
    if (!before) return false;
    if (before.k === 'ident') return true; // foo( / get x(
    if (before.k === 'kw') return before.v === 'function' || before.v === 'constructor';
    return before.k === 'punct' && (before.v === '>' || before.v === ']' || before.v === '?' || before.v === '*');
  }

  function parenLabel(frame) {
    const before = frame.before;
    if (before && before.k === 'ident') return before.v;
    if (before && before.k === 'kw' && before.v === 'constructor') return 'constructor';
    if (before && before.v === '?') {
      const nameTok = tokens[frame.beforeIdx - 1];
      if (nameTok && nameTok.k === 'ident') return nameTok.v;
    }
    if (before && before.k === 'kw' && before.v === 'function') return '<anonymous function>';
    return '<anonymous>';
  }

  /**
   * `=>` 的标签：优先用被赋值的名字，让报表能指到具体函数。
   *   `const f = () => {`  → `f =>`
   *   `write: (t) => {`    → `write =>`
   *   `items.map((x) => {` → `<arrow>`
   */
  function arrowLabel(arrowIdx) {
    const prev = tokens[arrowIdx - 1];
    if (prev && prev.k === 'punct' && prev.v === '=') {
      const nameTok = tokens[arrowIdx - 2];
      if (nameTok && nameTok.k === 'ident') return `${nameTok.v} =>`;
    }
    if (prev && prev.k === 'punct' && prev.v === ')') {
      const frame = prev.paren;
      const before = frame && frame.before;
      if (before && before.k === 'punct' && (before.v === '=' || before.v === ':')) {
        const nameTok = tokens[frame.beforeIdx - 1];
        if (nameTok && nameTok.k === 'ident') return `${nameTok.v} =>`;
      }
    }
    return '<arrow>';
  }

  function openBraceFrame(openIdx, prevIdx) {
    const info = classifyOpeningBrace(prevIdx);
    const enclosingClass = [...braceStack].reverse().find((f) => f.kind === 'class');
    const frame = {
      kind: info.kind,
      label: info.label ?? info.name ?? null,
      openIdx,
      prevIdx,
      closeIdx: -1,
      points: 0,
      owner: enclosingClass ? enclosingClass.label : null,
    };
    if (frame.kind === 'function') {
      frame.name = frame.owner ? `${frame.owner}.${frame.label}` : frame.label;
    }
    return frame;
  }

  function handlePunct(value) {
    const start = pos;
    pos += value.length;
    const tok = push('punct', value, start);

    if (value === '(') {
      const prev = tokens.length >= 2 ? tokens[tokens.length - 2] : null;
      parenStack.push({
        control: Boolean(prev && prev.k === 'kw' && CONTROL_KEYWORDS.has(prev.v)),
        before: prev,
        beforeIdx: tokens.length - 2,
        openIdx: tokens.length - 1,
      });
      return null;
    }
    if (value === ')') {
      const frame = parenStack.pop();
      if (frame) tok.paren = frame;
      return null;
    }
    if (value === '{') {
      const frame = openBraceFrame(tokens.length - 1, tokens.length - 2);
      braceStack.push(frame);
      tok.braceFrame = frame;
      return frame;
    }
    if (value === '}') {
      const frame = braceStack.pop();
      if (frame) {
        frame.closeIdx = tokens.length - 1;
        tok.braceFrame = frame;
        return frame;
      }
      return null;
    }
    return null;
  }

  /**
   * 扫描代码。stopAtBraceClose=true 时用于模板串 `${ ... }` 内部：
   * 遇到本层的收尾 `}` 就返回，位置停在该 `}` 上。
   */
  function scanCode(stopAtBraceClose) {
    let depth = 0;
    while (pos < n) {
      const ch = src[pos];
      if (ch === '\n' || ch === '\r' || ch === ' ' || ch === '\t' || ch === '\f' || ch === '\v' || ch === '\uFEFF') {
        pos += 1;
        continue;
      }
      if (ch === '/' && src[pos + 1] === '/') {
        const start = pos;
        pos += 2;
        while (pos < n && src[pos] !== '\n') pos += 1;
        commentRanges.push([start, pos]);
        continue;
      }
      if (ch === '/' && src[pos + 1] === '*') {
        const start = pos;
        pos += 2;
        while (pos < n && !(src[pos] === '*' && src[pos + 1] === '/')) pos += 1;
        pos += 2;
        commentRanges.push([start, Math.min(pos, n)]);
        continue;
      }
      if (ch === "'" || ch === '"') {
        scanString(ch);
        continue;
      }
      if (ch === '`') {
        scanTemplate();
        continue;
      }
      if (ch === '/') {
        if (regexAllowed()) {
          scanRegex();
        } else {
          const value = src[pos + 1] === '=' ? '/=' : '/';
          push('punct', value, pos);
          pos += value.length;
        }
        continue;
      }
      if (isIdentStart(ch)) {
        scanIdent();
        continue;
      }
      if (isDigit(ch) || (ch === '.' && isDigit(src[pos + 1]))) {
        scanNumber();
        continue;
      }
      if (stopAtBraceClose && (ch === '{' || ch === '}')) {
        if (ch === '{') {
          depth += 1;
          handlePunct('{');
          continue;
        }
        if (depth === 0) return;
        depth -= 1;
        handlePunct('}');
        continue;
      }
      const punct = matchPunct();
      if (!punct) {
        pos += 1; // 未识别的字符：跳过，保证不死循环
        continue;
      }
      handlePunct(punct);
    }
  }

  scanCode(false);

  // 收集函数帧（按开括号位置升序）
  const frames = [];
  const collect = (framesFromStack) => {
    for (const frame of framesFromStack) {
      if (frame.kind === 'function' && frame.closeIdx > frame.openIdx) frames.push(frame);
    }
  };
  collect(tokens.filter((t) => t.k === 'punct' && t.v === '{' && t.braceFrame).map((t) => t.braceFrame));

  // 去重（同一帧可能被多次引用）并按 openIdx 排序
  const unique = [...new Set(frames)].sort((a, b) => a.openIdx - b.openIdx);
  return { tokens, frames: unique, lineStats: computeLineStats(src, commentRanges) };
}

/**
 * 行数口径（由词法扫描的注释区间推出，不靠正则猜）：
 *   - 代码行（code）：该行除注释与空白外还有代码内容 → 本报表的主行数指标；
 *   - 注释行（comment）：该行只有注释（含 `/** ... *\/` 的每一行、行尾无代码的 `//`）；
 *   - 空行（blank）：该行只有空白；
 *   - 物理行（physical）：`wc -l` 口径。
 * 行内既有代码又有行尾注释 → 记为「代码行」（注释不重复计行）。
 * 多行模板串/字符串的内容行记为代码行（它们是程序里的字面量，不是注释）。
 */
function computeLineStats(src, commentRanges) {
  const n = src.length;
  const isComment = new Uint8Array(n);
  for (const [start, end] of commentRanges) {
    for (let i = start; i < Math.min(end, n); i += 1) isComment[i] = 1;
  }
  const stats = { physical: 0, code: 0, comment: 0, blank: 0 };
  let start = 0;
  while (start < n) {
    let end = src.indexOf('\n', start);
    if (end === -1) end = n;
    stats.physical += 1;
    let hasNonSpace = false;
    let hasCode = false;
    for (let i = start; i < end; i += 1) {
      const ch = src[i];
      if (ch === '\r' || ch === ' ' || ch === '\t' || ch === '\f' || ch === '\v') continue;
      hasNonSpace = true;
      if (!isComment[i]) {
        hasCode = true;
        break;
      }
    }
    if (hasCode) stats.code += 1;
    else if (hasNonSpace) stats.comment += 1;
    else stats.blank += 1;
    start = end + 1;
  }
  return stats;
}

// ---------------------------------------------------------------------------
// 2. CC 计算（每文件：逐函数 + 顶层伪函数）
// ---------------------------------------------------------------------------

/** `?` 是否为三元运算符（排除可选链、可选属性、可选方法调用等）。 */
function isTernary(tokens, index) {
  const next = tokens[index + 1];
  const prev = tokens[index - 1];
  if (!next) return false;
  if (next.k === 'punct') {
    if (next.v === '.' ) return false; // 可选链（若未合并成 `?.`）
    if (next.v === ':') return false; // 可选属性 / 可选参数
    if (next.v === '(' && prev && (prev.k === 'ident' || prev.v === ')' || prev.v === ']')) {
      return false; // 可选方法调用 foo?()
    }
    if (next.v === '<' && prev && prev.k === 'ident') return false; // 可选泛型调用 foo?<T>()
  }
  return true;
}

/** 该 token（含上下文）是否是一个决策点。 */
function isDecision(tokens, index) {
  const tok = tokens[index];
  if (tok.k === 'kw') {
    if (CC_KEYWORD_DECISIONS.has(tok.v)) return true;
    if (tok.v === 'while') {
      // do { } while (...) 的收尾 while 不重复计点
      const prev = tokens[index - 1];
      if (prev && prev.k === 'punct' && prev.v === '}' && prev.braceFrame && prev.braceFrame.kind === 'do') {
        return false;
      }
      return true;
    }
    return false;
  }
  if (tok.k === 'punct') {
    if (CC_PUNCT_DECISIONS.has(tok.v)) return true;
    if (tok.v === '?') return isTernary(tokens, index);
  }
  return false;
}

/**
 * 分析一段 TS 源码：
 *   - functions：每个带块体 `{...}` 的函数的 {name, cc}
 *   - total：Σ(函数 CC) ＋ 顶层伪函数 CC（顶层只有出现决策点时才成立，基础值 1）
 *   - max / maxName：最高单函数 CC
 * 说明：箭头函数的简写体（`x => a || b`，无花括号）其决策点归属外层函数，见 README「已知局限」。
 */
function analyzeSource(text) {
  const { tokens, frames, lineStats } = tokenize(text);
  const openAt = new Map();
  const closeAt = new Map();
  for (const frame of frames) {
    openAt.set(frame.openIdx, frame);
    closeAt.set(frame.closeIdx, frame);
  }

  const stack = [];
  let topLevelPoints = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    const opened = openAt.get(i);
    if (opened) {
      stack.push({ frame: opened, points: 0 });
      continue;
    }
    const closed = closeAt.get(i);
    if (closed) {
      const top = stack.pop();
      if (top) {
        top.frame.points = top.points;
      }
      continue;
    }
    if (!isDecision(tokens, i)) continue;
    if (stack.length > 0) stack[stack.length - 1].points += 1;
    else topLevelPoints += 1;
  }

  const functions = frames.map((frame) => ({
    name: frame.name ?? frame.label ?? '<anonymous>',
    cc: 1 + frame.points,
  }));

  if (topLevelPoints > 0) functions.push({ name: '<模块顶层>', cc: 1 + topLevelPoints });

  const total = functions.reduce((sum, fn) => sum + fn.cc, 0);
  let max = 0;
  let maxName = '';
  for (const fn of functions) {
    if (fn.cc > max) {
      max = fn.cc;
      maxName = fn.name;
    }
  }
  return { functions, total, max, maxName, lineStats };
}

// ---------------------------------------------------------------------------
// 3. 分类：路径 → 范围 / 类别
// ---------------------------------------------------------------------------

function startsWithAny(path, prefixes) {
  return prefixes.some((prefix) => path === prefix || path.startsWith(prefix));
}

function categoryOf(path) {
  for (const def of CATEGORY_DEFS) {
    if (def.id === 'other') continue;
    if (startsWithAny(path, def.prefixes)) return def.id;
  }
  return 'other';
}

/**
 * 判定一个仓库路径属于哪个统计范围：
 *   - scope: 'cli' | 'vscode' | 'test' | 'excluded'
 *   - 排除顺序：依赖/构建产物 → VSCode 扩展 → 测试 → 非 TS → 三类归类
 * 注意：`vscode-extension/` 先于测试判定，因此扩展内部的测试文件算在扩展一节（README 有说明）。
 */
function classifyPath(path) {
  if (startsWithAny(path, EXCLUDE_DIR_PREFIXES) || path.includes('/node_modules/')) {
    return { scope: 'excluded', reason: '依赖包或构建产物（node_modules/、dist/）', isTs: path.endsWith('.ts') };
  }
  if (startsWithAny(path, [VSCODE_PREFIX])) {
    return { scope: 'vscode', reason: 'VSCode 扩展，单独一节', isTs: path.endsWith('.ts') };
  }
  if (isTestPath(path)) {
    return { scope: 'test', reason: '测试/fixtures，单独一行', isTs: path.endsWith('.ts') };
  }
  const isTs = path.endsWith('.ts');
  const category = categoryOf(path);
  return { scope: 'cli', category, reason: `按前缀归入「${labelOfCategory(category)}」`, isTs };
}

/** 测试判定：`test/` 前缀、任意层级的 `test/`、`tests/` 目录段，或 `*.test.ts` / `*.spec.ts`。 */
function isTestPath(path) {
  if (startsWithAny(path, [TEST_DIR_PREFIX])) return true;
  if (TEST_FILE_SUFFIXES.some((suffix) => path.endsWith(suffix))) return true;
  return /(^|\/)(test|tests)\//.test(path);
}

function labelOfCategory(id) {
  const def = CATEGORY_DEFS.find((item) => item.id === id);
  return def ? def.label : id;
}

// ---------------------------------------------------------------------------
// 4. git 访问（只读历史，不读工作区）
// ---------------------------------------------------------------------------

function runGit(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'buffer',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function resolveRepoRoot(startDir) {
  try {
    const out = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: startDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return out.trim();
  } catch {
    return null;
  }
}

/** 解析 ref → { name, objectSha, commitSha, kind }；不存在时返回 null。 */
function resolveRef(root, name) {
  const read = (args) => {
    try {
      return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
        .trim();
    } catch {
      return null;
    }
  };
  const objectSha = read(['rev-parse', '--verify', '--quiet', name]);
  if (!objectSha) return null;
  const commitSha = read(['rev-parse', '--verify', '--quiet', `${name}^{commit}`]);
  if (!commitSha) return null;
  const objectType = read(['cat-file', '-t', objectSha]) ?? 'unknown';
  return { name, objectSha, commitSha, kind: objectType };
}

/** `git ls-tree -r --name-only <ref>`：历史中的全部文件路径（不含工作区未跟踪文件）。 */
function listFiles(root, ref) {
  const out = runGit(['ls-tree', '-r', '--name-only', '-z', ref], root).toString('utf8');
  return out.split('\0').filter((path) => path.length > 0).sort();
}

/**
 * `git show <ref>:<path>`：读取历史内容。
 * 二进制文件（含 NUL 字节）与子模块等读失败情形返回 null，由调用方跳过。
 */
function readBlob(root, ref, path) {
  let buf;
  try {
    buf = runGit(['show', `${ref}:${path}`], root);
  } catch {
    return null;
  }
  const head = buf.subarray(0, Math.min(buf.length, 8000));
  if (head.includes(0)) return null; // 二进制
  return buf.toString('utf8');
}

// ---------------------------------------------------------------------------
// 5. 采集与汇总
// ---------------------------------------------------------------------------

function emptyBucket(id, label) {
  return {
    id,
    label,
    files: 0,
    codeLines: 0,
    commentLines: 0,
    blankLines: 0,
    physicalLines: 0,
    functions: 0,
    cc: 0,
    maxFn: 0,
    maxFnFile: '',
    maxFnName: '',
  };
}

function addToBucket(bucket, file) {
  bucket.files += 1;
  bucket.codeLines += file.codeLines;
  bucket.commentLines += file.commentLines;
  bucket.blankLines += file.blankLines;
  bucket.physicalLines += file.physicalLines;
  bucket.functions += file.functions;
  bucket.cc += file.cc;
  if (file.maxFn > bucket.maxFn) {
    bucket.maxFn = file.maxFn;
    bucket.maxFnFile = file.path;
    bucket.maxFnName = file.maxFnName;
  }
}

function collectRef(root, refInfo) {
  const paths = listFiles(root, refInfo.name);
  const files = [];
  const skipped = [];
  const configFiles = [];
  let scanned = 0;

  for (const path of paths) {
    const info = classifyPath(path);
    if (info.scope === 'excluded') {
      continue;
    }
    if (!info.isTs) {
      // 配置文件也参与「装配处」的口径说明，但不计行数/CC
      if (info.scope === 'cli' && info.category === 'assembly') configFiles.push(path);
      continue;
    }
    const text = readBlob(root, refInfo.name, path);
    if (text === null) {
      skipped.push(path);
      continue;
    }
    scanned += 1;
    const analysis = analyzeSource(text);
    files.push({
      path,
      scope: info.scope,
      category: info.scope === 'cli' ? info.category : null,
      physicalLines: analysis.lineStats.physical,
      codeLines: analysis.lineStats.code,
      commentLines: analysis.lineStats.comment,
      blankLines: analysis.lineStats.blank,
      functions: analysis.functions.length,
      cc: analysis.total,
      maxFn: analysis.max,
      maxFnName: analysis.maxName,
    });
  }

  const byCategory = new Map(CATEGORY_DEFS.map((def) => [def.id, emptyBucket(def.id, def.label)]));
  const test = emptyBucket('test', '测试');
  const vscode = emptyBucket('vscode', 'VSCode 扩展');

  for (const file of files) {
    if (file.scope === 'cli') addToBucket(byCategory.get(file.category), file);
    else if (file.scope === 'test') addToBucket(test, file);
    else if (file.scope === 'vscode') addToBucket(vscode, file);
  }

  const cliFiles = files.filter((file) => file.scope === 'cli');
  const totals = emptyBucket('cli', 'CLI 合计');
  for (const file of cliFiles) addToBucket(totals, file);

  return {
    ref: refInfo,
    scanned,
    skipped,
    configFiles,
    files,
    categories: CATEGORY_DEFS.map((def) => byCategory.get(def.id)),
    totals,
    test,
    vscode,
  };
}

const CATEGORY_ORDER = CATEGORY_DEFS.map((def) => def.id);

function delta(current, base) {
  return current - base;
}

/** 把「基线桶 + 目标桶」合并成一行对照数据（同时保留两端的绝对值，便于审阅者核对总量与增量）。 */
function compareBucket(base, current) {
  return {
    id: current.id,
    label: current.label,
    files: current.files,
    fromFiles: base.files,
    codeLines: current.codeLines,
    fromCodeLines: base.codeLines,
    commentLines: current.commentLines,
    fromCommentLines: base.commentLines,
    blankLines: current.blankLines,
    fromBlankLines: base.blankLines,
    physicalLines: current.physicalLines,
    fromPhysicalLines: base.physicalLines,
    functions: current.functions,
    fromFunctions: base.functions,
    cc: current.cc,
    fromCc: base.cc,
    maxFn: current.maxFn,
    maxFnFile: current.maxFnFile,
    maxFnName: current.maxFnName,
    deltaFiles: delta(current.files, base.files),
    deltaCodeLines: delta(current.codeLines, base.codeLines),
    deltaCommentLines: delta(current.commentLines, base.commentLines),
    deltaBlankLines: delta(current.blankLines, base.blankLines),
    deltaCc: delta(current.cc, base.cc),
  };
}

function buildComparison(from, to) {
  const categoryRows = CATEGORY_ORDER.map((id) =>
    compareBucket(
      from.categories.find((row) => row.id === id),
      to.categories.find((row) => row.id === id),
    ),
  );

  return {
    categories: categoryRows,
    totals: compareBucket(from.totals, to.totals),
    test: compareBucket(from.test, to.test),
    vscode: compareBucket(from.vscode, to.vscode),
    files: mergeFileRows(from.files, to.files),
    fromFiles: from.files,
    toFiles: to.files,
  };
}

function mergeFileRows(fromFiles, toFiles) {
  const key = (file) => `${file.scope}:${file.path}`;
  const baseMap = new Map(fromFiles.map((file) => [key(file), file]));
  const rows = [];
  for (const file of toFiles) {
    const base = baseMap.get(key(file));
    baseMap.delete(key(file));
    const unchanged =
      base !== undefined &&
      base.codeLines === file.codeLines &&
      base.commentLines === file.commentLines &&
      base.cc === file.cc;
    rows.push({
      path: file.path,
      scope: file.scope,
      category: file.category,
      status: base ? (unchanged ? '保留' : '变更') : '新增',
      codeLines: file.codeLines,
      commentLines: file.commentLines,
      blankLines: file.blankLines,
      physicalLines: file.physicalLines,
      functions: file.functions,
      cc: file.cc,
      maxFn: file.maxFn,
      maxFnName: file.maxFnName,
      fromCodeLines: base ? base.codeLines : null,
      fromCc: base ? base.cc : null,
      deltaCodeLines: base ? file.codeLines - base.codeLines : null,
      deltaCc: base ? file.cc - base.cc : null,
    });
  }
  for (const base of baseMap.values()) {
    rows.push({
      path: base.path,
      scope: base.scope,
      category: base.category,
      status: '删除',
      codeLines: 0,
      commentLines: 0,
      blankLines: 0,
      physicalLines: 0,
      functions: 0,
      cc: 0,
      maxFn: 0,
      maxFnName: '',
      fromCodeLines: base.codeLines,
      fromCc: base.cc,
      deltaCodeLines: -base.codeLines,
      deltaCc: -base.cc,
    });
  }
  const scopeOrder = { cli: 0, test: 1, vscode: 2 };
  const categoryRank = new Map(CATEGORY_ORDER.map((id, index) => [id, index]));
  rows.sort((a, b) => {
    const byScope = scopeOrder[a.scope] - scopeOrder[b.scope];
    if (byScope !== 0) return byScope;
    const byCat = (categoryRank.get(a.category) ?? 99) - (categoryRank.get(b.category) ?? 99);
    if (byCat !== 0) return byCat;
    return a.path.localeCompare(b.path, 'en');
  });
  return rows;
}

/** 变化最大的文件（按 |CC 增量|、再按 |代码行增量| 降序），用于 Top-N 表。 */
function topChangedFiles(files, limit) {
  return files
    .filter((row) => row.scope === 'cli')
    .filter((row) => (row.deltaCc ?? 0) !== 0 || (row.deltaCodeLines ?? 0) !== 0)
    .sort((a, b) => {
      const byCc = Math.abs(b.deltaCc ?? 0) - Math.abs(a.deltaCc ?? 0);
      if (byCc !== 0) return byCc;
      return Math.abs(b.deltaCodeLines ?? 0) - Math.abs(a.deltaCodeLines ?? 0);
    })
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// 6. 渲染：report.md / report.json
// ---------------------------------------------------------------------------

function sign(value) {
  if (value === null || value === undefined) return '—';
  if (value === 0) return '0';
  return value > 0 ? `+${value}` : `${value}`;
}

function ruleFor(def) {
  if (def.id === 'other') return '兜底：CLI 范围内未匹配上面三类的 TS 文件';
  return def.prefixes.map((prefix) => `\`${prefix}\``).join('、');
}

function refLine(refInfo) {
  const kind = refInfo.kind === 'tag' ? 'annotated tag 对象' : `${refInfo.kind} 对象`;
  return `\`${refInfo.name}\` → ${kind} \`${refInfo.objectSha.slice(0, 7)}\` → commit \`${refInfo.commitSha.slice(0, 7)}\``;
}

function renderMarkdown(comparison, meta) {
  const { from, to } = meta;
  const lines = [];
  const sameRef = from.commitSha === to.commitSha;
  const t = comparison.totals;

  lines.push('# 指标产物：CLI 代码指标（final → 目标 ref）');
  lines.push('');
  lines.push('> **本文件由脚本生成，不得手填。** 重新生成（幂等，产物不含时间戳）：');
  lines.push('>');
  lines.push('> ```bash');
  lines.push(`> ${meta.command}`);
  lines.push('> ```');
  lines.push('');
  lines.push('数据全部取自 **git 历史**（`git ls-tree -r --name-only <ref>` 枚举文件 + `git show <ref>:<path>` 读内容），不读工作区，因此未提交改动不会污染数字。');
  lines.push('');

  lines.push('## 1. Ref 与生成命令');
  lines.push('');
  lines.push('| 项 | 值 |');
  lines.push('|---|---|');
  lines.push(`| 基线 ref（\`--from\`） | ${refLine(from)} |`);
  lines.push(`| 目标 ref（\`--to\`） | ${refLine(to)} |`);
  lines.push(`| 生成命令 | \`${meta.command}\` |`);
  lines.push(`| 基线内容来源 | \`git ls-tree -r --name-only ${from.name}\` / \`git show ${from.name}:<path>\`（扫描 ${meta.fromScanned} 个 TS 文件） |`);
  lines.push(`| 目标内容来源 | \`git ls-tree -r --name-only ${to.name}\` / \`git show ${to.name}:<path>\`（扫描 ${meta.toScanned} 个 TS 文件） |`);
  lines.push(`| 统计口径版本 | \`${meta.schemaVersion}\`（口径说明见 [README.md](./README.md)） |`);
  lines.push('');
  if (sameRef) {
    lines.push(`> 注意：基线 \`${from.name}\` 与目标 \`${to.name}\` 指向同一提交 \`${to.commitSha.slice(0, 7)}\`，因此下表所有增量为 0 —— 这是预期结果（目标 ref 尚未引入代码变更），也顺带验证了脚本的幂等性。`);
    lines.push('');
  }

  lines.push('## 2. 按分区的行数 / 圈复杂度对照表');
  lines.push('');
  lines.push('分区口径（固定，脚本内 `CATEGORY_DEFS` 以前缀表表达）：');
  lines.push('');
  lines.push('| 类别 | 命中路径前缀 | 归类理由 |');
  lines.push('|---|---|---|');
  for (const def of CATEGORY_DEFS) {
    if (def.id === 'other') continue;
    lines.push(`| **${def.label}** | ${ruleFor(def)} | ${def.rationale} |`);
  }
  lines.push(`| 未分类（兜底） | ${ruleFor({ id: 'other' })} | ${CATEGORY_DEFS.find((d) => d.id === 'other').rationale} |`);
  lines.push('');
  const otherRow = comparison.categories.find((row) => row.id === 'other');
  lines.push(
    otherRow.files === 0
      ? '当前「未分类」为空：所有 CLI 范围 TS 文件都落在上面三类里。'
      : `⚠️ 当前有 **${otherRow.files}** 个 CLI 范围 TS 文件未归类（见第 6.1 节），请登记进 \`CATEGORY_DEFS\`。`,
  );
  lines.push('');

  lines.push('### 2.1 代码行数（主指标：非空、非注释行）');
  lines.push('');
  lines.push('| 类别 | 文件数 | 代码行（final） | 代码行（目标） | 代码行增量 | 注释行（目标） | 空行（目标） | 物理行（目标） |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const row of comparison.categories) {
    lines.push(
      `| **${row.label}** | ${row.files} | ${row.fromCodeLines} | ${row.codeLines} | ${sign(row.deltaCodeLines)} | ${row.commentLines} | ${row.blankLines} | ${row.physicalLines} |`,
    );
  }
  lines.push(
    `| **合计（CLI）** | **${t.files}** | **${t.fromCodeLines}** | **${t.codeLines}** | **${sign(t.deltaCodeLines)}** | **${t.commentLines}** | **${t.blankLines}** | **${t.physicalLines}** |`,
  );
  lines.push('');
  lines.push('行数口径：**代码行 = 非空、非注释行**（行内既有代码又有行尾注释时算代码行）；**注释行 / 空行 / 物理行（`wc -l` 口径）另列**，不参与增量结论。注释区间由词法扫描得到，不是用正则猜的。');
  lines.push('');

  lines.push('### 2.2 圈复杂度（CC，逐文件逐函数累加）');
  lines.push('');
  lines.push('| 类别 | 函数数（目标） | CC（final） | CC（目标） | CC 增量 | 最大函数 CC（目标） |');
  lines.push('|---|---:|---:|---:|---:|---|');
  for (const row of comparison.categories) {
    const maxCell = row.maxFn > 0 ? `${row.maxFn}（\`${row.maxFnFile}\` → \`${row.maxFnName}\`）` : '—';
    lines.push(
      `| **${row.label}** | ${row.functions} | ${row.fromCc} | ${row.cc} | ${sign(row.deltaCc)} | ${maxCell} |`,
    );
  }
  const maxTotal = comparison.categories.reduce(
    (best, row) => (row.maxFn > best.maxFn ? row : best),
    { maxFn: 0, maxFnFile: '', maxFnName: '' },
  );
  const totalMaxCell = maxTotal.maxFn > 0 ? `${maxTotal.maxFn}（\`${maxTotal.maxFnFile}\` → \`${maxTotal.maxFnName}\`）` : '—';
  lines.push(
    `| **合计（CLI）** | **${t.functions}** | **${t.fromCc}** | **${t.cc}** | **${sign(t.deltaCc)}** | ${totalMaxCell} |`,
  );
  lines.push('');
  lines.push(`增量口径：\`${to.name}\` − \`${from.name}\`。CC 判定项：\`if\`、\`for\`、\`while\`、\`do\`、\`case\`、\`catch\`、\`&&\`、\`||\`、\`??\`、三元 \`? :\`（\`else if\` 由其中的 \`if\` 计一次）；每个函数基础值 1，文件 CC ＝ 各函数 CC 之和（含顶层伪函数）。**这是词法级估算值**，用于趋势与增量对比，详见 [README.md](./README.md)。`);
  lines.push('');

  lines.push('### 2.3 变化最大的文件（Top-10，按 |CC 增量| 降序）');
  lines.push('');
  const top = topChangedFiles(comparison.files, 10);
  if (top.length === 0) {
    lines.push('基线 ref 与目标 ref 的文件级指标完全一致：没有变化文件（本次增量全为 0）。');
  } else {
    lines.push('| 文件 | 类别 | 状态 | 代码行（final → 目标） | 代码行增量 | CC（final → 目标） | CC 增量 |');
    lines.push('|---|---|---|---|---:|---|---:|');
    for (const row of top) {
      const catLabel = row.category ? labelOfCategory(row.category) : '—';
      lines.push(
        `| \`${row.path}\` | ${catLabel} | ${row.status} | ${row.fromCodeLines ?? '—'} → ${row.codeLines} | ${sign(row.deltaCodeLines)} | ${row.fromCc ?? '—'} → ${row.cc} | ${sign(row.deltaCc)} |`,
      );
    }
  }
  lines.push('');

  lines.push('## 3. 测试与 fixtures（单独一行，不计入三类、不计入 CC 增量）');
  lines.push('');
  lines.push('| 范围 | 文件数 | 代码行（final） | 代码行（目标） | 代码行增量 | CC（仅供参考） |');
  lines.push('|---|---:|---:|---:|---:|---:|');
  lines.push(`| \`test/\`（含 `+"`*.test.ts`"+`） | ${comparison.test.files} | ${comparison.test.fromCodeLines} | ${comparison.test.codeLines} | ${sign(comparison.test.deltaCodeLines)} | ${comparison.test.cc} |`);
  lines.push('');
  lines.push('测试代码衡量的是「测试量」，不属于重构后交付源码的规模，因此单列；它不参与内核/装配处/插件的行数与 CC 增量。');
  lines.push('');

  lines.push('## 4. VSCode 扩展（单独一节，不计入 CLI 增量）');
  lines.push('');
  lines.push('| 范围 | 文件数 | 代码行（final） | 代码行（目标） | 代码行增量 | CC（仅供参考） |');
  lines.push('|---|---:|---:|---:|---:|---:|');
  lines.push(`| \`vscode-extension/\` | ${comparison.vscode.files} | ${comparison.vscode.fromCodeLines} | ${comparison.vscode.codeLines} | ${sign(comparison.vscode.deltaCodeLines)} | ${comparison.vscode.cc} |`);
  lines.push('');
  lines.push('VSCode 扩展是 CLI 之外的另一个交付物（自己的打包与依赖），把它混进 CLI 增量会掩盖真正的重构收益，因此口径上完全隔离：只列数字，不进第 2 节的任何一行。');
  lines.push('');

  lines.push('## 5. 排除项');
  lines.push('');
  lines.push('| 排除对象 | 原因 |');
  lines.push('|---|---|');
  lines.push('| `node_modules/` | 第三方依赖（不是本项目写的代码） |');
  lines.push('| `dist/` | 构建产物（由 `src/` 编译而来，重复计数会翻倍） |');
  lines.push('| `vscode-extension/` | 单独一节（见第 4 节） |');
  lines.push('| `test/`、任意层级 `test/`·`tests/` 目录、`*.test.ts`、`*.spec.ts`（含 `plugins/*/test/`） | 测试与 fixtures，单独一行（见第 3 节） |');
  lines.push('| 非 `*.ts` 文件 | 本指标只统计 TS 源码（`*.mjs` 脚本、`*.json`、`*.md`、`*.svg` 等不计） |');
  lines.push(`| 二进制文件、子模块 | \`git show\` 取不到文本内容，跳过（本次跳过 ${meta.skipped.length} 个） |`);
  lines.push('');
  if (meta.configFiles.length > 0) {
    const configList = meta.configFiles.map((path) => `\`${path}\``).join('、');
    lines.push(`装配配置：${configList} 属于「装配处」，但它是 JSON 配置而非 \`*.ts\`，按上面的口径不计行数/CC（在第 2 节里为 0）。`);
    lines.push('');
  }

  lines.push('## 6. 文件级明细（目标 ref，全量）');
  lines.push('');
  lines.push('`状态`：新增 / 变更 / 保留 / 删除（相对基线 ref）。CC 为每文件「逐函数 CC 之和」。');
  lines.push('');
  const cliRows = comparison.files.filter((row) => row.scope === 'cli');
  lines.push('### 6.1 CLI 范围');
  lines.push('');
  if (cliRows.length === 0) {
    lines.push('（无 CLI 范围 TS 文件）');
  } else {
    lines.push('| 文件 | 类别 | 状态 | 代码行 | 代码行增量 | 注释行 | 空行 | 函数数 | CC | CC 增量 | 最高函数 |');
    lines.push('|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|');
    for (const row of cliRows) {
      const maxCell = row.maxFn > 0 ? `${row.maxFn} \`${row.maxFnName}\`` : '—';
      const catLabel = row.category ? labelOfCategory(row.category) : '—';
      lines.push(
        `| \`${row.path}\` | ${catLabel} | ${row.status} | ${row.codeLines} | ${sign(row.deltaCodeLines)} | ${row.commentLines} | ${row.blankLines} | ${row.functions} | ${row.cc} | ${sign(row.deltaCc)} | ${maxCell} |`,
      );
    }
  }
  lines.push('');

  const testRows = comparison.files.filter((row) => row.scope === 'test');
  lines.push('### 6.2 测试与 fixtures');
  lines.push('');
  if (testRows.length === 0) {
    lines.push('（无测试 TS 文件）');
  } else {
    lines.push('| 文件 | 状态 | 代码行 | 代码行增量 | 函数数 | CC（参考） |');
    lines.push('|---|---|---|---:|---:|---:|');
    for (const row of testRows) {
      lines.push(`| \`${row.path}\` | ${row.status} | ${row.codeLines} | ${sign(row.deltaCodeLines)} | ${row.functions} | ${row.cc} |`);
    }
  }
  lines.push('');

  const vscodeRows = comparison.files.filter((row) => row.scope === 'vscode');
  lines.push('### 6.3 VSCode 扩展');
  lines.push('');
  if (vscodeRows.length === 0) {
    lines.push('（该 ref 下没有 `vscode-extension/` 的 TS 文件）');
  } else {
    lines.push('| 文件 | 状态 | 代码行 | 代码行增量 | 函数数 | CC（参考） |');
    lines.push('|---|---|---|---:|---:|---:|');
    for (const row of vscodeRows) {
      lines.push(`| \`${row.path}\` | ${row.status} | ${row.codeLines} | ${sign(row.deltaCodeLines)} | ${row.functions} | ${row.cc} |`);
    }
  }
  lines.push('');

  lines.push('## 7. 方法与局限（摘要）');
  lines.push('');
  lines.push('1. **数据源**：只读 git 历史（`git ls-tree -r --name-only <ref>` 枚举，`git show <ref>:<path>` 取内容）。工作区里改了一半的文件、未跟踪文件都不会影响对比。');
  lines.push('2. **行数**：代码行 = 非空、非注释行；注释行、空行、物理行另列。注释区间来自词法扫描（`//`、`/* */`），不做启发式猜测。');
  lines.push('3. **CC 算法**：先做词法扫描（跳过注释、字符串、模板串文本、正则字面量；模板串 `${}` 内部照常扫描），再逐函数累加决策点：`if`、`for`、`while`、`do`、`case`、`catch`、`&&`、`||`、`??`、三元 `? :`；`else`/`default`/`try` 不加点，`else if` 只由其中的 `if` 计一次，`do{}while()` 的收尾 `while` 不重复计点。函数基础值 1。');
  lines.push('4. **函数界定**：以带块体的函数/方法/构造器/箭头函数为界（`function f(){…}`、`class C { m(){…} }`、`m(): T[] {…}`、`const f = () => {…}` 都能识别）；顶层代码若含决策点，计为一条 `<模块顶层>` 记录。');
  lines.push('5. **估算值**：这是词法级近似（不做 TS 语法分析）；箭头函数的简写体（`x => a || b`，无花括号）的决策点归入外层函数。用途是趋势与增量对比，不适合当绝对质量门限。');
  lines.push('6. **幂等**：产物不含时间戳；同一对 ref 重复生成得到字节相同的文件。');
  lines.push('');
  lines.push('机器可读的同源数据见 [report.json](./report.json)；口径细节、复现命令、为什么排除 VSCode 扩展与测试见 [README.md](./README.md)；逐文件职责见 [files.md](./files.md)。');
  lines.push('');
  return lines.join('\n');
}

function renderJson(comparison, meta) {
  const bucketJson = (row) => ({
    label: row.label,
    files: { from: row.fromFiles, to: row.files, delta: row.deltaFiles },
    codeLines: { from: row.fromCodeLines, to: row.codeLines, delta: row.deltaCodeLines },
    commentLines: { from: row.fromCommentLines, to: row.commentLines, delta: row.deltaCommentLines },
    blankLines: { from: row.fromBlankLines, to: row.blankLines, delta: row.deltaBlankLines },
    physicalLines: { from: row.fromPhysicalLines, to: row.physicalLines, delta: row.physicalLines - row.fromPhysicalLines },
    functions: { from: row.fromFunctions, to: row.functions, delta: row.functions - row.fromFunctions },
    cc: { from: row.fromCc, to: row.cc, delta: row.deltaCc },
    maxFn: row.maxFn,
    maxFnFile: row.maxFnFile,
    maxFnName: row.maxFnName,
  });

  const payload = {
    schemaVersion: meta.schemaVersion,
    tool: SCRIPT_PATH,
    command: meta.command,
    refs: {
      from: {
        name: meta.from.name,
        objectSha: meta.from.objectSha,
        commitSha: meta.from.commitSha,
        objectType: meta.from.kind,
        scannedTsFiles: meta.fromScanned,
      },
      to: {
        name: meta.to.name,
        objectSha: meta.to.objectSha,
        commitSha: meta.to.commitSha,
        objectType: meta.to.kind,
        scannedTsFiles: meta.toScanned,
      },
      sameCommit: meta.from.commitSha === meta.to.commitSha,
    },
    method: {
      dataSource: 'git ls-tree -r --name-only <ref> + git show <ref>:<path>（只读 git 历史，不读工作区）',
      countedExtensions: ['.ts'],
      lines: {
        primary: 'codeLines = 非空且非注释行（行内既有代码又有行尾注释时记为代码行）',
        alsoReported: ['commentLines（整行注释）', 'blankLines（仅空白）', 'physicalLines（wc -l 口径）'],
        commentDetection: '词法扫描得到的注释区间（// 与 /* */），非正则启发式',
        note: '多行模板串/字符串的内容行记为代码行（它们是程序字面量，不是注释）',
      },
      exclusions: [
        { pattern: 'node_modules/', reason: '第三方依赖包' },
        { pattern: 'dist/', reason: '构建产物' },
        { pattern: 'vscode-extension/', reason: 'VSCode 扩展，单独一节，不计入 CLI 增量' },
        { pattern: 'test/、**/test/、**/tests/、*.test.ts、*.spec.ts', reason: '测试与 fixtures，单独一行' },
        { pattern: '非 *.ts', reason: '只统计 TS 源码' },
      ],
      categories: CATEGORY_DEFS.map((def) => ({
        id: def.id,
        label: def.label,
        prefixes: def.prefixes,
        description: def.description,
        rationale: def.rationale,
      })),
      cc: {
        baseValuePerFunction: 1,
        decisionPoints: [
          'if', 'else if（即其中的 if，每个 if 只计一次）', 'for', 'while', 'do',
          'case（每个 case 标签）', 'catch', '&&', '||', '??', '三元 ? :',
        ],
        notCounted: ['else', 'default', 'try', 'finally', '&&=', '||=', '??=', 'do-while 的收尾 while'],
        aggregation: '函数 CC = 1 + 决策点数；文件 CC = Σ 各函数 CC（含顶层伪函数）；分区/总计 CC = Σ 文件 CC',
        estimation: '词法级估算（不做 TS 语法分析），非 MCCabe 工具链精确输出',
      },
    },
    summary: {
      cli: bucketJson(comparison.totals),
      categories: comparison.categories.map((row) => ({ id: row.id, ...bucketJson(row) })),
      test: bucketJson(comparison.test),
      vscodeExtension: bucketJson(comparison.vscode),
    },
    topChangedFiles: topChangedFiles(comparison.files, 10).map((row) => ({
      path: row.path,
      category: row.category,
      status: row.status,
      deltaCodeLines: row.deltaCodeLines,
      deltaCc: row.deltaCc,
      codeLines: { from: row.fromCodeLines, to: row.codeLines },
      cc: { from: row.fromCc, to: row.cc },
    })),
    files: comparison.files.map((row) => ({
      path: row.path,
      scope: row.scope,
      category: row.category,
      status: row.status,
      codeLines: row.codeLines,
      commentLines: row.commentLines,
      blankLines: row.blankLines,
      physicalLines: row.physicalLines,
      deltaCodeLines: row.deltaCodeLines,
      functions: row.functions,
      cc: row.cc,
      deltaCc: row.deltaCc,
      maxFn: row.maxFn,
      maxFnName: row.maxFnName,
    })),
    notes: [
      '数字由脚本从 git 历史生成，不接受手填。',
      '代码行 = 非空、非注释行；注释行/空行/物理行另列。',
      'CC 为词法级估算值（逐函数 1 + 决策点数），用于趋势与增量对比，不作为绝对质量门限。',
      'VSCode 扩展与测试只列数字，不进 CLI 三类与 CC 增量。',
      '产物不含时间戳，同样的 ref 生成同样的内容（幂等）。',
      `本次跳过（二进制/子模块/不可读）：${meta.skipped.length} 个${meta.skipped.length > 0 ? `（${meta.skipped.join(', ')}）` : ''}`,
      meta.configFiles.length > 0
        ? `装配配置（非 *.ts，不计行数/CC）：${meta.configFiles.join(', ')}`
        : '装配配置（非 *.ts，不计行数/CC）：无',
    ],
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

const SELFTEST_CASES = [
  {
    name: '无分支函数：CC = 1',
    src: 'function f() { return 1; }',
    expect: { total: 1, functions: 1, max: 1 },
  },
  {
    name: 'if / else if：两个决策点（else if 只算其中的 if）',
    src: 'function f(a) { if (a) { return 1; } else if (a === 2) { return 2; } return 3; }',
    expect: { total: 3, functions: 1, max: 3 },
  },
  {
    name: 'do-while 只计一个决策点（收尾 while 不重复计）',
    src: 'function f() { let i = 0; do { i += 1; } while (i < 3); return i; }',
    expect: { total: 2, functions: 1 },
  },
  {
    name: 'for + while 各计 1',
    src: 'function f(n) { let s = 0; for (let i = 0; i < n; i += 1) { s += i; } while (s > 0) { s -= 1; } return s; }',
    expect: { total: 3, functions: 1 },
  },
  {
    name: 'switch：每个 case 计 1（default 不计）',
    src: 'function f(v) { switch (v) { case 1: return "a"; case 2: return "b"; default: return "c"; } }',
    expect: { total: 3, functions: 1 },
  },
  {
    name: 'catch 计 1（try 不计）',
    src: 'function f() { try { return g(); } catch (e) { return null; } }',
    expect: { total: 2, functions: 1 },
  },
  {
    name: '字符串 / 注释 / 正则里的假决策点不计',
    src: [
      'function f(s) {',
      '  // 注释里的 if (a && b) 不算',
      '  const a = "if (x) && y || z";',
      '  const c = /a|b?/.test(s);',
      '  /* { if (a) { } } */',
      '  return c;',
      '}',
    ].join('\n'),
    expect: { total: 1, functions: 1, max: 1 },
  },
  {
    name: '模板串文本不计，但 ${} 内的三元计',
    src: 'function f(s) { return `a ${s ? 1 : 2} b if && ||`; }',
    expect: { total: 2, functions: 1 },
  },
  {
    name: '嵌套函数各自计基础值',
    src: 'function outer(a) { const inner = (b) => { return b || a; }; return inner; }',
    expect: { total: 3, functions: 2 },
  },
  {
    name: '可选链 ?. 与可选属性 ?: 不是三元；?? 计点',
    src: 'interface P { a?: string; }\nfunction f(p: P): string { return p.a ?? ""; }',
    expect: { total: 2, functions: 1 },
  },
  {
    name: '可选方法 foo?() 不是三元',
    src: 'interface P { b?(): void; }\nfunction f(p: P) { p.b?.(); return 0; }',
    expect: { total: 1, functions: 1 },
  },
  {
    name: '除法不误判为正则',
    src: 'function f(a, b) { const c = a / b; return c; }',
    expect: { total: 1, functions: 1 },
  },
  {
    name: '正则字面量里的 | 与 ? 不计数',
    src: 'function f(s) { return s.split(/[\\s,]+/).filter((x) => x.length > 0); }',
    expect: { total: 1, functions: 1 },
  },
  {
    name: '正则字面量后紧跟除法仍被判为除号',
    src: 'function f(s) { const re = /a|b/; const half = s.length / 2; return re.test(s) && half > 0; }',
    expect: { total: 2, functions: 1 },
  },
  {
    name: '带返回类型标注的方法体识别为函数',
    src: 'class C {\n  map<T>(x: T): T[] { return [x]; }\n}',
    expect: { total: 1, functions: 1, max: 1 },
  },
  {
    name: '类字段箭头函数识别为函数',
    src: 'class C { f = (a) => { return a || 1; }; }',
    expect: { total: 2, functions: 1, max: 2 },
  },
  {
    name: '顶层决策点计为一条伪函数',
    src: 'const x = a ? 1 : 2;',
    expect: { total: 2, functions: 1, max: 2 },
  },
  {
    name: '没有决策点时顶层不产生伪函数',
    src: 'const s = "if (a && b) c ? d : e";',
    expect: { total: 0, functions: 0 },
  },
  {
    name: '箭头函数简写体：决策点归外层函数（已知局限）',
    src: 'function f(a) { return [1].filter((x) => x > a && x < 9); }',
    expect: { total: 2, functions: 1 },
  },
];

function runSelfTest() {
  let failed = 0;
  process.stdout.write(`自检：${SELFTEST_CASES.length} 个用例\n`);
  for (const testCase of SELFTEST_CASES) {
    const result = analyzeSource(testCase.src);
    const problems = [];
    if (testCase.expect.total !== undefined && result.total !== testCase.expect.total) {
      problems.push(`total 期望 ${testCase.expect.total} 实得 ${result.total}`);
    }
    if (testCase.expect.functions !== undefined && result.functions.length !== testCase.expect.functions) {
      problems.push(`函数数 期望 ${testCase.expect.functions} 实得 ${result.functions.length}`);
    }
    if (testCase.expect.max !== undefined && result.max !== testCase.expect.max) {
      problems.push(`最高函数 CC 期望 ${testCase.expect.max} 实得 ${result.max}`);
    }
    if (problems.length === 0) {
      process.stdout.write(`  ✅ ${testCase.name}（CC ${result.total}，函数 ${result.functions.length}）\n`);
    } else {
      failed += 1;
      process.stdout.write(`  ❌ ${testCase.name}：${problems.join('；')}\n`);
      process.stdout.write(`     函数明细：${result.functions.map((fn) => `${fn.name}=${fn.cc}`).join(', ')}\n`);
    }
  }
  if (failed > 0) {
    process.stderr.write(`自检失败：${failed} 个用例不通过\n`);
    return 1;
  }
  process.stdout.write('自检通过\n');
  return 0;
}

// ---------------------------------------------------------------------------
// 8. CLI 入口
// ---------------------------------------------------------------------------

function usage() {
  return [
    '指标产物生成器（从 git 历史计算行数 / 圈复杂度增量）',
    '',
    '用法：',
    `  node ${SCRIPT_PATH} [--from <ref>] [--to <ref>] [--out-dir <dir>]`,
    `  node ${SCRIPT_PATH} --selftest`,
    `  node ${SCRIPT_PATH} --help`,
    '',
    '选项：',
    `  --from <ref>     基线 ref（默认 ${DEFAULT_FROM}）`,
    `  --to <ref>       目标 ref（默认 ${DEFAULT_TO}）`,
    `  --out-dir <dir>  产物目录（默认 ${DEFAULT_OUT_DIR}）`,
    '  --selftest       只跑内置词法/CC 自检，不读仓库',
    '  --help           显示本帮助',
    '',
    '退出码：0 成功；1 自检失败；2 参数或 git/ref 错误。',
  ].join('\n');
}

function fail(message, code = 2) {
  process.stderr.write(`error: ${message}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  const options = { from: DEFAULT_FROM, to: DEFAULT_TO, outDir: DEFAULT_OUT_DIR, selftest: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const readValue = (flag) => {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) fail(`${flag} 需要一个 ref 参数`);
      i += 1;
      return value;
    };
    switch (arg) {
      case '--from':
        options.from = readValue('--from');
        break;
      case '--to':
        options.to = readValue('--to');
        break;
      case '--out-dir':
        options.outDir = readValue('--out-dir');
        break;
      case '--selftest':
        options.selftest = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        fail(`未知参数：${arg}\n\n${usage()}`);
    }
  }
  return options;
}

function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }
  if (options.selftest) {
    return runSelfTest();
  }

  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const root = resolveRepoRoot(process.cwd()) ?? resolveRepoRoot(scriptDir);
  if (!root) fail('当前目录不在 git 仓库里（找不到 git 工作树）。请在仓库内运行本脚本。');

  const from = resolveRef(root, options.from);
  if (!from) {
    fail(
      `ref 不存在或无法解析：--from ${options.from}\n` +
        '可用 ref 举例：`final`（阶段 1 定稿 tag）、`main`、`HEAD`、某个 commit sha。\n' +
        '用 `git tag -l` / `git log --oneline` 查看当前仓库实际存在的 ref。',
    );
  }
  const to = resolveRef(root, options.to);
  if (!to) {
    fail(
      `ref 不存在或无法解析：--to ${options.to}\n` +
        '可用 ref 举例：`HEAD`、`main`、某个 commit sha；阶段 2 完成后才有 `p2` tag。\n' +
        '用 `git tag -l` / `git log --oneline` 查看当前仓库实际存在的 ref。',
    );
  }

  const command = `node ${SCRIPT_PATH} --from ${options.from} --to ${options.to}`;
  const fromData = collectRef(root, from);
  const toData = collectRef(root, to);
  const comparison = buildComparison(fromData, toData);

  const meta = {
    schemaVersion: '1',
    command,
    from,
    to,
    fromScanned: fromData.scanned,
    toScanned: toData.scanned,
    skipped: [...new Set([...fromData.skipped, ...toData.skipped])],
    configFiles: [...new Set([...fromData.configFiles, ...toData.configFiles])],
  };

  const outDir = resolve(root, options.outDir);
  mkdirSync(outDir, { recursive: true });
  const markdownPath = join(outDir, 'report.md');
  const jsonPath = join(outDir, 'report.json');
  writeFileSync(markdownPath, renderMarkdown(comparison, meta), 'utf8');
  writeFileSync(jsonPath, renderJson(comparison, meta), 'utf8');

  const t = comparison.totals;
  process.stdout.write(
    [
      `指标产物已生成：${options.from} → ${options.to}（${from.commitSha.slice(0, 7)} → ${to.commitSha.slice(0, 7)}）`,
      `  CLI 范围：文件 ${t.files}（${sign(t.deltaFiles)}）、代码行 ${t.codeLines}（${sign(t.deltaCodeLines)}）、CC ${t.cc}（${sign(t.deltaCc)}）`,
      ...comparison.categories.map(
        (row) => `    ${row.label}：文件 ${row.files}、代码行 ${row.codeLines}（${sign(row.deltaCodeLines)}）、CC ${row.cc}（${sign(row.deltaCc)}）`,
      ),
      `  测试：文件 ${comparison.test.files}、代码行 ${comparison.test.codeLines}（${sign(comparison.test.deltaCodeLines)}）`,
      `  VSCode 扩展：文件 ${comparison.vscode.files}、代码行 ${comparison.vscode.codeLines}（${sign(comparison.vscode.deltaCodeLines)}）`,
      `  写出：${markdownPath}`,
      `  写出：${jsonPath}`,
    ].join('\n') + '\n',
  );
  return 0;
}

// ---------------------------------------------------------------------------
// 9. 入口守卫 + 供审阅/调试用的导出
// ---------------------------------------------------------------------------

const ENTRY_PATH = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const isEntryPoint = invokedPath !== '' && resolve(ENTRY_PATH) === resolve(invokedPath);
if (isEntryPoint) {
  process.exitCode = main(process.argv.slice(2));
}

export { analyzeSource, classifyPath, computeLineStats, renderJson, renderMarkdown, tokenize, CATEGORY_DEFS, main };
