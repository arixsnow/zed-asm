// SPDX-License-Identifier: MIT

import { assertEquals } from '@std/assert';
import { createRequire } from 'node:module';

import { type Language, manifest } from '../../scripts/lib/manifest.ts';
import { parseFiles, PRINTABLE, treeText } from '../lib/parse.ts';

interface Lexical {
  identifier: RegExp;
  dotIdentifier: RegExp;
}

const LEXICAL: Record<string, Lexical> = createRequire(import.meta.url)(
  '../../tree-sitter/common/lexical.js',
);
const DARWIN = ['ARM_APPLE'];
const LABEL_NAME = /name: \((identifier|local_identifier) \[0, 0\] - \[0, (\d+)\]\)/;

function candidateNames(): string[] {
  const names = new Set<string>();
  for (const char of PRINTABLE.filter((candidate) => candidate !== ' ' && candidate !== ':')) {
    for (
      const name of [`${char}ab`, `a${char}b`, `.${char}b`, `..${char}b`, `.L${char}`, `L${char}`]
    ) {
      names.add(name);
    }
  }
  for (const name of ['.', '..', '....', '$.b', '$']) {
    names.add(name);
  }
  return [...names];
}

function localPrefix(language: Language): string {
  if (language.syntax === 'nasm') {
    return '.';
  }
  return DARWIN.includes(language.dialect) ? 'L' : '.L';
}

function expectedName(language: Language, name: string): string | null {
  const { identifier, dotIdentifier } = LEXICAL[language.syntax];
  const matches = (pattern: RegExp) => new RegExp(`^(?:${pattern.source})$`).test(name);
  if (!matches(identifier) && !matches(dotIdentifier)) {
    return null;
  }
  const unescaped = language.syntax === 'nasm' ? name.replace(/^\$/, '') : name;
  return unescaped.startsWith(localPrefix(language)) ? 'local_identifier' : 'identifier';
}

function parsedName(tree: string, name: string): string | null {
  const match = LABEL_NAME.exec(tree);
  return match !== null && Number(match[2]) === name.length ? match[1] : null;
}

Deno.test('the scanner reads a label exactly where the grammar reads a name, and local as the assembler does', () => {
  const names = candidateNames();
  const failures: string[] = [];
  for (const language of manifest.languages) {
    const { grammar } = language;
    const trees = treeText(
      parseFiles(grammar, 'labels', names.map((name) => `${name}:\nnop\n`)).output,
    )
      .split(/^(?=\(source_file )/m)
      .filter((tree) => tree.startsWith('(source_file '));
    assertEquals(trees.length, names.length, `${grammar}: one tree per name`);
    for (const [index, name] of names.entries()) {
      const expected = expectedName(language, name);
      const parsed = parsedName(trees[index], name);
      if (parsed !== expected) {
        failures.push(
          `${grammar} ${JSON.stringify(name)}: read as ${parsed}, expected ${expected}`,
        );
      }
    }
  }
  assertEquals(failures, []);
});

Deno.test('a .L name is local in operands, assignments and glued names where the assembler keeps it out of the symbol table', () => {
  const source = '.macro m\n.Lx\\@:\n.endm\n    b .Lx\n.Ly = 1\n';
  for (const language of manifest.languages.filter(({ syntax }) => syntax === 'gas')) {
    const tree = treeText(parseFiles(language.grammar, 'labels-local', [source]).output);
    const expected = DARWIN.includes(language.dialect) ? 0 : 3;
    assertEquals(
      tree.includes('ERROR') || tree.includes('MISSING'),
      false,
      `${language.grammar}: ${tree}`,
    );
    assertEquals((tree.match(/\(local_identifier /g) ?? []).length, expected, language.grammar);
  }
});
