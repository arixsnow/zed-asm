// SPDX-License-Identifier: MIT

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT } from './files.ts';

export const GNU_SCOPE = 'GNU';

export interface TableRow {
  name: string;
  literal: string;
  fields: string[];
}

export interface KeywordSources {
  scanner: string;
  keywords: string;
  tables: Map<string, TableRow[]>;
}

const TABLE = /^#define (ASM_\w+)\(X\) \\\n((?:[^\n]*\\\n)*[^\n]*)/gm;

function readCommon(name: string): string {
  return readFileSync(join(ROOT, 'tree-sitter', 'common', name), 'utf8');
}

function readLiteral(table: string, text: string): { name: string; rest: string } {
  if (text[0] !== '"') {
    throw new Error(`keywords.h: a ${table} row must start with a string, not ${text}`);
  }
  let name = '';
  let index = 1;
  while (text[index] !== '"') {
    if (index >= text.length) {
      throw new Error(`keywords.h: unterminated string in ${table}: ${text}`);
    }
    if (text[index] === '\\') {
      index++;
    }
    name += text[index];
    index++;
  }
  return { name, rest: text.slice(index + 1) };
}

function tableRow(table: string, line: string): TableRow {
  const row = /^ {2}X\((.*)\)(?: \\)?$/.exec(line);
  if (row === null) {
    throw new Error(`keywords.h: ${table} has a malformed row: ${line}`);
  }
  const { name, rest } = readLiteral(table, row[1]);
  if (rest !== '' && !rest.startsWith(', ')) {
    throw new Error(`keywords.h: ${table} row ${name} has text after its string: ${rest}`);
  }
  return {
    name,
    literal: row[1].slice(0, row[1].length - rest.length),
    fields: rest === '' ? [] : rest.slice(2).split(', '),
  };
}

export function keywordSources(scanner: string, keywords: string): KeywordSources {
  const tables = new Map<string, TableRow[]>();
  for (const [, table, body] of keywords.matchAll(TABLE)) {
    tables.set(table, body.split('\n').map((line) => tableRow(table, line)));
  }
  return { scanner, keywords, tables };
}

export function commonSources(): KeywordSources {
  return keywordSources(readCommon('scanner.h'), readCommon('keywords.h'));
}

export function tableRows(sources: KeywordSources, table: string): TableRow[] {
  const rows = sources.tables.get(table);
  if (rows === undefined) {
    throw new Error(`keywords.h: no ${table} table`);
  }
  return rows;
}

export function tableEntries(sources: KeywordSources, table: string): string[][] {
  return tableRows(sources, table).map(({ name, fields }) => [name, ...fields]);
}

export function dialectDefines(scanner: string): Map<string, Map<string, string>> {
  const dialects = new Map<string, Map<string, string>>();
  const blocks = scanner.matchAll(
    /(?:#ifdef |#elif defined\()ASM_DIALECT_([A-Z0-9_]+)\)?\n((?:#define [A-Z0-9_]+ [A-Z0-9_]+\n)+)/g,
  );
  for (const [, dialect, defines] of blocks) {
    dialects.set(
      dialect,
      new Map(
        [...defines.matchAll(/#define ([A-Z0-9_]+) ([A-Z0-9_]+)/g)].map((
          [, key, value],
        ) => [key, value]),
      ),
    );
  }
  return dialects;
}

export function definedFlag(defines: Map<string, string>, dialect: string, key: string): boolean {
  const value = defines.get(key);
  if (value !== '0' && value !== '1') {
    throw new Error(`scanner.h: ${key} for ASM_DIALECT_${dialect} must be 0 or 1`);
  }
  return value === '1';
}

function settingScopes(defines: Map<string, string>): string[] {
  return [...defines.keys()]
    .map((key) => /^ASM_(\w+)_KEYWORDS$/.exec(key)?.[1])
    .filter((scope): scope is string => scope !== undefined);
}

export function keywordScopes(scanner: string): string[] {
  const orders = [...dialectDefines(scanner).values()].map(settingScopes);
  if (orders.length === 0 || orders[0].length === 0) {
    throw new Error('scanner.h: no ASM_*_KEYWORDS settings');
  }
  for (const order of orders) {
    if (order.join() !== orders[0].join()) {
      throw new Error('scanner.h: every dialect must list its ASM_*_KEYWORDS in the same order');
    }
  }
  return [...orders[0], GNU_SCOPE];
}

export function dialectArchs(scanner: string, dialect: string): string[] {
  const defines = dialectDefines(scanner).get(dialect);
  if (defines === undefined) {
    throw new Error(`scanner.h has no settings for ASM_DIALECT_${dialect}`);
  }
  return settingScopes(defines).filter((arch) =>
    definedFlag(defines, dialect, `ASM_${arch}_KEYWORDS`)
  );
}
