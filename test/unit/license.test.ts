// SPDX-License-Identifier: MIT

import { assertEquals } from '@std/assert';
import { join } from '@std/path';

import { ROOT } from '../../scripts/lib/files.ts';
import { generatedMatcher, repositoryFiles } from '../../scripts/lib/repository.ts';

const SPDX = 'SPDX-License-Identifier: MIT';
const SOURCE = /\.(c|h|js|cjs|ts)$/;

function isScript(path: string): boolean {
  return Deno.readTextFileSync(join(ROOT, path)).startsWith('#!');
}

Deno.test('every hand-written source file declares its license in its first two lines', () => {
  const isGenerated = generatedMatcher(ROOT);
  const missing = repositoryFiles(ROOT)
    .filter((path) => SOURCE.test(path) || isScript(path))
    .filter((path) => !isGenerated(path))
    .filter((path) => {
      const head = Deno.readTextFileSync(join(ROOT, path)).split('\n', 2);
      return !head.some((line) => line.includes(SPDX));
    });
  assertEquals(missing, []);
});
