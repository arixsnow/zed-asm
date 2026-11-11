// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { emptyDir, ROOT } from '../../scripts/lib/files.ts';
import { Keywords, type Project } from '../../scripts/lib/keywords/source.ts';
import { assertThrowsIncluding } from './assert.ts';

export type SourceFiles = Record<string, string>;

export interface Breakage {
  file: string;
  from: string;
  to: string;
  stops: string;
}

export interface ReaderCase {
  name: string;
  read: (project: Project) => Keywords;
  files: SourceFiles;
  expected: [string, string[]][];
  breakages?: Breakage[];
}

export function sourceTree(scratch: string, files: SourceFiles): Project {
  const path = join(ROOT, '.build', 'keyword-sources', scratch);
  emptyDir(path);
  for (const [file, text] of Object.entries(files)) {
    const target = join(path, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
  }
  return { name: scratch, path, commit: '0'.repeat(40) };
}

export function broken(
  files: SourceFiles,
  { file, from, to }: Omit<Breakage, 'stops'>,
): SourceFiles {
  assert.ok(files[file]?.includes(from), `${file} does not hold ${JSON.stringify(from)}`);
  return { ...files, [file]: files[file].replace(from, to) };
}

export function keywords(rows: Record<string, string[]>): Keywords {
  const table = new Keywords();
  for (const [name, tags] of Object.entries(rows)) {
    table.add(name, ...tags);
  }
  return table;
}

export function testReaders(project: string, cases: ReaderCase[]): void {
  for (const { name, read, files, expected, breakages } of cases) {
    const scratch = `${project}-${name.replaceAll(/\W+/g, '-')}`;
    test(`${project} ${name} reads its names and tags`, () => {
      assert.deepStrictEqual(read(sourceTree(scratch, files)).entries(), expected);
    });
    for (const breakage of breakages ?? []) {
      test(`${project} ${name} stops: ${breakage.stops}`, () => {
        const tree = sourceTree(scratch, broken(files, breakage));
        assertThrowsIncluding(() => read(tree), breakage.stops);
      });
    }
  }
}
