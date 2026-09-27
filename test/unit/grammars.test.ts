// SPDX-License-Identifier: MIT

import { assert, assertEquals, assertStringIncludes } from '@std/assert';
import { ensureDirSync } from '@std/fs';
import { join } from '@std/path';

import { ROOT } from '../../scripts/lib/files.ts';
import { run } from '../../scripts/lib/grammars.ts';

const SCRATCH = join('.build', 'run-probe');
const GRAMMAR = join('tree-sitter', 'asm_x86_gas');

Deno.test('run starts in the repository root and captures output larger than a pipe buffer', () => {
  ensureDirSync(join(ROOT, SCRATCH));
  const file = join(SCRATCH, 'large.s');
  const lines = 100_000;
  Deno.writeTextFileSync(join(ROOT, file), 'nop\n'.repeat(lines));
  const { ok, output } = run('tree-sitter', ['parse', '--grammar-path', GRAMMAR, file]);
  assert(ok, output.slice(-500));
  assert(output.length > 1024 * 1024, `only ${output.length} bytes captured`);
  assertEquals(output.match(/\(instruction /g)?.length, lines);
});

Deno.test('run reports a failing command and captures its standard error', () => {
  const file = join(SCRATCH, 'missing.s');
  const { ok, output } = run('tree-sitter', ['parse', '--grammar-path', GRAMMAR, file]);
  assertEquals(ok, false);
  assertStringIncludes(output, 'No files were found');
});

Deno.test('run adds the given environment to the inherited one', () => {
  const { output } = run('tree-sitter', ['generate', '--help'], {
    env: { TREE_SITTER_ABI_VERSION: '14' },
  });
  assertStringIncludes(output, 'TREE_SITTER_ABI_VERSION=14');
});
