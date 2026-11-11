// SPDX-License-Identifier: MIT

export interface IndentCase {
  name: string;
  grammars: string[];
  start: string;
  keys: string;
  expect: string;
}

interface BlockWords {
  grammars: string[];
  macro: string;
  endMacro: string;
  if: string;
  elseIf: string;
  else: string;
  endIf: string;
  repeat: string;
  endRepeat: string;
  localLabel: string;
  comment: string;
}

const GNU = ['asm_auto', 'asm_arm', 'asm_arm_apple', 'asm_x86_gas'];
const ALL = [...GNU, 'asm_x86_nasm'];
const SEMICOLON_COMMENTS = ['asm_arm_apple', 'asm_x86_nasm'];

const BLOCK_WORDS: BlockWords[] = [
  {
    grammars: GNU,
    macro: '.macro m a',
    endMacro: '.endm',
    if: '.if A',
    elseIf: '.elseif B',
    else: '.else',
    endIf: '.endif',
    repeat: '.rept 2',
    endRepeat: '.endr',
    localLabel: '1:',
    comment: '//',
  },
  {
    grammars: ['asm_x86_nasm'],
    macro: '%macro m 1',
    endMacro: '%endmacro',
    if: '%if A',
    elseIf: '%elif B',
    else: '%else',
    endIf: '%endif',
    repeat: '%rep 2',
    endRepeat: '%endrep',
    localLabel: '%%top:',
    comment: ';',
  },
];

const BLOCK_CASES: IndentCase[] = BLOCK_WORDS.flatMap((words) =>
  [
    {
      name:
        'Enter after a macro opener indents at the end of the file, and the closer returns to it',
      keys: `${words.macro}\nnop\n${words.endMacro}\n`,
      expect: `${words.macro}\n    nop\n${words.endMacro}\n`,
    },
    {
      name: 'a closer typed after a closed inner block aligns with its own opener',
      keys: `${words.if}\n${words.if}\nnop\n${words.endIf}\n${words.endIf}`,
      expect: `${words.if}\n    ${words.if}\n        nop\n    ${words.endIf}\n${words.endIf}`,
    },
    {
      name: 'clauses align with their opener, their bodies indent, and the closer closes',
      keys: `${words.if}\nnop\n${words.elseIf}\nnop\n${words.else}\nnop\n${words.endIf}`,
      expect:
        `${words.if}\n    nop\n${words.elseIf}\n    nop\n${words.else}\n    nop\n${words.endIf}`,
    },
    {
      name: 'a clause or closer right after its opener aligns with it',
      keys:
        `${words.if}\n${words.else}\nnop\n${words.endIf}\n${words.macro}\n${words.endMacro}\n${words.repeat}\n${words.endRepeat}`,
      expect:
        `${words.if}\n${words.else}\n    nop\n${words.endIf}\n${words.macro}\n${words.endMacro}\n${words.repeat}\n${words.endRepeat}`,
    },
    {
      name: 'a repeat block indents its body',
      keys: `${words.repeat}\nnop\n${words.endRepeat}`,
      expect: `${words.repeat}\n    nop\n${words.endRepeat}`,
    },
    {
      name: 'a block opened and closed on one line stays open where ; starts comments',
      grammars: words.grammars.filter((grammar) => SEMICOLON_COMMENTS.includes(grammar)),
      keys: `${words.repeat}; nop; ${words.endRepeat}\nnop\n${words.endRepeat}`,
      expect: `${words.repeat}; nop; ${words.endRepeat}\n    nop\n${words.endRepeat}`,
    },
    {
      name: 'a closer aligns with its opener when the body is not indented',
      start: `\t${words.macro}\n\tnop<|>`,
      keys: `\n${words.endMacro}`,
      expect: `\t${words.macro}\n\tnop\n\t${words.endMacro}`,
    },
    {
      name: 'a local label inside a macro moves back, and the closer still aligns with the opener',
      keys: `${words.macro}\n${words.localLabel}\nnop\n${words.endMacro}`,
      expect: `${words.macro}\n${words.localLabel}\n    nop\n${words.endMacro}`,
    },
    {
      name: 'a local label typed in the middle of a file moves back, and the lines under it indent',
      start: 'f:\n    nop<|>\n    ret\n',
      keys: `\n${words.localLabel}\nnop`,
      expect: `f:\n    nop\n${words.localLabel}\n    nop\n    ret\n`,
    },
    {
      name: 'a global label inside a macro body',
      keys: `${words.macro}\nf:\nnop\n${words.endMacro}`,
      expect: `${words.macro}\nf:\n    nop\n${words.endMacro}`,
    },
    {
      name: 'a conditional inside a function keeps the function level around it',
      keys: `f:\n${words.if}\nnop\n${words.endIf}\nret`,
      expect: `f:\n    ${words.if}\n        nop\n    ${words.endIf}\n    ret`,
    },
    {
      name: 'a block typed in the middle of a file',
      start: 'f:\n    nop<|>\n    ret\n',
      keys: `\n${words.if}\nnop\n${words.endIf}`,
      expect: `f:\n    nop\n    ${words.if}\n        nop\n    ${words.endIf}\n    ret\n`,
    },
    {
      name: 'an opener with a trailing comment still indents',
      keys: `${words.if} ${words.comment} x; y\nnop\n${words.endIf}`,
      expect: `${words.if} ${words.comment} x; y\n    nop\n${words.endIf}`,
    },
    {
      name: 'block words in upper case',
      keys: `${words.macro.toUpperCase()}\nnop\n${words.endMacro.toUpperCase()}`,
      expect: `${words.macro.toUpperCase()}\n    nop\n${words.endMacro.toUpperCase()}`,
    },
    {
      name: 'a conditional nested in a macro',
      keys:
        `${words.macro}\n${words.if}\nnop\n${words.else}\nret\n${words.endIf}\n${words.endMacro}`,
      expect:
        `${words.macro}\n    ${words.if}\n        nop\n    ${words.else}\n        ret\n    ${words.endIf}\n${words.endMacro}`,
    },
    {
      name: 'the line after a closer at the end of the file keeps the opener level',
      keys: `${words.repeat}\nnop\n${words.endRepeat}\nnop`,
      expect: `${words.repeat}\n    nop\n${words.endRepeat}\nnop`,
    },
    {
      name: 'after a blank line, a line takes the indentation of its label or block when typed',
      keys: `f:\n\nnop\n${words.macro}\n\nnop`,
      expect: `f:\n\n    nop\n    ${words.macro}\n\n        nop`,
    },
    {
      name: 'Enter on an empty line of saved code keeps the body indentation',
      start: `f:\n    nop\n<|>\n    ret\n${words.macro}\n    nop\n\n    ret\n${words.endMacro}\n`,
      keys: '\nmov',
      expect:
        `f:\n    nop\n\n    mov\n    ret\n${words.macro}\n    nop\n\n    ret\n${words.endMacro}\n`,
    },
  ].map((blockCase) => ({ grammars: words.grammars, start: '', ...blockCase }))
);

