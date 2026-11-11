// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';

import { statementWords } from '../../scripts/lib/indent.ts';
import { manifest } from '../../scripts/lib/manifest.ts';
import { commonSources, dialectArchs, tableEntries } from '../../scripts/lib/tables.ts';
import { readGrammar } from '../lib/grammar-sets.ts';
import { parseFiles, treeText } from '../lib/parse.ts';

const X86_GAS = ['asm_auto', 'asm_x86_gas'];

const SOURCES = commonSources();

interface Register {
    name: string;
    indexes: number;
    intel: boolean;
    flags: string[];
}

function registers(table: string): Register[] {
    return tableEntries(SOURCES, table).map(([name, indexes, flags]) => ({
        name,
        indexes: Number(indexes),
        intel: flags.includes('REGISTER_INTEL'),
        flags: flags.split('|').map((flag) => flag.trim()),
    }));
}

function armTables(dialect: string, kind: string): Register[] {
    const merged = new Map<string, Register>();
    for (const arch of dialectArchs(SOURCES.scanner, dialect)) {
        if (arch.startsWith('X86')) {
            continue;
        }
        for (const register of registers(`ASM_${arch}_${kind}`)) {
            const known = merged.get(register.name);
            merged.set(register.name, {
                ...register,
                flags: [...new Set([...(known?.flags ?? []), ...register.flags])],
            });
        }
    }
    return [...merged.values()];
}

const SUFFIXES: Record<string, string[]> = {
    REGISTER_ARRANGED: [
        '8b',
        '16b',
        '4h',
        '8h',
        '2s',
        '4s',
        '1d',
        '2d',
        '1q',
        '2b',
        '4b',
        '2h',
        'b',
        'h',
        's',
        'd',
    ],
    REGISTER_ELEMENT: ['b', 'h', 's', 'd', 'q'],
    REGISTER_TYPED: ['i8', 's16', 'u32', 'p64', 'f', 'f16', 'd', 'bf16', '32'],
};

const NOT_SUFFIXES = ['3s', '32b', '1s', '16h', '0b', 'i33', 'bf32', 'f0', 'x8', 'i'];

const NOT_ARM_REGISTERS = [
    'x32',
    'w32',
    'v32',
    'z32',
    'p16',
    'pn16',
    'za16',
    'za1.b',
    'za0h.x',
    'x0foo',
    'xr',
];

function suffixFits(suffix: string, flags: string[]): boolean {
    return flags.some((flag) => SUFFIXES[flag]?.includes(suffix) ?? false);
}

const armLanguages = manifest.languages.filter(({ dialect }) =>
    dialectArchs(SOURCES.scanner, dialect).some((arch) => !arch.startsWith('X86'))
);

const NOT_GAS_REGISTERS = [
    'r8l',
    'r7',
    'r32',
    'r08',
    'cr16',
    'dr16',
    'db16',
    'tr8',
    'mm8',
    'xmm32',
    'k8',
    'tmm8',
    'r8x',
    'eax.x',
    'eax_',
];

function cases(name: string): string[] {
    return [name, name.toUpperCase(), name[0].toUpperCase() + name.slice(1)];
}

function lastOperandKinds(grammar: string, lines: string[]): (string | undefined)[] {
    const trees = treeText(parseFiles(grammar, 'registers', lines).output)
        .split(/^(?=\(source_file )/m).filter((tree) => tree.startsWith('(source_file '));
    assert.deepStrictEqual(trees.length, lines.length, `${grammar}: one tree per line`);
    return trees.map((tree) => {
        const text = tree.replace(/ \[\d+, \d+\] - \[\d+, \d+\]/g, '').replace(/\s+/g, ' ').trim();
        const operands = /\(instruction mnemonic: \(mnemonic\)((?: operand: \(\w+\))+)\)\)$/.exec(
            text,
        );
        return /ERROR|MISSING/.test(text) ? undefined : operands?.[1].match(/\((\w+)\)$/)?.[1];
    });
}

function check(
    failures: string[],
    grammar: string,
    template: (operand: string) => string,
    operands: [string, boolean][],
): void {
    const lines = operands.map(([operand]) => `${template(operand)}\n`);
    const kinds = lastOperandKinds(grammar, lines);
    for (const [index, [operand, expected]] of operands.entries()) {
        if ((kinds[index] === 'register') !== expected) {
            failures.push(
                `${grammar}: ${template(operand)} reads as ${kinds[index] ?? 'an error'}`,
            );
        }
    }
}

const push = (operand: string) => `push ${operand}`;
const noprefix = (operand: string) => `.intel_syntax noprefix\npush ${operand}`;

function indexCases(register: Register, mark: string): [string, boolean][] {
    const name = `${mark}${register.name}`;
    const last = register.indexes - 1;
    return [
        [`${name}(0)`, true],
        [`${name}(${last})`, true],
        [`${name} ( ${last} )`, true],
        [`${name}(${register.indexes})`, false],
    ];
}

