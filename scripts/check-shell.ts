// SPDX-License-Identifier: MIT

import { join } from '@std/path';

import { ROOT } from './lib/files.ts';
import { run } from './lib/grammars.ts';
import { Report, usage } from './lib/report.ts';
import { repositoryFiles } from './lib/repository.ts';

const SHELL_SHEBANG = /^#!(\/bin\/|\/usr\/bin\/env )(sh|bash|dash)\b/;
const CHUNK_BYTES = 512;

function firstLine(path: string): string {
  using file = Deno.openSync(path);
  const decoder = new TextDecoder();
  const chunk = new Uint8Array(CHUNK_BYTES);
  let line = '';
  for (let read = file.readSync(chunk); read !== null; read = file.readSync(chunk)) {
    line += decoder.decode(chunk.subarray(0, read), { stream: true });
    const end = line.indexOf('\n');
    if (end !== -1) {
      return line.slice(0, end);
    }
  }
  return line + decoder.decode();
}

export function shellScripts(root: string): string[] {
  return repositoryFiles(root).filter((path) => SHELL_SHEBANG.test(firstLine(join(root, path))));
}

function main(args: string[]): number {
  const invalid = usage('check-shell.ts', args);
  if (invalid !== undefined) {
    return invalid;
  }
  const report = new Report();
  for (const script of shellScripts(ROOT)) {
    const { ok, output } = run('shellcheck', ['--norc', '--enable=all', script]);
    report.record(`shellcheck ${script}`, ok, output);
  }
  return report.finish('all shell scripts passed shellcheck', 'shell script(s)');
}

if (import.meta.main) {
  Deno.exitCode = main(Deno.args);
}
