// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';

import { manifest } from '../../scripts/lib/manifest.ts';
import { parseFiles, treeText } from '../lib/parse.ts';

const GNU = ['asm_auto', 'asm_arm', 'asm_arm_apple', 'asm_x86_gas'];
const ALL = manifest.languages.map((language) => language.grammar);
const X86_GAS = ['asm_auto', 'asm_x86_gas'];
const ERROR_NODE = /\((?:ERROR|MISSING[^[]*) \[(\d+), \d+\] - \[(\d+), \d+\]/g;

const REJECTED: [string, number[], string[]][] = [
    ['first:\n    nop main:', [1], GNU],
    ['1$:\n    b 1$', [0, 1], ['asm_arm_apple', 'asm_x86_gas']],
    ['1:\n    b 1B', [1], GNU],
    ['1b: nop', [0], GNU],
    ['    ldm r0, {.foo}\n    nop', [0], ['asm_auto', 'asm_arm']],
    ['    ldm r0, {.endm\n    nop', [0], ['asm_auto', 'asm_arm']],
    ['    .loc 1, 2, 3', [0], GNU],
    ['    .equ A 1', [0], GNU],
    ['    .float 1.5f', [0], GNU],
    ['.irp r a b\n.endr', [0], ['asm_arm_apple']],
    ['.if 1\n.else nop\n.endif', [1], GNU],
    ['.if 1\n.endif nop', [1], GNU],
    ['.if 1\n.else\n.else\n.endif', [2], GNU],
    ['.if 1\n.else\n.elseif 2\n.endif', [2], GNU],
    ['#define 1 2', [0], GNU],
    ['#define F(1) x', [0], GNU],
    ['#define $x 1', [0], GNU],
    ['#define F(a$b) x', [0], GNU],
    ['#define.x 1', [0], GNU],
    ['.intel_syntax NOPREFIX\ncall rax', [0], X86_GAS],
    ['.intel_syntax , noprefix\ncall rax', [0], X86_GAS],
    ['.att_syntax Prefix\ncall rax', [0], X86_GAS],
    ['vaddps %zmm1, %zmm2, %zmm3{%k1}{Z}', [0], X86_GAS],
    ['vaddps (%rax){1TO16}, %zmm2, %zmm3', [0], X86_GAS],
    ['vaddps {RN-SAE}, %zmm1, %zmm2, %zmm3', [0], ['asm_x86_gas']],
    ['vaddps (%rax){1to3}, %zmm2, %zmm3', [0], X86_GAS],
    ['lock data16 {disp32} addl $1, 8(%rax)', [0], X86_GAS],
    ['{disp32} lock {load} addl $1, 8(%rax)', [0], X86_GAS],
    ['ccmpb {dfv=of,c} %r9b, %r8b', [0], X86_GAS],
    ['ccmpb {dfv=sf,z} %r9b, %r8b', [0], X86_GAS],
    ['eax: nop', [0], ['asm_x86_nasm']],
    ['rep: nop', [0], ['asm_x86_nasm']],
    ['dword: nop', [0], ['asm_x86_nasm']],
    ['bits: nop', [0], ['asm_x86_nasm']],
    ['times: nop', [0], ['asm_x86_nasm']],
    ['[use32]', [0], ['asm_x86_nasm']],
    ['[db 1]', [0], ['asm_x86_nasm']],
    ['[times 2 nop]', [0], ['asm_x86_nasm']],
    ['use16 1', [0], ['asm_x86_nasm']],
    ['global d :data 4', [0], ['asm_x86_nasm']],
    ['extern a b', [0], ['asm_x86_nasm']],
    ['x equ 1, 2', [0], ['asm_x86_nasm']],
    ['db 2 dup (2 dup (0))', [0], ['asm_x86_nasm']],
    ['db 2 dup (1, 2 dup (0))', [0], ['asm_x86_nasm']],
    ['dw byte (2 dup (0))', [0], ['asm_x86_nasm']],
    ['db 1 2', [0], ['asm_x86_nasm']],
    ['dd ? + 1', [0], ['asm_x86_nasm']],
    ['mov eax, ?', [0], ['asm_x86_nasm']],
    ['x equ ?', [0], ['asm_x86_nasm']],
    ['dd (?)', [0], ['asm_x86_nasm']],
    ['db 2 dup (1) + 3', [0], ['asm_x86_nasm']],
    ['dd 1.5 + 1', [0], ['asm_x86_nasm']],
    ['dq 1.5f', [0], ['asm_x86_nasm']],
    ['dd 1 ?2 : 3', [0], ['asm_x86_nasm']],
    ['__?float32?__: nop', [0], ['asm_x86_nasm']],
    ['dd ~1.5', [0], ['asm_x86_nasm']],
    ['dq 0x1p', [0], ['asm_x86_nasm']],
    ['%endif', [0], ['asm_x86_nasm']],
    ['% define X 1', [0], ['asm_x86_nasm']],
    ['%ifmacro m n\n%endif', [0], ['asm_x86_nasm']],
    ['%define 1 2', [0], ['asm_x86_nasm']],
    ['struc a, 1, 2\nendstruc', [0], ['asm_x86_nasm']],
    ['struc a 4\nendstruc', [0], ['asm_x86_nasm']],
    ['struc 1\nendstruc', [0], ['asm_x86_nasm']],
    ['struc "a"\nendstruc', [0], ['asm_x86_nasm']],
    ['struc a\nendstruc foo', [1], ['asm_x86_nasm']],
    ['struc: nop', [0], ['asm_x86_nasm']],
    ['istruc a, 1\niend', [0], ['asm_x86_nasm']],
    ['istruc a\niend foo', [1], ['asm_x86_nasm']],
    ['at: nop', [0], ['asm_x86_nasm']],
    ['at a, at b, dd 1', [0], ['asm_x86_nasm']],
    ['%include macros.inc', [0], ['asm_x86_nasm']],
    ['f: %macro m 0\n%endmacro', [0, 1], ['asm_x86_nasm']],
    ['%if 1\nf: %else\n%endif', [1], ['asm_x86_nasm']],
    ['%macro m 0\n%%l: %rep 2\n%endrep\n%endmacro', [1, 2], ['asm_x86_nasm']],
    ['f: %define X 1', [0], ['asm_x86_nasm']],
    ['mov eax 1', [0], ['asm_x86_nasm']],
    ['push 1 2', [0], ['asm_x86_nasm']],
    ['movl %eax %ebx', [0], X86_GAS],
    ['.intel_syntax noprefix\nmov eax 1', [1], X86_GAS],
    ['add x0, x1 x2', [0], ['asm_auto', 'asm_arm', 'asm_arm_apple']],
    ['add r0, r1 r2', [0], ['asm_auto', 'asm_arm']],
    ['db 1, \\ 2', [0], ['asm_x86_nasm']],
    ['f: \\\n%define W 1', [1], ['asm_x86_nasm']],
    ['f: \\\n%macro m 0\n%endmacro', [1, 2], ['asm_x86_nasm']],
    ['vaddps zmm0{k9}, zmm1, zmm2', [0], ['asm_x86_nasm']],
    ['vaddps zmm0, zmm1, zmm2, {rn - sae}', [0], ['asm_x86_nasm']],
    ['{disp8} mov eax, [rbx]', [0], ['asm_x86_nasm']],
    ['vaddps zmm0{k0}, zmm1, zmm2', [0], ['asm_x86_nasm']],
    ['vaddps zmm0, zmm1, zmm2, {rn-foo}', [0], ['asm_x86_nasm']],
    ['long: nop', [0], ['asm_x86_nasm']],
    ['__utf16__: nop', [0], ['asm_x86_nasm']],
    ['__?masm_ptr?__: nop', [0], ['asm_x86_nasm']],
    ['dd __?float32?__ 1.5', [0], ['asm_x86_nasm']],
    ['.intel_syntax noprefix\nmov eax, Float ptr [rbx]', [1], X86_GAS],
    ['.intel_syntax noprefix\nmov eax, Imagerel x', [1], X86_GAS],
    ['vaddps {rn}, %zmm1, %zmm2, %zmm3', [0], ['asm_x86_gas']],
];

function errorRows(tree: string): number[] {
    const rows = new Set<number>();
    for (const [, start, end] of tree.matchAll(ERROR_NODE)) {
        for (let row = Number(start); row <= Number(end); row++) {
            rows.add(row);
        }
    }
    return [...rows].sort((a, b) => a - b);
}

test('syntax that every assembler of a language rejects parses with an error on its own lines only', () => {
    const failures: string[] = [];
    for (const grammar of ALL) {
        const rejected = REJECTED.filter(([, , grammars]) => grammars.includes(grammar));
        const sources = rejected.map(([snippet]) => `${snippet}\n`);
        const { output } = parseFiles(grammar, 'rejected', sources);
        const trees = treeText(output)
            .split(/^(?=\(source_file )/m).filter((tree) => tree.startsWith('(source_file '));
        const statuses = output.split('\n').filter((line) => line.includes('\tParse:'));
        assert.deepStrictEqual(trees.length, rejected.length, `${grammar}: one tree per snippet`);
        assert.deepStrictEqual(
            statuses.length,
            rejected.length,
            `${grammar}: one status per snippet`,
        );
        for (const [index, [snippet, rows]] of rejected.entries()) {
            const found = errorRows(`${trees[index]}\n${statuses[index]}`);
            if (found.join() !== rows.join()) {
                failures.push(
                    `${grammar}: ${
                        JSON.stringify(snippet)
                    } has errors on rows [${found}], not [${rows}]`,
                );
            }
        }
    }
    assert.deepStrictEqual(failures, []);
});
