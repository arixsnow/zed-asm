// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';

import { commonSources, tableEntries } from '../../scripts/lib/tables.ts';
import { flatTrees } from '../lib/parse.ts';

const X86_GAS = ['asm_auto', 'asm_x86_gas'];
const ERROR = /\((?:ERROR|MISSING)/;

const SOURCES = commonSources();

function mixed(name: string): string {
  const first = name.search(/[a-z]/);
  return `${name.slice(0, first)}${name[first].toUpperCase()}${name.slice(first + 1)}`;
}

test('every generated x86 encoding suffix leaves an instruction, in any case', () => {
  const failures: string[] = [];
  const sources = tableEntries(SOURCES, 'ASM_X86_GAS_ENCODING_SUFFIXES').flatMap(([suffix]) => [
    `mov${suffix} %eax, %ebx\n`,
    `MOV${suffix.toUpperCase()} %eax, %ebx\n`,
  ]);
  for (const grammar of X86_GAS) {
    for (const [index, tree] of flatTrees(grammar, 'generated-words', sources).entries()) {
      if (
        tree !==
          '(source_file (instruction mnemonic: (mnemonic) operand: (register) operand: (register)))'
      ) {
        failures.push(`${grammar}: ${JSON.stringify(sources[index])} reads ${tree}`);
      }
    }
  }
  assert.deepStrictEqual(failures, []);
});

test('every generated x86 syntax word reads after both syntax directives, as written', () => {
  const failures: string[] = [];
  const cases = tableEntries(SOURCES, 'ASM_X86_GAS_SYNTAX_WORDS').flatMap(([word, , flags]) =>
    ['.intel_syntax', '.att_syntax'].flatMap((directive) => [
      { source: `${directive} ${word}\n`, reads: !flags.includes('CASE_NO_LOWER') },
      { source: `${directive} ${word.toUpperCase()}\n`, reads: !flags.includes('CASE_NO_UPPER') },
      { source: `${directive} ${mixed(word)}\n`, reads: !flags.includes('CASE_NO_MIXED') },
    ])
  );
  for (const grammar of X86_GAS) {
    const trees = flatTrees(grammar, 'generated-words', cases.map(({ source }) => source));
    for (const [index, { source, reads }] of cases.entries()) {
      if (ERROR.test(trees[index]) === reads) {
        failures.push(`${grammar}: ${JSON.stringify(source)} reads ${trees[index]}`);
      }
    }
  }
  assert.deepStrictEqual(failures, []);
});

test('every generated NASM structure word opens or closes its block, in any case', () => {
  const failures: string[] = [];
  const directives = tableEntries(SOURCES, 'ASM_X86_NASM_DIRECTIVES');
  const wordsOf = (role: string) =>
    directives.filter(([, entry]) => entry === role).flatMap(([word]) => [
      word,
      word.toUpperCase(),
      mixed(word),
    ]);
  const cases = [
    ...wordsOf('STRUC_OPEN').flatMap((open) =>
      wordsOf('STRUC_CLOSE').map((close) => ({
        source: `${open} a\n${close}\n`,
        expected: '(source_file (structure name: (identifier) body: (structure_body)))',
      }))
    ),
    ...wordsOf('ISTRUC_OPEN').flatMap((open) =>
      wordsOf('ISTRUC_CLOSE').map((close) => ({
        source: `${open} a\n${close}\n`,
        expected: '(source_file (structure_instance name: (identifier) body: (body)))',
      }))
    ),
    ...wordsOf('AT_WORD').map((word) => ({
      source: `${word} a\n`,
      expected: '(source_file (field_initializer field: (identifier)))',
    })),
  ];
  assert.ok(cases.length > 0);
  const trees = flatTrees('asm_x86_nasm', 'generated-words', cases.map(({ source }) => source));
  for (const [index, { source, expected }] of cases.entries()) {
    if (trees[index] !== expected) {
      failures.push(`${JSON.stringify(source)} reads ${trees[index]}`);
    }
  }
  assert.deepStrictEqual(failures, []);
});

test('every generated NASM list word reads glued to a count and before a repeat count, in any case', () => {
  const failures: string[] = [];
  const words = tableEntries(SOURCES, 'ASM_X86_NASM_LIST_WORDS').flatMap(([word]) => [
    word,
    word.toUpperCase(),
    mixed(word),
  ]);
  const cases = words.flatMap((word) => [
    {
      source: `%macro m 1${word}\n%endmacro\n`,
      expected:
        '(source_file (macro_definition name: (identifier) parameters: (parameter_count) body: (body)))',
    },
    {
      source: `%rep ${word} 2\n%endrep\n`,
      expected: '(source_file (repeat_block count: (integer) body: (body)))',
    },
  ]);
  const trees = flatTrees('asm_x86_nasm', 'generated-words', cases.map(({ source }) => source));
  for (const [index, { source, expected }] of cases.entries()) {
    if (trees[index] !== expected) {
      failures.push(`${JSON.stringify(source)} reads ${trees[index]}`);
    }
  }
  assert.deepStrictEqual(failures, []);
});
