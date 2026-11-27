import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ContributionRegistry } from '../../src/plugin-api/ContributionRegistry.js';
import { ContributionDeclarations } from '../../src/plugin-api/ContributionDeclarations.js';
import { DuplicateContributionError, ManifestMismatchError, PluginContractError } from '../../src/plugin-api/PluginErrors.js';
import type { AttributeHandler } from '../../src/plugin-api/AttributeHandler.js';
import { ShapeTargetView } from '../../src/plugin-api/ShapeTarget.js';
import { ShapeFactory } from '../../src/domain/shape/ShapeFactory.js';
import { RectShape } from '../../src/domain/shape/RectShape.js';
import { builtinShapes } from '../../src/builtin/BuiltinShapes.js';
import { createTestKernel } from '../support/Kernel.js';

/** 一个只用于测试的最小 ShapeProvider（类型名可自定义）。 */
class FakeProvider {
  readonly typeName: string;

  readonly svgTag: string;

  readonly creationAttributes = [];

  constructor(typeName: string, svgTag: string) {
    this.typeName = typeName;
    this.svgTag = svgTag;
  }

  create(id: string): RectShape {
    return new RectShape(id);
  }
}

function registerBuiltinShapes(registry: ContributionRegistry): void {
  const staging = registry.beginPlugin('builtin-shapes', builtinShapes.contributes ?? null);
  builtinShapes.activate(staging);
  registry.commit(staging);
}

test('注册表：暂存区未 commit 时对内不可见，commit 后才生效', () => {
  const registry = new ContributionRegistry();
  const staging = registry.beginPlugin('p1', null);
  staging.registerShape(new FakeProvider('diamond', 'polygon') as never);
  assert.equal(registry.hasType('diamond'), false);

  registry.commit(staging);
  assert.equal(registry.hasType('diamond'), true);
  assert.deepEqual(registry.typeNames(), ['diamond']);
  assert.deepEqual(registry.loadedPlugins(), ['p1']);
});

test('注册表：discard 的暂存区不产生任何写入', () => {
  const registry = new ContributionRegistry();
  const staging = registry.beginPlugin('p1', null);
  staging.registerShape(new FakeProvider('diamond', 'polygon') as never);
  registry.discard(staging);
  assert.equal(registry.hasType('diamond'), false);
  assert.deepEqual(registry.loadedPlugins(), []);
});

test('注册表：同一插件内重复注册名字在注册时即被拒绝', () => {
  const registry = new ContributionRegistry();
  const staging = registry.beginPlugin('p1', null);
  staging.registerShape(new FakeProvider('diamond', 'polygon') as never);
  assert.throws(
    () => staging.registerShape(new FakeProvider('diamond', 'polyline') as never),
    (error: unknown) => error instanceof DuplicateContributionError
      && error.message === 'duplicate registration: shapes/diamond',
  );
});

test('注册表：跨插件重复注册拒绝后一个，已成功的插件不受影响（整体回滚）', () => {
  const registry = new ContributionRegistry();
  registerBuiltinShapes(registry);

  const bad = registry.beginPlugin('p2', null);
  bad.registerTreeDecorator({ decoratorName: 'p2-label', labelFor: () => '[*]' });
  bad.registerShape(new FakeProvider('rect', 'rect') as never);

  assert.throws(
    () => registry.commit(bad),
    (error: unknown) => error instanceof DuplicateContributionError
      && error.message === 'duplicate registration: shapes/rect',
  );
  // p2 的另一个注册（decorator）不得留下半个
  assert.deepEqual(registry.treeDecorators(), []);
  assert.deepEqual(registry.loadedPlugins(), ['builtin-shapes']);
});

