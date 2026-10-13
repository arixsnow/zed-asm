// SPDX-License-Identifier: MIT

import { assertEquals } from '@std/assert';

import { parseFiles, treeText } from '../lib/parse.ts';

const X86_GAS = ['asm_auto', 'asm_x86_gas'];

function numbered(prefix: string, first: number, last: number, suffixes = ['']): string[] {
  const names: string[] = [];
  for (let number = first; number <= last; number++) {
    names.push(...suffixes.map((suffix) => `${prefix}${number}${suffix}`));
  }
  return names;
}

const REGISTERS = [
  ...['rax', 'rbx', 'rcx', 'rdx', 'rsi', 'rdi', 'rbp', 'rsp'],
  ...['eax', 'ebx', 'ecx', 'edx', 'esi', 'edi', 'ebp', 'esp'],
  ...['ax', 'bx', 'cx', 'dx', 'si', 'di', 'bp', 'sp'],
  ...['al', 'bl', 'cl', 'dl', 'ah', 'bh', 'ch', 'dh', 'sil', 'dil', 'bpl', 'spl'],
  ...numbered('r', 8, 31, ['', 'd', 'w', 'b']),
  ...['cs', 'ds', 'es', 'fs', 'gs', 'ss'],
  ...numbered('cr', 0, 15),
  ...numbered('dr', 0, 15),
  ...numbered('db', 0, 15),
  ...numbered('tr', 0, 7),
  'st',
  ...numbered('mm', 0, 7),
  ...numbered('xmm', 0, 31),
  ...numbered('ymm', 0, 31),
  ...numbered('zmm', 0, 31),
  ...numbered('k', 0, 7),
  ...numbered('tmm', 0, 7),
  ...['rip', 'eip', 'ip', 'riz', 'eiz'],
];

const NOT_REGISTERS = [
  'r8l',
  'r7',
  'r32',
  'r08',
  'cr16',
  'dr16',
  'db16',
  'tr8',
  'st0',
  'mm8',
  'xmm32',
  'k8',
  'tmm8',
  'bnd0',
  'rflags',
  'r8x',
];

function cases(name: string): string[] {
  return [name, name.toUpperCase(), name[0].toUpperCase() + name.slice(1)];
}

function operandKinds(grammar: string, lines: string[], prefix: string): (string | undefined)[] {
  const trees = treeText(
    parseFiles(grammar, 'registers', lines.map((line) => prefix + line)).output,
  )
    .split(/^(?=\(source_file )/m).filter((tree) => tree.startsWith('(source_file '));
  assertEquals(trees.length, lines.length, `${grammar}: one tree per name`);
  return trees.map((tree) =>
    /\(instruction\s+mnemonic: \(mnemonic\)\s+operand: \((\w+)\)\)\)$/.exec(
      tree.replace(/ \[\d+, \d+\] - \[\d+, \d+\]/g, '').trim(),
    )?.[1]
  );
}

Deno.test('every measured x86 register name reads as a register with % and in noprefix mode, and nothing else does', () => {
  const failures: string[] = [];
  const names = [...REGISTERS, ...NOT_REGISTERS].flatMap(cases);
  const expected = names.map((name) => REGISTERS.includes(name.toLowerCase()));
  for (const grammar of X86_GAS) {
    const prefixed = operandKinds(grammar, names.map((name) => `push %${name}\n`), '');
    const bare = operandKinds(
      grammar,
      names.map((name) => `push ${name}\n`),
      '.intel_syntax noprefix\n',
    );
    for (const [index, name] of names.entries()) {
      if ((prefixed[index] === 'register') !== expected[index]) {
        failures.push(`${grammar}: %${name} reads as ${prefixed[index] ?? 'an error'}`);
      }
      if ((bare[index] === 'register') !== expected[index]) {
        failures.push(`${grammar}: bare ${name} reads as ${bare[index] ?? 'an error'}`);
      }
    }
  }
  assertEquals(failures, []);
});
