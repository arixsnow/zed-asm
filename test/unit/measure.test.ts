// SPDX-License-Identifier: MIT

import { assertEquals } from '@std/assert';

import { median, readParseTiming, readQueryTime } from '../../scripts/lib/measure.ts';

Deno.test('median picks the middle value of an unsorted list', () => {
  assertEquals(median([30, 10, 20]), 20);
  assertEquals(median([5]), 5);
});

Deno.test('readParseTiming reads the parse time and, after edits, the edit time', () => {
  assertEquals(readParseTiming('big.s\tParse:   62.35 ms\t 10201 bytes/ms\n'), {
    parse: 62.35,
    edit: undefined,
  });
  assertEquals(
    readParseTiming('big.s\tParse:   62.35 ms\t 10201 bytes/ms\n            \tEdit:    15.77 ms\n'),
    { parse: 62.35, edit: 15.77 },
  );
  assertEquals(readParseTiming('Error: No files were found\n'), undefined);
});

Deno.test('readQueryTime reads the execution time tree-sitter prints last', () => {
  assertEquals(readQueryTime('.build/q.s\n40.729237ms\n'), 40.729237);
  assertEquals(readQueryTime('Error: Query compilation failed\n'), undefined);
});
