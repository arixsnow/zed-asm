// SPDX-License-Identifier: MIT

import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { readTextIfExists, ROOT } from '../files.ts';

export const WORK = join(ROOT, '.build', 'keywords');

export class Keywords {
  readonly #entries = new Map<string, Set<string>>();

  add(name: string, ...flags: string[]): void {
    if (!/^[a-z0-9_.$?@{}%-]+$/.test(name)) {
      throw new Error(`keyword "${name}" is not a lower-case ASCII word`);
    }
    const known = this.#entries.get(name) ?? new Set<string>();
    for (const flag of flags) {
      known.add(flag);
    }
    this.#entries.set(name, known);
  }

  addAll(other: Keywords): void {
    for (const [name, flags] of other.entries()) {
      this.add(name, ...flags);
    }
  }

  delete(name: string): void {
    this.#entries.delete(name);
  }

  has(name: string): boolean {
    return this.#entries.has(name);
  }

  get size(): number {
    return this.#entries.size;
  }

  entries(): [string, string[]][] {
    return [...this.#entries]
      .map(([name, flags]): [string, string[]] => [name, [...flags].sort()])
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  }
}

export function writtenCases(
  spellings: string[],
  source: string,
  what: string,
): Map<string, string[]> {
  const written = new Map<string, Set<string>>();
  for (const spelling of spellings) {
    const name = spelling.toLowerCase();
    if (spelling !== name && spelling !== spelling.toUpperCase()) {
      throw new Error(`${what}: "${spelling}" is spelled in mixed case`);
    }
    written.set(name, new Set([...(written.get(name) ?? []), spelling]));
  }
  return new Map(
    [...written].map(([name, forms]) => [
      name,
      [
        `${source}:no-mixed-case`,
        ...(forms.has(name) ? [] : [`${source}:no-lower-case`]),
        ...(forms.has(name.toUpperCase()) ? [] : [`${source}:no-upper-case`]),
      ],
    ]),
  );
}

export function writtenNames(spellings: string[], source: string, what: string): Keywords {
  const names = new Keywords();
  for (const [name, tags] of writtenCases(spellings, source, what)) {
    names.add(name, ...tags);
  }
  return names;
}

export interface Project {
  name: string;
  path: string;
  commit: string;
}

function checkedCommit(text: string, repository: string): string {
  if (!/^[0-9a-f]{40}$/.test(text)) {
    throw new Error(`${repository}: "${text}" is not a commit hash`);
  }
  return text;
}

export function project(sources: string, name: string): Project {
  const path = join(sources, name);
  const git = join(path, '.git');
  const head = readFileSync(join(git, 'HEAD'), 'utf8').trim();
  const ref = /^ref: (\S+)$/.exec(head);
  if (ref === null) {
    return { name, path, commit: checkedCommit(head, path) };
  }
  const loose = readTextIfExists(join(git, ref[1]))?.trim();
  if (loose !== undefined) {
    return { name, path, commit: checkedCommit(loose, path) };
  }
  const packed = (readTextIfExists(join(git, 'packed-refs')) ?? '')
    .split('\n')
    .find((line) => line.endsWith(` ${ref[1]}`));
  if (packed === undefined) {
    throw new Error(`${path}: cannot resolve ${ref[1]}`);
  }
  return { name, path, commit: checkedCommit(packed.split(' ')[0], path) };
}

export function workDirectory(name: string): string {
  const directory = join(WORK, name);
  mkdirSync(directory, { recursive: true });
  return directory;
}

export function readSource(project: Project, file: string): string {
  return readFileSync(join(project.path, file), 'utf8');
}

export function section(text: string, start: RegExp, end: RegExp, what: string): string {
  const open = start.exec(text);
  if (open === null) {
    throw new Error(`no ${what}`);
  }
  const rest = text.slice(open.index + open[0].length);
  const close = end.exec(rest);
  if (close === null) {
    throw new Error(`${what} does not end`);
  }
  return rest.slice(0, close.index);
}
