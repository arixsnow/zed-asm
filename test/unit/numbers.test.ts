// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { ROOT } from '../../scripts/lib/files.ts';
import { run } from '../../scripts/lib/grammars.ts';
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

function rivalProbe(grammar: string, token: string, rival: string): string {
    return `#include "parser.c"

#include <stdio.h>

static int has_actions(const TSLanguage *language, uint32_t state, TSSymbol symbol)
{
    const uint16_t *data = NULL;
    uint16_t groups = 0;
    uint16_t group = 0;
    uint16_t count = 0;
    uint16_t item = 0;

    if (state < language->large_state_count) {
        return language->parse_table[state * language->symbol_count + symbol] != 0;
    }
    data = &language->small_parse_table[language->small_parse_table_map[state - language->large_state_count]];
    groups = *data++;
    for (group = 0; group < groups; group++) {
        data++;
        count = *data++;
        for (item = 0; item < count; item++) {
            if (*data++ == symbol) {
                return 1;
            }
        }
    }
    return 0;
}

int main(void)
{
    const TSLanguage *language = tree_sitter_${grammar}();
    uint32_t state = 0;
    int missing = 0;

    for (state = 0; state < language->state_count; state++) {
        const uint16_t external = language->lex_modes[state].external_lex_state;
        const bool *valid = &language->external_scanner.states[external * language->external_token_count];

        if (external != 0 && valid[ts_external_token_${token}] && !has_actions(language, state, sym_${rival})) {
            printf("parse state %u\\n", state);
            missing = 1;
        }
    }
    return missing;
}
`;
}

test('a rival is valid in every parse state where its number token is', () => {
    const rows = lexical.gas.numbers({ clangIntegers: false })
        .filter((row): row is NumberRow & { rival: { token: string } } => row.rival !== undefined);
    assert.ok(rows.length > 0);
    const directory = join(ROOT, '.build', 'numbers-rivals');
    mkdirSync(directory, { recursive: true });
    const failures: string[] = [];
    for (const { grammar } of manifest.languages.filter(({ syntax }) => syntax === 'gas')) {
        for (const row of rows) {
            const source = join(directory, `${grammar}${row.token}.c`);
            const program = join(directory, `${grammar}${row.token}`);
            const sources = join(ROOT, 'tree-sitter', grammar, 'src');
            writeFileSync(source, rivalProbe(grammar, row.token, row.rival.token));
            const built = run('cc', [
                '-std=c11',
                '-w',
                `-I${sources}`,
                '-o',
                program,
                source,
                join(sources, 'scanner.c'),
            ]);
            assert.ok(built.ok, built.output);
            const probed = run(program, []);
            if (!probed.ok) {
                failures.push(
                    `${grammar}: ${row.rival.token} has no action where ${row.token} is valid:\n${probed.output}`,
                );
            }
        }
    }
    assert.deepStrictEqual(failures, []);
});

test('no two states of a number table read the same texts to the same ends', () => {
    const sets = [
        lexical.gas.numbers({ clangIntegers: false }),
        lexical.gas.numbers({ clangIntegers: true }),
        lexical.nasm.numbers({ clangIntegers: false }),
    ];
    for (const rows of sets) {
        const { ends, next } = numberTables(rows, SCANNER);
        const apart = ends.map((left) => ends.map((right) => left !== right));
        let changed = true;
        while (changed) {
            changed = false;
            for (let left = 0; left < next.length; left++) {
                for (let right = left + 1; right < next.length; right++) {
                    if (
                        !apart[left][right] &&
                        next[left].some((target, symbol) => apart[target][next[right][symbol]])
                    ) {
                        apart[left][right] = true;
                        apart[right][left] = true;
                        changed = true;
                    }
                }
            }
        }
        const alike = apart.flatMap((row, left) =>
            row.flatMap((distinct, right) => left < right && !distinct ? [`${left}=${right}`] : [])
        );
        assert.deepStrictEqual(alike, [], rows.map(({ token }) => token).join(' '));
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
