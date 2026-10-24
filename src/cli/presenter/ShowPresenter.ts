import { EditorError } from '../../domain/EditorError.js';
import type { SvgDocument } from '../../domain/SvgDocument.js';

/** `show <id>` 的格式化（Strategy）：首行 label + parent，随后 2 空格缩进的明细行。 */
export class ShowPresenter {
  render(document: SvgDocument, shapeId: string): string[] {
    const located = document.locate(shapeId);
    if (located === null) {
      throw new EditorError(`no such shape: ${shapeId}`);
    }
    const lines: string[] = [`${located.shape.label()}  parent=${located.parent.label()}`];
    for (const detail of located.shape.detailLines()) {
      lines.push(`  ${detail}`);
    }
    return lines;
  }
}
