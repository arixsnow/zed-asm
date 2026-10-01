// SPDX-License-Identifier: MIT

import { emptyDirSync, ensureDirSync } from '@std/fs';
import { dirname, join } from '@std/path';

import { filesUnder, ifExists, readTextIfExists, ROOT } from './lib/files.ts';
import { increaseIndentPattern } from './lib/indent.ts';
import { type Language, type Manifest, manifest, parseAuthor } from './lib/manifest.ts';

export const QUERY_KINDS = [
  'highlights',
  'brackets',
  'outline',
  'indents',
  'injections',
  'overrides',
  'redactions',
  'runnables',
  'debugger',
  'textobjects',
] as const;

const MANIFEST_FILE = 'languages.config.cjs';
const USAGE = 'usage: build.ts write | check | corpus | set-grammar-rev <40-character commit sha>';

type ReadFragment = (source: string, kind: string) => string | undefined;
type ReadCorpus = (source: string) => [string, string][];

export function sourcesOf(language: Pick<Language, 'syntax' | 'archs'>): string[] {
  return [
    'core',
    language.syntax,
    ...language.archs,
    ...language.archs.map((arch) => `${arch}.${language.syntax}`),
  ];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTableOfTables(value: unknown): value is Record<string, Record<string, unknown>> {
  return isPlainObject(value) && Object.values(value).length > 0 &&
    Object.values(value).every(isPlainObject);
}

function defined(table: Record<string, unknown>): [string, unknown][] {
  return Object.entries(table).filter(([, value]) => value !== undefined);
}

function tomlValue(value: unknown): string {
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    const items = value.map(tomlValue);
    return value.some(isPlainObject)
      ? `[\n${items.map((item) => `  ${item},`).join('\n')}\n]`
      : `[${items.join(', ')}]`;
  }
  if (isPlainObject(value)) {
    const entries = defined(value).map(([key, item]) => `${key} = ${tomlValue(item)}`);
    return `{ ${entries.join(', ')} }`;
  }
  throw new TypeError(`cannot write ${typeof value} as TOML`);
}

export function toToml(table: Record<string, unknown>): string {
  const lines: string[] = [];
  const sections: [string, Record<string, Record<string, unknown>>][] = [];
  for (const [key, value] of defined(table)) {
    if (isTableOfTables(value)) {
      sections.push([key, value]);
    } else {
      lines.push(`${key} = ${tomlValue(value)}`);
    }
  }
  for (const [key, tables] of sections) {
    for (const [name, entries] of Object.entries(tables)) {
      lines.push('', `[${key}.${name}]`);
      for (const [entry, value] of defined(entries)) {
        lines.push(`${entry} = ${tomlValue(value)}`);
      }
    }
  }
  return `${lines.join('\n')}\n`;
}

export function extensionConfig({ extension, languages }: Manifest): Record<string, unknown> {
  const grammars = Object.fromEntries(
    languages.map((language) => [
      language.grammar,
      {
        repository: extension.repository,
        rev: extension.grammarRev,
        path: `tree-sitter/${language.grammar}`,
      },
    ]),
  );
  return {
    id: extension.id,
    name: extension.name,
    version: extension.version,
    schema_version: 1,
    authors: extension.authors,
    description: extension.description,
    repository: extension.repository,
    grammars,
  };
}

export function languageConfig(
  language: Language,
  { syntaxes, shared }: Pick<Manifest, 'syntaxes' | 'shared'>,
): Record<string, unknown> {
  const syntax = syntaxes[language.syntax];
  return {
    name: language.name,
    grammar: language.grammar,
    path_suffixes: language.pathSuffixes.length > 0 ? language.pathSuffixes : undefined,
    modeline_aliases: language.modelineAliases,
    line_comments: language.lineComments,
    block_comment: syntax.blockComments
      ? { start: '/*', prefix: '', end: '*/', tab_size: 1 }
      : undefined,
    documentation_comment: syntax.blockComments
      ? { start: '/*', prefix: '* ', end: '*/', tab_size: 1 }
      : undefined,
    autoclose_before: shared.autoclose_before,
    brackets: syntax.brackets,
    word_characters: language.wordCharacters,
    increase_indent_pattern: increaseIndentPattern(language, syntax),
    decrease_indent_pattern: syntax.labelPattern,
    debuggers: shared.debuggers,
    overrides: syntax.overrides,
  };
}

function treeSitterConfig({ extension, languages }: Manifest): Record<string, unknown> {
  const camelCase = (name: string) =>
    name
      .split('_')
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join('');
  return {
    grammars: languages.map((language) => ({
      name: language.grammar,
      camelcase: camelCase(language.grammar),
      scope: `source.${language.grammar.replaceAll('_', '.')}`,
      path: language.grammar,
      'file-types': language.pathSuffixes,
      highlights: `../languages/${language.dir}/highlights.scm`,
      'external-files': ['common/scanner.h'],
    })),
    metadata: {
      version: extension.version,
      license: extension.license,
      description: extension.description,
      authors: extension.authors.map((author, index) =>
        parseAuthor(author, `extension.authors[${index}]`)
      ),
      links: { repository: extension.repository },
    },
    bindings: { c: false, go: false, node: false, python: false, rust: false, swift: false },
  };
}

