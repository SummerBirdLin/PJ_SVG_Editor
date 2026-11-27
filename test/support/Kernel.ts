import { EditorSession } from '../../src/app/EditorSession.js';
import { builtinEditCommands } from '../../src/builtin/BuiltinEditCommands.js';
import { builtinShapes } from '../../src/builtin/BuiltinShapes.js';
import type { CommandRegistry } from '../../src/cli/CommandRegistry.js';
import { createCommandRegistry } from '../../src/host/CommandSetup.js';
import { ShapeFactory } from '../../src/domain/shape/ShapeFactory.js';
import { SvgWriter } from '../../src/io/SvgWriter.js';
import { SvgReader } from '../../src/io/SvgReader.js';
import type { FileStore } from '../../src/ports/FileStore.js';
import { NO_ATTRIBUTE_HANDLERS, type AttributeHandlerLookup } from '../../src/plugin-api/AttributeHandler.js';
import { ContributionRegistry } from '../../src/plugin-api/ContributionRegistry.js';
import { DocumentEventBus } from '../../src/plugin-api/DocumentEvent.js';
import type { CommandContext } from '../../src/commands/CommandContext.js';
import type { SvgDocument } from '../../src/domain/SvgDocument.js';
import type { PluginModule } from '../../src/plugin-api/PluginContext.js';
import { CodeAssembly } from '../../src/host/CodeAssembly.js';

/**
 * 测试夹具：用**与生产相同的装配路径**（`CodeAssembly` → `activatePlugin`）建内核，
 * 避免测试里另起一套"手工 new 一堆 Provider"的捷径。
 */
export interface TestKernel {
  readonly contributions: ContributionRegistry;
  readonly shapes: ShapeFactory;
  readonly commands: CommandRegistry;
}

export function createTestKernel(extraPlugins: readonly PluginModule[] = []): TestKernel {
  const contributions = new ContributionRegistry();
  const failures: string[] = [];
  new CodeAssembly([builtinShapes, builtinEditCommands, ...extraPlugins]).apply(contributions, (line) => {
    failures.push(line);
  });
  if (failures.length > 0) {
    throw new Error(`test kernel assembly failed: ${failures.join('; ')}`);
  }
  const shapes = new ShapeFactory(contributions);
  const commands = createCommandRegistry(shapes, contributions, contributions.treeDecorators());
  return { contributions, shapes, commands };
}

/** 只想要一个"内置六种图形"的工厂时用它。 */
export function createTestShapes(extraPlugins: readonly PluginModule[] = []): ShapeFactory {
  return createTestKernel(extraPlugins).shapes;
}

/** 命令级测试上下文；`handlers` 缺省 = 没有属性处理器（等价阶段 1）。 */
export function createTestCommandContext(
  document: SvgDocument,
  shapes: ShapeFactory,
  handlers: AttributeHandlerLookup = NO_ATTRIBUTE_HANDLERS,
): CommandContext {
  return { document, shapes, attributeHandlers: handlers };
}

/** 会话级测试夹具（真实 io：Node fs + 自写 XML；可选属性处理器与事件总线）。 */
export function createTestSession(
  files: FileStore,
  shapes: ShapeFactory,
  handlers: AttributeHandlerLookup = NO_ATTRIBUTE_HANDLERS,
  events: DocumentEventBus = new DocumentEventBus(),
): EditorSession {
  return new EditorSession(files, new SvgReader(shapes), new SvgWriter(), shapes, handlers, events);
}
