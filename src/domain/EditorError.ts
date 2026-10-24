/**
 * 统一的可预期错误类型：由命令层/IO 层抛出，REPL 统一加 `error: ` 前缀输出。
 * 只承载"给用户看的单行消息"，不含调用栈语义。
 */
export class EditorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EditorError';
  }
}
