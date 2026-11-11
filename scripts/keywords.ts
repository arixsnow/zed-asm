// SPDX-License-Identifier: MIT

import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { ROOT } from './lib/files.ts';
import { readBinutils } from './lib/keywords/binutils.ts';
import { header, type HeaderTable } from './lib/keywords/header.ts';
import { readLlvm } from './lib/keywords/llvm.ts';
import { readNasm } from './lib/keywords/nasm.ts';
import { armRole, FLAGS_ROLE, GENERIC_ROLE, Signatures } from './lib/keywords/roles.ts';
import {
  caseNames,
  cppDirectives,
  decorators,
  gnuDirectives,
  intelWords,
  nasmDirectives,
  nasmOperandWords,
  prefixes,
  registers,
  shiftWords,
  syntaxWords,
} from './lib/keywords/shapes.ts';
import { Keywords, project, WORK, workDirectory } from './lib/keywords/source.ts';
import { readYasm } from './lib/keywords/yasm.ts';

const KEYWORDS_HEADER = join(ROOT, 'tree-sitter', 'common', 'keywords.h');

const { gas } = createRequire(import.meta.url)('../tree-sitter/common/lexical.js') as {
  gas: { identifier: RegExp };
};

export function unlexed(names: Keywords, identifier: RegExp): Keywords {
  const whole = new RegExp(`^(?:${identifier.source})$`);
  const kept = new Keywords();
  for (const [name, flags] of names.entries()) {
    if (!whole.test(name)) {
      kept.add(name, ...flags);
    }
  }
  return kept;
}

function union(...tables: Keywords[]): Keywords {
  const merged = new Keywords();
  for (const table of tables) {
    merged.addAll(table);
  }
  return merged;
}

export function checkWordClashes(tables: HeaderTable[]): void {
  const table = (name: string) => tables.find((entry) => entry.name === name)?.keywords;
  for (const [word, flags] of table('ASM_X86_GAS_OPERAND_WORDS')?.entries() ?? []) {
    if (flags.includes('WORD_PTR_FOLLOWS') && table('ASM_X86_GAS_REGISTERS')?.has(word) === true) {
      throw new Error(`the size word ${word}, which needs a ptr word, is also a register`);
    }
  }
  const armRegisters = [
    'ASM_AARCH64_GNU_REGISTERS',
    'ASM_AARCH64_APPLE_REGISTERS',
    'ASM_AARCH32_REGISTERS',
  ]
    .map(table);
  for (const name of ['ASM_AARCH64_GNU_SHIFTS', 'ASM_AARCH64_APPLE_SHIFTS', 'ASM_AARCH32_SHIFTS']) {
    const shifts = tables.find((entry) => entry.name === name);
    for (const [word] of shifts?.keywords.entries() ?? []) {
      if (shifts?.role?.(word) === 'SHIFT_WORD' && armRegisters.some((known) => known?.has(word))) {
        throw new Error(`the shift word ${word}, which needs an amount, is also a register`);
      }
    }
  }
}

