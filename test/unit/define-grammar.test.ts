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
    value?: unknown;
    named?: boolean;
    content?: RuleNode;
    members?: RuleNode[];
}

function members(type: string) {
    return (...rules: RuleNode[]): RuleNode => ({ type, members: rules });
}

function wrapper(type: string) {
    return (content: RuleNode): RuleNode => ({ type, content });
}

function precedence(type: string) {
    return (value: number | RuleNode, content?: RuleNode): RuleNode =>
        content === undefined
            ? { type, value: 0, content: value as RuleNode }
            : { type, value, content };
}

Object.assign(globalThis, {
    grammar: (config: unknown) => config,
    seq: members('SEQ'),
    choice: members('CHOICE'),
    repeat: wrapper('REPEAT'),
    repeat1: wrapper('REPEAT1'),
    optional: (content: RuleNode): RuleNode => ({
        type: 'CHOICE',
        members: [content, { type: 'BLANK' }],
    }),
    alias: (content: RuleNode, value: RuleNode | string): RuleNode =>
        typeof value === 'string'
            ? { type: 'ALIAS', content, named: false, value }
            : { type: 'ALIAS', content, named: true, value: value.name },
    field: (name: string, content: RuleNode): RuleNode => ({ type: 'FIELD', name, content }),
    token: Object.assign(wrapper('TOKEN'), { immediate: wrapper('IMMEDIATE_TOKEN') }),
    prec: Object.assign(precedence('PREC'), {
        left: precedence('PREC_LEFT'),
        right: precedence('PREC_RIGHT'),
        dynamic: precedence('PREC_DYNAMIC'),
    }),
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
        asm_auto: { present: ['shift', 'indirect', 'directive'], absent: [] },
        asm_arm: { present: ['shift', 'directive'], absent: ['indirect'] },
        asm_arm_apple: { present: ['shift', 'directive'], absent: ['indirect'] },
        asm_x86_gas: { present: ['indirect', 'directive'], absent: ['shift'] },
        asm_x86_nasm: {
            present: ['string', 'directive', 'times'],
            absent: ['shift', 'indirect', 'immediate'],
        },
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
            member.name ?? member.content?.name
        );
    const value = members('_value');
    assert.deepStrictEqual(value.filter((name) => name === 'immediate').length, 1);
    for (const name of ['_expression', 'string', 'symbol_type', '_register']) {
        assert.ok(value.includes(name), `_value should offer ${name}`);
    }
    const operand = members('_operand');
    for (const name of ['_value', 'keyword_argument']) {
        assert.ok(operand.includes(name), `_operand should offer ${name}`);
    }
    const instructionOperand = members('_instruction_operand');
    for (const name of ['_value', 'shift', 'memory_operand', 'register_list', 'literal_pool']) {
        assert.ok(instructionOperand.includes(name), `_instruction_operand should offer ${name}`);
    }
    assert.ok(
        !instructionOperand.includes('keyword_argument') &&
            !instructionOperand.includes('_operand'),
        'keyword arguments belong to macro calls, not to instruction operands',
    );
});

test('symbol types after @ exist only in grammars that include x86', () => {
    const hasAtForm: Record<string, boolean> = {};
    for (const { grammar } of manifest.languages.filter(({ syntax }) => syntax === 'gas')) {
        const rule = defineGrammar(grammar).rules.symbol_type($);
        hasAtForm[grammar] = JSON.stringify(rule).includes('"@"');
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

test('an architecture module for one syntax joins only the grammars of that syntax', () => {
    assert.ok(rulesOf('asm_x86_gas').includes('_att_memory'));
    assert.ok(rulesOf('asm_auto').includes('_att_memory'));
    assert.ok(!rulesOf('asm_x86_nasm').includes('_att_memory'));
    assert.ok(!rulesOf('asm_arm').includes('_att_memory'));
});

test('x86 (NASM) composes the shared x86 operand layer', () => {
    assert.ok(rulesOf('asm_x86_nasm').includes('_x86_register'));
    assert.ok(rulesOf('asm_x86_nasm').includes('address_modifier'));
});
