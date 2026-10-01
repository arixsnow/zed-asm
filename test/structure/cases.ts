// SPDX-License-Identifier: MIT

export interface IndentCase {
  name: string;
  grammars: string[];
  start: string;
  keys: string;
  expect: string;
}

const GNU = ['asm_auto', 'asm_arm', 'asm_arm_apple', 'asm_x86_gas'];
const ALL = [...GNU, 'asm_x86_nasm'];

export const INDENT_CASES: IndentCase[] = [
  {
    name: 'Enter after .macro indents at the end of the file, and .endm returns to the opener',
    grammars: GNU,
    start: '',
    keys: '.macro m a\nnop\n.endm\n',
    expect: '.macro m a\n    nop\n.endm\n',
  },
  {
    name: 'a closer typed after a closed inner block aligns with its own opener',
    grammars: GNU,
    start: '',
    keys: '.if A\n.if B\nnop\n.endif\n.endif',
    expect: '.if A\n    .if B\n        nop\n    .endif\n.endif',
  },
  {
    name: '.elseif and .else align with .if, their bodies indent, .endif closes',
    grammars: GNU,
    start: '',
    keys: '.if A\nnop\n.elseif B\nnop\n.else\nnop\n.endif',
    expect: '.if A\n    nop\n.elseif B\n    nop\n.else\n    nop\n.endif',
  },
  {
    name: 'a clause or closer right after its opener aligns with it',
    grammars: GNU,
    start: '',
    keys: '.if A\n.else\nnop\n.endif\n.macro m\n.endm\n.rept 2\n.endr',
    expect: '.if A\n.else\n    nop\n.endif\n.macro m\n.endm\n.rept 2\n.endr',
  },
  {
    name: 'repeat blocks indent their body',
    grammars: GNU,
    start: '',
    keys: '.rept 3\nnop\n.endr\n.irp r, 1, 2\n.byte \\r\n.endr\n.irpc c, 12\nnop\n.endr',
    expect:
      '.rept 3\n    nop\n.endr\n.irp r, 1, 2\n    .byte \\r\n.endr\n.irpc c, 12\n    nop\n.endr',
  },
  {
    name: 'a block closed on its own line does not indent the next line where ; separates',
    grammars: ['asm_arm', 'asm_x86_gas'],
    start: '',
    keys: '.rept 2; nop; .endr\nnop',
    expect: '.rept 2; nop; .endr\nnop',
  },
  {
    name: 'Assembly ends a ; comment before a ; and a directive, so one-line blocks close',
    grammars: ['asm_auto'],
    start: '',
    keys: '.rept 2; nop; .endr\nnop\n.rept 2; .byte 0; .endr\nnop\n.rept 2 ; x ; .endr\nnop',
    expect: '.rept 2; nop; .endr\nnop\n.rept 2; .byte 0; .endr\nnop\n.rept 2 ; x ; .endr\nnop',
  },
  {
    name: 'ARM (Apple) reads ; as a comment, so the block stays open',
    grammars: ['asm_arm_apple'],
    start: '',
    keys: '.rept 2; nop; .endr\nnop\n.endr',
    expect: '.rept 2; nop; .endr\n    nop\n.endr',
  },
  {
    name: 'a closer aligns with its opener when the body is not indented',
    grammars: GNU,
    start: '\t.macro foo\n\tnop<|>',
    keys: '\n.endm',
    expect: '\t.macro foo\n\tnop\n\t.endm',
  },
  {
    name: 'labels still move back one level and indent the next line',
    grammars: ALL,
    start: '',
    keys: 'f:\nnop\n.Lx:\nnop',
    expect: 'f:\n    nop\n.Lx:\n    nop',
  },
  {
    name: 'a numeric label inside a macro moves back, and .endm still aligns with .macro',
    grammars: GNU,
    start: '',
    keys: '.macro m\n1:\nnop\n.endm',
    expect: '.macro m\n1:\n    nop\n.endm',
  },
  {
    name: 'a global label inside a macro body',
    grammars: GNU,
    start: '',
    keys: '.macro m\nf:\nnop\n.endm',
    expect: '.macro m\nf:\n    nop\n.endm',
  },
  {
    name: 'a conditional inside a function keeps the function level around it',
    grammars: GNU,
    start: '',
    keys: 'f:\n.if A\nnop\n.endif\nret',
    expect: 'f:\n    .if A\n        nop\n    .endif\n    ret',
  },
  {
    name: 'a block typed in the middle of a file',
    grammars: GNU,
    start: 'f:\n    nop<|>\n    ret\n',
    keys: '\n.if A\nnop\n.endif',
    expect: 'f:\n    nop\n    .if A\n        nop\n    .endif\n    ret\n',
  },
  {
    name: 'an opener with a trailing comment still indents',
    grammars: GNU,
    start: '',
    keys: '.if A // x; y\nnop\n.endif',
    expect: '.if A // x; y\n    nop\n.endif',
  },
  {
    name: 'block words in upper case',
    grammars: GNU,
    start: '',
    keys: '.MACRO m\nnop\n.ENDM',
    expect: '.MACRO m\n    nop\n.ENDM',
  },
  {
    name: '.endmacro closes like .endm',
    grammars: GNU,
    start: '',
    keys: '.macro m\nnop\n.endmacro',
    expect: '.macro m\n    nop\n.endmacro',
  },
  {
    name: 'a conditional nested in a macro',
    grammars: GNU,
    start: '',
    keys: '.macro m\n.if A\nnop\n.else\nret\n.endif\n.endm',
    expect: '.macro m\n    .if A\n        nop\n    .else\n        ret\n    .endif\n.endm',
  },
  {
    name: 'the line after a closer at the end of the file keeps the opener level',
    grammars: GNU,
    start: '',
    keys: '.rept 2\nnop\n.endr\nnop',
    expect: '.rept 2\n    nop\n.endr\nnop',
  },
  {
    name:
      'Zed limit: a blank line right after a label or an open opener sends the next line to column 0',
    grammars: GNU,
    start: '',
    keys: 'f:\n\nnop\n.macro m\n\nnop',
    expect: 'f:\n\nnop\n.macro m\n\nnop',
  },
  {
    name: 'Enter on an empty line of saved code keeps the body indentation',
    grammars: GNU,
    start: 'f:\n    nop\n<|>\n    ret\n.macro m\n    nop\n\n    ret\n.endm\n',
    keys: '\nmov',
    expect: 'f:\n    nop\n\n    mov\n    ret\n.macro m\n    nop\n\n    ret\n.endm\n',
  },
  {
    name: 'Enter after a full-line comment continues it with the same marker',
    grammars: GNU,
    start: '',
    keys: '// note\nmore',
    expect: '// note\n// more',
  },
  {
    name: 'Enter after a ; comment continues it where ; starts comments',
    grammars: ['asm_arm_apple', 'asm_x86_nasm'],
    start: '',
    keys: '; note\nmore',
    expect: '; note\n; more',
  },
  {
    name: 'a comment after code does not continue',
    grammars: GNU,
    start: '',
    keys: 'nop // c\nret',
    expect: 'nop // c\nret',
  },
  {
    name: 'Enter after a preprocessor line inserts no marker when text follows',
    grammars: GNU,
    start: '#define X 1<|>\nnop\n',
    keys: '\n',
    expect: '#define X 1\n\nnop\n',
  },
  {
    name: 'at the very end of a file Zed ignores scopes, so # continues after a preprocessor line',
    grammars: GNU,
    start: '',
    keys: '#define X 1\n',
    expect: '#define X 1\n# ',
  },
  {
    name: '/* closes itself and Enter inside it starts a * line',
    grammars: GNU,
    start: '',
    keys: '/*\n',
    expect: '/*\n * \n */',
  },
  {
    name: 'brackets close before a space or the end of the line, not before a name',
    grammars: ALL,
    start: 'b <|>x\n',
    keys: '(',
    expect: 'b (x\n',
  },
  {
    name: 'typing the closing bracket steps over the one that was inserted',
    grammars: ALL,
    start: '',
    keys: 'mov x0, (1)',
    expect: 'mov x0, (1)',
  },
];

