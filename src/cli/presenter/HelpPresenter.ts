import type { CommandRegistry } from '../CommandRegistry.js';

/** `help` 的格式化（Strategy）：命令表来自注册表，新增命令自动出现在 help 里。 */
export class HelpPresenter {
  private readonly registry: CommandRegistry;

  constructor(registry: CommandRegistry) {
    this.registry = registry;
  }

  render(): string[] {
    const entries = this.registry.entriesList();
    const width = Math.max(...entries.map((entry) => entry.usage.length));
    const lines: string[] = ['commands:'];
    for (const entry of entries) {
      lines.push(`  ${entry.usage.padEnd(width + 2)}${entry.summary}`);
    }
    return lines;
  }
}
