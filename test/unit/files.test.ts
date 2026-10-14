// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { emptyDir, filesUnder, readTextIfExists, ROOT } from '../../scripts/lib/files.ts';

const PROBE = join(ROOT, '.build', 'files-probe');

test('readTextIfExists returns the text, or undefined when the file is missing', () => {
  emptyDir(PROBE);
  try {
    writeFileSync(join(PROBE, 'present.txt'), 'text\n');
    assert.deepStrictEqual(readTextIfExists(join(PROBE, 'present.txt')), 'text\n');
    assert.deepStrictEqual(readTextIfExists(join(PROBE, 'missing.txt')), undefined);
  } finally {
    rmSync(PROBE, { recursive: true });
  }
});

test('readTextIfExists does not hide errors other than a missing file', () => {
  emptyDir(PROBE);
  try {
    assert.throws(() => readTextIfExists(PROBE), { code: 'EISDIR' });
  } finally {
    rmSync(PROBE, { recursive: true });
  }
});

test('filesUnder lists nested files relative to the directory, sorted', () => {
  emptyDir(PROBE);
  try {
    mkdirSync(join(PROBE, 'b', 'c'), { recursive: true });
    writeFileSync(join(PROBE, 'b', 'c', 'deep.txt'), '');
    writeFileSync(join(PROBE, 'z.txt'), '');
    writeFileSync(join(PROBE, 'a.txt'), '');
    assert.deepStrictEqual(filesUnder(PROBE), ['a.txt', 'b/c/deep.txt', 'z.txt']);
    assert.deepStrictEqual(filesUnder(join(PROBE, 'missing')), []);
  } finally {
    rmSync(PROBE, { recursive: true });
  }
});
