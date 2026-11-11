// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';

import { commonSources, type KeywordSources, tableEntries } from '../../scripts/lib/tables.ts';
import { flatTrees } from '../lib/parse.ts';

const DIALECTS: {
    dialect: string;
    grammars: string[];
    decorated: (text: string) => string;
    registers: (name: string) => string[];
}[] = [
    {
        dialect: 'X86_GAS',
        grammars: ['asm_auto', 'asm_x86_gas'],
        decorated: (text) => `vaddps %zmm1, %zmm2, %zmm3{${text}}`,
        registers: (name) => [`%${name}`, name, `%${name.toUpperCase()}`],
    },
    {
        dialect: 'X86_NASM',
        grammars: ['asm_x86_nasm'],
        decorated: (text) => `vaddps zmm3{${text}}, zmm2, zmm1`,
        registers: (name) => [name, name.toUpperCase()],
    },
];

function decoratorCases(sources: KeywordSources, dialect: string): [string, boolean][] {
    const entries = tableEntries(sources, `ASM_${dialect}_DECORATORS`);
    const dashed = new Set(
        entries.filter(([, flags]) => flags.includes('DECORATOR_DASHED')).map(([name]) => name),
    );
    return entries.flatMap(([name, flags]): [string, boolean][] => {
        const upper = name.toUpperCase();
        const mixed = `${upper[0]}${name.slice(1)}`;
        const forms = (tail: string): [string, boolean][] => [
            [`${name}${tail}`, !flags.includes('CASE_NO_LOWER')],
            [`${upper}${tail}`, upper === name || !flags.includes('CASE_NO_UPPER')],
            ...(/[a-z].*[a-z]/.test(name) && /^[a-z]/.test(name)
                ? [[`${mixed}${tail}`, !flags.includes('CASE_NO_MIXED')] as [string, boolean]]
                : []),
        ];
        if (flags.includes('DECORATOR_FLAGS')) {
            return [...forms('='), [name, false]];
        }
        if (flags.includes('DECORATOR_DASHED')) {
            return [...forms('-x'), [`${name} - x`, true], [name, false]];
        }
        const cases = forms('');
        const dash = name.indexOf('-');
        if (dash !== -1) {
            cases.push([
                `${name.slice(0, dash)} - ${name.slice(dash + 1)}`,
                dashed.has(name.slice(0, dash)),
            ]);
        }
        return cases;
    });
}

function registerCases(
    sources: KeywordSources,
    dialect: string,
    forms: (name: string) => string[],
): [string, boolean][] {
    return tableEntries(sources, `ASM_${dialect}_REGISTERS`).flatMap(([name, , flags]) =>
        forms(name).map((text): [string, boolean] => [text, flags.includes('REGISTER_MASK')])
    );
}

test('every generated decorator and mask register reads in braces, in the cases its assemblers take', () => {
    const failures: string[] = [];
    const sources = commonSources();
    for (const { dialect, grammars, decorated, registers } of DIALECTS) {
        const cases = [
            ...decoratorCases(sources, dialect),
            ...registerCases(sources, dialect, registers),
        ];
        for (const grammar of grammars) {
            const trees = flatTrees(
                grammar,
                'decorators',
                cases.map(([text]) => `${decorated(text)}\n`),
            );
            for (const [index, [text, expected]] of cases.entries()) {
                const read = trees[index].includes('decorator: (decorator))') &&
                    !/\((?:ERROR|MISSING)/.test(trees[index]);
                if (read !== expected) {
                    failures.push(`${grammar}: {${text}} ${expected ? 'is no' : 'is a'} decorator`);
                }
            }
        }
    }
    assert.deepStrictEqual(failures, []);
});