export interface OutlineCase {
  name: string;
  grammars: string[];
  source: string;
  outline: string[];
}

export interface BreadcrumbCase {
  name: string;
  grammars: string[];
  source: string;
  crumbs: string[][];
}

export type TextObjectName =
  | 'function.around'
  | 'function.inside'
  | 'class.around'
  | 'class.inside'
  | 'comment.around'
  | 'comment.inside';

export interface TextObjectCase {
  name: string;
  grammars: string[];
  source: string;
  objects: [number, TextObjectName, string | null][];
}

const ELF = ['asm_auto', 'asm_arm', 'asm_x86_gas'];

const OUTLINE_SOURCE = (local: string) =>
  [
    '// adds two numbers',
    '#define N 4',
    '#define ADD(a, b) a + b',
    'SIZE = 16',
    '    .equ LIMIT, 8',
    '    .set noreorder',
    '.macro save reg',
    'inner:',
    '    nop',
    '.endm',
    'first:',
    '    nop',
    `${local}:`,
    '1:',
    '    b 1b',
    '.if SIZE',
    'second:',
    '    ret',
    '.endif',
    '',
  ].join('\n');

const OUTLINE = (local: string) => [
  '0 #define N',
  '0 #define ADD( )',
  '0 SIZE',
  '0 .equ LIMIT',
  '0 .macro save',
  '1 inner',
  '0 first',
  `1 ${local}`,
  '1 second',
];

