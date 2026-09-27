// SPDX-License-Identifier: MIT

export interface HighlightCase {
  name: string;
  grammar: string;
  source: string;
  expect: [string, string | null][];
}

export interface ScopeCase {
  name: string;
  grammar: string;
  source: string;
  scopes: (string | null)[];
}

const [E_ACUTE, GRINNING_FACE] = [0xe9, 0x1f600].map((codePoint) =>
  String.fromCodePoint(codePoint)
);

export const HIGHLIGHT_CASES: HighlightCase[] = [
  {
    name: 'x86 GAS: code after multi-byte UTF-8 text is highlighted at the right place',
    grammar: 'asm_x86_gas',
    source: `// caf${E_ACUTE} ${GRINNING_FACE}\nnop # x\n`,
    expect: [
      [`// caf${E_ACUTE} ${GRINNING_FACE}`, 'comment'],
      ['nop', 'keyword'],
      ['# x', 'comment'],
    ],
  },
  {
    name: 'Auto: local labels look the same where they are defined and where they are used',
    grammar: 'asm_auto',
    source: '.Lloop:\n    b .Lloop\n    .section .text\n',
    expect: [
      ['.Lloop', 'label'],
      ['b', 'keyword'],
      ['.Lloop', 'label'],
      ['.section', 'preproc'],
      ['.text', 'constant'],
    ],
  },
  {
    name: 'Auto: every current capture resolves the way Zed will paint it',
    grammar: 'asm_auto',
    source: [
      'main:',
      '.Lloop:',
      '    add x0, x1, x2, lsl #32 // c',
      '    movq $1, %rax',
      '    bl puts@PLT',
      '    .type main, %function',
      '    .type data, @object',
      '    .asciz "hi\\n"',
      "    mov x0, 'a",
      '    .size main, .-main',
      '#define N 4',
      '/* block */',
      '    mov x0, (1 + 2)',
      '',
    ].join('\n'),
    expect: [
      ['main', 'function.definition'],
      [':', 'punctuation.delimiter'],
      ['.Lloop', 'label'],
      ['add', 'keyword'],
      ['x0', 'constant'],
      [',', 'punctuation.delimiter'],
      ['lsl', 'keyword.operator'],
      ['#', 'punctuation.special'],
      ['32', 'number'],
      ['// c', 'comment'],
      ['movq', 'keyword'],
      ['$', 'punctuation.special'],
      ['1', 'number'],
      ['%rax', 'variable.special'],
      ['bl', 'keyword'],
      ['puts', 'constant'],
      ['@', 'punctuation.special'],
      ['PLT', 'attribute'],
      ['.type', 'preproc'],
      ['main', 'constant'],
      ['%function', 'type.builtin'],
      ['.type', 'preproc'],
      ['data', 'constant'],
      ['@', 'punctuation.special'],
      ['object', 'type.builtin'],
      ['.asciz', 'preproc'],
      ['"hi', 'string'],
      ['\\n', 'string.escape'],
      ['"', 'string'],
      ['mov', 'keyword'],
      ["'a", 'string'],
      ['.size', 'preproc'],
      ['main', 'constant'],
      ['.', 'constant.builtin'],
      ['-', 'operator'],
      ['#define', 'preproc'],
      ['/* block */', 'comment'],
      ['mov', 'keyword'],
      ['(', 'punctuation.bracket'],
      ['1', 'number'],
      ['+', 'operator'],
      ['2', 'number'],
      [')', 'punctuation.bracket'],
    ],
  },
  {
    name: 'ARM: shifts and immediates stay code, @ starts a comment',
    grammar: 'asm_arm',
    source: 'start:\n    ADD X0, X1, X2, LSL #32 @ trailing\n',
    expect: [
      ['start', 'function.definition'],
      ['ADD', 'keyword'],
      ['LSL', 'keyword.operator'],
      ['#', 'punctuation.special'],
      ['32', 'number'],
      ['@ trailing', 'comment'],
    ],
  },
  {
    name: 'Apple ARM: @PAGE is a relocation and ; starts a comment',
    grammar: 'asm_arm_apple',
    source: '_start:\n    adrp x0, _msg@PAGE\n    mov w0, #0 ; =0x0\n',
    expect: [
      ['_start', 'function.definition'],
      ['adrp', 'keyword'],
      ['_msg', 'constant'],
      ['@', 'punctuation.special'],
      ['PAGE', 'attribute'],
      ['#', 'punctuation.special'],
      ['0', 'number'],
      ['; =0x0', 'comment'],
    ],
  },
  {
    name: 'x86 GAS: registers, # comments and ; separators',
    grammar: 'asm_x86_gas',
    source: 'start:\n    movq %rax, %rbx # save\n    nop; ret\n',
    expect: [
      ['movq', 'keyword'],
      ['%rax', 'variable.special'],
      ['%rbx', 'variable.special'],
      ['# save', 'comment'],
      ['nop', 'keyword'],
      [';', null],
      ['ret', 'keyword'],
    ],
  },
  {
    name: 'Auto: comment characters inside strings stay string text',
    grammar: 'asm_auto',
    source: '.ascii " # x", "// y", "a\\n@b", "; z"\n',
    expect: [
      ['.ascii', 'preproc'],
      ['" # x"', 'string'],
      ['"// y"', 'string'],
      ['"a', 'string'],
      ['\\n', 'string.escape'],
      ['@b"', 'string'],
      ['"; z"', 'string'],
    ],
  },
  {
    name: 'Auto: comments on preprocessor lines keep their comment color',
    grammar: 'asm_auto',
    source: '#endif /* X */\n#define X 1 // c\n#include "a//b.h"\n',
    expect: [
      ['#endif', 'preproc'],
      ['/* X */', 'comment'],
      ['#define', 'preproc'],
      ['X 1', null],
      ['// c', 'comment'],
      ['#include', 'preproc'],
      ['"a//b.h"', null],
    ],
  },
  {
    name: 'NASM: local labels, suffixed numbers, strings and ; comments',
    grammar: 'asm_x86_nasm',
    source: '.loop:\n    mov eax, 0FFh ; note\n    db \'x\', "y"\n',
    expect: [
      ['.loop', 'label'],
      ['mov', 'keyword'],
      ['0FFh', 'number'],
      ['; note', 'comment'],
      ['db', 'keyword'],
      ["'x'", 'string'],
      ['"y"', 'string'],
    ],
  },
];

