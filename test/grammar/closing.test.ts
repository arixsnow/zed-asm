// SPDX-License-Identifier: MIT

import { assertEquals } from '@std/assert';

import { type Arch, manifest } from '../../scripts/lib/manifest.ts';
import { GrammarSets, lexes, readGrammar, type TokenSet, union } from '../lib/grammar-sets.ts';
import { parseFiles, PRINTABLE } from '../lib/parse.ts';

interface Position {
  name: string;
  token: string;
  prefix: string;
  opens: (sets: GrammarSets) => TokenSet;
  externals: string[];
  arch?: Arch;
}

const POSITIONS: Position[] = [
  {
    name: 'after a comma',
    token: '_missing_operand',
    prefix: 'mov r0, ',
    opens: (sets) => sets.first.get('_instruction_operand') as TokenSet,
    externals: ['_hash', '_at_type', '_missing_expression', '_dollar_label', '_darwin_argument'],
  },
  {
    name: 'after an operator',
    token: '_missing_expression',
    prefix: 'mov r0, 1 + ',
    opens: (sets) => sets.first.get('_expression') as TokenSet,
    externals: ['_missing_expression', '_dollar_label', '_darwin_argument'],
  },
  {
    name: 'inside a parenthesis',
    token: '_unclosed',
    prefix: 'mov r0, (a ',
    opens: (sets) => sets.continuations('_expression'),
    externals: ['_unclosed', '_at_attached', '_glued_argument', '_glued_separator', '_glued_text'],
  },
  {
    name: 'inside a bracket',
    token: '_unclosed_bracket',
    prefix: 'str r0, [a ',
    opens: (sets) => sets.continuations('memory_operand', '_expression'),
    externals: [
      '_unclosed',
      '_unclosed_bracket',
      '_at_attached',
      '_glued_argument',
      '_glued_separator',
      '_glued_text',
    ],
    arch: 'arm',
  },
  {
    name: 'inside a register list',
    token: '_unclosed_brace',
    prefix: 'ld1 {v0.16b ',
    opens: (sets) =>
      union(
        sets.continuations('register_list', '_list_element'),
        sets.following('register_range', '_register_name'),
        sets.following('indexed_register', '_register_name'),
      ),
    externals: ['_unclosed_brace'],
    arch: 'arm',
  },
];

const SCANNED: Record<string, string> = { gas: '/#@;', nasm: ';' };
const FOLLOWERS = ['a', '='];
const LEX = /^lex_external state:\d+, row:0, column:(\d+)$/;

function afterBlank(set: TokenSet): TokenSet {
  const terminals = [...set.terminals].filter(([, rule]) => rule.type !== 'IMMEDIATE_TOKEN');
  return { ...set, terminals: new Map(terminals) };
}

function closingColumns(log: string, token: string): number[] {
  const columns: number[] = [];
  let column = -1;
  for (const line of log.split('\n')) {
    const lex = LEX.exec(line);
    if (lex !== null) {
      column = Number(lex[1]);
    } else if (line.startsWith(`lexed_lookahead sym:${token},`)) {
      columns.push(column);
    }
  }
  return columns;
}

Deno.test('the scanner closes an open construct exactly before characters the grammar cannot continue with', () => {
  const failures: string[] = [];
  for (const { grammar, syntax, archs } of manifest.languages) {
    const sets = new GrammarSets(readGrammar(grammar));
    const positions = POSITIONS.filter(({ arch }) => arch === undefined || archs.includes(arch));
    const opened = new Map(
      positions.map((position) => [position, afterBlank(position.opens(sets))]),
    );
    const checked = PRINTABLE.filter((char) => char !== ' ' && !SCANNED[syntax].includes(char));
    const cases = positions.flatMap((position) =>
      checked.flatMap((char) => FOLLOWERS.map((follower) => ({ position, typed: char + follower })))
    );
    const sources = cases.map(({ position, typed }) => `${position.prefix}${typed}\n`);
    const { output } = parseFiles(grammar, 'closing', sources, ['--debug']);
    const logs = output.split(/^new_parse$/m).slice(1);
    assertEquals(logs.length, cases.length, `${grammar}: one log per case`);
    for (const position of positions) {
      const unexpected = [...(opened.get(position) as TokenSet).externals].filter((name) =>
        !position.externals.includes(name)
      );
      if (unexpected.length > 0) {
        failures.push(`${grammar} ${position.name}: scanner-owned tokens ${unexpected.join(', ')}`);
      }
    }
    for (const [index, { position, typed }] of cases.entries()) {
      const expected = !lexes(opened.get(position) as TokenSet, typed);
      const closed = closingColumns(logs[index], position.token).includes(
        position.prefix.length - 1,
      );
      if (closed !== expected) {
        failures.push(
          `${grammar} ${position.name} ${JSON.stringify(typed)}: ${
            closed ? 'closes' : 'stays open'
          }, the grammar says it should ${expected ? 'close' : 'stay open'}`,
        );
      }
    }
  }
  assertEquals(failures, []);
});
