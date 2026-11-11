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

export interface Pins {
    sources: Source[];
    files: FileSet[];
}

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
const KEYS: Record<string, readonly string[]> = {
    source: ['url', 'branch', 'commit'],
    files: ['source', 'include', 'exclude', 'language'],
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
    return { sources, files };
}

export function readPins(): Pins {
    return parsePins(readFileSync(PINS, 'utf8'));
}
