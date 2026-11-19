// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { ROOT } from '../../scripts/lib/files.ts';
import { manifest } from '../../scripts/lib/manifest.ts';
import {
    type NumberOptions,
    type NumberRow,
    type NumberTables,
    numberTables,
    readForm,
} from '../../scripts/lib/numbers.ts';
import { assertThrowsIncluding } from '../lib/assert.ts';

const SCANNER = readFileSync(join(ROOT, 'tree-sitter', 'common', 'scanner.h'), 'utf8');
const lexical = createRequire(import.meta.url)('../../tree-sitter/common/lexical.js') as Record<
    'gas' | 'nasm',
    { numbers: (options: NumberOptions) => NumberRow[] }
>;
const ALPHABET = [...'0178bdefhlopqtuxyBEFLUX._+-$#'];
const RANDOM_CASES = 20000;
const RANDOM_LENGTH = 9;

function battery(): string[] {
    const cases: string[] = [];
    for (const first of ALPHABET) {
        cases.push(first);
        for (const second of ALPHABET) {
            cases.push(first + second);
            for (const third of ALPHABET) {
                cases.push(first + second + third);
            }
        }
    }
    let seed = 2463534242;
    for (let count = 0; count < RANDOM_CASES; count++) {
        let text = '';
        for (let index = 0; index < 1 + (count % RANDOM_LENGTH); index++) {
            seed = (seed * 1103515245 + 12345) % 2147483648;
            text += ALPHABET[seed % ALPHABET.length];
        }
        cases.push(text);
    }
    return cases;
}

function tableMatch(tables: NumberTables, mask: number, text: string): [number, number] {
    let state = tables.starts[mask];
    let end = 0;
    let length = 0;
    for (let index = 0; index < text.length && state !== 0; index++) {
        state = tables.next[state][tables.classes[text.charCodeAt(index)]];
        if (state !== 0 && tables.ends[state] !== 0) {
            end = tables.ends[state];
            length = index + 1;
        }
    }
    return [end, length];
}

function regexMatch(form: string, text: string): number {
    const pattern = new RegExp(`^(?:${form})$`);
    for (let length = text.length; length > 0; length--) {
        if (pattern.test(text.slice(0, length))) {
            return length;
        }
    }
    return 0;
}

test('each number token alone takes the longest text its form matches as a RegExp', () => {
    const sets: [string, NumberRow[]][] = [
        ['gas', lexical.gas.numbers({ clangIntegers: false })],
        ['gas clang', lexical.gas.numbers({ clangIntegers: true })],
        ['nasm', lexical.nasm.numbers({ clangIntegers: false })],
    ];
    const cases = battery();
    const failures: string[] = [];
    for (const [name, rows] of sets) {
        const tables = numberTables(rows, SCANNER);
        for (const [index, row] of rows.entries()) {
            if (row.rival !== undefined) {
                continue;
            }
            for (const text of cases) {
                const [end, length] = tableMatch(tables, 1 << index, text);
                const expected = regexMatch(row.form, text);
                if ((end === index + 1 ? length : 0) !== expected && failures.length < 20) {
                    failures.push(
                        `${name} ${row.token} ${JSON.stringify(text)}: ${length}, not ${expected}`,
                    );
                }
            }
        }
    }
    assert.deepStrictEqual(failures, []);
});

test('a token with a rival yields to it only where the rival outlasts every completed token', () => {
    const tables = numberTables(lexical.gas.numbers({ clangIntegers: false }), SCANNER);
    const dot = tables.tokens.indexOf('DOT_FLOAT');
    const rival = tables.tokens.length + 1;
    const cases: [string, number, number][] = [
        ['.5', dot + 1, 2],
        ['.5e3', dot + 1, 4],
        ['.5x', dot + 1, 2],
        ['.5e', rival, 3],
        ['.5e+', rival, 3],
        ['.5e+1', dot + 1, 5],
        ['.x', rival, 2],
        ['.', 0, 0],
    ];
    for (const [text, end, length] of cases) {
        assert.deepStrictEqual(tableMatch(tables, 1 << dot, text), [end, length], text);
    }
});

test('a rival is a grammar token without precedence in every grammar of its syntax', () => {
    const rivals = lexical.gas.numbers({ clangIntegers: false }).flatMap(({ rival }) =>
        rival === undefined ? [] : [rival.token]
    );
    assert.ok(rivals.length > 0);
    for (const { grammar, syntax } of manifest.languages.filter(({ syntax }) => syntax === 'gas')) {
        const rules = JSON.parse(
            readFileSync(join(ROOT, 'tree-sitter', grammar, 'src', 'grammar.json'), 'utf8'),
        ).rules as Record<string, { type: string }>;
        for (const token of rivals) {
            assert.deepStrictEqual(
                rules[token]?.type,
                'PATTERN',
                `${grammar} (${syntax}): ${token}`,
            );
        }
    }
});

test('the number tables start nowhere when no number token is valid', () => {
    for (const syntax of ['gas', 'nasm'] as const) {
        const tables = numberTables(lexical[syntax].numbers({ clangIntegers: false }), SCANNER);
        assert.deepStrictEqual(tables.starts[0], 0);
        assert.ok(tables.next[0].every((state) => state === 0));
        assert.deepStrictEqual(tables.ends[0], 0);
    }
});

test('a number form outside the supported regex subset is refused with its reason', () => {
    const cases: [string, string][] = [
        ['[^a]', 'negates a class'],
        ['\\d', 'class escape \\d'],
        ['a.', 'unsupported .'],
        ['a+?', 'unsupported ?'],
        ['(a', 'unclosed group'],
        ['a)', 'unmatched )'],
        ['[b-a]', 'reversed range'],
        ['a{2,1}', 'n below m'],
        ['a{2', 'malformed {m,n}'],
        ['[a', 'ends early'],
        [String.fromCharCode(0xe9), 'outside ASCII'],
    ];
    for (const [form, reason] of cases) {
        assertThrowsIncluding(() => readForm(form), reason);
    }
});

test('a number table refuses a form that matches empty text or a token the scanner lacks', () => {
    assertThrowsIncluding(
        () => numberTables([{ token: 'integer', form: '[0-9]*' }], SCANNER),
        'matches empty text',
    );
    assertThrowsIncluding(
        () => numberTables([{ token: 'decimal', form: '[0-9]+' }], SCANNER),
        'is not in enum TokenType',
    );
    assertThrowsIncluding(
        () =>
            numberTables(
                [{ token: 'integer', form: '1' }, { token: 'integer', form: '2' }],
                SCANNER,
            ),
        'has two rows',
    );
});
