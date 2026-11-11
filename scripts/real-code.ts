// SPDX-License-Identifier: MIT

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { filesUnder, readTextIfExists, ROOT } from './lib/files.ts';
import { languageArgs } from './lib/grammars.ts';
import { type FileSet, readPins, type Source } from './lib/real-code.ts';
import { Report } from './lib/report.ts';
import { matchesPath, wildmatch } from './lib/wildmatch.ts';

const SOURCES = '/sources';
const SCRATCH = join(ROOT, '.build', 'real-code');
const ERROR_QUERY = '(ERROR) @error\n(MISSING) @missing\n';
const CAPTURE =
    /^ {4}pattern: +\d+, capture: \d+ - (?:error|missing), start: \((\d+), (\d+)\), end: \((\d+), (\d+)\), text: `/;
const FIRST_WORD = /^[^\s,(]+/;
const FETCH = 'run scripts/fetch-sources';

interface Output {
    status: number | null;
    stdout: string;
    stderr: string;
}

interface ParseSummary {
    file: string;
    successful: boolean;
}

function treeSitter(args: string[]): Output {
    const result = spawnSync('tree-sitter', args, {
        cwd: ROOT,
        encoding: 'utf8',
        maxBuffer: Infinity,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.error !== undefined) {
        throw result.error;
    }
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function failedParses(language: string, list: string, paths: string[]): Set<string> {
    const { status, stdout, stderr } = treeSitter([
        'parse',
        ...languageArgs(language),
        '--quiet',
        '--json-summary',
        '--paths',
        list,
    ]);
    const start = stdout.search(/^\{$/m);
    if ((status !== 0 && status !== 1) || start === -1) {
        throw new Error(`tree-sitter parse (${language}) failed:\n${stderr}${stdout}`);
    }
    const summaries = (JSON.parse(stdout.slice(start)) as { parse_summaries: ParseSummary[] })
        .parse_summaries;
    if (
        summaries.length !== paths.length ||
        summaries.some((summary, index) =>
            summary.file !== paths[index] || typeof summary.successful !== 'boolean'
        )
    ) {
        throw new Error(`tree-sitter parse (${language}) did not report each file once, in order`);
    }
    return new Set(summaries.filter((summary) => !summary.successful).map(({ file }) => file));
}

function queryRows(language: string, list: string, paths: string[]): Map<string, Set<number>> {
    const query = join(SCRATCH, 'errors.scm');
    writeFileSync(query, ERROR_QUERY);
    const { status, stdout, stderr } = treeSitter([
        'query',
        ...languageArgs(language),
        '--captures',
        query,
        '--paths',
        list,
    ]);
    if (status !== 0) {
        throw new Error(`tree-sitter query (${language}) failed:\n${stderr}${stdout}`);
    }
    return captureRows(stdout, paths, `tree-sitter query (${language})`);
}

export function captureRows(
    output: string,
    paths: string[],
    command: string,
): Map<string, Set<number>> {
    const rows = new Map<string, Set<number>>();
    const lines = output.split('\n');
    let index = -1;
    for (let at = 0; at < lines.length; at += 1) {
        const line = lines[at];
        if (line === '') {
            continue;
        }
        if (!line.startsWith(' ')) {
            index += 1;
            if (line !== paths[index]) {
                throw new Error(`${command} printed "${line}" for ${paths[index]}`);
            }
            continue;
        }
        const capture = CAPTURE.exec(line);
        if (capture === null || index === -1) {
            throw new Error(`${command} printed an unknown line: ${line}`);
        }
        const [startRow, , endRow, endColumn] = capture.slice(1).map(Number);
        at += endRow - startRow;
        if (!(lines[at] ?? '').endsWith('`')) {
            throw new Error(
                `${command} printed a capture of rows ${startRow}-${endRow} in ${
                    paths[index]
                } whose text does not end on its last row`,
            );
        }
        const lastRow = endRow > startRow && endColumn === 0 ? endRow - 1 : endRow;
        const found = rows.get(paths[index]) ?? new Set<number>();
        for (let row = startRow; row <= lastRow; row += 1) {
            found.add(row);
        }
        rows.set(paths[index], found);
    }
    if (index !== paths.length - 1) {
        throw new Error(`${command} reported ${index + 1} of ${paths.length} files`);
    }
    return rows;
}

export function errorRows(language: string, paths: string[]): Map<string, number[]> {
    const errors = new Map<string, number[]>();
    if (paths.length === 0) {
        return errors;
    }
    const unlistable = paths.find((path) => path.includes('\n'));
    if (unlistable !== undefined) {
        throw new Error(`${JSON.stringify(unlistable)} cannot go in a --paths list`);
    }
    mkdirSync(SCRATCH, { recursive: true });
    const list = join(SCRATCH, `${language}.paths`);
    writeFileSync(list, paths.map((path) => `${path}\n`).join(''));
    const failed = failedParses(language, list, paths);
    const rows = queryRows(language, list, paths);
    for (const path of paths) {
        const found = rows.get(path);
        if (failed.has(path) || found !== undefined) {
            errors.set(path, [...(found ?? [])].sort((left, right) => left - right));
        }
    }
    return errors;
}

