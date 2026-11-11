// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { emptyDir, ROOT } from '../../scripts/lib/files.ts';
import { parsePins, readPins } from '../../scripts/lib/real-code.ts';
import { captureRows, errorRows } from '../../scripts/real-code.ts';
import { assertThrowsIncluding } from '../lib/assert.ts';

const COMMIT = 'a'.repeat(40);
const VALID = [
    '# SPDX-License-Identifier: MIT',
    '',
    '[source "kernel"]',
    '    url = https://example.org/kernel.git',
    '    branch = main',
    `    commit = ${COMMIT}`,
    '',
    '[files "kernel x86"]',
    '    source = kernel',
    '    include = arch/x86/**/*.S',
    '    include = lib/*.S',
    '    exclude = **/*.lds.S',
    '    language = asm_x86_gas',
    '    language = asm_auto',
    '',
].join('\n');

function edited(from: string, to: string): string {
    assert.ok(VALID.includes(from), `the valid pin file has no "${from}"`);
    return VALID.replace(from, to);
}

test('the shipped pin file is valid', () => {
    assert.doesNotThrow(readPins);
});

test('a pin file parses into its sources and file sets', () => {
    assert.deepStrictEqual(parsePins(VALID), {
        sources: [{
            name: 'kernel',
            url: 'https://example.org/kernel.git',
            branch: 'main',
            commit: COMMIT,
        }],
        files: [{
            name: 'kernel x86',
            source: 'kernel',
            include: ['arch/x86/**/*.S', 'lib/*.S'],
            exclude: ['**/*.lds.S'],
            languages: ['asm_x86_gas', 'asm_auto'],
        }],
    });
});

test('a SHA-256 commit id is a full commit id', () => {
    const commit = 'b'.repeat(64);
    assert.equal(parsePins(edited(COMMIT, commit)).sources[0].commit, commit);
});

test('an invalid pin file fails with a message naming the line or section', () => {
    const cases: [string, string][] = [
        [
            edited(`    commit = ${COMMIT}`, '    commit ='),
            'commit must be a full commit id (got "")',
        ],
        [edited(COMMIT, 'main'), 'commit must be a full commit id (got "main")'],
        [edited('    branch = main', '\tbranch = main'), 'line 5 must be a [kind "name"] header'],
        [
            edited('    branch = main', '    branch  =  main'),
            'line 5 must be a [kind "name"] header',
        ],
        [edited('[source "kernel"]', '[Source "kernel"]'), 'line 3 must be a [kind "name"] header'],
        [
            edited('[files "kernel x86"]', '[file "kernel x86"]'),
            'line 8 starts a section of unknown kind "file"',
        ],
        [
            edited('[files "kernel x86"]', '[constructor "x"]'),
            'starts a section of unknown kind "constructor"',
        ],
        [
            edited('[source "kernel"]', '[source "ker\\"nel"]'),
            'line 3 must be a [kind "name"] header',
        ],
        [
            edited('lib/*.S', 'lib/#.S'),
            'line 11 has a value git would read as quoted, escaped or commented',
        ],
        [
            edited('lib/*.S', '"lib/*.S"'),
            'has a value git would read as quoted, escaped or commented',
        ],
        [
            edited('lib/*.S', 'lib/*.S\\'),
            'has a value git would read as quoted, escaped or commented',
        ],
        [
            edited('lib/*.S', '/lib/*.S'),
            'include must be a glob relative to the source root (got "/lib/*.S")',
        ],
        [
            edited('lib/*.S', '!lib/*.S'),
            'include must be a glob relative to the source root (got "!lib/*.S")',
        ],
        [
            edited('lib/*.S', 'lib/'),
            'include must be a glob relative to the source root (got "lib/")',
        ],
        [
            edited('lib/*.S', 'lib/[ab.S'),
            '[files "kernel x86"] (line 8) include "lib/[ab.S" opens a [ it never closes',
        ],
        [
            edited('**/*.lds.S', '[[:word:]].S'),
            'exclude "[[:word:]].S" names the unknown class [:word:]',
        ],
        [
            edited('**/*.lds.S', '/x.S'),
            'exclude must be a glob relative to the source root (got "/x.S")',
        ],
        [
            edited('    language = asm_auto', '    language = asm_x86_gas'),
            'line 14 sets language = asm_x86_gas a second time',
        ],
        [edited('asm_auto', 'asm_mips'), 'language must be one of'],
        [
            edited('    source = kernel', '    source = linux'),
            'names source "linux", which no [source] section defines',
        ],
        [
            edited('    url = https://example.org/kernel.git\n', ''),
            '[source "kernel"] (line 3) must set url once (sets it 0 times)',
        ],
        [
            edited('    branch = main', '    branch = main\n    url = https://example.org/b.git'),
            'must set url once (sets it 2 times)',
        ],
        [edited('https://example.org', 'http://example.org'), 'url must be an https URL'],
        [
            edited('    branch = main', '    branch = main\n    depth = 1'),
            'line 6 sets depth, which a source section does not take',
        ],
        [
            edited('    source = kernel', '    source = kernel\n    commit = x'),
            'sets commit, which a files section does not take',
        ],
        [
            edited('[source "kernel"]', '[source ".."]'),
            'name must be one path component (got "..")',
        ],
        [
            edited('[source "kernel"]', '[source "a/b"]'),
            'name must be one path component (got "a/b")',
        ],
        [
            edited('    include = arch/x86/**/*.S\n    include = lib/*.S\n', ''),
            'must set include at least once',
        ],
        [
            edited('    language = asm_x86_gas\n    language = asm_auto\n', ''),
            'must set language at least once',
        ],
        [
            `${VALID}\n[files "kernel x86"]\n`,
            'line 16 repeats [files "kernel x86"] (line 8), which git would merge',
        ],
        [
            edited('# SPDX-License-Identifier: MIT', '# x\n    url = https://a.b'),
            'line 2 sets a key outside any section',
        ],
        [
            `${VALID}\n[source "lonely"]\n    url = https://a.b\n    branch = main\n    commit = ${COMMIT}\n`,
            '[source "lonely"] is named by no [files] section',
        ],
        ['# SPDX-License-Identifier: MIT\n', 'the file defines no [source] section'],
    ];
    for (const [text, message] of cases) {
        assertThrowsIncluding(() => parsePins(text), message);
    }
});

