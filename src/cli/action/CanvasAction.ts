import type { EditorSession } from '../../app/EditorSession.js';
import { EditorError } from '../../domain/EditorError.js';
import { NumberFormat } from '../../domain/NumberFormat.js';
import type { ActionContext } from '../ActionContext.js';
import type { Runnable } from '../Runnable.js';

/** `canvas [w] [h]`：无参显示尺寸；带参修改尺寸（IO 命令，置 undo 闸门）。 */
export class CanvasAction implements Runnable {
  static readonly commandName = 'canvas';

  static readonly usage = 'canvas [w] [h]';

  static readonly summary = 'show the canvas size, or resize it when width/height are given';

  static parse(args: string[], _context: ActionContext): CanvasAction {
    if (args.length === 0) {
      return new CanvasAction(null, null);
    }
    if (args.length === 1) {
      // `canvas <w>`：只改宽度，高度沿用当前值（与 init 单参行为一致）
      return new CanvasAction(NumberFormat.parse(args[0] ?? ''), null);
    }
    if (args.length === 2) {
      return new CanvasAction(NumberFormat.parse(args[0] ?? ''), NumberFormat.parse(args[1] ?? ''));
    }
    throw new EditorError(`usage: ${CanvasAction.usage}`);
  }

  private readonly width: number | null;

  private readonly height: number | null;

  private constructor(width: number | null, height: number | null) {
    this.width = width;
    this.height = height;
  }

  run(session: EditorSession): string[] {
    if (this.width === null) {
      return [session.canvasSize()];
    }
    return [session.resizeCanvas(this.width, this.height)];
  }
}
