// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';

import { commonSources, type KeywordSources, tableEntries } from '../../scripts/lib/tables.ts';
import { flatTrees } from '../lib/parse.ts';

interface Case {
    source: string;
    fragment: string;
    expected: boolean;
}

type Form = (word: string) => [string, string];

const TYPED = '(typed_operand type: (operand_type)';
const UNARY = '(unary_expression operator: (operator_word)';
const BINARY = '(binary_expression left: (integer) operator: (operator_word) right: (integer))';

const GAS_FORMS: Record<string, Form> = {
    INTEL_TYPE_WORD: (word) => [`mov eax, ${word} ptr [rbx]`, TYPED],
    INTEL_PTR_WORD: (word) => [`mov eax, dword ${word} [rbx]`, TYPED],
    INTEL_UNARY_WORD: (word) => [`mov eax, ${word} x`, `${UNARY} argument: (identifier))`],
    INTEL_MULTIPLICATIVE_WORD: (word) => [`mov eax, 1 ${word} 2`, BINARY],
    INTEL_BITWISE_WORD: (word) => [`mov eax, 1 ${word} 2`, BINARY],
    INTEL_COMPARISON_WORD: (word) => [`mov eax, 1 ${word} 2`, BINARY],
};

const NASM_FORMS: Record<string, Form> = {
    INTEL_TYPE_WORD: (word) => [`mov eax, ${word} [rbx]`, TYPED],
    ADDRESS_WORD: (
        word,
    ) => [`mov eax, [${word} x]`, '(memory_operand modifier: (address_modifier)'],
    ABSOLUTE_WORD: (word) => [`jmp ${word} x`, TYPED],
    STRICT_WORD: (word) => [`push ${word} dword 1`, TYPED],
    TO_WORD: (word) => [`fadd ${word} st1`, TYPED],
    WRT_WORD: (word) => [`call x ${word} ..plt`, '(relocation symbol: (identifier) specifier:'],
    DUP_WORD: (word) => [
        `db 2 ${word} (0)`,
        '(binary_expression left: (integer) operator: (operator_word)',
    ],
    FLOAT_SPECIAL: (word) => [`dq ${word}`, 'argument: (float))'],
    FLOAT_OPERATOR_WORD: (word) => [
        `dd ${word}(1.5)`,
        `${UNARY} argument: (parenthesized_expression (float)))`,
    ],
    INTEL_UNARY_WORD: (word) => [`dd ${word} x`, `${UNARY} argument: (identifier))`],
    MEMORY_OPEN_WORD: (word) => [`mov eax, ${word} x`, '(memory_operand address: (identifier))'],
    REGISTER: (word) => [`mov eax, [${word}:x]`, '(segment_override segment: (register)'],
};

const LABEL = '(label_block label: (label name: (identifier))';

function mixed(word: string): string | undefined {
    const letters = [...word].filter((character) => /[a-z]/.test(character));
    if (letters.length < 2) {
        return undefined;
    }
    const first = word.search(/[a-z]/);
    return `${word.slice(0, first)}${word[first].toUpperCase()}${word.slice(first + 1)}`;
}

function formCases(form: Form, word: string, flags: string, header: string): Case[] {
    const [source, fragment] = form(word);
    const [upper] = form(word.toUpperCase());
    const cases = [
        { source: `${header}${source}`, fragment, expected: !flags.includes('CASE_NO_LOWER') },
        { source: `${header}${upper}`, fragment, expected: !flags.includes('CASE_NO_UPPER') },
    ];
    const mixedWord = mixed(word);
    if (mixedWord !== undefined) {
        cases.push({
            source: `${header}${form(mixedWord)[0]}`,
            fragment,
            expected: !flags.includes('CASE_NO_MIXED'),
        });
    }
    return cases;
}

function gasCases(sources: KeywordSources, failures: string[]): Case[] {
    const header = '.intel_syntax noprefix\n';
    return tableEntries(sources, 'ASM_X86_GAS_OPERAND_WORDS').flatMap(([word, role, flags]) => {
        const form = GAS_FORMS[role];
        if (form === undefined) {
            failures.push(`GAS: no test form for the role ${role} of "${word}"`);
            return [];
        }
        const cases = formCases(form, word, flags, header);
        if (flags.includes('WORD_PTR_FOLLOWS')) {
            cases.push({
                source: `${header}mov eax, ${word}`,
                fragment: '(register) operand: (identifier)))',
                expected: true,
            });
        }
        return cases;
    });
}

function nasmCases(sources: KeywordSources, failures: string[]): Case[] {
    return tableEntries(sources, 'ASM_X86_NASM_OPERAND_WORDS').flatMap(([word, role, flags]) => {
        const form = NASM_FORMS[role];
        if (form === undefined) {
            failures.push(`NASM: no test form for the role ${role} of "${word}"`);
            return [];
        }
        return [
            ...formCases(form, word, flags, ''),
            { source: `${word}: nop`, fragment: LABEL, expected: !flags.includes('WORD_RESERVED') },
        ];
    });
}

function check(failures: string[], grammar: string, cases: Case[]): void {
    const trees = flatTrees(grammar, 'operand-words', cases.map(({ source }) => `${source}\n`));
    for (const [index, { source, fragment, expected }] of cases.entries()) {
        const tree = trees[index];
        const read = tree.includes(fragment) && !/\((?:ERROR|MISSING)/.test(tree);
        if (read !== expected) {
            failures.push(
                `${grammar}: ${JSON.stringify(source)} ${expected ? 'lacks' : 'has'} ${fragment}`,
            );
        }
    }
}

test('every generated operand word reads in its role, in the cases its assemblers take', () => {
    const failures: string[] = [];
    const sources = commonSources();
    const gas = gasCases(sources, failures);
    for (const grammar of ['asm_auto', 'asm_x86_gas']) {
        check(failures, grammar, gas);
    }
    check(failures, 'asm_x86_nasm', nasmCases(sources, failures));
    assert.deepStrictEqual(failures, []);
});
