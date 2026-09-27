// SPDX-License-Identifier: MIT

import { walkSync } from '@std/fs';
import { dirname, fromFileUrl, relative, resolve } from '@std/path';

export const ROOT = resolve(dirname(fromFileUrl(import.meta.url)), '..', '..');

export function ifExists<T>(read: () => T): T | undefined {
  try {
    return read();
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return undefined;
    }
    throw error;
  }
}

export function readTextIfExists(path: string): string | undefined {
  return ifExists(() => Deno.readTextFileSync(path));
}

export function filesUnder(directory: string): string[] {
  const entries = ifExists(() => [...walkSync(directory, { includeDirs: false })]) ?? [];
  return entries.map((entry) => relative(directory, entry.path)).sort();
}
