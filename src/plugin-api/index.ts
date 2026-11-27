/**
 * 内核对外公开的插件 API（插件只允许 import 这里与 `domain` 的公开抽象）。
 *
 * 四个扩展点：
 * - `ShapeProvider`（图形类型，来自 domain）
 * - `CommandContribution`（命令）
 * - `TreeDecorator`（树标签）
 * - `AttributeHandler`（属性的领域语义）
 */
export type { EditHost, UndoableEdit } from './EditHost.js';
export { AttributeChanges, attributeContractError } from './AttributeChanges.js';
export type { AttributeHandler, AttributeHandlerLookup } from './AttributeHandler.js';
export { NO_ATTRIBUTE_HANDLERS } from './AttributeHandler.js';
export type { ShapeTarget } from './ShapeTarget.js';
export { ShapeTargetView } from './ShapeTarget.js';
export type { CommandCatalog, CommandContribution, CommandEnvironment, CommandHost, CommandInvocation } from './CommandContribution.js';
export type { DocumentEvent, DocumentEventKind } from './DocumentEvent.js';
export { DocumentEventBus } from './DocumentEvent.js';
export type { TreeDecorator, TreeDecoratorProvider, TreeLineContext } from './TreeDecorator.js';
export { ShapeSnapshot } from './ShapeSnapshot.js';
export type { ContributionCategory } from './ContributionDeclarations.js';
export { CONTRIBUTION_CATEGORIES, ContributionDeclarations } from './ContributionDeclarations.js';
export { DuplicateContributionError, ManifestMismatchError, PluginContractError } from './PluginErrors.js';
export type { PluginContext, PluginModule, PluginClass } from './PluginContext.js';
export { ContributionRegistry, PluginStaging } from './ContributionRegistry.js';
