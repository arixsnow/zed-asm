// SPDX-License-Identifier: MIT

import { createRequire } from 'node:module';
import { join } from '@std/path';

import { ROOT } from './files.ts';
import type { Language, Syntax } from './manifest.ts';

export type Semicolons = 'SEPARATES' | 'COMMENTS' | 'HEURISTIC';

export interface StatementLexing {
  semicolons: Semicolons;
  hashImmediates: boolean;
  hashNeedsValue: boolean;
  atComments: boolean;
  atTypes: boolean;
}

export interface BlockKind {
  openers: RegExp[];
  clauses: RegExp[];
  closers: string[];
}

export interface BlockPatternSource {
  blocks: BlockKind[];
  nameCharacter: RegExp;
  lexing: StatementLexing;
}

export interface BlockCloser {
  name: string;
  symbol: string;
}

const BLANKS = ' \\t\\f\\v\\r';
const BLANK = `[${BLANKS}]`;
const VALUE_START = "A-Za-z0-9_.(\\-+~!'\\\\:";
const STRING = '"(?:[^"\\\\]|\\\\.)*(?:"|\\\\?$)';
const CHARACTER = "'(?:\\\\.?|[^\\\\])?'?";
const BLOCK_COMMENT = '/\\*(?:[^*]|\\*+[^*/])*\\*+/';
const OPEN_BLOCK_COMMENT = '/\\*(?:[^*]|\\*+[^*/])*\\**';
const LINE_COMMENT = '//.*';

const lexical = createRequire(import.meta.url)('../../tree-sitter/common/lexical.js');

function classBody(pattern: RegExp): string {
  const source = pattern.source;
  if (!/^\[[^\]^]+\]$/.test(source)) {
    throw new Error(`expected a positive character class, got /${source}/`);
  }
  return source.slice(1, -1);
}

function expandClass(body: string): string[] {
  const characters: string[] = [];
  for (let index = 0; index < body.length; index++) {
    if (body[index + 1] === '-' && index + 2 < body.length) {
      for (let code = body.charCodeAt(index); code <= body.charCodeAt(index + 2); code++) {
        characters.push(String.fromCharCode(code));
      }
      index += 2;
    } else {
      characters.push(body[index]);
    }
  }
  return characters;
}

function classMember(character: string): string {
  return /[\\\]^\-[]/.test(character) ? `\\${character}` : character;
}

function characterClass(characters: string[]): string {
  const codes = [...new Set(characters)].map((character) => character.charCodeAt(0)).sort((a, b) =>
    a - b
  );
  const parts: string[] = [];
  for (let index = 0; index < codes.length;) {
    let end = index;
    while (end + 1 < codes.length && codes[end + 1] === codes[end] + 1) {
      end++;
    }
    const first = classMember(String.fromCharCode(codes[index]));
    const last = classMember(String.fromCharCode(codes[end]));
    parts.push(end - index >= 2 ? `${first}-${last}` : end > index ? `${first}${last}` : first);
    index = end + 1;
  }
  return `[${parts.join('')}]`;
}

function caseless(character: string): string {
  const lower = character.toLowerCase();
  const upper = character.toUpperCase();
  return lower === upper ? classMember(character) : `${lower}${upper}`;
}

interface TrieNode {
  terminal: boolean;
  children: Map<string, TrieNode>;
}

function trieOf(words: string[]): TrieNode {
  const root: TrieNode = { terminal: false, children: new Map() };
  for (const word of words) {
    let node = root;
    for (const character of word.toLowerCase()) {
      let child = node.children.get(character);
      if (child === undefined) {
        child = { terminal: false, children: new Map() };
        node.children.set(character, child);
      }
      node = child;
    }
    node.terminal = true;
  }
  return root;
}

function notWords(node: TrieNode, alphabet: string[], word: string): string {
  const alternatives: string[] = [];
  if (!node.terminal) {
    alternatives.push('');
  }
  const taken = new Set([...node.children.keys()].flatMap((character) => [
    character.toLowerCase(),
    character.toUpperCase(),
  ]));
  const others = alphabet.filter((character) => !taken.has(character));
  if (others.length > 0) {
    alternatives.push(`${characterClass(others)}${word}*`);
  }
  for (const [character, child] of node.children) {
    alternatives.push(`[${caseless(character)}]${notWords(child, alphabet, word)}`);
  }
  return `(?:${alternatives.join('|')})`;
}

