// SPDX-License-Identifier: MIT

import { join } from '@std/path';

import { run } from './lib/grammars.ts';
import { manifest } from './lib/manifest.ts';
import { Report, usage } from './lib/report.ts';

const SCANNER = 'tree-sitter/common/scanner.h';

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
  const check = (label: string, command: string, commandArgs: string[], quiet = false) => {
    const { ok, output } = run(command, commandArgs);
    report.record(label, ok && !(quiet && output.trim() !== ''), output);
  };

  check('clang-format', 'clang-format', ['--dry-run', '--Werror', SCANNER]);
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
  for (const { grammar } of manifest.languages) {
    const source = join('tree-sitter', grammar, 'src', 'scanner.c');
    const include = ['-isystem', join('tree-sitter', grammar, 'src')];
    check(`gcc warnings (${grammar})`, 'gcc', [...WARNINGS, '-fsyntax-only', ...include, source]);
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
  }
  return report.finish('all C checks passed', 'C check(s)');
}

if (import.meta.main) {
  Deno.exitCode = main(Deno.args);
}
