/** REPL 的可选外观：交互式终端才需要 banner 与提示符（管道回放时置空，输出干净可断言）。 */
export interface ReplOptions {
  readonly banner?: string;
  readonly prompt?: string;
}
