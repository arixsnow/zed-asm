// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  extensionConfig,
  languageConfig,
  renderAll,
  renderCorpus,
  renderQueries,
  sourcesOf,
  toToml,
} from '../../scripts/build.ts';
import {
  blockIndentPattern,
  increaseIndentPattern,
  labelIndentPattern,
  statementLexing,
  statementWords,
} from '../../scripts/lib/indent.ts';
import { type Language, manifest, parseAuthor } from '../../scripts/lib/manifest.ts';
import { commonSources } from '../../scripts/lib/tables.ts';
import { assertThrowsIncluding } from '../lib/assert.ts';

const lexical = createRequire(import.meta.url)('../../tree-sitter/common/lexical.js');

const SOURCES = commonSources();
const outputs = renderAll(manifest, () => undefined, SOURCES);

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

test('toToml writes scalars, arrays, inline tables and [a.b] sections', () => {
  assert.deepStrictEqual(
    toToml({ a: 'x"y', b: 1, c: ['p', 'q'], d: { k: 'v' }, e: { s: { t: true } } }),
    'a = "x\\"y"\nb = 1\nc = ["p", "q"]\nd = { k = "v" }\n\n[e.s]\nt = true\n',
  );
});

test('toToml writes arrays of tables one per line and skips undefined values', () => {
  assert.deepStrictEqual(
    toToml({ list: [{ a: 1 }, { b: 'x' }], gone: undefined }),
    'list = [\n  { a = 1 },\n  { b = "x" },\n]\n',
  );
});

test('every generated TOML file parses back to the data it was written from', () => {
  assert.deepStrictEqual(
    Bun.TOML.parse(rendered('extension.toml')),
    asData(extensionConfig(manifest)),
  );
  for (const language of manifest.languages) {
    assert.deepStrictEqual(
      Bun.TOML.parse(rendered(`languages/${language.dir}/config.toml`)),
      asData(languageConfig(language, manifest, SOURCES)),
      language.dir,
    );
  }
});

test('sources run from general to specific', () => {
  assert.deepStrictEqual(sourcesOf({ syntax: 'gas', archs: ['arm', 'x86'] }), [
    'core',
    'gas',
    'arm',
    'x86',
    'arm.gas',
    'x86.gas',
  ]);
});

test('query fragments are joined in source order with nothing added and empty kinds omitted', () => {
  const fragments: Record<string, string> = { core: '(a) @x\n', gas: '(b) @y', arm: '(c) @z\n\n' };
  const files = renderQueries(
    { syntax: 'gas', archs: ['arm'] },
    (source, kind) => (kind === 'highlights' ? fragments[source] : undefined),
  );
  assert.deepStrictEqual([...files.keys()], ['highlights.scm']);
  assert.deepStrictEqual(files.get('highlights.scm'), '(a) @x\n\n(b) @y\n\n(c) @z\n');
});

test('corpus tests come from every source plus the grammar directory', () => {
  const corpus = renderCorpus(byGrammar('asm_x86_gas'), (source) => [[`${source}.txt`, source]]);
  assert.deepStrictEqual([...corpus.keys()], [
    'core--core.txt',
    'gas--gas.txt',
    'x86--x86.txt',
    'x86.gas--x86.gas.txt',
    'asm_x86_gas--asm_x86_gas.txt',
  ]);
});

test('NASM has only ";" comments and no block comments', () => {
  const toml = rendered('languages/x86-nasm/config.toml');
  assert.match(toml, /^name = "x86 Assembly \(NASM\)"\n/);
  assert.match(toml, /^line_comments = \["; "\]$/m);
  assert.doesNotMatch(toml, /block_comment|documentation_comment/);
});

test('GNU-syntax languages continue /* */ comments and never continue "#" on preprocessor lines', () => {
  const toml = rendered('languages/arm/config.toml');
  assert.match(
    toml,
    /^documentation_comment = \{ start = "\/\*", prefix = "\* ", end = "\*\/", tab_size = 1 \}$/m,
  );
  assert.match(toml, /\[overrides\.preproc\]\nline_comments = \["\/\/ "\]/);
  assert.doesNotMatch(toml, /^(tab_size|hard_tabs) =/m);
});

test('each language toggles comments with a prefix its assemblers accept at line start', () => {
  const expected: Record<string, string> = {
    asm_auto: '// ',
    asm_arm: '// ',
    asm_arm_apple: '// ',
    asm_x86_gas: '// ',
    asm_x86_nasm: '; ',
  };
  for (const language of manifest.languages) {
    assert.deepStrictEqual(language.lineComments[0], expected[language.grammar], language.name);
  }
});

test('brackets auto-close only before what can follow a closing bracket', () => {
  assert.deepStrictEqual(manifest.shared.autoclose_before, ',;)]}');
});

