// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { languageConfig } from '../../scripts/build.ts';
import { emptyDir, ROOT } from '../../scripts/lib/files.ts';
import { languageArgs, run } from '../../scripts/lib/grammars.ts';
import { blockIndentPattern, labelIndentPattern } from '../../scripts/lib/indent.ts';
import { manifest } from '../../scripts/lib/manifest.ts';
import { commonSources } from '../../scripts/lib/tables.ts';
import { parseFiles, treeText } from '../lib/parse.ts';

const SOURCES = commonSources();

interface Kind {
    headers: string[];
    closers: string[];
    context: string;
}

interface CaseSet {
    kinds: Kind[];
    leads: string[];
    tails: string[];
}

const CASE_SETS: Record<string, CaseSet> = {
    gas: {
        kinds: [
            {
                headers: ['.macro m', '.macro m a, b=1', '.MACRO m a'],
                closers: ['.endm', '.ENDMACRO'],
                context: '',
            },
            {
                headers: ['.if A', '.ifdef X', '.IFNDEF X', '.ifc a, b'],
                closers: ['.endif', '.ENDIF'],
                context: '',
            },
            { headers: ['.else', '.elseif B'], closers: ['.endif'], context: '.if A\n' },
            {
                headers: ['.rept 3', '.irp r, 1, 2', '.irpc c, 123'],
                closers: ['.endr', '.ENDR'],
                context: '',
            },
        ],
        leads: [
            '',
            '\t',
            'f: ',
            '.Lf: ',
            '1: ',
            'nop; ',
            '.byte 0; ',
            'x: nop; ',
            '.endr; ',
            '.endif; ',
            '.endm; ',
        ],
        tails: [
            '',
            ' // c',
            ' /* c */',
            ' /* ; c',
            ' # c',
            ' #1',
            ' @ c',
            ' ; c',
            ' ;',
            ';;',
            '; nop',
            '; .byte 1',
            '; .L1: nop',
            '; 1: nop',
            ' "a;b"',
            " ';'",
            '; #x',
            '; @x',
            '; x@y',
            '; .endx',
            '; .end',
        ],
    },
    nasm: {
        kinds: [
            {
                headers: ['%macro m 0', '%imacro m 1-2 a, b', '%MACRO m 1', '%rmacro m 0'],
                closers: ['%endmacro', '%ENDMACRO'],
                context: '',
            },
            {
                headers: [
                    '%if A',
                    '%ifdef X',
                    '%IFNDEF X',
                    '%ifidn a, b',
                    '%ifmacro m 1',
                    '%ifempty',
                ],
                closers: ['%endif', '%ENDIF'],
                context: '',
            },
            {
                headers: ['%else', '%elif B', '%elifmacro m', '%elifidn a, b'],
                closers: ['%endif'],
                context: '%if A\n',
            },
            { headers: ['%rep 3', '%REP 2'], closers: ['%endrep', '%ENDREP'], context: '' },
        ],
        leads: ['', '\t', '  ', 'nop; ', '; ', 'x equ 1 ; '],
        tails: [
            '',
            ' ; c',
            ' ;',
            ';;',
            ' "a;b"',
            " 'a;b'",
            ' `a;b`',
            ' `a\\`;b`',
            ' "a\\";b"',
            " 'a\\';b'",
            ' "a',
            " 'a",
            ' `a',
            ' `a\\`',
            ' // c',
            ' /* c */',
            ' # c',
            ' @ c',
            ' %endif',
            ' \\',
            ' ; c \\',
        ],
    },
};

const ERROR_CASES: Record<string, number> = {
    asm_auto: 442,
    asm_arm: 442,
    asm_arm_apple: 245,
    asm_x86_gas: 706,
    asm_x86_nasm: 66,
};

const LABEL_NAMES: Record<string, string[]> = {
    gas: [
        'f',
        '_f',
        'f.x',
        'f$',
        '.Lx',
        '.x',
        '.1',
        '.',
        '1',
        '10',
        '1$',
        '1b',
        '"a b"',
        '"a\\"b"',
        '""',
        'L(x)',
        'L (x)',
        'L(a(b))',
        'L()',
        '1(x)',
        '.L(x)',
        '"a"(x)',
        '1$(x)',
        'L(x',
        '\\name',
        '\\a\\()_b',
        'foo\\bar',
        'x\\@',
        '\\@',
        '\\+',
        'foo\\()',
        '\\()x',
        '$x',
        '%x',
        '@x',
        '?x',
        '#x',
        'eax',
        'nop',
    ],
    nasm: [
        'f',
        '_f',
        '@x',
        '@',
        '?x',
        '?',
        '??',
        '$x',
        '$',
        '$@x',
        '$.x',
        '$?x',
        '$?',
        '.x',
        '.',
        '..@x',
        '.1',
        'x#y',
        'x~y',
        'x.y',
        '%%x',
        '%%$x',
        '%%%x',
        '%%',
        '%%1',
        '%$x',
        '%$$x',
        '%$$',
        '%$',
        '%$1',
        '%x',
        '$eax',
        '1',
        '1x',
        '#x',
        '~x',
        'eax',
        'EAX',
        'section',
        'times',
        'rep',
        'dword',
        'rel',
        'r8b',
        'r8x',
        'r31d',
        'r32',
        'xmm31',
        'zmm32',
        '__?float32?__',
        'eaxx',
    ],
};

