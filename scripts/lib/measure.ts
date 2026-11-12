// SPDX-License-Identifier: MIT

import { readFileSync } from 'node:fs';

import { languageArgs, run } from './grammars.ts';

const CACHE_MODEL = ['--I1=32768,8,64', '--D1=32768,8,64', '--LL=16777216,16,64'];
const LL_HIT_CYCLES = 5;
const RAM_CYCLES = 35;

export function cyclesFromCallgrind(text: string): number {
    const events = /^events: (.+)$/m.exec(text)?.[1].split(' ');
    const totals = /^summary: (.+)$/m.exec(text)?.[1].split(' ').map(Number);
    if (events === undefined || totals === undefined) {
        throw new Error('the callgrind output has no events or summary line');
    }
    const total = (...names: string[]) =>
        names.reduce((sum, name) => {
            const index = events.indexOf(name);
            if (index === -1) {
                throw new Error(`the callgrind output has no ${name} event`);
            }
            return sum + (totals[index] ?? 0);
        }, 0);
    const accesses = total('Ir', 'Dr', 'Dw');
    const l1Misses = total('I1mr', 'D1mr', 'D1mw');
    const llMisses = total('ILmr', 'DLmr', 'DLmw');
    return accesses - l1Misses + LL_HIT_CYCLES * (l1Misses - llMisses) + RAM_CYCLES * llMisses;
}

export function estimatedCycles(grammar: string, library: string, file: string): number {
    const out = `${file}.callgrind`;
    const { status, output } = run('valgrind', [
        '--tool=callgrind',
        '--cache-sim=yes',
        ...CACHE_MODEL,
        '--toggle-collect=ts_parser_parse',
        `--callgrind-out-file=${out}`,
        'tree-sitter',
        'parse',
        '--quiet',
        ...languageArgs(grammar, library),
        file,
    ], { env: { LD_BIND_NOW: '1' } });
    if (status !== 0 && status !== 1) {
        throw new Error(`${grammar}: callgrind on ${file} failed:\n${output}`);
    }
    const cycles = cyclesFromCallgrind(readFileSync(out, 'utf8'));
    if (cycles === 0) {
        throw new Error(
            `${grammar}: callgrind collected nothing inside ts_parser_parse on ${file}`,
        );
    }
    return cycles;
}

export interface ParseTiming {
    parse: number;
    edit: number | undefined;
}

export interface TimingOptions {
    runs: number;
    edits?: string[];
    timeoutMicroseconds?: number;
}

export function median(values: number[]): number {
    return values.toSorted((left, right) => left - right)[Math.floor(values.length / 2)];
}

export function readParseTiming(output: string): ParseTiming | undefined {
    const parse = /Parse:\s+([\d.]+) ms/.exec(output);
    if (parse === null) {
        return undefined;
    }
    const edit = /Edit:\s+([\d.]+) ms/.exec(output);
    return { parse: Number(parse[1]), edit: edit === null ? undefined : Number(edit[1]) };
}

const MILLISECONDS_PER_UNIT: Record<string, number> = {
    ns: 1e-6,
    '\u00b5s': 1e-3,
    ms: 1,
    s: 1000,
};

export function readQueryTime(output: string): number | undefined {
    const time = /([\d.]+)(ns|\u00b5s|ms|s)\s*$/.exec(output);
    return time === null ? undefined : Number(time[1]) * MILLISECONDS_PER_UNIT[time[2]];
}

export function parseTiming(grammar: string, file: string, options: TimingOptions): ParseTiming {
    const parses: number[] = [];
    const edits: number[] = [];
    const timeout = options.timeoutMicroseconds === undefined
        ? []
        : ['--timeout', String(options.timeoutMicroseconds)];
    const editArgs = options.edits === undefined ? [] : ['--edits', ...options.edits];
    for (let index = 0; index < options.runs; index++) {
        const { output } = run('tree-sitter', [
            'parse',
            ...languageArgs(grammar),
            '--quiet',
            '--time',
            ...timeout,
            file,
            ...editArgs,
        ]);
        const timing = readParseTiming(output);
        if (timing === undefined || (options.edits !== undefined && timing.edit === undefined)) {
            throw new Error(`${grammar}: no timing for ${file}:\n${output}`);
        }
        parses.push(timing.parse);
        if (timing.edit !== undefined) {
            edits.push(timing.edit);
        }
    }
    return { parse: median(parses), edit: edits.length > 0 ? median(edits) : undefined };
}

export function queryTime(grammar: string, query: string, file: string, runs: number): number {
    const times: number[] = [];
    for (let index = 0; index < runs; index++) {
        const { output } = run('tree-sitter', [
            'query',
            ...languageArgs(grammar),
            '--time',
            '--quiet',
            query,
            file,
        ]);
        const time = readQueryTime(output);
        if (time === undefined) {
            throw new Error(`${grammar}: no query time for ${query} on ${file}:\n${output}`);
        }
        times.push(time);
    }
    return median(times);
}
