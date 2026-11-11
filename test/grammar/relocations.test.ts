// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';

import { commonSources, tableEntries } from '../../scripts/lib/tables.ts';
import { flatTrees } from '../lib/parse.ts';

const COLON = 'relocation specifier: (identifier) value: (identifier))';
const SUFFIX = '(relocation value: (identifier) specifier: (identifier))';

const TABLES: { table: string; form: (name: string) => string; fragment: string }[] = [
  {
    table: 'ASM_AARCH64_GNU_RELOCATIONS',
    form: (name) => `add x0, x0, :${name}:sym`,
    fragment: COLON,
  },
  { table: 'ASM_AARCH32_RELOCATIONS', form: (name) => `movw r0, #:${name}:sym`, fragment: COLON },
  {
    table: 'ASM_AARCH32_SUFFIX_RELOCATIONS',
    form: (name) => `.word sym(${name})`,
    fragment: SUFFIX,
  },
];

function mixed(name: string): string | undefined {
  const first = name.search(/[a-z]/);
  return first === -1 || !/[a-z]/.test(name.slice(first + 1))
    ? undefined
    : `${name.slice(0, first)}${name[first].toUpperCase()}${name.slice(first + 1)}`;
}

test('every generated relocation name reads in its form, in the cases its assemblers take', () => {
  const failures: string[] = [];
  const sources = commonSources();
  const cases = TABLES.flatMap(({ table, form, fragment }) =>
    tableEntries(sources, table).flatMap(([name, flags]) => {
      const mixedName = mixed(name);
      return [
        { source: form(name), fragment, expected: !flags.includes('CASE_NO_LOWER') },
        {
          source: form(name.toUpperCase()),
          fragment,
          expected: !flags.includes('CASE_NO_UPPER'),
        },
        ...(mixedName === undefined
          ? []
          : [{ source: form(mixedName), fragment, expected: !flags.includes('CASE_NO_MIXED') }]),
      ];
    })
  );
  for (const grammar of ['asm_auto', 'asm_arm']) {
    const trees = flatTrees(grammar, 'relocations', cases.map(({ source }) => `${source}\n`));
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
