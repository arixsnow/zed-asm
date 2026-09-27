// SPDX-License-Identifier: MIT

import { assertEquals } from '@std/assert';

import { type Capture, highlightAt, placeCursors, scopeAt } from '../lib/zed.ts';

function capture(name: string, start: number, end: number, inclusive = false): Capture {
  return { name, inclusive, start, end };
}

Deno.test('a character takes the last capture that covers it, end excluded', () => {
  const captures = [capture('constant', 0, 4), capture('keyword', 0, 3)];
  assertEquals([0, 2, 3, 4].map((offset) => highlightAt(captures, offset)), [
    'keyword',
    'keyword',
    'constant',
    null,
  ]);
});

Deno.test('a plain scope contains a cursor strictly between its edges', () => {
  const captures = [capture('string', 2, 5)];
  assertEquals([2, 3, 5].map((offset) => scopeAt(captures, offset)), [null, 'string', null]);
});

Deno.test('an inclusive scope also contains a cursor on either edge', () => {
  const captures = [capture('comment', 2, 5, true)];
  assertEquals([1, 2, 5, 6].map((offset) => scopeAt(captures, offset)), [
    null,
    'comment',
    'comment',
    null,
  ]);
});

Deno.test('the smallest containing scope wins, and the first one on a tie', () => {
  const nested = [capture('preproc', 0, 20, true), capture('comment', 10, 20, true)];
  assertEquals(scopeAt(nested, 20), 'comment');
  assertEquals(scopeAt(nested, 5), 'preproc');
  const tied = [capture('first', 0, 4, true), capture('second', 0, 4, true)];
  assertEquals(scopeAt(tied, 2), 'first');
});

Deno.test('cursor markers are removed and their offsets recorded', () => {
  assertEquals(placeCursors('<|>ab<|>c<|>'), { source: 'abc', cursors: [0, 2, 3] });
  assertEquals(placeCursors('abc'), { source: 'abc', cursors: [] });
});
