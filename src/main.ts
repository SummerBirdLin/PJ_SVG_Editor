import { createInterface } from 'node:readline';
import { EditorSession } from './app/EditorSession.js';
import { CommandRegistry } from './cli/CommandRegistry.js';
import { Repl } from './cli/Repl.js';
import type { ReplOptions } from './cli/ReplOptions.js';
import type { TextOutput } from './cli/TextOutput.js';
import { Tokenizer } from './cli/Tokenizer.js';
import { ShapeFactory } from './domain/shape/ShapeFactory.js';
import { NodeFileStore } from './io/NodeFileStore.js';
import { SvgReader } from './io/SvgReader.js';
import { SvgWriter } from './io/SvgWriter.js';

/**
 * 组合根：唯一允许 import 全部模块的地方。
 * 交互式终端下输出 banner 与 `svg>` 提示符；管道回放时保持输出只有命令结果。
 */
async function main(): Promise<void> {
  const shapes = new ShapeFactory();
  const session = new EditorSession(new NodeFileStore(), new SvgReader(shapes), new SvgWriter(), shapes);
  const registry = new CommandRegistry(shapes);
  const output: TextOutput = {
    write: (text: string): void => {
      process.stdout.write(text);
    },
  };

  const interactive = process.stdin.isTTY === true && process.stdout.isTTY === true;
  const options: ReplOptions = interactive
    ? { banner: "svg-editor 0.1 — type 'help' for commands", prompt: 'svg> ' }
    : {};
  const repl = new Repl(new Tokenizer(), registry, session, output, options);

  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: interactive,
  });
  await repl.run(readline[Symbol.asyncIterator]());
}

await main();
