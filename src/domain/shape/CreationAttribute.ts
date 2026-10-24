/** 创建该类型图形时需要的属性项：名字 + 是否必填（顺序即序列化/CLI 位置参数顺序）。 */
export interface CreationAttribute {
  readonly name: string;
  readonly required: boolean;
}
