// SPDX-License-Identifier: MIT

import { ensureDirSync } from '@std/fs';
import { join } from '@std/path';

import { ROOT } from './lib/files.ts';
import { languageArgs, run } from './lib/grammars.ts';
import { manifest } from './lib/manifest.ts';
import { Report, usage } from './lib/report.ts';

const LIBRARY_DIR = '/usr/lib64';
const FUZZ_ITERATIONS = '300';
const FUZZ_EDITS = '8';
const SANITIZER_REPORT = /ERROR: AddressSanitizer|runtime error:/;

function runtime(name: string): string {
  const file = [...Deno.readDirSync(LIBRARY_DIR)]
    .map((entry) => entry.name)
    .filter((entry) => entry.startsWith(`${name}.so.`))
    .sort()[0];
  if (file === undefined) {
    throw new Error(`${name} runtime not found in ${LIBRARY_DIR}`);
  }
  return join(LIBRARY_DIR, file);
}

function main(args: string[]): number {
  const invalid = usage('sanitize.ts', args);
  if (invalid !== undefined) {
    return invalid;
  }
  const env = {
    LD_PRELOAD: `${runtime('libasan')} ${runtime('libubsan')}`,
    ASAN_OPTIONS: 'detect_leaks=0:abort_on_error=1',
    UBSAN_OPTIONS: 'halt_on_error=1:print_stacktrace=1',
  };
  ensureDirSync(join(ROOT, '.build'));
  const report = new Report();
  for (const { grammar } of manifest.languages) {
    const source = join('tree-sitter', grammar, 'src');
    const library = join(ROOT, '.build', `${grammar}.san.so`);
    const built = run('gcc', [
      '-std=c11',
      '-g',
      '-O1',
      '-fno-omit-frame-pointer',
      '-fsanitize=address,undefined',
      '-fno-sanitize-recover=all',
      '-shared',
      '-fPIC',
      '-isystem',
      source,
      join(source, 'parser.c'),
      join(source, 'scanner.c'),
      '-o',
      library,
    ]);
    report.record(`build with ASan+UBSan (${grammar})`, built.ok, built.output);
    if (!built.ok) {
      continue;
    }
    const target = [
      ...languageArgs(grammar, library),
      '--grammar-path',
      join('tree-sitter', grammar),
    ];
    const corpus = run('tree-sitter', ['test', ...target], { env });
    report.record(
      `corpus under ASan+UBSan (${grammar})`,
      corpus.ok && !SANITIZER_REPORT.test(corpus.output),
      corpus.output,
    );
    const fuzz = run(
      'tree-sitter',
      ['fuzz', ...target, '--iterations', FUZZ_ITERATIONS, '--edits', FUZZ_EDITS],
      { env },
    );
    report.record(
      `fuzz under ASan+UBSan (${grammar})`,
      fuzz.ok && !SANITIZER_REPORT.test(fuzz.output),
      fuzz.output,
    );
  }
  return report.finish('all sanitizer checks passed', 'sanitizer check(s)');
}

if (import.meta.main) {
  Deno.exitCode = main(Deno.args);
}
