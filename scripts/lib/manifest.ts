// SPDX-License-Identifier: MIT

import config from '../../languages.config.cjs';

export const DIALECTS = ['AUTO', 'ARM', 'ARM_APPLE', 'X86_GAS', 'X86_NASM'] as const;
export const ARCHS = ['arm', 'x86'] as const;

export type Dialect = typeof DIALECTS[number];
export type Arch = typeof ARCHS[number];

export interface Extension {
  id: string;
  name: string;
  version: string;
  description: string;
  authors: string[];
  license: string;
  repository: string;
  grammarRev: string;
}

export interface Bracket {
  start: string;
  end: string;
  close: boolean;
  newline: boolean;
  not_in?: string[];
}

export interface Block {
  openers: string[];
  clauses: string[];
  closer: string;
}

export interface Syntax {
  blockComments: boolean;
  brackets: Bracket[];
  labelPattern: string;
  blocks: Block[];
  overrides?: Record<string, Record<string, string[]>>;
}

export interface Language {
  dir: string;
  name: string;
  grammar: string;
  dialect: Dialect;
  syntax: string;
  archs: Arch[];
  pathSuffixes: string[];
  modelineAliases: string[];
  lineComments: string[];
  wordCharacters: string[];
}

export interface Shared {
  autoclose_before: string;
  debuggers: string[];
}

export interface Manifest {
  extension: Extension;
  syntaxes: Record<string, Syntax>;
  languages: Language[];
  shared: Shared;
}

export interface Author {
  name: string;
  email: string;
}

type Check<T> = (value: unknown, path: string) => T;

function fail(path: string, problem: string): never {
  throw new Error(`languages.config.cjs: ${path} ${problem}`);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(path, 'must be an object');
  }
  return value as Record<string, unknown>;
}

const text: Check<string> = (value, path) => {
  if (typeof value !== 'string' || value === '') {
    fail(path, 'must be a non-empty string');
  }
  return value;
};

const flag: Check<boolean> = (value, path) => {
  if (typeof value !== 'boolean') {
    fail(path, 'must be a boolean');
  }
  return value;
};

function list<T>(check: Check<T>): Check<T[]> {
  return (value, path) => {
    if (!Array.isArray(value)) {
      fail(path, 'must be an array');
    }
    return value.map((item, index) => check(item, `${path}[${index}]`));
  };
}

function nonEmpty<T>(check: Check<T[]>, item: string): Check<T[]> {
  return (value, path) => {
    const items = check(value, path);
    if (items.length === 0) {
      fail(path, `must list at least one ${item}`);
    }
    return items;
  };
}

function optional<T>(check: Check<T>): Check<T | undefined> {
  return (value, path) => (value === undefined ? undefined : check(value, path));
}

function oneOf<T extends string>(options: readonly T[]): Check<T> {
  return (value, path) => {
    const name = text(value, path);
    if (!options.some((option) => option === name)) {
      fail(path, `must be one of ${options.join(', ')} (got "${name}")`);
    }
    return name as T;
  };
}

function matching(pattern: RegExp, description: string): Check<string> {
  return (value, path) => {
    const name = text(value, path);
    if (!pattern.test(name)) {
      fail(path, `must be ${description} (got "${name}")`);
    }
    return name;
  };
}

const regularExpression: Check<string> = (value, path) => {
  const pattern = text(value, path);
  try {
    new RegExp(pattern);
  } catch {
    fail(path, `must be a valid regular expression (got "${pattern}")`);
  }
  return pattern;
};

export function parseAuthor(author: string, path: string): Author {
  const match = /^(.*?)\s*<(.*)>$/.exec(author);
  if (match === null) {
    fail(path, `must look like "Name <email>" (got "${author}")`);
  }
  return { name: match[1], email: match[2] };
}

const texts = list(text);

function extension(value: unknown, path: string): Extension {
  const entry = record(value, path);
  const authors = nonEmpty(texts, 'author')(entry.authors, `${path}.authors`);
  authors.forEach((author, index) => parseAuthor(author, `${path}.authors[${index}]`));
  return {
    id: text(entry.id, `${path}.id`),
    name: text(entry.name, `${path}.name`),
    version: matching(/^\d+\.\d+\.\d+$/, 'a MAJOR.MINOR.PATCH version')(
      entry.version,
      `${path}.version`,
    ),
    description: text(entry.description, `${path}.description`),
    authors,
    license: text(entry.license, `${path}.license`),
    repository: matching(/^https:\/\/\S+$/, 'an https URL')(entry.repository, `${path}.repository`),
    grammarRev: matching(/^[0-9a-f]{40}$/, 'a 40-character commit sha')(
      entry.grammarRev,
      `${path}.grammarRev`,
    ),
  };
}