export const SCOPE_CASES: ScopeCase[] = [
  {
    name:
      'Auto: comments include both edges, strings exclude their quotes, preproc lines their end',
    grammar: 'asm_auto',
    source: [
      '<|>// c<|>',
      '/* b<|> */<|>',
      '.asciz <|>"<|>s<|>"<|>',
      '#define N 4<|>',
      'nop<|>',
      '',
    ].join('\n'),
    scopes: [
      'comment',
      'comment',
      'comment',
      'comment',
      null,
      'string',
      'string',
      null,
      'preproc',
      null,
    ],
  },
  {
    name: 'Auto: the end of a preprocessor line with a trailing comment is still the preproc scope',
    grammar: 'asm_auto',
    source: [
      '#endif /* X */<|>',
      '#else // !X<|>',
      '#define X 1 // c<|>',
      '#if A /* spans<|>',
      '   lines */<|>',
      'nop<|>',
      '',
    ].join('\n'),
    scopes: ['preproc', 'preproc', 'preproc', 'preproc', 'preproc', null],
  },
  {
    name: 'Auto: trailing blanks on a preprocessor line stay in the preproc scope',
    grammar: 'asm_auto',
    source: '#define X 1   <|>\n#else <|>\n#endif /* X */  <|>\nnop  <|>\n',
    scopes: ['preproc', 'preproc', 'preproc', null],
  },
  {
    name:
      'x86 GAS: the end of a preprocessor line with a trailing comment is still the preproc scope',
    grammar: 'asm_x86_gas',
    source: '#endif /* X */<|>\n#else // !X<|>\n',
    scopes: ['preproc', 'preproc'],
  },
  {
    name: 'x86 GAS: a cursor after a comment character inside a string is in the string',
    grammar: 'asm_x86_gas',
    source: '.ascii " #<|> x"\n',
    scopes: ['string'],
  },
  {
    name: 'NASM: comment and string scopes',
    grammar: 'asm_x86_nasm',
    source: '; c<|>\ndb <|>"<|>s"\n',
    scopes: ['comment', null, 'string'],
  },
];
