// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';

import {
  commonSources,
  dialectArchs,
  dialectDefines,
  keywordScopes,
  keywordSources,
  tableEntries,
} from '../../scripts/lib/tables.ts';
import { dictionaries, lookupWord, wordsHeader } from '../../scripts/lib/words.ts';

const SCANNER = [
  '#ifdef ASM_DIALECT_ONE',
  '#define ASM_GNU_SYNTAX 1',
  '#define ASM_ALPHA_KEYWORDS 1',
  '#define ASM_BETA_KEYWORDS 0',
  '#elif defined(ASM_DIALECT_TWO)',
  '#define ASM_GNU_SYNTAX 0',
  '#define ASM_ALPHA_KEYWORDS 0',
  '#define ASM_BETA_KEYWORDS 1',
  '#endif /* ASM_DIALECT_* */',
  '',
].join('\n');

function table(name: string, rows: string[]): string {
  return [
    `#define ${name}(X) \\`,
    ...rows.map((row, index) => `  X(${row})${index === rows.length - 1 ? '' : ' \\'}`),
    '',
  ].join('\n');
}

const KEYWORDS = [
  'enum {',
  '  ASM_ALPHA_ELEMENTS = 5,',
  '};',
  '',
  table('ASM_KEYWORD_SOURCES', ['"upstream", "0123"']),
  table('ASM_ALPHA_INSTRUCTIONS', ['"add", INSTRUCTION_NAME, 0', '"nop", INSTRUCTION_NAME, 0']),
  table('ASM_ALPHA_REGISTERS', ['"r0", 0, 0', '"st", 8, REGISTER_INTEL']),
  table('ASM_BETA_INSTRUCTIONS', ['"nop", INSTRUCTION_NAME, CASE_NO_MIXED | CASE_NO_UPPER']),
  table('ASM_BETA_PREFIXES', ['"a\\"b", PREFIX_PLAIN']),
  table('ASM_GNU_CPP_DIRECTIVES', ['"define", CPP_DEFINE, 0']),
].join('\n');

function byDialect(dialect: string, keywords = KEYWORDS, scanner = SCANNER) {
  const found = dictionaries(keywordSources(scanner, keywords)).find((entry) =>
    entry.dialect === dialect
  );
  assert.ok(found !== undefined, dialect);
  return found;
}

test('the scopes are the ASM_*_KEYWORDS settings in their scanner.h order, then GNU', () => {
  assert.deepStrictEqual(keywordScopes(SCANNER), ['ALPHA', 'BETA', 'GNU']);
});

test('a dialect holds the words of the tables its scopes select, each with all its roles', () => {
  const one = byDialect('ONE');
  assert.deepStrictEqual(one.words.map(({ name }) => name), ['add', 'define', 'nop', 'r0', 'st']);
  assert.deepStrictEqual(lookupWord(one, 'st')?.roles, [
    { symbol: '0', kind: 'REGISTERS', scope: 'ALPHA', flags: 'REGISTER_INTEL', indexes: '8' },
  ]);
  assert.deepStrictEqual(lookupWord(one, 'define')?.roles, [
    { symbol: 'CPP_DEFINE', kind: 'CPP_DIRECTIVES', scope: 'GNU', flags: '0', indexes: '0' },
  ]);
  const two = byDialect('TWO');
  assert.deepStrictEqual(two.words.map(({ name }) => name), ['a"b', 'nop']);
  assert.deepStrictEqual(lookupWord(two, 'nop')?.roles, [
    {
      symbol: 'INSTRUCTION_NAME',
      kind: 'INSTRUCTIONS',
      scope: 'BETA',
      flags: 'CASE_NO_MIXED | CASE_NO_UPPER',
      indexes: '0',
    },
  ]);
  assert.deepStrictEqual(lookupWord(two, 'a"b')?.literal, '"a\\"b"');
});

test('the perfect hash finds every word and nothing else', () => {
  for (const dialect of ['ONE', 'TWO']) {
    const dictionary = byDialect(dialect);
    for (const word of dictionary.words) {
      assert.strictEqual(lookupWord(dictionary, word.name), word, word.name);
    }
    for (const miss of ['', 'mov', 'nopx', 'r', 'NOP']) {
      assert.strictEqual(lookupWord(dictionary, miss), undefined, miss);
    }
  }
});

