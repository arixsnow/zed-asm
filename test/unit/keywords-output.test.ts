// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';

import { checkWordClashes, unlexed } from '../../scripts/keywords.ts';
import { header, type HeaderTable } from '../../scripts/lib/keywords/header.ts';
import { armRole, GENERIC_ROLE, Signatures } from '../../scripts/lib/keywords/roles.ts';
import { assertThrowsIncluding } from '../lib/assert.ts';
import { keywords } from '../lib/keyword-sources.ts';

test('Signatures keep the forms that hold a special slot, under the word before the first dot', () => {
    const signatures = new Signatures();
    signatures.add('mov', 'OO');
    signatures.add('mov', '');
    signatures.add('b.eq', 'L');
    signatures.add('b.ne', 'OL');
    signatures.add('msr', 'SO');
    signatures.add('cset', 'oc');
    assert.strictEqual(signatures.get('mov'), undefined);
    assert.deepStrictEqual([...(signatures.get('b') ?? [])], ['L', 'OL']);
    assert.deepStrictEqual([...(signatures.get('b.anything') ?? [])], ['L', 'OL']);
    const merged = new Signatures();
    merged.add('b', 'LL');
    merged.addAll(signatures);
    assert.deepStrictEqual([...(merged.get('b') ?? [])], ['LL', 'L', 'OL']);
    assert.deepStrictEqual(merged.entries().map(([name]) => name), ['b', 'msr', 'cset']);
});

test('Signatures stop on a slot that is not L, C, S or O', () => {
    assertThrowsIncluding(
        () => new Signatures().add('b', 'LX'),
        'operand signature "LX" of "b" is not made of L, C, S and O',
    );
});

test('armRole finds the role of the slots every form fills', () => {
    const role = (...forms: string[]) => armRole('x', new Set(forms));
    assert.strictEqual(armRole('x', undefined), GENERIC_ROLE);
    assert.strictEqual(role('L'), 'FIRST_LABEL_INSTRUCTION');
    assert.strictEqual(role('OL'), 'SECOND_LABEL_INSTRUCTION');
    assert.strictEqual(role('L', 'LL'), 'FIRST_TWO_LABELS_INSTRUCTION');
    assert.strictEqual(role('oL'), 'LABEL_AFTER_OPTIONAL_FIRST_INSTRUCTION');
    assert.strictEqual(role('OoL'), 'LABEL_AFTER_OPTIONAL_SECOND_INSTRUCTION');
    assert.strictEqual(role('LLLC'), 'LABELS_THEN_CONDITION_INSTRUCTION');
    assert.strictEqual(role('OC'), 'SECOND_CONDITION_INSTRUCTION');
    assert.strictEqual(role('SO'), 'FIRST_SYSTEM_INSTRUCTION');
    assert.strictEqual(role('OS', 'OOS'), 'SECOND_AND_THIRD_SYSTEM_INSTRUCTION');
    assert.strictEqual(role('OOL', 'Oo'), 'THIRD_LABEL_INSTRUCTION');
});

test('armRole stops on slots that fit no role', () => {
    for (const form of ['OOOOL', 'ooL', 'LC', 'LS', 'OOOOOOS']) {
        assertThrowsIncluding(
            () => armRole('x', new Set([form])),
            `"x" has operand signatures ${form}, which fit no role in roles.js`,
        );
    }
});

