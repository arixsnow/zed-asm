// SPDX-License-Identifier: MIT

import { assert, assertEquals, assertThrows } from '@std/assert';
import { createRequire } from 'node:module';

import { manifest } from '../../scripts/lib/manifest.ts';

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

function rulesOf(grammarName: string): string[] {
  return Object.keys(defineGrammar(grammarName).rules);
}

Deno.test('every language composes a grammar named after it that starts at source_file', () => {
  for (const { grammar } of manifest.languages) {
    const composed = defineGrammar(grammar);
    assertEquals(composed.name, grammar);
    assertEquals(Object.keys(composed.rules)[0], 'source_file');
    assertEquals(composed.externals($).map((symbol: RuleNode) => symbol.name), [
      'line_comment',
      'preproc_directive',
      '_hash',
      '_at_attached',
      '_at_type',
      '_separator',
      '_string_content',
      'preproc_argument',
      '_preproc_line_end',
      '_preproc_include',
      '_header_name',
      '_missing_operand',
      '_missing_expression',
      '_unclosed',
      '_error_sentinel',
    ]);
  }
});

Deno.test('modules contribute rules only to the languages that include them', () => {
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
      assert(rules.includes(name), `${grammarName} should define ${name}`);
    }
    for (const name of absent) {
      assert(!rules.includes(name), `${grammarName} should not define ${name}`);
    }
  }
});

Deno.test('choice points merge alternatives from every module without duplicates', () => {
  const operand: RuleNode = defineGrammar('asm_auto').rules._operand($);
  const names = (operand.members ?? []).map((member) => member.name);
  assertEquals(names.filter((name) => name === 'immediate').length, 1);
  for (const name of ['_expression', 'string', 'symbol_type', 'shift', 'register']) {
    assert(names.includes(name), `_operand should offer ${name}`);
  }
});

Deno.test('symbol types after @ exist only in grammars that include x86', () => {
  const hasAtForm: Record<string, boolean> = {};
  for (const { grammar } of manifest.languages.filter(({ syntax }) => syntax === 'gas')) {
    const rule = defineGrammar(grammar).rules.symbol_type($);
    hasAtForm[grammar] = JSON.stringify(rule).includes('"_at_type"');
  }
  assertEquals(hasAtForm, {
    asm_auto: true,
    asm_arm: false,
    asm_arm_apple: false,
    asm_x86_gas: true,
  });
});

Deno.test('an unknown grammar name fails with a clear message', () => {
  assertThrows(
    () => defineGrammar('asm_mips'),
    Error,
    'languages.config.cjs declares no language with grammar "asm_mips"',
  );
});

Deno.test('a module missing from the registry fails with a clear message', () => {
  const catalog = [{ grammar: 'asm_fake', syntax: 'gas', archs: ['mips'] }];
  assertThrows(
    () => defineGrammar('asm_fake', catalog),
    Error,
    'unknown module "mips" for grammar "asm_fake"',
  );
});
