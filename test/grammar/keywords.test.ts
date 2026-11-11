// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';

import { statementWords, tokenNames } from '../../scripts/lib/indent.ts';
import { commonSources } from '../../scripts/lib/tables.ts';
import { manifest } from '../../scripts/lib/manifest.ts';
import { readGrammar } from '../lib/grammar-sets.ts';

const WRAPPERS = new Set(['TOKEN', 'IMMEDIATE_TOKEN', 'PREC', 'PREC_LEFT', 'PREC_RIGHT']);

interface Rule {
  type: string;
  content?: Rule;
  flags?: string;
}

function caseInsensitiveWord(rule: Rule): boolean {
  let inner = rule;
  while (WRAPPERS.has(inner.type) && inner.content !== undefined) {
    inner = inner.content;
  }
  return inner.type === 'PATTERN' && (inner.flags ?? '').includes('i');
}

test('no grammar lexes a word table: the scanner reads every listed word whole', () => {
  const lexed: string[] = [];
  for (const { grammar } of manifest.languages) {
    const json = readGrammar(grammar) as unknown as { word?: string; rules: Record<string, Rule> };
    if (json.word !== undefined) {
      lexed.push(`${grammar}: word token ${json.word}`);
    }
    for (const [name, rule] of Object.entries(json.rules)) {
      if (caseInsensitiveWord(rule)) {
        lexed.push(`${grammar}: ${name}`);
      }
    }
  }
  assert.deepStrictEqual(lexed, []);
});

test("every directive shape in a dialect's tables is a token its grammar reads", () => {
  const sources = commonSources();
  const scanner = sources.scanner;
  const tokens = tokenNames(scanner);
  const unread: string[] = [];
  for (const { grammar, dialect } of manifest.languages) {
    const json = readGrammar(grammar) as unknown as {
      externals: { name: string }[];
      rules: unknown;
    };
    assert.deepStrictEqual(
      json.externals.length,
      tokens.length,
      `${grammar}: one external per token`,
    );
    const rules = JSON.stringify(json.rules);
    for (const { name, symbol } of statementWords(sources, dialect)) {
      const external = json.externals[tokens.indexOf(symbol)]?.name;
      if (external === undefined || !rules.includes(`"name":"${external}"`)) {
        unread.push(`${grammar}: ${name} ${symbol}`);
      }
    }
  }
  assert.deepStrictEqual(unread, []);
});