test('header writes the sources, the constants and each table in its form', () => {
    const project = { name: 'up"st\\ream', path: '/nowhere', commit: 'abc' };
    const tables: HeaderTable[] = [
        { name: 'ASM_NAMES', keywords: keywords({ b: [], a: ['IGNORED'] }) },
        { name: 'ASM_FLAGGED', keywords: keywords({ c: ['F1', 'F2'], d: [] }), flagged: true },
        {
            name: 'ASM_ROLES',
            keywords: keywords({ e: ['F1'], f: [] }),
            role: (word) => `ROLE_${word.toUpperCase()}`,
        },
    ];
    assert.strictEqual(
        header([project], [{ name: 'ASM_ONE', value: 1 }, { name: 'ASM_TWO', value: 2 }], tables),
        [
            '#ifndef ASM_KEYWORDS_H',
            '#define ASM_KEYWORDS_H',
            '',
            'enum {',
            '    ASM_ONE = 1,',
            '    ASM_TWO = 2,',
            '};',
            '',
            '#define ASM_KEYWORD_SOURCES(X) \\',
            '    X("up\\"st\\\\ream", "abc")',
            '',
            '#define ASM_NAMES(X) \\',
            '    X("a") \\',
            '    X("b")',
            '',
            '#define ASM_FLAGGED(X) \\',
            '    X("c", F1 | F2) \\',
            '    X("d", 0)',
            '',
            '#define ASM_ROLES(X) \\',
            '    X("e", ROLE_E, F1) \\',
            '    X("f", ROLE_F, 0)',
            '',
            '#endif /* ASM_KEYWORDS_H */',
            '',
        ].join('\n'),
    );
});

test('header stops on an empty table', () => {
    assertThrowsIncluding(
        () => header([], [], [{ name: 'ASM_EMPTY', keywords: keywords({}) }]),
        'table ASM_KEYWORD_SOURCES is empty',
    );
    assertThrowsIncluding(
        () =>
            header([{ name: 'up', path: '', commit: 'abc' }], [], [
                { name: 'ASM_EMPTY', keywords: keywords({}) },
            ]),
        'table ASM_EMPTY is empty',
    );
});

test('unlexed keeps the names an identifier cannot read whole, with their flags', () => {
    const names = keywords({ '4byte_literals': ['CASE_NO_UPPER'], regular: [], 'a.b': [] });
    assert.deepStrictEqual(unlexed(names, /[a-z_]+/).entries(), [
        ['4byte_literals', ['CASE_NO_UPPER']],
        ['a.b', []],
    ]);
});

function clashes(tables: HeaderTable[]): () => void {
    return () => {
        checkWordClashes(tables);
    };
}

test('checkWordClashes takes tables whose words do not clash', () => {
    checkWordClashes([]);
    checkWordClashes([
        {
            name: 'ASM_X86_GAS_OPERAND_WORDS',
            keywords: keywords({ float: ['WORD_PTR_FOLLOWS'], st: [] }),
        },
        { name: 'ASM_X86_GAS_REGISTERS', keywords: keywords({ st: [] }) },
        {
            name: 'ASM_AARCH32_SHIFTS',
            keywords: keywords({ lsl: [], uxtw: [] }),
            role: (word) => (word === 'lsl' ? 'SHIFT_WORD' : 'EXTEND_WORD'),
        },
        { name: 'ASM_AARCH32_REGISTERS', keywords: keywords({ r0: [], uxtw: [] }) },
    ]);
});

test('checkWordClashes stops on a word that needs a following word and is also a register', () => {
    assertThrowsIncluding(
        clashes([
            { name: 'ASM_X86_GAS_OPERAND_WORDS', keywords: keywords({ st: ['WORD_PTR_FOLLOWS'] }) },
            { name: 'ASM_X86_GAS_REGISTERS', keywords: keywords({ st: [] }) },
        ]),
        'the size word st, which needs a ptr word, is also a register',
    );
    for (
        const [shifts, registers] of [
            ['ASM_AARCH64_GNU_SHIFTS', 'ASM_AARCH64_GNU_REGISTERS'],
            ['ASM_AARCH64_APPLE_SHIFTS', 'ASM_AARCH32_REGISTERS'],
            ['ASM_AARCH32_SHIFTS', 'ASM_AARCH64_APPLE_REGISTERS'],
        ]
    ) {
        assertThrowsIncluding(
            clashes([
                { name: shifts, keywords: keywords({ lsl: [] }), role: () => 'SHIFT_WORD' },
                { name: registers, keywords: keywords({ lsl: [] }) },
            ]),
            'the shift word lsl, which needs an amount, is also a register',
        );
    }
});
