import { createInterface } from 'node:readline';
import type { ReplOptions } from '../cli/ReplOptions.js';
import type { TextOutput } from '../cli/TextOutput.js';
import { NodeFileStore } from '../io/NodeFileStore.js';
import { createApplication } from './Application.js';
import { CodeAssembly } from './CodeAssembly.js';
import { ConfigAssembly } from './ConfigAssembly.js';
import type { PluginAssembly } from './PluginAssembly.js';

interface CommandLine {
  readonly configPath: string | null;
}

/** `--config <file>` / `--config=<file>`：走配置装配；缺省走代码装配。 */
export function parseCommandLine(argv: readonly string[]): CommandLine {
  let configPath: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? '';
    if (argument === '--config') {
      const next = argv[index + 1];
      if (next === undefined) {
        throw new Error('--config requires a path');
      }
      configPath = next;
      index += 1;
      continue;
    }
    if (argument.startsWith('--config=')) {
      configPath = argument.slice('--config='.length);
      continue;
    }
    throw new Error(`unknown option: ${argument}`);
  }
  return { configPath };
}

/**
 * 命令行入口的全部装配逻辑（`src/main.ts` 只是它的薄壳）。
 *
 * 两种装配方式的差别只在这里：谁来实例化插件、谁决定装哪些插件。
 * - 无参数：代码装配（`CodeAssembly`，本阶段的可选插件默认集合）；
 * - `--config plugins.config.json`：配置装配（`ConfigAssembly`）。
 * 两条路都经 `activatePlugin` 的同一注册与校验路径，装入后行为相同。
 */
export async function runCliMain(argv: readonly string[]): Promise<number> {
  let commandLine: CommandLine;
  try {
    commandLine = parseCommandLine(argv);
  } catch (error) {
    process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }

  const files = new NodeFileStore();
  const optionalAssembly: PluginAssembly = commandLine.configPath === null
    ? new CodeAssembly([])
    : new ConfigAssembly(commandLine.configPath, (path) => files.readText(path));

  const output: TextOutput = {
    write: (text: string): void => {
      process.stdout.write(text);
    },
  };

  const interactive = process.stdin.isTTY === true && process.stdout.isTTY === true;
  const replOptions: ReplOptions = interactive
    ? { banner: "svg-editor 0.2 — type 'help' for commands", prompt: 'svg> ' }
    : {};

  const application = await createApplication({ files, output, optionalAssembly, replOptions });
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: interactive,
  });
  await application.repl.run(readline[Symbol.asyncIterator]());
  return 0;
}
