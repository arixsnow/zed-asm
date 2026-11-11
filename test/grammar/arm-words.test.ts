// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';

import { commonSources, type KeywordSources, tableEntries } from '../../scripts/lib/tables.ts';
import { flatTrees } from '../lib/parse.ts';

const ARCHS: Record<string, string[]> = {
  asm_auto: ['AARCH64_GNU', 'AARCH64_APPLE', 'AARCH32'],
  asm_arm: ['AARCH64_GNU', 'AARCH32'],
  asm_arm_apple: ['AARCH64_APPLE'],
};

interface Word {
  forms: Set<string>;
  role: string;
}

interface Case {
  source: string;
  fragment: string;
  expected: boolean;
}

const CONDITION = 'operand: (condition)))';
const SHIFT = '(shift operator: (shift_operator) amount: (immediate value: (integer))))';
const EXTEND = '(shift operator: (shift_operator)))';
const QUALIFIER = 'qualifier: (identifier))';

function caseForms(flags: string): Set<string> {
  return new Set(
    ['lower', 'upper', 'mixed'].filter((form) => !flags.includes(`CASE_NO_${form.toUpperCase()}`)),
  );
}

function words(sources: KeywordSources, grammar: string, table: string): Map<string, Word> {
  const merged = new Map<string, Word>();
  for (const arch of ARCHS[grammar]) {
    const name = `ASM_${arch}_${table}`;
    if (!sources.tables.has(name)) {
      continue;
    }
    for (const entry of tableEntries(sources, name)) {
      const [word, role, flags] = entry.length === 3 ? entry : [entry[0], '', entry[1] ?? ''];
      const known = merged.get(word);
      merged.set(word, {
        forms: new Set([...(known?.forms ?? []), ...caseForms(flags)]),
        role: known?.role === 'EXTEND_WORD' || role === 'EXTEND_WORD' ? 'EXTEND_WORD' : role,
      });
    }
  }
  return merged;
}

function spelled(word: string, form: string): string | undefined {
  if (form === 'lower') {
    return word;
  }
  if (form === 'upper') {
    return word.toUpperCase();
  }
  const first = word.search(/[a-z]/);
  return first === -1 || !/[a-z]/.test(word.slice(first + 1))
    ? undefined
    : `${word.slice(0, first)}${word[first].toUpperCase()}${word.slice(first + 1)}`;
}

function formCases(
  table: Map<string, Word>,
  sentence: (word: string, role: string) => [string, string],
): Case[] {
  return [...table].flatMap(([word, { forms, role }]) =>
    ['lower', 'upper', 'mixed'].flatMap((form) => {
      const text = spelled(word, form);
      if (text === undefined) {
        return [];
      }
      const [source, fragment] = sentence(text, role);
      return [{ source, fragment, expected: forms.has(form) }];
    })
  );
}

function grammarCases(sources: KeywordSources, grammar: string): Case[] {
  const conditions = words(sources, grammar, 'CONDITIONS');
  const shifts = words(sources, grammar, 'SHIFTS');
  return [
    ...formCases(conditions, (word) => [`csel x0, x1, x2, ${word}`, CONDITION]),
    ...formCases(
      shifts,
      (word, role) =>
        role === 'EXTEND_WORD'
          ? [`add x0, x1, w2, ${word}`, EXTEND]
          : [`add x0, x1, x2, ${word} #2`, SHIFT],
    ),
    ...[...shifts].filter(([, { role }]) => role === 'SHIFT_WORD').map(([word]) => ({
      source: `mov x0, ${word}`,
      fragment: '(register) operand: (identifier)))',
      expected: true,
    })),
    ...formCases(
      words(sources, grammar, 'PREDICATE_QUALIFIERS'),
      (word) => [`ld1d z0.d, p0/${word}, [x0]`, QUALIFIER],
    ),
  ];
}

test('every generated condition, shift word and predicate qualifier reads in its slot, in the cases its assemblers take', () => {
  const failures: string[] = [];
  const sources = commonSources();
  for (const grammar of Object.keys(ARCHS)) {
    const cases = grammarCases(sources, grammar);
    const trees = flatTrees(grammar, 'arm-words', cases.map(({ source }) => `${source}\n`));
    for (const [index, { source, fragment, expected }] of cases.entries()) {
      const read = trees[index].includes(fragment) && !/\((?:ERROR|MISSING)/.test(trees[index]);
      if (read !== expected) {
        failures.push(
          `${grammar}: ${JSON.stringify(source)} ${expected ? 'lacks' : 'has'} ${fragment}`,
        );
      }
    }
  }
  assert.deepStrictEqual(failures, []);
});
