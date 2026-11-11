// SPDX-License-Identifier: MIT

import type { Keywords, Project } from './source.ts';

export interface HeaderTable {
  name: string;
  keywords: Keywords;
  role?: (word: string) => string;
  flagged?: boolean;
}

export interface HeaderConstant {
  name: string;
  value: number;
}

function quoted(text: string): string {
  return `"${text.replace(/["\\]/g, (character) => `\\${character}`)}"`;
}

function entry(word: string, flags: string[], table: HeaderTable): string {
  const flagText = flags.length === 0 ? '0' : flags.join(' | ');
  if (table.role !== undefined) {
    return `X(${quoted(word)}, ${table.role(word)}, ${flagText})`;
  }
  return table.flagged === true ? `X(${quoted(word)}, ${flagText})` : `X(${quoted(word)})`;
}

function xTable(name: string, lines: string[]): string {
  if (lines.length === 0) {
    throw new Error(`table ${name} is empty`);
  }
  const body = lines.map((line, index) => `  ${line}${index === lines.length - 1 ? '' : ' \\'}`);
  return [`#define ${name}(X) \\`, ...body, ''].join('\n');
}

export function header(
  projects: Project[],
  constants: HeaderConstant[],
  tables: HeaderTable[],
): string {
  const sections = [
    xTable(
      'ASM_KEYWORD_SOURCES',
      projects.map(({ name, commit }) => `X(${quoted(name)}, ${quoted(commit)})`),
    ),
    ...tables.map((table) =>
      xTable(
        table.name,
        table.keywords.entries().map(([word, flags]) => entry(word, flags, table)),
      )
    ),
  ];
  const counts = constants.length === 0
    ? []
    : ['enum {', ...constants.map(({ name, value }) => `  ${name} = ${value},`), '};', ''];
  return [
    '#ifndef ASM_KEYWORDS_H',
    '#define ASM_KEYWORDS_H',
    '',
    ...counts,
    ...sections,
    '#endif /* ASM_KEYWORDS_H */',
    '',
  ].join('\n');
}
