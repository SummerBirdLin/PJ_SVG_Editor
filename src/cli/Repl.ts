import type { EditorSession } from '../app/EditorSession.js';
import { EditorError } from '../domain/EditorError.js';
import type { CommandRegistry } from './CommandRegistry.js';
import type { ReplOptions } from './ReplOptions.js';
import type { TextOutput } from './TextOutput.js';
import type { Tokenizer } from './Tokenizer.js';

/**
 * REPL：行 → 分词 → 注册表 → 打印结果。
 *
 * - 空行与 `#` 开头的行忽略（`#` 只在行首是注释，行中的 `#4a90d9` 是颜色）；
 * - 错误统一输出 `error: <消息>`，一行一条，且不改变文档状态；
 * - `exit` / `quit` 是 REPL 元命令（不是 19 条命令之一）；
 * - banner/prompt 由 main.ts 依据 TTY 决定，管道回放时不输出任何提示符。
 */
export class Repl {
  private readonly tokenizer: Tokenizer;

  private readonly registry: CommandRegistry;

  private readonly session: EditorSession;

  private readonly output: TextOutput;

  private readonly options: ReplOptions;

  constructor(
    tokenizer: Tokenizer,
    registry: CommandRegistry,
    session: EditorSession,
    output: TextOutput,
    options: ReplOptions = {},
  ) {
    this.tokenizer = tokenizer;
    this.registry = registry;
    this.session = session;
    this.output = output;
    this.options = options;
  }

  async run(lines: AsyncIterable<string>): Promise<void> {
    if (this.options.banner !== undefined) {
      this.output.write(`${this.options.banner}\n`);
    }
    this.writePrompt();

    for await (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0 || trimmed.startsWith('#')) {
        this.writePrompt();
        continue;
      }
      try {
        const tokens = this.tokenizer.tokenize(trimmed);
        const commandName = tokens[0];
        if (commandName === undefined) {
          this.writePrompt();
          continue;
        }
        if (commandName === 'exit' || commandName === 'quit') {
          return;
        }
        const runnable = this.registry.parseAndCreate(commandName, tokens.slice(1));
        for (const outputLine of runnable.run(this.session)) {
          this.output.write(`${outputLine}\n`);
        }
      } catch (error) {
        if (error instanceof EditorError) {
          this.output.write(`error: ${error.message}\n`);
        } else {
          // 兜底：任何未预期异常都只输出一行错误，REPL 继续运行而不是打印堆栈退出
          const detail = error instanceof Error ? error.message : String(error);
          this.output.write(`error: internal error: ${detail}\n`);
        }
      }
      this.writePrompt();
    }
  }

  private writePrompt(): void {
    if (this.options.prompt !== undefined) {
      this.output.write(this.options.prompt);
    }
  }
}
