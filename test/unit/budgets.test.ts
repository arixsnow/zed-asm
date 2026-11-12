// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';

import {
    BUDGETS,
    change,
    type GrammarBudget,
    readBudgets,
    type Shape,
    shape,
} from '../../scripts/budgets.ts';
import { manifest } from '../../scripts/lib/manifest.ts';
import { cyclesFromCallgrind } from '../../scripts/lib/measure.ts';
import { assertThrowsIncluding } from '../lib/assert.ts';

test('the budget file declares the states, parser size and inputs of every grammar', () => {
    const budgets = readBudgets();
    assert.ok(budgets !== undefined, `${BUDGETS} is missing; run bun run budgets`);
    assert.deepStrictEqual(Object.keys(budgets), manifest.languages.map(({ grammar }) => grammar));
    for (const language of manifest.languages) {
        const budget: GrammarBudget = budgets[language.grammar];
        const { states, parserBytes, inputs } = budget;
        const declared: Shape = {
            states,
            parserBytes,
            inputs: Object.fromEntries(
                Object.entries(inputs).map(([name, { sha256 }]) => [name, { sha256 }]),
            ),
        };
        assert.deepStrictEqual(
            declared,
            shape(language),
            `${language.grammar}: run bun run budgets`,
        );
    }
});

test('a measured change passes within 1 point plus a tenth of the declared change', () => {
    const cases: [number, number, number, number, boolean][] = [
        [1000, 1000, 2000, 2000, true],
        [1000, 1000, 2000, 2019, true],
        [1000, 1000, 2000, 2021, false],
        [1000, 1000, 2000, 1979, false],
        [1000, 1200, 2000, 2459, true],
        [1000, 1200, 2000, 2461, false],
        [1000, 1200, 2000, 2341, true],
        [1000, 1200, 2000, 2339, false],
        [1000, 900, 2000, 1761, true],
        [1000, 900, 2000, 1759, false],
    ];
    for (const [parentDeclared, headDeclared, parentMeasured, headMeasured, passed] of cases) {
        assert.equal(
            change(parentDeclared, headDeclared, parentMeasured, headMeasured).passed,
            passed,
            `${parentDeclared} -> ${headDeclared} declared, ${parentMeasured} -> ${headMeasured} measured`,
        );
    }
});

test('estimated cycles count L1 hits once, LL hits five times and RAM accesses 35 times', () => {
    const output = [
        'version: 1',
        'events: Ir Dr Dw I1mr D1mr D1mw ILmr DLmr DLmw',
        'summary: 1000 300 200 50 40 10 5 3',
        'totals: 1000 300 200 50 40 10 5 3',
        '',
    ].join('\n');
    const accesses = 1000 + 300 + 200;
    const l1Misses = 50 + 40 + 10;
    const llMisses = 5 + 3 + 0;
    assert.equal(
        cyclesFromCallgrind(output),
        accesses - l1Misses + 5 * (l1Misses - llMisses) + 35 * llMisses,
    );
    assertThrowsIncluding(() => cyclesFromCallgrind('events: Ir\n'), 'no events or summary line');
    assertThrowsIncluding(
        () => cyclesFromCallgrind('events: Ir Dr Dw\nsummary: 1 2 3\n'),
        'has no I1mr event',
    );
});
