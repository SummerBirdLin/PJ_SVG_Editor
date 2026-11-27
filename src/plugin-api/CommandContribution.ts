import type { ShapeFactory } from '../domain/shape/ShapeFactory.js';
import type { EditHost, UndoableEdit } from './EditHost.js';

/** 命令插件解析参数时能拿到的东西（如 `create` 需要问工厂"该类型要哪些属性"）。 */
export interface CommandEnvironment {
  readonly shapes: ShapeFactory;
}

/** 宿主交给插件命令的能力：只读文档 + 提交一条可撤销编辑。 */
export interface CommandHost extends EditHost {
  hasDocument(): boolean;

  /** 提交一条可撤销编辑（进 undo 栈），返回回显文本。 */
  commitEdit(edit: UndoableEdit): string;
}

/** 解析成功后拿到的可执行体：REPL 只调用 `run` 并打印返回的行。 */
export interface CommandInvocation {
  run(host: CommandHost): string[];
}

/**
 * 扩展点 2/4：**一条可用命令**。
 *
 * 命令自己提供名字、`usage`、`help` 摘要与参数解析，因此
 * 内核的注册表与 `help` 都不需要认识具体命令；未加载该插件时
 * 执行同名命令只会得到 `unknown command`（缺省行为）。
 */
export interface CommandContribution {
  readonly commandName: string;

  readonly usage: string;

  readonly summary: string;

  /** 解析参数；语法错误在此抛出（此时尚未触碰文档）。 */
  create(args: string[], environment: CommandEnvironment): CommandInvocation;
}

/** 内核向注册表提供命令的方式（按注册顺序）。 */
export interface CommandCatalog {
  commands(): readonly CommandContribution[];
}
