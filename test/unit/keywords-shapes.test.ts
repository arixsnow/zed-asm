// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';

import type { PreprocessorStructure } from '../../scripts/lib/keywords/nasm.ts';
import {
  caseNames,
  cppDirectives,
  decorators,
  gnuDirectives,
  intelWords,
  nasmDirectives,
  nasmOperandWords,
  prefixes,
  registers,
  type Shaped,
  shiftWords,
  syntaxWords,
} from '../../scripts/lib/keywords/shapes.ts';
import { assertThrowsIncluding } from '../lib/assert.ts';
import { keywords } from '../lib/keyword-sources.ts';

function shapedRows({ keywords: table, role }: Shaped): [string, string, string[]][] {
  return table.entries().map(([word, flags]) => [word, role(word), flags]);
}

function plain(...names: string[]) {
  return keywords(Object.fromEntries(names.map((name) => [name, []])));
}

test('gnuDirectives shapes a word by its handlers and its table', () => {
  const names = keywords({
    '.att_syntax': [],
    '.else': ['llvm:DK_ELSE'],
    '.foo': ['binutils:s_foo'],
    '.if': ['binutils:s_if', 'llvm:DK_IF'],
    '.req': [],
  });
  assert.deepStrictEqual(shapedRows(gnuDirectives(names, 'x86')), [
    ['.att_syntax', 'ATT_SYNTAX', []],
    ['.else', 'ELSE', []],
    ['.foo', 'GENERIC_DIRECTIVE', []],
    ['.if', 'IF_OPEN', []],
    ['.req', 'GENERIC_DIRECTIVE', ['WORD_NAMES_ASSIGNMENT']],
  ]);
  assert.deepStrictEqual(shapedRows(gnuDirectives(names, 'arm')), [
    ['.att_syntax', 'GENERIC_DIRECTIVE', []],
    ['.else', 'ELSE', []],
    ['.foo', 'GENERIC_DIRECTIVE', []],
    ['.if', 'IF_OPEN', []],
    ['.req', 'REGISTER_ALIAS_WORD', ['WORD_NAMES_ASSIGNMENT']],
  ]);
});

test('gnuDirectives stops on a word with two shapes', () => {
  assertThrowsIncluding(
    () => gnuDirectives(keywords({ '.x': ['binutils:s_if', 'binutils:s_else'] }), 'x86'),
    '.x has the conflicting shapes ELSE, IF_OPEN',
  );
  assertThrowsIncluding(
    () => gnuDirectives(keywords({ '.file': ['binutils:s_if'] }), 'x86'),
    '.file has the conflicting shapes',
  );
});

const STRUCTURE: PreprocessorStructure = {
  conditions: new Map([
    ['%ifdef', { stem: 'if', tail: 'def' }],
    ['%elifmacro', { stem: 'elif', tail: 'macro' }],
    ['%ifid', { stem: 'if', tail: 'id' }],
    ['%ifnew', { stem: 'if', tail: 'new' }],
  ]),
  casePairs: new Map([['%imacro', '%macro']]),
};

test('nasmDirectives shapes preprocessor words by their structure and others by their section', () => {
  const names = keywords({
    '%elifmacro': [],
    '%ifdef': [],
    '%ifid': [],
    '%imacro': [],
    '%pragma': [],
    bits: [],
    db: ['nasm:section:pseudo_ops'],
    equ: ['nasm:section:pseudo_ops'],
    cpu: ['nasm:standard-macro'],
    float: ['yasm:standard-macro'],
    section: [],
    times: ['nasm:token:TOKEN_TIMES'],
  });
  assert.deepStrictEqual(shapedRows(nasmDirectives(names, STRUCTURE)), [
    ['%elifmacro', 'ELSEIF_MACRO', []],
    ['%ifdef', 'IF_OPEN', []],
    ['%ifid', 'IF_RAW_OPEN', []],
    ['%imacro', 'MACRO_OPEN', []],
    ['%pragma', 'PREPROC_DIRECTIVE', []],
    ['bits', 'GENERIC_DIRECTIVE', []],
    ['cpu', 'GENERIC_DIRECTIVE', ['WORD_RESERVED']],
    ['db', 'DATA_DIRECTIVE', ['WORD_NAMES_LABEL']],
    ['equ', 'EQU', ['WORD_NAMES_ASSIGNMENT']],
    ['float', 'GENERIC_DIRECTIVE', ['WORD_RESERVED']],
    ['section', 'SECTION_DIRECTIVE', []],
    ['times', 'TIMES', ['WORD_NAMES_LABEL', 'WORD_RESERVED']],
  ]);
});

