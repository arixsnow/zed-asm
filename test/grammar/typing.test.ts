// SPDX-License-Identifier: MIT

import { assertEquals } from '@std/assert';
import { join } from '@std/path';

import { sourcesOf } from '../../scripts/build.ts';
import { filesUnder, ROOT } from '../../scripts/lib/files.ts';
import { type Language, manifest } from '../../scripts/lib/manifest.ts';
import { fixtures } from '../../scripts/verify-fixtures.ts';
import { parseFiles, PRINTABLE, treeText } from '../lib/parse.ts';

interface Node {
  type: string;
  startRow: number;
  endRow: number;
  text: string;
}

interface Block {
  rows: number[];
  parent: Block | null;
}

interface Tree {
  nodes: Node[];
  blocks: Block[];
}

const SPANNING_TYPES = new Set(['block_comment', 'preproc_line', 'preproc_define']);
const BLOCK_TYPES = new Set(['macro_definition', 'conditional', 'repeat_block']);
const CLAUSE_TYPES = new Set(['elseif_clause', 'else_clause']);
const CONTAINER_TYPES = new Set([
  'label_block',
  'body',
  'unclosed_body',
  ...BLOCK_TYPES,
  ...CLAUSE_TYPES,
]);
const HEADER = /^( *)(?:\w+: )?\((\w+) \[(\d+), \d+\] - \[(\d+), (\d+)\]/;

function lastRow(header: RegExpExecArray): number {
  const [startRow, endRow, endColumn] = [3, 4, 5].map((group) => Number(header[group]));
  return endColumn === 0 && endRow > startRow ? endRow - 1 : endRow;
}

function lineNodes(tree: string): Tree {
  const nodes: Node[] = [];
  const blocks: Block[] = [];
  const containers: { depth: number; block: Block | null }[] = [{ depth: 0, block: null }];
  let current: { depth: number; node: Node } | null = null;
  for (const line of tree.split('\n').slice(1).map((text) => text.replace(/\)+$/, ''))) {
    const header = HEADER.exec(line);
    const depth = line.search(/\S/);
    if (current !== null && depth > current.depth) {
      current.node.text += `\n${line.slice(current.depth)}`;
      continue;
    }
    current = null;
    if (header === null) {
      continue;
    }
    while (containers[containers.length - 1].depth >= depth) {
      containers.pop();
    }
    if (CONTAINER_TYPES.has(header[2])) {
      const enclosing = containers.findLast((container) => container.block !== null)?.block ??
        null;
      const block = BLOCK_TYPES.has(header[2])
        ? { rows: [Number(header[3]), lastRow(header)], parent: enclosing }
        : null;
      if (block !== null) {
        blocks.push(block);
      }
      if (CLAUSE_TYPES.has(header[2])) {
        enclosing?.rows.push(Number(header[3]));
      }
      containers.push({ depth, block });
      continue;
    }
    const node = {
      type: header[2],
      startRow: Number(header[3]),
      endRow: lastRow(header),
      text: line.slice(depth),
    };
    nodes.push(node);
    current = { depth, node };
  }
  return { nodes, blocks };
}

