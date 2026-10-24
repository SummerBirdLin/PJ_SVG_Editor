import { EditorError } from '../domain/EditorError.js';
import { GShape } from '../domain/shape/GShape.js';
import type { LocatedShape, SvgDocument } from '../domain/SvgDocument.js';
import type { CommandContext } from './CommandContext.js';

/**
 * 编辑命令（Command 模式）：execute 执行并返回回显，undo 精确撤销并返回回显；
 * redo = 再次 execute（命令自身在 execute 时记录逆操作所需的局部状态）。
 *
 * 子类另外提供静态的 `commandName` / `usage` / `summary` / `parse`，
 * 供 CLI 注册表与 help 复用（不引入第二套按名分派）。
 */
export abstract class Command {
  abstract execute(context: CommandContext): string;

  abstract undo(context: CommandContext): string;

  /** 按 id 定位，找不到报 `no such shape: <id>`。 */
  protected static locateOrFail(document: SvgDocument, id: string): LocatedShape {
    const found = document.locate(id);
    if (found === null) {
      throw new EditorError(`no such shape: ${id}`);
    }
    return found;
  }

  /**
   * 按 id 定位一个"容器目标"（`in` 子句、`addto` 的第一个参数）：
   * 不存在报 `no such container`，存在但不是 `<g>` 报 `not a container`。
   */
  protected static locateContainerOrFail(document: SvgDocument, id: string): GShape {
    const found = document.locate(id);
    if (found === null) {
      throw new EditorError(`no such container: ${id}`);
    }
    if (!(found.shape instanceof GShape)) {
      throw new EditorError(`not a container: ${id}`);
    }
    return found.shape;
  }
}
