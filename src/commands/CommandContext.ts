import type { EditHost } from '../plugin-api/EditHost.js';

/**
 * 命令执行时能拿到的东西（= 插件 API 的 `EditHost`）。
 *
 * 不是巧合：`Command` 结构性实现了 `UndoableEdit`，所以插件命令
 * 通过 `host.commitEdit(edit)` 提交的编辑与内置命令进的是同一个 undo 栈。
 */
export type CommandContext = EditHost;
