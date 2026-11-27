import { runCliMain } from './host/CliMain.js';

/** 进程入口：把所有装配交给 host（组合根），这里只负责退出码。 */
const code = await runCliMain(process.argv.slice(2));
if (code !== 0) {
  process.exitCode = code;
}
