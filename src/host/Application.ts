import { EditorSession } from '../app/EditorSession.js';
import type { CommandRegistry } from '../cli/CommandRegistry.js';
import { Repl } from '../cli/Repl.js';
import type { ReplOptions } from '../cli/ReplOptions.js';
import type { TextOutput } from '../cli/TextOutput.js';
import { Tokenizer } from '../cli/Tokenizer.js';
import { ShapeFactory } from '../domain/shape/ShapeFactory.js';
import { SvgReader } from '../io/SvgReader.js';
import { SvgWriter } from '../io/SvgWriter.js';
import type { FileStore } from '../ports/FileStore.js';
import { DocumentEventBus } from '../plugin-api/DocumentEvent.js';
import { ContributionRegistry } from '../plugin-api/ContributionRegistry.js';
import { builtinEditCommands } from '../builtin/BuiltinEditCommands.js';
import { createCommandRegistry } from './CommandSetup.js';
import { builtinShapes } from '../builtin/BuiltinShapes.js';
import { CodeAssembly } from './CodeAssembly.js';
import type { PluginAssembly } from './PluginAssembly.js';

export interface ApplicationOptions {
  readonly files: FileStore;
  readonly output: TextOutput;
  /** 可选插件层（代码装配或配置装配）；内置能力总是先装好。 */
  readonly optionalAssembly: PluginAssembly;
  readonly replOptions?: ReplOptions;
}

export interface Application {
  readonly contributions: ContributionRegistry;
  readonly session: EditorSession;
  readonly commands: CommandRegistry;
  readonly repl: Repl;
}

/**
 * 组合根：唯一允许 import 全部模块的地方。
 *
 * 装配顺序是设计的一部分：
 * 1. 内置插件（六种图形 + 10 条编辑命令）先注册——禁用任何外部插件也能启动；
 * 2. 可选插件层按所选方式装入（失败只打印 `error: …`，不影响启动）；
 * 3. 之后才用**同一个**注册表构造 `ShapeFactory` / `EditorSession` / 命令注册表，
 *    保证"注册的图形能创建、注册的命令能分派、注册的装饰器能渲染"。
 */
export async function createApplication(options: ApplicationOptions): Promise<Application> {
  const contributions = new ContributionRegistry();
  const report = (line: string): void => {
    options.output.write(`${line}\n`);
  };

  new CodeAssembly([builtinShapes, builtinEditCommands]).apply(contributions, report);
  await options.optionalAssembly.apply(contributions, report);

  const shapes = new ShapeFactory(contributions);
  const events = new DocumentEventBus();
  for (const decorator of contributions.treeDecorators()) {
    const listener = decorator.onDocumentEvent;
    if (listener !== undefined) {
      events.subscribe((event) => listener.call(decorator, event));
    }
  }

  const session = new EditorSession(
    options.files,
    new SvgReader(shapes),
    new SvgWriter(),
    shapes,
    contributions,
    events,
  );
  const commands = createCommandRegistry(shapes, contributions, contributions.treeDecorators());
  const repl = new Repl(new Tokenizer(), commands, session, options.output, options.replOptions);
  return { contributions, session, commands, repl };
}