test('every generated x86 GAS register reads as a register with % and in noprefix mode, and nothing else does', () => {
    const failures: string[] = [];
    const table = registers('ASM_X86_GAS_REGISTERS');
    const names = new Set(table.map(({ name }) => name));
    assert.deepStrictEqual(NOT_GAS_REGISTERS.filter((name) => names.has(name)), []);
    const indexed = table.filter(({ indexes }) => indexes > 0);
    for (const grammar of X86_GAS) {
        check(failures, grammar, push, [
            ...table.flatMap(({ name, intel }) =>
                cases(name).map((spelling): [string, boolean] => [`%${spelling}`, !intel])
            ),
            ...NOT_GAS_REGISTERS.flatMap(cases).map((
                name,
            ): [string, boolean] => [`%${name}`, false]),
            ...indexed.flatMap((register) => indexCases(register, '%')),
            ['% eax', true],
            ['%st(0x1)', true],
            ['%st(01)', true],
            ['%st(08)', false],
            ['%st(1u)', true],
            ['%st(0x7ULL)', true],
            ['%st(1lu)', false],
            ['%st(1uu)', false],
            ['%xmm(017)', true],
            ['%xmm(020)', false],
        ]);
        check(failures, grammar, noprefix, [
            ...table.flatMap(({ name }) =>
                cases(name).map((spelling): [string, boolean] => [spelling, true])
            ),
            ...NOT_GAS_REGISTERS.flatMap(cases).map((name): [string, boolean] => [name, false]),
            ...indexed.flatMap((register) => indexCases(register, '')),
        ]);
    }
    assert.deepStrictEqual(failures, []);
});

const NOT_NASM_REGISTERS = ['rip', 'st', 'eiz', 'eflags', 'flat', 'r8l', 'xmm32', 'cr32'];

test('every generated NASM register reads as a register, and nothing else does', () => {
    const failures: string[] = [];
    const table = registers('ASM_X86_NASM_REGISTERS');
    const names = new Set(table.map(({ name }) => name));
    assert.deepStrictEqual(NOT_NASM_REGISTERS.filter((name) => names.has(name)), []);
    check(failures, 'asm_x86_nasm', push, [
        ...table.flatMap(({ name }) =>
            cases(name).map((spelling): [string, boolean] => [spelling, true])
        ),
        ...NOT_NASM_REGISTERS.flatMap(cases).map((name): [string, boolean] => [name, false]),
    ]);
    assert.deepStrictEqual(failures, []);
});

test('every generated ARM register reads as a register with exactly the suffixes its tables allow', () => {
    const failures: string[] = [];
    assert.deepStrictEqual(
        NOT_SUFFIXES.filter((suffix) =>
            Object.values(SUFFIXES).some((list) => list.includes(suffix))
        ),
        [],
    );
    for (const { grammar, dialect } of armLanguages) {
        const table = armTables(dialect, 'REGISTERS');
        const names = new Set(table.map(({ name }) => name));
        assert.deepStrictEqual(NOT_ARM_REGISTERS.filter((name) => names.has(name)), [], grammar);
        const suffixed = table.filter(({ name, flags }) =>
            !name.includes('.') && flags.some((flag) => flag in SUFFIXES)
        );
        check(failures, grammar, (operand) => `mov x0, ${operand}`, [
            ...table.flatMap(({ name }) =>
                cases(name).map((spelling): [string, boolean] => [spelling, true])
            ),
            ...NOT_ARM_REGISTERS.map((name): [string, boolean] => [name, false]),
            ...suffixed.flatMap(({ name, flags }) =>
                [...new Set([...Object.values(SUFFIXES).flat(), ...NOT_SUFFIXES])].map((
                    suffix,
                ): [string, boolean] => [`${name}.${suffix}`, suffixFits(suffix, flags)])
            ),
        ]);
    }
    assert.deepStrictEqual(failures, []);
});

test('every generated system register reads as a register in a system slot and only there', () => {
    const failures: string[] = [];
    for (const { grammar, dialect } of armLanguages) {
        const archs = dialectArchs(SOURCES.scanner, dialect);
        const general = new Set(armTables(dialect, 'REGISTERS').map(({ name }) => name));
        const system = armTables(dialect, 'SYSTEM_REGISTERS').map(({ name }) => name);
        const aarch64 = archs.some((arch) => arch.startsWith('AARCH64'));
        const aarch32 = archs.includes('AARCH32');
        const gnuAarch64 = archs.includes('AARCH64_GNU');
        const rules: [string, boolean][] = [
            ['s3_0_c1_c0_0', aarch64],
            ['S3_7_C15_c15_7', aarch64],
            ['S03_7_C15_c15_7', gnuAarch64],
            ['s3_0_c01_c0_0', gnuAarch64],
            ['s4_0_c1_c0_0', false],
            ['s3_8_c1_c0_0', false],
            ['s3_0_c16_c0_0', false],
            ['c15', aarch64 || aarch32],
            ['c07', aarch64],
            ['C0x7', gnuAarch64],
            ['c7u', gnuAarch64],
            ['c016', gnuAarch64],
            ['c019', false],
            ['c16', false],
            ['apsr_gnzcvq', aarch32],
            ['apsr_cvnz', aarch32],
            ['APSR_CVNZ', false],
            ['apsr_nzcvqq', false],
            ['CPSR_fc', aarch32],
            ['CPSR_FC', false],
            ['xpsr_g', aarch32],
        ];
        check(failures, grammar, (operand) => `mrs x0, ${operand}`, [
            ...system.map((name): [string, boolean] => [name, true]),
            ...rules,
        ]);
        check(
            failures,
            grammar,
            (operand) => `mov x0, ${operand}`,
            system.map((name): [string, boolean] => [name, general.has(name)]),
        );
    }
    assert.deepStrictEqual(failures, []);
});

test('a dialect reads register and NEON alias directives in the scanner exactly where its grammar has them', () => {
    for (const { grammar, dialect } of manifest.languages) {
        const words = new Set(statementWords(SOURCES, dialect).map(({ name }) => name));
        const rules = readGrammar(grammar).rules as Record<string, unknown>;
        const alias = JSON.stringify(rules.register_alias ?? null);
        assert.deepStrictEqual(
            [words.has('.req'), words.has('.dn') && words.has('.qn')],
            [rules.register_alias !== undefined, alias.includes('"_neon_alias_word"')],
            grammar,
        );
    }
});
