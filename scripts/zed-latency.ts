// SPDX-License-Identifier: MIT

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { BASICS } from './bench.ts';
import { emptyDir, ROOT } from './lib/files.ts';
import { run } from './lib/grammars.ts';
import { manifest } from './lib/manifest.ts';
import {
    changedClipboard,
    clipboard,
    CONFIG,
    focusZed,
    installExtension,
    perform,
    SETTINGS,
    sleep,
    startDisplay,
    startZed,
    type Step,
    stop,
    waitFor,
    WORK,
    writeSettings,
    zedVersion,
} from './lib/zed.ts';

const OUT = join(ROOT, '.build', 'zed-latency');
const KIB = 1024;
export const SIZES = [8 * KIB, 64 * KIB, 1024 * KIB];
const TYPED_LINES = 5;
const SETTLE = 5000;
const DUMP_KEY = 'ctrl+alt+shift+F12';
const DUMP_BINDING = 'ctrl-alt-shift-f12';
export const PERCENTILES = ['p50', 'p95', 'p99', 'max'];
const STATEMENT = /^\s+[A-Za-z_]/;

export interface Subject {
    name: string;
    suffix: string;
    modeline: string;
    text: string;
}

export interface Scenario {
    kind: 'lines' | 'inside';
    row: number;
    column: number;
    steps: Step[];
}

export interface Measurement {
    samples: number;
    percentiles: Record<string, number>;
}

function subjects(): Subject[] {
    const assembly = manifest.languages.map(
        ({ name, grammar, pathSuffixes, modelineAliases, lineComments }) => ({
            name,
            suffix: pathSuffixes[0] ?? 's',
            modeline: pathSuffixes.length > 0
                ? ''
                : `${lineComments[0]}vim: ft=${modelineAliases[0]}\n`,
            text: readFileSync(join(ROOT, 'test', 'fixtures', BASICS[grammar]), 'utf8'),
        }),
    );
    const plain = assembly.find(({ name }) => name === manifest.languages[0].name)!;
    return [
        { name: 'Plain Text', suffix: 'txt', modeline: '', text: plain.text },
        {
            name: 'C',
            suffix: 'c',
            modeline: '',
            text: readFileSync(join(ROOT, 'test', 'structure', 'sample.c'), 'utf8'),
        },
        ...assembly,
    ];
}

export function sized(modeline: string, text: string, size: number): string {
    let body = text;
    while (modeline.length + body.length < size) {
        body += text;
    }
    const cut = body.lastIndexOf('\n', size - modeline.length - 1);
    return `${modeline}${body.slice(0, cut + 1)}`;
}

export function statements(text: string): string[] {
    const found = text.split('\n').filter((line) => STATEMENT.test(line)).map((line) =>
        line.trim()
    );
    return [...new Set(found)].slice(0, TYPED_LINES);
}

export function scenarios(text: string, typed: string[]): Scenario[] {
    const rows = text.split('\n');
    let anchor = Math.floor(rows.length / 2);
    while (anchor < rows.length && !STATEMENT.test(rows[anchor])) {
        anchor++;
    }
    if (anchor === rows.length || typed.length === 0) {
        throw new Error('the text has no statement after its middle');
    }
    const line = rows[anchor];
    const word = /^\s+\S+\s?/.exec(line)![0].length;
    const operands = typed.map((statement) => statement.replace(/^\S+\s+/, '') || statement);
    return [
        {
            kind: 'lines',
            row: anchor + 1,
            column: line.length + 1,
            steps: typed.flatMap((statement) => [{ keys: ['Return'] }, { type: statement }]),
        },
        {
            kind: 'inside',
            row: anchor + 1,
            column: word + 1,
            steps: operands.flatMap((operand) => [
                { type: operand },
                { keys: Array<string>(operand.length).fill('BackSpace') },
            ]),
        },
    ];
}