test('注册表：清单声明与实际注册不一致时报 manifest mismatch', () => {
  const registry = new ContributionRegistry();
  const declarations = ContributionDeclarations.fromPlain({ shapes: ['diamond'] }, 'p3');
  const staging = registry.beginPlugin('p3', declarations);
  staging.registerTreeDecorator({ decoratorName: 'declared-wrong', labelFor: () => '(!)' });

  assert.throws(
    () => registry.commit(staging),
    (error: unknown) => error instanceof ManifestMismatchError
      && error.message
        === 'plugin manifest mismatch: p3 (declared: shapes=[diamond], registered: decorators=[declared-wrong])',
  );
  assert.equal(registry.hasType('diamond'), false);
  assert.deepEqual(registry.treeDecorators(), []);
});

test('注册表：没有清单（null）时不比对，但重复校验仍生效', () => {
  const registry = new ContributionRegistry();
  const staging = registry.beginPlugin('p4', null);
  staging.registerTreeDecorator({ decoratorName: 'free-label', labelFor: () => '(x)' });
  registry.commit(staging);
  assert.equal(registry.treeDecorators().length, 1);
});

test('注册表：扩展点契约违规给出可定位的错误（缺成员 / 空名字 / 非函数）', () => {
  const registry = new ContributionRegistry();
  const staging = registry.beginPlugin('p5', null);

  assert.throws(
    () => staging.registerShape({ typeName: '', svgTag: 'rect', creationAttributes: [], create: () => new RectShape('x') } as never),
    (error: unknown) => error instanceof PluginContractError && /typeName/.test(error.reason),
  );
  assert.throws(
    () => staging.registerCommand({ commandName: 'x', usage: 'x', summary: 'x' } as never),
    (error: unknown) => error instanceof PluginContractError && /create/.test(error.reason),
  );
  assert.throws(
    () => staging.registerTreeDecorator({ decoratorName: 'y' } as never),
    (error: unknown) => error instanceof PluginContractError && /labelFor/.test(error.reason),
  );
});

test('注册表：同一插件名重复装载被拒绝', () => {
  const registry = new ContributionRegistry();
  const staging = registry.beginPlugin('dup-name', null);
  staging.registerTreeDecorator({ decoratorName: 'a', labelFor: () => 'a' });
  registry.commit(staging);
  assert.throws(() => registry.beginPlugin('dup-name', null), /plugin already loaded/);
});

test('ShapeFactory：注册表晚于工厂创建也能立即生效（不缓存类型表）', () => {
  const registry = new ContributionRegistry();
  registerBuiltinShapes(registry);
  const factory = new ShapeFactory(registry);
  assert.equal(factory.hasType('diamond'), false);

  const staging = registry.beginPlugin('late-shape', null);
  staging.registerShape(new FakeProvider('diamond', 'polygon') as never);
  registry.commit(staging);

  assert.equal(factory.hasType('diamond'), true);
  assert.ok(factory.create('diamond', 'd1', { attributes: new Map(), textContent: null }) instanceof RectShape);
  assert.equal(factory.providerForTag('polygon')?.typeName, 'diamond');
});

test('注册表：属性处理器按优先级降序返回，只返回命中者', () => {
  const kernel = createTestKernel();
  const shape = kernel.shapes.create('rect', 'r1', { attributes: new Map(), textContent: null });
  const target = new ShapeTargetView(shape);
  const low: AttributeHandler = {
    handlerName: 'low',
    priority: 1,
    handles: (_t, attr) => attr === 'label',
    apply: () => {},
  };
  const high: AttributeHandler = { ...low, handlerName: 'high', priority: 9 };
  const other: AttributeHandler = { ...low, handlerName: 'other', handles: () => false };

  const registry = new ContributionRegistry();
  const staging = registry.beginPlugin('handlers', null);
  staging.registerAttributeHandler(low);
  staging.registerAttributeHandler(high);
  staging.registerAttributeHandler(other);
  registry.commit(staging);

  assert.deepEqual(registry.handlersFor(target, 'label').map((item) => item.handlerName), ['high', 'low']);
  assert.deepEqual(registry.handlersFor(target, 'fill'), []);
});
