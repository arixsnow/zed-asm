// SPDX-License-Identifier: MIT

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT } from './files.ts';
import { manifest } from './manifest.ts';
import { wildmatch } from './wildmatch.ts';

export const PINS = join(ROOT, 'test', 'real-code', 'sources.gitconfig');

export interface Source {
    name: string;
    url: string;
    branch: string;
    commit: string;
}

export interface FileSet {
    name: string;
    source: string;
    include: string[];
    exclude: string[];
    languages: string[];
}

export interface ExpectedGroup {
    name: string;
    source: string;
    guards: string[];
    verified: string;
}

export interface Pins {
    sources: Source[];
    files: FileSet[];
    groups: ExpectedGroup[];
}

export interface GuardedRows {
    rows: Set<number>;
    groups: number;
}

interface LogicalLine {
    text: string;
    first: number;
    last: number;
}

interface Branch {
    skipped: boolean;
    resolved: boolean;
    outer: boolean;
}

type Condition = 'never' | 'always' | 'unknown';

interface Section {
    kind: string;
    name: string;
    line: number;
    values: Map<string, string[]>;
}

const HEADER = /^\[([a-z]+) "([^"\\]+)"\]$/;
const ENTRY = /^ {4}([a-z]+) =(?: (\S(?:.*\S)?))?$/;
const QUOTING = /["\\#;]/;
const SOURCE_NAME = /^(?!\.\.?$)[^/]+$/;
const URL = /^https:\/\/\S+$/;
const BRANCH = /^\S+$/;
const COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const GLOB = /^(?![/!])\S*[^\s/]$/;
const GUARD = /^[A-Za-z_*][A-Za-z0-9_*]*$/;
const DIRECTIVE = /^\s*#\s*(ifdef|ifndef|if|elifdef|elifndef|elif|else|endif)\b\s*(.*?)\s*$/;
const DEFINED = /^(!\s*)?defined\s*(?:\(\s*([A-Za-z_]\w*)\s*\)|([A-Za-z_]\w*))$/;
const NAME = /^([A-Za-z_]\w*)$/;
const DEFINITION = /^\s*#\s*(?:define|undef)\s+([A-Za-z_]\w*)/;
const COMMAND_DEFINITION = /-D\s*([A-Za-z_]\w*)/g;
const KEYS: Record<string, readonly string[]> = {
    source: ['url', 'branch', 'commit'],
    files: ['source', 'include', 'exclude', 'language'],
    group: ['source', 'guard', 'verified'],
};

function fail(where: string, problem: string): never {
    throw new Error(`test/real-code/sources.gitconfig: ${where} ${problem}`);
}

function label(section: Section): string {
    return `[${section.kind} "${section.name}"] (line ${section.line})`;
}

function sections(text: string): Section[] {
    const found: Section[] = [];
    for (const [index, line] of text.split('\n').entries()) {
        const where = `line ${index + 1}`;
        if (line === '' || line.startsWith('#') || line.startsWith(';')) {
            continue;
        }
        const header = HEADER.exec(line);
        if (header !== null) {
            const [, kind, name] = header;
            if (!Object.hasOwn(KEYS, kind)) {
                fail(where, `starts a section of unknown kind "${kind}"`);
            }
            const twin = found.find((section) => section.kind === kind && section.name === name);
            if (twin !== undefined) {
                fail(where, `repeats ${label(twin)}, which git would merge into one section`);
            }
            found.push({ kind, name, line: index + 1, values: new Map() });
            continue;
        }
        const entry = ENTRY.exec(line);
        if (entry === null) {
            fail(
                where,
                'must be a [kind "name"] header, a "    key = value" entry, a comment or blank',
            );
        }
        const section = found.at(-1);
        if (section === undefined) {
            fail(where, 'sets a key outside any section');
        }
        const [, key, value = ''] = entry;
        if (!KEYS[section.kind].includes(key)) {
            fail(where, `sets ${key}, which a ${section.kind} section does not take`);
        }
        if (QUOTING.test(value)) {
            fail(where, 'has a value git would read as quoted, escaped or commented');
        }
        const values = section.values.get(key) ?? [];
        if (values.includes(value)) {
            fail(where, `sets ${key} = ${value} a second time`);
        }
        section.values.set(key, [...values, value]);
    }
    return found;
}

function all(section: Section, key: string): string[] {
    return section.values.get(key) ?? [];
}

function one(section: Section, key: string): string {
    const values = all(section, key);
    if (values.length !== 1) {
        fail(label(section), `must set ${key} once (sets it ${values.length} times)`);
    }
    return values[0];
}

function some(section: Section, key: string): string[] {
    const values = all(section, key);
    if (values.length === 0) {
        fail(label(section), `must set ${key} at least once`);
    }
    return values;
}

function checked(
    section: Section,
    key: string,
    value: string,
    pattern: RegExp,
    what: string,
): string {
    if (!pattern.test(value)) {
        fail(label(section), `${key} must be ${what} (got "${value}")`);
    }
    return value;
}

function globs(section: Section, key: string, values: string[]): string[] {
    for (const value of values) {
        checked(section, key, value, GLOB, 'a glob relative to the source root');
        try {
            wildmatch(value);
        } catch (error) {
            fail(
                label(section),
                `${key} ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }
    return values;
}

function source(section: Section): Source {
    return {
        name: checked(section, 'name', section.name, SOURCE_NAME, 'one path component'),
        url: checked(section, 'url', one(section, 'url'), URL, 'an https URL'),
        branch: checked(section, 'branch', one(section, 'branch'), BRANCH, 'a branch name'),
        commit: checked(section, 'commit', one(section, 'commit'), COMMIT, 'a full commit id'),
    };
}

function fileSet(section: Section, sources: Source[]): FileSet {
    const owner = one(section, 'source');
    if (!sources.some((candidate) => candidate.name === owner)) {
        fail(label(section), `names source "${owner}", which no [source] section defines`);
    }
    const grammars = manifest.languages.map((language) => language.grammar);
    const languages = some(section, 'language');
    for (const grammar of languages) {
        if (!grammars.includes(grammar)) {
            fail(
                label(section),
                `language must be one of ${grammars.join(', ')} (got "${grammar}")`,
            );
        }
    }
    return {
        name: section.name,
        source: owner,
        include: globs(section, 'include', some(section, 'include')),
        exclude: globs(section, 'exclude', all(section, 'exclude')),
        languages,
    };
}

function expectedGroup(section: Section, sources: Source[]): ExpectedGroup {
    const owner = one(section, 'source');
    if (!sources.some((candidate) => candidate.name === owner)) {
        fail(label(section), `names source "${owner}", which no [source] section defines`);
    }
    return {
        name: section.name,
        source: owner,
        guards: some(section, 'guard').map((guard) =>
            checked(
                section,
                'guard',
                guard,
                GUARD,
                'a C macro name, * standing for name characters',
            )
        ),
        verified: checked(
            section,
            'verified',
            one(section, 'verified'),
            COMMIT,
            'a full commit id',
        ),
    };
}

export function parsePins(text: string): Pins {
    const found = sections(text);
    const sources = found.filter((section) => section.kind === 'source').map(source);
    if (sources.length === 0) {
        fail('the file', 'defines no [source] section');
    }
    const files = found
        .filter((section) => section.kind === 'files')
        .map((section) => fileSet(section, sources));
    for (const named of sources) {
        if (!files.some((set) => set.source === named.name)) {
            fail(`[source "${named.name}"]`, 'is named by no [files] section');
        }
    }
    const groups = found
        .filter((section) => section.kind === 'group')
        .map((section) => expectedGroup(section, sources));
    return { sources, files, groups };
}

export function guardPattern(guard: string): RegExp {
    return new RegExp(`^${guard.replaceAll('*', '\\w*')}$`);
}

function logicalLines(text: string): LogicalLine[] {
    const lines: LogicalLine[] = [];
    let line = '';
    let first = 0;
    let row = 0;
    let index = 0;
    let quote = '';
    let block = false;
    const peek = (): string | undefined => {
        while (text.startsWith('\\\n', index)) {
            index += 2;
            row += 1;
        }
        return text[index];
    };
    for (let char = peek(); char !== undefined; char = peek()) {
        index += 1;
        if (char === '\n') {
            if (!block) {
                lines.push({ text: line, first, last: row });
                line = '';
                quote = '';
                first = row + 1;
            }
            row += 1;
            continue;
        }
        if (block) {
            if (char === '*' && peek() === '/') {
                index += 1;
                block = false;
            }
            continue;
        }
        if (quote !== '') {
            line += char;
            if (char === quote) {
                quote = '';
            } else if (char === '\\' && peek() !== undefined && peek() !== '\n') {
                line += text[index];
                index += 1;
            }
            continue;
        }
        if (char === '/' && peek() === '*') {
            index += 1;
            block = true;
            line += ' ';
            continue;
        }
        if (char === '/' && peek() === '/') {
            while (peek() !== undefined && peek() !== '\n') {
                index += 1;
            }
            line += ' ';
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
        }
        line += char;
    }
    lines.push({ text: line, first, last: row });
    return lines;
}

function addRows(rows: Set<number>, line: LogicalLine): void {
    for (let row = line.first; row <= line.last; row += 1) {
        rows.add(row);
    }
}

function condition(word: string, rest: string, listed: (name: string) => boolean): Condition {
    if (word === 'else') {
        return 'unknown';
    }
    if (word === 'if' || word === 'elif') {
        const defined = DEFINED.exec(rest);
        if (defined === null || !listed(defined[2] ?? defined[3])) {
            return 'unknown';
        }
        return defined[1] === undefined ? 'never' : 'always';
    }
    const name = NAME.exec(rest);
    if (name === null || !listed(name[1])) {
        return 'unknown';
    }
    return word === 'ifdef' || word === 'elifdef' ? 'never' : 'always';
}

export function guardedRows(text: string, guards: RegExp[]): GuardedRows {
    const rows = new Set<number>();
    const stack: Branch[] = [];
    const listed = (name: string) => guards.some((guard) => guard.test(name));
    let groups = 0;
    for (const line of logicalLines(text)) {
        const directive = DIRECTIVE.exec(line.text);
        const inside = stack.at(-1)?.skipped ?? false;
        const word = directive?.[1];
        if (word === undefined || (inside && word !== 'endif' && !word.startsWith('el'))) {
            if (inside) {
                addRows(rows, line);
            }
            if (word !== undefined && word.startsWith('if')) {
                stack.push({ skipped: true, resolved: false, outer: true });
            }
            continue;
        }
        if (word.startsWith('if')) {
            const test = condition(word, directive?.[2] ?? '', listed);
            groups += test === 'never' ? 1 : 0;
            stack.push({ skipped: test === 'never', resolved: test === 'always', outer: false });
            continue;
        }
        const top = stack.at(-1);
        if (top === undefined) {
            continue;
        }
        if (word === 'endif') {
            stack.pop();
            if (stack.at(-1)?.skipped ?? false) {
                addRows(rows, line);
            }
            continue;
        }
        if (top.outer) {
            addRows(rows, line);
            continue;
        }
        const test = top.resolved ? 'never' : condition(word, directive?.[2] ?? '', listed);
        groups += test === 'never' ? 1 : 0;
        top.skipped = test === 'never';
        top.resolved = top.resolved || test === 'always';
    }
    return { rows, groups };
}

export function guardDefinitions(text: string, guards: RegExp[]): string[] {
    const names = new Set<string>();
    const listed = (name: string) => guards.some((guard) => guard.test(name));
    for (const line of logicalLines(text)) {
        const defined = DEFINITION.exec(line.text);
        if (defined !== null && listed(defined[1])) {
            names.add(defined[1]);
        }
    }
    for (const [, name] of text.matchAll(COMMAND_DEFINITION)) {
        if (listed(name)) {
            names.add(name);
        }
    }
    return [...names].sort();
}

export function readPins(): Pins {
    return parsePins(readFileSync(PINS, 'utf8'));
}
