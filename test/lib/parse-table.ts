// SPDX-License-Identifier: MIT

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT } from '../../scripts/lib/files.ts';
import type { Grammar, Rule, TokenSet } from './grammar-sets.ts';

const ENUM = /enum ts_symbol_identifiers \{([^}]*)\}/;
const NAMES = /static const char \* const ts_symbol_names\[\] = \{([\s\S]*?)\n\};/;
const EXTERNAL_MAP =
  /static const TSSymbol ts_external_scanner_symbol_map\[[^\]]*\] = \{([\s\S]*?)\n\};/;
const LARGE =
  /static const uint16_t ts_parse_table\[LARGE_STATE_COUNT\]\[SYMBOL_COUNT\] = \{([\s\S]*?)\n\};/;
const SMALL = /static const uint16_t ts_small_parse_table\[\] = \{([\s\S]*?)\n\};/;
const SMALL_MAP = /static const uint32_t ts_small_parse_table_map\[\] = \{([\s\S]*?)\n\};/;

function count(parser: string, name: string): number {
  const match = new RegExp(`#define ${name} (\\d+)`).exec(parser);
  if (match === null) {
    throw new Error(`parser.c defines no ${name}`);
  }
  return Number(match[1]);
}

function section(parser: string, pattern: RegExp, what: string): string {
  const match = pattern.exec(parser);
  if (match === null) {
    throw new Error(`parser.c has no ${what}`);
  }
  return match[1];
}

function unescape(text: string): string {
  return text.replace(/\\(.)/g, (_, character: string) => character === 'n' ? '\n' : character);
}

export class ParseTable {
  readonly #ids = new Map<string, number>();
  readonly #names = new Map<number, string>();
  readonly #externals = new Set<number>();
  readonly #large = new Map<number, Set<number>>();
  readonly #small = new Map<number, Set<number>>();
  readonly #tokenCount: number;

  constructor(readonly grammarName: string, readonly grammar: Grammar) {
    const parser = readFileSync(join(ROOT, 'tree-sitter', grammarName, 'src', 'parser.c'), 'utf8');
    this.#tokenCount = count(parser, 'TOKEN_COUNT');
    const largeCount = count(parser, 'LARGE_STATE_COUNT');
    for (const [, id, value] of section(parser, ENUM, 'symbol enum').matchAll(/(\w+) = (\d+)/g)) {
      this.#ids.set(id, Number(value));
    }
    this.#ids.set('ts_builtin_sym_end', 0);
    for (
      const [, id, name] of section(parser, NAMES, 'symbol names').matchAll(
        /\[(\w+)\] = "((?:[^"\\]|\\.)*)"/g,
      )
    ) {
      this.#names.set(this.#id(id), unescape(name));
    }
    for (
      const [, id] of section(parser, EXTERNAL_MAP, 'external symbol map').matchAll(
        /\] = (\w+),/g,
      )
    ) {
      this.#externals.add(this.#id(id));
    }
    const large = section(parser, LARGE, 'large parse table');
    for (const [, state, body] of large.matchAll(/\[STATE\((\d+)\)\] = \{([\s\S]*?)\n {2}\},/g)) {
      const symbols = new Set<number>();
      for (const [, id] of body.matchAll(/\[(\w+)\] = ACTIONS\(\d+\)/g)) {
        symbols.add(this.#id(id));
      }
      this.#large.set(Number(state), symbols);
    }
    if (this.#large.size !== largeCount) {
      throw new Error(`${grammarName}: read ${this.#large.size} of ${largeCount} large states`);
    }
    const offsets = this.#readSmall(section(parser, SMALL, 'small parse table'));
    for (
      const [, state, offset] of section(parser, SMALL_MAP, 'small table map').matchAll(
        /\[SMALL_STATE\((\d+)\)\] = (\d+),/g,
      )
    ) {
      const symbols = offsets.get(Number(offset));
      if (symbols === undefined) {
        throw new Error(`${grammarName}: no small state at offset ${offset}`);
      }
      this.#small.set(Number(state), symbols);
    }
  }

  #id(name: string): number {
    const id = this.#ids.get(name);
    if (id === undefined) {
      throw new Error(`${this.grammarName}: parser.c has no symbol ${name}`);
    }
    return id;
  }

  #readSmall(body: string): Map<number, Set<number>> {
    const offsets = new Map<number, Set<number>>();
    const words = body.split(/[\s,]+/).filter((word) => word !== '');
    let index = 0;
    while (index < words.length) {
      const start = /^\[(\d+)\]$/.exec(words[index]);
      if (start === null || words[index + 1] !== '=') {
        throw new Error(`${this.grammarName}: unexpected small table entry ${words[index]}`);
      }
      const groups = Number(words[index + 2]);
      const symbols = new Set<number>();
      index += 3;
      for (let group = 0; group < groups; group++) {
        const action = /^(ACTIONS|STATE)\(\d+\)$/.exec(words[index]);
        if (action === null) {
          throw new Error(`${this.grammarName}: unexpected small table group ${words[index]}`);
        }
        const size = Number(words[index + 1]);
        for (const id of words.slice(index + 2, index + 2 + size)) {
          if (action[1] === 'ACTIONS') {
            symbols.add(this.#id(id));
          }
        }
        index += 2 + size;
      }
      offsets.set(Number(start[1]), symbols);
    }
    return offsets;
  }

  #symbols(state: number): Set<number> {
    const symbols = this.#large.get(state) ?? this.#small.get(state);
    if (symbols === undefined) {
      throw new Error(`${this.grammarName}: no parse state ${state}`);
    }
    return symbols;
  }

  acceptsAny(states: number[], names: Set<string>): boolean {
    const ids = [...names].map((name) => this.#id(`sym_${name}`));
    return states.some((state) => ids.some((id) => this.#symbols(state).has(id)));
  }

  isExternal(name: string): boolean {
    const id = this.#ids.get(name);
    return id !== undefined && this.#externals.has(id);
  }

  internalTokens(states: number[]): TokenSet {
    const terminals = new Map<string, Rule>();
    for (const state of states) {
      for (const id of this.#symbols(state)) {
        if (id === 0 || id >= this.#tokenCount || this.#externals.has(id)) {
          continue;
        }
        const rule = this.#rule(id);
        terminals.set(JSON.stringify(rule), rule);
      }
    }
    return { terminals, externals: new Set(), nullable: false };
  }

  #rule(id: number): Rule {
    const symbol = [...this.#ids].find(([, value]) => value === id)?.[0] ?? '';
    if (symbol.startsWith('anon_sym_')) {
      return { type: 'STRING', value: this.#names.get(id) ?? '' };
    }
    const name = symbol.replace(/^sym_/, '');
    const rule = this.grammar.rules[name];
    if (rule === undefined) {
      throw new Error(`${this.grammarName}: token ${symbol} has no rule in grammar.json`);
    }
    return rule;
  }
}