export function parseReport(report: string): Measurement {
    const samples = /^Samples: (\d+)$/m.exec(report);
    const section = /^Percentiles:\n((?: {2}.+\n?)+)/m.exec(report);
    if (samples === null || section === null) {
        throw new Error(`the report has no samples or percentiles:\n${report}`);
    }
    const percentiles: Record<string, number> = {};
    for (const [, label, value] of section[1].matchAll(/^ {2}(\S+)\s*:\s+([\d.]+)ms/gm)) {
        percentiles[label] = Number(value);
    }
    for (const label of PERCENTILES) {
        if (percentiles[label] === undefined) {
            throw new Error(`the report has no ${label}:\n${report}`);
        }
    }
    return { samples: Number(samples[1]), percentiles };
}

function sizeLabel(size: number): string {
    return size >= 1024 * KIB ? `${size / (1024 * KIB)} MB` : `${size / KIB} KB`;
}

export function formatTable(
    version: string,
    rows: { subject: string; kind: string; size: number; measurement: Measurement }[],
): string {
    const width = Math.max(...rows.map(({ subject }) => subject.length));
    const header = `${'kind'.padEnd(7)}${'size'.padEnd(7)}${'subject'.padEnd(width + 2)}${
        'samples'.padStart(7)
    }${PERCENTILES.map((label) => label.padStart(9)).join('')}`;
    const lines = rows.map(({ subject, kind, size, measurement }) =>
        `${kind.padEnd(7)}${sizeLabel(size).padEnd(7)}${subject.padEnd(width + 2)}${
            String(measurement.samples).padStart(7)
        }${
            PERCENTILES.map((label) => measurement.percentiles[label].toFixed(2).padStart(9)).join(
                '',
            )
        }`
    );
    return `${version}, input event to presented frame, milliseconds\n${header}\n${
        lines.join('\n')
    }\n`;
}

async function measure(path: string, scenario: Scenario): Promise<string> {
    const zed = await startZed([`${path}:${scenario.row}:${scenario.column}`]);
    try {
        await sleep(SETTLE);
        focusZed();
        for (const step of scenario.steps) {
            await perform(step);
        }
        await sleep(1000);
        const before = clipboard();
        await perform({ keys: [DUMP_KEY] });
        await sleep(1000);
        await perform({ keys: ['ctrl+a', 'ctrl+c'] });
        const report = await changedClipboard(before);
        if (report === undefined || report === before) {
            throw new Error(`no input latency report for ${path}`);
        }
        return report;
    } finally {
        await stop(zed);
        await waitFor(
            'the Zed window to close',
            () =>
                run('xdotool', ['search', '--onlyvisible', '--class', 'zed']).ok ? undefined : true,
        );
    }
}

async function main() {
    emptyDir(OUT);
    mkdirSync(WORK, { recursive: true });
    mkdirSync(CONFIG, { recursive: true });
    writeSettings({ ...SETTINGS, restore_on_startup: 'none' });
    writeFileSync(
        join(CONFIG, 'keymap.json'),
        `${
            JSON.stringify(
                [{ bindings: { [DUMP_BINDING]: 'dev::DumpInputLatencyHistogram' } }],
                null,
                4,
            )
        }\n`,
    );
    console.log('building the grammars');
    installExtension();
    const version = zedVersion();
    const display = await startDisplay();
    const rows: { subject: string; kind: string; size: number; measurement: Measurement }[] = [];
    try {
        for (const size of SIZES) {
            for (const subject of subjects()) {
                const text = sized(subject.modeline, subject.text, size);
                for (const scenario of scenarios(text, statements(subject.text))) {
                    const name = `${subject.name.replace(/\W+/g, '-')}-${size}-${scenario.kind}`;
                    const path = join(WORK, `${name}.${subject.suffix}`);
                    writeFileSync(path, text);
                    const report = await measure(path, scenario);
                    writeFileSync(join(OUT, `${name}.txt`), report);
                    const measurement = parseReport(report);
                    rows.push({ subject: subject.name, kind: scenario.kind, size, measurement });
                    console.log(formatTable(version, rows.slice(-1)).split('\n')[2]);
                }
            }
        }
    } finally {
        await stop(display);
    }
    const table = formatTable(version, rows);
    writeFileSync(join(OUT, 'report.txt'), table);
    console.log(`\n${table}.build/zed-latency/report.txt`);
}

if (import.meta.main) {
    await main();
}
