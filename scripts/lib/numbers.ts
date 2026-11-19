// SPDX-License-Identifier: MIT

import { createRequire } from 'node:module';

import { tokenNames } from './indent.ts';
import { definedFlag, dialectDefines } from './tables.ts';

const ASCII_LIMIT = 128;
const VALUES_PER_LINE = 16;
const BYTE_LIMIT = 0x100;
const SHORT_LIMIT = 0x10000;
const SPECIAL = new Set('()[]{}|?*+.^$\\');
const QUANTIFIER = /^\{(\d+)(,(\d*))?\}/;

export interface NumberRow {
    token: string;
    form: string;
    precedence?: number;
    rival?: { token: string; form: string };
}

export interface NumberOptions {
    clangIntegers: boolean;
}

type Syntax = 'gas' | 'nasm';

const lexical = createRequire(import.meta.url)('../../tree-sitter/common/lexical.js') as Record<
    Syntax,
    { numbers: (options: NumberOptions) => NumberRow[] }
>;

type FormNode =
    | { kind: 'set'; codes: number[] }
    | { kind: 'sequence'; items: FormNode[] }
    | { kind: 'choice'; options: FormNode[] }
    | { kind: 'repeat'; item: FormNode; min: number; max: number };

interface Cursor {
    form: string;
    index: number;
}

interface Contender {
    end: number;
    token: number;
    precedence: number;
    form: string;
}

interface Edge {
    codes: Set<number> | undefined;
    to: number;
}

interface Automaton {
    edges: Edge[][];
    owners: number[];
    accepts: Map<number, number>;
}

export interface NumberTables {
    tokens: string[];
    classes: number[];
    starts: number[];
    ends: number[];
    next: number[][];
}

function fail(cursor: Cursor, message: string): never {
    throw new Error(
        `lexical.js: number form /${cursor.form}/ ${message} at offset ${cursor.index}`,
    );
}

function codeOf(cursor: Cursor, character: string | undefined): number {
    if (character === undefined) {
        fail(cursor, 'ends early');
    }
    const code = character.codePointAt(0) ?? ASCII_LIMIT;
    if (code >= ASCII_LIMIT) {
        fail(cursor, 'has a character outside ASCII');
    }
    return code;
}

function readEscaped(cursor: Cursor): number {
    cursor.index++;
    const character = cursor.form[cursor.index];
    if (character !== undefined && /[A-Za-z0-9]/.test(character)) {
        fail(cursor, `has the class escape \\${character}`);
    }
    const code = codeOf(cursor, character);
    cursor.index++;
    return code;
}

function readSetCode(cursor: Cursor): number {
    if (cursor.form[cursor.index] === '\\') {
        return readEscaped(cursor);
    }
    const code = codeOf(cursor, cursor.form[cursor.index]);
    cursor.index++;
    return code;
}

function readSet(cursor: Cursor): FormNode {
    const codes = new Set<number>();
    cursor.index++;
    if (cursor.form[cursor.index] === '^') {
        fail(cursor, 'negates a class, which reaches past ASCII');
    }
    while (cursor.form[cursor.index] !== ']') {
        const low = readSetCode(cursor);
        if (cursor.form[cursor.index] !== '-' || cursor.form[cursor.index + 1] === ']') {
            codes.add(low);
            continue;
        }
        cursor.index++;
        const high = readSetCode(cursor);
        if (high < low) {
            fail(cursor, 'has a reversed range');
        }
        for (let code = low; code <= high; code++) {
            codes.add(code);
        }
    }
    cursor.index++;
    return { kind: 'set', codes: [...codes] };
}

function readAtom(cursor: Cursor): FormNode {
    const character = cursor.form[cursor.index];
    if (character === '(') {
        cursor.index += cursor.form.startsWith('(?:', cursor.index) ? 3 : 1;
        const inner = readChoice(cursor);
        if (cursor.form[cursor.index] !== ')') {
            fail(cursor, 'has an unclosed group');
        }
        cursor.index++;
        return inner;
    }
    if (character === '[') {
        return readSet(cursor);
    }
    if (character === '\\') {
        return { kind: 'set', codes: [readEscaped(cursor)] };
    }
    if (SPECIAL.has(character)) {
        fail(cursor, `has an unsupported ${character}`);
    }
    const code = codeOf(cursor, character);
    cursor.index++;
    return { kind: 'set', codes: [code] };
}

