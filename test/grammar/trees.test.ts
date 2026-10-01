// SPDX-License-Identifier: MIT

import { assert, assertEquals } from '@std/assert';
import { join } from '@std/path';

import { ROOT } from '../../scripts/lib/files.ts';
import { fixtures } from '../../scripts/verify-fixtures.ts';
import { parseFiles, treeText } from '../lib/parse.ts';

const SLOT = '{}';
const STAND_IN = '*';
const WIDE_CHARACTERS = [0xe9, 0x2713, 0x8fd4, 0x1f600].map((codePoint) =>
  String.fromCodePoint(codePoint)
);

const GNU = ['asm_auto', 'asm_arm', 'asm_arm_apple', 'asm_x86_gas'];

const UNICODE_CASES: [string, string[]][] = [
  ['// {}', GNU],
  ['/* {} */', GNU],
  ['start: nop // {}', GNU],
  ['.ascii "{}", "a{}#b"', GNU],
  ['#define X 1 // {}', GNU],
  ['#define S "{}"', GNU],
  ['nop # {}', ['asm_auto', 'asm_x86_gas']],
  ['nop #{}', ['asm_auto', 'asm_x86_gas']],
  ['nop @ {}', ['asm_auto', 'asm_arm']],
  ['nop @{}', ['asm_auto', 'asm_arm']],
  ['nop ; {}', ['asm_auto', 'asm_arm_apple', 'asm_x86_nasm']],
  ['; {}', ['asm_x86_nasm']],
  ['db "{}", \'{}\', `{}`', ['asm_x86_nasm']],
];

interface Parse {
  clean: boolean;
  recovered: boolean;
  tree: string;
}

function parse(grammar: string, source: string): Parse {
  const { ok, output } = parseFiles(grammar, 'trees', [source]);
  const log = parseFiles(grammar, 'trees', [source], ['--debug']).output;
  const tree = treeText(output)
    .replaceAll(/ \[\d+, \d+\] - \[\d+, \d+\]/g, '')
    .trim();
  const recovered = /\bdetect_error\b/.test(log);
  return { clean: ok && !recovered && !/\((ERROR|MISSING)/.test(tree), recovered, tree };
}

const ROOT_NODE = /^\(source_file \[\d+, \d+\] - \[(\d+), (\d+)\]/;
const BLOCK_NODE =
  /\((macro_definition|conditional|repeat_block) \[(\d+), \d+\] - \[(\d+), (\d+)\]/g;

function blocksOpenToEnd(grammar: string, source: string): string[] {
  const tree = treeText(parseFiles(grammar, 'trees', [source]).output).trim();
  const end = ROOT_NODE.exec(tree);
  assert(end !== null, `${grammar}: no tree for ${JSON.stringify(source)}`);
  return [...tree.matchAll(BLOCK_NODE)]
    .filter(([, , , row, column]) => row === end[1] && column === end[2])
    .map(([, type, row]) => `${type} opened on line ${Number(row) + 1}`);
}

function assertClean(grammar: string, baseline: Parse, label: string): void {
  assert(baseline.clean, `${grammar}: ${label} does not parse cleanly:\n${baseline.tree}`);
}

Deno.test('the recovery check reads the parser log, not only the printed tree', () => {
  const valid = parse('asm_x86_gas', 'nop\nret\n');
  assert(valid.clean && !valid.recovered, 'a valid file must parse without recovery');
  const broken = parse('asm_x86_gas', 'nop )\n');
  assert(broken.recovered && !broken.clean, 'a syntax error must show up in the log');
});

Deno.test('UTF-8 text parses exactly like ASCII text of the same kind', () => {
  for (const [template, grammars] of UNICODE_CASES) {
    for (const grammar of grammars) {
      const expected = parse(grammar, `${template.replaceAll(SLOT, STAND_IN)}\n`);
      assertClean(grammar, expected, JSON.stringify(template));
      for (const character of WIDE_CHARACTERS) {
        const source = `${template.replaceAll(SLOT, character)}\n`;
        assertEquals(parse(grammar, source), expected, `${grammar}: ${JSON.stringify(source)}`);
      }
    }
  }
});

Deno.test('every fixture parses cleanly, closes every block it opens, and parses the same with CRLF line endings and without a final newline', () => {
  for (const { file, grammars } of fixtures()) {
    const lf = Deno.readTextFileSync(join(ROOT, file)).replaceAll('\r\n', '\n');
    const variants: [string, string][] = [
      ['CRLF', lf.replaceAll('\n', '\r\n')],
      ['no final newline', lf.replace(/\n$/, '')],
    ];
    for (const grammar of grammars) {
      const expected = parse(grammar, lf);
      assertClean(grammar, expected, file);
      assertEquals(blocksOpenToEnd(grammar, lf), [], `${grammar}: ${file} leaves blocks open`);
      for (const [label, source] of variants) {
        assertEquals(parse(grammar, source), expected, `${grammar}: ${file} (${label})`);
      }
    }
  }
});
