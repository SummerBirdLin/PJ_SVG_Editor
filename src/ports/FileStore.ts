/**
 * 文本文件的抽象边界。
 *
 * 实现方必须把底层错误转换成 EditorError：
 * - 读失败 → `cannot read file: <path>`
 * - 写失败 → `cannot write file: <path>`
 */
export interface FileStore {
  readText(path: string): string;

  writeText(path: string, content: string): void;
}
