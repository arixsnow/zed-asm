// SPDX-License-Identifier: MIT

import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import { copyFileSync, cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT } from './files.ts';
import { run, runOrThrow } from './grammars.ts';
import { manifest } from './manifest.ts';
import { foreignFunctions, wasmArgs } from './wasm.ts';

export const HOME = '/home/qa';
export const DISPLAY = ':99';
const SCREEN = '1400x900x24';
export const WORK = join(HOME, 'work');
export const ZED_DATA = join(HOME, '.local', 'share', 'zed');
export const CONFIG = join(HOME, '.config', 'zed');
const EXTENSION = join(ZED_DATA, 'extensions', 'installed', 'asm');
export const LOG = join(ZED_DATA, 'logs', 'Zed.log');
export const OPEN_DELAY = 2500;
const TIMEOUT = 15000;

export const SETTINGS = {
    telemetry: { diagnostics: false, metrics: false },
    auto_update: false,
    auto_install_extensions: { html: false },
    session: { trust_all_worktrees: true },
    theme: 'One Dark',
    buffer_font_size: 16,
    remove_trailing_whitespace_on_save: false,
    ensure_final_newline_on_save: false,
};

export type Step = { type: string } | { keys: string[] } | { pause: number };

export function sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function waitFor<T>(what: string, probe: () => T | undefined): Promise<T> {
    const deadline = Date.now() + TIMEOUT;
    while (Date.now() < deadline) {
        const value = probe();
        if (value !== undefined) {
            return value;
        }
        await sleep(100);
    }
    throw new Error(`timed out waiting for ${what}`);
}

export async function background(command: string, args: string[]): Promise<ChildProcess> {
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    await once(child, 'spawn');
    return child;
}

export async function stop(child: ChildProcess): Promise<void> {
    if (child.exitCode !== null || child.signalCode !== null) {
        return;
    }
    const exited = once(child, 'exit');
    process.kill(-child.pid!, 'SIGTERM');
    await exited;
}

export function installExtension() {
    mkdirSync(join(EXTENSION, 'grammars'), { recursive: true });
    for (const { grammar } of manifest.languages) {
        const output = join(EXTENSION, 'grammars', `${grammar}.wasm`);
        runOrThrow('clang', wasmArgs(grammar, output));
        const foreign = foreignFunctions(readFileSync(output));
        if (foreign.length > 0) {
            throw new Error(
                `${grammar}.wasm imports functions tree-sitter's wasm runtime lacks: ${
                    foreign.join(', ')
                }`,
            );
        }
    }
    copyFileSync(join(ROOT, 'extension.toml'), join(EXTENSION, 'extension.toml'));
    cpSync(join(ROOT, 'languages'), join(EXTENSION, 'languages'), { recursive: true });
}

export function focusZed() {
    const windows = runOrThrow('xdotool', ['search', '--onlyvisible', '--class', 'zed']).trim()
        .split(
            '\n',
        );
    runOrThrow('xdotool', ['windowfocus', '--sync', windows[0]]);
}

export async function perform(step: Step) {
    if ('pause' in step) {
        await sleep(step.pause);
    } else if ('type' in step) {
        runOrThrow('xdotool', ['type', '--delay', '60', '--clearmodifiers', '--', step.type]);
    } else {
        runOrThrow('xdotool', ['key', '--delay', '120', '--clearmodifiers', ...step.keys]);
    }
}

export function clipboard(): string | undefined {
    const { ok, output } = run('xclip', ['-o', '-selection', 'clipboard']);
    return ok ? output : undefined;
}

export async function changedClipboard(before: string | undefined): Promise<string | undefined> {
    const deadline = Date.now() + TIMEOUT;
    let current = clipboard();
    while (current === before && Date.now() < deadline) {
        await sleep(100);
        current = clipboard();
    }
    return current;
}

export function writeSettings(settings: Record<string, unknown>) {
    writeFileSync(
        join(CONFIG, 'settings.json'),
        `${JSON.stringify(settings, null, 4)}\n`,
    );
}

export async function startDisplay(): Promise<ChildProcess> {
    const display = await background('Xvfb', [DISPLAY, '-screen', '0', SCREEN, '-nolisten', 'tcp']);
    await waitFor('the display', () => run('xdotool', ['getdisplaygeometry']).ok || undefined);
    return display;
}

export async function startZed(paths: string[]): Promise<ChildProcess> {
    const zed = await background('dbus-run-session', ['--', 'zed', '--foreground', ...paths]);
    await waitFor(
        'the Zed window',
        () => run('xdotool', ['search', '--onlyvisible', '--class', 'zed']).ok || undefined,
    );
    return zed;
}

export function zedVersion(): string {
    return runOrThrow('zed', ['--version']).split(/\s+/).slice(0, 2).join(' ');
}
