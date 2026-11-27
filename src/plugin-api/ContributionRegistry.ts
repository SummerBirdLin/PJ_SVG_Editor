import { EditorError } from '../domain/EditorError.js';
import type { ShapeProvider } from '../domain/shape/provider/ShapeProvider.js';
import type { ShapeProviderLookup } from '../domain/shape/provider/ShapeProviderLookup.js';
import type { AttributeHandler, AttributeHandlerLookup } from './AttributeHandler.js';
import type { CommandCatalog, CommandContribution } from './CommandContribution.js';
import {
  CONTRIBUTION_CATEGORIES,
  ContributionDeclarations,
  type ContributionCategory,
} from './ContributionDeclarations.js';
import { DuplicateContributionError, ManifestMismatchError, PluginContractError } from './PluginErrors.js';
import type { PluginContext } from './PluginContext.js';
import type { ShapeTarget } from './ShapeTarget.js';
import type { TreeDecorator, TreeDecoratorProvider } from './TreeDecorator.js';

/**
 * 一次插件激活的暂存区：注册先进这里，`commit` 才并入内核。
 *
 * 这样"清单不一致 / 重复注册 / activate 抛错"都能把本次插件的**全部**注册撤销，
 * 已成功的插件不受影响（加载契约要求）。
 */
export class PluginStaging implements PluginContext {
  readonly pluginName: string;

  readonly declarations: ContributionDeclarations | null;

  private readonly shapeList: ShapeProvider[] = [];

  private readonly commandList: CommandContribution[] = [];

  private readonly decoratorList: TreeDecorator[] = [];

  private readonly handlerList: AttributeHandler[] = [];

  constructor(pluginName: string, declarations: ContributionDeclarations | null) {
    this.pluginName = pluginName;
    this.declarations = declarations;
  }

  registerShape(provider: ShapeProvider): void {
    ContributionRegistry.requireMembers(this.pluginName, 'shapes', provider as unknown as Record<string, unknown>, [
      'typeName',
      'svgTag',
      'create',
    ]);
    this.rejectDuplicate('shapes', provider.typeName, this.shapeList.map((item) => item.typeName));
    this.shapeList.push(provider);
  }

  registerCommand(command: CommandContribution): void {
    ContributionRegistry.requireMembers(this.pluginName, 'commands', command as unknown as Record<string, unknown>, [
      'commandName',
      'usage',
      'summary',
      'create',
    ]);
    this.rejectDuplicate('commands', command.commandName, this.commandList.map((item) => item.commandName));
    this.commandList.push(command);
  }

  registerTreeDecorator(decorator: TreeDecorator): void {
    ContributionRegistry.requireMembers(this.pluginName, 'decorators', decorator as unknown as Record<string, unknown>, [
      'decoratorName',
      'labelFor',
    ]);
    this.rejectDuplicate('decorators', decorator.decoratorName, this.decoratorList.map((item) => item.decoratorName));
    this.decoratorList.push(decorator);
  }

  registerAttributeHandler(handler: AttributeHandler): void {
    ContributionRegistry.requireMembers(this.pluginName, 'attributes', handler as unknown as Record<string, unknown>, [
      'handlerName',
      'handles',
      'apply',
    ]);
    this.rejectDuplicate('attributes', handler.handlerName, this.handlerList.map((item) => item.handlerName));
    this.handlerList.push(handler);
  }

  shapes(): readonly ShapeProvider[] {
    return this.shapeList;
  }

  commands(): readonly CommandContribution[] {
    return this.commandList;
  }

  decorators(): readonly TreeDecorator[] {
    return this.decoratorList;
  }

  attributeHandlers(): readonly AttributeHandler[] {
    return this.handlerList;
  }

  /** 本次插件实际注册的名字（按类别），用于与 `contributes` 比对。 */
  registeredNames(): Map<ContributionCategory, readonly string[]> {
    return new Map<ContributionCategory, readonly string[]>([
      ['shapes', this.shapeList.map((item) => item.typeName)],
      ['commands', this.commandList.map((item) => item.commandName)],
      ['decorators', this.decoratorList.map((item) => item.decoratorName)],
      ['attributes', this.handlerList.map((item) => item.handlerName)],
    ]);
  }

  private rejectDuplicate(category: ContributionCategory, name: string, existing: readonly string[]): void {
    if (existing.includes(name)) {
      throw new DuplicateContributionError(category, name);
    }
  }
}

/**
 * 内核侧的插件注册表：四个扩展点的**唯一**实现仓库。
 *
 * 对内核的其他部分，它只是一个只读视图（`ShapeProviderLookup` / `CommandCatalog` /
 * `TreeDecoratorProvider` / `AttributeHandlerLookup`）；写入只经 `beginPlugin` → `commit`，
 * 因此"注册"这件事有唯一的校验与回滚入口。
 */
