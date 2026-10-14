// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';

import { median, readParseTiming, readQueryTime } from '../../scripts/lib/measure.ts';

function assertAlmostEquals(actual: number, expected: number): void {
  const tolerance = Math.abs(expected * 1e-7);
  assert.ok(
    Math.abs(expected - actual) <= tolerance,
    `${actual} is not within ${tolerance} of ${expected}`,
  );
}

test('median picks the middle value of an unsorted list', () => {
  assert.deepStrictEqual(median([30, 10, 20]), 20);
  assert.deepStrictEqual(median([5]), 5);
});

test('readParseTiming reads the parse time and, after edits, the edit time', () => {
  assert.deepStrictEqual(readParseTiming('big.s\tParse:   62.35 ms\t 10201 bytes/ms\n'), {
    parse: 62.35,
    edit: undefined,
  });
  assert.deepStrictEqual(
    readParseTiming('big.s\tParse:   62.35 ms\t 10201 bytes/ms\n            \tEdit:    15.77 ms\n'),
    { parse: 62.35, edit: 15.77 },
  );
  assert.deepStrictEqual(readParseTiming('Error: No files were found\n'), undefined);
});

test('readQueryTime reads the execution time tree-sitter prints last, in milliseconds', () => {
  assert.deepStrictEqual(readQueryTime('.build/q.s\n40.729237ms\n'), 40.729237);
  assertAlmostEquals(readQueryTime('.build/q.s\n7.683\u00b5s\n') ?? Number.NaN, 0.007683);
  assertAlmostEquals(readQueryTime('.build/q.s\n3.470123107s\n') ?? Number.NaN, 3470.123107);
  assertAlmostEquals(readQueryTime('.build/q.s\n850ns\n') ?? Number.NaN, 0.00085);
  assert.deepStrictEqual(readQueryTime('Error: Query compilation failed\n'), undefined);
});
