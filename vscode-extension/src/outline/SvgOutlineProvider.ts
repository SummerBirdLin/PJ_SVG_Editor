import type {
  DocumentSymbolLike,
  DocumentSymbolProviderLike,
  TextDocumentLike,
  VscodeLike,
} from '../ports/VscodeLike';
import { LineIndex } from './LineIndex';
import type { OutlineElement } from './OutlineElement';
import { OutlineParser } from './OutlineParser';

/**
 * SVG 大纲 Provider（`vscode.languages.registerDocumentSymbolProvider` 的实现方）。
 *
 * 只做三件事：拿到全文 → 交给 `OutlineParser` → 把元素树翻译成 VSCode 的 `DocumentSymbol` 树。
 * 层级用 `children` 表达；`range` 覆盖整个元素（大括号里的范围），`selectionRange` 只覆盖起始标签，
 * 这样在大纲里点击节点时编辑器把光标放在 `<g id="layer1">` 上，而不是元素末尾。
 */
export class SvgOutlineProvider implements DocumentSymbolProviderLike {
  private readonly vscode: VscodeLike;
  private readonly parser: OutlineParser;

  constructor(vscode: VscodeLike, parser: OutlineParser = new OutlineParser()) {
    this.vscode = vscode;
    this.parser = parser;
  }

  provideDocumentSymbols(document: TextDocumentLike): readonly DocumentSymbolLike[] {
    const text = document.getText();
    try {
      const roots = this.parser.parse(text);
      if (roots.length === 0) {
        return []; // 空文件 / 正在编辑的半截 XML：暂时清空大纲（需求允许）
      }
      const lines = new LineIndex(text);
      return roots.map((root) => this.toSymbol(root, lines, 0));
    } catch {
      // VSCode 会在每次编辑后回调本方法；这里兜底成空大纲，
      // 避免一个解析边界情况把整个 Outline 视图变成错误。
      return [];
    }
  }

  private toSymbol(element: OutlineElement, lines: LineIndex, depth: number): DocumentSymbolLike {
    const children = element.children().map((child) => this.toSymbol(child, lines, depth + 1));
    return this.vscode.createDocumentSymbol({
      name: element.label(),
      detail: '',
      kind: this.kindOf(element, depth, children.length),
      range: {
        start: lines.positionAt(element.start()),
        end: lines.positionAt(element.end()),
      },
      selectionRange: {
        start: lines.positionAt(element.start()),
        end: lines.positionAt(element.tagEnd()),
      },
      children,
    });
  }

  private kindOf(element: OutlineElement, depth: number, childCount: number): number {
    if (depth === 0) {
      return this.vscode.symbolKinds.root;
    }
    if (childCount > 0 || element.isContainer()) {
      return this.vscode.symbolKinds.container;
    }
    return this.vscode.symbolKinds.leaf;
  }
}
