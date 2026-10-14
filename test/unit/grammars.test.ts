// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT } from '../../scripts/lib/files.ts';
import { run } from '../../scripts/lib/grammars.ts';

const SCRATCH = join('.build', 'run-probe');
const GRAMMAR = join('tree-sitter', 'asm_x86_gas');

test('run starts in the repository root and captures output larger than a pipe buffer', () => {
  mkdirSync(join(ROOT, SCRATCH), { recursive: true });
  const file = join(SCRATCH, 'large.s');
  const lines = 100_000;
  writeFileSync(join(ROOT, file), 'nop\n'.repeat(lines));
  const { ok, output } = run('tree-sitter', ['parse', '--grammar-path', GRAMMAR, file]);
  assert.ok(ok, output.slice(-500));
  assert.ok(output.length > 1024 * 1024, `only ${output.length} bytes captured`);
  assert.deepStrictEqual(output.match(/\(instruction /g)?.length, lines);
});

test('run reports a failing command and captures its standard error', () => {
  const file = join(SCRATCH, 'missing.s');
  const { ok, output } = run('tree-sitter', ['parse', '--grammar-path', GRAMMAR, file]);
  assert.deepStrictEqual(ok, false);
  assert.match(output, /No files were found/);
});

test('run adds the given environment to the inherited one', () => {
  const { output } = run('tree-sitter', ['generate', '--help'], {
    env: { TREE_SITTER_ABI_VERSION: '14' },
  });
  assert.match(output, /TREE_SITTER_ABI_VERSION=14/);
});
