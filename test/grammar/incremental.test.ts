// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { emptyDir, ROOT } from '../../scripts/lib/files.ts';
import { languageArgs, run } from '../../scripts/lib/grammars.ts';
import { manifest } from '../../scripts/lib/manifest.ts';
import { fixtures } from '../../scripts/verify-fixtures.ts';
import { treeText } from '../lib/parse.ts';

const INSERTED = ' \t\n:,.$#%()[]{}0123456789abcexyzLR\\;+-*/"\'@_';
const SEQUENCES = 2;
const EDITS = 10;
const MAX_CHANGE = 4;
const MODULUS = 2147483648;

function trees(output: string): string[] {
    return treeText(output)
        .split(/^(?=\(source_file )/m)
        .filter((tree) => tree.startsWith('(source_file'))
        .map((tree) => {
            let depth = 0;
            let end = 0;
            while (end < tree.length) {
                depth += tree[end] === '(' ? 1 : tree[end] === ')' ? -1 : 0;
                end++;
                if (depth === 0) {
                    break;
                }
            }
            return tree.slice(0, end).replace(/\s+/g, ' ');
        });
}

test('an edited fixture parses to the tree a fresh parse of the edited text gives', () => {
    let seed = 1;
    const random = (limit: number) => {
        seed = (seed * 1103515245 + 12345) % MODULUS;
        return Math.floor((seed / MODULUS) * limit);
    };
    const failures: string[] = [];
    for (const { grammar } of manifest.languages) {
        const directory = join(ROOT, '.build', 'incremental', grammar);
        emptyDir(directory);
        const edited: { label: string; tree: string }[] = [];
        const files: string[] = [];
        for (const fixture of fixtures(ROOT).filter((item) => item.grammars.includes(grammar))) {
            const original = readFileSync(join(ROOT, fixture.file), 'utf8');
            for (let sequence = 0; sequence < SEQUENCES; sequence++) {
                let text = original;
                const edits: string[] = [];
                for (let index = 0; index < EDITS; index++) {
                    const at = random(text.length + 1);
                    const removed = Math.min(random(MAX_CHANGE), text.length - at);
                    const inserted = Array.from(
                        { length: random(MAX_CHANGE) },
                        () => INSERTED[random(INSERTED.length)],
                    ).join('');
                    edits.push('--edits', `${at} ${removed} ${inserted}`);
                    text = text.slice(0, at) + inserted + text.slice(at + removed);
                }
                const parsed = trees(
                    run('tree-sitter', ['parse', ...languageArgs(grammar), fixture.file, ...edits])
                        .output,
                );
                assert.deepStrictEqual(parsed.length, 1, `${grammar} ${fixture.file}`);
                const file = join(directory, `${files.length}.s`);
                writeFileSync(file, text);
                files.push(file);
                edited.push({ label: `${fixture.file} sequence ${sequence}`, tree: parsed[0] });
            }
        }
        const fresh = trees(
            run('tree-sitter', ['parse', ...languageArgs(grammar), ...files]).output,
        );
        assert.deepStrictEqual(fresh.length, files.length, grammar);
        for (const [index, { label, tree }] of edited.entries()) {
            if (tree !== fresh[index]) {
                failures.push(`${grammar}: ${label}`);
            }
        }
    }
    assert.deepStrictEqual(failures, []);
});