export const OUTLINE_CASES: OutlineCase[] = [
  {
    name: 'labels, macros, #define and assigned names, nested by the lines they own',
    grammars: ELF,
    source: OUTLINE_SOURCE('.Lloop'),
    outline: OUTLINE('.Lloop'),
  },
  {
    name: 'ARM (Apple): the same, with an L name as the local label',
    grammars: ['asm_arm_apple'],
    source: OUTLINE_SOURCE('LBB0_2'),
    outline: OUTLINE('LBB0_2'),
  },
  {
    name: 'NASM: global labels with their dot labels',
    grammars: ['asm_x86_nasm'],
    source: 'start:\n.loop:\n    dec rcx\n    jnz .loop\nnext:\n    ret\n',
    outline: ['0 start', '1 .loop', '0 next'],
  },
];

export const BREADCRUMB_CASES: BreadcrumbCase[] = [
  {
    name: 'the label block, macro and local label around the cursor',
    grammars: ELF,
    source: '.macro m\nf:\n    n<|>op\n.endm\nfirst:\n    nop\n.L<|>x:\n    re<|>t\n',
    crumbs: [['.macro m', 'f'], ['first', '.Lx'], ['first']],
  },
  {
    name: 'NASM: the label block around the cursor',
    grammars: ['asm_x86_nasm'],
    source: 'start:\n.lo<|>op:\n    dec<|> rcx\n',
    crumbs: [['start', '.loop'], ['start']],
  },
];

export const TEXT_OBJECT_CASES: TextObjectCase[] = [
  {
    name: 'af, if, ac, ic and gc around the cursor',
    grammars: [...ELF, 'asm_arm_apple'],
    source: [
      '// first line',
      '// second line',
      '.macro m',
      '    nop',
      '    re<|>t',
      '.endm',
      'f:',
      '    mov<|> x0, x1',
      '    ret',
      'g:',
      '',
    ].join('\n'),
    objects: [
      [0, 'class.around', '.macro m\n    nop\n    ret\n.endm'],
      [0, 'class.inside', 'nop\n    ret'],
      [0, 'comment.around', null],
      [0, 'comment.inside', null],
      [1, 'function.around', 'f:\n    mov x0, x1\n    ret\n'],
      [1, 'function.inside', 'mov x0, x1\n    ret'],
    ],
  },
  {
    name:
      'gc takes consecutive line comments together, and if on a label line still finds the body',
    grammars: [...ELF, 'asm_arm_apple'],
    source: '// fir<|>st\n// second\nf<|>:\n    nop\n',
    objects: [
      [0, 'comment.around', '// first\n// second'],
      [0, 'comment.inside', '// first\n// second'],
      [1, 'function.inside', 'nop'],
    ],
  },
  {
    name: 'NASM: af and if on a label block',
    grammars: ['asm_x86_nasm'],
    source: 'start:\n    mo<|>v eax, 1\n    ret\nnext:\n',
    objects: [
      [0, 'function.around', 'start:\n    mov eax, 1\n    ret\n'],
      [0, 'function.inside', 'mov eax, 1\n    ret'],
    ],
  },
];
