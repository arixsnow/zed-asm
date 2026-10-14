// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';

import { shellScripts } from '../../scripts/check-shell.ts';
import { ROOT } from '../../scripts/lib/files.ts';

test('shellcheck covers every shell script in the repository', () => {
  assert.deepStrictEqual(shellScripts(ROOT).sort(), ['scripts/dev', 'scripts/zed']);
});
