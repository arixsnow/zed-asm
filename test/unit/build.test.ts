// SPDX-License-Identifier: MIT

import { assertEquals, assertMatch, assertNotMatch, assertThrows } from '@std/assert';
import { join } from '@std/path';
import { parse } from '@std/toml';

import {
  extensionConfig,
  languageConfig,
  renderAll,
  renderCorpus,
  renderQueries,
  sourcesOf,
  toToml,
} from '../../scripts/build.ts';
import { blockIndentPattern, statementLexing, statementWords } from '../../scripts/lib/indent.ts';
import { ROOT } from '../../scripts/lib/files.ts';
import { type Language, manifest, parseAuthor } from '../../scripts/lib/manifest.ts';

const outputs = renderAll(manifest, () => undefined);

function rendered(path: string): string {
  const text = outputs.get(path);
  if (text === undefined) {
    throw new Error(`${path} is not generated`);
  }
  return text;
}

function byGrammar(grammar: string): Language {
  const language = manifest.languages.find((entry) => entry.grammar === grammar);
  if (language === undefined) {
    throw new Error(`no language uses grammar ${grammar}`);
  }
  return language;
}

function asData(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

Deno.test('toToml writes scalars, arrays, inline tables and [a.b] sections', () => {
  assertEquals(
    toToml({ a: 'x"y', b: 1, c: ['p', 'q'], d: { k: 'v' }, e: { s: { t: true } } }),
    'a = "x\\"y"\nb = 1\nc = ["p", "q"]\nd = { k = "v" }\n\n[e.s]\nt = true\n',
  );
});

Deno.test('toToml writes arrays of tables one per line and skips undefined values', () => {
  assertEquals(
    toToml({ list: [{ a: 1 }, { b: 'x' }], gone: undefined }),
    'list = [\n  { a = 1 },\n  { b = "x" },\n]\n',
  );
});

Deno.test('every generated TOML file parses back to the data it was written from', () => {
  assertEquals(parse(rendered('extension.toml')), asData(extensionConfig(manifest)));
  for (const language of manifest.languages) {
    assertEquals(
      parse(rendered(`languages/${language.dir}/config.toml`)),
      asData(languageConfig(language, manifest)),
      language.dir,
    );
  }
});

Deno.test('sources run from general to specific', () => {
  assertEquals(sourcesOf({ syntax: 'gas', archs: ['arm', 'x86'] }), [
    'core',
    'gas',
    'arm',
    'x86',
    'arm.gas',
    'x86.gas',
  ]);
});

Deno.test('query fragments are joined in source order with nothing added and empty kinds omitted', () => {
  const fragments: Record<string, string> = { core: '(a) @x\n', gas: '(b) @y', arm: '(c) @z\n\n' };
  const files = renderQueries(
    { syntax: 'gas', archs: ['arm'] },
    (source, kind) => (kind === 'highlights' ? fragments[source] : undefined),
  );
  assertEquals([...files.keys()], ['highlights.scm']);
  assertEquals(files.get('highlights.scm'), '(a) @x\n\n(b) @y\n\n(c) @z\n');
});

Deno.test('corpus tests come from every source plus the grammar directory', () => {
  const corpus = renderCorpus(byGrammar('asm_x86_gas'), (source) => [[`${source}.txt`, source]]);
  assertEquals([...corpus.keys()], [
    'core--core.txt',
    'gas--gas.txt',
    'x86--x86.txt',
    'x86.gas--x86.gas.txt',
    'asm_x86_gas--asm_x86_gas.txt',
  ]);
});

Deno.test('NASM has only ";" comments and no block comments', () => {
  const toml = rendered('languages/x86-nasm/config.toml');
  assertMatch(toml, /^name = "x86 Assembly \(NASM\)"\n/);
  assertMatch(toml, /^line_comments = \["; "\]$/m);
  assertNotMatch(toml, /block_comment|documentation_comment/);
});

Deno.test('GNU-syntax languages continue /* */ comments and never continue "#" on preprocessor lines', () => {
  const toml = rendered('languages/arm/config.toml');
  assertMatch(
    toml,
    /^documentation_comment = \{ start = "\/\*", prefix = "\* ", end = "\*\/", tab_size = 1 \}$/m,
  );
  assertMatch(toml, /\[overrides\.preproc\]\nline_comments = \["\/\/ "\]/);
  assertNotMatch(toml, /^(tab_size|hard_tabs) =/m);
});

Deno.test('each language toggles comments with a prefix its assemblers accept at line start', () => {
  const expected: Record<string, string> = {
    asm_auto: '// ',
    asm_arm: '// ',
    asm_arm_apple: '// ',
    asm_x86_gas: '// ',
    asm_x86_nasm: '; ',
  };
  for (const language of manifest.languages) {
    assertEquals(language.lineComments[0], expected[language.grammar], language.name);
  }
});

Deno.test('brackets auto-close only before what can follow a closing bracket', () => {
  assertEquals(manifest.shared.autoclose_before, ',;)]}');
});

Deno.test('brackets never open a block, and quotes close where the dialect has strings', () => {
  const blocks = [
    { start: '{', end: '}', close: true, newline: false },
    { start: '[', end: ']', close: true, newline: false },
    { start: '(', end: ')', close: true, newline: false },
    { start: '"', end: '"', close: true, newline: false, not_in: ['string'] },
  ];
  assertEquals(asData(manifest.syntaxes.gas.brackets), [
    ...blocks,
    { start: "'", end: "'", close: true, newline: false, not_in: ['string', 'comment'] },
    { start: '/*', end: ' */', close: true, newline: false, not_in: ['string', 'comment'] },
  ]);
  assertEquals(asData(manifest.syntaxes.nasm.brackets), [
    ...blocks,
    { start: '`', end: '`', close: true, newline: false, not_in: ['string'] },
    { start: "'", end: "'", close: true, newline: false, not_in: ['string', 'comment'] },
  ]);
});

Deno.test('the .inc suffix is not claimed', () => {
  assertEquals(manifest.languages.filter((language) => language.pathSuffixes.includes('inc')), []);
});

Deno.test('label indent pattern matches labels, including tab-indented ones, and nothing else', () => {
  for (const syntax of ['gas', 'nasm']) {
    const pattern = new RegExp(manifest.syntaxes[syntax].labelPattern);
    for (const line of ['main:', '    .Lloop:', '\tstart:', 'loop: dec rcx']) {
      assertMatch(line, pattern, `${syntax}: ${line}`);
    }
    for (
      const line of [
        '    mov x0, x1',
        '\tmov\tx0, x1',
        '    adrp x0, :lo12:sym',
        '    movl %fs:0, %eax',
        '// note:',
        '#define X 1',
      ]
    ) {
      assertNotMatch(line, pattern, `${syntax}: ${line}`);
    }
  }
  assertMatch('1:', new RegExp(manifest.syntaxes.gas.labelPattern));
});

Deno.test('each generated scanner selects its own grammar name and dialect', () => {
  for (const language of manifest.languages) {
    assertEquals(
      rendered(`tree-sitter/${language.grammar}/src/scanner.c`),
      `#define ASM_GRAMMAR_NAME ${language.grammar}\n#define ASM_DIALECT_${language.dialect}\n#include "../../common/scanner.h"\n`,
    );
  }
});

Deno.test('the tree-sitter metadata takes its license and authors from the manifest', () => {
  const { metadata } = JSON.parse(rendered('tree-sitter/tree-sitter.json'));
  assertEquals(metadata.license, manifest.extension.license);
  assertEquals(
    metadata.authors,
    manifest.extension.authors.map((author, index) => parseAuthor(author, `authors[${index}]`)),
  );
});

const SCANNER = Deno.readTextFileSync(join(ROOT, 'tree-sitter', 'common', 'scanner.h'));

Deno.test('GNU-syntax languages add block openers to the label indent pattern; NASM keeps labels only', () => {
  for (const language of manifest.languages) {
    const syntax = manifest.syntaxes[language.syntax];
    const { increase_indent_pattern: increase, decrease_indent_pattern: decrease } = languageConfig(
      language,
      manifest,
    );
    assertEquals(decrease, syntax.labelPattern, language.name);
    if (language.syntax === 'nasm') {
      assertEquals(increase, syntax.labelPattern);
    } else {
      assertEquals(increase, `${syntax.labelPattern}|${blockIndentPattern(language, syntax)}`);
    }
  }
});

Deno.test("the indent pattern reads each dialect's ; # and @ rules and the closers from scanner.h", () => {
  assertEquals(statementLexing(SCANNER), {
    AUTO: { semicolons: 'HEURISTIC', hashImmediates: true, hashNeedsValue: true, atComments: true },
    ARM: { semicolons: 'SEPARATES', hashImmediates: true, hashNeedsValue: false, atComments: true },
    ARM_APPLE: {
      semicolons: 'COMMENTS',
      hashImmediates: true,
      hashNeedsValue: false,
      atComments: false,
    },
    X86_GAS: {
      semicolons: 'SEPARATES',
      hashImmediates: false,
      hashNeedsValue: false,
      atComments: false,
    },
    X86_NASM: {
      semicolons: 'COMMENTS',
      hashImmediates: false,
      hashNeedsValue: false,
      atComments: false,
    },
  });
  const words = statementWords(SCANNER);
  const named = (...symbols: string[]) =>
    words.filter(({ symbol }) => symbols.includes(symbol)).map(({ name }) => name);
  assertEquals(named('MACRO_OPEN', 'REPT_OPEN', 'IRP_OPEN', 'IRPC_OPEN'), [
    '.irp',
    '.irpc',
    '.macro',
    '.rept',
  ]);
  assertEquals(named('IF_OPEN'), [
    '.if',
    '.ifb',
    '.ifc',
    '.ifdef',
    '.ifeq',
    '.ifeqs',
    '.ifge',
    '.ifgt',
    '.ifle',
    '.iflt',
    '.ifnb',
    '.ifnc',
    '.ifndef',
    '.ifne',
    '.ifnes',
    '.ifnotdef',
  ]);
  assertEquals(named('ELSEIF', 'ELSE'), ['.else', '.elseif']);
  assertEquals(named('MACRO_CLOSE', 'CONDITIONAL_CLOSE', 'REPEAT_CLOSE'), [
    '.endif',
    '.endm',
    '.endmacro',
    '.endr',
  ]);
});

Deno.test('the scanner keeps its statement words sorted, as its binary search needs', () => {
  const names = statementWords(SCANNER).map(({ name }) => name);
  assertEquals(names, [...names].sort((left, right) => left < right ? -1 : left > right ? 1 : 0));
  assertEquals(new Set(names).size, names.length);
});

Deno.test('a block that names an unknown opener or closer fails with a clear message', () => {
  const language = byGrammar('asm_arm');
  const syntax = manifest.syntaxes.gas;
  assertThrows(
    () =>
      blockIndentPattern(language, {
        ...syntax,
        blocks: [{ openers: ['NOPE'], clauses: [], closer: 'MACRO_CLOSE' }],
      }),
    Error,
    'scanner.h has no block opener for NOPE',
  );
  assertThrows(
    () =>
      blockIndentPattern(language, {
        ...syntax,
        blocks: [{ openers: ['MACRO_OPEN'], clauses: ['NOPE'], closer: 'MACRO_CLOSE' }],
      }),
    Error,
    'scanner.h has no block clause for NOPE',
  );
  assertThrows(
    () =>
      blockIndentPattern(language, {
        ...syntax,
        blocks: [{ openers: ['MACRO_OPEN'], clauses: [], closer: 'NOPE' }],
      }),
    Error,
    'scanner.h has no block closer for NOPE',
  );
});
