/** 输出端口：REPL 只写文本，不关心 stdout / 缓冲 / 测试替身。 */
export interface TextOutput {
  write(text: string): void;
}
