// SPDX-License-Identifier: MIT

import { assertEquals } from '@std/assert';
import { join } from '@std/path';

import { ROOT } from '../../scripts/lib/files.ts';
import { manifest } from '../../scripts/lib/manifest.ts';
import { readGrammar } from '../lib/grammar-sets.ts';

const KEYWORD_LEXER = /static bool ts_lex_keywords\([^)]*\) \{([\s\S]*?)\n\}\n/;
const WRAPPERS = new Set(['TOKEN', 'IMMEDIATE_TOKEN', 'PREC', 'PREC_LEFT', 'PREC_RIGHT']);

interface Rule {
  type: string;
  content?: Rule;
  flags?: string;
}

function caseInsensitiveWord(rule: Rule): boolean {
  let inner = rule;
  while (WRAPPERS.has(inner.type) && inner.content !== undefined) {
    inner = inner.content;
  }
  return inner.type === 'PATTERN' && (inner.flags ?? '').includes('i');
}

Deno.test('every case-insensitive word is a keyword of the identifier token, so it never splits a longer word', () => {
  const missing: string[] = [];
  for (const { grammar } of manifest.languages) {
    const words = Object.entries(readGrammar(grammar).rules as Record<string, Rule>)
      .filter(([, rule]) => caseInsensitiveWord(rule))
      .map(([name]) => name);
    const parser = Deno.readTextFileSync(join(ROOT, 'tree-sitter', grammar, 'src', 'parser.c'));
    const keywords = KEYWORD_LEXER.exec(parser)?.[1] ?? '';
    for (const name of words) {
      if (!new RegExp(`\\bsym_${name}\\b`).test(keywords)) {
        missing.push(`${grammar}: ${name}`);
      }
    }
  }
  assertEquals(missing, []);
});
