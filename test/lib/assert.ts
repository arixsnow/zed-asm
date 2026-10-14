// SPDX-License-Identifier: MIT

import assert from 'node:assert/strict';

export function assertThrowsIncluding(action: () => unknown, text: string): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof Error, `expected an Error, got ${String(error)}`);
    assert.ok(error.message.includes(text), `"${error.message}" does not include "${text}"`);
    return true;
  });
}
