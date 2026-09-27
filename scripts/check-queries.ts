// SPDX-License-Identifier: MIT

import { ensureDirSync } from '@std/fs';
import { join } from '@std/path';

import { ROOT } from './lib/files.ts';
import { languageArgs, run } from './lib/grammars.ts';
import { manifest } from './lib/manifest.ts';
import { Report, usage } from './lib/report.ts';

const SAMPLE = join('.build', 'empty.txt');

function queryFiles(dir: string): string[] {
  return [...Deno.readDirSync(join(ROOT, 'languages', dir))]
    .filter((entry) => entry.isFile && entry.name.endsWith('.scm'))
    .map((entry) => join('languages', dir, entry.name))
    .sort();
}

function main(args: string[]): number {
  const invalid = usage('check-queries.ts', args);
  if (invalid !== undefined) {
    return invalid;
  }
  ensureDirSync(join(ROOT, '.build'));
  Deno.writeTextFileSync(join(ROOT, SAMPLE), '');
  const report = new Report();
  for (const { dir, grammar } of manifest.languages) {
    const language = languageArgs(grammar);
    for (const query of queryFiles(dir)) {
      const { ok, output } = run('tree-sitter', ['query', ...language, '--quiet', query, SAMPLE]);
      report.record(query, ok, output);
    }
  }
  return report.finish('every generated query compiles against its grammar', 'query file(s)');
}

if (import.meta.main) {
  Deno.exitCode = main(Deno.args);
}
