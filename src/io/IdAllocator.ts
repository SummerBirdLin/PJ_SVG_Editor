/**
 * 读入 SVG 时为"缺 id / 重复 id"分配新 id 的策略：
 * - `keep(id)`：显式 id 且此前未出现 → 保留；
 * - `allocate(tag)`：按"标签名 + 递增序号"生成，跳过文档中已占用（显式或已生成）的 id。
 */
export class IdAllocator {
  private readonly reserved = new Set<string>();

  private readonly used = new Set<string>();

  private readonly counters = new Map<string, number>();

  constructor(explicitIds: Iterable<string>) {
    for (const id of explicitIds) {
      this.reserved.add(id);
    }
  }

  keep(id: string): boolean {
    if (this.used.has(id)) {
      return false;
    }
    this.used.add(id);
    return true;
  }

  allocate(tagName: string): string {
    let counter = this.counters.get(tagName) ?? 0;
    let candidate = `${tagName}${counter + 1}`;
    while (this.reserved.has(candidate) || this.used.has(candidate)) {
      counter += 1;
      candidate = `${tagName}${counter + 1}`;
    }
    this.counters.set(tagName, counter + 1);
    this.used.add(candidate);
    return candidate;
  }
}
