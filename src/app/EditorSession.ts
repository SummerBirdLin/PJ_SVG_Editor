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

  private readonly shapesValue = new ShapeFactory();

  private readonly files: FileStore;

  private readonly decoder: SvgDecoder;

  private readonly encoder: SvgEncoder;

  constructor(files: FileStore, decoder: SvgDecoder, encoder: SvgEncoder) {
    this.files = files;
    this.decoder = decoder;
    this.encoder = encoder;
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

  resizeCanvas(width: number, height: number): string {
    const canvas = this.document.canvas();
    canvas.resize(width, height);
    this.historyValue.clear();
    this.ioBlocked = true;
    return `canvas resized to ${NumberFormat.format(width)}x${NumberFormat.format(height)}`;
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
    const command = this.historyValue.popForUndo();
    if (command === null) {
      throw new EditorError('nothing to undo');
    }
    return command.undo(this.context());
  }

  redo(): string {
    this.requireDocument();
    if (this.ioBlocked) {
      throw new EditorError('redo not allowed after io command');
    }
    const command = this.historyValue.popForRedo();
    if (command === null) {
      throw new EditorError('nothing to redo');
    }
    return command.execute(this.context());
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