export class ContributionRegistry
  implements ShapeProviderLookup, CommandCatalog, TreeDecoratorProvider, AttributeHandlerLookup
{
  private readonly providersByType = new Map<string, ShapeProvider>();

  private readonly providersByTag = new Map<string, ShapeProvider>();

  private readonly providersByDataKind = new Map<string, ShapeProvider>();

  private readonly commandsByName = new Map<string, CommandContribution>();

  private readonly decoratorList: TreeDecorator[] = [];

  private readonly handlerList: AttributeHandler[] = [];

  private readonly pluginNames: string[] = [];

  beginPlugin(pluginName: string, declarations: ContributionDeclarations | null = null): PluginStaging {
    if (this.pluginNames.includes(pluginName)) {
      throw new EditorError(`plugin already loaded: ${pluginName}`);
    }
    return new PluginStaging(pluginName, declarations);
  }

  /** 并入暂存区；重复注册或清单不一致时抛错，且**不产生任何部分写入**。 */
  commit(staging: PluginStaging): void {
    this.assertNoDuplicates(staging);
    this.assertManifestMatches(staging);
    for (const provider of staging.shapes()) {
      this.providersByType.set(provider.typeName, provider);
      const dataKind = provider.dataKind ?? null;
      if (dataKind !== null) {
        this.providersByDataKind.set(dataKind, provider);
      } else {
        this.providersByTag.set(provider.svgTag, provider);
      }
    }
    for (const command of staging.commands()) {
      this.commandsByName.set(command.commandName, command);
    }
    this.decoratorList.push(...staging.decorators());
    this.handlerList.push(...staging.attributeHandlers());
    this.pluginNames.push(staging.pluginName);
  }

  /** 放弃暂存区（activate 抛错、加载失败时调用）：零写入，无需清理。 */
  discard(_staging: PluginStaging): void {
    // 暂存区从未并入，丢弃引用即可
  }

  loadedPlugins(): readonly string[] {
    return this.pluginNames;
  }

  // ------------------------------------------------------------ 只读视图

  providerForType(typeName: string): ShapeProvider {
    const provider = this.providersByType.get(typeName);
    if (provider === undefined) {
      throw new EditorError(`unknown shape type: ${typeName} (is the plugin loaded?)`);
    }
    return provider;
  }

  providerForTag(tagName: string): ShapeProvider | null {
    return this.providersByTag.get(tagName) ?? null;
  }

  hasType(typeName: string): boolean {
    return this.providersByType.has(typeName);
  }

  typeNames(): readonly string[] {
    return [...this.providersByType.keys()];
  }

  commands(): readonly CommandContribution[] {
    return [...this.commandsByName.values()];
  }

  commandNamed(commandName: string): CommandContribution | null {
    return this.commandsByName.get(commandName) ?? null;
  }

  treeDecorators(): readonly TreeDecorator[] {
    return [...this.decoratorList];
  }

  handlersFor(target: ShapeTarget, attribute: string): readonly AttributeHandler[] {
    return this.handlerList
      .filter((handler) => handler.handles(target, attribute))
      .sort((left, right) => right.priority - left.priority);
  }

  attributeHandlers(): readonly AttributeHandler[] {
    return [...this.handlerList];
  }

  // ------------------------------------------------------------ 校验

  private assertNoDuplicates(staging: PluginStaging): void {
    for (const provider of staging.shapes()) {
      if (this.providersByType.has(provider.typeName)) {
        throw new DuplicateContributionError('shapes', provider.typeName);
      }
      const dataKind = provider.dataKind ?? null;
      const tagOwner = dataKind === null ? this.providersByTag.get(provider.svgTag) : undefined;
      if (tagOwner !== undefined) {
        throw new DuplicateContributionError('shapes', provider.svgTag);
      }
      if (dataKind !== null && this.providersByDataKind.has(dataKind)) {
        throw new DuplicateContributionError('shapes', dataKind);
      }
    }
    for (const command of staging.commands()) {
      if (this.commandsByName.has(command.commandName)) {
        throw new DuplicateContributionError('commands', command.commandName);
      }
    }
    const decoratorNames = this.decoratorList.map((item) => item.decoratorName);
    for (const decorator of staging.decorators()) {
      if (decoratorNames.includes(decorator.decoratorName)) {
        throw new DuplicateContributionError('decorators', decorator.decoratorName);
      }
    }
    const handlerNames = this.handlerList.map((item) => item.handlerName);
    for (const handler of staging.attributeHandlers()) {
      if (handlerNames.includes(handler.handlerName)) {
        throw new DuplicateContributionError('attributes', handler.handlerName);
      }
    }
  }

  private assertManifestMatches(staging: PluginStaging): void {
    const declarations = staging.declarations;
    if (declarations === null) {
      return;
    }
    const mismatch = declarations.compareAgainst(staging.registeredNames());
    if (mismatch !== null) {
      throw new ManifestMismatchError(staging.pluginName, mismatch.declared, mismatch.registered);
    }
  }

  /** 扩展点契约的最小校验：必需成员存在、字符串非空、方法是函数。 */
  static requireMembers(
    pluginName: string,
    category: ContributionCategory,
    candidate: Record<string, unknown>,
    required: readonly string[],
  ): void {
    if (!CONTRIBUTION_CATEGORIES.includes(category)) {
      throw new PluginContractError(pluginName, `unknown contribution category: ${category}`);
    }
    for (const member of required) {
      const value = candidate[member];
      const isFunction = typeof value === 'function';
      const isText = typeof value === 'string' && value.trim().length > 0;
      const isNumber = typeof value === 'number' && Number.isFinite(value);
      if (member === 'priority') {
        if (!isNumber) {
          throw new PluginContractError(pluginName, `${category}: ${member} must be a finite number`);
        }
        continue;
      }
      const needsFunction = member === 'create' || member === 'labelFor' || member === 'handles'
        || member === 'apply';
      if (needsFunction ? !isFunction : !isText) {
        throw new PluginContractError(
          pluginName,
          `${category}: ${member} is ${needsFunction ? 'not a function' : 'not a non-empty string'}`,
        );
      }
    }
  }
}
