import { EditorError } from '../../../src/domain/EditorError.js';
import type {
  CommandContribution,
  CommandEnvironment,
  CommandInvocation,
} from '../../../src/plugin-api/index.js';
import { StatsCounter } from './StatsCounter.js';

/**
 * `stats`：图形统计（需求 §2.1）。
 *
 * 只读命令：不提交任何编辑，因此**不进入 undo 栈**，也不改变 dirty 状态。
 * 未执行 `init`/`read` 时按缺省行为报 `no document`（与其它文档类命令一致）。
 */
export class StatsCommand implements CommandContribution {
  readonly commandName = 'stats';

  readonly usage = 'stats';

  readonly summary = 'count shapes by type (containers counted separately)';

  create(args: string[], _environment: CommandEnvironment): CommandInvocation {
    if (args.length !== 0) {
      throw new EditorError(`usage: ${this.usage}`);
    }
    return {
      run: (host) => [StatsCounter.describe(host.document)],
    };
  }
}
