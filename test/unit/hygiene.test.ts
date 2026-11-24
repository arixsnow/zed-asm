// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT } from '../../scripts/lib/files.ts';
import { repositoryFiles } from '../../scripts/lib/repository.ts';

const TAB_ALLOWED = ['test/corpus/', 'test/fixtures/'];
const PROSE_WIDTH = 100;

const contents = repositoryFiles(ROOT).map((path) => ({
    path,
    bytes: readFileSync(join(ROOT, path)),
}));

function offenders(isOffending: (path: string, bytes: Uint8Array) => boolean): string[] {
    return contents.filter(({ path, bytes }) => isOffending(path, bytes)).map(({ path }) => path);
}

test('every repository file is pure ASCII', () => {
    assert.deepStrictEqual(offenders((_, bytes) => bytes.some((byte) => byte > 0x7f)), []);
});

test('hard tabs appear only in test data', () => {
    assert.deepStrictEqual(
        offenders((path, bytes) =>
            !TAB_ALLOWED.some((prefix) => path.startsWith(prefix)) && bytes.includes(0x09)
        ),
        [],
    );
});

test('every file uses LF line endings', () => {
    assert.deepStrictEqual(offenders((_, bytes) => bytes.includes(0x0d)), []);
});

function wideProseLines(text: string): number[] {
    const wide: number[] = [];
    let fence = '';
    for (const [index, line] of text.split('\n').entries()) {
        const marker = /^ *(`{3,}|~{3,})/.exec(line)?.[1];
        if (fence === '' && marker !== undefined) {
            fence = marker;
        } else if (
            fence !== '' &&
            marker !== undefined &&
            marker[0] === fence[0] &&
            marker.length >= fence.length &&
            line.trim() === marker
        ) {
            fence = '';
        } else if (fence === '' && !line.startsWith('|') && line.length > PROSE_WIDTH) {
            wide.push(index + 1);
        }
    }
    return wide;
}

test('every prose line of a Markdown file fits in 100 columns', () => {
    const wide = contents
        .filter(({ path }) => path.endsWith('.md'))
        .flatMap(({ path, bytes }) =>
            wideProseLines(new TextDecoder().decode(bytes)).map((line) => `${path}:${line}`)
        );
    assert.deepStrictEqual(wide, []);
});

test('every hand-written file ends with a newline', () => {
    assert.deepStrictEqual(
        offenders((path, bytes) =>
            !/^tree-sitter\/[^/]+\/src\//.test(path) &&
            bytes.length > 0 &&
            bytes.at(-1) !== 0x0a
        ),
        [],
    );
});
