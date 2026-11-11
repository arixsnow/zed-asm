// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';

import { manifest } from '../../scripts/lib/manifest.ts';
import { parseFiles, treeText } from '../lib/parse.ts';

const CLANG_ONLY = ['ARM_APPLE'];

const BOTH = ['1', '1u', '1UL', '1ull', '1l', '1LL', '0x10ull', '0b1L', '017u'];
const GAS_ONLY = ['1lu', '1LLU', '0x1fLu'];
const NEITHER = ['1uu', '1lll', '1ulu', '1lul', '0xu', '0bl'];

function integerTrees(grammar: string, literals: string[]): boolean[] {
    const trees = treeText(
        parseFiles(grammar, 'numbers', literals.map((literal) => `.quad ${literal}\n`)).output,
    )
        .split(/^(?=\(source_file )/m).filter((tree) => tree.startsWith('(source_file '));
    assert.deepStrictEqual(trees.length, literals.length, `${grammar}: one tree per literal`);
    return trees.map((tree) =>
        tree.replace(/ \[\d+, \d+\] - \[\d+, \d+\]/g, '').replace(/\s+/g, ' ').trim() ===
            '(source_file (directive name: (directive_name) argument: (integer)))'
    );
}

test('a GNU integer takes the suffixes its assemblers ignore: U, L, LL, and LU in GNU as', () => {
    const failures: string[] = [];
    for (const { grammar, syntax, dialect } of manifest.languages) {
        if (syntax !== 'gas') {
            continue;
        }
        const gas = !CLANG_ONLY.includes(dialect);
        const cases: [string, boolean][] = [
            ...BOTH.map((literal): [string, boolean] => [literal, true]),
            ...GAS_ONLY.map((literal): [string, boolean] => [literal, gas]),
            ...NEITHER.map((literal): [string, boolean] => [literal, false]),
        ];
        const integers = integerTrees(grammar, cases.map(([literal]) => literal));
        for (const [index, [literal, expected]] of cases.entries()) {
            if (integers[index] !== expected) {
                failures.push(
                    `${grammar}: .quad ${literal} ${expected ? 'is not' : 'is'} one integer`,
                );
            }
        }
    }
    assert.deepStrictEqual(failures, []);
});
