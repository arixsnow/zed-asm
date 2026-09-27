// SPDX-License-Identifier: MIT

import { emptyDirSync } from '@std/fs';
import { join } from '@std/path';

import { filesUnder, ifExists, ROOT } from './lib/files.ts';
import { run } from './lib/grammars.ts';
import { manifest } from './lib/manifest.ts';

const USAGE = 'usage: tree-sitter.ts generate | check | test';
const HAND_WRITTEN_SOURCES = new Set(['scanner.c']);

function generate(grammar: string, output: string): boolean {
  return run('tree-sitter', [
    'generate',
    '--js-runtime',
    'native',
    '--output',
    output,
    join('tree-sitter', grammar, 'grammar.js'),
  ], { stream: true }).ok;
}

function corpusTest(grammar: string): boolean {
  return run('tree-sitter', ['test', '--grammar-path', join('tree-sitter', grammar)], {
    stream: true,
  }).ok;
}

function sameBytes(left: Uint8Array, right: Uint8Array | undefined): boolean {
  return right !== undefined && left.length === right.length &&
    left.every((byte, index) => byte === right[index]);
}

function staleParserFiles(grammar: string): string[] | undefined {
  const fresh = join('.build', 'generated', grammar);
  emptyDirSync(join(ROOT, fresh));
  if (!generate(grammar, fresh)) {
    return undefined;
  }
  const source = join('tree-sitter', grammar, 'src');
  const produced = filesUnder(join(ROOT, fresh));
  const differing = produced.filter((path) =>
    !sameBytes(
      Deno.readFileSync(join(ROOT, fresh, path)),
      ifExists(() => Deno.readFileSync(join(ROOT, source, path))),
    )
  );
  const leftover = filesUnder(join(ROOT, source)).filter((path) =>
    !HAND_WRITTEN_SOURCES.has(path) && !produced.includes(path)
  );
  return [...differing, ...leftover].sort().map((path) => `${source}/${path}`);
}

function eachGrammar(action: (grammar: string) => boolean): number {
  const failed: string[] = [];
  for (const { grammar } of manifest.languages) {
    console.log(`==> ${grammar}`);
    if (!action(grammar)) {
      failed.push(grammar);
    }
  }
  if (failed.length > 0) {
    console.error(`Failed: ${failed.join(', ')}`);
    return 1;
  }
  return 0;
}

function check(): number {
  const stale: string[] = [];
  const status = eachGrammar((grammar) => {
    const files = staleParserFiles(grammar);
    stale.push(...(files ?? []));
    return files !== undefined;
  });
  if (stale.length > 0) {
    console.error(
      `Generated parsers are out of date:\n  ${
        stale.join('\n  ')
      }\nRun: scripts/dev deno task generate`,
    );
    return 1;
  }
  return status;
}

function main(args: string[]): number {
  if (args.length !== 1) {
    console.error(USAGE);
    return 2;
  }
  switch (args[0]) {
    case 'generate':
      return eachGrammar((grammar) => generate(grammar, join('tree-sitter', grammar, 'src')));
    case 'check':
      return check();
    case 'test':
      return eachGrammar(corpusTest);
    default:
      console.error(USAGE);
      return 2;
  }
}

if (import.meta.main) {
  Deno.exitCode = main(Deno.args);
}
