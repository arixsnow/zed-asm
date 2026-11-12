// SPDX-License-Identifier: MIT

import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { filesUnder, ROOT } from './files.ts';

export interface RunOptions {
    stream?: boolean;
    env?: Record<string, string>;
    cwd?: string;
}

export interface RunResult {
    ok: boolean;
    status: number | null;
    output: string;
}

export function run(command: string, args: string[], options: RunOptions = {}): RunResult {
    const stdio = options.stream ? 'inherit' : 'pipe';
    const result = spawnSync(command, args, {
        cwd: options.cwd ?? ROOT,
        env: options.env === undefined ? process.env : { ...process.env, ...options.env },
        stdio: ['ignore', stdio, stdio],
        encoding: 'utf8',
        maxBuffer: Infinity,
    });
    if (result.error !== undefined) {
        throw result.error;
    }
    const ok = result.status === 0;
    if (options.stream) {
        return { ok, status: result.status, output: '' };
    }
    return { ok, status: result.status, output: `${result.stdout}${result.stderr}` };
}

export function runOrThrow(command: string, args: string[], options: RunOptions = {}): string {
    const { ok, output } = run(command, args, options);
    if (!ok) {
        throw new Error(`${command} ${args.join(' ')} failed:\n${output}`);
    }
    return output;
}

const libraries = new Map<string, string>();

function sourceHash(grammar: string, root: string): string {
    const hash = createHash('sha256');
    hash.update(runOrThrow('tree-sitter', ['--version']));
    for (const directory of [join(grammar, 'src'), 'common']) {
        for (const source of filesUnder(join(root, 'tree-sitter', directory))) {
            hash.update(`${join(directory, source)}\0`);
            hash.update(readFileSync(join(root, 'tree-sitter', directory, source)));
        }
    }
    return hash.digest('hex').slice(0, 16);
}

export function buildLibrary(grammar: string, root = ROOT): string {
    const key = join(root, grammar);
    const built = libraries.get(key);
    if (built !== undefined) {
        return built;
    }
    const directory = join(root, '.build', 'lib');
    mkdirSync(directory, { recursive: true });
    const name = `${grammar}-${sourceHash(grammar, root)}.so`;
    const library = join(directory, name);
    if (!existsSync(library)) {
        const partial = join(directory, `.${randomUUID()}.so`);
        runOrThrow('tree-sitter', [
            'build',
            '--output',
            partial,
            join(root, 'tree-sitter', grammar),
        ]);
        renameSync(partial, library);
        const stale = new RegExp(`^${grammar}-[0-9a-f]{16}\\.so$`);
        for (const entry of readdirSync(directory)) {
            if (stale.test(entry) && entry !== name) {
                rmSync(join(directory, entry), { force: true });
            }
        }
    }
    libraries.set(key, library);
    return library;
}

export function languageArgs(grammar: string, library = buildLibrary(grammar)): string[] {
    return ['--lib-path', library, '--lang-name', grammar];
}
