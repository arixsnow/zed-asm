// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { manifest } from '../../scripts/lib/manifest.ts';
import { assertThrowsIncluding } from '../lib/assert.ts';

interface RuleNode {
  type: string;
  name?: string;
  members?: RuleNode[];
}

function node(type: string) {
  return (...members: RuleNode[]): RuleNode => ({ type, members });
}

Object.assign(globalThis, {
  grammar: (config: unknown) => config,
  seq: node('SEQ'),
  choice: node('CHOICE'),
  repeat: node('REPEAT'),
  repeat1: node('REPEAT1'),
  optional: node('OPTIONAL'),
  alias: node('ALIAS'),
  field: node('FIELD'),
  token: Object.assign(node('TOKEN'), { immediate: node('IMMEDIATE_TOKEN') }),
  prec: Object.assign(node('PREC'), { left: node('PREC_LEFT'), right: node('PREC_RIGHT') }),
});

const defineGrammar = createRequire(import.meta.url)('../../tree-sitter/common/define-grammar.js');
const $ = new Proxy({}, {
  get: (_target, name): RuleNode => ({ type: 'SYMBOL', name: String(name) }),
});

const SCANNER_TOKENS = /enum TokenType \{([^}]*)\}/.exec(
  readFileSync(new URL('../../tree-sitter/common/scanner.h', import.meta.url), 'utf8'),
)![1].split(',').map((name) => name.trim()).filter((name) => name !== '');

function rulesOf(grammarName: string): string[] {
  return Object.keys(defineGrammar(grammarName).rules);
}

test('every language composes a grammar named after it that starts at source_file', () => {
  for (const { grammar } of manifest.languages) {
    const composed = defineGrammar(grammar);
    assert.deepStrictEqual(composed.name, grammar);
    assert.deepStrictEqual(Object.keys(composed.rules)[0], 'source_file');
    assert.deepStrictEqual(
      composed.externals($).map((symbol: RuleNode) =>
        String(symbol.name).replace(/^_/, '').toUpperCase()
      ),
      SCANNER_TOKENS,
    );
  }
});

test('modules contribute rules only to the languages that include them', () => {
  const expectations: Record<string, { present: string[]; absent: string[] }> = {
    asm_auto: { present: ['shift', 'register', 'directive'], absent: [] },
    asm_arm: { present: ['shift', 'directive'], absent: ['register'] },
    asm_arm_apple: { present: ['shift', 'directive'], absent: ['register'] },
    asm_x86_gas: { present: ['register', 'directive'], absent: ['shift'] },
    asm_x86_nasm: { present: ['string'], absent: ['shift', 'register', 'directive', 'immediate'] },
  };
  for (const [grammarName, { present, absent }] of Object.entries(expectations)) {
    const rules = rulesOf(grammarName);
    for (const name of present) {
      assert.ok(rules.includes(name), `${grammarName} should define ${name}`);
    }
    for (const name of absent) {
      assert.ok(!rules.includes(name), `${grammarName} should not define ${name}`);
    }
  }
});

test('choice points merge alternatives from every module without duplicates', () => {
  const rules = defineGrammar('asm_auto').rules;
  const members = (name: string) =>
    ((rules[name]($) as RuleNode).members ?? []).map((member) =>
      member.name ?? member.members?.find((inner) => inner.name)?.name
    );
  const value = members('_value');
  assert.deepStrictEqual(value.filter((name) => name === 'immediate').length, 1);
  for (const name of ['_expression', 'string', 'symbol_type', 'register']) {
    assert.ok(value.includes(name), `_value should offer ${name}`);
  }
  const operand = members('_operand');
  for (const name of ['_value', 'keyword_argument']) {
    assert.ok(operand.includes(name), `_operand should offer ${name}`);
  }
  const instructionOperand = members('_instruction_operand');
  for (const name of ['_operand', 'shift', 'memory_operand', 'register_list', 'literal_pool']) {
    assert.ok(instructionOperand.includes(name), `_instruction_operand should offer ${name}`);
  }
});

test('symbol types after @ exist only in grammars that include x86', () => {
  const hasAtForm: Record<string, boolean> = {};
  for (const { grammar } of manifest.languages.filter(({ syntax }) => syntax === 'gas')) {
    const rule = defineGrammar(grammar).rules.symbol_type($);
    hasAtForm[grammar] = JSON.stringify(rule).includes('"_at_type"');
  }
  assert.deepStrictEqual(hasAtForm, {
    asm_auto: true,
    asm_arm: false,
    asm_arm_apple: false,
    asm_x86_gas: true,
  });
});

test('an unknown grammar name fails with a clear message', () => {
  assertThrowsIncluding(
    () => defineGrammar('asm_mips'),
    'languages.config.cjs declares no language with grammar "asm_mips"',
  );
});

test('a module missing from the registry fails with a clear message', () => {
  const catalog = [{ grammar: 'asm_fake', syntax: 'gas', archs: ['mips'] }];
  assertThrowsIncluding(
    () => defineGrammar('asm_fake', catalog),
    'unknown module "mips" for grammar "asm_fake"',
  );
});
