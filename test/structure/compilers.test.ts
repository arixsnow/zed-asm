// SPDX-License-Identifier: MIT

import { assert, assertEquals } from '@std/assert';
import { ensureDirSync } from '@std/fs';
import { join } from '@std/path';

import { ROOT } from '../../scripts/lib/files.ts';
import { run } from '../../scripts/lib/grammars.ts';
import { manifest } from '../../scripts/lib/manifest.ts';
import { outlineItems } from '../lib/zed.ts';
import { queryMatchesFor } from '../lib/zed-syntax.ts';

interface Target {
  name: string;
  temporaryPrefix: string;
  grammars: string[];
  compilers: [string, string[]][];
}

const TARGETS: Target[] = [
  {
    name: 'x86-64',
    temporaryPrefix: '.L',
    grammars: ['asm_x86_gas', 'asm_auto'],
    compilers: [['gcc', []], ['clang', []]],
  },
  {
    name: 'AArch64',
    temporaryPrefix: '.L',
    grammars: ['asm_arm', 'asm_auto'],
    compilers: [['aarch64-linux-gnu-gcc', []], ['clang', ['--target=aarch64-linux-gnu']]],
  },
  {
    name: 'ARM',
    temporaryPrefix: '.L',
    grammars: ['asm_arm', 'asm_auto'],
    compilers: [['arm-none-eabi-gcc', ['-marm']], ['clang', ['--target=armv7a-none-eabi']]],
  },
  {
    name: 'Thumb',
    temporaryPrefix: '.L',
    grammars: ['asm_arm', 'asm_auto'],
    compilers: [
      ['arm-none-eabi-gcc', ['-mthumb', '-mcpu=cortex-m3']],
      ['clang', ['--target=thumbv7m-none-eabi']],
    ],
  },
  {
    name: 'Apple arm64',
    temporaryPrefix: 'L',
    grammars: ['asm_arm_apple'],
    compilers: [['clang', ['--target=arm64-apple-macos']]],
  },
];

const OPTIMIZATIONS = [['-O0'], ['-O2'], ['-O2', '-g']];
const LABEL = /^([A-Za-z_.$][A-Za-z0-9_.$]*):/;
const ASSIGNMENT_DIRECTIVE = /^\s*(\.(?:set|equ|equiv|eqv))\s+([A-Za-z_.$][A-Za-z0-9_.$]*)\s*,/i;
const ASSIGNMENT = /^\s*([A-Za-z_.$][A-Za-z0-9_.$]*)\s*==?[^=]/;
const RODATA = /^\s*\.section\s+\.rodata(?:\s*,.*)?$/;
const ALIGNMENT = /^\s*\.(?:p2align|align|balign)\b/;

function symbolOutline(assembly: string, temporaryPrefix: string): string[] {
  const outline: string[] = [];
  let insideSymbol = false;
  for (const line of assembly.split('\n')) {
    const label = LABEL.exec(line);
    if (label !== null) {
      const temporary = label[1].startsWith(temporaryPrefix);
      outline.push(`${temporary && insideSymbol ? 1 : 0} ${label[1]}`);
      insideSymbol ||= !temporary;
      continue;
    }
    const directive = ASSIGNMENT_DIRECTIVE.exec(line);
    if (directive !== null) {
      outline.push(`${insideSymbol ? 1 : 0} ${directive[1]} ${directive[2]}`);
      continue;
    }
    const assignment = ASSIGNMENT.exec(line);
    if (assignment !== null) {
      outline.push(`${insideSymbol ? 1 : 0} ${assignment[1]}`);
    }
  }
  return outline;
}

function jumpTables(assembly: string): string[] {
  const tables: string[] = [];
  let afterRodata = false;
  for (const line of assembly.split('\n')) {
    const label = LABEL.exec(line);
    if (afterRodata && label !== null) {
      tables.push(label[1]);
    }
    afterRodata = RODATA.test(line) || (afterRodata && ALIGNMENT.test(line));
  }
  return tables;
}

Deno.test('the outline of compiler output lists every symbol with the temporary labels it owns, jump tables included', () => {
  const directory = join(ROOT, '.build', 'compilers');
  ensureDirSync(directory);
  const failures: string[] = [];
  let jumpTablesSeen = 0;
  for (const target of TARGETS) {
    for (const [compiler, flags] of target.compilers) {
      for (const optimization of OPTIMIZATIONS) {
        const variant = `${target.name} ${compiler} ${optimization.join(' ')}`;
        const output = join(directory, `${variant.replaceAll(/[^A-Za-z0-9]+/g, '-')}.s`);
        const compiled = run(compiler, [
          ...flags,
          ...optimization,
          '-S',
          '-o',
          output,
          join(ROOT, 'test', 'structure', 'sample.c'),
        ]);
        assert(compiled.ok, `${variant}: ${compiled.output}`);
        const assembly = Deno.readTextFileSync(output);
        const expected = symbolOutline(assembly, target.temporaryPrefix);
        const tables = jumpTables(assembly);
        jumpTablesSeen += tables.length;
        for (const table of tables) {
          assert(expected.includes(`1 ${table}`), `${variant}: jump table ${table} is not nested`);
        }
        for (const grammar of target.grammars) {
          const language = manifest.languages.find((entry) => entry.grammar === grammar);
          assert(language !== undefined, grammar);
          const outline = outlineItems(
            assembly,
            queryMatchesFor(language, 'outline', assembly, 'compilers'),
          ).map((item) => `${item.depth} ${item.text}`);
          if (JSON.stringify(outline) !== JSON.stringify(expected)) {
            const missing = expected.filter((entry) => !outline.includes(entry));
            const extra = outline.filter((entry) => !expected.includes(entry));
            failures.push(
              `${variant} in ${grammar}: missing ${JSON.stringify(missing)}, extra ${
                JSON.stringify(extra)
              }`,
            );
          }
        }
      }
    }
  }
  assert(jumpTablesSeen > 0, 'no compiler emitted a jump table for the sample');
  assertEquals(failures, []);
});