function readQuantified(cursor: Cursor, item: FormNode): FormNode {
    const character = cursor.form[cursor.index];
    if (character === '?' || character === '*' || character === '+') {
        cursor.index++;
        return {
            kind: 'repeat',
            item,
            min: character === '+' ? 1 : 0,
            max: character === '?' ? 1 : Infinity,
        };
    }
    if (character !== '{') {
        return item;
    }
    const match = QUANTIFIER.exec(cursor.form.slice(cursor.index));
    if (match === null) {
        fail(cursor, 'has a malformed {m,n}');
    }
    const min = Number(match[1]);
    const max = match[2] === undefined ? min : match[3] === '' ? Infinity : Number(match[3]);
    if (max < min) {
        fail(cursor, 'has a {m,n} with n below m');
    }
    cursor.index += match[0].length;
    return { kind: 'repeat', item, min, max };
}

function readSequence(cursor: Cursor): FormNode {
    const items: FormNode[] = [];
    while (
        cursor.index < cursor.form.length &&
        cursor.form[cursor.index] !== '|' &&
        cursor.form[cursor.index] !== ')'
    ) {
        items.push(readQuantified(cursor, readAtom(cursor)));
    }
    return { kind: 'sequence', items };
}

function readChoice(cursor: Cursor): FormNode {
    const options = [readSequence(cursor)];
    while (cursor.form[cursor.index] === '|') {
        cursor.index++;
        options.push(readSequence(cursor));
    }
    return options.length === 1 ? options[0] : { kind: 'choice', options };
}

export function readForm(form: string): FormNode {
    const cursor = { form, index: 0 };
    const node = readChoice(cursor);
    if (cursor.index !== form.length) {
        fail(cursor, 'has an unmatched )');
    }
    return node;
}

function addState(automaton: Automaton, owner: number): number {
    automaton.edges.push([]);
    automaton.owners.push(owner);
    return automaton.edges.length - 1;
}

function link(automaton: Automaton, from: number, to: number, codes?: Set<number>): void {
    automaton.edges[from].push({ codes, to });
}

function build(automaton: Automaton, node: FormNode, from: number, owner: number): number {
    switch (node.kind) {
        case 'set': {
            const to = addState(automaton, owner);
            link(automaton, from, to, new Set(node.codes));
            return to;
        }
        case 'sequence':
            return node.items.reduce((at, item) => build(automaton, item, at, owner), from);
        case 'choice': {
            const end = addState(automaton, owner);
            for (const option of node.options) {
                const start = addState(automaton, owner);
                link(automaton, from, start);
                link(automaton, build(automaton, option, start, owner), end);
            }
            return end;
        }
        case 'repeat': {
            let at = from;
            for (let count = 0; count < node.min; count++) {
                at = build(automaton, node.item, at, owner);
            }
            if (node.max === Infinity) {
                const loop = addState(automaton, owner);
                link(automaton, at, loop);
                link(automaton, build(automaton, node.item, loop, owner), loop);
                return loop;
            }
            const end = addState(automaton, owner);
            link(automaton, at, end);
            for (let count = node.min; count < node.max; count++) {
                at = build(automaton, node.item, at, owner);
                link(automaton, at, end);
            }
            return end;
        }
    }
}

function closure(automaton: Automaton, states: Iterable<number>): number[] {
    const reached = new Set(states);
    const pending = [...reached];
    while (pending.length > 0) {
        const state = pending.pop() ?? 0;
        for (const edge of automaton.edges[state]) {
            if (edge.codes === undefined && !reached.has(edge.to)) {
                reached.add(edge.to);
                pending.push(edge.to);
            }
        }
    }
    return [...reached].sort((left, right) => left - right);
}