test('nasmDirectives shape the structure words, and reserve only macros that take parameters', () => {
  const macro = ['nasm:standard-macro'];
  const parameterless = ['nasm:standard-macro', 'nasm:no-parameters', 'yasm:no-parameters'];
  const names = keywords({
    at: macro,
    bits: macro,
    endstruc: parameterless,
    iend: parameterless,
    istruc: macro,
    struc: macro,
    use16: parameterless,
  });
  assert.deepStrictEqual(shapedRows(nasmDirectives(names, STRUCTURE)), [
    ['at', 'AT_WORD', ['WORD_NAMES_LABEL', 'WORD_RESERVED']],
    ['bits', 'GENERIC_DIRECTIVE', ['WORD_RESERVED']],
    ['endstruc', 'STRUC_CLOSE', ['WORD_NAMES_LABEL']],
    ['iend', 'ISTRUC_CLOSE', ['WORD_NAMES_LABEL']],
    ['istruc', 'ISTRUC_OPEN', ['WORD_NAMES_LABEL', 'WORD_RESERVED']],
    ['struc', 'STRUC_OPEN', ['WORD_NAMES_LABEL', 'WORD_RESERVED']],
    ['use16', 'USE_DIRECTIVE', []],
  ]);
});

test('nasmDirectives stops on a condition it has no shape for', () => {
  assertThrowsIncluding(
    () => nasmDirectives(plain('%ifnew'), STRUCTURE),
    '%ifnew: the condition %if*new has no shape',
  );
});

test('registers OR the allowances and AND the restrictions of their sources', () => {
  const both = registers([
    keywords({
      flat: ['binutils:RegFlat'],
      k1: ['binutils:RegMask'],
      st: ['index:8'],
      x0: ['binutils:REG_TYPE_V'],
      'za0.b': ['binutils:REG_TYPE_ZA'],
    }),
    keywords({
      flat: [],
      k1: [],
      st: ['index:4'],
      x0: ['llvm:RegKind::SVEDataVector'],
    }),
  ]);
  assert.deepStrictEqual(shapedRows(both), [
    ['flat', '0', []],
    ['k1', '0', ['REGISTER_MASK']],
    ['st', '8', []],
    ['x0', '0', ['REGISTER_ARRANGED', 'REGISTER_ELEMENT']],
    ['za0.b', '0', []],
  ]);
  assert.deepStrictEqual(shapedRows(registers([keywords({ flat: ['binutils:RegFlat'] })])), [
    ['flat', '0', ['REGISTER_INTEL']],
  ]);
});

test('prefixes OR where a word stands and keep Intel only if every source says so', () => {
  const table = prefixes([
    { plain: plain('evex', 'lock', 'rep'), braced: plain('vex'), intel: plain('evex', 'rep') },
    { plain: plain('data16', 'rep'), braced: plain('lock') },
  ]);
  assert.deepStrictEqual(table.entries(), [
    ['data16', ['PREFIX_PLAIN']],
    ['evex', ['PREFIX_INTEL', 'PREFIX_PLAIN']],
    ['lock', ['PREFIX_BRACED', 'PREFIX_PLAIN']],
    ['rep', ['PREFIX_PLAIN']],
    ['vex', ['PREFIX_BRACED']],
  ]);
});

test('intelWords gives one role per word and keeps a restriction only if every source has it', () => {
  const shaped = intelWords([
    keywords({
      and: ['binutils:operator:O_bit_and:2'],
      byte: ['binutils:type'],
      eq: ['binutils:operator:O_eq:2'],
      mod: ['binutils:operator:O_modulus:2'],
      offset: ['binutils:operator:O_offset:1'],
      ptr: ['binutils:ptr'],
    }),
    keywords({
      and: ['llvm:operator:onAnd', 'llvm:no-mixed-case'],
      byte: ['llvm:size', 'llvm:no-mixed-case', 'llvm:ptr-follows'],
      float: ['llvm:size', 'llvm:no-mixed-case', 'llvm:ptr-follows'],
      imagerel: ['llvm:operator:onImagerel', 'llvm:no-mixed-case'],
    }),
  ]);
  assert.deepStrictEqual(shapedRows(shaped), [
    ['and', 'INTEL_BITWISE_WORD', []],
    ['byte', 'INTEL_TYPE_WORD', []],
    ['eq', 'INTEL_COMPARISON_WORD', []],
    ['float', 'INTEL_TYPE_WORD', ['CASE_NO_MIXED', 'WORD_PTR_FOLLOWS']],
    ['imagerel', 'INTEL_UNARY_WORD', ['CASE_NO_MIXED']],
    ['mod', 'INTEL_MULTIPLICATIVE_WORD', []],
    ['offset', 'INTEL_UNARY_WORD', []],
    ['ptr', 'INTEL_PTR_WORD', []],
  ]);
});

