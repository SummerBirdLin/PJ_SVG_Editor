/** 最小可用插件：注册一个行尾标签，用于验证加载成功路径与相对路径解析。 */
export default {
  activate(context: {
    registerTreeDecorator(decorator: {
      decoratorName: string;
      labelFor(): string;
    }): void;
  }): void {
    context.registerTreeDecorator({
      decoratorName: 'good-marker',
      labelFor: () => '[ok]',
    });
  },
};
