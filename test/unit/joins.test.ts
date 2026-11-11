// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const load = createRequire(import.meta.url);
const { joinTolerant, nonEmptyRegex } = load('../../tree-sitter/common/joins.js');
const lexical = load('../../tree-sitter/common/lexical.js');

const JOIN = '\\\n';

const CASES: [string, string[], string[]][] = [
    ['\\r?\\n', ['\n', '\r\n', `\r${JOIN}\n`], [`${JOIN}\n`, JOIN, '']],
    [lexical.nasm.identifier.source, [
        'eax',
        '$eax',
        `$${JOIN}eax`,
        `e${JOIN}ax`,
        '??',
        '$$foo',
        '$$$$',
        '$$1',
    ], [`${JOIN}eax`, `eax${JOIN}`, '?', '', '$', '$$', '$1', '$.x']],
    [lexical.nasm.integer.source, ['0x1f', `0x1${JOIN}f`, `1${JOIN}0h`, '10'], [
        `${JOIN}10`,
        `10${JOIN}`,
    ]],
    [lexical.nasm.float.source, ['1.5', `1.${JOIN}5`, `1e${JOIN}10`], [`1.5${JOIN}`]],
    ['[0-7]{1,3}', ['7', '777', `7${JOIN}77`], ['7777', `${JOIN}7`]],
    ['x[0-9a-f]{0,2}', ['x', 'x1', `x${JOIN}1f`], [`x${JOIN}`, 'x123']],
];

test('a join-tolerant terminal takes a join between two characters, never at either end', () => {
    const failures: string[] = [];
    for (const [source, accepted, refused] of CASES) {
        const pattern = new RegExp(`^(?:${nonEmptyRegex(source)})$`);
        for (const text of accepted.filter((candidate) => !pattern.test(candidate))) {
            failures.push(`/${source}/ refuses ${JSON.stringify(text)}`);
        }
        for (const text of refused.filter((candidate) => pattern.test(candidate))) {
            failures.push(`/${source}/ accepts ${JSON.stringify(text)}`);
        }
    }
    assert.deepStrictEqual(failures, []);
});

test('a multi-character string keeps its node name and a single character stays a string', () => {
    assert.deepStrictEqual(joinTolerant(','), { type: 'STRING', value: ',' });
    const alias = joinTolerant('<<');
    assert.deepStrictEqual([alias.type, alias.named, alias.value], ['ALIAS', false, '<<']);
    assert.ok(new RegExp(`^(?:${alias.content.value})$`).test(`<${JOIN}<`));
});

test('a pattern with a construct the join rewrite does not model stops the build', () => {
    for (
        const source of [
            'a*?',
            'a+?',
            'a{2}?',
            '\\x41',
            '\\u{41}',
            '\\p{L}',
            '\\1',
            '(?=a)',
            '(?<n>a)',
        ]
    ) {
        assert.throws(() => joinTolerant(new RegExp(source)), /unsupported/, source);
    }
    for (const source of ['\\d+', '[\\x41-\\x5a]+', '(?:ab)*c', 'a{2,}']) {
        assert.doesNotThrow(() => joinTolerant(new RegExp(source)), source);
    }
});
