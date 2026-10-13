// SPDX-License-Identifier: MIT

import { assert, assertEquals } from '@std/assert';

import { type Arch, type Dialect, manifest } from '../../scripts/lib/manifest.ts';
import { lexes, readGrammar } from '../lib/grammar-sets.ts';
import { ParseTable } from '../lib/parse-table.ts';
import { parseFiles, PRINTABLE } from '../lib/parse.ts';

interface Position {
  name: string;
  token: string;
  prefix: string;
  preamble?: string;
  arch?: Arch;
  syntax?: string;
  dialects?: Dialect[];
}

const POSITIONS: Position[] = [
  { name: 'after a comma', token: '_missing_operand', prefix: 'mov r0, ' },
  {
    name: 'after a comma in directive arguments',
    token: '_missing_argument',
    prefix: '.word a, ',
    syntax: 'gas',
  },
  {
    name: 'after a macro directive',
    token: '_missing_identifier',
    prefix: '.macro ',
    syntax: 'gas',
  },
  {
    name: 'after a comma in macro parameters',
    token: '_missing_identifier',
    prefix: '.macro m a, ',
    syntax: 'gas',
  },
  {
    name: 'after a parameter qualifier colon',
    token: '_missing_identifier',
    prefix: '.macro m a: ',
    syntax: 'gas',
  },
  {
    name: 'after a repeat directive',
    token: '_missing_identifier',
    prefix: '.irp ',
    syntax: 'gas',
  },
  {
    name: 'after a comma in repeat values',
    token: '_missing_argument',
    prefix: '.irp r, a, ',
    syntax: 'gas',
  },
  { name: 'after an operator', token: '_missing_expression', prefix: 'mov r0, 1 + ' },
  { name: 'after a blank between operands', token: '_missing_operand', prefix: 'm a ' },
  {
    name: 'after a keyword argument name',
    token: '_missing_argument',
    prefix: 'm k= ',
    syntax: 'gas',
  },
  {
    name: 'after a parameter default sign',
    token: '_missing_argument',
    prefix: '.macro m a= ',
    syntax: 'gas',
  },
  {
    name: 'after a blank between repeat values',
    token: '_missing_argument',
    prefix: '.irp r a ',
    dialects: ['AUTO', 'ARM', 'X86_GAS'],
  },
  { name: 'inside a parenthesis', token: '_unclosed', prefix: 'mov r0, (a ' },
  { name: 'inside a parenthesis after a number', token: '_unclosed', prefix: 'mov r0, (1 ' },
  {
    name: 'inside an empty macro call',
    token: '_unclosed_arguments',
    prefix: 'mov r0, F( ',
    syntax: 'gas',
  },
  {
    name: 'inside a macro call',
    token: '_unclosed_arguments',
    prefix: 'mov r0, F(a ',
    syntax: 'gas',
  },
  {
    name: 'after a comma in a macro call',
    token: '_unclosed_arguments',
    prefix: 'mov r0, F(a, ',
    syntax: 'gas',
  },
  {
    name: 'inside statement arguments',
    token: '_unclosed_arguments',
    prefix: 'm (a, b ',
    syntax: 'gas',
  },
  {
    name: 'after a comma before a label',
    token: '_missing_label_operand',
    prefix: 'cbz x0, ',
    arch: 'arm',
  },
  {
    name: 'after a blank before a label',
    token: '_missing_label_operand',
    prefix: 'cbz x0 ',
    dialects: ['AUTO', 'ARM'],
  },
  {
    name: 'after a blank after the last role operand',
    token: '_missing_operand',
    prefix: 'cbz x0, l ',
    dialects: ['AUTO', 'ARM'],
  },
  {
    name: 'after a comma before a condition',
    token: '_missing_operand',
    prefix: 'csel x0, x1, x2, ',
    arch: 'arm',
  },
  {
    name: 'inside a bracket',
    token: '_unclosed_bracket',
    prefix: 'str r0, [a ',
    arch: 'arm',
  },
  {
    name: 'inside a bracket after a register',
    token: '_unclosed_bracket',
    prefix: 'str r0, [x1 ',
    arch: 'arm',
  },
  {
    name: 'after a comma in a memory operand',
    token: '_missing_element',
    prefix: 'ldr x0, [x1, ',
    arch: 'arm',
  },
  {
    name: 'inside a bracket after an offset',
    token: '_unclosed_bracket',
    prefix: 'ldr x0, [x1, #4 ',
    arch: 'arm',
  },
  {
    name: 'inside a bracket after an index register',
    token: '_unclosed_bracket',
    prefix: 'ldr x0, [x1, x2 ',
    arch: 'arm',
  },
  {
    name: 'inside a bracket after a shift',
    token: '_unclosed_bracket',
    prefix: 'ldr x0, [x1, x2, lsl #3 ',
    arch: 'arm',
  },
  {
    name: 'inside a bracket after an alignment',
    token: '_unclosed_bracket',
    prefix: 'vld1.8 {d0}, [r0 :64 ',
    arch: 'arm',
  },
  {
    name: 'inside a register index',
    token: '_unclosed_bracket',
    prefix: 'ins v0.s[1 ',
    arch: 'arm',
  },
  {
    name: 'inside a register index after a range',
    token: '_unclosed_bracket',
    prefix: 'mova za0h.s[w12, 0:3 ',
    arch: 'arm',
  },
  {
    name: 'inside a register list index',
    token: '_unclosed_index',
    prefix: 'ld1 {v0.s}[1 ',
    arch: 'arm',
  },
  { name: 'after a brace', token: '_missing_name', prefix: 'push { ', arch: 'arm' },
  { name: 'inside a register list', token: '_unclosed_brace', prefix: 'ld1 {v0.16b ', arch: 'arm' },
  {
    name: 'inside a register list after a range',
    token: '_unclosed_brace',
    prefix: 'push {r0-r3 ',
    arch: 'arm',
  },
  {
    name: 'after a comma in a register list',
    token: '_missing_name',
    prefix: 'push {r0, ',
    arch: 'arm',
  },
  { name: 'after a range dash', token: '_missing_name', prefix: 'push {r0- ', arch: 'arm' },
  {
    name: 'after a register alias directive',
    token: '_missing_name',
    prefix: 'x .req ',
    arch: 'arm',
  },
  {
    name: 'after a comma in CFI register arguments',
    token: '_missing_register_argument',
    prefix: '.cfi_register r0, ',
    arch: 'arm',
  },
  {
    name: 'after a comma in unwind arguments',
    token: '_missing_register_argument',
    prefix: '.save {r4}, ',
    dialects: ['AUTO', 'ARM'],
  },
  {
    name: 'after a comma in a linker hint',
    token: '_missing_symbol',
    prefix: '.loh AdrpAdd L1, ',
    dialects: ['ARM_APPLE'],
  },
  {
    name: 'after a relocation colon',
    token: '_missing_relocation',
    prefix: 'add x0, x0, : ',
    dialects: ['AUTO', 'ARM'],
  },
  {
    name: 'after a relocation name',
    token: '_missing_relocation',
    prefix: 'add x0, x0, :lo12 ',
    dialects: ['AUTO', 'ARM'],
  },
  {
    name: 'after a relocation operator',
    token: '_missing_expression',
    prefix: 'add x0, x0, :lo12: ',
    dialects: ['AUTO', 'ARM'],
  },
  {
    name: 'inside an empty suffix relocation',
    token: '_missing_relocation',
    prefix: '.word 1( ',
    dialects: ['AUTO', 'ARM'],
  },
  {
    name: 'inside a suffix relocation',
    token: '_unclosed',
    prefix: '.word x(GOT ',
    dialects: ['AUTO', 'ARM'],
  },
  {
    name: 'after a pseudo-prefix',
    token: '_missing_name',
    prefix: '{vex} ',
    arch: 'x86',
    syntax: 'gas',
  },
  {
    name: 'inside a parenthesis that may hold memory',
    token: '_missing_expression',
    prefix: 'movq ( ',
    arch: 'x86',
    syntax: 'gas',
  },
  {
    name: 'after a register in an AT&T memory operand',
    token: '_unclosed_memory',
    prefix: 'movq 8(%rax ',
    arch: 'x86',
    syntax: 'gas',
  },
  {
    name: 'after a comma in an AT&T memory operand',
    token: '_unclosed_memory',
    prefix: 'movq 8(%rax, ',
    arch: 'x86',
    syntax: 'gas',
  },
  {
    name: 'after an index register in an AT&T memory operand',
    token: '_unclosed_memory',
    prefix: 'movq 8(%rax,%rbx ',
    arch: 'x86',
    syntax: 'gas',
  },
  {
    name: 'after a scale in an AT&T memory operand',
    token: '_unclosed',
    prefix: 'movq 8(%rax,%rbx,4 ',
    arch: 'x86',
    syntax: 'gas',
  },
  {
    name: 'before the first Intel operand',
    token: '_missing_operand',
    preamble: '.intel_syntax noprefix\n',
    prefix: 'push ',
    arch: 'x86',
    syntax: 'gas',
  },
  {
    name: 'after a blank between Intel operands',
    token: '_missing_operand',
    preamble: '.intel_syntax noprefix\n',
    prefix: 'm a ',
    arch: 'x86',
    syntax: 'gas',
  },
  {
    name: 'after a decorator in AT&T operands',
    token: '_missing_operand',
    prefix: 'ccmpb {dfv=of} ',
    arch: 'x86',
    syntax: 'gas',
  },
  {
    name: 'after a comma in Intel operands',
    token: '_missing_operand',
    preamble: '.intel_syntax noprefix\n',
    prefix: 'mov rax, ',
    arch: 'x86',
    syntax: 'gas',
  },
  {
    name: 'after an operator in an Intel operand',
    token: '_missing_expression',
    preamble: '.intel_syntax noprefix\n',
    prefix: 'mov rax, 1 + ',
    arch: 'x86',
    syntax: 'gas',
  },
  {
    name: 'inside an Intel parenthesis',
    token: '_unclosed',
    preamble: '.intel_syntax noprefix\n',
    prefix: 'mov rax, (1 ',
    arch: 'x86',
    syntax: 'gas',
  },
  {
    name: 'inside an Intel bracket after a register',
    token: '_unclosed_address',
    preamble: '.intel_syntax noprefix\n',
    prefix: 'mov rax, [rbx ',
    arch: 'x86',
    syntax: 'gas',
  },
  {
    name: 'inside an Intel bracket after a name',
    token: '_unclosed_address',
    preamble: '.intel_syntax noprefix\n',
    prefix: 'mov rax, [x ',
    arch: 'x86',
    syntax: 'gas',
  },
  {
    name: 'inside an Intel bracket after an operator word',
    token: '_unclosed_address',
    preamble: '.intel_syntax noprefix\n',
    prefix: 'mov rax, [x shl 2 ',
    arch: 'x86',
    syntax: 'gas',
  },
  {
    name: 'inside an Intel macro call',
    token: '_unclosed_arguments',
    preamble: '.intel_syntax noprefix\n',
    prefix: 'mov rax, F(x ',
    arch: 'x86',
    syntax: 'gas',
  },
  {
    name: 'inside Intel statement arguments',
    token: '_unclosed_arguments',
    preamble: '.intel_syntax noprefix\n',
    prefix: 'm (a, b ',
    arch: 'x86',
    syntax: 'gas',
  },
];

