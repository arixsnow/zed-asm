// SPDX-License-Identifier: MIT

import { assert, assertEquals, assertThrows } from '@std/assert';

import { type Grammar, GrammarSets, lexes, type Rule, tokenPattern } from '../lib/grammar-sets.ts';

const string = (value: string): Rule => ({ type: 'STRING', value });
const pattern = (value: string): Rule => ({ type: 'PATTERN', value });
const symbol = (name: string): Rule => ({ type: 'SYMBOL', name });
const seq = (...members: Rule[]): Rule => ({ type: 'SEQ', members });
const choice = (...members: Rule[]): Rule => ({ type: 'CHOICE', members });

Deno.test('token patterns escape strings and compose sequences, choices and repeats', () => {
  assertEquals(tokenPattern(string('a.+(')), 'a\\.\\+\\(');
  assertEquals(
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
  assertEquals(tokenPattern({ type: 'REPEAT1', content: string('x') }), '(?:x)+');
  assertThrows(() => tokenPattern(symbol('word')), Error, 'a token cannot contain SYMBOL');
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

Deno.test('first sets see through left recursion and keep external tokens apart', () => {
  const operand = new GrammarSets(TOY).first.get('operand');
  assertEquals(operand?.terminals.size, 2);
  assertEquals([...(operand?.externals ?? [])], ['_hash']);
  assertEquals(operand?.nullable, false);
  assert(lexes(operand!, 'ab'));
  assert(lexes(operand!, '(x'));
  assert(!lexes(operand!, 'x'));
});

Deno.test('continuations are the tokens that can extend a complete construct', () => {
  const next = new GrammarSets(TOY).continuations('expression');
  assertEquals([...next.externals], []);
  assert(lexes(next, '==a'));
  assert(lexes(next, ')'));
  assert(lexes(next, '!'));
  assert(!lexes(next, '=a'));
  assert(!lexes(next, 'a'));
});
