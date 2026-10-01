// SPDX-License-Identifier: MIT

import { assertEquals } from '@std/assert';

import { manifest } from '../../scripts/lib/manifest.ts';
import { CURSOR, placeCursors, ZedEditor } from '../lib/zed.ts';
import { cliSyntax, zedLanguage } from '../lib/zed-syntax.ts';
import { INDENT_CASES } from './cases.ts';

const encoder = new TextEncoder();

Deno.test('lines typed in Zed take the indentation of the block or label they belong to', () => {
  const failures: string[] = [];
  for (const language of manifest.languages) {
    const cases = INDENT_CASES.filter((testCase) => testCase.grammars.includes(language.grammar));
    if (cases.length === 0) {
      continue;
    }
    const zed = zedLanguage(language);
    const provider = cliSyntax(language, 'indents');
    for (const testCase of cases) {
      const marked = testCase.start.includes(CURSOR)
        ? testCase.start
        : `${testCase.start}${CURSOR}`;
      const { source, cursors } = placeCursors(marked);
      const before = source.slice(0, cursors[0]);
      const row = before.split('\n').length - 1;
      const column = encoder.encode(before.slice(before.lastIndexOf('\n') + 1)).length;
      const editor = new ZedEditor(source, { row, column }, zed, provider);
      for (const key of testCase.keys) {
        if (key === '\n') {
          editor.newline();
        } else {
          editor.input(key);
        }
      }
      if (editor.text !== testCase.expect) {
        failures.push(
          `${language.grammar}: ${testCase.name}\n  got      ${
            JSON.stringify(editor.text)
          }\n  expected ${JSON.stringify(testCase.expect)}`,
        );
      }
    }
  }
  assertEquals(failures, []);
});
