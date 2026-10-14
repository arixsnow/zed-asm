// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { emptyDir, ROOT } from '../../scripts/lib/files.ts';
import { generatedMatcher, repositoryFiles } from '../../scripts/lib/repository.ts';
import { assertThrowsIncluding } from '../lib/assert.ts';

function withTree(files: Record<string, string>, body: (root: string) => void): void {
  const root = join(ROOT, '.build', 'repository-probe');
  emptyDir(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, dirname(path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  try {
    body(root);
  } finally {
    rmSync(root, { recursive: true });
  }
}

test('repository files skip gitignored paths and hidden directories other than .github', () => {
  withTree({
    '.gitignore': '/ignored/\n/tree/*/out/\n',
    '.editorconfig': '',
    '.hidden/secret.txt': '',
    '.github/workflows/ci.yml': '',
    'a.txt': '',
    'ignored/b.txt': '',
    'tree/one/out/c.txt': '',
    'tree/one/keep.txt': '',
    'tree/two/out': '',
    'tree/two/.cache/d.txt': '',
  }, (root) => {
    assert.deepStrictEqual(repositoryFiles(root), [
      '.editorconfig',
      '.github/workflows/ci.yml',
      '.gitignore',
      'a.txt',
      'tree/one/keep.txt',
      'tree/two/out',
    ]);
  });
});

test('an unanchored or negated .gitignore pattern is rejected', () => {
  for (const pattern of ['*.wasm', '!/keep/']) {
    withTree({ '.gitignore': `${pattern}\n` }, (root) => {
      assertThrowsIncluding(
        () => repositoryFiles(root),
        `.gitignore pattern "${pattern}" is not supported`,
      );
    });
  }
});

test('generated files follow the linguist-generated patterns in .gitattributes', () => {
  withTree({
    '.gitattributes':
      '* text=auto eol=lf\ngen.txt linguist-generated\nsrc/*/out/** linguist-generated\n',
  }, (root) => {
    const isGenerated = generatedMatcher(root);
    const paths = ['gen.txt', 'nested/gen.txt', 'src/a/out/x.c', 'src/a/out/deep/y.h', 'src/a/x.c'];
    assert.deepStrictEqual(paths.map(isGenerated), [true, true, true, true, false]);
  });
});
