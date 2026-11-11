// SPDX-License-Identifier: MIT

import {
    definedFlag,
    dialectDefines,
    GNU_SCOPE,
    keywordScopes,
    type KeywordSources,
    type TableRow,
} from './tables.ts';

const HASH_PRIME = 0x01000193;
const MIX_FIRST = 0x85ebca6b;
const MIX_SECOND = 0xc2b2ae35;
const MIX_WIDE_SHIFT = 16;
const MIX_NARROW_SHIFT = 13;
const VERTEX_SHIFT = 32;
const SIDE_PER_WORD = 1.25;
const SIDE_GROWTH = 1.125;
const SEEDS_PER_SIDE = 16;
const REGISTER_KINDS = new Set(['REGISTERS', 'SYSTEM_REGISTERS']);
const SYMBOL = /^[A-Z][A-Z0-9_]*$/;
const COUNT = /^\d+$/;
const FLAGS = /^(?:0|[A-Z][A-Z0-9_]*(?: \| [A-Z][A-Z0-9_]*)*)$/;
const GRAPH_VALUES_PER_LINE = 12;
const LARGEST_SHORT_INDEX = 0xffff;
const SCOPE_FIELDS: [number, string][] = [
    [8, 'unsigned char'],
    [16, 'unsigned short'],
    [32, 'unsigned'],
];

export interface WordRole {
    symbol: string;
    kind: string;
    scope: string;
    flags: string;
    indexes: string;
}

export interface Word {
    name: string;
    literal: string;
    roles: WordRole[];
}

export interface Dictionary {
    dialect: string;
    words: Word[];
    seeds: [number, number];
    side: number;
    graph: number[];
    length: number;
}

interface WordTable {
    scope: string;
    kind: string;
    rows: TableRow[];
}

function mix(hash: number): number {
    let value = (hash ^ (hash >>> MIX_WIDE_SHIFT)) >>> 0;
    value = Math.imul(value, MIX_FIRST) >>> 0;
    value = (value ^ (value >>> MIX_NARROW_SHIFT)) >>> 0;
    value = Math.imul(value, MIX_SECOND) >>> 0;
    return (value ^ (value >>> MIX_WIDE_SHIFT)) >>> 0;
}

export function wordHashes(word: string, seeds: [number, number]): [number, number] {
    let [first, second] = seeds;
    for (let index = 0; index < word.length; index++) {
        const code = word.charCodeAt(index);
        first = Math.imul((first ^ code) >>> 0, HASH_PRIME) >>> 0;
        second = Math.imul((second ^ code) >>> 0, HASH_PRIME) >>> 0;
    }
    return [mix(first), mix(second)];
}

export function vertex(hash: number, side: number): number {
    return Math.floor((hash * side) / 2 ** VERTEX_SHIFT);
}

export function lookupWord(dictionary: Dictionary, word: string): Word | undefined {
    if (word === '') {
        return undefined;
    }
    const [first, second] = wordHashes(word, dictionary.seeds);
    const count = dictionary.words.length;
    const index = (dictionary.graph[vertex(first, dictionary.side)] +
        dictionary.graph[dictionary.side + vertex(second, dictionary.side)]) % count;
    const found = dictionary.words[index];
    return found.name === word ? found : undefined;
}

function role(table: WordTable, row: TableRow): WordRole {
    const blank = { symbol: '0', kind: table.kind, scope: table.scope, flags: '0', indexes: '0' };
    const [second, third] = row.fields;
    const fail = (what: string): never => {
        throw new Error(`keywords.h: ${table.scope}_${table.kind} row ${row.name}: ${what}`);
    };
    if (row.fields.length === 0) {
        return blank;
    }
    if (row.fields.length === 1) {
        return FLAGS.test(second) ? { ...blank, flags: second } : fail(`bad flags ${second}`);
    }
    if (row.fields.length !== 2 || !FLAGS.test(third)) {
        return fail(`unexpected fields ${row.fields.join(', ')}`);
    }
    if (REGISTER_KINDS.has(table.kind)) {
        return COUNT.test(second)
            ? { ...blank, indexes: second, flags: third }
            : fail('bad indexes');
    }
    return SYMBOL.test(second) ? { ...blank, symbol: second, flags: third } : fail('bad symbol');
}

