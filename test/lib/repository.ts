// SPDX-License-Identifier: MIT

import { globToRegExp, join } from '@std/path';

import { readTextIfExists } from '../../scripts/lib/files.ts';

const SCANNED_HIDDEN_DIRECTORIES = new Set(['.github']);

interface IgnorePattern {
  pattern: RegExp;
  directoryOnly: boolean;
}

interface GeneratedRule {
  pattern: RegExp;
  generated: boolean;
}

function patternLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

function ignorePatterns(root: string): IgnorePattern[] {
  return patternLines(readTextIfExists(join(root, '.gitignore')) ?? '').map((line) => {
    if (!/^\/[^\s!]+$/.test(line)) {
      throw new Error(
        `.gitignore pattern "${line}" is not supported: use an anchored path like /name/`,
      );
    }
    const directoryOnly = line.endsWith('/');
    const glob = line.slice(1, directoryOnly ? -1 : undefined);
    return { pattern: globToRegExp(glob, { globstar: true }), directoryOnly };
  });
}

export function repositoryFiles(root: string): string[] {
  const ignored = ignorePatterns(root);
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of Deno.readDirSync(join(root, directory))) {
      const path = directory === '' ? entry.name : `${directory}/${entry.name}`;
      const isIgnored = ignored.some((rule) =>
        (entry.isDirectory || !rule.directoryOnly) && rule.pattern.test(path)
      );
      if (isIgnored) {
        continue;
      }
      if (entry.isDirectory) {
        if (!entry.name.startsWith('.') || SCANNED_HIDDEN_DIRECTORIES.has(path)) {
          visit(path);
        }
      } else if (entry.isFile) {
        files.push(path);
      }
    }
  };
  visit('');
  return files.sort();
}

function generatedState(attributes: string[]): boolean | undefined {
  if (attributes.includes('linguist-generated') || attributes.includes('linguist-generated=true')) {
    return true;
  }
  if (
    attributes.includes('-linguist-generated') || attributes.includes('linguist-generated=false')
  ) {
    return false;
  }
  return undefined;
}

export function generatedMatcher(root: string): (path: string) => boolean {
  const rules: GeneratedRule[] = [];
  for (const line of patternLines(readTextIfExists(join(root, '.gitattributes')) ?? '')) {
    const [glob, ...attributes] = line.split(/\s+/);
    const generated = generatedState(attributes);
    if (generated !== undefined) {
      const anchored = glob.includes('/') ? glob.replace(/^\//, '') : `**/${glob}`;
      rules.push({ pattern: globToRegExp(anchored, { globstar: true }), generated });
    }
  }
  return (path) => rules.findLast((rule) => rule.pattern.test(path))?.generated ?? false;
}
