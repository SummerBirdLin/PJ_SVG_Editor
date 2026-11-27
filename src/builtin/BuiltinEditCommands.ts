import { AddToCommand } from '../commands/AddToCommand.js';
import { BackCommand } from '../commands/BackCommand.js';
import { CreateCommand } from '../commands/CreateCommand.js';
import { DeleteCommand } from '../commands/DeleteCommand.js';
import { FrontCommand } from '../commands/FrontCommand.js';
import { GroupCommand } from '../commands/GroupCommand.js';
import { MoveCommand } from '../commands/MoveCommand.js';
import { ScaleCommand } from '../commands/ScaleCommand.js';
import { SetCommand } from '../commands/SetCommand.js';
import { UngroupCommand } from '../commands/UngroupCommand.js';
import { EditCommandContribution } from '../commands/EditCommandContribution.js';
import { ContributionDeclarations } from '../plugin-api/ContributionDeclarations.js';
import type { PluginModule } from '../plugin-api/PluginContext.js';

/**
 * 内置编辑命令插件：阶段 1 的 10 条可撤销命令，经 `EditCommandContribution`
 * 适配成命令扩展点的实现，与第三方命令进入同一张注册表。
 *
 * 9 条会话动作（init/read/save/canvas/tree/show/help/undo/redo）**不在这里**：
 * 它们需要完整会话门面（IO、历史闸门、Presenters），由装配处作为"会话动作"注入，
 * 见 doc/README.md 的扩展点清单中对 Command 扩展点的范围说明。
 */
export const builtinEditCommands: PluginModule = {
  name: 'builtin-edit-commands',
  contributes: ContributionDeclarations.fromPlain(
    {
      commands: [
        'create',
        'delete',
        'move',
        'scale',
        'set',
        'group',
        'ungroup',
        'addto',
        'front',
        'back',
      ],
    },
    'builtin-edit-commands',
  ),
  activate(context) {
    for (const commandClass of [
      CreateCommand,
      DeleteCommand,
      MoveCommand,
      ScaleCommand,
      SetCommand,
      GroupCommand,
      UngroupCommand,
      AddToCommand,
      FrontCommand,
      BackCommand,
    ]) {
      context.registerCommand(new EditCommandContribution(commandClass));
    }
  },
};
