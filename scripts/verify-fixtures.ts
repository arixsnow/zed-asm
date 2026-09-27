// SPDX-License-Identifier: MIT

import { ensureDirSync } from '@std/fs';
import { dirname, extname, join } from '@std/path';

import { ifExists, ROOT } from './lib/files.ts';
import { languageArgs, run } from './lib/grammars.ts';
import { manifest } from './lib/manifest.ts';
import { Report, usage } from './lib/report.ts';

interface Dialect {
  grammars: string[];
  assemblers: string[][];
}

const DISCARD = ['-o', '/dev/null'];

function clang(target: string): string[] {
  return ['clang', `--target=${target}`, '-c', ...DISCARD];
}

export const FIXTURE_DIALECTS: Record<string, Dialect> = {
  'a64-gnu': {
    grammars: ['asm_auto', 'asm_arm'],
    assemblers: [['aarch64-linux-gnu-as', ...DISCARD], clang('aarch64-linux-gnu')],
  },
  'a32-gnu': {
    grammars: ['asm_auto', 'asm_arm'],
    assemblers: [['arm-none-eabi-as', '-march=armv7-a', ...DISCARD], clang('armv7a-none-eabi')],
  },
  't32-gnu': {
    grammars: ['asm_auto', 'asm_arm'],
    assemblers: [['arm-none-eabi-as', '-mcpu=cortex-m3', ...DISCARD], clang('thumbv7m-none-eabi')],
  },
  'a64-apple': {
    grammars: ['asm_auto', 'asm_arm_apple'],
    assemblers: [clang('arm64-apple-macos')],
  },
  'x86-att': {
    grammars: ['asm_auto', 'asm_x86_gas'],
    assemblers: [['as', '--64', ...DISCARD], clang('x86_64-linux-gnu')],
  },
  'x86-intel': {
    grammars: ['asm_auto', 'asm_x86_gas'],
    assemblers: [['as', '--64', ...DISCARD], clang('x86_64-linux-gnu')],
  },
  'x86-nasm': {
    grammars: ['asm_x86_nasm'],
    assemblers: [
      ['nasm', '-f', 'elf64', ...DISCARD],
      ['yasm', '-f', 'elf64', ...DISCARD],
    ],
  },
};

const VARIANTS: [string, (text: string) => string][] = [
  ['crlf', (text) => text.replaceAll('\n', '\r\n')],
  ['no-final-newline', (text) => text.replace(/\n$/, '')],
];

function runsPreprocessor(command: string): boolean {
  return command === 'clang';
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

  for (const [dialect, { grammars, assemblers }] of Object.entries(FIXTURE_DIALECTS)) {
    const dir = join('test', 'fixtures', dialect);
    const entries = ifExists(() => [...Deno.readDirSync(join(ROOT, dir))]);
    if (entries === undefined) {
      report.record(`fixture directory ${dir} exists`, false);
      continue;
    }
    for (const name of entries.filter((entry) => entry.isFile).map((entry) => entry.name).sort()) {
      const file = join(dir, name);
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
          if (extname(name) === '.S' && !runsPreprocessor(command)) {
            continue;
          }
          const { ok, output } = run(command, [...commandArgs, copy]);
          report.record(`${copy} assembles with ${command} ${commandArgs.join(' ')}`, ok, output);
        }
      }
      for (const grammar of grammars) {
        filesByGrammar.get(grammar)?.push(file);
      }
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
