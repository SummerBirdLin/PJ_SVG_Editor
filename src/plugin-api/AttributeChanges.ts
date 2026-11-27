import { EditorError } from '../domain/EditorError.js';
import type { Shape } from '../domain/shape/Shape.js';

interface RecordedChange {
  readonly shape: Shape;
  readonly attribute: string;
  readonly before: string | null;
}

/**
 * 属性修改的**事务记录**（一次 `set` = 一个 undo 单元）。
 *
 * 处理器不直接改图形，而是通过本类改：每次修改前先记下旧值，
 * 因此"改了多个子部件后抛错"可以整体回滚，成功时整份记录就是 undo 的逆操作。
 * 这样 undo/redo 不需要知道 `box` 有几个子部件，也不需要整文档快照。
 */
export class AttributeChanges {
  private readonly recorded: RecordedChange[] = [];

  get changeCount(): number {
    return this.recorded.length;
  }

  isEmpty(): boolean {
    return this.recorded.length === 0;
  }

  /**
   * 改一个属性：先取旧值、再写新值、成功后登记。
   * "写失败就不登记"是刻意的——这样回滚永远不会去撤销一个没发生过的修改。
   */
  setAttribute(shape: Shape, attribute: string, value: string): void {
    const before = shape.attributeValue(attribute);
    shape.setAttribute(attribute, value);
    this.recorded.push({ shape, attribute, before });
  }

  /** 处理器自己动手改（如移动子部件）时，用这个登记旧值。 */
  record(shape: Shape, attribute: string): void {
    this.recorded.push({ shape, attribute, before: shape.attributeValue(attribute) });
  }

  /** 某属性**第一次**被修改前的值（undo 回显用）；没改过返回 null。 */
  firstBefore(attribute: string): string | null {
    for (const change of this.recorded) {
      if (change.attribute === attribute) {
        return change.before;
      }
    }
    return null;
  }

  /**
   * 第一条修改前的值（undo 回显兜底）。
   * 处理器的改动可能落在子部件的别的属性上（`label` → 子文本的 `text`），
   * 此时按"请求的属性名"查不到记录，就用第一条记录还原回显语义。
   */
  firstBeforeAny(): string | null {
    return this.recorded[0]?.before ?? null;
  }

  /** 逆序回退到记录前的状态；`before` 为 null 表示原本没有该属性。失败即抛错（undo 路径）。 */
  revert(): void {
    this.replay((change) => {
      if (change.before === null) {
        change.shape.unsetAttribute(change.attribute);
      } else {
        change.shape.setAttribute(change.attribute, change.before);
      }
    });
  }

  /** 回滚路径：尽力恢复，**不掩盖**调用方正在抛出的原始错误。 */
  revertQuietly(): void {
    this.replay((change) => {
      try {
        if (change.before === null) {
          change.shape.unsetAttribute(change.attribute);
        } else {
          change.shape.setAttribute(change.attribute, change.before);
        }
      } catch {
        // 单个属性回滚失败不影响其余属性；原始错误优先抛出
      }
    });
  }

  private replay(step: (change: RecordedChange) => void): void {
    for (let index = this.recorded.length - 1; index >= 0; index -= 1) {
      const change = this.recorded[index];
      if (change !== undefined) {
        step(change);
      }
    }
  }

  /** 供回显/诊断：被修改过的属性名（去重，保持首次出现顺序）。 */
  touchedAttributes(): readonly string[] {
    const names: string[] = [];
    for (const change of this.recorded) {
      if (!names.includes(change.attribute)) {
        names.push(change.attribute);
      }
    }
    return names;
  }
}

/** 处理器在无法通过 `setAttribute` 表达时抛出，用于报告契约冲突。 */
export function attributeContractError(handlerName: string, reason: string): EditorError {
  return new EditorError(`attribute handler failed: ${handlerName} (${reason})`);
}
