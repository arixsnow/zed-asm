// SPDX-License-Identifier: MIT

import { assertEquals } from '@std/assert';
import { join } from '@std/path';

import { ROOT } from '../../scripts/lib/files.ts';
import { repositoryFiles } from '../lib/repository.ts';

const TAB_ALLOWED = ['test/corpus/', 'test/fixtures/'];

const contents = repositoryFiles(ROOT).map((path) => ({
  path,
  bytes: Deno.readFileSync(join(ROOT, path)),
}));

function offenders(isOffending: (path: string, bytes: Uint8Array) => boolean): string[] {
  return contents.filter(({ path, bytes }) => isOffending(path, bytes)).map(({ path }) => path);
}

Deno.test('every repository file is pure ASCII', () => {
  assertEquals(offenders((_, bytes) => bytes.some((byte) => byte > 0x7f)), []);
});

Deno.test('hard tabs appear only in test data', () => {
  assertEquals(
    offenders((path, bytes) =>
      !TAB_ALLOWED.some((prefix) => path.startsWith(prefix)) && bytes.includes(0x09)
    ),
    [],
  );
});

Deno.test('every file uses LF line endings', () => {
  assertEquals(offenders((_, bytes) => bytes.includes(0x0d)), []);
});

Deno.test('every hand-written file ends with a newline', () => {
  assertEquals(
    offenders((path, bytes) =>
      !/^tree-sitter\/[^/]+\/src\//.test(path) &&
      bytes.length > 0 &&
      bytes.at(-1) !== 0x0a
    ),
    [],
  );
});
