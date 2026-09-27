// SPDX-License-Identifier: MIT

import { emptyDirSync } from '@std/fs';
import { join } from '@std/path';

import { ROOT } from '../../scripts/lib/files.ts';
import { languageArgs, run, type RunResult } from '../../scripts/lib/grammars.ts';

export const PRINTABLE = Array.from({ length: 95 }, (_, index) => String.fromCharCode(32 + index));

export function parseFiles(
  grammar: string,
  scratch: string,
  sources: string[],
  args: string[] = [],
): RunResult {
  const directory = join(ROOT, '.build', scratch, grammar);
  emptyDirSync(directory);
  const files = sources.map((source, index) => {
    const file = join(directory, `${index}.s`);
    Deno.writeTextFileSync(file, source);
    return file;
  });
  return run('tree-sitter', ['parse', ...args, ...languageArgs(grammar), ...files]);
}

export function treeText(output: string): string {
  return output.split('\n').filter((line) => !line.includes('\tParse:')).join('\n');
}
