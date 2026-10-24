import { EditorError } from './EditorError.js';

/**
 * 数字的解析与文本化（CLI 与 SVG 输出共用的唯一入口）。
 *
 * - 解析：必须是有限数字，否则 `invalid number: <原文>`；
 * - 文本化：整数不带小数点；非整数最多 6 位小数并去掉尾随 0，
 *   避免 0.30000000000000004 这类浮点噪声；
 * - 特别地，-0 一律输出为 0。
 */
export class NumberFormat {
  private static readonly MAX_DECIMALS = 6;
  private static readonly SCALE = 10 ** NumberFormat.MAX_DECIMALS;

  static parse(text: string): number {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      throw new EditorError(`invalid number: ${text}`);
    }
    const value = Number(trimmed);
    if (!Number.isFinite(value)) {
      throw new EditorError(`invalid number: ${text}`);
    }
    return value;
  }

  static format(value: number): string {
    if (!Number.isFinite(value)) {
      throw new EditorError(`invalid number: ${value}`);
    }
    const rounded = Math.round(value * NumberFormat.SCALE) / NumberFormat.SCALE;
    if (rounded === 0) {
      return '0';
    }
    const text = rounded.toFixed(NumberFormat.MAX_DECIMALS);
    return text.replace(/0+$/, '').replace(/\.$/, '');
  }

  /** 解析并要求非负（宽度、高度、半径等尺寸类属性）。 */
  static parseNonNegative(text: string, attributeName: string): number {
    const value = NumberFormat.parse(text);
    if (value < 0) {
      throw new EditorError(`${attributeName} must be non-negative`);
    }
    return value;
  }
}
