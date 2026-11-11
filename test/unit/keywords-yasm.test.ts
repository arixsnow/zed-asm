// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';

import { gperfRows, x86Registers } from '../../scripts/lib/keywords/yasm.ts';
import { assertThrowsIncluding } from '../lib/assert.ts';
import { testReaders } from '../lib/keyword-sources.ts';

const REGISTERS = 'modules/arch/x86/x86regtmod.gperf';

test('gperfRows read the keyword section only, skipping blanks and preprocessor lines', () => {
  const text = `%{
#include "a.h"
%}
struct x;
%%
#if 1
add,\tadd_insn,\t1
#endif

lock,\tNULL
%%
int after;
`;
  assert.deepStrictEqual(gperfRows(text, 'it'), [['add', 'add_insn', '1'], ['lock', 'NULL']]);
});

test('gperfRows stop without a keyword section', () => {
  assertThrowsIncluding(() => gperfRows('add, add_insn\n', 'it'), 'it has no %% keyword section');
});

testReaders('yasm', [
  {
    name: 'x86Registers',
    read: x86Registers,
    files: {
      [REGISTERS]: `%%
AX,\tREG,\tX86_REG16,\t0,\t0
cs,\tSEGREG,\t0x2e,\t0x01,\t0
st,\tREGGROUP,\t0,\tX86_FPUREG,\t0
st0,\tREG,\tX86_FPUREG,\t0,\t0
st1,\tREG,\tX86_FPUREG,\t1,\t0
near,\tTARGETMOD,\tX86_NEAR,\t0,\t0
`,
    },
    expected: [
      ['ax', []],
      ['cs', []],
      ['st', ['index:2']],
      ['st0', []],
      ['st1', []],
    ],
    breakages: [
      {
        file: REGISTERS,
        from: 'cs,\tSEGREG,\t0x2e,\t0x01,\t0',
        to: 'cs,\tSEGREG,\t0x2e,\t0x01',
        stops: 'unexpected register row "cs, SEGREG, 0x2e, 0x01"',
      },
      {
        file: REGISTERS,
        from: 'near,\tTARGETMOD,',
        to: 'near,\tNEWKIND,',
        stops: 'unexpected register kind "NEWKIND" of near',
      },
      {
        file: REGISTERS,
        from: 'st,\tREGGROUP,\t0,\tX86_FPUREG,\t0',
        to: 'st,\tREGGROUP,\t0,\tX86_OTHER,\t0',
        stops: 'the register group st has no registers',
      },
    ],
  },
]);
