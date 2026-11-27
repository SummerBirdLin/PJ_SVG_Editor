import { ActionEntry } from '../cli/ActionEntry.js';
import { CanvasAction } from '../cli/action/CanvasAction.js';
import { HelpAction } from '../cli/action/HelpAction.js';
import { InitAction } from '../cli/action/InitAction.js';
import { ReadAction } from '../cli/action/ReadAction.js';
import { RedoAction } from '../cli/action/RedoAction.js';
import { SaveAction } from '../cli/action/SaveAction.js';
import { ShowAction } from '../cli/action/ShowAction.js';
import { TreeAction } from '../cli/action/TreeAction.js';
import { UndoAction } from '../cli/action/UndoAction.js';
import type { CommandEntry } from '../cli/CommandEntry.js';

/**
 * 内置会话动作（9 条）：init/read/save/canvas/tree/show/help/undo/redo。
 *
 * 它们直接依赖会话门面（`EditorSession`）与 Presenter，因此不是"插件命令"
 * （插件命令只能看到 `CommandHost`），而是由装配处注入注册表的宿主能力。
 * 注册表本身不硬编码这些名字——换一套动作表就是另一种宿主（如 GUI 通道）。
 *
 * 分成两组是为了保持阶段 1 的 `help` 输出顺序：
 * 文档命令 → 编辑命令（来自插件目录）→ 显示与撤销命令。
 */
export function documentSessionActions(): readonly CommandEntry[] {
  return [
    new ActionEntry(InitAction),
    new ActionEntry(ReadAction),
    new ActionEntry(SaveAction),
    new ActionEntry(CanvasAction),
  ];
}

export function displaySessionActions(): readonly CommandEntry[] {
  return [
    new ActionEntry(TreeAction),
    new ActionEntry(ShowAction),
    new ActionEntry(HelpAction),
    new ActionEntry(UndoAction),
    new ActionEntry(RedoAction),
  ];
}
