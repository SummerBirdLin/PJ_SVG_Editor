/** 模块求值期就抛错：应报"加载失败"，不能误报成"模块找不到"。 */
throw new Error('evaluation blew up');

export default { activate: (): void => {} };
