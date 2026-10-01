// SPDX-License-Identifier: MIT

import { ensureDirSync } from '@std/fs';
import { dirname, extname, join, SEPARATOR } from '@std/path';

import { filesUnder, ROOT } from './lib/files.ts';
import { languageArgs, run } from './lib/grammars.ts';
import { manifest } from './lib/manifest.ts';
import { Report, usage } from './lib/report.ts';

interface Dialect {
  grammars: string[];
  assemblers: Record<string, string[]>;
}

export interface Fixture {
  dialect: string;
  name: string;
  file: string;
  grammars: string[];
  assemblers: string[][];
}

const DISCARD = ['-o', '/dev/null'];

function clang(target: string): string[] {
  return ['clang', `--target=${target}`, '-c', ...DISCARD];
}

const FIXTURE_DIALECTS: Record<string, Dialect> = {
  'a64-gnu': {
    grammars: ['asm_auto', 'asm_arm'],
    assemblers: { gas: ['aarch64-linux-gnu-as', ...DISCARD], clang: clang('aarch64-linux-gnu') },
  },
  'a32-gnu': {
    grammars: ['asm_auto', 'asm_arm'],
    assemblers: {
      gas: ['arm-none-eabi-as', '-march=armv7-a', ...DISCARD],
      clang: clang('armv7a-none-eabi'),
    },
  },
  't32-gnu': {
    grammars: ['asm_auto', 'asm_arm'],
    assemblers: {
      gas: ['arm-none-eabi-as', '-mcpu=cortex-m3', ...DISCARD],
      clang: clang('thumbv7m-none-eabi'),
    },
  },
  'a64-apple': {
    grammars: ['asm_auto', 'asm_arm_apple'],
    assemblers: { clang: clang('arm64-apple-macos') },
  },
  'x86-att': {
    grammars: ['asm_auto', 'asm_x86_gas'],
    assemblers: { gas: ['as', '--64', ...DISCARD], clang: clang('x86_64-linux-gnu') },
  },
  'x86-intel': {
    grammars: ['asm_auto', 'asm_x86_gas'],
    assemblers: { gas: ['as', '--64', ...DISCARD], clang: clang('x86_64-linux-gnu') },
  },
  'x86-nasm': {
    grammars: ['asm_x86_nasm'],
    assemblers: {
      nasm: ['nasm', '-f', 'elf64', ...DISCARD],
      yasm: ['yasm', '-f', 'elf64', ...DISCARD],
    },
  },
};

const VARIANTS: [string, (text: string) => string][] = [
  ['crlf', (text) => text.replaceAll('\n', '\r\n')],
  ['no-final-newline', (text) => text.replace(/\n$/, '')],
];

function runsPreprocessor(assembler: string): boolean {
  return assembler === 'clang';
}

export function fixtures(): Fixture[] {
  const found: Fixture[] = [];
  for (const [dialect, { grammars, assemblers }] of Object.entries(FIXTURE_DIALECTS)) {
    const directory = join('test', 'fixtures', dialect);
    const names = filesUnder(join(ROOT, directory));
    if (names.length === 0) {
      throw new Error(`${directory} holds no fixture`);
    }
    for (const name of names) {
      const parts = name.split(SEPARATOR);
      if (parts.length > 2 || (parts.length === 2 && !Object.hasOwn(assemblers, parts[0]))) {
        throw new Error(
          `${join(directory, name)}: only a directory named after one of ${
            Object.keys(assemblers).join(', ')
          } may hold fixtures`,
        );
      }
      const checkers = Object.entries(assemblers).filter(([assembler]) =>
        (parts.length === 1 || parts[0] === assembler) &&
        (extname(name) !== '.S' || runsPreprocessor(assembler))
      ).map(([, command]) => command);
      if (checkers.length === 0) {
        throw new Error(`${join(directory, name)}: no assembler checks it`);
      }
      found.push({ dialect, name, file: join(directory, name), grammars, assemblers: checkers });
    }
  }
  return found;
}

function main(args: string[]): number {
  const invalid = usage('verify-fixtures.ts', args);
  if (invalid !== undefined) {
    return invalid;
  }
  const report = new Report();
  const filesByGrammar = new Map(
    manifest.languages.map(({ grammar }) => [grammar, [] as string[]]),
  );

  for (const { dialect, name, file, grammars, assemblers } of fixtures()) {
    const text = Deno.readTextFileSync(join(ROOT, file));
    const copies = [
      file,
      ...VARIANTS.map(([variant, transform]) => {
        const copy = join('.build', 'fixture-variants', variant, dialect, name);
        ensureDirSync(join(ROOT, dirname(copy)));
        Deno.writeTextFileSync(join(ROOT, copy), transform(text));
        return copy;
      }),
    ];
    for (const copy of copies) {
      for (const [command, ...commandArgs] of assemblers) {
        const { ok, output } = run(command, [...commandArgs, copy]);
        report.record(`${copy} assembles with ${command} ${commandArgs.join(' ')}`, ok, output);
      }
    }
    for (const grammar of grammars) {
      filesByGrammar.get(grammar)?.push(file);
    }
  }

  for (const [grammar, files] of filesByGrammar) {
    const { ok, output } = run('tree-sitter', [
      'parse',
      ...languageArgs(grammar),
      '--quiet',
      ...files,
    ]);
    report.record(`${grammar}: ${files.length} file(s) parse cleanly`, ok, output);
  }

  return report.finish('every fixture assembles and parses cleanly', 'fixture check(s)');
}

if (import.meta.main) {
  Deno.exitCode = main(Deno.args);
}
