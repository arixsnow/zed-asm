// SPDX-License-Identifier: MIT

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { emptyDir, ROOT } from '../../scripts/lib/files.ts';
import { languageArgs, run, type RunResult } from '../../scripts/lib/grammars.ts';

export const PRINTABLE = Array.from({ length: 95 }, (_, index) => String.fromCharCode(32 + index));

export function parseFiles(
  grammar: string,
  scratch: string,
  sources: string[],
  args: string[] = [],
): RunResult {
  const directory = join(ROOT, '.build', scratch, grammar);
  emptyDir(directory);
  const files = sources.map((source, index) => {
    const file = join(directory, `${index}.s`);
    writeFileSync(file, source);
    return file;
  });
  return run('tree-sitter', ['parse', ...args, ...languageArgs(grammar), ...files]);
}

export function treeText(output: string): string {
  return output.split('\n').filter((line) => !line.includes('\tParse:')).join('\n');
}

export function flatTrees(grammar: string, scratch: string, sources: string[]): string[] {
  const trees = treeText(parseFiles(grammar, scratch, sources).output)
    .split(/^(?=\(source_file )/m)
    .filter((tree) => tree.startsWith('(source_file '))
    .map((tree) => tree.replace(/ \[\d+, \d+\] - \[\d+, \d+\]/g, '').replace(/\s+/g, ' ').trim());
  if (trees.length !== sources.length) {
    throw new Error(`${grammar}: ${trees.length} trees for ${sources.length} files`);
  }
  return trees;
}