const bracket: Check<Bracket> = (value, path) => {
  const entry = record(value, path);
  return {
    start: text(entry.start, `${path}.start`),
    end: text(entry.end, `${path}.end`),
    close: flag(entry.close, `${path}.close`),
    newline: flag(entry.newline, `${path}.newline`),
    not_in: optional(texts)(entry.not_in, `${path}.not_in`),
  };
};

function tableOf<T>(check: Check<T>): Check<Record<string, T>> {
  return (value, path) => {
    const table: Record<string, T> = {};
    for (const [key, item] of Object.entries(record(value, path))) {
      table[key] = check(item, `${path}.${key}`);
    }
    return table;
  };
}

const block: Check<Block> = (value, path) => {
  const entry = record(value, path);
  return {
    openers: nonEmpty(texts, 'opener')(entry.openers, `${path}.openers`),
    clauses: texts(entry.clauses, `${path}.clauses`),
    closer: text(entry.closer, `${path}.closer`),
  };
};

const syntax: Check<Syntax> = (value, path) => {
  const entry = record(value, path);
  return {
    blockComments: flag(entry.blockComments, `${path}.blockComments`),
    brackets: list(bracket)(entry.brackets, `${path}.brackets`),
    labelPattern: regularExpression(entry.labelPattern, `${path}.labelPattern`),
    blocks: list(block)(entry.blocks, `${path}.blocks`),
    overrides: optional(tableOf(tableOf(texts)))(entry.overrides, `${path}.overrides`),
  };
};

function language(syntaxNames: string[]): Check<Language> {
  return (value, path) => {
    const entry = record(value, path);
    return {
      dir: matching(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase words joined by "-"')(
        entry.dir,
        `${path}.dir`,
      ),
      name: text(entry.name, `${path}.name`),
      grammar: matching(/^[a-z][a-z0-9_]*$/, 'a lowercase C identifier')(
        entry.grammar,
        `${path}.grammar`,
      ),
      dialect: oneOf(DIALECTS)(entry.dialect, `${path}.dialect`),
      syntax: oneOf(syntaxNames)(entry.syntax, `${path}.syntax`),
      archs: list(oneOf(ARCHS))(entry.archs, `${path}.archs`),
      pathSuffixes: texts(entry.pathSuffixes, `${path}.pathSuffixes`),
      modelineAliases: texts(entry.modelineAliases, `${path}.modelineAliases`),
      lineComments: texts(entry.lineComments, `${path}.lineComments`),
      wordCharacters: texts(entry.wordCharacters, `${path}.wordCharacters`),
    };
  };
}

const shared: Check<Shared> = (value, path) => {
  const entry = record(value, path);
  return {
    autoclose_before: text(entry.autoclose_before, `${path}.autoclose_before`),
    debuggers: texts(entry.debuggers, `${path}.debuggers`),
  };
};

function requireUnique(languages: Language[]): void {
  for (const field of ['dir', 'name', 'grammar', 'pathSuffixes', 'modelineAliases'] as const) {
    const owners = new Map<string, number>();
    for (const [index, entry] of languages.entries()) {
      for (const value of [entry[field]].flat()) {
        const owner = owners.get(value);
        if (owner !== undefined) {
          fail(`languages[${index}].${field}`, `"${value}" is already used by languages[${owner}]`);
        }
        owners.set(value, index);
      }
    }
  }
}

export function validateManifest(value: unknown): Manifest {
  const root = record(value, 'module.exports');
  const validExtension = extension(root.extension, 'extension');
  const syntaxes = tableOf(syntax)(root.syntaxes, 'syntaxes');
  const languages = nonEmpty(list(language(Object.keys(syntaxes))), 'language')(
    root.languages,
    'languages',
  );
  requireUnique(languages);
  return {
    extension: validExtension,
    syntaxes,
    languages,
    shared: shared(root.shared, 'shared'),
  };
}

export const manifest: Manifest = validateManifest(config);
