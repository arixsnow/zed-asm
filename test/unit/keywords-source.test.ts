// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { basename, dirname } from 'node:path';

import {
  bracedBody,
  initializerElements,
  leadingString,
  withoutComments,
  withoutPreprocessorLines,
} from '../../scripts/lib/keywords/c-source.ts';
import {
  Keywords,
  project,
  section,
  writtenCases,
  writtenNames,
} from '../../scripts/lib/keywords/source.ts';
import { assertThrowsIncluding } from '../lib/assert.ts';
import { sourceTree } from '../lib/keyword-sources.ts';

const COMMIT = 'a'.repeat(40);
const OTHER_COMMIT = 'b'.repeat(40);

test('withoutComments drops comments and keeps what quotes hold', () => {
  assert.strictEqual(withoutComments('a // b\nc /* d */ e'), 'a  \nc   e');
  assert.strictEqual(withoutComments('"// no" /* x */'), '"// no"  ');
  assert.strictEqual(withoutComments(`'"' /* x */ "\\"/*"`), `'"'   "\\"/*"`);
  assert.strictEqual(withoutComments("'\\'' // x"), "'\\''  ");
});

test('withoutComments stops on an unterminated literal or comment', () => {
  assertThrowsIncluding(() => withoutComments('"open'), 'unterminated " literal');
  assertThrowsIncluding(() => withoutComments("'open"), "unterminated ' literal");
  assertThrowsIncluding(() => withoutComments('/* open'), 'unterminated comment');
});

test('bracedBody finds the brace that closes the first one, past nesting and quotes', () => {
  assert.strictEqual(bracedBody('x { a { b } "}" } y { z }', 0), ' a { b } "}" ');
  assert.strictEqual(bracedBody('{ a } { b }', 1), ' b ');
  assert.strictEqual(bracedBody("{ '}' }", 0), " '}' ");
});

test('bracedBody stops without a brace or a balance', () => {
  assertThrowsIncluding(() => bracedBody('none', 0), 'no opening brace');
  assertThrowsIncluding(() => bracedBody('{ { }', 0), 'unbalanced braces');
});

test('withoutPreprocessorLines removes directives with their continuation lines', () => {
  assert.strictEqual(withoutPreprocessorLines('#if A\nint x;\n  #endif\n'), '\nint x;\n\n');
  assert.strictEqual(withoutPreprocessorLines('#define A \\\n  { 1 }\nint x;\n'), '\nint x;\n');
  assert.strictEqual(withoutPreprocessorLines('# define B \\\n  1 \\\n  2\n'), '\n');
  assert.strictEqual(withoutPreprocessorLines('int a; # not\n'), 'int a; # not\n');
});

test('initializerElements splits on the commas of its own level', () => {
  assert.deepStrictEqual(initializerElements('{ "a,b", 1 }, { c(1, 2), d }, e,'), [
    '{ "a,b", 1 }',
    '{ c(1, 2), d }',
    'e',
  ]);
  assert.deepStrictEqual(initializerElements(" ',' , [1, 2] "), ["','", '[1, 2]']);
  assert.deepStrictEqual(initializerElements(''), []);
});

test('leadingString reads the first string of a brace or a call, joining adjacent ones', () => {
  assert.strictEqual(leadingString('{"a" "b", c}'), 'ab');
  assert.strictEqual(leadingString('{ "a" }'), 'a');
  assert.strictEqual(leadingString('FOO ("x", y)'), 'x');
  assert.strictEqual(leadingString('{x, "y"}'), undefined);
  assert.strictEqual(leadingString('"z"'), undefined);
});

test('section returns the text between its two marks', () => {
  assert.strictEqual(section('a [ b ] c ]', /\[/, /\]/, 'it'), ' b ');
  assertThrowsIncluding(() => section('a', /\[/, /\]/, 'it'), 'no it');
  assertThrowsIncluding(() => section('[ a', /\[/, /\]/, 'it'), 'it does not end');
});

test('Keywords takes lower-case words, merges tags and lists in byte order', () => {
  const table = new Keywords();
  table.add('add', 'b', 'a');
  table.add('add', 'c', 'a');
  table.add('__x');
  table.add('.y');
  table.add('Z'.toLowerCase());
  assert.deepStrictEqual(table.entries(), [
    ['.y', []],
    ['__x', []],
    ['add', ['a', 'b', 'c']],
    ['z', []],
  ]);
  assert.strictEqual(table.size, 4);
  assert.ok(table.has('add'));
  table.delete('add');
  assert.ok(!table.has('add'));
  const merged = new Keywords();
  merged.add('.y', 'tag');
  merged.addAll(table);
  assert.deepStrictEqual(merged.entries()[0], ['.y', ['tag']]);
});

test('Keywords stops on a word that is not lower-case ASCII', () => {
  assertThrowsIncluding(() => new Keywords().add('Add'), 'is not a lower-case ASCII word');
  assertThrowsIncluding(() => new Keywords().add('a b'), 'is not a lower-case ASCII word');
  assertThrowsIncluding(() => new Keywords().add(''), 'is not a lower-case ASCII word');
});

test('writtenCases tags the cases a list does not spell', () => {
  assert.deepStrictEqual(
    [...writtenCases(['got', 'GOT', 'PLT', 'tls', '123'], 'source', 'list')],
    [
      ['got', ['source:no-mixed-case']],
      ['plt', ['source:no-mixed-case', 'source:no-lower-case']],
      ['tls', ['source:no-mixed-case', 'source:no-upper-case']],
      ['123', ['source:no-mixed-case']],
    ],
  );
  assertThrowsIncluding(() => writtenCases(['Got'], 'source', 'list'), 'list: "Got"');
});

test('writtenNames gives the same rows as a table', () => {
  assert.deepStrictEqual(writtenNames(['b', 'A'], 'source', 'list').entries(), [
    ['a', ['source:no-lower-case', 'source:no-mixed-case']],
    ['b', ['source:no-mixed-case', 'source:no-upper-case']],
  ]);
});

function resolved(scratch: string, files: Record<string, string>): string {
  const { path } = sourceTree(scratch, files);
  return project(dirname(path), basename(path)).commit;
}

test('project resolves the commit of a detached head, a loose ref and a packed ref', () => {
  assert.strictEqual(resolved('project-detached', { '.git/HEAD': `${COMMIT}\n` }), COMMIT);
  assert.strictEqual(
    resolved('project-loose', {
      '.git/HEAD': 'ref: refs/heads/main\n',
      '.git/refs/heads/main': `${COMMIT}\n`,
      '.git/packed-refs': `${OTHER_COMMIT} refs/heads/main\n`,
    }),
    COMMIT,
  );
  assert.strictEqual(
    resolved('project-packed', {
      '.git/HEAD': 'ref: refs/heads/main\n',
      '.git/packed-refs': `# pack-refs\n${OTHER_COMMIT} refs/tags/x\n${COMMIT} refs/heads/main\n`,
    }),
    COMMIT,
  );
});

test('project stops on a ref it cannot resolve or a head that is no commit', () => {
  assertThrowsIncluding(
    () => resolved('project-missing', { '.git/HEAD': 'ref: refs/heads/main\n' }),
    'cannot resolve refs/heads/main',
  );
  assertThrowsIncluding(
    () => resolved('project-short', { '.git/HEAD': 'abc\n' }),
    'is not a commit hash',
  );
});
