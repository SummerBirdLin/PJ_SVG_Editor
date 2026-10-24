import { EditorError } from '../domain/EditorError.js';
import type { Shape } from '../domain/shape/Shape.js';
import type { ContainerShape } from '../domain/shape/ContainerShape.js';
import type { ShapeProvider } from '../domain/shape/provider/ShapeProvider.js';
import { Command } from './Command.js';
import type { CommandContext } from './CommandContext.js';
import type { CommandParseContext } from './CommandParseContext.js';

/**
 * `create <type> <id> [params…] [in <containerId>]`
 *
 * 参数个数与顺序来自 ShapeProvider 的 `creationAttributes`（领域事实），
 * 本类只负责：分辨 `in` 子句、把位置参数按序填成属性表、拼 usage。
 */
export class CreateCommand extends Command {
  static readonly commandName = 'create';

  static readonly usage = 'create <type> <id> [params…] [in <containerId>]';

  static readonly summary = 'create a shape; optional `in <containerId>` puts it into a group';

  private createdShape: Shape | null = null;

  private targetContainer: ContainerShape | null = null;

  private constructor(
    private readonly typeName: string,
    private readonly shapeId: string,
    private readonly attributes: ReadonlyMap<string, string>,
    private readonly textContent: string | null,
    private readonly containerId: string | null,
  ) {
    super();
  }

  static parse(args: string[], context: CommandParseContext): CreateCommand {
    if (args.length < 2) {
      throw new EditorError(`usage: ${CreateCommand.usage}`);
    }
    const typeName = args[0] ?? '';
    const shapeId = args[1] ?? '';
    const provider = context.shapes.providerForType(typeName);

    let rest = args.slice(2);
    let containerId: string | null = null;
    if (rest.length >= 2 && rest[rest.length - 2] === 'in') {
      containerId = rest[rest.length - 1] ?? null;
      rest = rest.slice(0, rest.length - 2);
    }

    const creation = provider.creationAttributes;
    const requiredCount = creation.filter((attribute) => attribute.required).length;
    const minCount = requiredCount + (provider.hasTextContent ? 1 : 0);
    const maxCount = creation.length + (provider.hasTextContent ? 1 : 0);
    if (rest.length < minCount || rest.length > maxCount) {
      throw new EditorError(`usage: ${CreateCommand.usageFor(provider)}`);
    }

    const attributes = new Map<string, string>();
    const positionalCount = Math.min(rest.length, creation.length);
    for (let index = 0; index < positionalCount; index += 1) {
      const attribute = creation[index];
      const value = rest[index];
      if (attribute !== undefined && value !== undefined) {
        attributes.set(attribute.name, value);
      }
    }
    const textContent = provider.hasTextContent ? rest[rest.length - 1] ?? null : null;
    return new CreateCommand(typeName, shapeId, attributes, textContent, containerId);
  }

  private static usageFor(provider: ShapeProvider): string {
    const parameters = provider.creationAttributes.map((attribute) =>
      attribute.required ? `<${attribute.name}>` : `[${attribute.name}]`,
    );
    const content = provider.hasTextContent ? ['"<content>"'] : [];
    return `create ${provider.typeName} <id> ${[...parameters, ...content].join(' ')}`.trim();
  }

  execute(context: CommandContext): string {
    const document = context.document;
    let parent: ContainerShape = document.canvas();
    if (this.containerId !== null) {
      parent = Command.locateContainerOrFail(document, this.containerId);
    }
    if (document.isIdTaken(this.shapeId)) {
      throw new EditorError(`id already exists: ${this.shapeId}`);
    }

    const shape = context.shapes.create(this.typeName, this.shapeId, {
      attributes: this.attributes,
      textContent: this.textContent,
    });
    parent.append(shape);
    this.createdShape = shape;
    this.targetContainer = parent;

    if (this.containerId === null) {
      return `${shape.label()} created`;
    }
    return `${shape.label()} created in ${parent.label()}`;
  }

  undo(_context: CommandContext): string {
    const shape = this.createdShape;
    const parent = this.targetContainer;
    if (shape === null || parent === null) {
      throw new EditorError('cannot undo create: command was never executed');
    }
    parent.remove(shape);
    return `${shape.label()} deleted`;
  }
}
