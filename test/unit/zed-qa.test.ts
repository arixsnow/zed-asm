// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT } from '../../scripts/lib/files.ts';
import { manifest } from '../../scripts/lib/manifest.ts';
import { CHECKS, formatReport, LOG_ROW, logErrors, wasmArgs } from '../../scripts/zed-qa.ts';

test('every row of docs/qa.md has an automated check', () => {
  const rows = readFileSync(join(ROOT, 'docs', 'qa.md'), 'utf8')
    .split('\n')
    .map((line) => /^\|\s*(\d+)\s*\|/.exec(line)?.[1])
    .filter((row) => row !== undefined)
    .map(Number);
  assert.ok(rows.length > 0, 'docs/qa.md lists no checks');
  const automated = new Set([...CHECKS.map(({ row }) => row), LOG_ROW]);
  assert.deepStrictEqual(rows.filter((row) => !automated.has(row)), []);
  assert.deepStrictEqual([...automated].filter((row) => !rows.includes(row)), []);
});

test('each check has its own id and its own file', () => {
  assert.deepStrictEqual(new Set(CHECKS.map(({ id }) => id)).size, CHECKS.length);
  assert.deepStrictEqual(new Set(CHECKS.map(({ file }) => file)).size, CHECKS.length);
});

test('a check is either compared with an expected result or left for a look', () => {
  for (const check of CHECKS) {
    assert.deepStrictEqual(check.expect === undefined, check.look !== undefined, check.id);
    assert.deepStrictEqual(check.expect === undefined, check.wants === undefined, check.id);
  }
});

test('the report names the Zed version and aligns the check ids', () => {
  assert.deepStrictEqual(
    formatReport('Zed 1.21.0', [
      { id: '7a', title: 'Enter', status: 'PASS', detail: 'ok' },
      { id: '13b', title: 'Close', status: 'FAIL', detail: 'got "x"' },
    ]),
    'Zed 1.21.0\nPASS  7a   Enter: ok\nFAIL  13b  Close: got "x"\n',
  );
});

test('log lines count only when they are errors or warnings about the extension', () => {
  const log = [
    '2026-09-26T14:47:16+00:00 ERROR [extension_host] failed to load grammar asm_arm',
    '2026-09-26T14:47:16+00:00 WARN  [language] invalid query for Assembly',
    '2026-09-26T14:47:16+00:00 INFO  [language] loaded Assembly',
    '2026-09-26T14:47:17+00:00 ERROR [client] DBus error: org.freedesktop.secrets not provided',
    '2026-09-26T14:47:17+00:00 ERROR [agent] fetch failed: dns error',
  ].join('\n');
  assert.deepStrictEqual(logErrors(log).length, 2);
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
