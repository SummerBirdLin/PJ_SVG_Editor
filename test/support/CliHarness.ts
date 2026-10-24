import { EditorSession } from '../../src/app/EditorSession.js';
import { CommandRegistry } from '../../src/cli/CommandRegistry.js';
import { Repl } from '../../src/cli/Repl.js';
import { Tokenizer } from '../../src/cli/Tokenizer.js';
import { ShapeFactory } from '../../src/domain/shape/ShapeFactory.js';
import { NodeFileStore } from '../../src/io/NodeFileStore.js';
import { SvgReader } from '../../src/io/SvgReader.js';
import { SvgWriter } from '../../src/io/SvgWriter.js';
import { BufferOutput } from './BufferOutput.js';

/**
 * 端到端测试夹具：真实 io（Node fs + 自写 XML）+ 真实注册表 + 内存输出。
 * 与 main.ts 的唯一区别是：不打印 banner/prompt（管道回放模式）。
 */
export class CliHarness {
  readonly output = new BufferOutput();

  private readonly repl: Repl;

  constructor() {
    const shapes = new ShapeFactory();
    const session = new EditorSession(new NodeFileStore(), new SvgReader(shapes), new SvgWriter(), shapes);
    const registry = new CommandRegistry(shapes);
    this.repl = new Repl(new Tokenizer(), registry, session, this.output);
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
