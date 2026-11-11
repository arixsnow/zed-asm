// SPDX-License-Identifier: MIT

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { runOrThrow } from '../grammars.ts';
import { bracedBody, withoutComments } from './c-source.ts';
import { Signatures } from './roles.ts';
import {
  Keywords,
  type Project,
  readSource,
  section,
  WORK,
  workDirectory,
  writtenCases,
  writtenNames,
} from './source.ts';

export interface LlvmTables {
  x86Instructions: Keywords;
  x86FlagsInstructions: Keywords;
  x86DefaultFlags: Keywords;
  x86EncodingSuffixes: Keywords;
  x86SyntaxWords: Keywords;
  aarch64Signatures: Signatures;
  armLabelInstructions: Keywords;
  x86Prefixes: Keywords;
  x86IntelPrefixes: Keywords;
  x86PseudoPrefixes: Keywords;
  x86IntelWords: Keywords;
  x86Decorators: Keywords;
  aarch64Relocations: Keywords;
  armRelocations: Keywords;
  armSuffixRelocations: Keywords;
  aarch64Shifts: Keywords;
  armShifts: Keywords;
  aarch64PredicateQualifiers: Keywords;
  machoSectionTypes: Keywords;
  cppDirectives: Keywords;
  armInstructions: Keywords;
  aarch64Instructions: Keywords;
  aarch64AppleInstructions: Keywords;
  armConditions: Keywords;
  armVectorConditions: Keywords;
  aarch64Conditions: Keywords;
  x86Directives: Keywords;
  aarch64Directives: Keywords;
  armDirectives: Keywords;
  x86Registers: Keywords;
  aarch64Registers: Keywords;
  armRegisters: Keywords;
  aarch64SystemRegisters: Keywords;
  armSystemRegisters: Keywords;
}

const TARGETS = ['X86', 'ARM', 'AArch64'] as const;
type Target = (typeof TARGETS)[number];

const X86_RETRY_SUFFIXES = { integer: 'bwlq', float: 'slt' };
const X86_COMPARE_SUFFIXES = ['ss', 'sd', 'sh', 'ph', 'bf16', 'ps', 'pd'];
const X86_INTEGER_COMPARE_SUFFIXES = ['b', 'w', 'd', 'q', 'ub', 'uw', 'ud', 'uq'];
const X86_SET_EXCEPTIONS = new Set(['setzub', 'setzunb', 'setb', 'setnb']);
const WORD_CHARACTERS = 'abcdefghijklmnopqrstuvwxyz0123456789_.$';
const AARCH64_LABEL_CLASS =
  /^MCK_(BranchTarget\d+|PCRelLabel\d+|AdrLabel|AdrpLabel|PAuthPCRelLabel\d+)$/;
const AARCH64_CONDITION_CLASS = /^MCK_CondCode$/;
const AARCH64_SYSTEM_CLASS =
  /^MCK_(MRSSystemRegister|MSRSystemRegister|SVCR|SystemPStateFieldWithImm0_(1|15)|SysCR)$/;
const AARCH64_PAIR_CLASS = /^MCK_(XSeqPair|WSeqPair|SyspXzrPair)$/;
const ARM_LABEL_CLASS =
  /^MCK_\w*(BranchTarget|BrTarget|BlTarget|BlxTarget|CBTarget|AdrLabel|PCRel|Label)\w*$/;

function tablegen(llvm: Project): string {
  const build = join(WORK, '..', 'tblgen');
  if (!existsSync(join(build, 'build.ninja'))) {
    runOrThrow('cmake', [
      '-S',
      join(llvm.path, 'llvm'),
      '-B',
      build,
      '-G',
      'Ninja',
      '-DCMAKE_BUILD_TYPE=Release',
      '-DCMAKE_C_COMPILER=clang',
      '-DCMAKE_CXX_COMPILER=clang++',
      '-DLLVM_TARGETS_TO_BUILD=X86;ARM;AArch64',
      '-DLLVM_INCLUDE_TESTS=OFF',
      '-DLLVM_INCLUDE_BENCHMARKS=OFF',
      '-DLLVM_INCLUDE_EXAMPLES=OFF',
      '-DLLVM_INCLUDE_DOCS=OFF',
      '-DLLVM_INCLUDE_UTILS=OFF',
      '-DLLVM_BUILD_TOOLS=OFF',
      '-DLLVM_ENABLE_ZLIB=OFF',
      '-DLLVM_ENABLE_ZSTD=OFF',
      '-DLLVM_ENABLE_LIBXML2=OFF',
      '-DLLVM_ENABLE_LIBEDIT=OFF',
      '-DLLVM_ENABLE_LIBPFM=OFF',
    ]);
  }
  runOrThrow('ninja', ['-C', build, 'llvm-tblgen']);
  return join(build, 'bin', 'llvm-tblgen');
}

function matcher(llvm: Project, tool: string, target: Target): string {
  const root = join(llvm.path, 'llvm');
  const output = join(workDirectory('llvm'), `${target}.inc`);
  runOrThrow(tool, [
    '-gen-asm-matcher',
    '-I',
    join(root, 'include'),
    '-I',
    join(root, 'lib', 'Target', target),
    '-I',
    join(root, 'lib', 'Target'),
    join(root, 'lib', 'Target', target, `${target}.td`),
    '-o',
    output,
  ]);
  return readFileSync(output, 'utf8');
}

function searchableTables(llvm: Project, tool: string, target: Target): string {
  const root = join(llvm.path, 'llvm');
  const output = join(workDirectory('llvm'), `${target}-tables.inc`);
  runOrThrow(tool, [
    '-gen-searchable-tables',
    '-I',
    join(root, 'include'),
    '-I',
    join(root, 'lib', 'Target', target),
    '-I',
    join(root, 'lib', 'Target'),
    join(root, 'lib', 'Target', target, `${target}.td`),
    '-o',
    output,
  ]);
  return readFileSync(output, 'utf8');
}

interface MatchEntry {
  mnemonic: string;
  classes: string[];
}

export function variantEntries(inc: string): Map<number, MatchEntry[]> {
  const variants = new Map<number, MatchEntry[]>();
  for (
    const [, variant, body] of inc.matchAll(
      /^static const MatchEntry MatchTable(\d+)\[\] = \{\n([\s\S]*?)^\};/gm,
    )
  ) {
    const entries: MatchEntry[] = [];
    for (
      const [, name, classes] of body.matchAll(/^\s+\{ \d+ \/\* (\S+) \*\/, [^{]*\{ ?([^}]*)\}/gm)
    ) {
      entries.push({
        mnemonic: name.toLowerCase(),
        classes: classes.split(',').map((item) => item.trim()).filter((item) => item !== ''),
      });
    }
    variants.set(Number(variant), entries);
  }
  if (variants.size === 0) {
    throw new Error('the asm matcher has no MatchTable');
  }
  return variants;
}

function variantNames(inc: string): Map<number, Set<string>> {
  return new Map(
    [...variantEntries(inc)].map(([variant, entries]) => [
      variant,
      new Set(entries.map(({ mnemonic }) => mnemonic)),
    ]),
  );
}

export function aliasNames(inc: string): Map<number, Set<string>> {
  const variants = new Map<number, Set<string>>();
  const start = inc.indexOf('static void applyMnemonicAliases(');
  if (start === -1) {
    return variants;
  }
  const end = inc.indexOf('\n}\n', start);
  let variant = 0;
  for (const line of inc.slice(start, end).split('\n')) {
    const label = /^\s{2}case (\d+):$/.exec(line);
    if (label !== null) {
      variant = Number(label[1]);
    }
    for (const [, name] of line.matchAll(/\/\/ "([^"]+)"/g)) {
      const names = variants.get(variant) ?? new Set<string>();
      names.add(name.toLowerCase());
      variants.set(variant, names);
    }
  }
  return variants;
}

