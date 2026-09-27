// SPDX-License-Identifier: MIT

import { ensureDirSync } from '@std/fs';
import { join } from '@std/path';

import { ROOT } from './lib/files.ts';
import { manifest } from './lib/manifest.ts';
import { parseTiming, queryTime } from './lib/measure.ts';
import { usage } from './lib/report.ts';

const RUNS = 7;
const TARGET_BYTES = 600_000;
const INPUTS: Record<string, string> = {
  asm_auto: 'x86-att/basics.s',
  asm_arm: 'a64-gnu/basics.s',
  asm_arm_apple: 'a64-apple/basics.s',
  asm_x86_gas: 'x86-att/basics.s',
  asm_x86_nasm: 'x86-nasm/basics.asm',
};

function column(text: string | number, width: number): string {
  return String(text).padStart(width);
}

function main(args: string[]): number {
  const invalid = usage('bench.ts', args);
  if (invalid !== undefined) {
    return invalid;
  }
  const directory = join(ROOT, '.build', 'bench');
  ensureDirSync(directory);
  console.log(
    `${'grammar'.padEnd(14)}${column('bytes', 9)}${column('parse ms', 10)}${column('edit ms', 9)}` +
      `${column('highlights', 12)}${column('overrides', 11)}${column('states', 8)}${
        column('parser.c', 10)
      }`,
  );
  for (const { dir, grammar } of manifest.languages) {
    const text = Deno.readTextFileSync(join(ROOT, 'test', 'fixtures', INPUTS[grammar]));
    const copies = Math.ceil(TARGET_BYTES / text.length);
    const input = join(directory, `${grammar}.s`);
    Deno.writeTextFileSync(input, text.repeat(copies));
    const middle = Math.floor((copies * text.split('\n').length) / 2);
    const { parse, edit } = parseTiming(grammar, input, { runs: RUNS, edits: [`${middle},0 0  `] });
    const highlights = queryTime(grammar, join('languages', dir, 'highlights.scm'), input, RUNS);
    const overrides = queryTime(grammar, join('languages', dir, 'overrides.scm'), input, RUNS);
    const parser = Deno.readTextFileSync(join(ROOT, 'tree-sitter', grammar, 'src', 'parser.c'));
    const states = /#define STATE_COUNT (\d+)/.exec(parser)?.[1] ?? '?';
    console.log(
      `${grammar.padEnd(14)}${column(text.length * copies, 9)}${column(parse.toFixed(1), 10)}` +
        `${column(edit?.toFixed(1) ?? '-', 9)}${column(highlights.toFixed(1), 12)}` +
        `${column(overrides.toFixed(1), 11)}${column(states, 8)}${column(parser.length, 10)}`,
    );
  }
  return 0;
}

if (import.meta.main) {
  Deno.exitCode = main(Deno.args);
}
