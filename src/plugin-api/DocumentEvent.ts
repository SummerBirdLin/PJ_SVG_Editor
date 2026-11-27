import type { SvgDocument } from '../domain/SvgDocument.js';

/**
 * 文档状态事件：装饰器据此维护自己的状态（如"自上次保存以来被改过的 id"）。
 *
 * 事件只携带"发生了什么 + 当前文档"，具体怎么记账由装饰器实例自己决定，
 * 内核因此不需要认识任何标签插件。
 */
export type DocumentEventKind =
  /** `init` / `read`：当前文档被整体替换 */
  | 'replaced'
  /** `save` 成功：此时的内容就是"保存点" */
  | 'saved'
  /** `execute` / `undo` / `redo` / `canvas`：内容或画布尺寸变化 */
  | 'changed';

export interface DocumentEvent {
  readonly kind: DocumentEventKind;

  readonly document: SvgDocument;
}

/** 事件总线：宿主发布，装饰器订阅；监听器抛错不影响其他监听器与命令结果。 */
export class DocumentEventBus {
  private readonly listeners: ((event: DocumentEvent) => void)[] = [];

  subscribe(listener: (event: DocumentEvent) => void): void {
    this.listeners.push(listener);
  }

  publish(event: DocumentEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // 观测者故障不得影响文档操作本身（装饰器有各自的错误处理入口）
      }
    }
  }
}