function wordTables(sources: KeywordSources, scopes: string[]): WordTable[] {
    const byLength = [...scopes].sort((left, right) => right.length - left.length);
    return [...sources.tables.entries()]
        .filter(([table]) => table !== 'ASM_KEYWORD_SOURCES')
        .map(([table, rows]) => {
            const scope = byLength.find((name) => table.startsWith(`ASM_${name}_`));
            if (scope === undefined) {
                throw new Error(`keywords.h: ${table} names no scope from scanner.h`);
            }
            return { scope, kind: table.slice(`ASM_${scope}_`.length), rows };
        })
        .sort((left, right) => scopes.indexOf(left.scope) - scopes.indexOf(right.scope));
}

function graphValues(hashes: [number, number][], side: number): number[] | undefined {
    const count = hashes.length;
    const values = new Int32Array(2 * side).fill(-1);
    const adjacency: number[][] = Array.from({ length: 2 * side }, () => []);
    const ends = hashes.map((
        [first, second],
    ) => [vertex(first, side), side + vertex(second, side)]);
    ends.forEach(([first, second], index) => {
        adjacency[first].push(index);
        adjacency[second].push(index);
    });
    for (let start = 0; start < 2 * side; start++) {
        if (values[start] !== -1 || adjacency[start].length === 0) {
            continue;
        }
        values[start] = 0;
        const stack = [start];
        while (stack.length > 0) {
            const current = stack.pop() as number;
            for (const index of adjacency[current]) {
                const [first, second] = ends[index];
                const other = first === current ? second : first;
                const wanted = (index - values[current] + count) % count;
                if (values[other] === -1) {
                    values[other] = wanted;
                    stack.push(other);
                } else if (values[other] !== wanted) {
                    return undefined;
                }
            }
        }
    }
    return Array.from(values, (value) => (value === -1 ? 0 : value));
}

function seedsFor(attempt: number): [number, number] {
    return [mix(2 * attempt + 1), mix(2 * attempt + 2)];
}

function perfectHash(names: string[]): Pick<Dictionary, 'seeds' | 'side' | 'graph'> {
    let side = Math.ceil(names.length * SIDE_PER_WORD);
    for (let attempt = 0;; attempt++) {
        if (attempt > 0 && attempt % SEEDS_PER_SIDE === 0) {
            side = Math.ceil(side * SIDE_GROWTH);
        }
        const seeds = seedsFor(attempt);
        const graph = graphValues(names.map((name) => wordHashes(name, seeds)), side);
        if (graph !== undefined) {
            return { seeds, side, graph };
        }
    }
}

export function dictionaries(sources: KeywordSources): Dictionary[] {
    return dictionariesOf(sources.scanner, wordTables(sources, keywordScopes(sources.scanner)));
}

function dictionariesOf(scanner: string, tables: WordTable[]): Dictionary[] {
    return [...dialectDefines(scanner).entries()].map(([dialect, defines]) => {
        const selected = (scope: string) =>
            scope === GNU_SCOPE
                ? definedFlag(defines, dialect, 'ASM_GNU_SYNTAX')
                : definedFlag(defines, dialect, `ASM_${scope}_KEYWORDS`);
        const words = new Map<string, Word>();
        for (const table of tables.filter(({ scope }) => selected(scope))) {
            for (const row of table.rows) {
                if (!/^[\x21-\x7e]+$/.test(row.name)) {
                    throw new Error(
                        `keywords.h: ${table.scope}_${table.kind} has a non-ASCII or empty word`,
                    );
                }
                const word = words.get(row.name) ??
                    { name: row.name, literal: row.literal, roles: [] };
                if (
                    word.roles.some(({ kind, scope }) =>
                        kind === table.kind && scope === table.scope
                    )
                ) {
                    throw new Error(
                        `keywords.h: ${table.scope}_${table.kind} lists ${row.name} twice`,
                    );
                }
                word.roles.push(role(table, row));
                words.set(row.name, word);
            }
        }
        const sorted = [...words.values()].sort((left, right) =>
            left.name < right.name ? -1 : left.name > right.name ? 1 : 0
        );
        if (sorted.length === 0) {
            throw new Error(`scanner.h: ASM_DIALECT_${dialect} selects no keyword table`);
        }
        const dictionary: Dictionary = {
            dialect,
            words: sorted,
            ...perfectHash(sorted.map(({ name }) => name)),
            length: Math.max(...sorted.map(({ name }) => name.length)),
        };
        for (const word of sorted) {
            if (lookupWord(dictionary, word.name) !== word) {
                throw new Error(`perfect hash for ${dialect} does not find ${word.name}`);
            }
        }
        return dictionary;
    });
}