const SCANNED: Record<string, string> = { gas: '/#@;', nasm: ';' };
const CLOSING = new Set([
  '_missing_operand',
  '_missing_label_operand',
  '_missing_argument',
  '_missing_register_argument',
  '_missing_element',
  '_missing_expression',
  '_missing_name',
  '_missing_identifier',
  '_missing_symbol',
  '_missing_relocation',
  '_unclosed',
  '_unclosed_bracket',
  '_unclosed_index',
  '_unclosed_brace',
  '_unclosed_memory',
  '_unclosed_address',
  '_unclosed_arguments',
]);
const FOLLOWERS = ['a', '='];
const ZERO_WIDTH = new Set([
  '_blank',
  '_intel_operands',
  '_call_arguments',
  '_relocation_suffix',
  '_memory_address',
]);
const PROCESS = /^process version:(\d+), version_count:\d+, state:(\d+), row:(\d+), col:(\d+)$/;
const LEX_EXTERNAL = /^lex_external state:\d+, row:(\d+), column:(\d+)$/;
const LEXED = /^lexed_lookahead sym:(.*), size:\d+$/;

interface Observation {
  states: number[];
  lexed: string | undefined;
  byScanner: boolean;
}

function observe(log: string, row: number, column: number): Observation {
  let target = { row, column };
  let states = new Set<number>();
  let versions = new Set<string>();
  let lexed: string | undefined;
  let byScanner = false;
  let at = false;
  let internal = false;
  let recovering = false;
  let following = false;
  for (const line of log.split('\n')) {
    if (line.startsWith('resume ')) {
      recovering = true;
      continue;
    }
    const process = PROCESS.exec(line);
    if (process !== null) {
      at = false;
      if (following) {
        target = { row: Number(process[3]), column: Number(process[4]) };
        states = new Set();
        versions = new Set();
        lexed = undefined;
        following = false;
      }
      if (
        !recovering && !versions.has(process[1]) && Number(process[3]) === target.row &&
        Number(process[4]) === target.column
      ) {
        versions.add(process[1]);
        states.add(Number(process[2]));
      }
      continue;
    }
    const external = LEX_EXTERNAL.exec(line);
    if (external !== null) {
      at = Number(external[1]) === target.row && Number(external[2]) === target.column;
      internal = false;
      continue;
    }
    if (at && line.startsWith('lex_internal ')) {
      internal = true;
      continue;
    }
    const token = LEXED.exec(line);
    if (at && token !== null && lexed === undefined) {
      lexed = token[1];
      byScanner = !internal;
      following = byScanner && ZERO_WIDTH.has(lexed);
    }
  }
  return { states: [...states], lexed, byScanner };
}