const BLOCK =
    /^ *(?:\w+: )?\((macro_definition|conditional|repeat_block|structure|structure_instance|elseif_clause|else_clause) \[(\d+), \d+\] - \[(\d+), \d+\]/;

function tailsFor(set: CaseSet, kind: Kind): string[] {
    const own = kind.closers.flatMap((closer) => [
        `; ${closer}`,
        `;${closer}`,
        `; ${closer} // c`,
        `; ${closer}; nop`,
        `; .L1: ${closer}`,
        `; 1: ${closer}`,
        `; nop; ${closer}`,
        ` /* x */; ${closer}`,
        ` "a;b"; ${closer}`,
    ]);
    const others = set.kinds.filter((other) => other.closers[0] !== kind.closers[0]).map((other) =>
        `; ${other.closers[0]}`
    );
    return [...set.tails, ...own, ...others];
}

function casesFor(set: CaseSet): { kind: Kind; line: string }[] {
    return set.kinds.flatMap((kind) =>
        kind.headers.flatMap((header) =>
            set.leads.flatMap((lead) =>
                tailsFor(set, kind).map((tail) => ({ kind, line: `${lead}${header}${tail}` }))
            )
        )
    );
}

function openAtEnd(tree: string, row: number): boolean {
    return tree.split('\n').some((line) => {
        const match = BLOCK.exec(line);
        return match !== null && Number(match[2]) === row && Number(match[3]) > row;
    });
}

test('the block part of the increase pattern matches a line exactly when the parser leaves a block opened on it open', () => {
    for (const language of manifest.languages) {
        const source = blockIndentPattern(language, manifest.blocks, SOURCES);
        if (source === null) {
            continue;
        }
        const pattern = new RegExp(source, 'u');
        const cases = casesFor(CASE_SETS[language.syntax]);
        const sources = cases.map(({ kind, line }) => `${kind.context}${line}\n`);
        const logs = parseFiles(language.grammar, 'indent-pattern', sources, ['--debug']).output
            .split(/^new_parse$/m).slice(1);
        const trees = treeText(parseFiles(language.grammar, 'indent-pattern', sources).output)
            .split(/^(?=\(source_file )/m).filter((tree) => tree.startsWith('(source_file '));
        assert.deepStrictEqual(logs.length, cases.length, `${language.grammar}: one log per case`);
        assert.deepStrictEqual(
            trees.length,
            cases.length,
            `${language.grammar}: one tree per case`,
        );
        const mismatches: string[] = [];
        let compared = 0;
        for (const [index, { kind, line }] of cases.entries()) {
            if (/\bdetect_error\b/.test(logs[index])) {
                continue;
            }
            compared++;
            const open = openAtEnd(trees[index], kind.context === '' ? 0 : 1);
            if (pattern.test(line) !== open) {
                mismatches.push(`${open ? 'open' : 'closed'}: ${JSON.stringify(line)}`);
            }
        }
        assert.deepStrictEqual(
            cases.length - compared,
            ERROR_CASES[language.grammar],
            `${language.grammar}: cases that parse with an error and are not compared`,
        );
        assert.deepStrictEqual(mismatches, [], language.grammar);
    }
});

test('Rust, whose regex engine Zed uses, compiles every indent pattern and reads every line like the tests do', () => {
    const directory = join(ROOT, '.build', 'indent-rust');
    for (const language of manifest.languages) {
        const config = languageConfig(language, manifest, SOURCES);
        const patterns = [config.increase_indent_pattern] as string[];
        const query = patterns.map((pattern, index) =>
            `((source_file) @p${index} (#match? @p${index} "${
                pattern.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
            }"))`
        ).join('\n');
        const set = CASE_SETS[language.syntax];
        const lines = set.kinds.filter((kind) => kind.context === '').flatMap((kind) => [
            ...tailsFor(set, kind).map((tail) => `${kind.headers[0]}${tail}`),
            ...kind.headers.map((header) => header),
            ...set.leads.filter((lead) => !/^\s/.test(lead)).map((lead) =>
                `${lead}${kind.headers[0]}`
            ),
        ]).concat(LABEL_NAMES[language.syntax].map((name) => `${name}:`));
        emptyDir(directory);
        writeFileSync(join(directory, 'query.scm'), query);
        const files = lines.map((line, index) => {
            const file = join(directory, `${index}.s`);
            writeFileSync(file, line);
            return file;
        });
        const { ok, output } = run('tree-sitter', [
            'query',
            ...languageArgs(language.grammar),
            join(directory, 'query.scm'),
            ...files,
        ]);
        assert.ok(ok, `${language.grammar}: ${output}`);
        const matched = new Map<string, Set<number>>();
        let current = '';
        for (const text of output.split('\n')) {
            const header = /^(\S.*\.s)$/.exec(text);
            if (header !== null) {
                current = header[1];
                matched.set(current, new Set());
                continue;
            }
            const pattern = /^\s+pattern: (\d+)$/.exec(text);
            if (pattern !== null) {
                matched.get(current)?.add(Number(pattern[1]));
            }
        }
        const compiled = patterns.map((pattern) => new RegExp(pattern, 'u'));
        const differences: string[] = [];
        for (const [index, line] of lines.entries()) {
            const rust = matched.get(files[index]) ?? matched.get(relative(ROOT, files[index]));
            assert.ok(rust !== undefined, `${language.grammar}: no result for ${files[index]}`);
            for (const [patternIndex, pattern] of compiled.entries()) {
                if (pattern.test(line) !== rust.has(patternIndex)) {
                    differences.push(`pattern ${patternIndex}: ${JSON.stringify(line)}`);
                }
            }
        }
        assert.deepStrictEqual(differences, [], language.grammar);
    }
});

const LABEL_TAILS: Record<string, { indents: string[]; ends: string[] }> = {
    gas: {
        indents: ['', ' nop', ' .byte 1', ' .macro m'],
        ends: [' .endm', ' .ENDR', ' .endif', ' .else', ' .elseif B'],
    },
    nasm: {
        indents: ['', ' nop', ' mov eax, 1', ' section .text'],
        ends: [' dd 1', ' resb 4', ' times 2 db 0', ' TIMES 2 db 0', ' equ 3', ' at s.x, dd 1'],
    },
};

test('the label pattern matches a line exactly when the parser reads a label there whose range goes on', () => {
    for (const language of manifest.languages) {
        const pattern = new RegExp(labelIndentPattern(language, manifest.blocks, SOURCES), 'u');
        const { indents, ends } = LABEL_TAILS[language.syntax];
        const cases = LABEL_NAMES[language.syntax].flatMap((name) =>
            ['', '\t', '  '].flatMap((lead) =>
                ['', ' ', '\t'].flatMap((blank) =>
                    [...indents, ...ends].map((tail) => ({
                        lead,
                        line: `${lead}${name}${blank}:${tail}`,
                        ends: ends.includes(tail),
                    }))
                )
            )
        );
        const trees = treeText(
            parseFiles(language.grammar, 'label-pattern', cases.map(({ line }) => `${line}\n`))
                .output,
        ).split(/^(?=\(source_file )/m).filter((tree) => tree.startsWith('(source_file '));
        assert.deepStrictEqual(
            trees.length,
            cases.length,
            `${language.grammar}: one tree per case`,
        );
        const mismatches: string[] = [];
        for (const [index, { lead, line, ends }] of cases.entries()) {
            const label = trees[index].includes(`(label [0, ${lead.length}]`) && !ends;
            if (pattern.test(line) !== label) {
                mismatches.push(`${label ? 'label' : 'no label'}: ${JSON.stringify(line)}`);
            }
        }
        assert.deepStrictEqual(mismatches, [], language.grammar);
    }
});

test('a label followed on its line by a closer, a clause or a word naming its statement opens no range', () => {
    const ending = (grammar: string, line: string) => {
        const language = manifest.languages.find((entry) => entry.grammar === grammar);
        assert.ok(language !== undefined, grammar);
        return !new RegExp(labelIndentPattern(language, manifest.blocks, SOURCES), 'u').test(line);
    };
    for (const line of ['a: .endm', 'a: .endr', '1: .endif', 'b: .else']) {
        assert.ok(ending('asm_x86_gas', line), line);
        assert.ok(ending('asm_arm', line), line);
    }
    for (
        const line of ['n: equ 3', '.a: times 4 resd 1', 'lbl: endstruc', 'lbl: iend', 'x: at s.f']
    ) {
        assert.ok(ending('asm_x86_nasm', line), line);
    }
    assert.ok(!ending('asm_x86_nasm', 'start: mov eax, 1'));
    assert.ok(!ending('asm_arm', 'x: .req r0'));
});