export function blockOpenerPattern(source: BlockPatternSource): string {
  const { lexing } = source;
  const name = classBody(source.nameCharacter);
  const alphabet = [...expandClass(name), '\\'];
  const wordClass = `${name}\\\\`;
  const word = `[${wordClass}]`;
  const hashSpecial = !lexing.hashImmediates || lexing.hashNeedsValue;
  const specials = `"';${hashSpecial ? '#' : ''}${lexing.atComments ? '@' : ''}`;
  const tokens = [STRING, CHARACTER, BLOCK_COMMENT];
  if (lexing.hashImmediates && lexing.hashNeedsValue) {
    tokens.push(`#(?:[${VALUE_START.replace("'", '')}]|${CHARACTER})`);
  }
  if (lexing.atComments && lexing.atTypes) {
    tokens.push('@[A-Za-z_]');
  }
  const glued = lexing.atComments ? [`${word}@[${name}]*`] : [];
  const glue = lexing.atComments ? `(?:@[${name}]*)*` : '';
  const either = (...alternatives: string[]) => `(?:${alternatives.join('|')})`;
  const code = `${either(...tokens, ...glued, `[^${specials}]`)}*`;
  const after = `(?:${either(...tokens, `[^${wordClass}${specials}]`)}${code})?`;

  const tails = [LINE_COMMENT, `${OPEN_BLOCK_COMMENT}$`];
  if (!lexing.hashImmediates) {
    tails.push('#.*');
  } else if (lexing.hashNeedsValue) {
    tails.push(`#(?:[^${VALUE_START}].*)?$`);
  }
  if (lexing.semicolons === 'COMMENTS') {
    tails.push(';.*');
  }
  if (lexing.atComments) {
    tails.push(lexing.atTypes ? `${BLANK}@(?:[^A-Za-z_].*)?$` : `${BLANK}@.*`);
  }
  const startTail = lexing.atComments ? '[#@].*' : '#.*';
  const tail = `(?:${tails.join('|')})?`;
  const semicolonComment = `;${BLANK}*(?:[^${BLANKS}.;][^;]*|\\.(?:[^A-Za-z_;][^;]*)?)?`;
  const comments = `(?:${semicolonComment})*`;

  const label = `(?:${word}+${BLANK}*:${BLANK}*)`;
  const dotLabel = `(?:\\.[A-Za-z_]${word}*${BLANK}*:${BLANK}*)`;
  const dotStatement = `\\.[A-Za-z_]${code}`;
  const nondotWord = `${
    characterClass(alphabet.filter((character) => character !== '.'))
  }${word}*${glue}`;
  const visibleNonColon = either(...tokens, `[^${wordClass}${specials}${BLANKS}:]`);
  const nextNonColon = either(...tokens, ...glued, `[^${specials}${BLANKS}:]`);
  const afterWord = `(?:(?:${visibleNonColon}|${BLANK}+${nextNonColon})${code}|${BLANK}+)?`;
  const kindPatterns = (kind: BlockKind) => {
    const notCloser = notWords(
      trieOf(kind.closers.map((closer) => closer.replace(/^\./, ''))),
      alphabet,
      word,
    );
    const firstWord =
      `(?:${visibleNonColon}${code}|(?:${nondotWord}|\\.${notCloser})${afterWord}|${startTail})`;
    let rest = '';
    let clausePrefix = '';
    if (lexing.semicolons === 'SEPARATES') {
      rest = `(?:;${BLANK}*${label}*${firstWord}?)*`;
      clausePrefix = `(?:${label}*${firstWord}?;${BLANK}*)*${label}*`;
    } else if (lexing.semicolons === 'HEURISTIC') {
      rest =
        `(?:${comments};${BLANK}*(?:${dotLabel}${label}*${firstWord}?|\\.${notCloser}${afterWord}))*`;
      clausePrefix =
        `(?:${label}*${firstWord}?${comments};${BLANK}*(?:\\.${notCloser}${afterWord}${comments};${BLANK}*)*(?:${dotLabel}${label}*)?)?`;
    }
    const block = (patterns: RegExp[]) =>
      `(?:${patterns.map((pattern) => pattern.source).join('|')})${after}${rest}`;
    return {
      opener: block(kind.openers),
      clause: kind.clauses.length === 0 ? null : `${clausePrefix}${block(kind.clauses)}`,
    };
  };

  let prefix = '';
  if (lexing.semicolons === 'SEPARATES') {
    prefix = `(?:${code};${BLANK}*)*${label}*`;
  } else if (lexing.semicolons === 'HEURISTIC') {
    prefix =
      `(?:${code}${comments};${BLANK}*(?:${dotStatement}${comments};${BLANK}*)*(?:${dotLabel}${label}*)?)?`;
  }
  const kinds = source.blocks.map(kindPatterns);
  const alternatives = [
    `${prefix}(?:${kinds.map((kind) => kind.opener).join('|')})`,
    ...kinds.flatMap((kind) => kind.clause === null ? [] : [kind.clause]),
  ];
  const ending = lexing.semicolons === 'HEURISTIC' ? `(?:(?:${semicolonComment})+|${tail})` : tail;
  return `^${BLANK}*${label}*(?:${alternatives.join('|')})${ending}$`;
}

