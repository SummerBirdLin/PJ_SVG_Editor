import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DecorationMark } from '../src/decoration/DecorationMark';
import { FacadeFileKindProbe } from '../src/decoration/FacadeFileKindProbe';
import { SvgDecorationJudge } from '../src/decoration/SvgDecorationJudge';
import { SvgFileDecorationProvider } from '../src/decoration/SvgFileDecorationProvider';
import type { FileKind } from '../src/ports/FileKindProbe';
import type { UriLike } from '../src/ports/VscodeLike';
import { FakeUri, FakeVscode, ManualFileKindProbe } from './support/FakeVscode';

/** 等异步探测链（probe → judge → notify）跑完。 */
async function flush(): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

function svgFileProbe(): ManualFileKindProbe {
  const answers = new Map<string, FileKind>();
  answers.set('file:///w/demo.svg', 'file');
  return new ManualFileKindProbe(answers);
}

test('非 SVG 文件不加标记，也不会去 stat（后缀判定是同步的）', () => {
  const probe = new ManualFileKindProbe();
  const judge = new SvgDecorationJudge(probe);

  assert.equal(judge.mark(new FakeUri('/w/notes.md')), null);
  assert.equal(judge.mark(new FakeUri('/w/svg.json')), null);
  assert.equal(judge.mark(new FakeUri('/w/demo.svg.bak')), null);
  assert.deepEqual(probe.calls, [], '不该为无关文件发起探测');
});

test('SVG 文件：首次询问先不加标记，探测完成后加 [] 并触发一次刷新', async () => {
  const probe = svgFileProbe();
  const judge = new SvgDecorationJudge(probe);
  const refreshed: string[] = [];
  judge.subscribeChanged((uri) => refreshed.push(uri.path));

  const uri = new FakeUri('/w/demo.svg');
  assert.equal(judge.mark(uri), null, 'provideFileDecoration 是同步的，第一轮先不给');

  await flush();
  assert.deepEqual(refreshed, ['/w/demo.svg'], '探测完成后通知 VSCode 重新来问');

  const mark = judge.mark(uri);
  assert.ok(mark !== null);
  assert.equal(mark.badge(), '[]');
  assert.equal(mark.badge().length, 2, 'VSCode badge 上限 2 个字符');
  assert.match(mark.tooltip(), /SVG/);
  assert.equal(probe.calls.length, 1);
});

test('目录不加标记（即使名字以 .svg 结尾），且判定结果被缓存', async () => {
  const probe = new ManualFileKindProbe(new Map([['file:///w/folder.svg', 'directory' as FileKind]]));
  const judge = new SvgDecorationJudge(probe);
  const uri = new FakeUri('/w/folder.svg');

  assert.equal(judge.mark(uri), null);
  await flush();
  assert.equal(judge.mark(uri), null, '目录永远没有标记');

  for (let round = 0; round < 5; round += 1) {
    judge.mark(uri);
  }
  assert.equal(probe.calls.length, 1, '一次探测结果足够，不要在每次刷新时重来');
});

test('探测失败（stat 抛错）不加标记，也不重复重试', async () => {
  const probe = new ManualFileKindProbe();
  const judge = new SvgDecorationJudge(probe);
  const uri = new FakeUri('/w/missing.svg');
  const refreshed: string[] = [];
  judge.subscribeChanged((changed) => refreshed.push(changed.path));

  assert.equal(judge.mark(uri), null);
  await flush();
  probe.fail('file:///w/missing.svg');
  await flush();

  assert.equal(judge.mark(uri), null);
  assert.deepEqual(refreshed, [], '结果没变（仍然没有标记）就不必刷新');
  assert.equal(probe.calls.length, 1);
  assert.equal(judge.cachedCount(), 1);
});

test('并发询问同一个 Uri 只发起一次探测（Explorer 滚动不会打爆 stat）', async () => {
  const probe = new ManualFileKindProbe();
  const judge = new SvgDecorationJudge(probe);
  const uri = new FakeUri('/w/demo.svg');

  judge.mark(uri);
  judge.mark(uri);
  judge.mark(uri);
  assert.equal(probe.calls.length, 1);

  probe.resolve('file:///w/demo.svg', 'file');
  await flush();
  assert.ok(judge.mark(uri) !== null);
});

test('大写后缀 .SVG 也认（VSCode 里的文件名大小写不敏感）', async () => {
  const probe = new ManualFileKindProbe(new Map([['file:///w/DEMO.SVG', 'file' as FileKind]]));
  const judge = new SvgDecorationJudge(probe);
  const uri = new FakeUri('/w/DEMO.SVG');
  judge.mark(uri);
  await flush();
  assert.ok(judge.mark(uri) !== null);
});

test('Remote 窗口（vscode-remote scheme）里的 SVG 同样加标记', async () => {
  const uri = new FakeUri('/home/u/demo.svg', 'vscode-remote');
  const probe = new ManualFileKindProbe(new Map([[uri.toString(), 'file' as FileKind]]));
  const judge = new SvgDecorationJudge(probe);
  judge.mark(uri);
  await flush();
  assert.ok(judge.mark(uri) !== null);
});

test('取消订阅后不再收到刷新通知', async () => {
  const probe = new ManualFileKindProbe();
  const judge = new SvgDecorationJudge(probe);
  const refreshed: string[] = [];
  const subscription = judge.subscribeChanged((uri) => refreshed.push(uri.path));

  const uri = new FakeUri('/w/demo.svg');
  judge.mark(uri);
  subscription.dispose();
  probe.resolve('file:///w/demo.svg', 'file');
  await flush();

  assert.deepEqual(refreshed, []);
  assert.ok(judge.mark(uri) !== null, '缓存依然生效，只是不再通知');
});

test('DecorationMark 只是 [] 徽标 + tooltip 的值对象', () => {
  const mark = DecorationMark.svg();
  assert.equal(mark.badge(), '[]');
  assert.equal(DecorationMark.BADGE, '[]');
});

test('FacadeFileKindProbe 用位标志区分文件/目录/未知', async () => {
  const vscode = new FakeVscode();
  vscode.setFileType('/w/a.svg', vscode.fileTypes.file);
  vscode.setFileType('/w/b.svg', vscode.fileTypes.directory);
  vscode.setFileType('/w/link.svg', vscode.fileTypes.file | 64); // File | SymbolicLink
  const probe = new FacadeFileKindProbe(vscode);

  assert.equal(await probe.kindOf(new FakeUri('/w/a.svg')), 'file');
  assert.equal(await probe.kindOf(new FakeUri('/w/b.svg')), 'directory');
  assert.equal(await probe.kindOf(new FakeUri('/w/link.svg')), 'file');
  assert.equal(await probe.kindOf(new FakeUri('/w/gone.svg')), 'unknown', 'stat 失败 = 类型未知');
});

test('SvgFileDecorationProvider 把判定翻译成 FileDecoration，非 SVG 返回 undefined', async () => {
  const vscode = new FakeVscode();
  vscode.setFileType('/w/demo.svg', vscode.fileTypes.file);
  const provider = new SvgFileDecorationProvider(vscode);
  const uri: UriLike = new FakeUri('/w/demo.svg');

  assert.equal(provider.provideFileDecoration(uri), undefined);
  await flush();
  const decoration = provider.provideFileDecoration(uri);
  assert.ok(decoration !== undefined);
  assert.equal(decoration.badge, '[]');
  assert.equal(provider.provideFileDecoration(new FakeUri('/w/notes.md')), undefined);
});
