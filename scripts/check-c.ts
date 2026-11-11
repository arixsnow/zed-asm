// SPDX-License-Identifier: MIT

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { emptyDir, ROOT } from './lib/files.ts';
import { run } from './lib/grammars.ts';
import { manifest } from './lib/manifest.ts';
import { Report, usage } from './lib/report.ts';
import { foreignFunctions, wasmArgs } from './lib/wasm.ts';

const WASM = join(ROOT, '.build', 'wasm');
const LOOKUPS = join(ROOT, '.build', 'words');

const SCANNER = 'tree-sitter/common/scanner.h';
const LOOKUP_TEST = 'test/c/words.c';

const WARNINGS = [
    '-std=c11',
    '-Wall',
    '-Wextra',
    '-Wpedantic',
    '-pedantic-errors',
    '-Wdeclaration-after-statement',
    '-Wshadow',
    '-Wconversion',
    '-Wsign-conversion',
    '-Wmissing-prototypes',
    '-Wmissing-declarations',
    '-Wstrict-prototypes',
    '-Wold-style-definition',
    '-Wundef',
    '-Wcast-qual',
    '-Wwrite-strings',
    '-Wswitch-default',
    '-Wredundant-decls',
    '-Wnested-externs',
    '-Wvla',
    '-Werror',
];

function main(args: string[]): number {
    const invalid = usage('check-c.ts', args);
    if (invalid !== undefined) {
        return invalid;
    }
    const report = new Report();
    emptyDir(WASM);
    emptyDir(LOOKUPS);
    const check = (label: string, command: string, commandArgs: string[], quiet = false) => {
        const { ok, output } = run(command, commandArgs);
        report.record(label, ok && !(quiet && output.trim() !== ''), output);
    };

    check('clang-format', 'clang-format', ['--dry-run', '--Werror', SCANNER, LOOKUP_TEST]);
    check('clang-tidy (dictionary lookups)', 'clang-tidy', [
        '--quiet',
        LOOKUP_TEST,
        '--',
        '-std=c11',
        '-DASM_GRAMMAR_NAME=asm_auto',
        '-DASM_DIALECT_AUTO',
        '-isystem',
        join('tree-sitter', 'asm_auto', 'src'),
    ]);
    const dialectError = 'define exactly one ASM_DIALECT_* macro before including scanner.h';
    const dialectProbes: [string, string[]][] = [
        ['rejects two dialects', ['-DASM_DIALECT_AUTO', '-DASM_DIALECT_ARM']],
        ['rejects a missing dialect', []],
    ];
    for (const [label, dialects] of dialectProbes) {
        const { ok, output } = run('gcc', [
            '-std=c11',
            '-fsyntax-only',
            '-DASM_GRAMMAR_NAME=asm_auto',
            ...dialects,
            '-isystem',
            join('tree-sitter', 'asm_auto', 'src'),
            '-x',
            'c',
            SCANNER,
        ]);
        report.record(`scanner.h ${label}`, !ok && output.includes(dialectError), output);
    }
    for (const { grammar, dialect } of manifest.languages) {
        const source = join('tree-sitter', grammar, 'src', 'scanner.c');
        const include = ['-isystem', join('tree-sitter', grammar, 'src')];
        const lookups = join(LOOKUPS, grammar);
        const lookupBuild = run('gcc', [
            ...WARNINGS,
            '-Wno-unused-function',
            '-O2',
            `-DASM_GRAMMAR_NAME=${grammar}`,
            `-DASM_DIALECT_${dialect}`,
            ...include,
            '-o',
            lookups,
            LOOKUP_TEST,
        ]);
        const lookupRun = lookupBuild.ok ? run(lookups, []) : lookupBuild;
        report.record(`dictionary lookups (${grammar})`, lookupRun.ok, lookupRun.output);
        check(`gcc warnings (${grammar})`, 'gcc', [
            ...WARNINGS,
            '-fsyntax-only',
            ...include,
            source,
        ]);
        check(`clang warnings (${grammar})`, 'clang', [
            ...WARNINGS,
            '-Wunreachable-code',
            '-fsyntax-only',
            ...include,
            source,
        ]);
        check(
            `gcc -fanalyzer (${grammar})`,
            'gcc',
            ['-std=c11', '-fanalyzer', '-c', '-o', '/dev/null', ...include, source],
            true,
        );
        check(
            `clang --analyze (${grammar})`,
            'clang',
            ['--analyze', '-o', '/dev/null', ...include, source],
            true,
        );
        check(`clang-tidy (${grammar})`, 'clang-tidy', [
            '--quiet',
            source,
            '--',
            '-std=c11',
            ...include,
        ]);
        const module = join(WASM, `${grammar}.wasm`);
        const built = run('clang', wasmArgs(grammar, module));
        const foreign = built.ok ? foreignFunctions(readFileSync(module)) : [];
        report.record(
            `wasm imports (${grammar})`,
            built.ok && foreign.length === 0,
            built.ok
                ? `imports functions tree-sitter's wasm runtime lacks: ${foreign.join(', ')}`
                : built.output,
        );
    }
    return report.finish('all C checks passed', 'C check(s)');
}

if (import.meta.main) {
    process.exitCode = main(process.argv.slice(2));
}