test('error rows come from one tree-sitter parse and one query over every file', () => {
    const directory = join(ROOT, '.build', 'real-code-test');
    emptyDir(directory);
    const clean = join(directory, 'clean.s');
    const broken = join(directory, 'broken.s');
    writeFileSync(clean, 'nop\nret\n');
    writeFileSync(broken, 'nop\nnop )\nret\nnop )\n');
    assert.deepStrictEqual(
        errorRows('asm_x86_gas', [clean, broken]),
        new Map([[broken, [1, 3]]]),
    );
    assert.deepStrictEqual(errorRows('asm_x86_gas', []), new Map());
});

test('query captures cover every row they span, their text spanning as many lines', () => {
    const output = [
        '/a.s',
        '    pattern:  0, capture: 0 - error, start: (0, 14), end: (1, 2), text: `,\t\\',
        '\tc`',
        '    pattern:  0, capture: 0 - error, start: (0, 16), end: (0, 17), text: `\\`',
        '/b.s',
        '/c.s',
        '    pattern:  1, capture: 1 - missing, start: (4, 0), end: (4, 0), text: ``',
        '    pattern:  0, capture: 0 - error, start: (6, 3), end: (8, 0), text: `x',
        '/d.s',
        '`',
        '',
    ].join('\n');
    assert.deepStrictEqual(
        captureRows(output, ['/a.s', '/b.s', '/c.s'], 'query'),
        new Map([['/a.s', new Set([0, 1])], ['/c.s', new Set([4, 6, 7])]]),
    );
    assertThrowsIncluding(
        () => captureRows(output, ['/a.s', '/b.s', '/c.s', '/d.s'], 'query'),
        'query reported 3 of 4 files',
    );
    assertThrowsIncluding(
        () => captureRows(output, ['/a.s', '/x.s'], 'query'),
        'query printed "/b.s" for /x.s',
    );
    assertThrowsIncluding(
        () => captureRows('/a.s\n    pattern: 0, capture: 0 - error\n', ['/a.s'], 'query'),
        'query printed an unknown line',
    );
    assertThrowsIncluding(
        () =>
            captureRows(
                '/a.s\n    pattern:  0, capture: 0 - error, start: (0, 1), end: (1, 1), text: `a\nb\n',
                ['/a.s'],
                'query',
            ),
        'printed a capture of rows 0-1 in /a.s whose text does not end on its last row',
    );
});
