import type { EditorSession } from '../app/EditorSession.js';

/**
 * 所有命令行条目最终都产生一个 `Runnable`：
 * Repl 只负责"取一行 → 分词 → 交给注册表 → 打印返回的行"，
 * 不区分编辑命令、IO 命令与显示命令（只有一处按名分派）。
 */
export interface Runnable {
  run(session: EditorSession): string[];
}