test('a word in several tables lists its roles in scope order', () => {
  const scanner = SCANNER.replace('#define ASM_BETA_KEYWORDS 0', '#define ASM_BETA_KEYWORDS 1');
  const roles = lookupWord(byDialect('ONE', KEYWORDS, scanner), 'nop')?.roles ?? [];
  assert.deepStrictEqual(roles.map(({ scope }) => scope), ['ALPHA', 'BETA']);
});

test('malformed tables and settings stop the generator', () => {
  const cases: [string, string, string][] = [
    [
      KEYWORDS + table('ASM_GAMMA_INSTRUCTIONS', ['"x", INSTRUCTION_NAME, 0']),
      SCANNER,
      'names no scope',
    ],
    [KEYWORDS.replace('"st", 8, REGISTER_INTEL', '"st", REGISTER, 0'), SCANNER, 'bad indexes'],
    [KEYWORDS.replace('"add", INSTRUCTION_NAME, 0', '"add", 3, 0'), SCANNER, 'bad symbol'],
    [KEYWORDS.replace('"r0", 0, 0', '"r0", 0, 0, 0'), SCANNER, 'unexpected fields'],
    [KEYWORDS.replace('"add"', '"a d"'), SCANNER, 'non-ASCII or empty word'],
    [KEYWORDS.replace('"add"', '"nop"'), SCANNER, 'lists nop twice'],
    [
      KEYWORDS,
      SCANNER.replace(
        '#define ASM_ALPHA_KEYWORDS 0\n#define ASM_BETA_KEYWORDS 1',
        '#define ASM_BETA_KEYWORDS 1\n#define ASM_ALPHA_KEYWORDS 0',
      ),
      'same order',
    ],
  ];
  for (const [keywords, scanner, message] of cases) {
    assert.throws(
      () => dictionaries(keywordSources(scanner, keywords)),
      new RegExp(message),
      message,
    );
  }
});

test('the header holds the scope bits, the kinds and one section per dialect', () => {
  const header = wordsHeader(keywordSources(SCANNER, KEYWORDS));
  for (
    const part of [
      'enum {\n  ASM_ALPHA_ELEMENTS = 5,\n};',
      '#define SCOPE_ALPHA 0x01U\n#define SCOPE_BETA 0x02U\n#define SCOPE_GNU 0x04U',
      'enum WordKind {\n  KIND_CPP_DIRECTIVES,\n  KIND_INSTRUCTIONS,\n  KIND_PREFIXES,\n  KIND_REGISTERS,\n};',
      '  unsigned char scope;',
      '#if defined(ASM_DIALECT_ONE)',
      '#elif defined(ASM_DIALECT_TWO)',
      '    {"st", ',
      '    {0, KIND_REGISTERS, SCOPE_ALPHA, REGISTER_INTEL, 8},',
      '  uint16_t first;',
      '#endif /* ASM_DIALECT_* */\n\n#endif /* ASM_WORDS_H */\n',
    ]
  ) {
    assert.ok(header.includes(part), part);
  }
  assert.deepStrictEqual(header, wordsHeader(keywordSources(SCANNER, KEYWORDS)));
});

test('every dictionary holds exactly the rows of the tables its dialect selects', () => {
  const sources = commonSources();
  const scanner = sources.scanner;
  const tables = [...sources.keywords.matchAll(/^#define (ASM_\w+)\(X\)/gm)].map(([, name]) =>
    name
  );
  for (const dictionary of dictionaries(sources)) {
    const scopes = [...dialectArchs(scanner, dictionary.dialect)];
    if (dialectDefines(scanner).get(dictionary.dialect)?.get('ASM_GNU_SYNTAX') === '1') {
      scopes.push('GNU');
    }
    const rows = tables
      .filter((name) => scopes.some((scope) => name.startsWith(`ASM_${scope}_`)))
      .flatMap((name) => tableEntries(sources, name).map(([word]) => word));
    const roles = dictionary.words.flatMap((word) => word.roles.map(() => word.name));
    assert.deepStrictEqual(roles.sort(), rows.sort(), dictionary.dialect);
    for (const word of dictionary.words) {
      assert.strictEqual(lookupWord(dictionary, word.name), word, word.name);
    }
  }
});
