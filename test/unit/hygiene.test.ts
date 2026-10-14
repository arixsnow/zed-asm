// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT } from '../../scripts/lib/files.ts';
import { repositoryFiles } from '../../scripts/lib/repository.ts';

const TAB_ALLOWED = ['test/corpus/', 'test/fixtures/'];

const contents = repositoryFiles(ROOT).map((path) => ({
  path,
  bytes: readFileSync(join(ROOT, path)),
}));

function offenders(isOffending: (path: string, bytes: Uint8Array) => boolean): string[] {
  return contents.filter(({ path, bytes }) => isOffending(path, bytes)).map(({ path }) => path);
}

test('every repository file is pure ASCII', () => {
  assert.deepStrictEqual(offenders((_, bytes) => bytes.some((byte) => byte > 0x7f)), []);
});

test('hard tabs appear only in test data', () => {
  assert.deepStrictEqual(
    offenders((path, bytes) =>
      !TAB_ALLOWED.some((prefix) => path.startsWith(prefix)) && bytes.includes(0x09)
    ),
    [],
  );
});

test('every file uses LF line endings', () => {
  assert.deepStrictEqual(offenders((_, bytes) => bytes.includes(0x0d)), []);
});

test('every hand-written file ends with a newline', () => {
  assert.deepStrictEqual(
    offenders((path, bytes) =>
      !/^tree-sitter\/[^/]+\/src\//.test(path) &&
      bytes.length > 0 &&
      bytes.at(-1) !== 0x0a
    ),
    [],
  );
});
