// SPDX-License-Identifier: MIT

import { assertEquals } from '@std/assert';
import { ensureDirSync } from '@std/fs';
import { join } from '@std/path';

import { ROOT } from '../../scripts/lib/files.ts';
import { languageArgs, run } from '../../scripts/lib/grammars.ts';
import { parseFiles, treeText } from '../lib/parse.ts';

const X86_GAS = ['asm_auto', 'asm_x86_gas'];

const EDITS: [string, [number, number, number, string]][] = [
  ['.att_syntax\ncall rax\nnop\ncall rbx\n', [0, 1, 3, 'intel']],
  ['.intel_syntax\ncall rax\nnop\ncall rbx\n', [0, 1, 5, 'att']],
  ['.intel_syntax noprefix\ncall rax\nnop\ncall rbx\n', [0, 14, 8, 'prefix']],
  ['.intel_syntax prefix\ncall rax\nnop\ncall rbx\n', [0, 14, 0, 'no']],
  ['.intel_syntax noprefix\ncall rax\nnop\ncall rbx\n', [0, 0, 23, '']],
  ['call rax\nnop\ncall rbx\n', [1, 0, 0, '.intel_syntax noprefix\n']],
  ['.intel_syntax noprefix\nf:\n    call rax\n.macro m\n    push rbx\n.endm\n', [0, 0, 23, '']],
];

function applyEdit(
  text: string,
  [row, column, deleted, inserted]: [number, number, number, string],
) {
  const lines = text.split('\n');
  const offset = lines.slice(0, row).reduce((sum, line) => sum + line.length + 1, 0) + column;
  return text.slice(0, offset) + inserted + text.slice(offset + deleted);
}

Deno.test('editing a syntax directive reads every later line as a fresh parse does', () => {
  const failures: string[] = [];
  const directory = join(ROOT, '.build', 'syntax-edits');
  ensureDirSync(directory);
  for (const grammar of X86_GAS) {
    for (const [index, [text, edit]] of EDITS.entries()) {
      const file = join(directory, `${grammar}-${index}.s`);
      Deno.writeTextFileSync(file, text);
      const [row, column, deleted, inserted] = edit;
      const incremental = run('tree-sitter', [
        'parse',
        ...languageArgs(grammar),
        file,
        '--edits',
        `${row},${column} ${deleted} ${inserted}`,
      ]);
      const fresh = parseFiles(grammar, 'syntax-fresh', [applyEdit(text, edit)]);
      if (treeText(incremental.output).trim() !== treeText(fresh.output).trim()) {
        failures.push(`${grammar}: edit ${JSON.stringify(edit)} of ${JSON.stringify(text)}`);
      }
    }
  }
  assertEquals(failures, []);
});
