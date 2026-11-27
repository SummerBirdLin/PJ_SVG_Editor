import type * as vscode from 'vscode';
import { ExtensionBootstrap } from './app/ExtensionBootstrap';
import { VscodeBinding } from './vscode/VscodeBinding';

/**
 * 扩展入口（`package.json` 的 `main` 指向打包后的本文件）。
 *
 * `activationEvents: ["onStartupFinished"]`：文件装饰 Provider 必须先注册，
 * Explorer 才会来问"这个文件要不要加标记"；如果等到打开某个 SVG 才激活，
 * 用户看到的就是"Explorer 里没有标记、打开文件后才冒出来"。启动后激活是需求 A.1 的要求。
 */
export function activate(context: vscode.ExtensionContext): void {
  const bootstrap = new ExtensionBootstrap(new VscodeBinding());
  for (const disposable of bootstrap.activate()) {
    context.subscriptions.push({ dispose: () => disposable.dispose() });
  }
}

/**
 * 卸载时的清理：扩展没有常驻定时器或全局状态，
 * 注册的 Disposable 由 `context.subscriptions` 统一释放，这里故意什么都不做。
 */
export function deactivate(): void {
  return;
}