function hex(value: number, digits = 8): string {
    return `0x${value.toString(16).padStart(digits, '0')}U`;
}

function scopeField(scopes: string[]): string {
    const field = SCOPE_FIELDS.find(([bits]) => scopes.length <= bits);
    if (field === undefined) {
        throw new Error(
            `scanner.h: ${scopes.length} keyword scopes do not fit an unsigned scope mask`,
        );
    }
    return field[1];
}

function indexType(dictionary: Dictionary): string {
    const roles = dictionary.words.reduce((total, word) => total + word.roles.length, 0);
    return Math.max(roles, dictionary.words.length) <= LARGEST_SHORT_INDEX
        ? 'uint16_t'
        : 'uint32_t';
}

function section(dictionary: Dictionary): string[] {
    const type = indexType(dictionary);
    const roles: string[] = [];
    const words: string[] = [];
    for (const word of dictionary.words) {
        words.push(`    {${word.literal}, ${roles.length}, ${word.roles.length}},`);
        for (const entry of word.roles) {
            roles.push(
                `    {${entry.symbol}, KIND_${entry.kind}, SCOPE_${entry.scope}, ${entry.flags}, ${entry.indexes}},`,
            );
        }
    }
    const graph: string[] = [];
    for (let index = 0; index < dictionary.graph.length; index += GRAPH_VALUES_PER_LINE) {
        graph.push(
            `    ${dictionary.graph.slice(index, index + GRAPH_VALUES_PER_LINE).join(', ')},`,
        );
    }
    return [
        `#define WORD_FIRST_SEED ${hex(dictionary.seeds[0])}`,
        `#define WORD_SECOND_SEED ${hex(dictionary.seeds[1])}`,
        '',
        'enum {',
        `    WORD_COUNT = ${dictionary.words.length},`,
        `    WORD_SIDE = ${dictionary.side},`,
        `    WORD_LENGTH = ${dictionary.length},`,
        '};',
        '',
        'struct WordEntry {',
        '    const char *name;',
        `    ${type} first;`,
        '    unsigned char count;',
        '};',
        '',
        'static const struct WordRole WORD_ROLES[] = {',
        ...roles,
        '};',
        '',
        'static const struct WordEntry WORDS[] = {',
        ...words,
        '};',
        '',
        `static const ${type} WORD_GRAPH[] = {`,
        ...graph,
        '};',
    ];
}

function keywordConstants(keywords: string): string[] {
    const block = /^enum \{\n((?: {4}ASM_\w+ = \d+,\n)+)\};$/m.exec(keywords);
    return block === null ? [] : ['enum {', ...block[1].trimEnd().split('\n'), '};', ''];
}

export function wordsHeader(sources: KeywordSources): string {
    const scopes = keywordScopes(sources.scanner);
    const tables = wordTables(sources, scopes);
    const kinds = [...new Set(tables.map(({ kind }) => kind))].sort();
    const sections = dictionariesOf(sources.scanner, tables).flatMap((dictionary, index) => [
        `${index === 0 ? '#if' : '#elif'} defined(ASM_DIALECT_${dictionary.dialect})`,
        ...section(dictionary),
    ]);
    return [
        '#ifndef ASM_WORDS_H',
        '#define ASM_WORDS_H',
        '',
        ...keywordConstants(sources.keywords),
        `#define WORD_HASH_PRIME ${hex(HASH_PRIME)}`,
        `#define WORD_MIX_FIRST ${hex(MIX_FIRST)}`,
        `#define WORD_MIX_SECOND ${hex(MIX_SECOND)}`,
        `#define WORD_MIX_WIDE_SHIFT ${MIX_WIDE_SHIFT}U`,
        `#define WORD_MIX_NARROW_SHIFT ${MIX_NARROW_SHIFT}U`,
        `#define WORD_VERTEX_SHIFT ${VERTEX_SHIFT}U`,
        '',
        'enum WordKind {',
        ...kinds.map((kind) => `    KIND_${kind},`),
        '};',
        '',
        ...scopes.map((scope, index) => `#define SCOPE_${scope} ${hex(2 ** index, 2)}`),
        '',
        'struct WordRole {',
        '    TSSymbol symbol;',
        '    unsigned char kind;',
        `    ${scopeField(scopes)} scope;`,
        '    unsigned char flags;',
        '    unsigned char indexes;',
        '};',
        '',
        ...sections,
        '#endif /* ASM_DIALECT_* */',
        '',
        '#endif /* ASM_WORDS_H */',
        '',
    ].join('\n');
}
