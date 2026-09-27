// SPDX-License-Identifier: MIT

import { assert } from '@std/assert';
import { ensureDirSync } from '@std/fs';
import { join } from '@std/path';

import { ROOT } from '../../scripts/lib/files.ts';
import { manifest } from '../../scripts/lib/manifest.ts';
import { parseTiming } from '../../scripts/lib/measure.ts';

const SCRATCH = join(ROOT, '.build', 'performance');
const TIMEOUT_MICROSECONDS = 20_000_000;
const RUNS = 3;
const BASE_SIZE = 100_000;
const MAX_GROWTH = 3;
const MAX_EDIT_SHARE = 0.5;

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
