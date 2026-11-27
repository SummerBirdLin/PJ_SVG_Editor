import { ContainerShape } from '../../../src/domain/shape/ContainerShape.js';
import type { Shape } from '../../../src/domain/shape/Shape.js';
import type { SvgDocument } from '../../../src/domain/SvgDocument.js';

/**
 * `stats` 的计数口径（需求 §2.1）：
 *
 * - 从画布子节点起**按当前子节点顺序深度优先**遍历；
 * - 叶子按图形类型计数，类型顺序 = 首次出现顺序；
 * - 容器（`g`、`box`、以及任何容器型插件图形）只计入 `containers`，根 `svg` 不计入；
 * - 容器内部继续遍历，因此 `box` 里的矩形/文字照常按叶子计数；
 * - `total` = 叶子总数。
 *
 * 本类不依赖任何具体图形类型：靠 `ContainerShape` 这一个领域抽象判断"是不是容器"，
 * 因此新增图形插件（`diamond`）与复合图形（`box`）都不需要改这里。
 */
export class StatsCounter {
  private readonly leafCounts = new Map<string, number>();

  private containerCount = 0;

  static describe(document: SvgDocument): string {
    const counter = new StatsCounter();
    counter.walk(document.canvas());
    return counter.render();
  }

  private walk(container: ContainerShape): void {
    for (const child of container.children()) {
      if (child instanceof ContainerShape) {
        this.containerCount += 1;
        this.walk(child);
        continue;
      }
      this.countLeaf(child);
    }
  }

  private countLeaf(leaf: Shape): void {
    const typeName = leaf.typeName();
    this.leafCounts.set(typeName, (this.leafCounts.get(typeName) ?? 0) + 1);
  }

  private render(): string {
    const total = [...this.leafCounts.values()].reduce((sum, value) => sum + value, 0);
    const summary = `(total ${total}, containers ${this.containerCount})`;
    const parts = [...this.leafCounts.entries()].map(([typeName, count]) => `${typeName}: ${count}`);
    return parts.length === 0 ? summary : `${parts.join('  ')}  ${summary}`;
  }
}
