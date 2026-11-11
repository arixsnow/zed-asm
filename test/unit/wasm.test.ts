// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';

import { manifest } from '../../scripts/lib/manifest.ts';
import { foreignFunctions, wasmArgs, wasmImports } from '../../scripts/lib/wasm.ts';

const HEADER = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];

function name(text: string): number[] {
  return [text.length, ...new TextEncoder().encode(text)];
}

function section(id: number, payload: number[]): number[] {
  return [id, payload.length, ...payload];
}

const MODULE = Uint8Array.from([
  ...HEADER,
  ...section(1, [1, 0x60, 0, 0]),
  ...section(2, [
    4,
    ...name('env'),
    ...name('strlen'),
    0,
    0,
    ...name('env'),
    ...name('memory'),
    2,
    0,
    1,
    ...name('env'),
    ...name('__stack_pointer'),
    3,
    0x7f,
    1,
    ...name('env'),
    ...name('strchr'),
    0,
    0,
  ]),
]);

test('a wasm module lists its imports with their kinds', () => {
  assert.deepStrictEqual(wasmImports(MODULE), [
    { module: 'env', name: 'strlen', kind: 0 },
    { module: 'env', name: 'memory', kind: 2 },
    { module: 'env', name: '__stack_pointer', kind: 3 },
    { module: 'env', name: 'strchr', kind: 0 },
  ]);
});

test("only functions outside tree-sitter's wasm runtime count as foreign", () => {
  assert.deepStrictEqual(foreignFunctions(MODULE), ['strchr']);
});

test('grammars compile to wasm the way the tree-sitter CLI does', () => {
  for (const { grammar } of manifest.languages) {
    const args = wasmArgs(grammar, 'out.wasm');
    for (
      const flag of ['-shared', '-fPIC', '-nostdlib', '-Wl,--no-entry', '-Wl,--allow-undefined']
    ) {
      assert.ok(args.includes(flag), `${grammar} misses ${flag}`);
    }
    assert.ok(args.includes(`-Wl,--export=tree_sitter_${grammar}`), grammar);
    assert.ok(args.includes(`tree-sitter/${grammar}/src/scanner.c`), grammar);
  }
});

test('a module without an import section imports nothing, and other bytes are refused', () => {
  assert.deepStrictEqual(wasmImports(Uint8Array.from(HEADER)), []);
  assert.throws(() => wasmImports(Uint8Array.from([0x7f, 0x45, 0x4c, 0x46])), /not a wasm module/);
});