export const INDENT_CASES: IndentCase[] = [
  ...BLOCK_CASES,
  {
    name: 'the .irp and .irpc repeat blocks indent their body',
    grammars: GNU,
    start: '',
    keys: '.irp r, 1, 2\n.byte \\r\n.endr\n.irpc c, 12\nnop\n.endr',
    expect: '.irp r, 1, 2\n    .byte \\r\n.endr\n.irpc c, 12\n    nop\n.endr',
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
    name: 'labels still move back one level and indent the next line',
    grammars: ALL,
    start: '',
    keys: 'f:\nnop\n.Lx:\nnop',
    expect: 'f:\n    nop\n.Lx:\n    nop',
  },
  {
    name: 'a macro-call label nested deeper than the last-line pattern moves back from the tree',
    grammars: GNU,
    start: 'f:\n    nop<|>\n    ret\n',
    keys: '\nL(a(b(c(d(e(f(g(h(x))))))))):\nnop',
    expect: 'f:\n    nop\nL(a(b(c(d(e(f(g(h(x))))))))):\n    nop\n    ret\n',
  },
  {
    name: 'a reserved word typed with a colon stays where it is, since it is no label',
    grammars: ['asm_x86_nasm'],
    start: 'f:\n    nop<|>\n    ret\n',
    keys: '\neax:',
    expect: 'f:\n    nop\n    eax:\n    ret\n',
  },
  {
    name: 'x86 (NASM): struc and istruc indent their bodies, and their closers return',
    grammars: ['asm_x86_nasm'],
    start: '',
    keys: 'struc s\nresd 1\nendstruc\nistruc s\nat s.x, dd 1\niend',
    expect: 'struc s\n    resd 1\nendstruc\nistruc s\n    at s.x, dd 1\niend',
  },
  {
    name: 'x86 (NASM): fields stay at the body level, whatever names them',
    grammars: ['asm_x86_nasm'],
    start: '',
    keys: 'struc s\n.x: resd 1\n.y resd 1\nmt: resb 1\nmv:\nresb 1\nendstruc',
    expect:
      'struc s\n    .x: resd 1\n    .y resd 1\n    mt: resb 1\n    mv:\n        resb 1\nendstruc',
  },
  {
    name: 'x86 (NASM): a closer right after a field returns to its opener',
    grammars: ['asm_x86_nasm'],
    start: '',
    keys: 'struc s\n.x: resd 1\nendstruc',
    expect: 'struc s\n    .x: resd 1\nendstruc',
  },
  {
    name: 'x86 (NASM): Enter after a label on a data line stays level at the end of the file',
    grammars: ['asm_x86_nasm'],
    start: '',
    keys: 'buf: resb 4\nlen: dd 1\nf: nop\nret',
    expect: 'buf: resb 4\nlen: dd 1\nf: nop\n    ret',
  },
  {
    name: 'x86 (NASM): a new field follows its neighbours in a column-0 structure',
    grammars: ['asm_x86_nasm'],
    start: 'struc s\n.x: resd 1<|>\nendstruc\n',
    keys: '\n.y: resd 1',
    expect: 'struc s\n.x: resd 1\n.y: resd 1\nendstruc\n',
  },
  {
    name: 'x86 (NASM): a new field follows its neighbours in an indented structure',
    grammars: ['asm_x86_nasm'],
    start: 'struc s\n  .x: resd 1<|>\nendstruc\n',
    keys: '\n.y: resd 1',
    expect: 'struc s\n  .x: resd 1\n  .y: resd 1\nendstruc\n',
  },
  {
    name: 'x86 (NASM): a code label after a structure moves back as usual',
    grammars: ['asm_x86_nasm'],
    start: 'struc s\n    .x: resd 1\nendstruc<|>\n',
    keys: '\nf:\nnop',
    expect: 'struc s\n    .x: resd 1\nendstruc\nf:\n    nop\n',
  },
  {
    name: '.endmacro closes like .endm',
    grammars: GNU,
    start: '',
    keys: '.macro m\nnop\n.endmacro',
    expect: '.macro m\n    nop\n.endmacro',
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
    name: 'a label named by a C macro call is a local label of the block above',
    grammars: ELF,
    source: 'memmove:\n    nop\nL(loop):\n    nop\n',
    outline: ['0 memmove', '1 L(loop)'],
  },
  {
    name: 'x86 (NASM): global labels with their dot labels',
    grammars: ['asm_x86_nasm'],
    source: 'start:\n.loop:\n    dec rcx\n    jnz .loop\nnext:\n    ret\n',
    outline: ['0 start', '1 .loop', '0 next'],
  },
  {
    name: 'x86 (NASM): a label named by a macro call',
    grammars: ['asm_x86_nasm'],
    source: 'EXTN(jsimd_run):\n    ret\n',
    outline: ['0 EXTN(jsimd_run)'],
  },
  {
    name: 'x86 (NASM): a structure with its fields',
    grammars: ['asm_x86_nasm'],
    source: 'struc point\n.x: resd 1\nmt: resd 1\nendstruc\nnext:\n    ret\n',
    outline: ['0 struc point', '1 .x', '1 mt', '0 next'],
  },
  {
    name: 'x86 (NASM): labels, macros, defines, assigned names and structures',
    grammars: ['asm_x86_nasm'],
    source: [
      '%macro prologue 1',
      '    nop',
      '%endmacro',
      '%define SIZE 4',
      '%define F(a) a',
      '%assign counter 0',
      'len equ 4',
      'msg: db 1',
      'struc point',
      '    .x: resd 1',
      'endstruc',
      'p: istruc point',
      'iend',
      'main:',
      '.loop:',
      '    ret',
      '',
    ].join('\n'),
    outline: [
      '0 %macro prologue',
      '0 %define SIZE',
      '0 %define F( )',
      '0 %assign counter',
      '0 len',
      '0 msg',
      '1 struc point',
      '2 .x',
      '0 p',
      '0 main',
      '1 .loop',
    ],
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
    name: 'x86 (NASM): the label block around the cursor',
    grammars: ['asm_x86_nasm'],
    source: 'start:\n.lo<|>op:\n    dec<|> rcx\n',
    crumbs: [['start', '.loop'], ['start']],
  },
  {
    name: 'x86 (NASM): the macro and the structure field around the cursor',
    grammars: ['asm_x86_nasm'],
    source: '%macro m 0\n    no<|>p\n%endmacro\nstruc s\n    .<|>x: resd 1\nendstruc\n',
    crumbs: [['%macro m'], ['struc s', '.x']],
  },
];

