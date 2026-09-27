// SPDX-License-Identifier: MIT

import { assertEquals } from '@std/assert';
import { join } from '@std/path';

import { sourcesOf } from '../../scripts/build.ts';
import { filesUnder, ROOT } from '../../scripts/lib/files.ts';
import { type Language, manifest } from '../../scripts/lib/manifest.ts';
import { FIXTURE_DIALECTS } from '../../scripts/verify-fixtures.ts';
import { parseFiles, PRINTABLE, treeText } from '../lib/parse.ts';

interface Node {
  type: string;
  startRow: number;
  endRow: number;
  text: string;
}

const SPANNING_TYPES = new Set(['block_comment', 'preproc_line']);
const HEADER = /^ {2}\((\w+) \[(\d+), \d+\] - \[(\d+), \d+\]/;
function topLevelNodes(tree: string): Node[] {
  const nodes: Node[] = [];
  for (const line of tree.split('\n')) {
    const header = HEADER.exec(line);
    if (header !== null) {
      nodes.push({
        type: header[1],
        startRow: Number(header[2]),
        endRow: Number(header[3]),
        text: line,
      });
    } else if (line.startsWith('   ') && nodes.length > 0) {
      nodes[nodes.length - 1].text += `\n${line}`;
    }
  }
  return nodes;
}

function parseAll(grammar: string, sources: string[]): Node[][] {
  const trees = treeText(parseFiles(grammar, 'typing', sources).output)
    .split(/^(?=\(source_file )/m)
    .filter((tree) => tree.startsWith('(source_file '))
    .map((tree) => tree.trimEnd().slice(0, -1));
  assertEquals(trees.length, sources.length, `${grammar}: one tree per variant`);
  return trees.map(topLevelNodes);
}

function outside(nodes: Node[], first: number, last: number): string[] {
  return nodes.filter((node) => node.endRow < first || node.startRow > last).map((node) =>
    node.text
  );
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
    const touching = baseline.filter((node) => node.startRow <= row && row <= node.endRow);
    const first = Math.min(row, ...touching.map((node) => node.startRow));
    const last = Math.max(row, ...touching.map((node) => node.endRow));
    const nodes = parsed[index];
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
      leaked || outside(baseline, first, last).join('\n') !== outside(nodes, first, last).join('\n')
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
  for (const [dialect, { grammars }] of Object.entries(FIXTURE_DIALECTS)) {
    const directory = join(ROOT, 'test', 'fixtures', dialect);
    for (const entry of Deno.readDirSync(directory)) {
      const text = Deno.readTextFileSync(join(directory, entry.name));
      for (const grammar of grammars) {
        failures.push(...typingFailures(grammar, `${dialect}/${entry.name}`, text));
      }
    }
  }
  assertEquals(failures, []);
});

const UNSUPPORTED: [string, string[]][] = [
  ['ldr x0, [x1, #8]', ['asm_auto', 'asm_arm', 'asm_arm_apple']],
  ['stp x29, x30, [sp, #-16]!', ['asm_auto', 'asm_arm', 'asm_arm_apple']],
  ['1:\n  b.ne 1b', ['asm_auto', 'asm_arm', 'asm_arm_apple']],
  ['add x0, x0, #:lo12:sym', ['asm_auto', 'asm_arm']],
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
      const [nodes] = parseAll(grammar, [text]);
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
    for (const [index, nodes] of parsed.entries()) {
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

Deno.test('a line being typed in a corpus example never changes how any other line parses', () => {
  const failures: string[] = [];
  for (const language of manifest.languages) {
    for (const [label, text] of corpusExamples(language)) {
      failures.push(...typingFailures(language.grammar, label, text));
    }
  }
  assertEquals(failures, []);
});