export function renderQueries(
  language: Pick<Language, 'syntax' | 'archs'>,
  readFragment: ReadFragment,
): Map<string, string> {
  const files = new Map<string, string>();
  for (const kind of QUERY_KINDS) {
    const parts = sourcesOf(language)
      .map((source) => readFragment(source, kind))
      .filter((text): text is string => text !== undefined && text.trim() !== '');
    if (parts.length > 0) {
      files.set(`${kind}.scm`, `${parts.map((text) => text.trimEnd()).join('\n\n')}\n`);
    }
  }
  return files;
}

export function renderCorpus(
  language: Pick<Language, 'syntax' | 'archs' | 'grammar'>,
  readCorpus: ReadCorpus,
): Map<string, string> {
  const files = new Map<string, string>();
  for (const source of [...sourcesOf(language), language.grammar]) {
    for (const [name, text] of readCorpus(source)) {
      files.set(`${source}--${name}`, text);
    }
  }
  return files;
}

export function renderAll(manifest: Manifest, readFragment: ReadFragment): Map<string, string> {
  const outputs = new Map<string, string>([
    ['extension.toml', toToml(extensionConfig(manifest))],
    ['tree-sitter/tree-sitter.json', `${JSON.stringify(treeSitterConfig(manifest), null, 2)}\n`],
  ]);
  for (const language of manifest.languages) {
    outputs.set(
      `tree-sitter/${language.grammar}/grammar.js`,
      `module.exports = require('../common/define-grammar')('${language.grammar}');\n`,
    );
    outputs.set(
      `tree-sitter/${language.grammar}/src/scanner.c`,
      `#define ASM_GRAMMAR_NAME ${language.grammar}\n#define ASM_DIALECT_${language.dialect}\n#include "../../common/scanner.h"\n`,
    );
    outputs.set(
      `languages/${language.dir}/config.toml`,
      toToml(languageConfig(language, manifest)),
    );
    for (const [file, text] of renderQueries(language, readFragment)) {
      outputs.set(`languages/${language.dir}/${file}`, text);
    }
  }
  return outputs;
}

function readQueryFragment(source: string, kind: string): string | undefined {
  return readTextIfExists(join(ROOT, 'queries', source, `${kind}.scm`));
}

function readCorpus(source: string): [string, string][] {
  const directory = join(ROOT, 'test', 'corpus', source);
  const entries = ifExists(() => [...Deno.readDirSync(directory)]) ?? [];
  return entries
    .filter((entry) => entry.isFile && entry.name.endsWith('.txt'))
    .map((entry) => entry.name)
    .sort()
    .map((name) => [name, Deno.readTextFileSync(join(directory, name))]);
}

function syncGenerated(manifest: Manifest, write: boolean): string[] {
  const outputs = renderAll(manifest, readQueryFragment);
  const stale: string[] = [];
  for (const [path, text] of outputs) {
    const file = join(ROOT, path);
    if (readTextIfExists(file) === text) {
      continue;
    }
    stale.push(path);
    if (write) {
      ensureDirSync(dirname(file));
      Deno.writeTextFileSync(file, text);
    }
  }
  for (const path of filesUnder(join(ROOT, 'languages')).map((file) => `languages/${file}`)) {
    if (outputs.has(path)) {
      continue;
    }
    stale.push(path);
    if (write) {
      Deno.removeSync(join(ROOT, path));
    }
  }
  return stale;
}

function writeCorpus(manifest: Manifest): void {
  for (const language of manifest.languages) {
    const directory = join(ROOT, 'tree-sitter', language.grammar, 'test', 'corpus');
    emptyDirSync(directory);
    for (const [name, text] of renderCorpus(language, readCorpus)) {
      Deno.writeTextFileSync(join(directory, name), text);
    }
  }
}

function setGrammarRev(manifest: Manifest, rev: string): Manifest {
  const path = join(ROOT, MANIFEST_FILE);
  const text = Deno.readTextFileSync(path);
  const pattern = /grammarRev: '[0-9a-f]{40}'/;
  if (!pattern.test(text)) {
    throw new Error(`grammarRev not found in ${MANIFEST_FILE}`);
  }
  Deno.writeTextFileSync(path, text.replace(pattern, `grammarRev: '${rev}'`));
  return { ...manifest, extension: { ...manifest.extension, grammarRev: rev } };
}

function write(manifest: Manifest): void {
  const updated = syncGenerated(manifest, true);
  console.log(
    updated.length > 0
      ? `Updated ${updated.length} generated file(s).`
      : 'Generated files are up to date.',
  );
}

function main([command, argument, ...rest]: string[]): number {
  const takesSha = command === 'set-grammar-rev';
  const argumentIsValid = takesSha ? /^[0-9a-f]{40}$/.test(argument ?? '') : argument === undefined;
  if (rest.length > 0 || !argumentIsValid) {
    console.error(USAGE);
    return 2;
  }
  switch (command) {
    case 'write':
      write(manifest);
      return 0;
    case 'check': {
      const stale = syncGenerated(manifest, false);
      if (stale.length > 0) {
        console.error(
          `Generated files are out of date:\n  ${
            stale.join('\n  ')
          }\nRun: scripts/dev deno task build`,
        );
        return 1;
      }
      return 0;
    }
    case 'corpus':
      writeCorpus(manifest);
      return 0;
    case 'set-grammar-rev':
      write(setGrammarRev(manifest, argument));
      return 0;
    default:
      console.error(USAGE);
      return 2;
  }
}

if (import.meta.main) {
  Deno.exitCode = main(Deno.args);
}
