// SPDX-License-Identifier: MIT

import { assert, assertEquals } from '@std/assert';
import { emptyDirSync } from '@std/fs';
import { join, relative } from '@std/path';

import { languageConfig } from '../../scripts/build.ts';
import { ROOT } from '../../scripts/lib/files.ts';
import { languageArgs, run } from '../../scripts/lib/grammars.ts';
import { blockIndentPattern } from '../../scripts/lib/indent.ts';
import { manifest } from '../../scripts/lib/manifest.ts';
import { parseFiles, treeText } from '../lib/parse.ts';

interface Kind {
  headers: string[];
  closers: string[];
  context: string;
}

const KINDS: Kind[] = [
  {
    headers: ['.macro m', '.macro m a, b=1', '.MACRO m a'],
    closers: ['.endm', '.ENDMACRO'],
    context: '',
  },
  {
    headers: ['.if A', '.ifdef X', '.IFNDEF X', '.ifc a, b'],
    closers: ['.endif', '.ENDIF'],
    context: '',
  },
  { headers: ['.else', '.elseif B'], closers: ['.endif'], context: '.if A\n' },
  {
    headers: ['.rept 3', '.irp r, 1, 2', '.irpc c, 123'],
    closers: ['.endr', '.ENDR'],
    context: '',
  },
];

const LEADS = [
  '',
  '\t',
  'f: ',
  '.Lf: ',
  '1: ',
  'nop; ',
  '.byte 0; ',
  'x: nop; ',
  '.endr; ',
  '.endif; ',
  '.endm; ',
];

const PLAIN_TAILS = [
  '',
  ' // c',
  ' /* c */',
  ' /* ; c',
  ' # c',
  ' #1',
  ' @ c',
  ' ; c',
  ' ;',
  ';;',
  '; nop',
  '; .byte 1',
  '; .L1: nop',
  '; 1: nop',
  ' "a;b"',
  " ';'",
  '; #x',
  '; @x',
  '; x@y',
  '; .endx',
  '; .end',
];

const ERROR_CASES: Record<string, number> = {
  asm_auto: 442,
  asm_arm: 442,
  asm_arm_apple: 305,
  asm_x86_gas: 706,
};

const BLOCK =
  /^ *(?:\w+: )?\((macro_definition|conditional|repeat_block|elseif_clause|else_clause) \[(\d+), \d+\] - \[(\d+), \d+\]/;

function tailsFor(kind: Kind): string[] {
  const own = kind.closers.flatMap((closer) => [
    `; ${closer}`,
    `;${closer}`,
    `; ${closer} // c`,
    `; ${closer}; nop`,
    `; .L1: ${closer}`,
    `; 1: ${closer}`,
    `; nop; ${closer}`,
    ` /* x */; ${closer}`,
    ` "a;b"; ${closer}`,
  ]);
  const others = KINDS.filter((other) => other.closers[0] !== kind.closers[0]).map((other) =>
    `; ${other.closers[0]}`
  );
  return [...PLAIN_TAILS, ...own, ...others];
}

function casesFor(): { kind: Kind; line: string }[] {
  return KINDS.flatMap((kind) =>
    kind.headers.flatMap((header) =>
      LEADS.flatMap((lead) =>
        tailsFor(kind).map((tail) => ({ kind, line: `${lead}${header}${tail}` }))
      )
    )
  );
}

function openAtEnd(tree: string, row: number): boolean {
  return tree.split('\n').some((line) => {
    const match = BLOCK.exec(line);
    return match !== null && Number(match[2]) === row && Number(match[3]) > row;
  });
}

Deno.test('the block part of the increase pattern matches a line exactly when the parser leaves a block opened on it open', () => {
  for (const language of manifest.languages) {
    const source = blockIndentPattern(language, manifest.syntaxes[language.syntax]);
    if (source === null) {
      continue;
    }
    const pattern = new RegExp(source, 'u');
    const cases = casesFor();
    const sources = cases.map(({ kind, line }) => `${kind.context}${line}\n`);
    const logs = parseFiles(language.grammar, 'indent-pattern', sources, ['--debug']).output
      .split(/^new_parse$/m).slice(1);
    const trees = treeText(parseFiles(language.grammar, 'indent-pattern', sources).output)
      .split(/^(?=\(source_file )/m).filter((tree) => tree.startsWith('(source_file '));
    assertEquals(logs.length, cases.length, `${language.grammar}: one log per case`);
    assertEquals(trees.length, cases.length, `${language.grammar}: one tree per case`);
    const mismatches: string[] = [];
    let compared = 0;
    for (const [index, { kind, line }] of cases.entries()) {
      if (/\bdetect_error\b/.test(logs[index])) {
        continue;
      }
      compared++;
      const open = openAtEnd(trees[index], kind.context === '' ? 0 : 1);
      if (pattern.test(line) !== open) {
        mismatches.push(`${open ? 'open' : 'closed'}: ${JSON.stringify(line)}`);
      }
    }
    assertEquals(
      cases.length - compared,
      ERROR_CASES[language.grammar],
      `${language.grammar}: cases that parse with an error and are not compared`,
    );
    assertEquals(mismatches, [], language.grammar);
  }
});

Deno.test('Rust, whose regex engine Zed uses, compiles every indent pattern and reads every line like the tests do', () => {
  const directory = join(ROOT, '.build', 'indent-rust');
  for (const language of manifest.languages) {
    const config = languageConfig(language, manifest);
    const patterns = [config.increase_indent_pattern, config.decrease_indent_pattern] as string[];
    const query = patterns.map((pattern, index) =>
      `((source_file) @p${index} (#match? @p${index} "${
        pattern.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
      }"))`
    ).join('\n');
    const lines = KINDS.filter((kind) => kind.context === '').flatMap((kind) => [
      ...tailsFor(kind).map((tail) => `${kind.headers[0]}${tail}`),
      ...kind.headers.map((header) => header),
      ...LEADS.filter((lead) => !/^\s/.test(lead)).map((lead) => `${lead}${kind.headers[0]}`),
    ]);
    emptyDirSync(directory);
    Deno.writeTextFileSync(join(directory, 'query.scm'), query);
    const files = lines.map((line, index) => {
      const file = join(directory, `${index}.s`);
      Deno.writeTextFileSync(file, line);
      return file;
    });
    const { ok, output } = run('tree-sitter', [
      'query',
      ...languageArgs(language.grammar),
      join(directory, 'query.scm'),
      ...files,
    ]);
    assert(ok, `${language.grammar}: ${output}`);
    const matched = new Map<string, Set<number>>();
    let current = '';
    for (const text of output.split('\n')) {
      const header = /^(\S.*\.s)$/.exec(text);
      if (header !== null) {
        current = header[1];
        matched.set(current, new Set());
        continue;
      }
      const pattern = /^\s+pattern: (\d+)$/.exec(text);
      if (pattern !== null) {
        matched.get(current)?.add(Number(pattern[1]));
      }
    }
    const compiled = patterns.map((pattern) => new RegExp(pattern, 'u'));
    const differences: string[] = [];
    for (const [index, line] of lines.entries()) {
      const rust = matched.get(files[index]) ?? matched.get(relative(ROOT, files[index]));
      assert(rust !== undefined, `${language.grammar}: no result for ${files[index]}`);
      for (const [patternIndex, pattern] of compiled.entries()) {
        if (pattern.test(line) !== rust.has(patternIndex)) {
          differences.push(`pattern ${patternIndex}: ${JSON.stringify(line)}`);
        }
      }
    }
    assertEquals(differences, [], language.grammar);
  }
});
