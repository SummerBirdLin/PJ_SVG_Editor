import type { TextOutput } from '../../src/cli/TextOutput.js';

/** 测试用输出缓冲：把 REPL 写出的文本累积起来，便于整段比对。 */
export class BufferOutput implements TextOutput {
  private readonly chunks: string[] = [];

  write(text: string): void {
    this.chunks.push(text);
  }

  clear(): void {
    this.chunks.length = 0;
  }

  value(): string {
    return this.chunks.join('');
  }
}
