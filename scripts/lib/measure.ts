// SPDX-License-Identifier: MIT

import { languageArgs, run } from './grammars.ts';

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

export function readQueryTime(output: string): number | undefined {
  const time = /([\d.]+)ms\s*$/.exec(output);
  return time === null ? undefined : Number(time[1]);
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
