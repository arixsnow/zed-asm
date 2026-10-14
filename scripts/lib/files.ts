// SPDX-License-Identifier: MIT

import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '..', '..');

export function isNotFound(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

export function ifExists<T>(read: () => T): T | undefined {
  try {
    return read();
  } catch (error) {
    if (isNotFound(error)) {
      return undefined;
    }
    throw error;
  }
}

export function readTextIfExists(path: string): string | undefined {
  return ifExists(() => readFileSync(path, 'utf8'));
}

export function emptyDir(directory: string): void {
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
}

export function filesUnder(directory: string): string[] {
  const entries = ifExists(() => readdirSync(directory, { recursive: true, withFileTypes: true }));
  return (entries ?? [])
    .filter((entry) => entry.isFile() || entry.isSymbolicLink())
    .map((entry) => relative(directory, join(entry.parentPath, entry.name)))
    .sort();
}