test('brackets never open a block, and quotes close where the dialect has strings', () => {
  const blocks = [
    { start: '{', end: '}', close: true, newline: false },
    { start: '[', end: ']', close: true, newline: false },
    { start: '(', end: ')', close: true, newline: false },
    { start: '"', end: '"', close: true, newline: false, not_in: ['string'] },
  ];
  assert.deepStrictEqual(asData(manifest.syntaxes.gas.brackets), [
    ...blocks,
    { start: "'", end: "'", close: true, newline: false, not_in: ['string', 'comment'] },
    { start: '/*', end: ' */', close: true, newline: false, not_in: ['string', 'comment'] },
  ]);
  assert.deepStrictEqual(asData(manifest.syntaxes.nasm.brackets), [
    ...blocks,
    { start: '`', end: '`', close: true, newline: false, not_in: ['string'] },
    { start: "'", end: "'", close: true, newline: false, not_in: ['string', 'comment'] },
  ]);
});

test('the .inc suffix is not claimed', () => {
  assert.deepStrictEqual(
    manifest.languages.filter((language) => language.pathSuffixes.includes('inc')),
    [],
  );
});

test('label indent pattern matches labels, including tab-indented ones, and nothing else', () => {
  for (const language of manifest.languages) {
    const pattern = new RegExp(labelIndentPattern(language, manifest.blocks, SOURCES), 'u');
    for (const line of ['main:', '    .Lloop:', '\tstart:', 'loop: dec rcx', 'x :']) {
      assert.match(line, pattern, `${language.grammar}: ${line}`);
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
      assert.doesNotMatch(line, pattern, `${language.grammar}: ${line}`);
    }
  }
});

test('the label pattern takes each syntax and dialect its own label forms', () => {
  const matches = (grammar: string, line: string) =>
    new RegExp(labelIndentPattern(byGrammar(grammar), manifest.blocks, SOURCES), 'u').test(line);
  for (const line of ['1:', '"a b":', 'L(loop):', '\\name\\()_end:']) {
    assert.ok(matches('asm_x86_gas', line), line);
  }
  assert.ok(matches('asm_arm', '1$:'));
  assert.ok(!matches('asm_arm_apple', '1$:'));
  for (const line of ['%%top:', '%$done:', '@x:', '$eax:', '..@x:']) {
    assert.ok(matches('asm_x86_nasm', line), line);
  }
  for (const line of ['$:', '?:', '%%%x:', '1:']) {
    assert.ok(!matches('asm_x86_nasm', line), line);
  }
});

test('each generated scanner selects its own grammar name and dialect', () => {
  for (const language of manifest.languages) {
    assert.deepStrictEqual(
      rendered(`tree-sitter/${language.grammar}/src/scanner.c`),
      `#define ASM_GRAMMAR_NAME ${language.grammar}\n#define ASM_DIALECT_${language.dialect}\n#include "../../common/scanner.h"\n`,
    );
  }
});

test('the tree-sitter metadata takes its license and authors from the manifest', () => {
  const { metadata } = JSON.parse(rendered('tree-sitter/tree-sitter.json'));
  assert.deepStrictEqual(metadata.license, manifest.extension.license);
  assert.deepStrictEqual(
    metadata.authors,
    manifest.extension.authors.map((author, index) => parseAuthor(author, `authors[${index}]`)),
  );
});

const SCANNER = SOURCES.scanner;

test('every language adds its block openers to the label indent pattern and leaves outdents to the tree', () => {
  for (const language of manifest.languages) {
    const config = languageConfig(language, manifest, SOURCES);
    assert.deepStrictEqual(
      config.increase_indent_pattern,
      `${labelIndentPattern(language, manifest.blocks, SOURCES)}|${
        blockIndentPattern(language, manifest.blocks, SOURCES)
      }`,
    );
    assert.ok(!('decrease_indent_pattern' in config), language.name);
  }
});

test('a block kind belongs to its syntax, and no blocks leave labels alone', () => {
  const nasm = byGrammar('asm_x86_nasm');
  const irp = [{ openers: ['IRP_OPEN'], clauses: [], closer: 'REPEAT_CLOSE', syntax: 'gas' }];
  assert.deepStrictEqual(blockIndentPattern(nasm, irp, SOURCES), null);
  assert.notDeepStrictEqual(blockIndentPattern(byGrammar('asm_x86_gas'), irp, SOURCES), null);
  assert.deepStrictEqual(blockIndentPattern(nasm, [], SOURCES), null);
  assert.deepStrictEqual(
    increaseIndentPattern(nasm, [], SOURCES),
    labelIndentPattern(nasm, [], SOURCES),
  );
});

