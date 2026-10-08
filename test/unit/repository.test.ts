// SPDX-License-Identifier: MIT

import { assertEquals, assertThrows } from '@std/assert';
import { emptyDirSync } from '@std/fs';
import { dirname, join } from '@std/path';

import { ROOT } from '../../scripts/lib/files.ts';
import { generatedMatcher, repositoryFiles } from '../../scripts/lib/repository.ts';

function withTree(files: Record<string, string>, body: (root: string) => void): void {
  const root = join(ROOT, '.build', 'repository-probe');
  emptyDirSync(root);
  for (const [path, text] of Object.entries(files)) {
    Deno.mkdirSync(join(root, dirname(path)), { recursive: true });
    Deno.writeTextFileSync(join(root, path), text);
  }
  try {
    body(root);
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
}

Deno.test('repository files skip gitignored paths and hidden directories other than .github', () => {
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
    assertEquals(repositoryFiles(root), [
      '.editorconfig',
      '.github/workflows/ci.yml',
      '.gitignore',
      'a.txt',
      'tree/one/keep.txt',
      'tree/two/out',
    ]);
  });
});

Deno.test('an unanchored or negated .gitignore pattern is rejected', () => {
  for (const pattern of ['*.wasm', '!/keep/']) {
    withTree({ '.gitignore': `${pattern}\n` }, (root) => {
      assertThrows(
        () => repositoryFiles(root),
        Error,
        `.gitignore pattern "${pattern}" is not supported`,
      );
    });
  }
});

Deno.test('generated files follow the linguist-generated patterns in .gitattributes', () => {
  withTree({
    '.gitattributes':
      '* text=auto eol=lf\ngen.txt linguist-generated\nsrc/*/out/** linguist-generated\n',
  }, (root) => {
    const isGenerated = generatedMatcher(root);
    const paths = ['gen.txt', 'nested/gen.txt', 'src/a/out/x.c', 'src/a/out/deep/y.h', 'src/a/x.c'];
    assertEquals(paths.map(isGenerated), [true, true, true, true, false]);
  });
});