function namesOf(inc: string, variants: number[]): Set<string> {
  const tables = variantNames(inc);
  const aliases = aliasNames(inc);
  const names = new Set<string>();
  for (const variant of variants) {
    for (const name of [...(tables.get(variant) ?? []), ...(aliases.get(variant) ?? [])]) {
      names.add(name);
    }
  }
  return names;
}

function caseNames(block: string): Map<string, number> {
  const cases = new Map<string, number>();
  for (
    const [, name, value] of withoutComments(block).matchAll(
      /\.Case\("(\w+)",\s*(0x[0-9A-Fa-f]+)\)/g,
    )
  ) {
    cases.set(name, Number.parseInt(value, 16));
  }
  if (cases.size === 0) {
    throw new Error('X86AsmParser.cpp: a comparison predicate switch has no cases');
  }
  return cases;
}

function stringCases(block: string): string[] {
  return [...withoutComments(block).matchAll(/"(\w+)"/g)].map(([, name]) => name);
}

function x86ParserSource(llvm: Project): string {
  const parser = readSource(llvm, 'llvm/lib/Target/X86/AsmParser/X86AsmParser.cpp');
  return section(parser, /^bool X86AsmParser::parseInstruction\(/m, /^\}$/m, 'parseInstruction');
}

function x86Instructions(llvm: Project, inc: string): Keywords {
  const atAndT = namesOf(inc, [0]);
  const all = namesOf(inc, [0, 1]);
  const accepted = new Set(all);
  for (const name of atAndT) {
    const suffixes = name.startsWith('f') ? X86_RETRY_SUFFIXES.float : X86_RETRY_SUFFIXES.integer;
    if (name.length > 1 && suffixes.includes(name.at(-1) ?? '')) {
      accepted.add(name.slice(0, -1));
    }
  }
  const parser = x86ParserSource(llvm);
  const compare = caseNames(
    section(
      parser,
      /PatchedName\.slice\(CCIdx, PatchedName\.size\(\) - suffixLength\)\)/,
      /\.Default\(~0U\)/,
      'the cmp predicate switch',
    ),
  );
  const afterVpcmp = parser.slice(parser.indexOf('PatchedName.starts_with("vpcmp")'));
  const integerCompare = caseNames(
    section(
      afterVpcmp,
      /PatchedName\.slice\(5, PatchedName\.size\(\) - SuffixSize\)\)/,
      /\.Default\(~0U\)/,
      'the vpcmp predicate switch',
    ),
  );
  const afterVpcom = parser.slice(parser.indexOf('PatchedName.starts_with("vpcom")'));
  const xopCompare = caseNames(
    section(
      afterVpcom,
      /PatchedName\.slice\(5, PatchedName\.size\(\) - SuffixSize\)\)/,
      /\.Default\(~0U\)/,
      'the vpcom predicate switch',
    ),
  );
  const derived = new Set<string>();
  for (const name of accepted) {
    if (name.startsWith('set') && !X86_SET_EXCEPTIONS.has(`${name}b`)) {
      derived.add(`${name}b`);
    }
  }
  for (const [prefix, vector] of [['cmp', false], ['vcmp', true]] as const) {
    for (const suffix of X86_COMPARE_SUFFIXES) {
      if (!vector && suffix.endsWith('h')) {
        continue;
      }
      const canonical = suffix === 'sh' || suffix === 'ph' || suffix === 'bf16'
        ? `vcmp${suffix}`
        : `${prefix}${suffix}`;
      if (!accepted.has(canonical)) {
        continue;
      }
      for (const [predicate, value] of compare) {
        if (!vector && value >= 8) {
          continue;
        }
        const fillers = suffix === 'bf16' ? [...WORD_CHARACTERS] : [''];
        for (const filler of fillers) {
          derived.add(`${prefix}${predicate}${filler}${suffix}`);
        }
      }
    }
  }
  for (
    const [stem, predicates, unsignedEqualOnly] of [
      ['vpcmp', integerCompare, true],
      ['vpcom', xopCompare, false],
    ] as const
  ) {
    for (const suffix of X86_INTEGER_COMPARE_SUFFIXES) {
      if (!accepted.has(`${stem}${suffix}`)) {
        continue;
      }
      for (const [predicate, value] of predicates) {
        if (unsignedEqualOnly && value === 0 && suffix.length === 1) {
          continue;
        }
        derived.add(`${stem}${predicate}${suffix}`);
      }
    }
  }
  const table = new Keywords();
  for (const name of [...accepted, ...derived]) {
    table.add(name);
  }
  return table;
}

function x86FlagsInstructions(llvm: Project, instructions: Keywords): Keywords {
  const code = withoutComments(x86ParserSource(llvm));
  const call = code.indexOf('parseCFlagsOp(Operands)');
  if (call === -1) {
    throw new Error('X86AsmParser.cpp: cannot find the parseCFlagsOp call');
  }
  const condition = code.slice(code.lastIndexOf('if (', call), call);
  const prefixes = [...condition.matchAll(/(?<![\w.])Name\.starts_with\("(\w+)"\)/g)].map(
    ([, name]) => name,
  );
  if (prefixes.length === 0) {
    throw new Error('X86AsmParser.cpp: the parseCFlagsOp condition names no prefix');
  }
  const table = new Keywords();
  for (const [name] of instructions.entries()) {
    if (prefixes.some((prefix) => name.startsWith(prefix))) {
      table.add(name);
    }
  }
  return table;
}

export function x86EncodingSuffixes(llvm: Project): Keywords {
  const suffixes = new Keywords();
  for (
    const [, suffix] of withoutComments(x86ParserSource(llvm)).matchAll(
      /\bName\.consume_back\("(\.\w+)"\)/g,
    )
  ) {
    suffixes.add(suffix);
  }
  if (suffixes.size === 0) {
    throw new Error('X86AsmParser.cpp: parseInstruction reads no suffix after a dot');
  }
  return suffixes;
}

export function x86SyntaxWords(llvm: Project): Keywords {
  const file = 'llvm/lib/Target/X86/AsmParser/X86AsmParser.cpp';
  const directive = section(
    withoutComments(readSource(llvm, file)),
    /^bool X86AsmParser::ParseDirective\(/m,
    /^\}$/m,
    'ParseDirective',
  );
  const words = new Keywords();
  for (const syntax of ['att', 'intel']) {
    const word = new RegExp(
      `\\bIDVal\\.starts_with\\("\\.${syntax}_syntax"\\)\\) \\{[\\s\\S]*?` +
        '\\bgetString\\(\\) == "(\\w+)"\\)\\s*Parser\\.Lex\\(\\);',
    ).exec(directive);
    if (word === null) {
      throw new Error(`${file}: .${syntax}_syntax no longer takes a word as written`);
    }
    words.add(word[1], `llvm:syntax:${syntax}`, ...LLVM_LOWER_CASE);
  }
  return words;
}

