// SPDX-License-Identifier: MIT

import { assertEquals, assertThrows } from '@std/assert';
import { emptyDirSync } from '@std/fs';
import { join } from '@std/path';

import { filesUnder, readTextIfExists, ROOT } from '../../scripts/lib/files.ts';

const PROBE = join(ROOT, '.build', 'files-probe');

Deno.test('readTextIfExists returns the text, or undefined when the file is missing', () => {
  emptyDirSync(PROBE);
  try {
    Deno.writeTextFileSync(join(PROBE, 'present.txt'), 'text\n');
    assertEquals(readTextIfExists(join(PROBE, 'present.txt')), 'text\n');
    assertEquals(readTextIfExists(join(PROBE, 'missing.txt')), undefined);
  } finally {
    Deno.removeSync(PROBE, { recursive: true });
  }
});

Deno.test('readTextIfExists does not hide errors other than a missing file', () => {
  emptyDirSync(PROBE);
  try {
    assertThrows(() => readTextIfExists(PROBE), Deno.errors.IsADirectory);
  } finally {
    Deno.removeSync(PROBE, { recursive: true });
  }
});

Deno.test('filesUnder lists nested files relative to the directory, sorted', () => {
  emptyDirSync(PROBE);
  try {
    Deno.mkdirSync(join(PROBE, 'b', 'c'), { recursive: true });
    Deno.writeTextFileSync(join(PROBE, 'b', 'c', 'deep.txt'), '');
    Deno.writeTextFileSync(join(PROBE, 'z.txt'), '');
    Deno.writeTextFileSync(join(PROBE, 'a.txt'), '');
    assertEquals(filesUnder(PROBE), ['a.txt', 'b/c/deep.txt', 'z.txt']);
    assertEquals(filesUnder(join(PROBE, 'missing')), []);
  } finally {
    Deno.removeSync(PROBE, { recursive: true });
  }
});