export function statementLexing(scanner: string): Record<string, Omit<StatementLexing, 'atTypes'>> {
  const lexing: Record<string, Omit<StatementLexing, 'atTypes'>> = {};
  const blocks = scanner.matchAll(
    /(?:#ifdef |#elif defined\()ASM_DIALECT_([A-Z0-9_]+)\)?\n((?:#define [A-Z_]+ [A-Z0-9_]+\n)+)/g,
  );
  for (const [, dialect, defines] of blocks) {
    const values = new Map(
      [...defines.matchAll(/#define ([A-Z_]+) ([A-Z0-9_]+)/g)].map((
        [, key, value],
      ) => [key, value]),
    );
    const flag = (key: string) => {
      const value = values.get(key);
      if (value !== '0' && value !== '1') {
        throw new Error(`scanner.h: ${key} for ASM_DIALECT_${dialect} must be 0 or 1`);
      }
      return value === '1';
    };
    const semicolons = values.get('ASM_SEMICOLONS')?.replace(/^SEMICOLON_/, '');
    if (semicolons !== 'SEPARATES' && semicolons !== 'COMMENTS' && semicolons !== 'HEURISTIC') {
      throw new Error(`scanner.h: ASM_SEMICOLONS for ASM_DIALECT_${dialect} is not a known mode`);
    }
    lexing[dialect] = {
      semicolons,
      hashImmediates: flag('ASM_HASH_IMMEDIATES'),
      hashNeedsValue: flag('ASM_HASH_NEEDS_VALUE'),
      atComments: flag('ASM_AT_COMMENTS'),
    };
  }
  return lexing;
}

export function blockClosers(scanner: string): BlockCloser[] {
  const table = /BLOCK_CLOSERS\[\] = \{([^;]*)\};/.exec(scanner);
  if (table === null) {
    throw new Error('scanner.h: BLOCK_CLOSERS table not found');
  }
  return [...table[1].matchAll(/\{"([^"]+)", ([A-Z_]+)\}/g)].map(([, name, symbol]) => ({
    name,
    symbol,
  }));
}

export function implicitEnds(scanner: string): { closer: string; ends: string }[] {
  const table = /IMPLICIT_ENDS\[\] = \{([^;]*)\};/.exec(scanner);
  if (table === null) {
    throw new Error('scanner.h: IMPLICIT_ENDS table not found');
  }
  return [...table[1].matchAll(/\{([A-Z_]+), ([A-Z_]+)\}/g)].map(([, closer, ends]) => ({
    closer,
    ends,
  }));
}

export function blockIndentPattern(language: Language, syntax: Syntax): string | null {
  if (syntax.blocks.length === 0) {
    return null;
  }
  const scanner = Deno.readTextFileSync(join(ROOT, 'tree-sitter', 'common', 'scanner.h'));
  const lexing = statementLexing(scanner)[language.dialect];
  if (lexing === undefined) {
    throw new Error(`scanner.h has no settings for ASM_DIALECT_${language.dialect}`);
  }
  const tokens = lexical[language.syntax];
  const closers = blockClosers(scanner);
  const ends = implicitEnds(scanner);
  const token = (key: string) => {
    const pattern = tokens[key];
    if (!(pattern instanceof RegExp)) {
      throw new Error(`lexical.js has no ${language.syntax} token named ${key}`);
    }
    return pattern;
  };
  const kinds = syntax.blocks.map((block) => {
    const openers = block.openers.map(token);
    const clauses = block.clauses.map(token);
    if (!closers.some((closer) => closer.symbol === block.closer)) {
      throw new Error(`scanner.h has no block closer for ${block.closer}`);
    }
    const symbols = [
      block.closer,
      ...ends.filter((end) => end.ends === block.closer).map((end) => end.closer),
    ];
    const names = closers.filter((closer) => symbols.includes(closer.symbol)).map(({ name }) =>
      name
    );
    return { openers, clauses, closers: names };
  });
  return blockOpenerPattern({
    blocks: kinds,
    nameCharacter: tokens.nameCharacter,
    lexing: { ...lexing, atTypes: language.archs.includes('x86') },
  });
}

export function increaseIndentPattern(language: Language, syntax: Syntax): string {
  const blocks = blockIndentPattern(language, syntax);
  return blocks === null ? syntax.labelPattern : `${syntax.labelPattern}|${blocks}`;
}
