// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT } from '../../scripts/lib/files.ts';
import { generatedMatcher, repositoryFiles } from '../../scripts/lib/repository.ts';

const SPDX = 'SPDX-License-Identifier: MIT';
const SOURCE = /\.(c|h|js|cjs|ts)$/;

function isScript(path: string): boolean {
  return readFileSync(join(ROOT, path), 'utf8').startsWith('#!');
}

test('every hand-written source file declares its license in its first two lines', () => {
  const isGenerated = generatedMatcher(ROOT);
  const missing = repositoryFiles(ROOT)
    .filter((path) => SOURCE.test(path) || isScript(path))
    .filter((path) => !isGenerated(path))
    .filter((path) => {
      const head = readFileSync(join(ROOT, path), 'utf8').split('\n', 2);
      return !head.some((line) => line.includes(SPDX));
    });
  assert.deepStrictEqual(missing, []);
});
