import type { ShapeProvider } from '../domain/shape/provider/ShapeProvider.js';
import type { AttributeHandler } from './AttributeHandler.js';
import type { CommandContribution } from './CommandContribution.js';
import type { ContributionDeclarations } from './ContributionDeclarations.js';
import type { TreeDecorator } from './TreeDecorator.js';

/**
 * 插件看到的**唯一装配面**：四个 `register*` 方法对应四个扩展点。
 *
 * 插件只能依赖本接口与内核公开的领域抽象（`ShapeProvider`、`Shape`、`SvgDocument` 等），
 * 不依赖注册表实现、组合根或加载器；注册先进暂存区，加载失败可整体撤销。
 */
export interface PluginContext {
  readonly pluginName: string;

  registerShape(provider: ShapeProvider): void;

  registerCommand(command: CommandContribution): void;

  registerTreeDecorator(decorator: TreeDecorator): void;

  registerAttributeHandler(handler: AttributeHandler): void;
}

/**
 * 插件模块契约（`export default` 的形状）。
 *
 * - 可以是**对象**：`{ name?, contributes?, activate(ctx) }`；
 * - 也可以是**类**：构造时接收 `options`（配置装配里的 `options` 字段），实例具备 `activate`。
 */
export interface PluginModule {
  /** 插件名；缺省由加载器用包名/目录名补齐。 */
  readonly name?: string;

  /** 声明自己提供哪些扩展（与 `package.json` 的 `contributes` 同构）。 */
  readonly contributes?: ContributionDeclarations;

  activate(context: PluginContext): void;
}

/** 类形式插件模块的构造签名。 */
export type PluginClass = new (options?: unknown) => PluginModule;
