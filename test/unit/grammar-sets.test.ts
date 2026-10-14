// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';

import { assertThrowsIncluding } from '../lib/assert.ts';
import { type Grammar, GrammarSets, lexes, type Rule, tokenPattern } from '../lib/grammar-sets.ts';

const string = (value: string): Rule => ({ type: 'STRING', value });
const pattern = (value: string): Rule => ({ type: 'PATTERN', value });
const symbol = (name: string): Rule => ({ type: 'SYMBOL', name });
const seq = (...members: Rule[]): Rule => ({ type: 'SEQ', members });
const choice = (...members: Rule[]): Rule => ({ type: 'CHOICE', members });

test('token patterns escape strings and compose sequences, choices and repeats', () => {
  assert.deepStrictEqual(tokenPattern(string('a.+(')), 'a\\.\\+\\(');
  assert.deepStrictEqual(
    tokenPattern({
      type: 'TOKEN',
      content: {
        type: 'PREC',
        value: 2,
        content: seq(string('%'), choice(pattern('[a-z]+'), { type: 'BLANK' })),
      },
    }),
    '%(?:(?:[a-z]+)|)',
  );
  assert.deepStrictEqual(tokenPattern({ type: 'REPEAT1', content: string('x') }), '(?:x)+');
  assertThrowsIncluding(() => tokenPattern(symbol('word')), 'a token cannot contain SYMBOL');
});

const TOY: Grammar = {
  externals: [symbol('_hash')],
  rules: {
    operand: choice(symbol('expression'), seq(symbol('_hash'), symbol('expression'))),
    expression: choice(
      symbol('word'),
      seq(symbol('expression'), string('=='), symbol('expression')),
      seq(
        string('('),
        symbol('expression'),
        choice(string(')'), { type: 'BLANK' }),
        { type: 'REPEAT', content: string('!') },
      ),
    ),
    word: { type: 'TOKEN', content: pattern('[a-c]+') },
  },
};

test('first sets see through left recursion and keep external tokens apart', () => {
  const operand = new GrammarSets(TOY).first.get('operand');
  assert.deepStrictEqual(operand?.terminals.size, 2);
  assert.deepStrictEqual([...(operand?.externals ?? [])], ['_hash']);
  assert.deepStrictEqual(operand?.nullable, false);
  assert.ok(lexes(operand!, 'ab'));
  assert.ok(lexes(operand!, '(x'));
  assert.ok(!lexes(operand!, 'x'));
});

test('continuations are the tokens that can extend a complete construct', () => {
  const next = new GrammarSets(TOY).continuations('expression');
  assert.deepStrictEqual([...next.externals], []);
  assert.ok(lexes(next, '==a'));
  assert.ok(lexes(next, ')'));
  assert.ok(lexes(next, '!'));
  assert.ok(!lexes(next, '=a'));
  assert.ok(!lexes(next, 'a'));
});
