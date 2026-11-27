import { CircleProvider } from '../domain/shape/provider/CircleProvider.js';
import { EllipseProvider } from '../domain/shape/provider/EllipseProvider.js';
import { GroupProvider } from '../domain/shape/provider/GroupProvider.js';
import { LineProvider } from '../domain/shape/provider/LineProvider.js';
import { RectProvider } from '../domain/shape/provider/RectProvider.js';
import { TextProvider } from '../domain/shape/provider/TextProvider.js';
import { ContributionDeclarations } from '../plugin-api/ContributionDeclarations.js';
import type { PluginModule } from '../plugin-api/PluginContext.js';

/**
 * 内置图形插件：阶段 1 的六种图形，**以插件形式**装配。
 *
 * 它和第三方图形插件走同一条注册路径（`registerShape` → 暂存 → 冲突/清单校验 → 合并），
 * 只是它由组合根在代码装配里直接调用。禁用任何外部插件时，这六种图形照常可用。
 */
export const builtinShapes: PluginModule = {
  name: 'builtin-shapes',
  contributes: ContributionDeclarations.fromPlain(
    { shapes: ['rect', 'circle', 'ellipse', 'line', 'text', 'g'] },
    'builtin-shapes',
  ),
  activate(context) {
    for (const provider of [
      new RectProvider(),
      new CircleProvider(),
      new EllipseProvider(),
      new LineProvider(),
      new TextProvider(),
      new GroupProvider(),
    ]) {
      context.registerShape(provider);
    }
  },
};