function parseAll(grammar: string, sources: string[]): Tree[] {
  const trees = treeText(parseFiles(grammar, 'typing', sources).output)
    .split(/^(?=\(source_file )/m)
    .filter((tree) => tree.startsWith('(source_file '));
  assertEquals(trees.length, sources.length, `${grammar}: one tree per variant`);
  return trees.map(lineNodes);
}

function delimiterRows(blocks: Block[], row: number): number[] {
  const rows: number[] = [];
  for (const block of blocks.filter((candidate) => candidate.rows.includes(row))) {
    for (let current: Block | null = block; current !== null; current = current.parent) {
      rows.push(...current.rows);
    }
  }
  return rows;
}

function enclosingRows(blocks: Block[], row: number): number[] {
  const rows: number[] = [];
  for (
    const block of blocks.filter((candidate) =>
      candidate.rows[0] <= row && row <= candidate.rows[1]
    )
  ) {
    for (let current: Block | null = block; current !== null; current = current.parent) {
      rows.push(...current.rows);
    }
  }
  return rows;
}

function outside(nodes: Node[], first: number, last: number, partners: number[]): string[] {
  return nodes
    .filter((node) => node.endRow < first || node.startRow > last)
    .filter((node) => !partners.includes(node.startRow))
    .map((node) => node.text);
}

interface Variant {
  row: number;
  typed: string;
  source: string;
}

function variants(text: string): Variant[] {
  const lines = text.split('\n');
  const found: Variant[] = [];
  for (const [row, line] of lines.entries()) {
    for (let length = 0; length < line.length; length++) {
      const typed = line.slice(0, length);
      const copy = [...lines];
      copy[row] = typed;
      found.push({ row, typed, source: copy.join('\n') });
    }
  }
  return found;
}

function typingFailures(grammar: string, label: string, text: string): string[] {
  const typing = variants(text);
  const [baseline, ...parsed] = parseAll(grammar, [
    text,
    ...typing.map((variant) => variant.source),
  ]);
  const failures: string[] = [];
  for (const [index, { row, typed }] of typing.entries()) {
    const touching = baseline.nodes.filter((node) => node.startRow <= row && row <= node.endRow);
    const first = Math.min(row, ...touching.map((node) => node.startRow));
    const last = Math.max(row, ...touching.map((node) => node.endRow));
    const delimiters = delimiterRows(baseline.blocks, row);
    const partners = delimiters.length === 0
      ? delimiters
      : [...delimiters, ...enclosingRows(parsed[index].blocks, row)];
    const nodes = parsed[index].nodes;
    const spansByDesign = nodes.some((node) =>
      SPANNING_TYPES.has(node.type) && node.startRow <= last && node.endRow > last
    );
    if (spansByDesign) {
      continue;
    }
    const leaked = nodes.some((node) =>
      node.startRow <= last && node.endRow >= first && (node.startRow < first || node.endRow > last)
    );
    if (
      leaked ||
      outside(baseline.nodes, first, last, partners).join('\n') !==
        outside(nodes, first, last, partners).join('\n')
    ) {
      failures.push(`${grammar} ${label} line ${row + 1}: ${JSON.stringify(typed)}`);
    }
  }
  return failures;
}

function corpusExamples(language: Language): [string, string][] {
  const examples: [string, string][] = [];
  for (const source of [...sourcesOf(language), language.grammar]) {
    const directory = join(ROOT, 'test', 'corpus', source);
    for (const name of filesUnder(directory).filter((file) => file.endsWith('.txt'))) {
      const blocks = Deno.readTextFileSync(join(directory, name)).split(/^={3,}\n(.*)\n={3,}\n/m);
      for (let index = 1; index + 1 < blocks.length; index += 2) {
        const input = blocks[index + 1].split(/^-{3,}\n/m)[0].replace(/^\n/, '').replace(
          /\n+$/,
          '',
        );
        examples.push([`${source}/${name}: ${blocks[index]}`, `${input}\nnop\n`]);
      }
    }
  }
  return examples;
}

Deno.test('a line being typed in a fixture never changes how any other line parses', () => {
  const failures: string[] = [];
  for (const { file, grammars } of fixtures()) {
    const text = Deno.readTextFileSync(join(ROOT, file));
    for (const grammar of grammars) {
      failures.push(...typingFailures(grammar, file, text));
      failures.push(
        ...typingFailures(grammar, `${file} without a final newline`, text.replace(/\n$/, '')),
      );
    }
  }
  assertEquals(failures, []);
});

const UNSUPPORTED: [string, string[]][] = [
  ['ldr x0, [x1, #8]', ['asm_auto', 'asm_arm', 'asm_arm_apple']],
  ['stp x29, x30, [sp, #-16]!', ['asm_auto', 'asm_arm', 'asm_arm_apple']],
  ['add x0, x0, #:lo12:sym', ['asm_auto', 'asm_arm']],
  ['add x0, x0, :lo12:sym', ['asm_auto', 'asm_arm']],
  ['ld1 {v0.16b}, [x0]', ['asm_auto', 'asm_arm', 'asm_arm_apple']],
  ['ldr x1, [x0, _msg@PAGEOFF]', ['asm_arm_apple']],
  ['movq 8(%rsp), %rax', ['asm_auto', 'asm_x86_gas']],
  ['lea (%rax,%rbx,4), %rcx', ['asm_auto', 'asm_x86_gas']],
  ['jmp *%rax', ['asm_auto', 'asm_x86_gas']],
  ['mov eax, dword ptr [rbx]', ['asm_auto', 'asm_x86_gas']],
  ['mov rax, [rbp-8]', ['asm_x86_nasm']],
  ['%define N 4', ['asm_x86_nasm']],
  ['%include "x.inc"', ['asm_x86_nasm']],
  ['[bits 64]', ['asm_x86_nasm']],
  ['%macro m 1\n%endmacro', ['asm_x86_nasm']],
  ['times 4 db 0', ['asm_x86_nasm']],
  ['len equ $ - msg', ['asm_x86_nasm']],
];

Deno.test('syntax the grammars do not parse yet keeps its errors on its own lines', () => {
  const failures: string[] = [];
  for (const [snippet, grammars] of UNSUPPORTED) {
    const text = `${snippet}\nnop\n`;
    const nopRow = snippet.split('\n').length;
    for (const grammar of grammars) {
      const [{ nodes }] = parseAll(grammar, [text]);
      const onNopRow = nodes.filter((node) => node.startRow <= nopRow && node.endRow >= nopRow);
      if (
        onNopRow.length !== 1 || onNopRow[0].type !== 'instruction' ||
        onNopRow[0].startRow !== nopRow
      ) {
        failures.push(`${grammar}: ${JSON.stringify(snippet)} reaches the next line`);
      }
      failures.push(...typingFailures(grammar, JSON.stringify(snippet), text));
    }
  }
  assertEquals(failures, []);
});

const STRAY_LABELS: [string, string[]][] = [
  ['add x0, x0, :lo12:.LC0 // c', ['asm_auto', 'asm_arm', 'asm_arm_apple']],
  ['ldr x1, [x0, :got_lo12:sym]', ['asm_auto', 'asm_arm', 'asm_arm_apple']],
  ['movw r0, #:lower16:sym', ['asm_auto', 'asm_arm']],
  ['movq %fs:sym@tpoff, %rax', ['asm_auto', 'asm_x86_gas']],
  ['mov rax, qword ptr fs:[0x28]', ['asm_auto', 'asm_x86_gas']],
  ['mov rax, [fs:0x28]', ['asm_x86_nasm']],
  ['mov ax, es:[bx]', ['asm_x86_nasm']],
];

Deno.test('an operand the grammars do not parse yet never starts a label in the middle of its line', () => {
  const failures: string[] = [];
  for (const [snippet, grammars] of STRAY_LABELS) {
    for (const grammar of grammars) {
      const tree = treeText(parseFiles(grammar, 'stray', [`f:\n    ${snippet}\n    ret\n`]).output);
      const blocks = tree.match(/\(label_block /g) ?? [];
      if (blocks.length !== 1) {
        failures.push(
          `${grammar}: ${JSON.stringify(snippet)} starts ${blocks.length - 1} more label block(s)`,
        );
      }
    }
  }
  assertEquals(failures, []);
});

const OPEN_LINES: Record<string, string[]> = {
  gas: [
    '',
    'mov',
    'mov r0',
    'mov r0,',
    'mov r0, 1 +',
    'mov r0, -',
    'mov r0, (',
    'mov r0, (a',
    'mov r0, (a +',
    'mov r0, a@',
    '.size f, .-',
    '.asciz "a',
    '.asciz "a\\',
    'x:',
    '#define X',
  ],
  nasm: [
    '',
    'mov',
    'mov r0',
    'mov r0,',
    'mov r0, 1 +',
    'mov r0, -',
    'mov r0, (',
    'mov r0, (a',
    'mov r0, (a +',
    "db 'a",
    'db "a',
    'db `a',
    'db `a\\',
    'x:',
  ],
  arm: ['mov r0, #', 'mov r0, #(', 'add r0, r1, lsl', 'add r0, r1, lsl #'],
  x86: ['movq $', 'movq $(', 'movq %', '.type f, @'],
};

function openLines(language: Language): string[] {
  const contexts = [
    ...OPEN_LINES[language.syntax],
    ...(language.syntax === 'gas' ? language.archs.flatMap((arch) => OPEN_LINES[arch]) : []),
  ];
  return [
    ...new Set(
      contexts.flatMap((context) =>
        PRINTABLE.flatMap((char) => [context + char, `${context} ${char}`])
      ),
    ),
  ];
}

Deno.test('any character typed into an open construct keeps its effects on its own line', () => {
  const failures: string[] = [];
  for (const language of manifest.languages) {
    const lines = openLines(language);
    const parsed = parseAll(language.grammar, lines.map((line) => `${line}\nnop\n`));
    for (const [index, { nodes }] of parsed.entries()) {
      const spansByDesign = nodes.some((node) =>
        SPANNING_TYPES.has(node.type) && node.startRow === 0 && node.endRow > 0
      );
      const onNopRow = nodes.filter((node) => node.startRow <= 1 && node.endRow >= 1);
      if (
        !spansByDesign &&
        (onNopRow.length !== 1 || onNopRow[0].type !== 'instruction' || onNopRow[0].startRow !== 1)
      ) {
        failures.push(`${language.grammar}: ${JSON.stringify(lines[index])}`);
      }
    }
  }
  assertEquals(failures, []);
});

const OPEN_BLOCKS: Record<string, string> = {
  gas: '.if A\n    .rept 2\n    nop\n    ',
  nasm: 'f:\n    nop\n    ',
};

Deno.test('any character typed on the last line of a file keeps the blocks around it', () => {
  const failures: string[] = [];
  for (const language of manifest.languages) {
    const prefix = OPEN_BLOCKS[language.syntax];
    const row = prefix.split('\n').length - 1;
    const lines = openLines(language);
    const [baseline, ...parsed] = parseAll(language.grammar, [
      prefix,
      ...lines.map((line) => `${prefix}${line}`),
    ]);
    const before = (tree: Tree) =>
      JSON.stringify([
        tree.nodes.filter((node) => node.endRow < row),
        tree.blocks.map((block) => block.rows[0]),
      ]);
    for (const [index, tree] of parsed.entries()) {
      if (before(tree) !== before(baseline)) {
        failures.push(`${language.grammar}: ${JSON.stringify(lines[index])}`);
      }
    }
  }
  assertEquals(failures, []);
});

Deno.test('a line being typed in a corpus example never changes how any other line parses', () => {
  const failures: string[] = [];
  for (const language of manifest.languages) {
    for (const [label, text] of corpusExamples(language)) {
      failures.push(...typingFailures(language.grammar, label, text));
    }
  }
  assertEquals(failures, []);
});
