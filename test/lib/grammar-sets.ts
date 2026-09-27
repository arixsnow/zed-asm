// SPDX-License-Identifier: MIT

import { join } from '@std/path';

import { ROOT } from '../../scripts/lib/files.ts';

export interface Rule {
  type: string;
  value?: string | number;
  name?: string;
  members?: Rule[];
  content?: Rule;
}

export interface Grammar {
  rules: Record<string, Rule>;
  externals: Rule[];
}

export interface TokenSet {
  terminals: Map<string, Rule>;
  externals: Set<string>;
  nullable: boolean;
}

const TERMINALS = new Set(['STRING', 'PATTERN', 'TOKEN', 'IMMEDIATE_TOKEN']);
const WRAPPERS = new Set(['FIELD', 'ALIAS', 'PREC', 'PREC_LEFT', 'PREC_RIGHT', 'PREC_DYNAMIC']);

function emptySet(nullable = false): TokenSet {
  return { terminals: new Map(), externals: new Set(), nullable };
}

function addAll(target: TokenSet, source: TokenSet): boolean {
  const before = target.terminals.size + target.externals.size;
  for (const [key, rule] of source.terminals) {
    target.terminals.set(key, rule);
  }
  for (const name of source.externals) {
    target.externals.add(name);
  }
  return target.terminals.size + target.externals.size !== before;
}

export function tokenPattern(rule: Rule): string {
  switch (rule.type) {
    case 'STRING':
      return String(rule.value).replace(/[\\^$.*+?()[\]{}|/-]/g, '\\$&');
    case 'PATTERN':
      return `(?:${rule.value})`;
    case 'BLANK':
      return '';
    case 'SEQ':
      return (rule.members ?? []).map(tokenPattern).join('');
    case 'CHOICE':
      return `(?:${(rule.members ?? []).map(tokenPattern).join('|')})`;
    case 'REPEAT':
      return `(?:${tokenPattern(rule.content as Rule)})*`;
    case 'REPEAT1':
      return `(?:${tokenPattern(rule.content as Rule)})+`;
    case 'TOKEN':
    case 'IMMEDIATE_TOKEN':
      return tokenPattern(rule.content as Rule);
    default:
      if (WRAPPERS.has(rule.type)) {
        return tokenPattern(rule.content as Rule);
      }
      throw new Error(`a token cannot contain ${rule.type}`);
  }
}

export function lexes(set: TokenSet, input: string): boolean {
  for (const rule of set.terminals.values()) {
    const match = new RegExp(`^${tokenPattern(rule)}`).exec(input);
    if (match !== null && match[0].length > 0) {
      return true;
    }
  }
  return false;
}

export function readGrammar(grammar: string): Grammar {
  return JSON.parse(
    Deno.readTextFileSync(join(ROOT, 'tree-sitter', grammar, 'src', 'grammar.json')),
  );
}

export class GrammarSets {
  readonly externals: Set<string>;
  readonly first = new Map<string, TokenSet>();

  constructor(readonly grammar: Grammar) {
    this.externals = new Set(grammar.externals.map((external) => external.name ?? ''));
    for (const name of Object.keys(grammar.rules)) {
      this.first.set(name, emptySet());
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (const [name, rule] of Object.entries(grammar.rules)) {
        const target = this.first.get(name) as TokenSet;
        const next = this.firstOf(rule);
        changed = addAll(target, next) || changed;
        if (next.nullable && !target.nullable) {
          target.nullable = true;
          changed = true;
        }
      }
    }
  }

  firstOf(rule: Rule): TokenSet {
    if (TERMINALS.has(rule.type)) {
      return {
        terminals: new Map([[JSON.stringify(rule), rule]]),
        externals: new Set(),
        nullable: false,
      };
    }
    switch (rule.type) {
      case 'BLANK':
        return emptySet(true);
      case 'SYMBOL':
        return this.symbolFirst(rule.name ?? '');
      case 'SEQ': {
        const result = emptySet(true);
        for (const member of rule.members ?? []) {
          const next = this.firstOf(member);
          addAll(result, next);
          if (!next.nullable) {
            result.nullable = false;
            break;
          }
        }
        return result;
      }
      case 'CHOICE': {
        const result = emptySet();
        for (const member of rule.members ?? []) {
          const next = this.firstOf(member);
          addAll(result, next);
          result.nullable ||= next.nullable;
        }
        return result;
      }
      case 'REPEAT':
        return { ...this.firstOf(rule.content as Rule), nullable: true };
      default:
        return this.firstOf(rule.content as Rule);
    }
  }

  symbolFirst(name: string): TokenSet {
    if (this.externals.has(name)) {
      return { terminals: new Map(), externals: new Set([name]), nullable: false };
    }
    const known = this.first.get(name);
    if (known === undefined) {
      throw new Error(`unknown rule ${name}`);
    }
    return {
      terminals: new Map(known.terminals),
      externals: new Set(known.externals),
      nullable: known.nullable,
    };
  }

  closure(start: string): Set<string> {
    const found = new Set<string>();
    const pending = [start];
    while (pending.length > 0) {
      const name = pending.pop() as string;
      if (found.has(name) || this.externals.has(name)) {
        continue;
      }
      found.add(name);
      this.visitSymbols(this.grammar.rules[name], (symbol) => pending.push(symbol));
    }
    return found;
  }

  visitSymbols(rule: Rule, onSymbol: (name: string) => void) {
    if (TERMINALS.has(rule.type)) {
      return;
    }
    if (rule.type === 'SYMBOL') {
      onSymbol(rule.name ?? '');
    }
    for (const member of rule.members ?? []) {
      this.visitSymbols(member, onSymbol);
    }
    if (rule.content !== undefined) {
      this.visitSymbols(rule.content, onSymbol);
    }
  }

  continuations(start: string): TokenSet {
    const rules = this.closure(start);
    const follow = new Map([...rules].map((name) => [name, emptySet()]));
    let changed = true;
    const visit = (rule: Rule, after: TokenSet) => {
      if (rule.type === 'SYMBOL') {
        const target = follow.get(rule.name ?? '');
        if (target !== undefined) {
          changed = addAll(target, after) || changed;
        }
      } else if (rule.type === 'SEQ') {
        const members = rule.members ?? [];
        let tail = after;
        for (let index = members.length - 1; index >= 0; index--) {
          visit(members[index], tail);
          const first = this.firstOf(members[index]);
          const next = emptySet();
          addAll(next, first);
          if (first.nullable) {
            addAll(next, tail);
          }
          tail = next;
        }
      } else if (rule.type === 'CHOICE') {
        for (const member of rule.members ?? []) {
          visit(member, after);
        }
      } else if (rule.type === 'REPEAT' || rule.type === 'REPEAT1') {
        const next = emptySet();
        addAll(next, this.firstOf(rule.content as Rule));
        addAll(next, after);
        visit(rule.content as Rule, next);
      } else if (WRAPPERS.has(rule.type)) {
        visit(rule.content as Rule, after);
      }
    };
    while (changed) {
      changed = false;
      for (const name of rules) {
        visit(this.grammar.rules[name], follow.get(name) as TokenSet);
      }
    }
    return follow.get(start) as TokenSet;
  }
}
