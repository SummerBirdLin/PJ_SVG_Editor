import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditorSession } from '../../src/app/EditorSession.js';
import { CommandRegistry } from '../../src/cli/CommandRegistry.js';
import { Repl } from '../../src/cli/Repl.js';
import { Tokenizer } from '../../src/cli/Tokenizer.js';
import { ShapeFactory } from '../../src/domain/shape/ShapeFactory.js';
import { NodeFileStore } from '../../src/io/NodeFileStore.js';
import { SvgReader } from '../../src/io/SvgReader.js';
import { SvgWriter } from '../../src/io/SvgWriter.js';
import { BufferOutput } from '../support/BufferOutput.js';

function makeRepl(output: BufferOutput, options: { banner?: string; prompt?: string } = {}): Repl {
  const shapes = new ShapeFactory();
  const session = new EditorSession(new NodeFileStore(), new SvgReader(shapes), new SvgWriter());
  const registry = new CommandRegistry(shapes);
  return new Repl(new Tokenizer(), registry, session, output, options);
}

async function* lines(items: string[]): AsyncIterable<string> {
  for (const item of items) {
    yield item;
  }
}

test('交互模式：banner 与提示符按配置输出（管道模式两者都不输出）', async () => {
  const output = new BufferOutput();
  const repl = makeRepl(output, {
    banner: "svg-editor 0.1 — type 'help' for commands",
    prompt: 'svg> ',
  });
  await repl.run(lines(['init 400 300']));
  assert.equal(
    output.value(),
    "svg-editor 0.1 — type 'help' for commands\nsvg> canvas 400x300 created\nsvg> ",
  );

  const piped = new BufferOutput();
  await makeRepl(piped).run(lines(['init 400 300']));
  assert.equal(piped.value(), 'canvas 400x300 created\n');
});

test('分词：引号内空格属于同一参数；未闭合引号报错', async () => {
  const output = new BufferOutput();
  const repl = makeRepl(output);
  await repl.run(lines(['init 100 100', 'create text t1 1 2 "hello world"', 'show t1']));
  assert.ok(output.value().includes('text#t1  parent=svg'));
  assert.ok(output.value().includes('text="hello world"'));

  const broken = new BufferOutput();
  await makeRepl(broken).run(lines(['create text t2 1 2 "oops']));
  assert.ok(broken.value().includes('error: unterminated quote in command'));
});
