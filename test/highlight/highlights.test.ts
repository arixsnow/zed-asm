// SPDX-License-Identifier: MIT

import { assert, assertEquals, assertNotEquals } from '@std/assert';
import { ensureDirSync } from '@std/fs';
import { join } from '@std/path';

import { ROOT } from '../../scripts/lib/files.ts';
import { languageArgs, run } from '../../scripts/lib/grammars.ts';
import { manifest } from '../../scripts/lib/manifest.ts';
import { type Capture, CURSOR, highlightAt, placeCursors, scopeAt } from '../lib/zed.ts';
import { HIGHLIGHT_CASES, SCOPE_CASES } from './cases.ts';

const CAPTURE_LINE = /capture: \d+ - ([\w.]+), start: \((\d+), (\d+)\), end: \((\d+), (\d+)\)/;
const SCRATCH = join(ROOT, '.build', 'highlight');
const encoder = new TextEncoder();

function lineOffsets(source: string): number[] {
  const offsets = [0];
  for (const [index, byte] of encoder.encode(source).entries()) {
    if (byte === 0x0a) {
      offsets.push(index + 1);
    }
  }
  return offsets;
}

function byteOffset(source: string, index: number): number {
  return encoder.encode(source.slice(0, index)).length;
}

function captures(grammar: string, query: string, source: string): Capture[] {
  const language = manifest.languages.find((entry) => entry.grammar === grammar);
  assert(language !== undefined, `no language uses grammar ${grammar}`);
  ensureDirSync(SCRATCH);
  const file = join(SCRATCH, `${grammar}-${query}.s`);
  Deno.writeTextFileSync(file, source);
  const { ok, output } = run('tree-sitter', [
    'query',
    ...languageArgs(grammar),
    '--captures',
    join('languages', language.dir, `${query}.scm`),
    file,
  ]);
  assert(ok, output);
  const offsets = lineOffsets(source);
  return output
    .split('\n')
    .map((line) => CAPTURE_LINE.exec(line))
    .filter((match) => match !== null)
    .map(([, name, startRow, startColumn, endRow, endColumn]) => ({
      name: name.replace(/\.inclusive$/, ''),
      inclusive: name.endsWith('.inclusive'),
      start: offsets[Number(startRow)] + Number(startColumn),
      end: offsets[Number(endRow)] + Number(endColumn),
    }));
}

function context(source: string, offset: number): string {
  const start = source.lastIndexOf('\n', offset - 1) + 1;
  const end = source.indexOf('\n', offset);
  return `${source.slice(start, offset)}${CURSOR}${
    source.slice(offset, end === -1 ? undefined : end)
  }`;
}

for (const testCase of HIGHLIGHT_CASES) {
  Deno.test(testCase.name, () => {
    const list = captures(testCase.grammar, 'highlights', testCase.source);
    let cursor = 0;
    for (const [text, expected] of testCase.expect) {
      const start = testCase.source.indexOf(text, cursor);
      assertNotEquals(start, -1, `"${text}" not found after offset ${cursor}`);
      for (let offset = start; offset < start + text.length; offset++) {
        assertEquals(
          highlightAt(list, byteOffset(testCase.source, offset)),
          expected,
          `"${text}" at offset ${offset} (character "${testCase.source[offset]}")`,
        );
      }
      cursor = start + text.length;
    }
  });
}

for (const testCase of SCOPE_CASES) {
  Deno.test(testCase.name, () => {
    const { source, cursors } = placeCursors(testCase.source);
    assertEquals(cursors.length, testCase.scopes.length, 'one expected scope per cursor');
    const list = captures(testCase.grammar, 'overrides', source);
    for (const [index, offset] of cursors.entries()) {
      assertEquals(
        scopeAt(list, byteOffset(source, offset)),
        testCase.scopes[index],
        context(source, offset),
      );
    }
  });
}
