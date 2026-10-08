// SPDX-License-Identifier: MIT

import { createHash } from 'node:crypto';

import { ensureDirSync, existsSync } from '@std/fs';
import { join } from '@std/path';

import { ROOT } from './files.ts';

export interface RunOptions {
  stream?: boolean;
  env?: Record<string, string>;
}

export interface RunResult {
  ok: boolean;
  output: string;
}

export function run(command: string, args: string[], options: RunOptions = {}): RunResult {
  const stdio = options.stream ? 'inherit' : 'piped';
  const result = new Deno.Command(command, {
    args,
    cwd: ROOT,
    env: options.env,
    stdin: 'null',
    stdout: stdio,
    stderr: stdio,
  }).outputSync();
  if (options.stream) {
    return { ok: result.success, output: '' };
  }
  const decoder = new TextDecoder();
  return {
    ok: result.success,
    output: `${decoder.decode(result.stdout)}${decoder.decode(result.stderr)}`,
  };
}

export function runOrThrow(command: string, args: string[]): string {
  const { ok, output } = run(command, args);
  if (!ok) {
    throw new Error(`${command} ${args.join(' ')} failed:\n${output}`);
  }
  return output;
}

const libraries = new Map<string, string>();
const LIBRARY_DIRECTORY = join(ROOT, '.build', 'lib');
const LIBRARY_SOURCES = [
  'src/parser.c',
  'src/scanner.c',
  'src/tree_sitter/alloc.h',
  'src/tree_sitter/array.h',
  'src/tree_sitter/parser.h',
];

function sourceHash(grammar: string): string {
  const hash = createHash('sha256');
  hash.update(runOrThrow('tree-sitter', ['--version']));
  for (const source of LIBRARY_SOURCES) {
    hash.update(Deno.readFileSync(join(ROOT, 'tree-sitter', grammar, source)));
  }
  hash.update(Deno.readFileSync(join(ROOT, 'tree-sitter', 'common', 'scanner.h')));
  return hash.digest('hex').slice(0, 16);
}

export function buildLibrary(grammar: string): string {
  const built = libraries.get(grammar);
  if (built !== undefined) {
    return built;
  }
  ensureDirSync(LIBRARY_DIRECTORY);
  const name = `${grammar}-${sourceHash(grammar)}.so`;
  const library = join(LIBRARY_DIRECTORY, name);
  if (!existsSync(library)) {
    const partial = join(LIBRARY_DIRECTORY, `.${crypto.randomUUID()}.so`);
    runOrThrow('tree-sitter', ['build', '--output', partial, join('tree-sitter', grammar)]);
    Deno.renameSync(partial, library);
    const stale = new RegExp(`^${grammar}-[0-9a-f]{16}\\.so$`);
    for (const entry of Deno.readDirSync(LIBRARY_DIRECTORY)) {
      if (stale.test(entry.name) && entry.name !== name) {
        Deno.removeSync(join(LIBRARY_DIRECTORY, entry.name));
      }
    }
  }
  libraries.set(grammar, library);
  return library;
}

export function languageArgs(grammar: string, library = buildLibrary(grammar)): string[] {
  return ['--lib-path', library, '--lang-name', grammar];
}
