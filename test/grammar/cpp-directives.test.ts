// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';

import { commonSources, tableEntries } from '../../scripts/lib/tables.ts';
import { flatTrees } from '../lib/parse.ts';

const GNU = ['asm_auto', 'asm_arm', 'asm_arm_apple', 'asm_x86_gas'];
const DIRECTIVE = 'directive: (preproc_directive)';
const COMMENT = '(source_file (line_comment))';

const FORMS = new Map<string, { rest: string; tree: string }>([
    [
        'PREPROC_DEFINE',
        {
            rest: 'N 1',
            tree: `(preproc_define ${DIRECTIVE} name: (identifier) value: (preproc_argument))`,
        },
    ],
    [
        'PREPROC_CONDITION',
        { rest: 'N > 1', tree: `(preproc_line ${DIRECTIVE} condition: (preproc_condition))` },
    ],
    [
        'PREPROC_INCLUDE',
        { rest: '<a//b.h>', tree: `(preproc_line ${DIRECTIVE} argument: (preproc_argument))` },
    ],
    [
        'PREPROC_DIRECTIVE',
        { rest: 'N', tree: `(preproc_line ${DIRECTIVE} argument: (preproc_argument))` },
    ],
]);

const NOT_DIRECTIVES = [
    '__include_macros',
    '__preprocessed_import',
    '__preprocessed_module',
    'defined',
    'module',
    'not_keyword',
];

function form(role: string): { rest: string; tree: string } {
    const found = FORMS.get(role);
    if (found === undefined) {
        throw new Error(`no form for the role ${role}`);
    }
    return found;
}

test('every generated C preprocessor directive reads in its form, in the case it is written', () => {
    const failures: string[] = [];
    const sources = commonSources();
    const entries = tableEntries(sources, 'ASM_GNU_CPP_DIRECTIVES');
    const cases = [
        ...entries.flatMap(([name, role]) => {
            const { rest, tree } = form(role);
            return [
                { source: `#${name} ${rest}`, expected: `(source_file ${tree})` },
                { source: `  #  ${name} ${rest}`, expected: `(source_file ${tree})` },
                { source: `#${name.toUpperCase()} ${rest}`, expected: COMMENT },
            ];
        }),
        ...NOT_DIRECTIVES.map((name) => ({ source: `#${name} N`, expected: COMMENT })),
    ];
    for (const grammar of GNU) {
        const trees = flatTrees(
            grammar,
            'cpp-directives',
            cases.map(({ source }) => `${source}\n`),
        );
        for (const [index, { source, expected }] of cases.entries()) {
            if (trees[index] !== expected) {
                failures.push(`${grammar}: ${JSON.stringify(source)} reads ${trees[index]}`);
            }
        }
    }
    assert.deepStrictEqual(failures, []);
});
