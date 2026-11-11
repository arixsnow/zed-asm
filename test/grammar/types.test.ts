// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';

import { commonSources, tableEntries } from '../../scripts/lib/tables.ts';
import { flatTrees } from '../lib/parse.ts';

const GNU = ['asm_auto', 'asm_arm', 'asm_arm_apple', 'asm_x86_gas'];
const SECTION = 'argument: (identifier) argument: (identifier) argument: (identifier)))';

function spellings(name: string, flags: string): [string, boolean][] {
    const first = name.search(/[a-z]/);
    const mixed: [string, string][] = first === -1 || !/[a-z]/.test(name.slice(first + 1)) ? [] : [[
        `${name.slice(0, first)}${name[first].toUpperCase()}${name.slice(first + 1)}`,
        'MIXED',
    ]];
    return ([[name, 'LOWER'], [name.toUpperCase(), 'UPPER'], ...mixed] as [string, string][]).map((
        [spelling, form],
    ) => [spelling, !flags.includes(`CASE_NO_${form}`)]);
}

test('every generated Mach-O section type the identifier cannot read is one word, in the cases its assemblers take', () => {
    const failures: string[] = [];
    const sources = commonSources();
    const cases = tableEntries(sources, 'ASM_GNU_MACHO_SECTION_TYPES').flatMap(([name, flags]) =>
        spellings(name, flags).map(([spelling, expected]) => ({
            source: `.section __TEXT,__literal,${spelling}`,
            expected,
        }))
    );
    for (const grammar of GNU) {
        const trees = flatTrees(grammar, 'types', cases.map(({ source }) => `${source}\n`));
        for (const [index, { source, expected }] of cases.entries()) {
            const read = trees[index].endsWith(SECTION) &&
                !/\((?:ERROR|MISSING)/.test(trees[index]);
            if (read !== expected) {
                failures.push(
                    `${grammar}: ${JSON.stringify(source)} ${expected ? 'is not' : 'is'} one word`,
                );
            }
        }
    }
    assert.deepStrictEqual(failures, []);
});
