// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';

import { manifest } from '../../scripts/lib/manifest.ts';
import { flatTrees, parseFiles, treeText } from '../lib/parse.ts';

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

const JOIN = '\\\n';
const SPACED_JOIN = '\\ \n';
const ERROR = 'ERROR';

type FormTable = [string, [string, string][]][];

const GNU_FORMS: FormTable = [
    ['.quad', [
        ['0', 'integer'],
        ['42', 'integer'],
        ['08', 'integer'],
        ['0x1f', 'integer'],
        ['0X1F', 'integer'],
        ['0b101', 'integer'],
        ['0B1', 'integer'],
        [`1${JOIN}2`, 'integer'],
        [`0${JOIN}x1f`, 'integer'],
        [`0x1${SPACED_JOIN}f`, 'integer'],
        [`1${JOIN}`, 'integer'],
        ['1f', 'numeric_label'],
        ['1b', 'numeric_label'],
        ['10b', 'numeric_label'],
        ['0b', 'numeric_label'],
        [`1${JOIN}f`, 'numeric_label'],
        ['1.5', 'float'],
        ['0x', ERROR],
        ['0x1g', ERROR],
        ['1F', ERROR],
        ['1e', ERROR],
        ['1\\2', ERROR],
    ]],
    ['.double', [
        ['1.5', 'float'],
        ['1.', 'float'],
        ['1.5e3', 'float'],
        ['1.5E-3', 'float'],
        ['1e3', 'float'],
        ['1e+3', 'float'],
        ['0f1.5', 'float'],
        ['0d1.5e3', 'float'],
        ['0e1', 'float'],
        ['0r.5', 'float'],
        ['0s-1.5', 'float'],
        ['0F+1', 'float'],
        ['0h1', 'float'],
        ['0p1', 'float'],
        ['0x1.5', 'float'],
        ['0b1.0', 'float'],
        ['0x1.8p0', 'float'],
        ['0x.8p1', 'float'],
        ['0x1p3', 'float'],
        ['.5', 'float'],
        ['.5e3', 'float'],
        ['.5E-2', 'float'],
        [`1.${JOIN}5`, 'float'],
        [`1e${JOIN}3`, 'float'],
        [`.${JOIN}5`, 'float'],
        [`0x1.8${SPACED_JOIN}p0`, 'float'],
        ['.5e', 'identifier'],
        ['.5x', ERROR],
        [`.0${JOIN}L`, ERROR],
    ]],
];

const NASM_FORMS: FormTable = [
    ['dd', [
        ['0x1f', 'integer'],
        ['0X1F', 'integer'],
        ['0h1f', 'integer'],
        ['1fh', 'integer'],
        ['1fx', 'integer'],
        ['$1f', 'integer'],
        ['0o17', 'integer'],
        ['0q17', 'integer'],
        ['17o', 'integer'],
        ['17q', 'integer'],
        ['0b101', 'integer'],
        ['0y101', 'integer'],
        ['101b', 'integer'],
        ['101y', 'integer'],
        ['0d99', 'integer'],
        ['0t99', 'integer'],
        ['99d', 'integer'],
        ['99t', 'integer'],
        ['1_000', 'integer'],
        ['0x_ff', 'integer'],
        ['1_', 'integer'],
        ['9', 'integer'],
        ['9h', 'integer'],
        ['0bh', 'integer'],
        ['0x', 'integer'],
        [`0x1${JOIN}f`, 'integer'],
        [`1${JOIN}0h`, 'integer'],
        [`$${JOIN}1f`, 'integer'],
        ['1.5', 'float'],
        ['1.', 'float'],
        ['1.5e3', 'float'],
        ['1.5e', 'float'],
        ['1e3', 'float'],
        ['1e+3', 'float'],
        ['1_0.0_1', 'float'],
        ['0d1.5', 'float'],
        ['0t.5', 'float'],
        ['0d1e3', 'float'],
        ['0x1.8p0', 'float'],
        ['0h.8', 'float'],
        ['0x1p3', 'float'],
        ['$1.8p2', 'float'],
        ['$1p3', 'float'],
        ['0o1.4', 'float'],
        ['0q.4p1', 'float'],
        ['0b1.1p1', 'float'],
        ['0y.1', 'float'],
        ['1p', 'float'],
        ['0p1', 'float'],
        [`1.${JOIN}5`, 'float'],
        [`1e${JOIN}10`, 'float'],
        ['0xg', ERROR],
        ['0b2', ERROR],
        ['$1x', ERROR],
        [`1${SPACED_JOIN}2`, ERROR],
        [`$0${JOIN}h`, ERROR],
    ]],
    ['global', [['$1x', 'identifier']]],
];

function formFailures(grammar: string, table: FormTable): string[] {
    const cases = table.flatMap(([directive, forms]) =>
        forms.map(([text, node]): [string, string] => [`${directive} ${text}`, node])
    );
    const trees = flatTrees(grammar, 'numbers', cases.map(([source]) => `${source}\n`));
    return cases.flatMap(([source, node], index) => {
        const tree = trees[index];
        const read = node === ERROR
            ? /\b(ERROR|MISSING)\b/.test(tree)
            : tree === `(source_file (directive name: (directive_name) argument: (${node})))`;
        return read ? [] : [`${grammar}: ${JSON.stringify(source)} is not ${node}: ${tree}`];
    });
}

test('every GNU number form reads as one integer, float or numeric label, joins inside it', () => {
    const failures = manifest.languages
        .filter(({ syntax }) => syntax === 'gas')
        .flatMap(({ grammar }) => formFailures(grammar, GNU_FORMS));
    assert.deepStrictEqual(failures, []);
});

test('every NASM number form reads as one integer or float, joins inside it', () => {
    const failures = manifest.languages
        .filter(({ syntax }) => syntax === 'nasm')
        .flatMap(({ grammar }) => formFailures(grammar, NASM_FORMS));
    assert.deepStrictEqual(failures, []);
});
