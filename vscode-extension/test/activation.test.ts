import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ExtensionBootstrap } from '../src/app/ExtensionBootstrap';
import type { DocumentSymbolLike } from '../src/ports/VscodeLike';
import { FakeDocument, FakeUri, FakeVscode } from './support/FakeVscode';

async function flush(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

test('activate 注册了两个功能：文件装饰 Provider + 文档符号 Provider', () => {
  const vscode = new FakeVscode();
  const disposables = new ExtensionBootstrap(vscode).activate();

  assert.equal(disposables.length, 2);
  assert.equal(vscode.decorationProviders.length, 1);
  assert.equal(vscode.symbolRegistrations.length, 1);
});

test('文档选择器只按 **/*.svg 匹配：不依赖 language id，也不锁死 scheme', () => {
  const vscode = new FakeVscode();
  new ExtensionBootstrap(vscode).activate();

  const [registration] = vscode.symbolRegistrations;
  assert.ok(registration !== undefined);
  assert.equal(registration.selector.pattern, '**/*.svg');
  assert.equal(registration.selector.scheme, undefined, '不带 scheme 才能在 Remote 窗口里生效');
  assert.equal('language' in registration.selector, false, '不按语言 id 选择');
});

test('dispose 之后不再持有任何 Provider（卸载不留悬挂注册）', () => {
  const vscode = new FakeVscode();
  const disposables = new ExtensionBootstrap(vscode).activate();
  for (const disposable of disposables) {
    disposable.dispose();
  }
  assert.equal(vscode.decorationProviders.length, 0);
  assert.equal(vscode.symbolRegistrations.length, 0);
});

test('端到端：注册出去的 Provider 真的能产出大纲与徽标', async () => {
  const vscode = new FakeVscode();
  vscode.setFileType('/w/demo.svg', vscode.fileTypes.file);
  new ExtensionBootstrap(vscode).activate();

  const document = new FakeDocument(new FakeUri('/w/demo.svg'), '<svg><g id="a"><rect id="r1"/></g></svg>');

  const [registration] = vscode.symbolRegistrations;
  assert.ok(registration !== undefined);
  const symbols = registration.provider.provideDocumentSymbols(document);
  const [root] = symbols;
  assert.ok(root !== undefined);
  assert.equal(root.name, 'svg');
  const group = root.children[0];
  assert.ok(group !== undefined);
  assert.equal(group.name, 'g#a');
  assert.equal(group.children[0]?.name, 'rect#r1');

  const [decorationProvider] = vscode.decorationProviders;
  assert.ok(decorationProvider !== undefined);
  const uri = new FakeUri('/w/demo.svg');
  const changes: string[] = [];
  decorationProvider.subscribeChanged((changed) => changes.push(changed.path));

  assert.equal(decorationProvider.provideFileDecoration(uri), undefined);
  await flush();
  assert.deepEqual(changes, ['/w/demo.svg'], '真实链路上 onDidChangeFileDecorations 会被触发一次');
  assert.equal(decorationProvider.provideFileDecoration(uri)?.badge, '[]');
});

test('同一个 Provider 实例被 VSCode 反复调用时不残留状态（连续两次返回等价结构）', () => {
  const vscode = new FakeVscode();
  new ExtensionBootstrap(vscode).activate();
  const [registration] = vscode.symbolRegistrations;
  assert.ok(registration !== undefined);

  const document = new FakeDocument(new FakeUri('/w/demo.svg'), '<svg><g id="a"/></svg>');
  const firstRun = registration.provider.provideDocumentSymbols(document);
  const secondRun = registration.provider.provideDocumentSymbols(document);
  assert.deepEqual(JSON.stringify(secondRun), JSON.stringify(firstRun));

  const symbol: DocumentSymbolLike | undefined = secondRun[0];
  assert.ok(symbol !== undefined);
});
