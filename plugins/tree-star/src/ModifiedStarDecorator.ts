import type { SvgDocument } from '../../../src/domain/SvgDocument.js';
import type { Shape } from '../../../src/domain/shape/Shape.js';
import type { DocumentEvent } from '../../../src/plugin-api/DocumentEvent.js';
import { ShapeSnapshot } from '../../../src/plugin-api/ShapeSnapshot.js';
import type { TreeDecorator, TreeLineContext } from '../../../src/plugin-api/TreeDecorator.js';

/**
 * `modified-star`：为"与上次保存点内容不一致"的行追加 `*`（ADR-3）。
 *
 * 语义选择：**按内容比较**而不是"发生过编辑命令"，因此 `undo` 回到保存点后 `*` 自动消失。
 * 保存点由 `saved` / `replaced` 事件维护：`save` 成功时把当前快照记为基线；
 * `init`/`read` 建立文档时同样记为基线（"刚打开的文件没有未保存变化"）。
 *
 * 状态全部在本实例字段里（`baseline` / `cache`），没有模块级变量：
 * 同一次进程里换文档、并存多个标签都不会串味。
 */
export class ModifiedStarDecorator implements TreeDecorator {
  readonly decoratorName = 'modified-star';

  /** 保存点快照：id → 内容签名。null = 还没有基线（首次渲染前）。 */
  private baseline: Map<string, string> | null = null;

  private baselineCanvas = '';

  private cachedDocument: SvgDocument | null = null;

  private cachedSnapshot: Map<string, string> | null = null;

  onDocumentEvent(event: DocumentEvent): void {
    if (event.kind === 'saved' || event.kind === 'replaced') {
      this.baseline = ShapeSnapshot.of(event.document);
      this.baselineCanvas = event.document.canvas().sizeText();
      this.cachedDocument = event.document;
      this.cachedSnapshot = this.baseline;
      return;
    }
    // changed：内容变了，缓存的当前快照作废（下次渲染重新算）
    this.cachedSnapshot = null;
    this.cachedDocument = null;
  }

  labelFor(context: TreeLineContext): string {
    const current = this.currentSnapshot(context.document);
    const baseline = this.ensureBaseline(context.document, current);
    if (context.shape === null) {
      return this.documentChanged(context.document, current, baseline) ? '*' : '';
    }
    return this.shapeChanged(context.shape, current, baseline) ? '*' : '';
  }

  /** 根行（`svg`）代表整个文档：画布尺寸或任一图形内容不同 → `*`。 */
  private documentChanged(
    document: SvgDocument,
    current: Map<string, string>,
    baseline: Map<string, string>,
  ): boolean {
    if (document.canvas().sizeText() !== this.baselineCanvas) {
      return true;
    }
    if (current.size !== baseline.size) {
      return true;
    }
    for (const [id, signature] of current) {
      if (baseline.get(id) !== signature) {
        return true;
      }
    }
    return false;
  }

  /**
   * 普通行只看**自己**的内容（类型/属性/文本/父节点/兄弟序号）。
   * 祖先容器不因子孙变化而标 `*`——与需求 §5 示例一致（见 ADR-3 的取舍）。
   */
  private shapeChanged(shape: Shape, current: Map<string, string>, baseline: Map<string, string>): boolean {
    const id = shape.id();
    if (id.length === 0) {
      return false;
    }
    const before = baseline.get(id);
    if (before === undefined) {
      // 保存点之后新建的节点：立即标记（内容不在基线里）
      return true;
    }
    return before !== current.get(id);
  }

  private currentSnapshot(document: SvgDocument): Map<string, string> {
    if (this.cachedSnapshot !== null && this.cachedDocument === document) {
      return this.cachedSnapshot;
    }
    const snapshot = ShapeSnapshot.of(document);
    this.cachedDocument = document;
    this.cachedSnapshot = snapshot;
    return snapshot;
  }

  private ensureBaseline(document: SvgDocument, current: Map<string, string>): Map<string, string> {
    if (this.baseline !== null) {
      return this.baseline;
    }
    this.baseline = current;
    this.baselineCanvas = document.canvas().sizeText();
    return current;
  }
}
