import { EditorError } from '../domain/EditorError.js';
import { NumberFormat } from '../domain/NumberFormat.js';
import { SvgDocument } from '../domain/SvgDocument.js';
import { ShapeFactory } from '../domain/shape/ShapeFactory.js';
import type { CommandContext } from '../commands/CommandContext.js';
import { History } from '../commands/History.js';
import type { FileStore } from '../ports/FileStore.js';
import type { SvgDecoder } from '../ports/SvgDecoder.js';
import type { SvgEncoder } from '../ports/SvgEncoder.js';
import { NO_ATTRIBUTE_HANDLERS, type AttributeHandlerLookup } from '../plugin-api/AttributeHandler.js';
import { DocumentEventBus } from '../plugin-api/DocumentEvent.js';
import type { UndoableEdit } from '../plugin-api/EditHost.js';

/**
 * 应用层门面：CLI（以及未来的 GUI/agent 通道、插件命令）只与它交互。
 *
 * 职责：
 * - 持有当前文档与读入路径；
 * - 编排四个文档命令（init/read/save/canvas）；
 * - 执行编辑命令并写入 undo 栈；
 * - 维护"IO 命令后 undo/redo 禁止"的闸门（下一条成功的编辑命令解除）；
 * - 向订阅者发布**文档状态事件**（装饰器据此维护"保存点"等自身状态）。
 *
 * 它同时结构性满足插件 API 的 `CommandHost`：插件命令因此不必知道 History 的内部实现。
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

  private readonly attributeHandlersValue: AttributeHandlerLookup;

  private readonly events: DocumentEventBus;

  /**
   * @param shapes 组合根注入的**同一个** ShapeFactory：保证 `create` 解析与执行、
   *   `read` 解析、插件注册都走这一份实例（否则注册了插件也创建不出来）。
   * @param attributeHandlers 属性处理器注册表（缺省 = 没有处理器，退化为阶段 1 行为）。
   * @param events 文档事件总线（缺省 = 无人订阅）。
   */
  constructor(
    files: FileStore,
    decoder: SvgDecoder,
    encoder: SvgEncoder,
    shapes: ShapeFactory,
    attributeHandlers: AttributeHandlerLookup = NO_ATTRIBUTE_HANDLERS,
    events: DocumentEventBus = new DocumentEventBus(),
  ) {
    this.files = files;
    this.decoder = decoder;
    this.encoder = encoder;
    this.shapesValue = shapes;
    this.attributeHandlersValue = attributeHandlers;
    this.events = events;
  }

  get shapes(): ShapeFactory {
    return this.shapesValue;
  }

  get attributeHandlers(): AttributeHandlerLookup {
    return this.attributeHandlersValue;
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
    this.events.publish({ kind: 'replaced', document: this.documentValue });
    return `canvas ${NumberFormat.format(width)}x${NumberFormat.format(height)} created`;
  }

  read(path: string): string[] {
    const text = this.files.readText(path);
    const result = this.decoder.decode(text);
    this.documentValue = result.document;
    this.pathValue = path;
    this.historyValue.clear();
    this.ioBlocked = true;
    this.events.publish({ kind: 'replaced', document: result.document });
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
    this.events.publish({ kind: 'saved', document });
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
    this.events.publish({ kind: 'changed', document: this.document });
    return `canvas resized to ${NumberFormat.format(nextWidth)}x${NumberFormat.format(nextHeight)}`;
  }

  execute(edit: UndoableEdit): string {
    const message = edit.execute(this.context());
    this.historyValue.record(edit);
    this.ioBlocked = false;
    this.events.publish({ kind: 'changed', document: this.document });
    return message;
  }

  /** 插件命令提交编辑的入口（= `CommandHost.commitEdit`）。 */
  commitEdit(edit: UndoableEdit): string {
    return this.execute(edit);
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
    this.events.publish({ kind: 'changed', document: this.document });
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
    this.events.publish({ kind: 'changed', document: this.document });
    return message;
  }

  private context(): CommandContext {
    return {
      document: this.document,
      shapes: this.shapesValue,
      attributeHandlers: this.attributeHandlersValue,
    };
  }

  private requireDocument(): void {
    if (this.documentValue === null) {
      throw new EditorError("no document. use 'init' or 'read' first");
    }
  }
}
