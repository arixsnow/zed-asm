// SPDX-License-Identifier: MIT

import { assertEquals } from '@std/assert';

import plugin from '../../scripts/lint/curly.ts';

function reported(source: string): string[] {
  const diagnostics = Deno.lint.runPlugin(plugin, 'probe.ts', source);
  assertEquals(
    diagnostics.map((diagnostic) => diagnostic.id).filter((id) => id !== 'asm/curly'),
    [],
  );
  return diagnostics.map((diagnostic) => source.slice(diagnostic.range[0], diagnostic.range[1]));
}

Deno.test('every unbraced statement body is reported', () => {
  const cases: [string, string[]][] = [
    ['if (a) b();', ['b();']],
    ['if (a) { b(); } else c();', ['c();']],
    ['if (a) b(); else c();', ['b();', 'c();']],
    ['for (let i = 0; i < 1; i++) b();', ['b();']],
    ['for (const x of y) b();', ['b();']],
    ['for (const k in o) b();', ['b();']],
    ['while (a) b();', ['b();']],
    ['do b(); while (a);', ['b();']],
    ['if (a) return;', ['return;']],
  ];
  for (const [source, expected] of cases) {
    assertEquals(reported(source), expected, source);
  }
});

Deno.test('braced bodies and else-if chains are accepted', () => {
  const cases = [
    'if (a) { b(); }',
    'if (a) { b(); } else if (c) { d(); } else { e(); }',
    'for (let i = 0; i < 1; i++) { b(); }',
    'for (const x of y) { b(); }',
    'for (const k in o) { b(); }',
    'while (a) { b(); }',
    'do { b(); } while (a);',
    'const f = (x: number) => x + 1;',
  ];
  for (const source of cases) {
    assertEquals(reported(source), [], source);
  }
});

Deno.test('an unbraced branch inside an else-if chain is reported', () => {
  assertEquals(reported('if (a) { b(); } else if (c) d(); else { e(); }'), ['d();']);
});