function cloneProblem(source: Source, sets: FileSet[], files: string[]): string | undefined {
    const directory = join(SOURCES, source.name);
    const head = readTextIfExists(join(directory, '.git', 'HEAD'))?.trim();
    if (head === undefined) {
        return `${directory} is not a clone; ${FETCH}`;
    }
    if (head !== source.commit) {
        return `${directory} is at ${head}, not at the pinned ${source.commit}; ${FETCH}`;
    }
    const sparse = readTextIfExists(join(directory, '.git', 'info', 'sparse-checkout'));
    const wanted = sets.flatMap((set) => set.include).map((glob) => `/${glob}\n`).join('');
    if (sparse !== wanted) {
        return `${directory} checks out other patterns than the pin file names; ${FETCH}`;
    }
    const includes = sets.flatMap((set) =>
        set.include.map((glob) => ({ set, glob, pattern: wildmatch(glob) }))
    );
    const patterns = includes.map(({ pattern }) => pattern);
    const stray = files.find((file) => !matchesPath(patterns, file));
    if (stray !== undefined) {
        return `${source.name}/${stray} is checked out, but no include names it`;
    }
    for (const { set, glob, pattern } of includes) {
        if (!files.some((file) => matchesPath([pattern], file))) {
            return `include ${glob} of [files "${set.name}"] names no file`;
        }
    }
    return undefined;
}

const sourceLines = new Map<string, string[]>();

function lineText(path: string, row: number): string {
    let lines = sourceLines.get(path);
    if (lines === undefined) {
        lines = readFileSync(path, 'utf8').split('\n');
        sourceLines.set(path, lines);
    }
    return (lines[row] ?? '').trim();
}

function shown(path: string, row: number): string {
    return `${relative(SOURCES, path)}:${row + 1}: ${lineText(path, row)}`;
}

function firstErrors(failing: string[], errors: Map<string, number[]>): string {
    return failing.map((path) => {
        const [row] = errors.get(path) ?? [];
        if (row === undefined) {
            return `${relative(SOURCES, path)}: the tree has an error but no ERROR or MISSING node`;
        }
        return shown(path, row);
    }).join('\n');
}

function wordCounts(failing: string[], errors: Map<string, number[]>): string {
    const groups = new Map<string, { count: number; example: string }>();
    let total = 0;
    for (const path of failing) {
        const rows = errors.get(path) ?? [];
        const keyed: [string, string][] = rows.length === 0
            ? [['(no node)', `${relative(SOURCES, path)}: no ERROR or MISSING node`]]
            : rows.map((
                row,
            ) => [FIRST_WORD.exec(lineText(path, row))?.[0] ?? '(blank)', shown(path, row)]);
        for (const [word, example] of keyed) {
            total += 1;
            const group = groups.get(word);
            if (group === undefined) {
                groups.set(word, { count: 1, example });
            } else {
                group.count += 1;
            }
        }
    }
    const sorted = [...groups].sort(([leftWord, left], [rightWord, right]) =>
        right.count - left.count || (leftWord < rightWord ? -1 : 1)
    );
    const width = Math.max(...sorted.map(([word]) => word.length));
    return [
        `${total} error line(s)`,
        ...sorted.map(([word, { count, example }]) =>
            `${String(count).padStart(6)}  ${word.padEnd(width)}  ${example}`
        ),
    ].join('\n');
}

function main(args: string[]): number {
    if (args.length > 1 || (args.length === 1 && args[0] !== '--summary')) {
        console.error('usage: real-code.ts [--summary]');
        return 2;
    }
    const summary = args.length === 1;
    const pins = readPins();
    const report = new Report();
    const members = new Map<FileSet, string[]>();
    for (const source of pins.sources) {
        const sets = pins.files.filter((set) => set.source === source.name);
        const directory = join(SOURCES, source.name);
        const files = filesUnder(directory).filter((file) => file.split(sep)[0] !== '.git');
        const problem = cloneProblem(source, sets, files);
        report.record(
            `${source.name}: ${files.length} file(s) at ${source.commit}`,
            problem === undefined,
            problem,
        );
        if (problem !== undefined) {
            continue;
        }
        for (const set of sets) {
            const include = set.include.map(wildmatch);
            const exclude = set.exclude.map(wildmatch);
            members.set(
                set,
                files
                    .filter((file) => matchesPath(include, file) && !matchesPath(exclude, file))
                    .map((file) => join(directory, file)),
            );
        }
    }
    const errors = new Map<string, Map<string, number[]>>();
    for (const language of new Set(pins.files.flatMap((set) => set.languages))) {
        const paths = pins.files
            .filter((set) => set.languages.includes(language))
            .flatMap((set) => members.get(set) ?? []);
        errors.set(language, errorRows(language, [...new Set(paths)]));
    }
    for (const set of pins.files) {
        const paths = members.get(set);
        if (paths === undefined) {
            continue;
        }
        for (const language of set.languages) {
            const found = errors.get(language) ?? new Map<string, number[]>();
            const failing = paths.filter((path) => found.has(path));
            let details = summary ? wordCounts(failing, found) : firstErrors(failing, found);
            if (paths.length === 0) {
                details = 'the file set names no file';
            }
            report.record(
                `${set.name} (${language}): ${failing.length} of ${paths.length} file(s) with errors`,
                paths.length > 0 && failing.length === 0,
                details,
            );
        }
    }
    return report.finish('all real code parses without errors', 'real-code check(s)');
}

if (import.meta.main) {
    process.exitCode = main(process.argv.slice(2));
}