function contendersOf(rows: NumberRow[], scanner: string): { tokens: string[]; list: Contender[] } {
    const known = new Set(tokenNames(scanner));
    const tokens = rows.map(({ token }) => token.replace(/^_/, '').toUpperCase());
    for (const [index, token] of tokens.entries()) {
        if (!known.has(token)) {
            throw new Error(
                `lexical.js: number token ${rows[index].token} is not in enum TokenType`,
            );
        }
        if (tokens.indexOf(token) !== index) {
            throw new Error(`lexical.js: number token ${rows[index].token} has two rows`);
        }
    }
    const rival = tokens.length + 1;
    const list = rows.flatMap((row, token): Contender[] => [
        { end: token + 1, token, precedence: row.precedence ?? 0, form: row.form },
        ...(row.rival === undefined
            ? []
            : [{ end: rival, token, precedence: 0, form: row.rival.form }]),
    ]);
    return { tokens, list };
}

function characterClasses(automaton: Automaton): { classes: number[]; count: number } {
    const sets = automaton.edges.flat().flatMap(({ codes }) => codes === undefined ? [] : [codes]);
    const ids = new Map<string, number>([['', 0]]);
    const classes: number[] = [];
    for (let code = 0; code < ASCII_LIMIT; code++) {
        const signature = sets.flatMap((codes, index) => codes.has(code) ? [index] : []).join(',');
        if (!ids.has(signature)) {
            ids.set(signature, ids.size);
        }
        classes.push(ids.get(signature) ?? 0);
    }
    return { classes, count: ids.size };
}

function completion(
    automaton: Automaton,
    contenders: Contender[],
    states: number[],
): Contender | undefined {
    let best: number | undefined;
    for (const state of states) {
        const index = automaton.accepts.get(state);
        if (
            index !== undefined &&
            (best === undefined ||
                contenders[index].precedence > contenders[best].precedence ||
                (contenders[index].precedence === contenders[best].precedence && index < best))
        ) {
            best = index;
        }
    }
    return best === undefined ? undefined : contenders[best];
}

export function numberTables(rows: NumberRow[], scanner: string): NumberTables {
    const { tokens, list } = contendersOf(rows, scanner);
    const automaton: Automaton = { edges: [], owners: [], accepts: new Map() };
    const starts = list.map((contender, index) => {
        const start = addState(automaton, index);
        automaton.accepts.set(build(automaton, readForm(contender.form), start, index), index);
        return start;
    });
    for (const [index, start] of starts.entries()) {
        if (closure(automaton, [start]).some((state) => automaton.accepts.get(state) === index)) {
            throw new Error(`lexical.js: number form /${list[index].form}/ matches empty text`);
        }
    }
    const { classes, count } = characterClasses(automaton);
    const representatives = Array.from({ length: count }, (_, id) => classes.indexOf(id));
    const ids = new Map<string, number>([['', 0]]);
    const sets: number[][] = [[]];
    const stateOf = (states: number[]) => {
        const key = states.join(',');
        if (!ids.has(key)) {
            ids.set(key, sets.length);
            sets.push(states);
        }
        return ids.get(key) ?? 0;
    };
    const tableStarts: number[] = [];
    for (let mask = 0; mask < 2 ** tokens.length; mask++) {
        tableStarts.push(stateOf(closure(
            automaton,
            starts.filter((_, index) => (mask & (1 << list[index].token)) !== 0),
        )));
    }
    const next: number[][] = [];
    const ends: number[] = [];
    for (let id = 0; id < sets.length; id++) {
        const states = sets[id];
        const completed = completion(automaton, list, states);
        ends.push(completed?.end ?? 0);
        next.push(representatives.map((code) => {
            if (code === -1) {
                return 0;
            }
            const moved = states.flatMap((state) =>
                automaton.edges[state].flatMap(({ codes, to }) => codes?.has(code) ? [to] : [])
            );
            if (moved.length === 0) {
                return 0;
            }
            const precedence = Math.max(
                ...moved.map((state) => list[automaton.owners[state]].precedence),
            );
            return completed !== undefined && precedence < completed.precedence
                ? 0
                : stateOf(closure(automaton, moved));
        }));
    }
    const minimal = minimize({ tokens, classes, starts: tableStarts, ends, next });
    if (minimal.next.length > SHORT_LIMIT) {
        throw new Error(
            `lexical.js: ${tokens.join(', ')} need ${minimal.next.length} states, past uint16_t`,
        );
    }
    return minimal;
}

function renumber(signatures: string[]): number[] {
    const ids = new Map<string, number>();
    return signatures.map((signature) => {
        if (!ids.has(signature)) {
            ids.set(signature, ids.size);
        }
        return ids.get(signature) ?? 0;
    });
}

