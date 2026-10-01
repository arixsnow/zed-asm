// SPDX-License-Identifier: MIT

import { assertEquals, assertThrows } from '@std/assert';

import {
  type Capture,
  highlightAt,
  type LanguageConfig,
  type LanguageQueries,
  type MatchCapture,
  type NodeRange,
  placeCursors,
  type Point,
  scopeAt,
  suggestIndent,
  type SyntaxProvider,
  ZedLanguage,
} from '../lib/zed.ts';

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

function point(row: number, column: number): Point {
  return { row, column };
}

const NO_QUERIES: LanguageQueries = { overrides: '', indents: '', brackets: '' };

function fakeSyntax(ranges: [Point, Point][], errors: NodeRange[] = []): SyntaxProvider {
  const matches: MatchCapture[][] = ranges.map(([start, end]) => [{ name: 'indent', start, end }]);
  return (text) => ({
    root: { start: 0, end: new TextEncoder().encode(text).length },
    errors,
    overrides: [],
    indents: () => matches,
  });
}

function suggest(
  lines: string[],
  row: number,
  { ranges = [], config = {}, errors = [] }: {
    ranges?: [Point, Point][];
    config?: LanguageConfig;
    errors?: NodeRange[];
  } = {},
) {
  return suggestIndent(
    lines.join('\n'),
    new ZedLanguage(config, NO_QUERIES),
    fakeSyntax(ranges, errors),
    row,
  );
}

Deno.test('indent ranges that start at the same point merge and keep the later end', () => {
  const ranges: [Point, Point][] = [[point(0, 0), point(2, 0)], [point(0, 0), point(3, 0)]];
  assertEquals(suggest(['a', '    b', 'c', 'd'], 2, { ranges })?.basisRow, 1);
  assertEquals(suggest(['a', '    b', 'c', 'd'], 2, { ranges: [ranges[0]] })?.basisRow, 0);
});

Deno.test('the increase pattern applies only to the line right after the matching one', () => {
  const config = { increase_indent_pattern: '^f:' };
  assertEquals(suggest(['f:', ''], 1, { config })?.delta, 1);
  assertEquals(suggest(['f:', '', 'x'], 2, { config }), {
    basisRow: 0,
    delta: 0,
    withinError: false,
  });
});

Deno.test('a multi-line error marks a row within it unless a pattern decided the row', () => {
  const errors = [{ start: point(0, 0), end: point(2, 2) }];
  assertEquals(suggest(['a', 'b', 'c:'], 2, { errors })?.withinError, true);
  const config = { decrease_indent_pattern: ':$' };
  assertEquals(suggest(['a', 'b', 'c:'], 2, { errors, config })?.withinError, false);
});

Deno.test('a row after blank rows takes the last non-empty row as the previous one', () => {
  assertEquals(suggest(['a', '', 'b'], 2), { basisRow: 0, delta: 0, withinError: false });
});

Deno.test('the model refuses settings and queries whose Zed behaviour it does not reproduce', () => {
  const cases: [LanguageConfig, Partial<LanguageQueries>, string][] = [
    [
      { decrease_indent_patterns: [] } as LanguageConfig,
      {},
      'language setting decrease_indent_patterns',
    ],
    [
      { auto_indent_using_last_non_empty_line: false } as LanguageConfig,
      {},
      'language setting auto_indent_using_last_non_empty_line',
    ],
    [{ overrides: { comment: { word_characters: ['-'] } } } as LanguageConfig, {
      overrides: '(x) @comment',
    }, 'word_characters in the comment scope'],
    [
      { brackets: [{ start: '{', end: '}', close: true, newline: true }] },
      {},
      'brackets with newline = true',
    ],
    [{}, { indents: '(x "}" @end) @indent' }, '@end in indents.scm'],
    [{}, { brackets: '(("(" @open ")" @close) (#set! newline.only))' }, 'bracket query properties'],
    [
      { brackets: [{ start: '"', end: '"', close: true, newline: false, not_in: ['string'] }] },
      {},
      'scope string',
    ],
  ];
  for (const [config, queries, message] of cases) {
    assertThrows(() => new ZedLanguage(config, { ...NO_QUERIES, ...queries }), Error, message);
  }
});
