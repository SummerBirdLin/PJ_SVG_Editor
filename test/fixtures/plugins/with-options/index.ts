/** 类形式插件：构造时接收配置里的 options，用于验证 options 传递。 */
interface Options {
  readonly text?: string;
}

export default class OptionsPlugin {
  private readonly text: string;

  constructor(options?: unknown) {
    const parsed = (options ?? {}) as Options;
    this.text = parsed.text ?? '(no options)';
  }

  activate(context: {
    registerTreeDecorator(decorator: { decoratorName: string; labelFor(): string }): void;
  }): void {
    context.registerTreeDecorator({
      decoratorName: 'options-marker',
      labelFor: () => `<${this.text}>`,
    });
  }
}