export const TEXT_OBJECT_CASES: TextObjectCase[] = [
  {
    name: 'x86 (NASM): ac and ic on a macro, a structure and an instance, af and if on a label',
    grammars: ['asm_x86_nasm'],
    source: [
      '%macro m 0',
      '    re<|>t',
      '%endmacro',
      'struc s',
      '    .<|>x: resd 1',
      'endstruc',
      'istruc s',
      '    at<|> s.x, dd 1',
      'iend',
      'f:',
      '    no<|>p',
      'g:',
      '',
    ].join('\n'),
    objects: [
      [0, 'class.around', '%macro m 0\n    ret\n%endmacro'],
      [0, 'class.inside', 'ret'],
      [1, 'class.around', 'struc s\n    .x: resd 1\nendstruc'],
      [2, 'class.around', 'istruc s\n    at s.x, dd 1\niend'],
      [2, 'class.inside', 'at s.x, dd 1'],
      [3, 'function.around', 'f:\n    nop\n'],
      [3, 'function.inside', 'nop'],
    ],
  },
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
    name: 'x86 (NASM): af and if on a label block',
    grammars: ['asm_x86_nasm'],
    source: 'start:\n    mo<|>v eax, 1\n    ret\nnext:\n',
    objects: [
      [0, 'function.around', 'start:\n    mov eax, 1\n    ret\n'],
      [0, 'function.inside', 'mov eax, 1\n    ret'],
    ],
  },
];
