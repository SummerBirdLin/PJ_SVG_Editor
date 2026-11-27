/** 先注册一个标签再抛错：用于验证"失败插件的全部注册被撤销"。 */
export default {
  activate(context: {
    registerTreeDecorator(decorator: { decoratorName: string; labelFor(): string }): void;
  }): void {
    context.registerTreeDecorator({ decoratorName: 'half-registered', labelFor: () => '[half]' });
    throw new Error('boom from activate');
  },
};
