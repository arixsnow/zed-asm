// SPDX-License-Identifier: MIT

import { assert } from '@std/assert';
import { ensureDirSync } from '@std/fs';
import { join } from '@std/path';

import { filesUnder, ROOT } from '../../scripts/lib/files.ts';
import { languageArgs, run } from '../../scripts/lib/grammars.ts';
import { manifest } from '../../scripts/lib/manifest.ts';
import { parseTiming, queryTime } from '../../scripts/lib/measure.ts';
import { parseFiles, PRINTABLE } from '../lib/parse.ts';

const SCRATCH = join(ROOT, '.build', 'performance');
const TIMEOUT_MICROSECONDS = 20_000_000;
const RUNS = 3;
const BASE_SIZE = 100_000;
const MAX_GROWTH = 3;
const MAX_EDIT_SHARE = 0.5;
const SWEEP_LENGTH = 4_000;
const SWEEP_GROWTH = 2.5;
const SWEEP_FLOOR_MS = 0.5;
const BLOCK_LINES = 5_000;
const RELEX_COPIES = 200;

const VALID = Deno.readTextFileSync(join(ROOT, 'test', 'fixtures', 'x86-att', 'basics.s'));

function generator(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function repeatLines(lines: string[], size: number, seed: number): string {
  const random = generator(seed);
  const parts: string[] = [];
  let length = 0;
  while (length < size) {
    const line = `${lines[Math.floor(random() * lines.length)]}\n`;
    parts.push(line);
    length += line.length;
  }
  return parts.join('');
}

const HOSTILE: Record<string, (size: number) => string | Uint8Array> = {
  'punctuation garbage': (size) => {
    const random = generator(7);
    const alphabet = ')(,]*&^!~[}{<>|?+-=';
    const lines = Array.from(
      { length: 64 },
      () =>
        Array.from({ length: 60 }, () => alphabet[Math.floor(random() * alphabet.length)]).join(''),
    );
    return repeatLines(lines, size, 11);
  },
  'one long line': (size) =>
    `mov x0, ${Array.from({ length: size / 3 }, (_, index) => `a${index % 10}`).join('+')}\n`,
  'nested parentheses': (size) => `mov x0, ${'('.repeat(size / 2)}1${')'.repeat(size / 2)}\n`,
  'unclosed parentheses': (size) => `mov x0, ${'('.repeat(size)}\nnop\n`,
  'unclosed block comment': (size) => `/*\n${VALID.repeat(Math.ceil(size / VALID.length))}`,
  'unterminated strings': (size) => '.ascii "abc\n'.repeat(Math.ceil(size / 12)),
  'binary bytes': (size) => {
    const random = generator(3);
    return Uint8Array.from({ length: size }, () => Math.floor(random() * 256));
  },
  'joined preprocessor lines': (size) => `${'#define X 1 \\\n'.repeat(Math.ceil(size / 14))}nop\n`,
  'many labels on one line': (size) =>
    `${Array.from({ length: size / 4 }, (_, index) => `l${index % 100}:`).join(' ')} nop\n`,
  'glued relocations on one line': (size) =>
    `.long ${Array.from({ length: size / 6 }, () => 'a@PLT').join('+')}\n`,
  'many commas': (size) => `mov x0${','.repeat(size)}\nnop\n`,
  'hash comments': (size) => 'nop # x\n'.repeat(Math.ceil(size / 8)),
  'nested blocks': (size) => `${'.if 1\n'.repeat(size / 12)}nop\n${'.endif\n'.repeat(size / 12)}`,
  'unclosed blocks': (size) => '.if 1\n'.repeat(size / 6),
  'unclosed blocks ending in a broken line': (size) => `${'.if 1\n'.repeat(size / 6)}.`,
  'many clauses': (size) => `.if 1\n${'.elseif 1\nnop\n'.repeat(size / 14)}.endif\n`,
  'glued macro arguments': (size) => `.macro m a\nnop\\a${'\\a'.repeat(size / 2)}\n.endm\n`,
  'many macro parameters': (size) =>
    `.macro m ${
      Array.from({ length: size / 5 }, (_, index) => `a${index % 100}`).join(', ')
    }\n.endm\n`,
  'long .irp list': (size) =>
    `.irp r, ${
      Array.from({ length: size / 4 }, (_, index) => index % 100).join(', ')
    }\nnop\n.endr\n`,
  'stray labels in one operand': (size) => `mov x0, :${'a:'.repeat(size / 2)}\nnop\n`,
  'mixed broken lines': (size) =>
    repeatLines(
      [
        'mov x0, #1',
        'mov x0,',
        ')(',
        '"unterminated',
        'nop // c',
        '#define A 1 \\',
        'b: c:',
        '.byte 1,,2',
      ],
      size,
      5,
    ),
  'valid code': (size) => VALID.repeat(Math.ceil(size / VALID.length)),
};

function write(name: string, content: string | Uint8Array): string {
  ensureDirSync(SCRATCH);
  const file = join(SCRATCH, name);
  if (typeof content === 'string') {
    Deno.writeTextFileSync(file, content);
  } else {
    Deno.writeFileSync(file, content);
  }
  return file;
}

Deno.test('hostile input costs time in proportion to its size', () => {
  const failures: string[] = [];
  for (const [kind, make] of Object.entries(HOSTILE)) {
    const small = write(`${kind.replaceAll(' ', '-')}-1.s`, make(BASE_SIZE));
    const large = write(`${kind.replaceAll(' ', '-')}-2.s`, make(2 * BASE_SIZE));
    for (const grammar of ['asm_auto', 'asm_x86_nasm']) {
      const options = { runs: RUNS, timeoutMicroseconds: TIMEOUT_MICROSECONDS };
      const growth = parseTiming(grammar, large, options).parse /
        Math.max(parseTiming(grammar, small, options).parse, 0.5);
      if (growth > MAX_GROWTH) {
        failures.push(
          `${grammar} ${kind}: doubling the input multiplied the time by ${growth.toFixed(2)}`,
        );
      }
    }
  }
  assert(failures.length === 0, failures.join('\n'));
});

Deno.test('a one-character edit reuses the tree instead of reparsing the file', () => {
  const failures: string[] = [];
  const fixtures: Record<string, string> = {
    asm_auto: 'x86-att/basics.s',
    asm_arm: 'a64-gnu/basics.s',
    asm_arm_apple: 'a64-apple/basics.s',
    asm_x86_gas: 'x86-intel/basics.s',
    asm_x86_nasm: 'x86-nasm/basics.asm',
  };
  for (const { grammar } of manifest.languages) {
    const text = Deno.readTextFileSync(join(ROOT, 'test', 'fixtures', fixtures[grammar]));
    const copies = Math.ceil((6 * BASE_SIZE) / text.length);
    const file = write(`edit-${grammar}.s`, text.repeat(copies));
    const middle = Math.floor((copies * text.split('\n').length) / 2);
    const { parse, edit } = parseTiming(grammar, file, {
      runs: RUNS,
      timeoutMicroseconds: TIMEOUT_MICROSECONDS,
      edits: [`${middle},0 0  `],
    });
    if (edit === undefined || edit > MAX_EDIT_SHARE * parse) {
      failures.push(`${grammar}: an edit took ${edit} ms against ${parse} ms for a full parse`);
    }
  }
  assert(failures.length === 0, failures.join('\n'));
});

Deno.test('an edit inside a block, or typed at the end of a file inside an open block, reuses the tree', () => {
  const failures: string[] = [];
  const fixtures: Record<string, string> = {
    asm_auto: 'x86-att/basics.s',
    asm_arm: 'a64-gnu/basics.s',
    asm_arm_apple: 'a64-apple/basics.s',
    asm_x86_gas: 'x86-att/basics.s',
  };
  for (const [grammar, fixture] of Object.entries(fixtures)) {
    const text = Deno.readTextFileSync(join(ROOT, 'test', 'fixtures', fixture));
    const copies = Math.ceil((6 * BASE_SIZE) / text.length);
    const rows = copies * (text.split('\n').length - 1);
    const cases: [string, string, string][] = [
      [
        'inside-one-block',
        `.rept 2\n${text.repeat(copies)}.endr\n`,
        `${Math.floor(rows / 2)},0 0  `,
      ],
      ['end-of-open-block', `.if 1\n${text.repeat(copies)}`, `${rows + 1},0 0 .`],
    ];
    for (const [name, source, edit] of cases) {
      const file = write(`edit-${name}-${grammar}.s`, source);
      const timing = parseTiming(grammar, file, {
        runs: RUNS,
        timeoutMicroseconds: TIMEOUT_MICROSECONDS,
        edits: [edit],
      });
      if (timing.edit === undefined || timing.edit > MAX_EDIT_SHARE * timing.parse) {
        failures.push(
          `${grammar} ${name}: an edit took ${timing.edit} ms against ${timing.parse} ms for a full parse`,
        );
      }
    }
  }
  assert(failures.length === 0, failures.join('\n'));
});

function editedTokens(grammar: string, name: string, source: string, edit: string): number {
  const file = write(`relex-${name}-${grammar}.s`, source);
  const { output } = run('tree-sitter', [
    'parse',
    '--debug=normal',
    ...languageArgs(grammar),
    file,
    '--edits',
    edit,
  ]);
  const reparse = output.split(/^done$/m)[1] ?? '';
  return reparse.match(/^lexed_lookahead /gm)?.length ?? 0;
}

Deno.test('an edit lexes the same few tokens however many functions the file holds', () => {
  const failures: string[] = [];
  const fixtures: Record<string, string> = {
    asm_auto: 'x86-att/basics.s',
    asm_arm: 'a64-gnu/basics.s',
    asm_arm_apple: 'a64-apple/basics.s',
    asm_x86_gas: 'x86-att/basics.s',
    asm_x86_nasm: 'x86-nasm/basics.asm',
  };
  for (const { grammar, syntax } of manifest.languages) {
    const text = Deno.readTextFileSync(join(ROOT, 'test', 'fixtures', fixtures[grammar]));
    const rows = text.split('\n').length - 1;
    const shapes: [string, (copies: number) => string, number][] = [
      ['top-level', (copies) => text.repeat(copies), 0],
    ];
    if (syntax === 'gas') {
      shapes.push(['in-a-block', (copies) => `.rept 2\n${text.repeat(copies)}.endr\n`, 1]);
    }
    for (const [name, make, offset] of shapes) {
      const [small, large] = [RELEX_COPIES, 2 * RELEX_COPIES].map((copies) =>
        editedTokens(grammar, name, make(copies), `${(copies * rows) / 2 + offset},0 0  `)
      );
      if (small !== large) {
        failures.push(
          `${grammar} ${name}: the edit lexed ${small} tokens, then ${large} in twice the file`,
        );
      }
    }
  }
  assert(failures.length === 0, failures.join('\n'));
});

function sweepLine(unit: string, length: number): string {
  return `nop ${unit.repeat(length / unit.length)}\nnop\n`;
}

function parseTimes(grammar: string, sources: string[]): number[] {
  const { output } = parseFiles(grammar, 'sweep', sources, [
    '--quiet',
    '--time',
    '--timeout',
    String(TIMEOUT_MICROSECONDS),
  ]);
  const times = sources.map(() => Number.NaN);
  for (const [, index, time] of output.matchAll(/(\d+)\.s\s+Parse:\s+([\d.]+) ms/g)) {
    times[Number(index)] = Number(time);
  }
  return times;
}

function sweepGrowth(small: number, large: number): number {
  return large / Math.max(small, SWEEP_FLOOR_MS);
}

Deno.test('a line of any printable character, repeated, costs time in proportion to its length', () => {
  const units = [...new Set(PRINTABLE.flatMap((char) => [char, `${char} `, `${char}a`]))];
  const failures: string[] = [];
  for (const { grammar } of manifest.languages) {
    const times = parseTimes(
      grammar,
      units.flatMap((unit) => [sweepLine(unit, SWEEP_LENGTH), sweepLine(unit, 2 * SWEEP_LENGTH)]),
    );
    const suspects = units.filter((_, index) =>
      !(sweepGrowth(times[2 * index], times[2 * index + 1]) <= SWEEP_GROWTH)
    );
    for (const unit of suspects) {
      const small: number[] = [];
      const large: number[] = [];
      for (let index = 0; index < RUNS; index++) {
        const [first, second] = parseTimes(grammar, [
          sweepLine(unit, SWEEP_LENGTH),
          sweepLine(unit, 2 * SWEEP_LENGTH),
        ]);
        small.push(first);
        large.push(second);
      }
      const growth = sweepGrowth(Math.min(...small), Math.min(...large));
      if (!(growth <= SWEEP_GROWTH)) {
        failures.push(
          `${grammar} ${JSON.stringify(unit)}: doubling the line multiplied the time by ${
            growth.toFixed(2)
          }`,
        );
      }
    }
  }
  assert(failures.length === 0, failures.join('\n'));
});

const BLOCK_SHAPES: [string, string, (lines: number) => string][] = [
  ['one function', 'core', (lines) => `f:\n${'    nop\n'.repeat(lines)}`],
  ['one macro body', 'gas', (lines) => `.macro m\n${'    nop\n'.repeat(lines)}.endm\n`],
  ['one .if body', 'gas', (lines) => `.if 1\n${'    nop\n'.repeat(lines)}.endif\n`],
  ['one .rept body', 'gas', (lines) => `.rept 2\n${'    nop\n'.repeat(lines)}.endr\n`],
];

Deno.test('every query costs time in proportion to the size of the block it runs over', () => {
  const failures: string[] = [];
  for (const { dir, grammar, syntax } of manifest.languages) {
    const queries = filesUnder(join(ROOT, 'languages', dir)).filter((name) =>
      name.endsWith('.scm')
    );
    for (const [shape, source, make] of BLOCK_SHAPES) {
      if (source !== 'core' && source !== syntax) {
        continue;
      }
      const name = shape.replaceAll(/[^a-z]+/g, '-');
      const small = write(`query-${name}-${grammar}-1.s`, make(BLOCK_LINES));
      const large = write(`query-${name}-${grammar}-2.s`, make(2 * BLOCK_LINES));
      for (const query of queries.map((file) => join('languages', dir, file))) {
        const growth = (runs: number) =>
          queryTime(grammar, query, large, runs) /
          Math.max(queryTime(grammar, query, small, runs), SWEEP_FLOOR_MS);
        const first = growth(1);
        const confirmed = first <= MAX_GROWTH ? first : growth(RUNS);
        if (!(confirmed <= MAX_GROWTH)) {
          failures.push(
            `${grammar} ${query} on ${shape}: doubling the block multiplied the time by ${
              confirmed.toFixed(2)
            }`,
          );
        }
      }
    }
  }
  assert(failures.length === 0, failures.join('\n'));
});
