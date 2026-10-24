import { NumberFormat } from '../../NumberFormat.js';
import type { CreationAttribute } from '../CreationAttribute.js';
import type { Shape } from '../Shape.js';
import type { ShapeInit } from '../ShapeInit.js';

/**
 * 一种图形类型的"描述者"（阶段 2 的 ShapeProvider 插件插槽）。
 *
 * 只描述领域事实：类型名、SVG 标签、创建它需要的属性序列、如何由属性构造对象。
 * CLI 的位置参数顺序与 usage 文本由命令层基于 `creationAttributes` 生成，
 * domain 因此不认识 CLI 方言。
 */
export abstract class ShapeProvider {
  abstract readonly typeName: string;

  abstract readonly svgTag: string;

  /** 顺序 = 序列化属性顺序 = CLI 位置参数顺序；`required` 决定必填/可选。 */
  abstract readonly creationAttributes: readonly CreationAttribute[];

  /** 该类型的内容是否为"子文本"（只有 text 为 true）。 */
  readonly hasTextContent: boolean = false;

  abstract create(id: string, init: ShapeInit): Shape;

  /** 读取数值属性；缺省（外部 SVG 未写）时回退 fallback。 */
  protected readNumber(init: ShapeInit, name: string, fallback = 0): number {
    const raw = init.attributes.get(name);
    return raw === undefined ? fallback : NumberFormat.parse(raw);
  }

  /** 读取尺寸类属性（宽、高、半径），要求非负。 */
  protected readSize(init: ShapeInit, name: string, fallback = 0): number {
    const raw = init.attributes.get(name);
    return raw === undefined ? fallback : NumberFormat.parseNonNegative(raw, name);
  }
}
