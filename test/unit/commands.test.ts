// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT } from '../../scripts/lib/files.ts';

function packageScripts(): string[] {
  const { scripts } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  return Object.keys(scripts);
}

function documentedScripts(): string[] {
  const architecture = readFileSync(join(ROOT, 'docs', 'architecture.md'), 'utf8');
  const section = /^## Checks\n([\s\S]*?)(?=^## )/m.exec(architecture)?.[1];
  assert.ok(section !== undefined, 'docs/architecture.md has no Checks section');
  return [...section.matchAll(/^\| `bun run ([\w:-]+)` +\| +\S.*\|$/gm)].map(([, name]) => name);
}

function podmanRunArgs(launcher: string): string[] {
  const text = readFileSync(join(ROOT, launcher), 'utf8');
  const start = text.indexOf('exec podman run ');
  assert.notStrictEqual(start, -1, `${launcher} does not exec podman run`);
  const lines: string[] = [];
  for (const line of text.slice(start).split('\n')) {
    lines.push(line.replace(/\\$/, ''));
    if (!line.endsWith('\\')) {
      break;
    }
  }
  return lines.join(' ').trim().split(/\s+/);
}

test('every package.json script has exactly one described row in the Checks table', () => {
  assert.deepStrictEqual(documentedScripts().toSorted(), packageScripts().toSorted());
});

test('the dev and Zed containers run without a network', () => {
  for (const launcher of ['scripts/dev', 'scripts/zed']) {
    const network = podmanRunArgs(launcher).filter((arg) => /^--net(?:work)?(?:=|$)/.test(arg));
    assert.deepStrictEqual(network, ['--network=none'], launcher);
  }
});
