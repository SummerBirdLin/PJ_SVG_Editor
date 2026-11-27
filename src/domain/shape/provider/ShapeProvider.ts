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

  /**
   * 稳定的读回标识（插件/复合类型用）：非 null 时序列化为 `data-kind="<值>"`，
   * `read` 按它找回 Provider。为 null 的类型只按 SVG 标签读回（阶段 1 的六种即如此）。
   */
  readonly dataKind: string | null = null;

  abstract create(id: string, init: ShapeInit): Shape;

  /**
   * 读回钩子：该图形的子节点全部读入后调用，用于校验/补齐不变量。
   * 抛错 = **拒绝整个读入**（`read` 失败，原文档保持不变），
   * 而不是留下一个"缺子部件的复合图形"（`box` 插件用它校验 `-rect`/`-label`）。
   */
  afterChildren(_shape: Shape): void {
    // 缺省无需校验
  }

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
