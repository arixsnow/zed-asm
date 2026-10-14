// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';

import { assertThrowsIncluding } from '../lib/assert.ts';
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

test('a character takes the last capture that covers it, end excluded', () => {
  const captures = [capture('constant', 0, 4), capture('keyword', 0, 3)];
  assert.deepStrictEqual([0, 2, 3, 4].map((offset) => highlightAt(captures, offset)), [
    'keyword',
    'keyword',
    'constant',
    null,
  ]);
});

test('a plain scope contains a cursor strictly between its edges', () => {
  const captures = [capture('string', 2, 5)];
  assert.deepStrictEqual([2, 3, 5].map((offset) => scopeAt(captures, offset)), [
    null,
    'string',
    null,
  ]);
});

test('an inclusive scope also contains a cursor on either edge', () => {
  const captures = [capture('comment', 2, 5, true)];
  assert.deepStrictEqual([1, 2, 5, 6].map((offset) => scopeAt(captures, offset)), [
    null,
    'comment',
    'comment',
    null,
  ]);
});

test('the smallest containing scope wins, and the first one on a tie', () => {
  const nested = [capture('preproc', 0, 20, true), capture('comment', 10, 20, true)];
  assert.deepStrictEqual(scopeAt(nested, 20), 'comment');
  assert.deepStrictEqual(scopeAt(nested, 5), 'preproc');
  const tied = [capture('first', 0, 4, true), capture('second', 0, 4, true)];
  assert.deepStrictEqual(scopeAt(tied, 2), 'first');
});

test('cursor markers are removed and their offsets recorded', () => {
  assert.deepStrictEqual(placeCursors('<|>ab<|>c<|>'), { source: 'abc', cursors: [0, 2, 3] });
  assert.deepStrictEqual(placeCursors('abc'), { source: 'abc', cursors: [] });
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

test('indent ranges that start at the same point merge and keep the later end', () => {
  const ranges: [Point, Point][] = [[point(0, 0), point(2, 0)], [point(0, 0), point(3, 0)]];
  assert.deepStrictEqual(suggest(['a', '    b', 'c', 'd'], 2, { ranges })?.basisRow, 1);
  assert.deepStrictEqual(
    suggest(['a', '    b', 'c', 'd'], 2, { ranges: [ranges[0]] })?.basisRow,
    0,
  );
});

test('the increase pattern applies only to the line right after the matching one', () => {
  const config = { increase_indent_pattern: '^f:' };
  assert.deepStrictEqual(suggest(['f:', ''], 1, { config })?.delta, 1);
  assert.deepStrictEqual(suggest(['f:', '', 'x'], 2, { config }), {
    basisRow: 0,
    delta: 0,
    withinError: false,
  });
});

test('a multi-line error marks a row within it unless a pattern decided the row', () => {
  const errors = [{ start: point(0, 0), end: point(2, 2) }];
  assert.deepStrictEqual(suggest(['a', 'b', 'c:'], 2, { errors })?.withinError, true);
  const config = { decrease_indent_pattern: ':$' };
  assert.deepStrictEqual(suggest(['a', 'b', 'c:'], 2, { errors, config })?.withinError, false);
});

test('a row after blank rows takes the last non-empty row as the previous one', () => {
  assert.deepStrictEqual(suggest(['a', '', 'b'], 2), { basisRow: 0, delta: 0, withinError: false });
});

test('the model refuses settings and queries whose Zed behavior it does not reproduce', () => {
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
    assertThrowsIncluding(() => new ZedLanguage(config, { ...NO_QUERIES, ...queries }), message);
  }
});
