// SPDX-License-Identifier: MIT

import { assert, assertEquals } from '@std/assert';
import { join } from '@std/path';

import { ROOT } from '../../scripts/lib/files.ts';
import { manifest } from '../../scripts/lib/manifest.ts';
import { CHECKS, formatReport, LOG_ROW, logErrors, wasmArgs } from '../../scripts/zed-qa.ts';

Deno.test('every row of docs/qa.md has an automated check', () => {
  const rows = Deno.readTextFileSync(join(ROOT, 'docs', 'qa.md'))
    .split('\n')
    .map((line) => /^\|\s*(\d+)\s*\|/.exec(line)?.[1])
    .filter((row) => row !== undefined)
    .map(Number);
  assert(rows.length > 0, 'docs/qa.md lists no checks');
  const automated = new Set([...CHECKS.map(({ row }) => row), LOG_ROW]);
  assertEquals(rows.filter((row) => !automated.has(row)), []);
  assertEquals([...automated].filter((row) => !rows.includes(row)), []);
});

Deno.test('each check has its own id and its own file', () => {
  assertEquals(new Set(CHECKS.map(({ id }) => id)).size, CHECKS.length);
  assertEquals(new Set(CHECKS.map(({ file }) => file)).size, CHECKS.length);
});

Deno.test('a check is either compared with an expected result or left for a look', () => {
  for (const check of CHECKS) {
    assertEquals(check.expect === undefined, check.look !== undefined, check.id);
    assertEquals(check.expect === undefined, check.wants === undefined, check.id);
  }
});

Deno.test('the report names the Zed version and aligns the check ids', () => {
  assertEquals(
    formatReport('Zed 1.21.0', [
      { id: '7a', title: 'Enter', status: 'PASS', detail: 'ok' },
      { id: '13b', title: 'Close', status: 'FAIL', detail: 'got "x"' },
    ]),
    'Zed 1.21.0\nPASS  7a   Enter: ok\nFAIL  13b  Close: got "x"\n',
  );
});

Deno.test('log lines count only when they are errors or warnings about the extension', () => {
  const log = [
    '2026-09-26T14:47:16+00:00 ERROR [extension_host] failed to load grammar asm_arm',
    '2026-09-26T14:47:16+00:00 WARN  [language] invalid query for Assembly',
    '2026-09-26T14:47:16+00:00 INFO  [language] loaded Assembly',
    '2026-09-26T14:47:17+00:00 ERROR [client] DBus error: org.freedesktop.secrets not provided',
    '2026-09-26T14:47:17+00:00 ERROR [agent] fetch failed: dns error',
  ].join('\n');
  assertEquals(logErrors(log).length, 2);
});

Deno.test('grammars compile to wasm the way the tree-sitter CLI does', () => {
  for (const { grammar } of manifest.languages) {
    const args = wasmArgs(grammar, 'out.wasm');
    for (
      const flag of ['-shared', '-fPIC', '-nostdlib', '-Wl,--no-entry', '-Wl,--allow-undefined']
    ) {
      assert(args.includes(flag), `${grammar} misses ${flag}`);
    }
    assert(args.includes(`-Wl,--export=tree_sitter_${grammar}`), grammar);
    assert(args.includes(`tree-sitter/${grammar}/src/scanner.c`), grammar);
  }
});