test('intelWords stops on an operator it cannot place or a word without one role', () => {
  for (
    const [tags, stops] of [
      [['binutils:operator:O_bit_not:2'], 'the binutils operator O_bit_not/2 has no role'],
      [['binutils:operator:O_bit_and:1'], 'the binutils operator O_bit_and/1 has no role'],
      [['binutils:operator:O_new:2'], 'the binutils operator O_new/2 has no role'],
      [['llvm:operator:onNew'], 'the LLVM operator handler onNew has no role'],
      [['binutils:type', 'binutils:ptr'], 'x has the roles INTEL_PTR_WORD, INTEL_TYPE_WORD'],
      [[], 'x has the roles none'],
    ] as [string[], string][]
  ) {
    assertThrowsIncluding(() => intelWords([keywords({ x: tags })]), stops);
  }
  assertThrowsIncluding(
    () => intelWords([keywords({ x: ['binutils:type'] }), keywords({ x: ['llvm:ptr'] })]),
    'x has the roles INTEL_PTR_WORD, INTEL_TYPE_WORD',
  );
});

test('nasmOperandWords takes the role from the token and reserves all but symbols', () => {
  const shaped = nasmOperandWords(keywords({
    abs: ['nasm:token:TOKEN_SPECIAL', 'nasm:value:S_ABS'],
    dup: ['nasm:token:TOKEN_ID', 'nasm:value:0', 'nasm:flag:TFLAG_DUP'],
    dword: ['nasm:token:TOKEN_SIZE', 'nasm:value:S_DWORD'],
    ptr: ['nasm:token:TOKEN_ID', 'nasm:value:0', 'nasm:flag:TFLAG_WARN'],
    seg: ['nasm:token:TOKEN_SEG', 'nasm:value:0'],
    __masm_ptr: ['nasm:token:TOKEN_MASM_PTR', 'nasm:value:0'],
  }));
  assert.deepStrictEqual(shapedRows(shaped), [
    ['__masm_ptr', 'MEMORY_OPEN_WORD', ['WORD_RESERVED']],
    ['abs', 'ABSOLUTE_WORD', ['WORD_RESERVED']],
    ['dup', 'DUP_WORD', []],
    ['dword', 'INTEL_TYPE_WORD', ['WORD_RESERVED']],
    ['seg', 'INTEL_UNARY_WORD', ['WORD_RESERVED']],
  ]);
});

test('nasmOperandWords stops on a token it has no shape for', () => {
  for (
    const [tags, stops] of [
      [['nasm:token:TOKEN_NEW', 'nasm:value:0'], 'the nasm token TOKEN_NEW 0 has no shape'],
      [['nasm:token:TOKEN_SPECIAL', 'nasm:value:S_NEW'], 'the nasm token TOKEN_SPECIAL S_NEW'],
      [['nasm:token:TOKEN_ID', 'nasm:value:0'], 'the symbol token flags  have no shape'],
      [
        ['nasm:token:TOKEN_ID', 'nasm:value:0', 'nasm:flag:TFLAG_NEW'],
        'the symbol token flags nasm:flag:TFLAG_NEW have no shape',
      ],
    ] as [string[], string][]
  ) {
    assertThrowsIncluding(() => nasmOperandWords(keywords({ x: tags })), stops);
  }
});

test('decorators OR what a word allows and keep a case limit only if every source has it', () => {
  const lower = (source: string) => [`${source}:no-mixed-case`, `${source}:no-upper-case`];
  const table = decorators([
    keywords({ dfv: ['binutils:flags'], sae: lower('binutils'), z: lower('binutils') }),
    keywords({
      dfv: ['llvm:flags'],
      rn: ['llvm:dashed', ...lower('llvm')],
      sae: [],
      z: lower('llvm'),
    }),
  ]);
  assert.deepStrictEqual(table.entries(), [
    ['dfv', ['DECORATOR_FLAGS']],
    ['rn', ['CASE_NO_MIXED', 'CASE_NO_UPPER', 'DECORATOR_DASHED']],
    ['sae', []],
    ['z', ['CASE_NO_MIXED', 'CASE_NO_UPPER']],
  ]);
});

