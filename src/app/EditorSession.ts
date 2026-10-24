import { EditorError } from '../domain/EditorError.js';
import { NumberFormat } from '../domain/NumberFormat.js';
import { SvgDocument } from '../domain/SvgDocument.js';
import { ShapeFactory } from '../domain/shape/ShapeFactory.js';
import type { Command } from '../commands/Command.js';
import type { CommandContext } from '../commands/CommandContext.js';
import { History } from '../commands/History.js';
import type { FileStore } from '../ports/FileStore.js';
import type { SvgDecoder } from '../ports/SvgDecoder.js';
import type { SvgEncoder } from '../ports/SvgEncoder.js';

/**
 * 应用层门面：CLI（以及未来的 GUI/agent 通道）只与它交互。
 *
 * 职责：
 * - 持有当前文档与读入路径；
 * - 编排四个文档命令（init/read/save/canvas）；
 * - 执行编辑命令并写入 undo 栈；
 * - 维护"IO 命令后 undo/redo 禁止"的闸门（下一条成功的编辑命令解除）。
 */
export class EditorSession {
  private documentValue: SvgDocument | null = null;

  private pathValue: string | null = null;

  private ioBlocked = false;

  private readonly historyValue = new History();

  private readonly shapesValue: ShapeFactory;

  private readonly files: FileStore;

  private readonly decoder: SvgDecoder;

  private readonly encoder: SvgEncoder;

  /**
   * @param shapes 组合根注入的**同一个** ShapeFactory：保证 `create` 解析与执行、
   *   `read` 解析、插件注册都走这一份实例（否则注册了插件也创建不出来）。
   */
  constructor(files: FileStore, decoder: SvgDecoder, encoder: SvgEncoder, shapes: ShapeFactory) {
    this.files = files;
    this.decoder = decoder;
    this.encoder = encoder;
    this.shapesValue = shapes;
  }

  get shapes(): ShapeFactory {
    return this.shapesValue;
  }

  get history(): History {
    return this.historyValue;
  }

  get document(): SvgDocument {
    if (this.documentValue === null) {
      throw new EditorError("no document. use 'init' or 'read' first");
    }
    return this.documentValue;
  }

  hasDocument(): boolean {
    return this.documentValue !== null;
  }

  init(width = 800, height = 600): string {
    if (width <= 0 || height <= 0) {
      throw new EditorError('canvas size must be positive');
    }
    this.documentValue = new SvgDocument(width, height);
    this.pathValue = null;
    this.historyValue.clear();
    this.ioBlocked = true;
    return `canvas ${NumberFormat.format(width)}x${NumberFormat.format(height)} created`;
  }

  read(path: string): string[] {
    const text = this.files.readText(path);
    const result = this.decoder.decode(text);
    this.documentValue = result.document;
    this.pathValue = path;
    this.historyValue.clear();
    this.ioBlocked = true;
    return [
      ...result.warnings,
      `read ${path} (${result.document.elementCount()} elements)`,
    ];
  }

  save(path?: string): string {
    const document = this.document;
    const target = path ?? this.pathValue;
    if (target === null) {
      throw new EditorError("no file path: use 'save <file.svg>'");
    }
    const content = this.encoder.encode(document);
    this.files.writeText(target, content);
    this.pathValue = target;
    this.ioBlocked = true;
    return `saved to ${target} (${document.elementCount()} elements)`;
  }

  canvasSize(): string {
    const canvas = this.document.canvas();
    return `canvas ${NumberFormat.format(canvas.width())}x${NumberFormat.format(canvas.height())}`;
  }

  /** `canvas <w>` 只改宽度时，高度沿用当前值（评审发现与 init 单参行为不一致）。 */
  resizeCanvas(width: number | null, height: number | null): string {
    const canvas = this.document.canvas();
    const nextWidth = width ?? canvas.width();
    const nextHeight = height ?? canvas.height();
    canvas.resize(nextWidth, nextHeight);
    this.historyValue.clear();
    this.ioBlocked = true;
    return `canvas resized to ${NumberFormat.format(nextWidth)}x${NumberFormat.format(nextHeight)}`;
  }

  execute(command: Command): string {
    const message = command.execute(this.context());
    this.historyValue.record(command);
    this.ioBlocked = false;
    return message;
  }

  undo(): string {
    this.requireDocument();
    if (this.ioBlocked) {
      throw new EditorError('undo not allowed after io command');
    }
    const command = this.historyValue.peekUndo();
    if (command === null) {
      throw new EditorError('nothing to undo');
    }
    const message = command.undo(this.context());
    this.historyValue.commitUndo();
    return message;
  }

  redo(): string {
    this.requireDocument();
    if (this.ioBlocked) {
      throw new EditorError('redo not allowed after io command');
    }
    const command = this.historyValue.peekRedo();
    if (command === null) {
      throw new EditorError('nothing to redo');
    }
    const message = command.execute(this.context());
    this.historyValue.commitRedo();
    return message;
  }

  private context(): CommandContext {
    return { document: this.document, shapes: this.shapesValue };
  }

  private requireDocument(): void {
    if (this.documentValue === null) {
      throw new EditorError("no document. use 'init' or 'read' first");
    }
  }
}