test('a block kind of a syntax with no words in one of its dialects fails the build', () => {
  assertThrowsIncluding(
    () =>
      blockIndentPattern(
        byGrammar('asm_x86_nasm'),
        [{ openers: ['IRP_OPEN'], clauses: [], closer: 'REPEAT_CLOSE' }],
        SOURCES,
      ),
    'keywords.h has no IRP_OPEN word for ASM_DIALECT_X86_NASM',
  );
});

test("the tooling reads each dialect's quote, comment, join and block rules from scanner.h", () => {
  const gnu = {
    gnuSyntax: true,
    backquoteStrings: false,
    percentMacros: false,
    lineJoins: false,
    spacedJoins: true,
    reservedNames: false,
    namedStatements: false,
  };
  assert.deepStrictEqual(statementLexing(SCANNER), {
    AUTO: {
      ...gnu,
      semicolons: 'HEURISTIC',
      hashImmediates: true,
      hashNeedsValue: true,
      atComments: true,
    },
    ARM: {
      ...gnu,
      semicolons: 'SEPARATES',
      hashImmediates: true,
      hashNeedsValue: false,
      atComments: true,
    },
    ARM_APPLE: {
      ...gnu,
      semicolons: 'COMMENTS',
      hashImmediates: true,
      hashNeedsValue: false,
      atComments: false,
    },
    X86_GAS: {
      ...gnu,
      semicolons: 'SEPARATES',
      hashImmediates: false,
      hashNeedsValue: false,
      atComments: false,
    },
    X86_NASM: {
      gnuSyntax: false,
      backquoteStrings: true,
      percentMacros: true,
      lineJoins: true,
      spacedJoins: false,
      reservedNames: true,
      namedStatements: true,
      semicolons: 'COMMENTS',
      hashImmediates: false,
      hashNeedsValue: false,
      atComments: false,
    },
  });
  const words = statementWords(SOURCES, 'X86_GAS');
  const named = (...symbols: string[]) =>
    words.filter(({ symbol }) => symbols.includes(symbol)).map(({ name }) => name);
  assert.deepStrictEqual(named('MACRO_OPEN', 'REPT_OPEN', 'IRP_OPEN', 'IRPC_OPEN'), [
    '.irep',
    '.irepc',
    '.irp',
    '.irpc',
    '.macro',
    '.rep',
    '.rept',
  ]);
  assert.deepStrictEqual(named('IF_OPEN'), [
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
  assert.deepStrictEqual(named('ELSEIF', 'ELSE'), ['.else', '.elsec', '.elseif']);
  assert.deepStrictEqual(named('MACRO_CLOSE', 'CONDITIONAL_CLOSE', 'REPEAT_CLOSE'), [
    '.endc',
    '.endif',
    '.endm',
    '.endmacro',
    '.endr',
  ]);
  const nasm = statementWords(SOURCES, 'X86_NASM');
  const nasmNamed = (...symbols: string[]) =>
    nasm.filter(({ symbol }) => symbols.includes(symbol)).map(({ name }) => name);
  assert.deepStrictEqual(nasmNamed('MACRO_OPEN', 'REPT_OPEN'), [
    '%imacro',
    '%irmacro',
    '%macro',
    '%rep',
    '%rmacro',
  ]);
  assert.deepStrictEqual(nasmNamed('ELSE'), ['%else']);
  assert.deepStrictEqual(nasmNamed('MACRO_CLOSE', 'CONDITIONAL_CLOSE', 'REPEAT_CLOSE'), [
    '%endif',
    '%endm',
    '%endmacro',
    '%endrep',
  ]);
});

test('a syntax joins lines in the grammar exactly where its dialects join them in the scanner', () => {
  const lexing = statementLexing(SCANNER);
  for (const language of manifest.languages) {
    assert.deepStrictEqual(
      lexical[language.syntax].lineJoins === true,
      lexing[language.dialect].lineJoins,
      language.grammar,
    );
  }
});

test('a block that names an unknown opener or closer fails with a clear message', () => {
  const language = byGrammar('asm_arm');
  assertThrowsIncluding(
    () =>
      blockIndentPattern(
        language,
        [{ openers: ['NOPE'], clauses: [], closer: 'MACRO_CLOSE' }],
        SOURCES,
      ),
    'scanner.h has no block opener for NOPE',
  );
  assertThrowsIncluding(
    () =>
      blockIndentPattern(
        language,
        [{ openers: ['MACRO_OPEN'], clauses: ['NOPE'], closer: 'MACRO_CLOSE' }],
        SOURCES,
      ),
    'scanner.h has no block clause for NOPE',
  );
  assertThrowsIncluding(
    () =>
      blockIndentPattern(
        language,
        [{ openers: ['MACRO_OPEN'], clauses: [], closer: 'NOPE' }],
        SOURCES,
      ),
    'scanner.h has no block closer for NOPE',
  );
});
