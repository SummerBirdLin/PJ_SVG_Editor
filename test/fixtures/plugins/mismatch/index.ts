/** 声明提供 shapes/["diamond"]，实际注册的是标签：应报 manifest mismatch。 */
export default {
  activate(context: {
    registerTreeDecorator(decorator: { decoratorName: string; labelFor(): string }): void;
  }): void {
    context.registerTreeDecorator({ decoratorName: 'declared-wrong', labelFor: () => '(!)' });
  },
};
