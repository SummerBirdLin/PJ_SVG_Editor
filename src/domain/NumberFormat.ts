import { EditorError } from './EditorError.js';

/**
 * 数字的解析与文本化（CLI、SVG 输出、tree/show 共用的唯一入口）。
 *
 * - 解析：必须是有限数字，否则 `invalid number: <原文>`；
 * - 文本化：整数不带小数点；非整数最多 6 位小数并去掉尾随 0，
 *   避免 0.30000000000000004 这类浮点噪声；-0 输出为 0；
 * - 量级极大/极小时改用科学计数法（SVG 数字语法允许 `1e+300`），
 *   否则 `toFixed` 的指数形式会被"去尾零"破坏（曾把 1e300 写成 1e+3）。
 */
export class NumberFormat {
  private static readonly MAX_DECIMALS = 6;
  private static readonly SCALE = 10 ** NumberFormat.MAX_DECIMALS;
  private static readonly EXPONENT_THRESHOLD = 1e21;
  private static readonly TINY_THRESHOLD = 1e-6;

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
    const magnitude = Math.abs(value);
    if (magnitude !== 0 && (magnitude >= NumberFormat.EXPONENT_THRESHOLD || magnitude < NumberFormat.TINY_THRESHOLD)) {
      return value.toString();
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

  /** 几何运算后校验有限性：溢出时报错，而不是把 Infinity 写进文档。 */
  static requireFinite(value: number, attributeName: string): number {
    if (!Number.isFinite(value)) {
      throw new EditorError(`${attributeName} is out of range`);
    }
    return value;
  }
}
