/**
 * Explorer 里显示的文件徽标。
 *
 * VSCode 的 `FileDecoration.badge` 只接受 **1~2 个字符**，需求要求的就是 `[]`（正好 2 个），
 * 所以徽标文本是常量而不是拼接出来的；tooltip 用来解释这个标记的含义。
 */
export class DecorationMark {
  static readonly BADGE = '[]';

  private static readonly SVG_TOOLTIP = 'SVG 文件（svg-marker-outline）';

  private readonly markBadge: string;
  private readonly markTooltip: string;

  private constructor(badge: string, tooltip: string) {
    this.markBadge = badge;
    this.markTooltip = tooltip;
  }

  static svg(): DecorationMark {
    return new DecorationMark(DecorationMark.BADGE, DecorationMark.SVG_TOOLTIP);
  }

  badge(): string {
    return this.markBadge;
  }

  tooltip(): string {
    return this.markTooltip;
  }
}
