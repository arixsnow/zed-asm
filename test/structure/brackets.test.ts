// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';

import { manifest } from '../../scripts/lib/manifest.ts';
import type { Point } from '../lib/zed.ts';
import { queryMatchesFor } from '../lib/zed-syntax.ts';

interface BracketCase {
  name: string;
  grammars: string[];
  source: string;
  pairs: string[];
}

const CASES: BracketCase[] = [
  {
    name: 'ARM brackets, register lists, parentheses and strings',
    grammars: ['asm_auto', 'asm_arm', 'asm_arm_apple'],
    source: 'ldr x0, [x1, #(2)]\nld1 {v0.16b}, [x0]\n.ascii "a"\n',
    pairs: ['[x1, #(2)]', '(2)', '{v0.16b}', '[x0]', '"a"'],
  },
  {
    name: 'Intel brackets, AT&T memory parentheses and strings',
    grammars: ['asm_auto', 'asm_x86_gas'],
    source: [
      '.intel_syntax noprefix',
      'mov eax, DWORD PTR [rbx+(8)]',
      '.att_syntax',
      'movq 8(%rax), %rbx',
      '.ascii "a"',
      '',
    ].join('\n'),
    pairs: ['[rbx+(8)]', '(8)', '(%rax)', '"a"'],
  },
  {
    name: 'parentheses',
    grammars: ['asm_x86_nasm'],
    source: 'mov eax, (1 + 2)\n',
    pairs: ['(1 + 2)'],
  },
];

function offset(source: string, point: Point): number {
  const lines = source.split('\n');
  return lines.slice(0, point.row).reduce((sum, line) => sum + line.length + 1, 0) + point.column;
}

test('bracket pairs match each opener with its closer', () => {
  const failures: string[] = [];
  for (const language of manifest.languages) {
    for (const testCase of CASES.filter((entry) => entry.grammars.includes(language.grammar))) {
      const pairs = queryMatchesFor(language, 'brackets', testCase.source, 'brackets')
        .map((captures) => {
          const open = captures.find(({ name }) => name === 'open');
          const close = captures.find(({ name }) => name === 'close');
          return open === undefined || close === undefined
            ? undefined
            : [offset(testCase.source, open.start), offset(testCase.source, close.end)];
        })
        .filter((pair): pair is number[] => pair !== undefined)
        .sort(([left], [right]) => left - right)
        .map(([start, end]) => testCase.source.slice(start, end));
      if (JSON.stringify(pairs) !== JSON.stringify(testCase.pairs)) {
        failures.push(`${language.grammar}: ${testCase.name}\n  got ${JSON.stringify(pairs)}`);
      }
    }
  }
  assert.deepStrictEqual(failures, []);
});
