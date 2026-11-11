// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';

import { commonSources, tableEntries } from '../../scripts/lib/tables.ts';
import { flatTrees } from '../lib/parse.ts';

const TABLES: { table: string; grammars: string[]; intel: string }[] = [
    {
        table: 'ASM_X86_GAS_PREFIXES',
        grammars: ['asm_auto', 'asm_x86_gas'],
        intel: '.intel_syntax\n',
    },
    { table: 'ASM_X86_NASM_PREFIXES', grammars: ['asm_x86_nasm'], intel: '' },
];

function prefixed(grammar: string, lines: string[]): boolean[] {
    return flatTrees(grammar, 'prefixes', lines).map((tree) =>
        tree.endsWith('(instruction prefix: (prefix) mnemonic: (mnemonic)))')
    );
}

test('every generated prefix reads as a prefix in its own form and syntax, and only there', () => {
    const failures: string[] = [];
    const sources = commonSources();
    for (const { table, grammars, intel } of TABLES) {
        const cases: [string, boolean][] = tableEntries(sources, table).flatMap(([name, flags]) => {
            const plain = flags.includes('PREFIX_PLAIN');
            return [
                [`${name} movsb\n`, plain && (intel === '' || !flags.includes('PREFIX_INTEL'))],
                [`${intel}${name.toUpperCase()} movsb\n`, plain],
                [`{${name}} movsb\n`, flags.includes('PREFIX_BRACED')],
            ];
        });
        for (const grammar of grammars) {
            const prefixes = prefixed(grammar, cases.map(([line]) => line));
            for (const [index, [line, expected]] of cases.entries()) {
                if (prefixes[index] !== expected) {
                    failures.push(
                        `${grammar}: ${JSON.stringify(line)} ${
                            expected ? 'has no' : 'has a'
                        } prefix`,
                    );
                }
            }
        }
    }
    assert.deepStrictEqual(failures, []);
});
