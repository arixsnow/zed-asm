// SPDX-License-Identifier: MIT

import { assertEquals } from '@std/assert';

import { shellScripts } from '../../scripts/check-shell.ts';
import { ROOT } from '../../scripts/lib/files.ts';

Deno.test('shellcheck covers every shell script in the repository', () => {
  assertEquals(shellScripts(ROOT).sort(), ['scripts/dev', 'scripts/zed']);
});
