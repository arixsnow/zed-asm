// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';

import {
  bracedRegisters,
  decorators,
  directiveSections,
  listWords,
  operandWords,
  parameterlessMacros,
  preprocessorStructure,
  standardMacros,
  type TokenRow,
  tokenRows,
  tokenType,
} from '../../scripts/lib/keywords/nasm.ts';
import { assertThrowsIncluding } from '../lib/assert.ts';
import { broken, sourceTree, testReaders } from '../lib/keyword-sources.ts';

const PREPROCESSOR = 'asm/preproc.c';
const TOKENS = 'asm/tokens.dat';
const CONDITIONS = 'asm/pptok.dat';
const REGISTERS = 'x86/regs.dat';
const STANDARD = 'macros/standard.mac';

function row(name: string, type: string, flags = ['0'], value = '0'): TokenRow {
  return { name, type, flags, value };
}

test('tokenType fills a pattern with the word, in upper case', () => {
  assert.strictEqual(tokenType('S_*', 'abs'), 'S_ABS');
  assert.strictEqual(tokenType('FLT_{__?*?__}', '__?float32?__'), 'FLT_FLOAT32');
  assert.strictEqual(tokenType('TOKEN_ID', 'x'), 'TOKEN_ID');
  assert.strictEqual(tokenType('0', 'x'), '0');
});

test('tokenType stops on a word that does not fit the pattern', () => {
  assertThrowsIncluding(
    () => tokenType('FLT_{__?*?__}', 'float32'),
    '"float32" does not fit the pattern FLT_{__?*?__}',
  );
});

const TOKEN_FILE = `# A comment
% TOKEN_SIZE, SIZE_*, 0, S_*
BYTE

% TOKEN_SPECIAL, 0, 0, S_*
abs
% TOKEN_ID, 0, TFLAG_WARN, 0
ptr
% TOKEN_PREFIX, PPS_REX, TFLAG_BRC|TFLAG_BRC_OPT, P_*
rex
`;

test('tokenRows read each word under its header', () => {
  assert.deepStrictEqual(tokenRows(sourceTree('nasm-tokens', { [TOKENS]: TOKEN_FILE })), [
    row('byte', 'TOKEN_SIZE', ['0'], 'S_BYTE'),
    row('abs', 'TOKEN_SPECIAL', ['0'], 'S_ABS'),
    row('ptr', 'TOKEN_ID', ['TFLAG_WARN'], '0'),
    row('rex', 'TOKEN_PREFIX', ['TFLAG_BRC', 'TFLAG_BRC_OPT'], 'P_REX'),
  ]);
});

test('tokenRows stop on a header or a first word they cannot read', () => {
  const files = { [TOKENS]: TOKEN_FILE };
  assertThrowsIncluding(
    () =>
      tokenRows(
        sourceTree(
          'nasm-tokens-header',
          broken(files, {
            file: TOKENS,
            from: '% TOKEN_SPECIAL, 0, 0, S_*',
            to: '% TOKEN_SPECIAL, 0, 0',
          }),
        ),
      ),
    'unexpected token header "% TOKEN_SPECIAL, 0, 0"',
  );
  assertThrowsIncluding(
    () => tokenRows(sourceTree('nasm-tokens-first', { [TOKENS]: 'abs\n' })),
    '"abs" comes before any token header',
  );
});

test('operandWords tag each named token and its case-free aliases, leaving other readers out', () => {
  const rows = [
    row('__?float32?__', 'TOKEN_FLOATIZE', ['0'], 'FLOAT32'),
    row('<<', 'TOKEN_SHL'),
    row('rex', 'TOKEN_PREFIX', ['TFLAG_BRC'], 'P_REX'),
    row('times', 'TOKEN_TIMES'),
    row('z', 'TOKEN_DECORATOR'),
    row('dfv=', 'TOKEN_BRCCONST'),
    row('ptr', 'TOKEN_ID', ['TFLAG_WARN']),
  ];
  const tree = sourceTree('nasm-operands', {
    [STANDARD]: '%idefalias __float32__ __?float32?__\n%idefalias __OTHER__ __?other?__\n',
  });
  assert.deepStrictEqual(operandWords(tree, rows).entries(), [
    ['__?float32?__', ['nasm:token:TOKEN_FLOATIZE', 'nasm:value:FLOAT32']],
    ['__float32__', ['nasm:token:TOKEN_FLOATIZE', 'nasm:value:FLOAT32']],
    ['ptr', ['nasm:flag:TFLAG_WARN', 'nasm:token:TOKEN_ID', 'nasm:value:0']],
  ]);
});

test('operandWords stop on an alias of a token in one case only', () => {
  const tree = sourceTree('nasm-operands-case', {
    [STANDARD]: '%defalias __float32__ __?float32?__\n',
  });
  assertThrowsIncluding(
    () => operandWords(tree, [row('__?float32?__', 'TOKEN_FLOATIZE')]),
    '__float32__ names the token __?float32?__ in one case only',
  );
});

test('decorators read the decorator rows and split each braced constant at its =', () => {
  const tables = decorators([
    row('1to8', 'TOKEN_DECORATOR'),
    row('z', 'TOKEN_DECORATOR'),
    row('dfv=of', 'TOKEN_BRCCONST'),
    row('dfv=', 'TOKEN_BRCCONST'),
    row('abs', 'TOKEN_SPECIAL'),
  ]);
  assert.deepStrictEqual(tables.decorators.entries(), [
    ['1to8', []],
    ['dfv', ['nasm:flags']],
    ['z', []],
  ]);
  assert.deepStrictEqual(tables.defaultFlags.entries(), [['of', []]]);
});

