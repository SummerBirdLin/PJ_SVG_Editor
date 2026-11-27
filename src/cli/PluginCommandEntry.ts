import type { EditorSession } from '../app/EditorSession.js';
import type { CommandContribution, CommandEnvironment } from '../plugin-api/CommandContribution.js';
import type { ActionContext } from './ActionContext.js';
import type { CommandEntry } from './CommandEntry.js';
import type { Runnable } from './Runnable.js';

/**
 * 插件命令 → 注册表条目的适配器（Adapter）。
 *
 * 插件只认识 `CommandContribution` / `CommandHost`；注册表把它们接到
 * 阶段 1 的 `CommandEntry` / `Runnable` 协议上，于是 Repl、`help` 与
 * 内置命令走的是同一套分派，插件命令不需要任何特殊分支。
 */
export class PluginCommandEntry implements CommandEntry {
  private readonly contribution: CommandContribution;

  private readonly environment: CommandEnvironment;

  constructor(contribution: CommandContribution, environment: CommandEnvironment) {
    this.contribution = contribution;
    this.environment = environment;
  }

  get commandName(): string {
    return this.contribution.commandName;
  }

  get usage(): string {
    return this.contribution.usage;
  }

  get summary(): string {
    return this.contribution.summary;
  }

  parse(args: string[], _context: ActionContext): Runnable {
    const invocation = this.contribution.create(args, this.environment);
    return {
      run: (session: EditorSession): string[] => invocation.run(session),
    };
  }
}
