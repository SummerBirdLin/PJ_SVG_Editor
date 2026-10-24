import { ContainerShape } from './ContainerShape.js';

/**
 * 分组容器 `<g>`：只承载子节点，几何语义由 ContainerShape 递归实现。
 * 阶段 2 的 `box` 复合图形会以 "type=box + tag=g" 的形式复用本类作为落点。
 */
export class GShape extends ContainerShape {
  constructor(id: string) {
    super(id, 'g', 'g');
  }
}