test('caseNames maps every case tag and ignores the others', () => {
  assert.deepStrictEqual(
    caseNames([keywords({
      a: ['x:no-lower-case'],
      b: ['x:no-upper-case'],
      c: ['x:no-mixed-case'],
      d: ['x:other'],
    })]).entries(),
    [
      ['a', ['CASE_NO_LOWER']],
      ['b', ['CASE_NO_UPPER']],
      ['c', ['CASE_NO_MIXED']],
      ['d', []],
    ],
  );
});

test('shiftWords prefer an extend across sources, in either order', () => {
  const shift = keywords({ lsl: ['binutils:shift', 'binutils:no-mixed-case'], uxtw: ['b:shift'] });
  const extend = keywords({ lsl: ['llvm:shift'], uxtw: ['llvm:extend'] });
  const expected = [
    ['lsl', 'SHIFT_WORD', []],
    ['uxtw', 'EXTEND_WORD', []],
  ];
  assert.deepStrictEqual(shapedRows(shiftWords([shift, extend])), expected);
  assert.deepStrictEqual(shapedRows(shiftWords([extend, shift])), expected);
});

test('shiftWords stop on a word that is neither a shift nor an extend', () => {
  assertThrowsIncluding(
    () => shiftWords([keywords({ x: ['llvm:other'] })]),
    'the shift word x is neither a shift nor an extend',
  );
});

test('syntaxWords give each word the token its sources agree on, as written', () => {
  const lower = (source: string) => [`${source}:no-mixed-case`, `${source}:no-upper-case`];
  const shaped = syntaxWords([
    keywords({
      noprefix: ['binutils:naked:-1', ...lower('binutils')],
      prefix: ['binutils:naked:1', ...lower('binutils')],
    }),
    keywords({
      noprefix: ['llvm:syntax:intel', ...lower('llvm')],
      prefix: ['llvm:syntax:att', ...lower('llvm')],
    }),
  ]);
  assert.deepStrictEqual(shapedRows(shaped), [
    ['noprefix', 'SYNTAX_NOPREFIX', ['CASE_NO_MIXED', 'CASE_NO_UPPER']],
    ['prefix', 'SYNTAX_PREFIX', ['CASE_NO_MIXED', 'CASE_NO_UPPER']],
  ]);
});

test('syntaxWords stop on a word whose sources disagree or that has no token', () => {
  assertThrowsIncluding(
    () =>
      syntaxWords([
        keywords({ x: ['binutils:naked:1'] }),
        keywords({ x: ['llvm:syntax:intel'] }),
      ]),
    'x has the roles SYNTAX_NOPREFIX, SYNTAX_PREFIX',
  );
  assertThrowsIncluding(
    () => syntaxWords([keywords({ x: ['binutils:naked:2'] })]),
    'x has the roles none',
  );
});

test('cppDirectives take the token from the handler, or from the word for the elif family', () => {
  const handled = (handler: string) => [`llvm:handler:${handler}`];
  const shaped = cppDirectives(keywords({
    assert: handled('none'),
    define: handled('HandleDefineDirective'),
    elif: handled('HandleElifFamilyDirective'),
    elifdef: handled('HandleElifFamilyDirective'),
    embed: handled('HandleEmbedDirective'),
    if: handled('HandleIfDirective'),
    ifdef: handled('HandleIfdefDirective'),
    import: handled('HandleImportDirective'),
    pragma: handled('HandlePragmaDirective'),
    unassert: handled('none'),
  }));
  assert.deepStrictEqual(shapedRows(shaped), [
    ['assert', 'PREPROC_DIRECTIVE', []],
    ['define', 'PREPROC_DEFINE', []],
    ['elif', 'PREPROC_CONDITION', []],
    ['elifdef', 'PREPROC_DIRECTIVE', []],
    ['embed', 'PREPROC_INCLUDE', []],
    ['if', 'PREPROC_CONDITION', []],
    ['ifdef', 'PREPROC_DIRECTIVE', []],
    ['import', 'PREPROC_INCLUDE', []],
    ['pragma', 'PREPROC_DIRECTIVE', []],
    ['unassert', 'PREPROC_DIRECTIVE', []],
  ]);
});

test('cppDirectives stop on a handler they have no form for', () => {
  for (
    const [word, handler] of [
      ['new', 'HandleNewDirective'],
      ['new', 'none'],
      ['elifnew', 'HandleElifFamilyDirective'],
      ['assert', 'HandleAssertDirective'],
    ]
  ) {
    assertThrowsIncluding(
      () => cppDirectives(keywords({ [word]: [`llvm:handler:${handler}`] })),
      `#${word}: the handler ${handler} has no shape`,
    );
  }
  assertThrowsIncluding(() => cppDirectives(plain('new')), '#new: the handler undefined');
});
