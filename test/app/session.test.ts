import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditorSession } from '../../src/app/EditorSession.js';
import { CreateCommand } from '../../src/commands/CreateCommand.js';
import { MoveCommand } from '../../src/commands/MoveCommand.js';
import { EditorError } from '../../src/domain/EditorError.js';
import { ShapeFactory } from '../../src/domain/shape/ShapeFactory.js';
import { SvgReader } from '../../src/io/SvgReader.js';
import { SvgWriter } from '../../src/io/SvgWriter.js';
import type { FileStore } from '../../src/ports/FileStore.js';

/** 内存文件系统：检验 EditorSession 只依赖 FileStore 抽象（不碰真实磁盘）。 */
class MemoryFileStore implements FileStore {
  readonly files = new Map<string, string>();

  readText(path: string): string {
    const content = this.files.get(path);
    if (content === undefined) {
      throw new EditorError(`cannot read file: ${path}`);
    }
    return content;
  }

  writeText(path: string, content: string): void {
    if (path === 'readonly.svg') {
      throw new EditorError(`cannot write file: ${path}`);
    }
    this.files.set(path, content);
  }
}

function makeSession(): { session: EditorSession; files: MemoryFileStore } {
  const files = new MemoryFileStore();
  const shapes = new ShapeFactory();
  const session = new EditorSession(files, new SvgReader(shapes), new SvgWriter(), shapes);
  return { session, files };
}

function create(session: EditorSession, args: string[]): string {
  return session.execute(CreateCommand.parse(args, { shapes: session.shapes }));
}

test('未 init/read 时 undo/redo/编辑命令报 no document', () => {
  const { session } = makeSession();
  const expected = "no document. use 'init' or 'read' first";
  assert.throws(() => session.undo(), (error: unknown) => error instanceof EditorError && error.message === expected);
  assert.throws(() => session.redo(), (error: unknown) => error instanceof EditorError && error.message === expected);
  assert.throws(() => create(session, ['rect', 'r1', '0', '0', '1', '1']),
    (error: unknown) => error instanceof EditorError && error.message === expected);
});

test('IO 闸门：init 后 undo 禁止，成功后编辑解除；新编辑清空 redo', () => {
  const { session } = makeSession();
  assert.equal(session.init(), 'canvas 800x600 created');
  assert.throws(() => session.undo(), /undo not allowed after io command/);

  assert.equal(create(session, ['rect', 'r1', '0', '0', '10', '10']), 'rect#r1 created');
  assert.equal(session.undo(), 'rect#r1 deleted');
  assert.equal(session.redo(), 'rect#r1 created');

  assert.equal(session.undo(), 'rect#r1 deleted');
  assert.equal(create(session, ['circle', 'c1', '1', '1', '2']), 'circle#c1 created');
  assert.throws(() => session.redo(), /nothing to redo/);
});

test('save 路径记忆：read 后 save 无参用它；save <path> 更新它；init 重置它', () => {
  const { session, files } = makeSession();
  files.files.set('a.svg', '<svg width="100" height="50"><rect id="r1" x="0" y="0" width="1" height="1"/></svg>');
  assert.deepEqual(session.read('a.svg'), ['read a.svg (1 elements)']);
  assert.equal(session.save(), 'saved to a.svg (1 elements)');
  assert.deepEqual(session.read('a.svg'), ['read a.svg (1 elements)']);

  assert.equal(session.save('b.svg'), 'saved to b.svg (1 elements)');
  assert.ok(files.files.get('b.svg')?.includes('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"'));
  assert.equal(session.save(), 'saved to b.svg (1 elements)');

  assert.equal(session.init(200, 100), 'canvas 200x100 created');
  assert.throws(() => session.save(), /no file path: use 'save <file.svg>'/);
});

test('read 的告警先于结果行；计数口径含 g 容器', () => {
  const { session, files } = makeSession();
  files.files.set('x.svg', [
    '<svg width="10" height="10">',
    '<rect width="1" height="1"/>',
    '<g id="g1"><circle id="c1" cx="0" cy="0" r="1"/></g>',
    '</svg>',
  ].join(''));
  assert.deepEqual(session.read('x.svg'), [
    'warning: assigned id rect1 to unnamed <rect>',
    'read x.svg (3 elements)',
  ]);
});

test('canvas：无参只显示（不置闸门、不清历史）；带参修改尺寸 = IO 命令', () => {
  const { session } = makeSession();
  session.init();
  create(session, ['rect', 'r1', '0', '0', '10', '10']);
  assert.equal(session.canvasSize(), 'canvas 800x600');
  assert.equal(session.undo(), 'rect#r1 deleted', '显示类 canvas 不应阻断 undo');

  session.redo();
  assert.equal(session.resizeCanvas(1024, 768), 'canvas resized to 1024x768');
  assert.throws(() => session.undo(), /undo not allowed after io command/);
  assert.equal(session.canvasSize(), 'canvas 1024x768');
});

test('save 失败（不可写）不改变路径与闸门状态', () => {
  const { session, files } = makeSession();
  session.init();
  create(session, ['rect', 'r1', '0', '0', '10', '10']);
  assert.throws(() => session.save('readonly.svg'), /cannot write file/);

  // 写入失败后：仍然可以 undo（闸门未被置上），文档未变
  assert.equal(session.undo(), 'rect#r1 deleted');
  assert.equal(files.files.size, 0);
});

test('execute 命令失败时不改变历史（失败命令不入栈）', () => {
  const { session } = makeSession();
  session.init();
  create(session, ['rect', 'r1', '0', '0', '10', '10']);
  assert.throws(() => session.execute(MoveCommand.parse(['r9', '1', '1'], { shapes: session.shapes })), /no such shape/);
  assert.equal(session.undo(), 'rect#r1 deleted');
});

test('canvas 单参：只改宽度，高度沿用当前值', () => {
  const { session } = makeSession();
  session.init(800, 600);
  assert.equal(session.resizeCanvas(400, null), 'canvas resized to 400x600');
  assert.equal(session.canvasSize(), 'canvas 400x600');
  assert.equal(session.resizeCanvas(null, 300), 'canvas resized to 400x300');
});

test('read 失败时保留原文档与历史（不被空文档覆盖）', () => {
  const { session } = makeSession();
  session.init();
  create(session, ['rect', 'r1', '0', '0', '10', '10']);
  assert.throws(() => session.read('missing.svg'), /cannot read file/);
  assert.equal(session.document.elementCount(), 1);
  assert.equal(session.undo(), 'rect#r1 deleted');
});

test('失败的编辑命令不清空 redo 栈', () => {
  const { session } = makeSession();
  session.init();
  create(session, ['rect', 'r1', '0', '0', '10', '10']);
  assert.equal(session.undo(), 'rect#r1 deleted');
  assert.throws(() => session.execute(MoveCommand.parse(['r9', '1', '1'], { shapes: session.shapes })), /no such shape/);
  assert.equal(session.redo(), 'rect#r1 created', '失败命令不应清空 redo 栈');
});
