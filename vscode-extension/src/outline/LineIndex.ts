import type { PositionLike } from '../ports/VscodeLike';

/**
 * 偏移量 → (行, 列) 的换算。
 *
 * 大纲节点的范围是解析器给出的字符偏移，而 VSCode 只认 Position；
 * 每份文档建一次索引，避免为每个节点从头数换行（O(n) 建表 + O(log n) 查询）。
 */
export class LineIndex {
  private readonly lineStarts: readonly number[];

  constructor(text: string) {
    const starts: number[] = [0];
    for (let index = 0; index < text.length; index += 1) {
      if (text.charCodeAt(index) === 0x0a) {
        starts.push(index + 1);
      }
    }
    this.lineStarts = starts;
  }

  /** 偏移量越界时夹紧到合法范围（容忍解析器与文档文本之间的极端不一致）。 */
  positionAt(offset: number): PositionLike {
    const clamped = Math.max(0, offset);
    let low = 0;
    let high = this.lineStarts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      const start = this.lineStarts[middle];
      if (start !== undefined && start <= clamped) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }
    const lineStart = this.lineStarts[low] ?? 0;
    return { line: low, character: clamped - lineStart };
  }

  lineCount(): number {
    return this.lineStarts.length;
  }
}