function refine(tables: NumberTables, blocks: number[]): number[] {
    return renumber(
        tables.next.map((line, state) =>
            [blocks[state], ...line.map((target) => blocks[target])].join(',')
        ),
    );
}

function minimize(tables: NumberTables): NumberTables {
    let blocks = renumber(tables.ends.map(String));
    let refined = refine(tables, blocks);
    while (Math.max(...refined) !== Math.max(...blocks)) {
        blocks = refined;
        refined = refine(tables, blocks);
    }
    const representatives = Array.from(
        { length: Math.max(...blocks) + 1 },
        (_, block) => blocks.indexOf(block),
    );
    return {
        tokens: tables.tokens,
        classes: tables.classes,
        starts: tables.starts.map((state) => blocks[state]),
        ends: representatives.map((state) => tables.ends[state]),
        next: representatives.map((state) => tables.next[state].map((target) => blocks[target])),
    };
}

function cellType(largest: number): string {
    return largest < BYTE_LIMIT ? 'uint8_t' : 'uint16_t';
}

function valueLines(values: number[], indent: string): string[] {
    const lines: string[] = [];
    for (let index = 0; index < values.length; index += VALUES_PER_LINE) {
        lines.push(`${indent}${values.slice(index, index + VALUES_PER_LINE).join(', ')},`);
    }
    return lines;
}

function section(tables: NumberTables): string[] {
    const state = cellType(tables.next.length - 1);
    return [
        'enum {',
        `    NUMBER_TOKEN_COUNT = ${tables.tokens.length},`,
        `    NUMBER_ALL_TOKENS = ${2 ** tables.tokens.length - 1},`,
        '    NUMBER_NO_END = 0,',
        `    NUMBER_RIVAL_END = ${tables.tokens.length + 1},`,
        `    NUMBER_CLASS_COUNT = ${tables.next[0].length},`,
        `    NUMBER_STATE_COUNT = ${tables.next.length},`,
        '};',
        '',
        'static const TSSymbol NUMBER_TOKENS[NUMBER_TOKEN_COUNT] = {',
        ...tables.tokens.map((token) => `    ${token},`),
        '};',
        '',
        'static const uint8_t NUMBER_CLASSES[] = {',
        ...valueLines(tables.classes, '    '),
        '};',
        '',
        `static const ${state} NUMBER_STARTS[NUMBER_ALL_TOKENS + 1] = {`,
        ...valueLines(tables.starts, '    '),
        '};',
        '',
        `static const ${cellType(tables.tokens.length + 1)} NUMBER_ENDS[NUMBER_STATE_COUNT] = {`,
        ...valueLines(tables.ends, '    '),
        '};',
        '',
        `static const ${state} NUMBER_NEXT[NUMBER_STATE_COUNT][NUMBER_CLASS_COUNT] = {`,
        ...tables.next.flatMap((line) => ['    {', ...valueLines(line, '        '), '    },']),
        '};',
    ];
}

export function numbersHeader(scanner: string): string {
    const groups = new Map<string, string[]>();
    for (const [dialect, defines] of dialectDefines(scanner)) {
        const syntax: Syntax = definedFlag(defines, dialect, 'ASM_GNU_SYNTAX') ? 'gas' : 'nasm';
        const clangIntegers = definedFlag(defines, dialect, 'ASM_CLANG_INTEGERS');
        const rows = lexical[syntax].numbers({ clangIntegers });
        const text = section(numberTables(rows, scanner)).join('\n');
        groups.set(text, [...groups.get(text) ?? [], dialect]);
    }
    const sections = [...groups.entries()].flatMap(([text, dialects], index) => [
        `${index === 0 ? '#if' : '#elif'} ${
            dialects.map((dialect) => `defined(ASM_DIALECT_${dialect})`).join(' || ')
        }`,
        text,
    ]);
    return [
        '#ifndef ASM_NUMBERS_H',
        '#define ASM_NUMBERS_H',
        '',
        ...sections,
        '#endif /* ASM_DIALECT_* */',
        '',
        '#endif /* ASM_NUMBERS_H */',
        '',
    ].join('\n');
}
