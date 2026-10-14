// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';

import { manifest } from '../../scripts/lib/manifest.ts';
import { parseFiles, treeText } from '../lib/parse.ts';

const GNU = ['asm_auto', 'asm_arm', 'asm_arm_apple', 'asm_x86_gas'];
const ALL = manifest.languages.map((language) => language.grammar);
const X86_GAS = ['asm_auto', 'asm_x86_gas'];
const ERROR_NODE = /\((?:ERROR|MISSING[^[]*) \[(\d+), \d+\] - \[(\d+), \d+\]/g;

const REJECTED: [string, number[], string[]][] = [
  ['first:\n    nop main:', [1], ALL],
  ['1$:\n    b 1$', [0, 1], ['asm_arm_apple', 'asm_x86_gas']],
  ['1:\n    b 1B', [1], GNU],
  ['1b: nop', [0], GNU],
  ['    .loc 1, 2, 3', [0], GNU],
  ['    .equ A 1', [0], GNU],
  ['    .float 1.5f', [0], GNU],
  ['.macro m a b\n.endm', [0], ['asm_arm_apple']],
  ['.irp r a b\n.endr', [0], ['asm_arm_apple']],
  ['.if 1\n.else nop\n.endif', [1], GNU],
  ['.if 1\n.endif nop', [1], GNU],
  ['.if 1\n.else\n.else\n.endif', [2], GNU],
  ['.if 1\n.else\n.elseif 2\n.endif', [2], GNU],
  ['#define 1 2', [0], GNU],
  ['#define F(1) x', [0], GNU],
  ['    .save {r4, lr}', [0], ['asm_arm_apple']],
  ['.intel_syntax NOPREFIX\ncall rax', [0], X86_GAS],
  ['.intel_syntax , noprefix\ncall rax', [0], X86_GAS],
  ['.att_syntax Prefix\ncall rax', [0], X86_GAS],
  ['vaddps %zmm1, %zmm2, %zmm3{%k1}{Z}', [0], X86_GAS],
  ['vaddps (%rax){1TO16}, %zmm2, %zmm3', [0], X86_GAS],
  ['vaddps {RN-SAE}, %zmm1, %zmm2, %zmm3', [0], ['asm_x86_gas']],
  ['vaddps (%rax){1to3}, %zmm2, %zmm3', [0], X86_GAS],
  ['lock data16 {disp32} addl $1, 8(%rax)', [0], X86_GAS],
  ['{disp32} lock {load} addl $1, 8(%rax)', [0], X86_GAS],
  ['ccmpb {dfv=of,c} %r9b, %r8b', [0], X86_GAS],
  ['ccmpb {dfv=sf,z} %r9b, %r8b', [0], X86_GAS],
];

function errorRows(tree: string): number[] {
  const rows = new Set<number>();
  for (const [, start, end] of tree.matchAll(ERROR_NODE)) {
    for (let row = Number(start); row <= Number(end); row++) {
      rows.add(row);
    }
  }
  return [...rows].sort((a, b) => a - b);
}

test('syntax that every assembler of a language rejects parses with an error on its own lines only', () => {
  const failures: string[] = [];
  for (const grammar of ALL) {
    const rejected = REJECTED.filter(([, , grammars]) => grammars.includes(grammar));
    const sources = rejected.map(([snippet]) => `${snippet}\n`);
    const { output } = parseFiles(grammar, 'rejected', sources);
    const trees = treeText(output)
      .split(/^(?=\(source_file )/m).filter((tree) => tree.startsWith('(source_file '));
    const statuses = output.split('\n').filter((line) => line.includes('\tParse:'));
    assert.deepStrictEqual(trees.length, rejected.length, `${grammar}: one tree per snippet`);
    assert.deepStrictEqual(statuses.length, rejected.length, `${grammar}: one status per snippet`);
    for (const [index, [snippet, rows]] of rejected.entries()) {
      const found = errorRows(`${trees[index]}\n${statuses[index]}`);
      if (found.join() !== rows.join()) {
        failures.push(
          `${grammar}: ${JSON.stringify(snippet)} has errors on rows [${found}], not [${rows}]`,
        );
      }
    }
  }
  assert.deepStrictEqual(failures, []);
});