function main(args: string[]): number {
  if (args.length > 1) {
    console.error('usage: keywords.ts [sources directory]');
    return 2;
  }
  const sources = args[0] ?? '/sources';
  const projects = ['binutils', 'llvm', 'nasm', 'yasm'].map((name) => project(sources, name));
  const [binutilsProject, llvmProject, nasmProject, yasmProject] = projects;
  const binutils = readBinutils(binutilsProject);
  const llvm = readLlvm(llvmProject);
  const nasm = readNasm(nasmProject);
  const yasm = readYasm(yasmProject);

  for (const [name] of llvm.armLabelInstructions.entries()) {
    if (!binutils.armInstructions.has(name)) {
      throw new Error(`LLVM's ARM "${name}" takes a label but binutils has no operand data for it`);
    }
  }
  const flagsRole = (flags: Keywords) => (word: string) =>
    flags.has(word) ? FLAGS_ROLE : GENERIC_ROLE;
  const aarch64 = new Signatures();
  aarch64.addAll(binutils.aarch64Signatures);
  aarch64.addAll(llvm.aarch64Signatures);
  const arm = new Signatures();
  arm.addAll(aarch64);
  arm.addAll(binutils.armSignatures);
  const gnuArmRole = (word: string) => armRole(word, arm.get(word));
  const tables: HeaderTable[] = [
    {
      name: 'ASM_X86_NASM_INSTRUCTIONS',
      keywords: union(nasm.instructions, yasm.nasm.instructions),
      role: flagsRole(nasm.flagsInstructions),
    },
    {
      name: 'ASM_X86_GAS_INSTRUCTIONS',
      keywords: union(
        binutils.x86Instructions,
        binutils.x86Prefixes,
        llvm.x86Instructions,
        llvm.x86Prefixes,
        yasm.gas.instructions,
        yasm.gas.prefixes,
      ),
      role: flagsRole(union(binutils.x86FlagsInstructions, llvm.x86FlagsInstructions)),
    },
    {
      name: 'ASM_AARCH64_GNU_INSTRUCTIONS',
      keywords: union(binutils.aarch64Instructions, llvm.aarch64Instructions),
      role: gnuArmRole,
    },
    {
      name: 'ASM_AARCH64_APPLE_INSTRUCTIONS',
      keywords: llvm.aarch64AppleInstructions,
      role: (word) => armRole(word, aarch64.get(word)),
    },
    {
      name: 'ASM_AARCH32_INSTRUCTIONS',
      keywords: union(binutils.armInstructions, llvm.armInstructions),
      role: gnuArmRole,
    },
    {
      name: 'ASM_X86_NASM_DEFAULT_FLAGS',
      keywords: nasm.defaultFlags,
    },
    {
      name: 'ASM_X86_GAS_DEFAULT_FLAGS',
      keywords: union(binutils.x86DefaultFlags, llvm.x86DefaultFlags),
    },
    {
      name: 'ASM_AARCH32_CONDITIONS',
      keywords: union(binutils.armConditions, llvm.armConditions),
    },
    {
      name: 'ASM_AARCH32_VECTOR_CONDITIONS',
      keywords: union(binutils.armVectorConditions, llvm.armVectorConditions),
    },
  ];
  tables.push(
    {
      name: 'ASM_X86_GAS_DIRECTIVES',
      ...gnuDirectives(
        union(binutils.x86Directives, llvm.x86Directives, yasm.gas.directives),
        'x86',
      ),
    },
    {
      name: 'ASM_AARCH64_GNU_DIRECTIVES',
      ...gnuDirectives(union(binutils.aarch64Directives, llvm.aarch64Directives), 'arm'),
    },
    { name: 'ASM_AARCH64_APPLE_DIRECTIVES', ...gnuDirectives(llvm.aarch64Directives, 'apple') },
    {
      name: 'ASM_AARCH32_DIRECTIVES',
      ...gnuDirectives(union(binutils.armDirectives, llvm.armDirectives), 'arm'),
    },
    {
      name: 'ASM_X86_NASM_DIRECTIVES',
      ...nasmDirectives(union(nasm.directives, yasm.nasm.directives), nasm.preprocessor),
    },
    {
      name: 'ASM_X86_GAS_REGISTERS',
      ...registers([binutils.x86Registers, llvm.x86Registers, yasm.x86Registers]),
    },
    { name: 'ASM_X86_NASM_REGISTERS', ...registers([nasm.registers]) },
    {
      name: 'ASM_X86_GAS_PREFIXES',
      keywords: prefixes([
        { plain: binutils.x86Prefixes, braced: binutils.x86PseudoPrefixes },
        { plain: llvm.x86Prefixes, braced: llvm.x86PseudoPrefixes, intel: llvm.x86IntelPrefixes },
        { plain: yasm.gas.prefixes },
      ]),
      flagged: true,
    },
    {
      name: 'ASM_X86_NASM_PREFIXES',
      keywords: prefixes([{ plain: nasm.prefixes, braced: nasm.pseudoPrefixes }]),
      flagged: true,
    },
    {
      name: 'ASM_X86_GAS_OPERAND_WORDS',
      ...intelWords([binutils.x86IntelWords, llvm.x86IntelWords]),
    },
    { name: 'ASM_X86_NASM_OPERAND_WORDS', ...nasmOperandWords(nasm.operandWords) },
    {
      name: 'ASM_X86_GAS_ENCODING_SUFFIXES',
      keywords: union(binutils.x86EncodingSuffixes, llvm.x86EncodingSuffixes),
    },
    {
      name: 'ASM_X86_GAS_SYNTAX_WORDS',
      ...syntaxWords([binutils.x86SyntaxWords, llvm.x86SyntaxWords]),
    },
    { name: 'ASM_X86_NASM_LIST_WORDS', keywords: nasm.listWords },
    {
      name: 'ASM_X86_GAS_DECORATORS',
      keywords: decorators([binutils.x86Decorators, llvm.x86Decorators]),
      flagged: true,
    },
    {
      name: 'ASM_X86_NASM_DECORATORS',
      keywords: decorators([nasm.decorators]),
      flagged: true,
    },
    {
      name: 'ASM_AARCH64_GNU_RELOCATIONS',
      keywords: caseNames([binutils.aarch64Relocations, llvm.aarch64Relocations]),
      flagged: true,
    },
    {
      name: 'ASM_AARCH32_RELOCATIONS',
      keywords: caseNames([binutils.armRelocations, llvm.armRelocations]),
      flagged: true,
    },
    {
      name: 'ASM_AARCH32_SUFFIX_RELOCATIONS',
      keywords: caseNames([binutils.armSuffixRelocations, llvm.armSuffixRelocations]),
      flagged: true,
    },
    {
      name: 'ASM_AARCH64_GNU_CONDITIONS',
      keywords: caseNames([binutils.aarch64Conditions, llvm.aarch64Conditions]),
      flagged: true,
    },
    {
      name: 'ASM_AARCH64_APPLE_CONDITIONS',
      keywords: caseNames([llvm.aarch64Conditions]),
      flagged: true,
    },
    {
      name: 'ASM_AARCH64_GNU_SHIFTS',
      ...shiftWords([binutils.aarch64Shifts, llvm.aarch64Shifts]),
    },
    { name: 'ASM_AARCH64_APPLE_SHIFTS', ...shiftWords([llvm.aarch64Shifts]) },
    { name: 'ASM_AARCH32_SHIFTS', ...shiftWords([binutils.armShifts, llvm.armShifts]) },
    {
      name: 'ASM_AARCH64_GNU_PREDICATE_QUALIFIERS',
      keywords: caseNames([binutils.aarch64PredicateQualifiers, llvm.aarch64PredicateQualifiers]),
      flagged: true,
    },
    {
      name: 'ASM_AARCH64_APPLE_PREDICATE_QUALIFIERS',
      keywords: caseNames([llvm.aarch64PredicateQualifiers]),
      flagged: true,
    },
    {
      name: 'ASM_GNU_MACHO_SECTION_TYPES',
      keywords: unlexed(
        caseNames([binutils.machoSectionTypes, llvm.machoSectionTypes]),
        gas.identifier,
      ),
      flagged: true,
    },
    { name: 'ASM_GNU_CPP_DIRECTIVES', ...cppDirectives(llvm.cppDirectives) },
    {
      name: 'ASM_AARCH64_GNU_REGISTERS',
      ...registers([binutils.aarch64Registers, llvm.aarch64Registers]),
    },
    { name: 'ASM_AARCH64_APPLE_REGISTERS', ...registers([llvm.aarch64Registers]) },
    { name: 'ASM_AARCH32_REGISTERS', ...registers([binutils.armRegisters, llvm.armRegisters]) },
    {
      name: 'ASM_AARCH64_GNU_SYSTEM_REGISTERS',
      ...registers([binutils.aarch64SystemRegisters, llvm.aarch64SystemRegisters]),
    },
    {
      name: 'ASM_AARCH64_APPLE_SYSTEM_REGISTERS',
      ...registers([llvm.aarch64SystemRegisters]),
    },
    {
      name: 'ASM_AARCH32_SYSTEM_REGISTERS',
      ...registers([binutils.armSystemRegisters, llvm.armSystemRegisters]),
    },
  );
  checkWordClashes(tables);
  const constants = [{ name: 'ASM_AARCH32_TYPE_ELEMENTS', value: binutils.armTypeElements }];
  writeFileSync(KEYWORDS_HEADER, header(projects, constants, tables));
  workDirectory('');
  writeFileSync(
    join(WORK, 'tables.json'),
    `${
      JSON.stringify(
        Object.fromEntries(tables.map(({ name, keywords }) => [name, keywords.entries()])),
        null,
        1,
      )
    }\n`,
  );
  for (const { name, keywords } of tables) {
    console.log(`${String(keywords.size).padStart(6)}  ${name}`);
  }
  return 0;
}

if (import.meta.main) {
  process.exitCode = main(process.argv.slice(2));
}
