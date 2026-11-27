import { EditorSession } from '../../src/app/EditorSession.js';
import { Repl } from '../../src/cli/Repl.js';
import { Tokenizer } from '../../src/cli/Tokenizer.js';
import { NodeFileStore } from '../../src/io/NodeFileStore.js';
import { SvgReader } from '../../src/io/SvgReader.js';
import { SvgWriter } from '../../src/io/SvgWriter.js';
import { DocumentEventBus } from '../../src/plugin-api/DocumentEvent.js';
import type { PluginModule } from '../../src/plugin-api/PluginContext.js';
import { BufferOutput } from './BufferOutput.js';
import { createTestKernel } from './Kernel.js';

/**
 * 端到端测试夹具：真实 io（Node fs + 自写 XML）+ 真实注册表 + 内存输出。
 * 与 main.ts 的唯一区别是：不打印 banner/prompt（管道回放模式）。
 * 内核由 `createTestKernel` 按生产装配路径构建，可追加插件模块。
 */
export class CliHarness {
  readonly output = new BufferOutput();

  private readonly repl: Repl;

  constructor(extraPlugins: readonly PluginModule[] = []) {
    const kernel = createTestKernel(extraPlugins);
    const events = new DocumentEventBus();
    for (const decorator of kernel.contributions.treeDecorators()) {
      const listener = decorator.onDocumentEvent;
      if (listener !== undefined) {
        events.subscribe((event) => listener.call(decorator, event));
      }
    }
    const session = new EditorSession(
      new NodeFileStore(),
      new SvgReader(kernel.shapes),
      new SvgWriter(),
      kernel.shapes,
      kernel.contributions,
      events,
    );
    this.repl = new Repl(new Tokenizer(), kernel.commands, session, this.output);
  }

  async run(script: string): Promise<string> {
    this.output.clear();
    await this.repl.run(this.lines(script.split('\n')));
    return this.output.value();
  }

  private async *lines(items: string[]): AsyncIterable<string> {
    for (const item of items) {
      yield item;
    }
  }
}