Deno.test('the scanner closes an open construct exactly where the parse table allows nothing else', () => {
  const failures: string[] = [];
  for (const { grammar, dialect, syntax, archs } of manifest.languages) {
    const table = new ParseTable(grammar, readGrammar(grammar));
    const positions = POSITIONS.filter((position) =>
      (position.arch === undefined || archs.includes(position.arch)) &&
      (position.syntax === undefined || position.syntax === syntax) &&
      (position.dialects === undefined || position.dialects.includes(dialect))
    );
    const checked = PRINTABLE.filter((char) => char !== ' ' && !SCANNED[syntax].includes(char));
    const cases = positions.flatMap((position) =>
      checked.flatMap((char) => FOLLOWERS.map((follower) => ({ position, typed: char + follower })))
    );
    const sources = cases.map(({ position, typed }) =>
      `${position.preamble ?? ''}${position.prefix}${typed}\n`
    );
    const { output } = parseFiles(grammar, 'closing', sources, ['--debug']);
    const logs = output.split(/^new_parse$/m).slice(1);
    assertEquals(logs.length, cases.length, `${grammar}: one log per case`);
    for (const [index, { position, typed }] of cases.entries()) {
      const row = (position.preamble ?? '').split('\n').length - 1;
      const seen = observe(logs[index], row, position.prefix.length - 1);
      assert(seen.states.length > 0, `${grammar} ${position.name}: no parse state at the position`);
      const closed = seen.lexed !== undefined && CLOSING.has(seen.lexed);
      if (!closed && !table.acceptsAny(seen.states, CLOSING)) {
        continue;
      }
      if (closed && seen.lexed !== position.token) {
        failures.push(
          `${grammar} ${position.name} ${JSON.stringify(typed)}: closes with ${seen.lexed}`,
        );
      }
      if (!closed && seen.byScanner && seen.lexed !== undefined) {
        continue;
      }
      const continues = lexes(table.internalTokens(seen.states), typed);
      if (closed === continues) {
        failures.push(
          `${grammar} ${position.name} ${JSON.stringify(typed)}: ${
            closed ? 'closes' : 'stays open'
          }, the parse table says it should ${continues ? 'stay open' : 'close'}`,
        );
      }
    }
  }
  assertEquals(failures, []);
});