function x86DefaultFlags(llvm: Project): Keywords {
  const parser = readSource(llvm, 'llvm/lib/Target/X86/AsmParser/X86AsmParser.cpp');
  const body = section(parser, /^bool X86AsmParser::parseCFlagsOp\(/m, /^\}$/m, 'parseCFlagsOp');
  const flags = new Keywords();
  for (const [, flag] of withoutComments(body).matchAll(/\.Case\("(\w+)",/g)) {
    flags.add(flag);
  }
  if (flags.size === 0) {
    throw new Error('X86AsmParser.cpp: parseCFlagsOp names no flag');
  }
  return flags;
}

function x86Prefixes(
  llvm: Project,
): Pick<LlvmTables, 'x86Prefixes' | 'x86IntelPrefixes' | 'x86PseudoPrefixes'> {
  const parser = withoutComments(x86ParserSource(llvm));
  const tables = {
    x86Prefixes: new Keywords(),
    x86IntelPrefixes: new Keywords(),
    x86PseudoPrefixes: new Keywords(),
  };
  for (
    const [start, what] of [
      [/bool IsPrefix =/, 'the IsPrefix switch'],
      [/auto isLockRepeatNtPrefix = /, 'the lock and repeat prefix switch'],
    ] as const
  ) {
    const block = section(parser, start, /\.Default\(false\);/, what);
    const cases = [
      ...block.matchAll(
        /\.Cases?\(\s*(\{[^}]*\}|"[^"]+")\s*,\s*(true|isParsingIntelSyntax\(\))\s*\)/g,
      ),
    ];
    if (cases.length === 0 || cases.length !== [...block.matchAll(/\.Cases?\(/g)].length) {
      throw new Error(`X86AsmParser.cpp: ${what} has a case this reader does not know`);
    }
    for (const [, names, condition] of cases) {
      for (const [, name] of names.matchAll(/"(\w+)"/g)) {
        tables.x86Prefixes.add(name);
        if (condition !== 'true') {
          tables.x86IntelPrefixes.add(name);
        }
      }
    }
  }
  const open = /\bif \(Name == "\{"\) \{/.exec(parser);
  if (open === null) {
    throw new Error('X86AsmParser.cpp: parseInstruction reads no braced pseudo-prefixes');
  }
  const block = bracedBody(parser, open.index + open[0].length - 1);
  for (const [, name] of block.matchAll(/\bPrefix == "(\w+)"/g)) {
    tables.x86PseudoPrefixes.add(name);
  }
  if (tables.x86PseudoPrefixes.size === 0) {
    throw new Error('X86AsmParser.cpp: the braced pseudo-prefix block names no prefix');
  }
  return tables;
}

const X86_PARSER = 'llvm/lib/Target/X86/AsmParser/X86AsmParser.cpp';
const LLVM_LOWER_CASE = ['llvm:no-upper-case', 'llvm:no-mixed-case'];

const AARCH64_PARSER = 'llvm/lib/Target/AArch64/AsmParser/AArch64AsmParser.cpp';
const ARM_PARSER = 'llvm/lib/Target/ARM/AsmParser/ARMAsmParser.cpp';

export function aarch64Shifts(llvm: Project): Keywords {
  const parser = withoutComments(readSource(llvm, AARCH64_PARSER));
  const body = section(
    parser,
    /^AArch64AsmParser::tryParseOptionalShiftExtend\(OperandVector &Operands\) \{/m,
    /^\}$/m,
    'tryParseOptionalShiftExtend',
  );
  const required =
    /\bif \(((?:\s*(?:\|\|\s*)?ShOp == AArch64_AM::\w+)+)\) \{\s*return TokError\("expected #imm/
      .exec(body);
  if (
    !/\bstd::string LowerID = Tok\.getString\(\)\.lower\(\);/.test(body) || required === null
  ) {
    throw new Error(`${AARCH64_PARSER}: tryParseOptionalShiftExtend no longer reads its words`);
  }
  const amounts = new Set([...required[1].matchAll(/AArch64_AM::(\w+)/g)].map(([, kind]) => kind));
  const shifts = new Keywords();
  for (const [, name, kind] of body.matchAll(/\.Case\("(\w+)", AArch64_AM::(\w+)\)/g)) {
    shifts.add(name, amounts.has(kind) ? 'llvm:shift' : 'llvm:extend');
  }
  const mul =
    /\bif \(!getTok\(\)\.getString\(\)\.equals_insensitive\("(\w+)"\) \|\|\s*!\(NextIsVL \|\| NextIsHash\)\)/
      .exec(parserMethod(parser, 'AArch64AsmParser', 'parseOptionalMulOperand'));
  if (shifts.size === 0 || mul === null) {
    throw new Error(`${AARCH64_PARSER}: no shift words, or mul no longer needs an amount`);
  }
  shifts.add(mul[1], 'llvm:shift');
  return shifts;
}

export function armShifts(llvm: Project): Keywords {
  const parser = withoutComments(readSource(llvm, ARM_PARSER));
  const token = section(parser, /\bARMAsmParser::tryParseShiftToken\(\) \{/, /^\}$/m, 'token');
  const register = section(parser, /^int ARMAsmParser::tryParseShiftRegister\(/m, /^\}$/m, 'reg');
  const memory = section(parser, /^bool ARMAsmParser::parseMemRegOffsetShift\(/m, /^\}$/m, 'mem');
  const registerBare = /\bif \(ShiftTy == ARM_AM::(\w+)\) \{/.exec(register);
  const memoryBare = /\bif \(St != ARM_AM::(\w+)\) \{/.exec(memory);
  if (
    !/\bstd::string lowerCase = Tok\.getString\(\)\.lower\(\);/.test(token) ||
    registerBare === null || memoryBare === null
  ) {
    throw new Error(`${ARM_PARSER}: the shift parsers no longer read their words and amounts`);
  }
  const anyCase = new Map<string, string>();
  for (const [, name, kind] of token.matchAll(/\.Case\("(\w+)", ARM_AM::(\w+)\)/g)) {
    anyCase.set(name, kind === registerBare[1] ? 'llvm:extend' : 'llvm:shift');
  }
  const written = new Map<string, { kind: string; spellings: Set<string> }>();
  for (
    const [, test, kind] of memory.matchAll(
      /\(((?:[^()]|\(\))*ShiftName == "[^"]+"[^()]*)\)\s*St = ARM_AM::(\w+);/g,
    )
  ) {
    for (const [, spelling] of test.matchAll(/ShiftName == "(\w+)"/g)) {
      const name = spelling.toLowerCase();
      const known = written.get(name) ?? { kind, spellings: new Set<string>() };
      known.spellings.add(spelling);
      written.set(name, known);
    }
  }
  if (anyCase.size === 0 || written.size === 0) {
    throw new Error(`${ARM_PARSER}: the shift parsers name no word`);
  }
  const shifts = new Keywords();
  for (const [name, role] of anyCase) {
    shifts.add(name, role);
  }
  for (const [name, { kind, spellings }] of written) {
    if (anyCase.has(name)) {
      continue;
    }
    shifts.add(
      name,
      kind === memoryBare[1] ? 'llvm:extend' : 'llvm:shift',
      ...(writtenCases([...spellings], 'llvm', ARM_PARSER).get(name) ?? []),
    );
  }
  return shifts;
}

export function machoSectionTypes(llvm: Project): Keywords {
  const file = 'llvm/lib/MC/MCSectionMachO.cpp';
  const source = withoutComments(readSource(llvm, file));
  if (!/\breturn SectionType == Descriptor\.AssemblerName;/.test(source)) {
    throw new Error(`${file}: section types are no longer compared as written`);
  }
  const names = [
    ...section(source, /\bSectionTypeDescriptors\[[^\]]*\] = \{/, /^\};/m, 'types').matchAll(
      /\{StringLiteral\("(\w*)"\)/g,
    ),
  ].map(([, name]) => name).filter((name) => name !== '');
  if (names.length === 0) {
    throw new Error(`${file}: SectionTypeDescriptors names no type`);
  }
  return writtenNames(names, 'llvm', `${file} SectionTypeDescriptors`);
}

const CPP_FILE = 'clang/lib/Lex/PPDirectives.cpp';
const CPP_UNREAD_HANDLERS = new Set([
  'HandleCXXModuleDirective',
  'HandleCXXImportDirective',
  'HandleIncludeMacrosDirective',
]);

function preprocessorMethod(source: string, name: string): string {
  return section(source, new RegExp(`^void Preprocessor::${name}\\(`, 'm'), /^\}$/m, name);
}

export function cppDirectives(llvm: Project): Keywords {
  const source = withoutComments(readSource(llvm, CPP_FILE));
  const handler = preprocessorMethod(source, 'HandleDirective');
  const open =
    /\bIdentifierInfo \*II = Result\.getIdentifierInfo\(\);\s*if \(!II\) break;\s*switch \(II->getPPKeywordID\(\)\) \{/
      .exec(handler);
  if (open === null) {
    throw new Error(`${CPP_FILE}: HandleDirective no longer switches on the directive word`);
  }
  const cases = bracedBody(handler, open.index + open[0].length - 1);
  if (
    !/\bif \(Introducer\.isModuleContextualKeyword\(\)\)\s*return HandleCXXModuleDirective\(/
      .test(cases) ||
    !/^\s*assert\(getLangOpts\(\)\.CPlusPlusModules\b/.test(
      bracedBody(
        source,
        source.indexOf('{', source.search(/^void Preprocessor::HandleCXXImportDirective\(/m)),
      ),
    ) ||
    !/\bpp_include_macros_out_of_predefines\b/.test(
      preprocessorMethod(source, 'HandleIncludeMacrosDirective'),
    )
  ) {
    throw new Error(`${CPP_FILE}: a word left out of the table may now be a # directive`);
  }
  const directives = new Keywords();
  for (
    const [, labels, code] of cases.matchAll(
      /((?:\bcase tok::pp_\w+:\s*)+)((?:(?!\bcase tok::pp_)[\s\S])*)/g,
    )
  ) {
    const called = /\bcase tok::hash:\s*return (\w+)\(/.exec(code) ?? /\b(Handle\w+)\(/.exec(code);
    const name = called?.[1] ?? 'none';
    if (!CPP_UNREAD_HANDLERS.has(name)) {
      for (const [, word] of labels.matchAll(/\bpp_(\w+):/g)) {
        directives.add(word, `llvm:handler:${name}`);
      }
    }
  }
  if (directives.size === 0) {
    throw new Error(`${CPP_FILE}: HandleDirective names no directive`);
  }
  return directives;
}

export function aarch64PredicateQualifiers(llvm: Project): Keywords {
  const parser = withoutComments(readSource(llvm, AARCH64_PARSER));
  const start = /\bauto Pred = getTok\(\)\.getString\(\)\.lower\(\);/.exec(parser);
  const end = start === null ? -1 : parser.indexOf('CreateToken(ZM', start.index);
  if (start === null || end === -1) {
    throw new Error(`${AARCH64_PARSER}: the predication type is no longer read in any case`);
  }
  return keywordsOf(
    matchedNames(parser.slice(start.index, end), /\bPred != "(\w+)"/g, AARCH64_PARSER),
  );
}

export function aarch64Relocations(llvm: Project): Keywords {
  const file = 'llvm/lib/Target/AArch64/AsmParser/AArch64AsmParser.cpp';
  const body = section(
    withoutComments(readSource(llvm, file)),
    /^bool AArch64AsmParser::parseSymbolicImmVal\(/m,
    /^\}$/m,
    'parseSymbolicImmVal',
  );
  if (
    !/\bstd::string LowerCase = getTok\(\)\.getIdentifier\(\)\.lower\(\);\s*RefKind = StringSwitch<AArch64::Specifier>\(LowerCase\)/
      .test(body)
  ) {
    throw new Error(`${file}: parseSymbolicImmVal no longer reads a relocation in any case`);
  }
  return keywordsOf(matchedNames(body, /\.Case\("(\w+)", AArch64::S_\w+\)/g, file));
}

export function armRelocations(llvm: Project): Keywords {
  const file = 'llvm/lib/Target/ARM/AsmParser/ARMAsmParser.cpp';
  const body = section(
    withoutComments(readSource(llvm, file)),
    /^bool ARMAsmParser::parsePrefix\(/m,
    /^\}$/m,
    'parsePrefix',
  );
  if (!/\breturn PE\.Spelling == IDVal;/.test(body)) {
    throw new Error(`${file}: parsePrefix no longer compares a relocation as written`);
  }
  const relocations = new Keywords();
  for (const name of matchedNames(body, /\{"(\w+)", ARM::S_\w+,/g, file)) {
    relocations.add(name, ...LLVM_LOWER_CASE);
  }
  return relocations;
}

export function armSuffixRelocations(llvm: Project): Keywords {
  const file = 'llvm/lib/Target/ARM/MCTargetDesc/ARMMCAsmInfo.cpp';
  const info = withoutComments(readSource(llvm, file));
  if ([...info.matchAll(/\bUseParensForSpecifier = true;/g)].length === 0) {
    throw new Error(`${file}: no ARM target writes a specifier in parentheses`);
  }
  if (
    !/\bNameToAtSpecifier\.find\(Name\.lower\(\)\)/.test(
      withoutComments(readSource(llvm, 'llvm/lib/MC/MCAsmInfo.cpp')),
    )
  ) {
    throw new Error('llvm/lib/MC/MCAsmInfo.cpp: specifiers are no longer looked up in any case');
  }
  return keywordsOf(
    matchedNames(
      section(info, /\bAtSpecifierDefs\[\] = \{/, /^\};/m, 'AtSpecifierDefs'),
      /\{\{"(\w+)"\}, [\w:]+\}/g,
      file,
    ),
  );
}

function parserMethod(parser: string, owner: string, name: string): string {
  return section(parser, new RegExp(`^bool ${owner}::${name}\\(`, 'm'), /^\}$/m, name);
}

function x86Method(parser: string, name: string): string {
  return parserMethod(parser, 'X86AsmParser', name);
}

export function x86IntelWords(llvm: Project): Keywords {
  const parser = withoutComments(readSource(llvm, X86_PARSER));
  const words = new Keywords();
  const named = x86Method(parser, 'ParseIntelNamedOperator');
  if (
    !/\bif \(Name != Name\.lower\(\) && Name != Name\.upper\(\) &&\s*!getParser\(\)\.isParsingMasm\(\)\)\s*return false;/
      .test(named)
  ) {
    throw new Error(`${X86_PARSER}: ParseIntelNamedOperator no longer rejects mixed case`);
  }
  for (const branch of named.matchAll(/\bName\.equals_insensitive\("(\w+)"\)\) \{/g)) {
    const handler = /\bSM\.(on\w+)\(/.exec(bracedBody(named, branch.index + branch[0].length - 1));
    if (handler === null) {
      throw new Error(`${X86_PARSER}: the named operator "${branch[1]}" calls no handler`);
    }
    words.add(branch[1].toLowerCase(), `llvm:operator:${handler[1]}`, 'llvm:no-mixed-case');
  }
  if (!/\bParser\.isParsingMasm\(\) &&\s*ParseMasmNamedOperator\(/.test(parser)) {
    throw new Error(`${X86_PARSER}: ParseMasmNamedOperator is no longer MASM only`);
  }
  const size = x86Method(parser, 'ParseIntelMemoryOperandSize');
  const ptr =
    /\bif \(!\(Tok\.getString\(\) == "(\w+)" \|\| Tok\.getString\(\) == "(\w+)"\)\)\s*return Error\(/
      .exec(size);
  if (ptr === null || ptr[1].toLowerCase() !== ptr[2].toLowerCase()) {
    throw new Error(
      `${X86_PARSER}: ParseIntelMemoryOperandSize no longer requires one word after a size`,
    );
  }
  words.add(ptr[2].toLowerCase(), 'llvm:ptr', 'llvm:no-mixed-case');
  const sizes = [...size.matchAll(/\.Cases\(\{"(\w+)", "(\w+)"\}, \d+\)/g)];
  if (sizes.length === 0 || sizes.length !== [...size.matchAll(/\.Cases?\(/g)].length) {
    throw new Error(
      `${X86_PARSER}: ParseIntelMemoryOperandSize has a case this reader does not know`,
    );
  }
  for (const [, upper, lower] of sizes) {
    if (upper !== lower.toUpperCase() || lower !== lower.toLowerCase()) {
      throw new Error(`${X86_PARSER}: the size case {"${upper}", "${lower}"} is not one word`);
    }
    words.add(lower, 'llvm:size', 'llvm:no-mixed-case', 'llvm:ptr-follows');
  }
  return words;
}

function identifierChecks(body: string, what: string): string[] {
  const names = [...body.matchAll(/\bgetIdentifier\(\) == "(\w+)"/g)].map(([, name]) => name);
  if (names.length === 0) {
    throw new Error(`${X86_PARSER}: ${what} compares no identifier`);
  }
  return names;
}

export function x86Decorators(llvm: Project): Keywords {
  const parser = withoutComments(readSource(llvm, X86_PARSER));
  const decorators = new Keywords();
  const roundingOp = x86Method(parser, 'ParseRoundingModeOp');
  const rounding = section(
    roundingOp,
    /\bif \(Tok\.getIdentifier\(\)\.starts_with\("\w+"\)\) \{/,
    /\bif \(Tok\.getIdentifier\(\) == "\w+"\)/,
    'the rounding branch of ParseRoundingModeOp',
  );
  const stems = [...rounding.matchAll(/\.Case\("(\w+)", X86::STATIC_ROUNDING::/g)].map(([, s]) =>
    s
  );
  if (stems.length === 0 || !/\bAsmToken::Minus\b/.test(rounding)) {
    throw new Error(`${X86_PARSER}: ParseRoundingModeOp reads no rounding mode before a '-'`);
  }
  const tail = /"(\w+)"/.exec(rounding.slice(rounding.search(/\bAsmToken::Minus\b/)));
  for (const stem of stems) {
    if (tail === null) {
      decorators.add(stem, 'llvm:dashed', ...LLVM_LOWER_CASE);
    } else {
      decorators.add(`${stem}-${tail[1]}`, ...LLVM_LOWER_CASE);
    }
  }
  const afterRounding = roundingOp.slice(roundingOp.indexOf(rounding) + rounding.length);
  for (const name of identifierChecks(afterRounding, 'ParseRoundingModeOp')) {
    decorators.add(name, ...LLVM_LOWER_CASE);
  }
  const operand = x86Method(parser, 'HandleAVX512Operand');
  const broadcasts = [...operand.matchAll(/\.Case\("(\w+)", "\{\1\}"\)/g)];
  if (broadcasts.length === 0) {
    throw new Error(`${X86_PARSER}: HandleAVX512Operand reads no broadcast`);
  }
  for (const [, name] of broadcasts) {
    decorators.add(name, ...LLVM_LOWER_CASE);
  }
  if (!/\bParseZ\(/.test(operand)) {
    throw new Error(`${X86_PARSER}: HandleAVX512Operand no longer reads a zeroing mark`);
  }
  for (const name of identifierChecks(x86Method(parser, 'ParseZ'), 'ParseZ')) {
    decorators.add(name, ...LLVM_LOWER_CASE);
  }
  const flags = /\bTok\.getIdentifier\(\)\.lower\(\) != "(\w+)"\)\s*return Error\(/.exec(
    x86Method(parser, 'parseCFlagsOp'),
  );
  if (flags === null) {
    throw new Error(`${X86_PARSER}: parseCFlagsOp reads no flags decorator`);
  }
  decorators.add(flags[1], 'llvm:flags');
  return decorators;
}

export function x86MaskRegisters(llvm: Project): string[] {
  const file = 'llvm/lib/Target/X86/X86RegisterInfo.td';
  const info = withoutComments(readSource(llvm, file));
  const mask = /\bdef VK1\s*:\s*RegisterClass<[^;]*?\(sequence "(\w+)%u", (\d+), (\d+)\)>/.exec(
    info,
  );
  if (mask === null) {
    throw new Error(`${file}: VK1 is no longer a register sequence`);
  }
  if (
    !/\bgetX86MCRegisterClass\(X86::VK1RegClassID\)\.contains\(RegNo\)/.test(
      x86Method(withoutComments(readSource(llvm, X86_PARSER)), 'HandleAVX512Operand'),
    )
  ) {
    throw new Error(`${X86_PARSER}: HandleAVX512Operand no longer takes VK1 registers as masks`);
  }
  const names: string[] = [];
  for (let number = Number(mask[2]); number <= Number(mask[3]); number++) {
    const register = new RegExp(`\\bdef ${mask[1]}${number}\\s*:\\s*X86Reg<"(\\w+)"`).exec(info);
    if (register === null) {
      throw new Error(`${file}: no register ${mask[1]}${number}`);
    }
    names.push(register[1].toLowerCase());
  }
  return names;
}

function armVectorPredicable(parser: string): (name: string) => boolean {
  const prefixes = stringCases(
    section(parser, /const char \*predicable_prefixes\[\] = \{/, /\};/, 'predicable_prefixes'),
  );
  const special = section(
    parser,
    /if \(MS\.isVPTPredicableCDEInstr\(Mnemonic\) \|\|/,
    /return true;/,
    'the special VPT-predicable mnemonics',
  );
  const rules = [
    ...special.matchAll(/Mnemonic\.starts_with\("(\w+)"\)(?:\s*&&\s*Mnemonic != "(\w+)")?/g),
  ]
    .map(([, prefix, except]) => ({ prefix, except }));
  const cde = /\{([^{}]*)\}\)\s*\{\s*CDE\.insert\(Mnemonic\);\s*CDEWithVPTSuffix\.insert/.exec(
    parser,
  );
  if (rules.length === 0 || cde === null) {
    throw new Error('ARMAsmParser.cpp: cannot read the VPT-predicable rules');
  }
  const cdeNames = new Set(stringCases(cde[1]));
  return (name) =>
    cdeNames.has(name) ||
    rules.some(({ prefix, except }) => name.startsWith(prefix) && name !== except) ||
    prefixes.some((prefix) => name.startsWith(prefix));
}

function withoutGroups(text: string, starts: RegExp): string {
  let output = text;
  for (let match = starts.exec(output); match !== null; match = starts.exec(output)) {
    let depth = 0;
    let end = match.index;
    do {
      depth += output[end] === '(' ? 1 : output[end] === ')' ? -1 : 0;
      end++;
    } while (depth > 0 && end < output.length);
    output = `${output.slice(0, match.index)}false${output.slice(end)}`;
  }
  return output;
}

function armAcceptance(parser: string): {
  carry: Set<string>;
  unpredicable: (name: string) => boolean;
} {
  const body = withoutComments(
    section(
      parser,
      /^void ARMAsmParser::getMnemonicAcceptInfo\(/m,
      /^\}$/m,
      'getMnemonicAcceptInfo',
    ),
  );
  const carry = new Set(
    stringCases(section(body, /CanAcceptCarrySet =/, /;/, 'CanAcceptCarrySet')),
  );
  const never = withoutGroups(
    section(
      body,
      /CanAcceptCarrySet =[^;]*;\s*if \(/,
      /\)\s*\{\s*CanAcceptPredicationCode = false;/,
      'the unpredicable mnemonics',
    ),
    /\((?:has|is|FullInst)\w*\b/g,
  );
  const exact = new Set(
    [...never.matchAll(/Mnemonic == "(\w+)"/g)].map(([, name]) => name),
  );
  const prefixes = [...never.matchAll(/Mnemonic\.starts_with\("(\w+)"\)/g)].map(([, name]) => name);
  if (carry.size === 0 || exact.size === 0) {
    throw new Error('ARMAsmParser.cpp: cannot read getMnemonicAcceptInfo');
  }
  return {
    carry,
    unpredicable: (name) => exact.has(name) || prefixes.some((prefix) => name.startsWith(prefix)),
  };
}

function armInstructions(llvm: Project, inc: string): Keywords {
  const parser = readSource(llvm, 'llvm/lib/Target/ARM/AsmParser/ARMAsmParser.cpp');
  const predicable = armVectorPredicable(parser);
  const acceptance = armAcceptance(parser);
  const table = new Keywords();
  for (const name of namesOf(inc, [0])) {
    const head = name.split('.')[0];
    table.add(
      head,
      ...(acceptance.unpredicable(head) ? [] : ['ARM_CONDITION']),
      ...(acceptance.carry.has(head) ? ['ARM_CARRY'] : []),
      ...(predicable(head) ? ['ARM_VECTOR_CONDITION'] : []),
    );
  }
  return table;
}

function aarch64Conditions(parser: string): string[] {
  const body = section(
    parser,
    /AArch64AsmParser::parseCondCodeString\(StringRef Cond, std::string &Suggestion\) \{/,
    /\.Default\(AArch64CC::Invalid\)/,
    'parseCondCodeString',
  );
  const conditions = stringCases(body).filter((name) => /^[a-z]+$/.test(name));
  if (
    conditions.length === 0 || !/StringSwitch<AArch64CC::CondCode>\(Cond\.lower\(\)\)/.test(body)
  ) {
    throw new Error('AArch64AsmParser.cpp: no condition names read in any case');
  }
  return conditions;
}

function aarch64ParserNames(parser: string): string[] {
  const parse = section(
    parser,
    /^bool AArch64AsmParser::parseInstruction\(/m,
    /^\}$/m,
    'parseInstruction',
  );
  const match = section(
    parser,
    /^bool AArch64AsmParser::matchAndEmitInstruction\(/m,
    /^\}$/m,
    'matchAndEmitInstruction',
  );
  const aliases = section(
    parse,
    /Name = StringSwitch<StringRef>\(Name\.lower\(\)\)/,
    /\.Default\(Name\);/,
    'the branch aliases',
  );
  const code = withoutComments(parse);
  const system: string[] = [];
  for (const call of code.matchAll(/return parseSys\w*Alias\(/g)) {
    const condition = code.slice(code.lastIndexOf('if (', call.index), call.index);
    system.push(...[...condition.matchAll(/Head == "(\w+)"/g)].map(([, name]) => name));
  }
  if (system.length === 0) {
    throw new Error('AArch64AsmParser.cpp: no system instruction aliases');
  }
  return [
    ...[...aliases.matchAll(/\.Case\("(\w+)",/g)].map(([, name]) => name),
    ...system,
    ...[...withoutComments(match).matchAll(/Tok == "(\w+)"/g)].map(([, name]) => name),
  ];
}

function aarch64Signatures(inc: string, parser: string): Signatures {
  const signatures = new Signatures();
  for (const entries of variantEntries(inc).values()) {
    for (const { mnemonic, classes } of entries) {
      let rest = classes;
      while (rest.length > 0 && /^MCK__DOT_\w*$/.test(rest[0])) {
        const bare = rest[0] === 'MCK__DOT_';
        rest = rest.slice(bare && rest[1] === 'MCK_CondCode' ? 2 : 1);
      }
      signatures.add(
        mnemonic,
        rest
          .map((item) =>
            AARCH64_LABEL_CLASS.test(item)
              ? 'L'
              : AARCH64_CONDITION_CLASS.test(item)
              ? 'C'
              : AARCH64_SYSTEM_CLASS.test(item)
              ? 'S'
              : AARCH64_PAIR_CLASS.test(item)
              ? 'OO'
              : 'O'
          )
          .join(''),
      );
    }
  }
  const parse = section(
    parser,
    /^bool AArch64AsmParser::parseInstruction\(/m,
    /^\}$/m,
    'parseInstruction',
  );
  const aliases = section(
    parse,
    /Name = StringSwitch<StringRef>\(Name\.lower\(\)\)/,
    /\.Default\(Name\);/,
    'the branch aliases',
  );
  for (const [, alias, target] of aliases.matchAll(/\.Case\("(\w+)",\s*"([\w.]+)"\)/g)) {
    for (const signature of signatures.get(target) ?? []) {
      signatures.add(alias, signature);
    }
  }
  return signatures;
}

function armLabelInstructions(inc: string): Keywords {
  const table = new Keywords();
  for (const entries of variantEntries(inc).values()) {
    for (const { mnemonic, classes } of entries) {
      if (classes.some((item) => ARM_LABEL_CLASS.test(item))) {
        table.add(mnemonic.split('.')[0]);
      }
    }
  }
  return table;
}

function aarch64Instructions(llvm: Project, inc: string, variants: number[]): Keywords {
  const parser = readSource(llvm, 'llvm/lib/Target/AArch64/AsmParser/AArch64AsmParser.cpp');
  const conditions = aarch64Conditions(parser);
  const conditional = new Set<string>();
  const table = new Keywords();
  const entries = variantEntries(inc);
  const aliases = aliasNames(inc);
  for (const variant of variants) {
    for (const { mnemonic, classes } of entries.get(variant) ?? []) {
      const dots: string[] = [];
      for (const item of classes) {
        const dot = /^MCK__DOT_(\w*)$/.exec(item);
        if (dot === null) {
          break;
        }
        dots.push(dot[1].toLowerCase());
      }
      if (dots.length === 0) {
        table.add(mnemonic);
      } else if (dots[0] === '' && classes[dots.length] === 'MCK_CondCode') {
        conditional.add(mnemonic);
      } else {
        table.add([mnemonic, ...dots].join('.'));
      }
    }
    for (const name of aliases.get(variant) ?? []) {
      table.add(name);
    }
  }
  for (const name of aarch64ParserNames(parser)) {
    table.add(name);
  }
  for (const name of conditional) {
    for (const condition of conditions) {
      table.add(`${name}.${condition}`);
    }
  }
  return table;
}

export function matcherRegisters(inc: string, functionName: string): string[] {
  const body = section(
    inc,
    new RegExp(
      `^(?:\\[\\[maybe_unused\\]\\] )?static MCRegister ${functionName}\\(StringRef Name\\) \\{`,
      'm',
    ),
    /^\}$/m,
    functionName,
  );
  const names = [...body.matchAll(/\breturn \w+::\w+;\s*\/\/ "([^"]+)"/g)].map(([, name]) => name);
  const returns = [...body.matchAll(/\breturn \w+::(?!NoRegister;)\w+;/g)].length;
  if (names.length === 0 || names.length !== returns) {
    throw new Error(`${functionName}: read ${names.length} of ${returns} register names`);
  }
  return names;
}

function x86RegisterAliases(llvm: Project): string[] {
  const file = 'llvm/lib/Target/X86/AsmParser/X86AsmParser.cpp';
  const match = section(
    withoutComments(readSource(llvm, file)),
    /^bool X86AsmParser::MatchRegisterByName\(/m,
    /^\}$/m,
    'MatchRegisterByName',
  );
  const names: string[] = [];
  for (const alias of match.matchAll(/\bRegName\.starts_with\("(\w+)"\)\)\s*\{/g)) {
    const block = bracedBody(match, alias.index + alias[0].length - 1);
    for (const [, register] of block.matchAll(/\bRegNo = X86::[A-Z]+(\d+);/g)) {
      names.push(`${alias[1]}${register}`);
    }
  }
  if (names.length === 0) {
    throw new Error(`${file}: MatchRegisterByName has no register name aliases`);
  }
  return names;
}

export function caseStrings(block: string, what: string): string[] {
  const names = [...block.matchAll(/\.Case\("([^"]+)"/g)].map(([, name]) => name.toLowerCase());
  if (names.length === 0) {
    throw new Error(`${what}: no register names`);
  }
  return names;
}

function aarch64Registers(llvm: Project, inc: string): Keywords {
  const file = 'llvm/lib/Target/AArch64/AsmParser/AArch64AsmParser.cpp';
  const parser = withoutComments(readSource(llvm, file));
  const alias = section(
    parser,
    /^MCRegister AArch64AsmParser::matchRegisterNameAlias\(/m,
    /^\}$/m,
    'matchRegisterNameAlias',
  );
  const registers = new Keywords();
  const step =
    /\(Reg = (\w+)\(Name\)\)\)|Name\.equals_insensitive\("([^"]+)"\)\)|StringSwitch<unsigned>\(Name\.lower\(\)\)([\s\S]*?)\.Default\(0\)\)|return \(?Kind == RegKind::(\w+)/g;
  let names: string[] = [];
  for (const [, matcher, single, cases, kind] of alias.matchAll(step)) {
    if (kind !== undefined) {
      for (const name of names.filter((name) => !registers.has(name))) {
        registers.add(name, `llvm:RegKind::${kind}`);
      }
      names = [];
    } else if (matcher === 'MatchRegisterName') {
      names = matcherRegisters(inc, matcher);
    } else if (matcher !== undefined) {
      names = caseStrings(
        section(
          parser,
          new RegExp(`^static unsigned ${matcher}\\(StringRef Name\\) \\{`, 'm'),
          /^\}$/m,
          matcher,
        ),
        matcher,
      );
    } else {
      names = single !== undefined
        ? [single.toLowerCase()]
        : caseStrings(cases, 'register aliases');
    }
  }
  if (names.length > 0 || registers.size === 0) {
    throw new Error(`${file}: matchRegisterNameAlias names registers without a kind`);
  }
  return registers;
}

function armRegisters(llvm: Project, inc: string): Keywords {
  const file = 'llvm/lib/Target/ARM/AsmParser/ARMAsmParser.cpp';
  const parse = section(
    withoutComments(readSource(llvm, file)),
    /^MCRegister ARMAsmParser::tryParseRegister\(/m,
    /^\}$/m,
    'tryParseRegister',
  );
  return keywordsOf([
    ...matcherRegisters(inc, 'MatchRegisterName'),
    ...caseStrings(parse, `${file}: tryParseRegister`),
  ]);
}

export function lookedUpNames(
  file: string,
  source: string,
  functions: RegExp[],
  tables: string,
): Keywords {
  const registers = new Keywords();
  for (const start of functions) {
    const lookups = [
      ...section(source, start, /^\}$/m, start.source).matchAll(/::lookup(\w+)ByName\(/g),
    ];
    if (lookups.length === 0) {
      throw new Error(`${file}: ${start.source} looks up no names`);
    }
    for (const [, table] of lookups) {
      const list = section(
        tables,
        new RegExp(`^constexpr ${table} ${table}s?List\\[\\] = \\{`, 'm'),
        /^ ?\};/m,
        `${table} table`,
      );
      for (const [, name] of list.matchAll(/\/\* "([^"]+)" \*\//g)) {
        registers.add(name.toLowerCase());
      }
    }
  }
  return registers;
}

function aarch64SystemRegisters(llvm: Project, tables: string): Keywords {
  const file = 'llvm/lib/Target/AArch64/AsmParser/AArch64AsmParser.cpp';
  return lookedUpNames(
    file,
    withoutComments(readSource(llvm, file)),
    [
      /^ParseStatus AArch64AsmParser::tryParseSysReg\(/m,
      /^ParseStatus AArch64AsmParser::tryParseSVCR\(/m,
    ],
    tables,
  );
}

function armSystemRegisters(llvm: Project, tables: string): Keywords {
  const file = 'llvm/lib/Target/ARM/AsmParser/ARMAsmParser.cpp';
  return lookedUpNames(
    file,
    withoutComments(readSource(llvm, file)),
    [
      /^ParseStatus ARMAsmParser::parseMSRMaskOperand\(/m,
      /^ParseStatus ARMAsmParser::parseBankedRegOperand\(/m,
    ],
    tables,
  );
}

export function indexedRegisters(names: string[]): Keywords {
  const registers = new Keywords();
  const indexes = new Map<string, number>();
  for (const name of names) {
    const indexed = /^(\w+)\((\d+)\)$/.exec(name);
    if (indexed === null) {
      registers.add(name);
    } else {
      indexes.set(indexed[1], Math.max(indexes.get(indexed[1]) ?? 0, Number(indexed[2]) + 1));
    }
  }
  for (const [name, count] of indexes) {
    if (!registers.has(name)) {
      throw new Error(`the register matcher indexes ${name}, which it does not name`);
    }
    registers.add(name, `index:${count}`);
  }
  return registers;
}

function keywordsOf(names: string[]): Keywords {
  const table = new Keywords();
  for (const name of names) {
    table.add(name);
  }
  return table;
}

function armConditionSwitch(llvm: Project, name: string): string[] {
  const info = readSource(llvm, 'llvm/lib/Target/ARM/Utils/ARMBaseInfo.h');
  const names = stringCases(
    section(
      info,
      new RegExp(`inline static unsigned ${name}\\(StringRef CC\\) \\{`),
      /\.Default\(/,
      name,
    ),
  );
  if (names.length === 0) {
    throw new Error(`ARMBaseInfo.h: ${name} has no cases`);
  }
  return names;
}

const PLATFORM_PARSERS = ['ELFAsmParser', 'COFFAsmParser', 'DarwinAsmParser'];

function matchedNames(text: string, pattern: RegExp, what: string): string[] {
  const names = [...text.matchAll(pattern)].map(([, name]) => name.toLowerCase());
  if (names.length === 0) {
    throw new Error(`${what}: no name matches ${pattern.source}`);
  }
  return names;
}

function handlerDirectives(llvm: Project, parser: string): string[] {
  const file = `llvm/lib/MC/MCParser/${parser}.cpp`;
  const source = withoutComments(readSource(llvm, file));
  const names = matchedNames(source, /\baddDirectiveHandler<[^>]*>\(\s*"(\.[^"]+)"\s*\)/g, file);
  const calls = [...source.matchAll(/\baddDirectiveHandler</g)].length;
  if (names.length !== calls) {
    throw new Error(`${file}: read ${names.length} of ${calls} addDirectiveHandler calls`);
  }
  return names;
}

function returnedName(llvm: Project, functionName: string): string {
  const directory = join(llvm.path, 'llvm', 'include', 'llvm', 'MC');
  const definition = new RegExp(
    `\\b${functionName}\\(\\)\\s*\\{\\s*return\\s+StringRef\\("(\\.[^"]+)"\\);`,
  );
  const found = readdirSync(directory)
    .filter((name) => name.endsWith('.h'))
    .map((name) => definition.exec(readFileSync(join(directory, name), 'utf8')))
    .find((match) => match !== null);
  if (found === undefined || found === null) {
    throw new Error(`llvm/include/llvm/MC: ${functionName} returns no directive name`);
  }
  return found[1];
}

export function withoutMasmBlocks(source: string): string {
  const guard = /\bif \((?:getParser\(\)|Parser)\.isParsingMasm\(\)\) \{/g;
  let output = source;
  for (let match = guard.exec(output); match !== null; match = guard.exec(output)) {
    const open = match.index + match[0].length - 1;
    output = output.slice(0, match.index) +
      output.slice(open + bracedBody(output, open).length + 2);
    guard.lastIndex = match.index;
  }
  return output;
}

function genericDirectives(llvm: Project): [string, string][] {
  const file = 'llvm/lib/MC/MCParser/AsmParser.cpp';
  const source = withoutComments(readSource(llvm, file));
  const statement = /^bool AsmParser::parseStatement\(/m.exec(source);
  if (statement === null) {
    throw new Error(`${file}: no parseStatement`);
  }
  const rejected = new Set(
    [
      ...bracedBody(source, statement.index).matchAll(
        /((?:case DK_\w+:\s*)+)return (?:TokError|Error)\(/g,
      ),
    ]
      .flatMap(([, cases]) => [...cases.matchAll(/DK_\w+/g)].map(([kind]) => kind)),
  );
  const kinds = [...source.matchAll(/\bDirectiveKindMap\["(\.[^"]+)"\]\s*=\s*(DK_\w+);/g)];
  const keys = [...source.matchAll(/\bDirectiveKindMap\["/g)].length;
  if (kinds.length === 0 || kinds.length !== keys) {
    throw new Error(`${file}: read ${kinds.length} of ${keys} DirectiveKindMap entries`);
  }
  return kinds
    .filter(([, , kind]) => !rejected.has(kind))
    .map(([, name, kind]): [string, string] => [name.toLowerCase(), kind]);
}

function targetDirectives(llvm: Project, target: Target): string[] {
  const file = `llvm/lib/Target/${target}/AsmParser/${target}AsmParser.cpp`;
  const source = withoutMasmBlocks(withoutComments(readSource(llvm, file)));
  const exact = new Set([
    ...[...source.matchAll(/\bIDVal(?:\s*==\s*|\.equals_insensitive\()"(\.[^"]+)"/g)].map((
      [, name],
    ) => name),
    ...[...source.matchAll(/\bIDVal\s*==\s*(\w+)\(\)/g)].map(([, name]) =>
      returnedName(llvm, name)
    ),
    ...[...source.matchAll(/\baddAliasForDirective\(\s*"(\.[^"]+)"/g)].map(([, name]) => name),
    ...[...source.matchAll(/\bgetIdentifier\(\)\.lower\(\)\s*==\s*"(\.[^"]+)"/g)].map(([, name]) =>
      name
    ),
  ]);
  const prefixes = [...source.matchAll(/\bIDVal\.starts_with\("(\.[^"]+)"\)/g)]
    .map(([, prefix]) => prefix)
    .filter((prefix) => ![...exact].some((name) => name !== prefix && name.startsWith(prefix)));
  const names = [...exact, ...prefixes].map((name) => name.toLowerCase());
  if (names.length === 0) {
    throw new Error(`${file}: no directive names`);
  }
  return names;
}

function directivesOf(
  llvm: Project,
  target: Target,
  generic: [string, string][],
  platform: string[],
): Keywords {
  const lfi = existsSync(
    join(llvm.path, 'llvm', 'lib', 'Target', target, 'MCTargetDesc', `${target}MCLFIRewriter.cpp`),
  );
  const directives = keywordsOf([
    ...platform,
    ...targetDirectives(llvm, target),
    ...(lfi ? handlerDirectives(llvm, 'LFIAsmParser') : []),
  ]);
  for (const [name, kind] of generic) {
    directives.add(name, `llvm:${kind}`);
  }
  return directives;
}

export function readLlvm(llvm: Project): LlvmTables {
  const tool = tablegen(llvm);
  const inc = Object.fromEntries(
    TARGETS.map((target) => [target, matcher(llvm, tool, target)]),
  ) as Record<Target, string>;
  const x86 = x86Instructions(llvm, inc.X86);
  const aarch64Parser = readSource(llvm, 'llvm/lib/Target/AArch64/AsmParser/AArch64AsmParser.cpp');
  const generic = genericDirectives(llvm);
  const platform = PLATFORM_PARSERS.flatMap((parser) => handlerDirectives(llvm, parser));
  const x86Registers = indexedRegisters([
    ...matcherRegisters(inc.X86, 'MatchRegisterName'),
    ...x86RegisterAliases(llvm),
  ]);
  for (const name of x86MaskRegisters(llvm)) {
    if (!x86Registers.has(name)) {
      throw new Error(`the mask register ${name} is not in the X86 register matcher`);
    }
    x86Registers.add(name, 'llvm:VK1');
  }
  return {
    x86Directives: directivesOf(llvm, 'X86', generic, platform),
    aarch64Directives: directivesOf(llvm, 'AArch64', generic, platform),
    armDirectives: directivesOf(llvm, 'ARM', generic, platform),
    x86Registers,
    x86EncodingSuffixes: x86EncodingSuffixes(llvm),
    x86SyntaxWords: x86SyntaxWords(llvm),
    x86IntelWords: x86IntelWords(llvm),
    x86Decorators: x86Decorators(llvm),
    aarch64Relocations: aarch64Relocations(llvm),
    armRelocations: armRelocations(llvm),
    armSuffixRelocations: armSuffixRelocations(llvm),
    aarch64Shifts: aarch64Shifts(llvm),
    armShifts: armShifts(llvm),
    aarch64PredicateQualifiers: aarch64PredicateQualifiers(llvm),
    machoSectionTypes: machoSectionTypes(llvm),
    cppDirectives: cppDirectives(llvm),
    aarch64Registers: aarch64Registers(llvm, inc.AArch64),
    armRegisters: armRegisters(llvm, inc.ARM),
    aarch64SystemRegisters: aarch64SystemRegisters(llvm, searchableTables(llvm, tool, 'AArch64')),
    armSystemRegisters: armSystemRegisters(llvm, searchableTables(llvm, tool, 'ARM')),
    x86Instructions: x86,
    x86FlagsInstructions: x86FlagsInstructions(llvm, x86),
    x86DefaultFlags: x86DefaultFlags(llvm),
    aarch64Signatures: aarch64Signatures(inc.AArch64, aarch64Parser),
    armLabelInstructions: armLabelInstructions(inc.ARM),
    ...x86Prefixes(llvm),
    armInstructions: armInstructions(llvm, inc.ARM),
    aarch64Instructions: aarch64Instructions(llvm, inc.AArch64, [0]),
    aarch64AppleInstructions: aarch64Instructions(llvm, inc.AArch64, [0, 1]),
    armConditions: keywordsOf(armConditionSwitch(llvm, 'ARMCondCodeFromString')),
    armVectorConditions: keywordsOf(armConditionSwitch(llvm, 'ARMVectorCondCodeFromString')),
    aarch64Conditions: keywordsOf(
      aarch64Conditions(readSource(llvm, 'llvm/lib/Target/AArch64/AsmParser/AArch64AsmParser.cpp')),
    ),
  };
}
