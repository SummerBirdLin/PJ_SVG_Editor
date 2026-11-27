import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TreePresenter } from '../../src/cli/presenter/TreePresenter.js';
import { GShape } from '../../src/domain/shape/GShape.js';
import { RectShape } from '../../src/domain/shape/RectShape.js';
import { SvgDocument } from '../../src/domain/SvgDocument.js';
import { EditorError } from '../../src/domain/EditorError.js';
import { DocumentEventBus, type DocumentEvent } from '../../src/plugin-api/DocumentEvent.js';
import type { TreeDecorator } from '../../src/plugin-api/TreeDecorator.js';

function sampleDocument(): SvgDocument {
  const document = new SvgDocument(800, 600);
  const group = new GShape('g1');
  group.append(new RectShape('r1', 10, 20, 30, 40));
  document.canvas().append(group);
  document.canvas().append(new RectShape('r2', 0, 0, 5, 5));
  return document;
}

/** 只对某个 id 打标签的装饰器（模拟 modified-star 的最小形态）。 */
function marker(ids: readonly string[], label: string): TreeDecorator {
  return {
    decoratorName: `mark-${label}`,
    labelFor: ({ shape }) => (shape !== null && ids.includes(shape.id()) ? label : ''),
  };
}

test('tree：没有装饰器时输出与阶段 1 逐字节一致（无尾随空格）', () => {
  const lines = new TreePresenter().render(sampleDocument());
  assert.deepEqual(lines, [
    'svg (800x600)',
    '├── g#g1',
    '│   └── rect#r1  x=10 y=20 w=30 h=40',
    '└── rect#r2  x=0 y=0 w=5 h=5',
  ]);
  assert.ok(lines.every((line) => line === line.trimEnd()), '不应出现尾随空格');
});

test('tree：多个装饰器按注册顺序拼接，只加在命中行', () => {
  const presenter = new TreePresenter([marker(['r1'], '*'), marker(['g1'], '(box)')]);
  const lines = presenter.render(sampleDocument());
  assert.deepEqual(lines, [
    'svg (800x600)',
    '├── g#g1 (box)',
    '│   └── rect#r1  x=10 y=20 w=30 h=40 *',
    '└── rect#r2  x=0 y=0 w=5 h=5',
  ]);
});

test('tree：装饰器可以标注根行（shape === null）', () => {
  const rootMarker: TreeDecorator = {
    decoratorName: 'root-star',
    labelFor: ({ shape }) => (shape === null ? '*' : ''),
  };
  assert.deepEqual(new TreePresenter([rootMarker]).render(sampleDocument())[0], 'svg (800x600) *');
});

test('tree：装饰器抛错时报可定位的错误（渲染器不静默吞掉插件故障）', () => {
  const broken: TreeDecorator = {
    decoratorName: 'broken-decorator',
    labelFor: () => {
      throw new Error('nope');
    },
  };
  assert.throws(
    () => new TreePresenter([broken]).render(sampleDocument()),
    (error: unknown) => error instanceof EditorError
      && error.message === 'tree decorator failed: broken-decorator (nope)',
  );
});

test('tree：装饰器返回非字符串违反契约 → 明确报错', () => {
  const wrong = {
    decoratorName: 'wrong-decorator',
    labelFor: () => 42,
  } as unknown as TreeDecorator;
  assert.throws(
    () => new TreePresenter([wrong]).render(sampleDocument()),
    (error: unknown) => error instanceof EditorError
      && error.message === 'tree decorator failed: wrong-decorator (label must be a string)',
  );
});

test('DocumentEventBus：单个订阅者抛错不影响其他订阅者', () => {
  const bus = new DocumentEventBus();
  const seen: string[] = [];
  bus.subscribe(() => {
    throw new Error('bad listener');
  });
  bus.subscribe((event: DocumentEvent) => seen.push(event.kind));
  bus.publish({ kind: 'changed', document: sampleDocument() });
  bus.publish({ kind: 'saved', document: sampleDocument() });
  assert.deepEqual(seen, ['changed', 'saved']);
});
