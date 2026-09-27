// SPDX-License-Identifier: MIT

import { assertEquals, assertThrows } from '@std/assert';
import { join } from '@std/path';

import config from '../../languages.config.cjs';
import { ROOT } from '../../scripts/lib/files.ts';
import {
  ARCHS,
  DIALECTS,
  manifest,
  parseAuthor,
  validateManifest,
} from '../../scripts/lib/manifest.ts';

interface Editable {
  extension: Record<string, unknown>;
  syntaxes: Record<string, Record<string, unknown> & { brackets: Record<string, unknown>[] }>;
  languages: Record<string, unknown>[];
}

function edited(change: (copy: Editable) => void): unknown {
  const copy = structuredClone(config) as unknown as Editable;
  change(copy);
  return copy;
}

Deno.test('the shipped manifest is valid and keeps every field', () => {
  const asData = (value: unknown) => JSON.parse(JSON.stringify(value));
  assertEquals(asData(manifest), asData(config));
});

Deno.test('an invalid manifest fails with a message naming the field', () => {
  const cases: [(copy: Editable) => void, string][] = [
    [(copy) => {
      copy.extension.grammarRev = 'main';
    }, 'extension.grammarRev must be a 40-character commit sha (got "main")'],
    [(copy) => {
      copy.extension.authors = [];
    }, 'extension.authors must list at least one author'],
    [(copy) => {
      copy.extension.authors = ['nobody'];
    }, 'extension.authors[0] must look like "Name <email>" (got "nobody")'],
    [(copy) => {
      copy.syntaxes.gas.labelPattern = '(';
    }, 'syntaxes.gas.labelPattern must be a valid regular expression (got "(")'],
    [(copy) => {
      delete copy.syntaxes.nasm.brackets[0].close;
    }, 'syntaxes.nasm.brackets[0].close must be a boolean'],
    [(copy) => {
      copy.languages = [];
    }, 'languages must list at least one language'],
    [(copy) => {
      delete copy.languages[0].grammar;
    }, 'languages[0].grammar must be a non-empty string'],
    [(copy) => {
      copy.languages[0].grammar = 'asm-auto';
    }, 'languages[0].grammar must be a lowercase C identifier (got "asm-auto")'],
    [(copy) => {
      copy.languages[1].dialect = 'ARM64';
    }, 'languages[1].dialect must be one of AUTO, ARM, ARM_APPLE, X86_GAS, X86_NASM (got "ARM64")'],
    [(copy) => {
      copy.languages[0].syntax = 'masm';
    }, 'languages[0].syntax must be one of gas, nasm (got "masm")'],
    [(copy) => {
      copy.languages[0].archs = ['arm', 'riscv'];
    }, 'languages[0].archs[1] must be one of arm, x86 (got "riscv")'],
    [(copy) => {
      copy.languages[0].lineComments = 'no';
    }, 'languages[0].lineComments must be an array'],
    [(copy) => {
      copy.languages[2].grammar = 'asm_arm';
    }, 'languages[2].grammar "asm_arm" is already used by languages[1]'],
    [(copy) => {
      copy.languages[3].dir = 'arm';
    }, 'languages[3].dir "arm" is already used by languages[1]'],
    [(copy) => {
      copy.languages[2].name = 'Assembly';
    }, 'languages[2].name "Assembly" is already used by languages[0]'],
    [(copy) => {
      copy.languages[4].pathSuffixes = ['asm', 's'];
    }, 'languages[4].pathSuffixes "s" is already used by languages[0]'],
    [(copy) => {
      copy.languages[1].modelineAliases = ['arm', 'nasm'];
    }, 'languages[4].modelineAliases "nasm" is already used by languages[1]'],
  ];
  for (const [change, message] of cases) {
    assertThrows(() => validateManifest(edited(change)), Error, `languages.config.cjs: ${message}`);
  }
});

Deno.test('parseAuthor splits "Name <email>"', () => {
  assertEquals(parseAuthor('Arka Mondal <arka@arkamondal.net>', 'author'), {
    name: 'Arka Mondal',
    email: 'arka@arkamondal.net',
  });
});

Deno.test('the dialect list matches the scanner', () => {
  const scanner = Deno.readTextFileSync(join(ROOT, 'tree-sitter', 'common', 'scanner.h'));
  const dialects = new Set(
    [...scanner.matchAll(/(?:#ifdef |defined\()ASM_DIALECT_([A-Z0-9_]+)/g)].map((match) =>
      match[1]
    ),
  );
  assertEquals([...dialects].sort(), [...DIALECTS].sort());
});

Deno.test('the architecture list matches the grammar modules', () => {
  const modules = [...Deno.readDirSync(join(ROOT, 'tree-sitter', 'common', 'arch'))]
    .map((entry) => entry.name.replace(/\.js$/, ''));
  assertEquals(modules.toSorted(), [...ARCHS].sort());
});