test('decorators stop on a constant without = and on an empty result', () => {
  assertThrowsIncluding(
    () => decorators([row('dfv', 'TOKEN_BRCCONST')]),
    'the braced constant "dfv" has no',
  );
  assertThrowsIncluding(
    () => decorators([row('z', 'TOKEN_DECORATOR')]),
    'lists no decorator or no dfv= flag',
  );
});

const CONDITION_FILE = `# A comment
%if*
%elif*
*
*def
*macro
*_BOGUS
%!macro
%!assign      # a comment
%else
`;

test('preprocessorStructure pairs each stem with each tail, plain and negated', () => {
  const { conditions, casePairs } = preprocessorStructure(
    sourceTree('nasm-conditions', { [CONDITIONS]: CONDITION_FILE }),
  );
  assert.deepStrictEqual(
    [...conditions].map(([word, { stem, tail }]) => `${word} ${stem} ${tail}`),
    [
      '%if if ',
      '%ifn if ',
      '%ifdef if def',
      '%ifndef if def',
      '%ifmacro if macro',
      '%ifnmacro if macro',
      '%elif elif ',
      '%elifn elif ',
      '%elifdef elif def',
      '%elifndef elif def',
      '%elifmacro elif macro',
      '%elifnmacro elif macro',
    ],
  );
  assert.deepStrictEqual(
    [...casePairs],
    [['%imacro', '%macro'], ['%iassign', '%assign']],
  );
});

test('preprocessorStructure stops without stems, tails or case pairs', () => {
  for (
    const from of [
      '%if*\n%elif*\n',
      '*\n*def\n*macro\n*_BOGUS\n',
      '%!macro\n%!assign      # a comment\n',
    ]
  ) {
    assertThrowsIncluding(
      () =>
        preprocessorStructure(
          sourceTree(
            'nasm-conditions-empty',
            broken({ [CONDITIONS]: CONDITION_FILE }, { file: CONDITIONS, from, to: '' }),
          ),
        ),
      'no condition stems, tails or case pairs',
    );
  }
});

test('bracedRegisters expand the ranges of the rows that may stand in braces', () => {
  const tree = sourceTree('nasm-braced', {
    [REGISTERS]: `# A comment
al\t\tREG_AL\t\treg8,reg8_rex\t0
k0\t\tOPMASK0\t\topmask0\t\t0
k1-3\t\tOPMASKREG\topmaskreg\t1   TFLAG_BRC_OPT
r8-9d\t\tREG_GPR\t\treg32\t\t8 & 16  TFLAG_BRC_OPT
xmm\t\tREG_XMM\t\txmmreg\t\t0   TFLAG_BRC_OPT|TFLAG_OTHER
`,
  });
  assert.deepStrictEqual(bracedRegisters(tree), ['k1', 'k2', 'k3', 'r8d', 'r9d', 'xmm']);
});

test('bracedRegisters stop when no register may stand in braces', () => {
  assertThrowsIncluding(
    () => bracedRegisters(sourceTree('nasm-braced-none', { [REGISTERS]: 'al REG_AL reg8 0\n' })),
    'no register may stand in braces',
  );
});

test('directiveSections group words by section, in lower case, without comments', () => {
  assert.deepStrictEqual(
    [...directiveSections(`; A comment
ABSOLUTE
bits   ; a trailing comment

#special pseudo_ops
db
#if other
DQ
#special none = 0
`)],
    [['', ['absolute', 'bits']], ['pseudo_ops', ['db', 'dq']]],
  );
});

testReaders('nasm', [
  {
    name: 'listWords',
    read: listWords,
    files: {
      [PREPROCESSOR]: `
static bool parse_mmacro_spec(Token *tline, MMacro *def)
{
    if (tline && tok_is(tline->next, TOKEN_ID) &&
        tline->next->len == 7 &&
        !nasm_stricmp(tline->next->text.a, ".nolist")) {
        tline = tline->next;
    }
}
static int do_directive(Token *tline)
{
    switch (op) {
    case PP_REP:
    {
        if (tok_is(tline, TOKEN_ID) && tline->len == 7 &&
            !nasm_memicmp(tline->text.a, ".nolist", 7)) {
            tline = skip_white(tline->next);
        }
    }
    }
}
`,
    },
    expected: [['.nolist', []]],
    breakages: [
      {
        file: PREPROCESSOR,
        from: '!nasm_stricmp(tline->next->text.a, ".nolist")',
        to: '!strcmp(tline->next->text.a, ".nolist")',
        stops: 'a macro count or %rep no longer takes a list word in any case',
      },
      {
        file: PREPROCESSOR,
        from: '!nasm_memicmp(tline->text.a, ".nolist", 7)',
        to: '!memcmp(tline->text.a, ".nolist", 7)',
        stops: 'a macro count or %rep no longer takes a list word in any case',
      },
    ],
  },
]);

test('parameterlessMacros read the macros that take exactly no parameters', () => {
  assert.deepStrictEqual(
    parameterlessMacros(
      '%imacro ENDSTRUC 0.nolist\n%imacro iend 0\n%imacro any 0-*.nolist\n%imacro at 1-2+.nolist\n',
    ),
    ['endstruc', 'iend'],
  );
});

test('standardMacros read each case-free macro and stop on none', () => {
  assert.deepStrictEqual(
    standardMacros('%imacro STRUC 1-2\n%macro other 0\n%imacro istruc 1\n', 'it'),
    ['struc', 'istruc'],
  );
  assertThrowsIncluding(() => standardMacros('%macro other 0\n', 'it'), 'it: no %imacro');
});
