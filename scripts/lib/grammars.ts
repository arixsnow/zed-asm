// SPDX-License-Identifier: MIT

import { ensureDirSync } from '@std/fs';
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

export function buildLibrary(grammar: string): string {
  const built = libraries.get(grammar);
  if (built !== undefined) {
    return built;
  }
  ensureDirSync(join(ROOT, '.build'));
  const library = join(ROOT, '.build', `${grammar}.so`);
  runOrThrow('tree-sitter', ['build', '--output', library, join('tree-sitter', grammar)]);
  libraries.set(grammar, library);
  return library;
}

export function languageArgs(grammar: string, library = buildLibrary(grammar)): string[] {
  return ['--lib-path', library, '--lang-name', grammar];
}
