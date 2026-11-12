// SPDX-License-Identifier: MIT

import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { benchInputs } from './bench.ts';
import { readTextIfExists, ROOT } from './lib/files.ts';
import { buildLibrary } from './lib/grammars.ts';
import { type Language, manifest } from './lib/manifest.ts';
import { estimatedCycles } from './lib/measure.ts';
import { Report } from './lib/report.ts';

export const BUDGETS = join('test', 'budgets.json');
const BASE_MARGIN = 0.01;
const CHANGE_MARGIN = 0.1;

export interface InputBudget {
    sha256: string;
    cycles: number;
}

export interface GrammarBudget {
    states: number;
    parserBytes: number;
    inputs: Record<string, InputBudget>;
}

export type Budgets = Record<string, GrammarBudget>;

export interface Change {
    measured: number;
    declared: number;
    allowed: number;
    passed: boolean;
}

interface Input {
    name: string;
    text: string;
    sha256: string;
}

function sha256(text: string): string {
    return createHash('sha256').update(text).digest('hex');
}

function inputs(language: Language, root: string): Input[] {
    return benchInputs(language, root).map(([name, text]) => ({
        name,
        text,
        sha256: sha256(text),
    }));
}

export interface Shape {
    states: number;
    parserBytes: number;
    inputs: Record<string, { sha256: string }>;
}

export function shape(language: Language, root = ROOT): Shape {
    const parser = join(root, 'tree-sitter', language.grammar, 'src', 'parser.c');
    const states = /^#define STATE_COUNT (\d+)$/m.exec(readFileSync(parser, 'utf8'))?.[1];
    if (states === undefined) {
        throw new Error(`${parser} defines no STATE_COUNT`);
    }
    return {
        states: Number(states),
        parserBytes: statSync(parser).size,
        inputs: Object.fromEntries(
            inputs(language, root).map(({ name, sha256: hash }) => [name, { sha256: hash }]),
        ),
    };
}

function cycles(language: Language, root: string, input: Input): number {
    const directory = join(ROOT, '.build', 'budgets');
    mkdirSync(directory, { recursive: true });
    const library = join(directory, 'parser.so');
    const file = join(directory, 'input.s');
    copyFileSync(buildLibrary(language.grammar, root), library);
    writeFileSync(file, input.text);
    return estimatedCycles(language.grammar, library, file);
}

export function readBudgets(root = ROOT): Budgets | undefined {
    const text = readTextIfExists(join(root, BUDGETS));
    return text === undefined ? undefined : JSON.parse(text) as Budgets;
}

export function change(
    parentDeclared: number,
    headDeclared: number,
    parentMeasured: number,
    headMeasured: number,
): Change {
    const measured = headMeasured / parentMeasured - 1;
    const declared = headDeclared / parentDeclared - 1;
    const allowed = BASE_MARGIN + CHANGE_MARGIN * Math.abs(declared);
    return { measured, declared, allowed, passed: Math.abs(measured - declared) <= allowed };
}

function percent(value: number): string {
    return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`;
}

function write(): number {
    const budgets: Budgets = {};
    for (const language of manifest.languages) {
        const { states, parserBytes } = shape(language);
        budgets[language.grammar] = {
            states,
            parserBytes,
            inputs: Object.fromEntries(
                inputs(language, ROOT).map((input) => [
                    input.name,
                    { sha256: input.sha256, cycles: cycles(language, ROOT, input) },
                ]),
            ),
        };
        console.log(`ok   ${language.grammar}: measured`);
    }
    writeFileSync(join(ROOT, BUDGETS), `${JSON.stringify(budgets, null, 4)}\n`);
    console.log(`ok   wrote ${BUDGETS}`);
    return 0;
}

function baselineInputs(language: Language, root: string): Input[] | string {
    try {
        return inputs(language, root);
    } catch (error) {
        return error instanceof Error ? error.message : String(error);
    }
}

function check(baselineDirectory: string): number {
    const baseline = resolve(ROOT, baselineDirectory);
    const declared = readBudgets();
    if (declared === undefined) {
        console.error(`${BUDGETS} is missing; run bun run budgets`);
        return 1;
    }
    const parent = readBudgets(baseline);
    const report = new Report();
    for (const language of manifest.languages) {
        const { grammar } = language;
        const head = declared[grammar];
        const current = shape(language);
        const stale = head === undefined ||
            head.states !== current.states ||
            head.parserBytes !== current.parserBytes ||
            JSON.stringify(Object.keys(head.inputs)) !==
                JSON.stringify(Object.keys(current.inputs)) ||
            Object.entries(current.inputs).some(([name, { sha256: hash }]) =>
                head.inputs[name].sha256 !== hash
            );
        if (stale) {
            report.record(`${grammar}: ${BUDGETS} is up to date`, false, 'run bun run budgets');
            continue;
        }
        const parentInputs = baselineInputs(language, baseline);
        for (const input of inputs(language, ROOT)) {
            const label = `${grammar} ${input.name}`;
            const parentBudget = parent?.[grammar]?.inputs[input.name];
            if (parentBudget === undefined) {
                report.record(
                    `${label}: no baseline, the baseline declares no budget for it`,
                    true,
                );
                continue;
            }
            if (typeof parentInputs === 'string') {
                report.record(
                    `${label}: no baseline, its inputs cannot be built: ${parentInputs}`,
                    true,
                );
                continue;
            }
            const parentInput = parentInputs.find(({ name }) => name === input.name);
            if (parentInput?.sha256 !== parentBudget.sha256) {
                report.record(`${label}: no baseline, the baseline measured another input`, true);
                continue;
            }
            const result = change(
                parentBudget.cycles,
                head.inputs[input.name].cycles,
                cycles(language, baseline, parentInput),
                cycles(language, ROOT, input),
            );
            report.record(
                `${label}: measured ${percent(result.measured)}, declared ${
                    percent(result.declared)
                } (allowed +-${(result.allowed * 100).toFixed(2)} points)`,
                result.passed,
                `declare the change with bun run budgets, or undo it`,
            );
        }
    }
    return report.finish('every cost change is declared', 'budget check(s)');
}

function main(args: string[]): number {
    if (args.length === 1 && args[0] === 'write') {
        return write();
    }
    if (args.length === 2 && args[0] === 'check') {
        return check(args[1]);
    }
    console.error('usage: budgets.ts write | budgets.ts check BASELINE_DIRECTORY');
    return 2;
}

if (import.meta.main) {
    process.exitCode = main(process.argv.slice(2));
}
