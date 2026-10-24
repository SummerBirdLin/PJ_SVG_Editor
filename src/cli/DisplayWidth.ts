/**
 * 终端显示宽度：CJK / 全角字符占 2 列，其余按 1 列。
 *
 * tree 的内联属性要对齐，而 `label().length` 会把中文 id 当成 1 列导致错位，
 * 因此对齐一律用本类计算显示宽度。
 */
export class DisplayWidth {
  width(text: string): number {
    let total = 0;
    for (const character of text) {
      total += this.isWide(character.codePointAt(0) ?? 0) ? 2 : 1;
    }
    return total;
  }

  padEnd(text: string, targetWidth: number): string {
    return text + ' '.repeat(Math.max(0, targetWidth - this.width(text)));
  }

  private isWide(codePoint: number): boolean {
    return (
      (codePoint >= 0x1100 && codePoint <= 0x115f)
      || (codePoint >= 0x2e80 && codePoint <= 0x303e)
      || (codePoint >= 0x3041 && codePoint <= 0x33ff)
      || (codePoint >= 0x3400 && codePoint <= 0x4dbf)
      || (codePoint >= 0x4e00 && codePoint <= 0x9fff)
      || (codePoint >= 0xa000 && codePoint <= 0xa4cf)
      || (codePoint >= 0xa960 && codePoint <= 0xa97f)
      || (codePoint >= 0xac00 && codePoint <= 0xd7a3)
      || (codePoint >= 0xf900 && codePoint <= 0xfaff)
      || (codePoint >= 0xfe10 && codePoint <= 0xfe19)
      || (codePoint >= 0xfe30 && codePoint <= 0xfe6f)
      || (codePoint >= 0xff00 && codePoint <= 0xff60)
      || (codePoint >= 0xffe0 && codePoint <= 0xffe6)
      || (codePoint >= 0x1f300 && codePoint <= 0x1f64f)
      || (codePoint >= 0x1f900 && codePoint <= 0x1f9ff)
      || (codePoint >= 0x20000 && codePoint <= 0x3fffd)
    );
  }
}
