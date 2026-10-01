// SPDX-License-Identifier: MIT

import { ensureDirSync } from '@std/fs';
import { join } from '@std/path';

import { filesUnder, ROOT } from './lib/files.ts';
import { manifest } from './lib/manifest.ts';
import { parseTiming, queryTime } from './lib/measure.ts';
import { usage } from './lib/report.ts';
import { fixtures } from './verify-fixtures.ts';

const RUNS = 7;
const TARGET_BYTES = 600_000;
const BASICS: Record<string, string> = {
  asm_auto: 'x86-att/basics.s',
  asm_arm: 'a64-gnu/basics.s',
  asm_arm_apple: 'a64-apple/basics.s',
  asm_x86_gas: 'x86-att/basics.s',
  asm_x86_nasm: 'x86-nasm/basics.asm',
};

function column(text: string | number, width: number): string {
  return String(text).padStart(width);
}

function inputs(grammar: string): [string, string][] {
  const all = fixtures()
    .filter((fixture) => fixture.grammars.includes(grammar))
    .map((fixture) => Deno.readTextFileSync(join(ROOT, fixture.file)))
    .join('');
  return [
    ['basics', Deno.readTextFileSync(join(ROOT, 'test', 'fixtures', BASICS[grammar]))],
    ['fixtures', all],
  ];
}

function main(args: string[]): number {
  const invalid = usage('bench.ts', args);
  if (invalid !== undefined) {
    return invalid;
  }
  const directory = join(ROOT, '.build', 'bench');
  ensureDirSync(directory);
  const kinds = [
    ...new Set(
      manifest.languages.flatMap(({ dir }) =>
        filesUnder(join(ROOT, 'languages', dir))
          .filter((name) => name.endsWith('.scm'))
          .map((name) => name.replace(/\.scm$/, ''))
      ),
    ),
  ].sort();
  console.log(
    `${'grammar'.padEnd(14)}${'input'.padEnd(9)}${column('bytes', 8)}${column('parse', 7)}` +
      `${column('edit', 6)}${kinds.map((kind) => column(kind, kind.length + 2)).join('')}` +
      `${column('states', 8)}${column('parser.c', 10)}`,
  );
  for (const { dir, grammar } of manifest.languages) {
    const parser = Deno.readTextFileSync(join(ROOT, 'tree-sitter', grammar, 'src', 'parser.c'));
    const states = /#define STATE_COUNT (\d+)/.exec(parser)?.[1] ?? '?';
    const queries = filesUnder(join(ROOT, 'languages', dir));
    for (const [name, text] of inputs(grammar)) {
      const copies = Math.ceil(TARGET_BYTES / text.length);
      const input = join(directory, `${grammar}-${name}.s`);
      Deno.writeTextFileSync(input, text.repeat(copies));
      const middle = Math.floor((copies * (text.split('\n').length - 1)) / 2);
      const { parse, edit } = parseTiming(grammar, input, {
        runs: RUNS,
        edits: [`${middle},0 0  `],
      });
      const times = kinds.map((kind) =>
        queries.includes(`${kind}.scm`)
          ? queryTime(grammar, join('languages', dir, `${kind}.scm`), input, RUNS).toFixed(1)
          : '-'
      );
      console.log(
        `${grammar.padEnd(14)}${name.padEnd(9)}${column(text.length * copies, 8)}` +
          `${column(parse.toFixed(1), 7)}${column(edit?.toFixed(1) ?? '-', 6)}` +
          `${times.map((time, index) => column(time, kinds[index].length + 2)).join('')}` +
          `${column(states, 8)}${column(parser.length, 10)}`,
      );
    }
  }
  return 0;
}

if (import.meta.main) {
  Deno.exitCode = main(Deno.args);
}
