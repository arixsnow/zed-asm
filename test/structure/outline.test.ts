// SPDX-License-Identifier: MIT

import { assertEquals } from '@std/assert';

import { manifest } from '../../scripts/lib/manifest.ts';
import { breadcrumbs, outlineItems, placeCursors, textObject } from '../lib/zed.ts';
import { queryMatchesFor } from '../lib/zed-syntax.ts';
import { BREADCRUMB_CASES, OUTLINE_CASES, TEXT_OBJECT_CASES } from './cases.ts';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function byteOffset(text: string, index: number): number {
  return encoder.encode(text.slice(0, index)).length;
}

Deno.test('the outline lists what Zed shows, nested the way Zed nests it', () => {
  const failures: string[] = [];
  for (const language of manifest.languages) {
    for (
      const testCase of OUTLINE_CASES.filter((entry) => entry.grammars.includes(language.grammar))
    ) {
      const matches = queryMatchesFor(language, 'outline', testCase.source, 'outline');
      const outline = outlineItems(testCase.source, matches).map((item) =>
        `${item.depth} ${item.text}`
      );
      if (JSON.stringify(outline) !== JSON.stringify(testCase.outline)) {
        failures.push(`${language.grammar}: ${testCase.name}\n  got ${JSON.stringify(outline)}`);
      }
    }
  }
  assertEquals(failures, []);
});

Deno.test('a comment right above an outline item is its annotation', () => {
  for (const language of manifest.languages.filter(({ syntax }) => syntax === 'gas')) {
    const source = '// adds\n#define N 4\n\n// apart\n\n#define M 5\n';
    const items = outlineItems(source, queryMatchesFor(language, 'outline', source, 'outline'));
    assertEquals(
      items.map((item) => item.annotation),
      [{ start: 0, end: 0 }, null],
      language.grammar,
    );
  }
});

Deno.test('breadcrumbs show the outline items around the cursor', () => {
  const failures: string[] = [];
  for (const language of manifest.languages) {
    for (
      const testCase of BREADCRUMB_CASES.filter((entry) =>
        entry.grammars.includes(language.grammar)
      )
    ) {
      const { source, cursors } = placeCursors(testCase.source);
      const matches = queryMatchesFor(language, 'outline', source, 'breadcrumbs');
      const crumbs = cursors.map((cursor) =>
        breadcrumbs(source, matches, byteOffset(source, cursor))
      );
      if (JSON.stringify(crumbs) !== JSON.stringify(testCase.crumbs)) {
        failures.push(`${language.grammar}: ${testCase.name}\n  got ${JSON.stringify(crumbs)}`);
      }
    }
  }
  assertEquals(failures, []);
});

Deno.test('vim text objects select what Zed selects', () => {
  const failures: string[] = [];
  for (const language of manifest.languages) {
    for (
      const testCase of TEXT_OBJECT_CASES.filter((entry) =>
        entry.grammars.includes(language.grammar)
      )
    ) {
      const { source, cursors } = placeCursors(testCase.source);
      const bytes = encoder.encode(source);
      const matches = queryMatchesFor(language, 'textobjects', source, 'textobjects');
      for (const [cursor, target, expected] of testCase.objects) {
        const range = textObject(source, matches, byteOffset(source, cursors[cursor]), target);
        const selected = range === null
          ? null
          : decoder.decode(bytes.slice(range.start, range.end));
        if (selected !== expected) {
          failures.push(
            `${language.grammar}: ${testCase.name}, ${target} at cursor ${cursor}\n  got ${
              JSON.stringify(selected)
            }`,
          );
        }
      }
    }
  }
  assertEquals(failures, []);
});
