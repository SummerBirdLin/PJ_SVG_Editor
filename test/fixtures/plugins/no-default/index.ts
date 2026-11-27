/** 只有具名导出，没有 default：应报 "plugin has no default export"。 */
export const activate = (): void => {
  // 不是默认导出，加载器不应看到它
};
