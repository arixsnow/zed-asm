// SPDX-License-Identifier: MIT

import type { PreprocessorStructure } from './nasm.ts';
import { Keywords } from './source.ts';

export interface Shaped {
  keywords: Keywords;
  role: (word: string) => string;
}

const GENERIC_DIRECTIVE = 'GENERIC_DIRECTIVE';
const PREPROC_DIRECTIVE = 'PREPROC_DIRECTIVE';

const LLVM_CONDITIONS = [
  'IF',
  'IFEQ',
  'IFGE',
  'IFGT',
  'IFLE',
  'IFLT',
  'IFNE',
  'IFB',
  'IFNB',
  'IFC',
  'IFEQS',
  'IFNC',
  'IFNES',
  'IFDEF',
  'IFNDEF',
  'IFNOTDEF',
];

const GNU_SEMANTIC_SHAPES = new Map<string, string>([
  ...['s_if', 's_ifb', 's_ifc', 's_ifdef', 's_ifeqs'].map((handler): [string, string] => [
    `binutils:${handler}`,
    'IF_OPEN',
  ]),
  ['binutils:s_elseif', 'ELSEIF'],
  ['binutils:s_else', 'ELSE'],
  ['binutils:s_endif', 'CONDITIONAL_CLOSE'],
  ['binutils:s_macro', 'MACRO_OPEN'],
  ['binutils:s_bad_end:0', 'MACRO_CLOSE'],
  ['binutils:s_bad_end:1', 'REPEAT_CLOSE'],
  ['binutils:s_rept', 'REPT_OPEN'],
  ['binutils:s_irp:0', 'IRP_OPEN'],
  ['binutils:s_irp:1', 'IRPC_OPEN'],
  ['binutils:float_cons', 'FLOAT_DATA_DIRECTIVE'],
  ['binutils:s_float_space', 'FLOAT_SPACE_DIRECTIVE'],
  ...['SINGLE', 'FLOAT', 'DC_S', 'DOUBLE', 'DC_D'].map((kind): [string, string] => [
    `llvm:DK_${kind}`,
    'FLOAT_DATA_DIRECTIVE',
  ]),
  ['llvm:DK_DCB_S', 'FLOAT_SPACE_DIRECTIVE'],
  ['llvm:DK_DCB_D', 'FLOAT_SPACE_DIRECTIVE'],
  ...LLVM_CONDITIONS.map((kind): [string, string] => [`llvm:DK_${kind}`, 'IF_OPEN']),
  ['llvm:DK_ELSEIF', 'ELSEIF'],
  ['llvm:DK_ELSE', 'ELSE'],
  ['llvm:DK_ENDIF', 'CONDITIONAL_CLOSE'],
  ['llvm:DK_MACRO', 'MACRO_OPEN'],
  ['llvm:DK_ENDM', 'MACRO_CLOSE'],
  ['llvm:DK_ENDMACRO', 'MACRO_CLOSE'],
  ['llvm:DK_REPT', 'REPT_OPEN'],
  ['llvm:DK_IRP', 'IRP_OPEN'],
  ['llvm:DK_IRPC', 'IRPC_OPEN'],
  ['llvm:DK_ENDR', 'REPEAT_CLOSE'],
]);

export type GnuTable = 'x86' | 'arm' | 'apple';

const GNU_WORD_SHAPES: { tables: GnuTable[]; shape: string; words: string[] }[] = [
  { tables: ['x86'], shape: 'ATT_SYNTAX', words: ['.att_syntax'] },
  { tables: ['x86'], shape: 'INTEL_SYNTAX', words: ['.intel_syntax'] },
  { tables: ['x86', 'arm', 'apple'], shape: 'BLANK_SEPARATED_DIRECTIVE', words: ['.file', '.loc'] },
  { tables: ['apple'], shape: 'LINKER_HINT_DIRECTIVE', words: ['.loh'] },
  { tables: ['arm', 'apple'], shape: 'REGISTER_ALIAS_WORD', words: ['.req'] },
  { tables: ['arm'], shape: 'NEON_ALIAS_WORD', words: ['.dn', '.qn'] },
  {
    tables: ['arm', 'apple'],
    shape: 'CFI_REGISTER_DIRECTIVE',
    words: [
      '.cfi_def_cfa',
      '.cfi_def_cfa_register',
      '.cfi_llvm_def_aspace_cfa',
      '.cfi_llvm_register_pair',
      '.cfi_llvm_vector_offset',
      '.cfi_llvm_vector_register_mask',
      '.cfi_llvm_vector_registers',
      '.cfi_offset',
      '.cfi_register',
      '.cfi_rel_offset',
      '.cfi_restore',
      '.cfi_return_column',
      '.cfi_same_value',
      '.cfi_undefined',
      '.cfi_val_encoded_addr',
      '.cfi_val_offset',
    ],
  },
  {
    tables: ['arm'],
    shape: 'UNWIND_REGISTER_DIRECTIVE',
    words: [
      '.movsp',
      '.save',
      '.seh_save_any_reg',
      '.seh_save_any_reg_p',
      '.seh_save_any_reg_px',
      '.seh_save_any_reg_x',
      '.seh_save_freg',
      '.seh_save_fregs',
      '.seh_save_freg_x',
      '.seh_save_fregp',
      '.seh_save_fregp_x',
      '.seh_save_lrpair',
      '.seh_save_preg',
      '.seh_save_reg',
      '.seh_save_reg_x',
      '.seh_save_regp',
      '.seh_save_regp_x',
      '.seh_save_regs',
      '.seh_save_regs_w',
      '.seh_save_sp',
      '.seh_save_zreg',
      '.setfp',
      '.vsave',
    ],
  },
];

const GNU_WORD_FLAGS = new Map<string, string[]>([
  ['.req', ['WORD_NAMES_ASSIGNMENT']],
  ['.dn', ['WORD_NAMES_ASSIGNMENT']],
  ['.qn', ['WORD_NAMES_ASSIGNMENT']],
]);

const NASM_CONDITION_TAILS = new Map<string, 'expression' | 'raw' | 'macro'>([
  ['', 'expression'],
  ['ctx', 'expression'],
  ['def', 'expression'],
  ['defalias', 'expression'],
  ['env', 'expression'],
  ['file', 'expression'],
  ['usable', 'expression'],
  ['using', 'expression'],
  ['difi', 'raw'],
  ['directive', 'raw'],
  ['empty', 'raw'],
  ['id', 'raw'],
  ['idn', 'raw'],
  ['idni', 'raw'],
  ['num', 'raw'],
  ['str', 'raw'],
  ['token', 'raw'],
  ['macro', 'macro'],
]);

const NASM_CONDITION_SHAPES: Record<string, Record<'expression' | 'raw' | 'macro', string>> = {
  if: { expression: 'IF_OPEN', raw: 'IF_RAW_OPEN', macro: 'IF_MACRO_OPEN' },
  elif: { expression: 'ELSEIF', raw: 'ELSEIF_RAW', macro: 'ELSEIF_MACRO' },
};

const NASM_PREPROCESSOR_SHAPES = new Map<string, string>([
  ['%else', 'ELSE'],
  ['%endif', 'CONDITIONAL_CLOSE'],
  ['%macro', 'MACRO_OPEN'],
  ['%rmacro', 'MACRO_OPEN'],
  ['%endmacro', 'MACRO_CLOSE'],
  ['%endm', 'MACRO_CLOSE'],
  ['%rep', 'REPT_OPEN'],
  ['%endrep', 'REPEAT_CLOSE'],
  ['%assign', 'PREPROC_ASSIGN'],
  ['%pathsearch', 'PREPROC_ASSIGN'],
  ['%define', 'PREPROC_DEFINE'],
  ['%xdefine', 'PREPROC_DEFINE'],
  ['%include', 'PREPROC_INCLUDE'],
  ['%depend', 'PREPROC_INCLUDE'],
  ['%unmacro', 'PREPROC_MACRO'],
  ...['%defalias', '%defstr', '%deftok', '%strcat', '%strlen', '%substr'].map(
    (word): [string, string] => [word, 'PREPROC_SET'],
  ),
]);

const NASM_WORD_SHAPES = new Map<string, string>([
  ['section', 'SECTION_DIRECTIVE'],
  ['segment', 'SECTION_DIRECTIVE'],
  ['extern', 'DECLARATION_DIRECTIVE'],
  ['global', 'DECLARATION_DIRECTIVE'],
  ['required', 'DECLARATION_DIRECTIVE'],
  ['static', 'DECLARATION_DIRECTIVE'],
  ['common', 'COMMON_DIRECTIVE'],
  ['align', 'ALIGN_DIRECTIVE'],
  ['alignb', 'ALIGN_DIRECTIVE'],
  ['use16', 'USE_DIRECTIVE'],
  ['use32', 'USE_DIRECTIVE'],
  ['use64', 'USE_DIRECTIVE'],
  ['struc', 'STRUC_OPEN'],
  ['endstruc', 'STRUC_CLOSE'],
  ['istruc', 'ISTRUC_OPEN'],
  ['iend', 'ISTRUC_CLOSE'],
  ['at', 'AT_WORD'],
  ...['debug', 'dollarhex', 'list', 'map', 'warning'].map((word): [string, string] => [
    word,
    'BRACKET_DIRECTIVE',
  ]),
]);

const NASM_LABELLED_WORDS = new Set(['struc', 'endstruc', 'istruc', 'iend', 'at']);

const NASM_WORD_OVERRIDES = new Map<string, { shape: string; flags: string[] }>([
  ['equ', { shape: 'EQU', flags: ['WORD_NAMES_ASSIGNMENT'] }],
]);

function shapedTable(
  names: Keywords,
  shape: (word: string, tags: string[]) => [string, string[]],
): Shaped {
  const keywords = new Keywords();
  const roles = new Map<string, string>();
  for (const [word, tags] of names.entries()) {
    const [role, flags] = shape(word, tags);
    keywords.add(word, ...flags);
    roles.set(word, role);
  }
  return { keywords, role: (word) => roles.get(word) ?? GENERIC_DIRECTIVE };
}

export function gnuDirectives(names: Keywords, table: GnuTable): Shaped {
  return shapedTable(names, (word, tags) => {
    const shapes = new Set<string>();
    for (const { tables, shape, words } of GNU_WORD_SHAPES) {
      if (tables.includes(table) && words.includes(word)) {
        shapes.add(shape);
      }
    }
    for (const tag of tags) {
      const shape = GNU_SEMANTIC_SHAPES.get(tag);
      if (shape !== undefined) {
        shapes.add(shape);
      }
    }
    if (shapes.size > 1) {
      throw new Error(`${word} has the conflicting shapes ${[...shapes].join(', ')}`);
    }
    return [[...shapes][0] ?? GENERIC_DIRECTIVE, GNU_WORD_FLAGS.get(word) ?? []];
  });
}

function nasmPreprocessorShape(word: string, structure: PreprocessorStructure): string {
  const condition = structure.conditions.get(word);
  if (condition !== undefined) {
    const kind = NASM_CONDITION_TAILS.get(condition.tail);
    const stem = NASM_CONDITION_SHAPES[condition.stem];
    if (kind === undefined || stem === undefined) {
      throw new Error(`${word}: the condition %${condition.stem}*${condition.tail} has no shape`);
    }
    return stem[kind];
  }
  return NASM_PREPROCESSOR_SHAPES.get(structure.casePairs.get(word) ?? word) ?? PREPROC_DIRECTIVE;
}

const REGISTER_RESTRICTION_TAGS = new Map<string, string>([
  ['binutils:RegFlat', 'REGISTER_INTEL'],
  ['binutils:psr_field', 'REGISTER_LOWER_SUFFIX'],
]);

const REGISTER_SUFFIX_TAGS = new Map<string, string>([
  ['binutils:REG_TYPE_V', 'REGISTER_ARRANGED'],
  ['llvm:RegKind::NeonVector', 'REGISTER_ARRANGED'],
  ...['Z', 'P', 'PN', 'ZA'].map((type): [string, string] => [
    `binutils:REG_TYPE_${type}`,
    'REGISTER_ELEMENT',
  ]),
  ...['SVEDataVector', 'SVEPredicateVector', 'SVEPredicateAsCounter', 'Matrix'].map((
    kind,
  ): [string, string] => [`llvm:RegKind::${kind}`, 'REGISTER_ELEMENT']),
  ['binutils:arm_typed_reg_parse', 'REGISTER_TYPED'],
  ['binutils:apsr_bits', 'REGISTER_APSR_BITS'],
  ['binutils:apsr_flags', 'REGISTER_APSR_FLAGS'],
]);

const REGISTER_CLASS_TAGS = new Map<string, string>([
  ['binutils:RegMask', 'REGISTER_MASK'],
  ['llvm:VK1', 'REGISTER_MASK'],
  ['nasm:TFLAG_BRC_OPT', 'REGISTER_MASK'],
]);

function mapped(tags: string[], table: Map<string, string>): Set<string> {
  return new Set(tags.map((tag) => table.get(tag)).filter((flag) => flag !== undefined));
}

function narrowed(known: Set<string> | undefined, next: Set<string>): Set<string> {
  return known === undefined ? next : new Set([...known].filter((flag) => next.has(flag)));
}

function caseFlags(tags: string[]): Set<string> {
  return new Set(
    tags.map((tag) => /^\w+:no-(lower|upper|mixed)-case$/.exec(tag))
      .filter((match) => match !== null)
      .map((match) => `CASE_NO_${match[1].toUpperCase()}`),
  );
}

export interface PrefixSource {
  plain?: Keywords;
  braced?: Keywords;
  intel?: Keywords;
}

export function prefixes(sources: PrefixSource[]): Keywords {
  const allowed = new Map<string, Set<string>>();
  const intelOnly = new Map<string, boolean>();
  for (const { plain, braced, intel } of sources) {
    for (const [word] of plain?.entries() ?? []) {
      allowed.set(word, new Set([...(allowed.get(word) ?? []), 'PREFIX_PLAIN']));
      intelOnly.set(word, (intelOnly.get(word) ?? true) && (intel?.has(word) ?? false));
    }
    for (const [word] of braced?.entries() ?? []) {
      allowed.set(word, new Set([...(allowed.get(word) ?? []), 'PREFIX_BRACED']));
    }
  }
  const keywords = new Keywords();
  for (const [word, flags] of allowed) {
    keywords.add(word, ...flags, ...(intelOnly.get(word) === true ? ['PREFIX_INTEL'] : []));
  }
  return keywords;
}

export function registers(sources: Keywords[]): Shaped {
  const indexes = new Map<string, number>();
  const restrictions = new Map<string, Set<string>>();
  const suffixes = new Map<string, Set<string>>();
  for (const source of sources) {
    for (const [word, tags] of source.entries()) {
      const count = Math.max(
        0,
        ...tags.map((tag) => /^index:(\d+)$/.exec(tag)).filter((match) => match !== null)
          .map((match) => Number(match[1])),
      );
      indexes.set(word, Math.max(indexes.get(word) ?? 0, count));
      restrictions.set(
        word,
        narrowed(restrictions.get(word), mapped(tags, REGISTER_RESTRICTION_TAGS)),
      );
      const suffix = word.includes('.') ? [] : mapped(tags, REGISTER_SUFFIX_TAGS);
      suffixes.set(
        word,
        new Set([...(suffixes.get(word) ?? []), ...suffix, ...mapped(tags, REGISTER_CLASS_TAGS)]),
      );
    }
  }
  const keywords = new Keywords();
  for (const [word, flags] of restrictions) {
    keywords.add(word, ...flags, ...(suffixes.get(word) ?? []));
  }
  return { keywords, role: (word) => String(indexes.get(word) ?? 0) };
}

const BINUTILS_OPERATOR_ROLES = new Map<string, string>([
  ['O_bit_and', 'INTEL_BITWISE_WORD'],
  ['O_bit_inclusive_or', 'INTEL_BITWISE_WORD'],
  ['O_bit_exclusive_or', 'INTEL_BITWISE_WORD'],
  ...['O_eq', 'O_ne', 'O_lt', 'O_le', 'O_gt', 'O_ge'].map((code): [string, string] => [
    code,
    'INTEL_COMPARISON_WORD',
  ]),
  ['O_modulus', 'INTEL_MULTIPLICATIVE_WORD'],
  ['O_left_shift', 'INTEL_MULTIPLICATIVE_WORD'],
  ['O_right_shift', 'INTEL_MULTIPLICATIVE_WORD'],
  ['O_bit_not', 'INTEL_UNARY_WORD'],
  ['O_offset', 'INTEL_UNARY_WORD'],
  ['O_short', 'INTEL_UNARY_WORD'],
]);

const LLVM_OPERATOR_ROLES = new Map<string, string>([
  ['onNot', 'INTEL_UNARY_WORD'],
  ['onOffset', 'INTEL_UNARY_WORD'],
  ['onImagerel', 'INTEL_UNARY_WORD'],
  ['onOr', 'INTEL_BITWISE_WORD'],
  ['onXor', 'INTEL_BITWISE_WORD'],
  ['onAnd', 'INTEL_BITWISE_WORD'],
  ['onLShift', 'INTEL_MULTIPLICATIVE_WORD'],
  ['onRShift', 'INTEL_MULTIPLICATIVE_WORD'],
  ['onMod', 'INTEL_MULTIPLICATIVE_WORD'],
]);

const INTEL_WORD_ROLES = new Map<string, string>([
  ['binutils:type', 'INTEL_TYPE_WORD'],
  ['binutils:ptr', 'INTEL_PTR_WORD'],
  ['llvm:size', 'INTEL_TYPE_WORD'],
  ['llvm:ptr', 'INTEL_PTR_WORD'],
]);

const INTEL_WORD_RESTRICTION_TAGS = new Map<string, string>([
  ['llvm:ptr-follows', 'WORD_PTR_FOLLOWS'],
]);

function intelRole(word: string, tag: string): string | undefined {
  const binutils = /^binutils:operator:(\w+):(\d)$/.exec(tag);
  if (binutils !== null) {
    const role = BINUTILS_OPERATOR_ROLES.get(binutils[1]);
    if (role === undefined || (role === 'INTEL_UNARY_WORD') !== (binutils[2] === '1')) {
      throw new Error(`${word}: the binutils operator ${binutils[1]}/${binutils[2]} has no role`);
    }
    return role;
  }
  const llvm = /^llvm:operator:(\w+)$/.exec(tag);
  if (llvm !== null) {
    const role = LLVM_OPERATOR_ROLES.get(llvm[1]);
    if (role === undefined) {
      throw new Error(`${word}: the LLVM operator handler ${llvm[1]} has no role`);
    }
    return role;
  }
  return INTEL_WORD_ROLES.get(tag);
}

function singleRoles(
  sources: Keywords[],
  role: (word: string, tag: string) => string | undefined,
  restrictionTags: Map<string, string>,
): Shaped {
  const roles = new Map<string, string>();
  const restrictions = new Map<string, Set<string>>();
  for (const source of sources) {
    for (const [word, tags] of source.entries()) {
      const found = new Set(
        tags.map((tag) => role(word, tag)).filter((name) => name !== undefined),
      );
      const known = roles.get(word);
      if (known !== undefined) {
        found.add(known);
      }
      if (found.size !== 1) {
        throw new Error(`${word} has the roles ${[...found].join(', ') || 'none'}`);
      }
      roles.set(word, [...found][0]);
      restrictions.set(
        word,
        narrowed(
          restrictions.get(word),
          new Set([...mapped(tags, restrictionTags), ...caseFlags(tags)]),
        ),
      );
    }
  }
  const keywords = new Keywords();
  for (const [word, flags] of restrictions) {
    keywords.add(word, ...flags);
  }
  return { keywords, role: (word) => roles.get(word) ?? '' };
}

export function intelWords(sources: Keywords[]): Shaped {
  return singleRoles(sources, intelRole, INTEL_WORD_RESTRICTION_TAGS);
}

const SYNTAX_WORD_ROLES = new Map<string, string>([
  ['binutils:naked:1', 'SYNTAX_PREFIX'],
  ['binutils:naked:-1', 'SYNTAX_NOPREFIX'],
  ['llvm:syntax:att', 'SYNTAX_PREFIX'],
  ['llvm:syntax:intel', 'SYNTAX_NOPREFIX'],
]);

export function syntaxWords(sources: Keywords[]): Shaped {
  return singleRoles(sources, (_word, tag) => SYNTAX_WORD_ROLES.get(tag), new Map());
}

const NASM_TOKEN_ROLES = new Map<string, string>([
  ['TOKEN_SIZE', 'INTEL_TYPE_WORD'],
  ['TOKEN_SEG', 'INTEL_UNARY_WORD'],
  ['TOKEN_STRFUNC', 'INTEL_UNARY_WORD'],
  ['TOKEN_IFUNC', 'INTEL_UNARY_WORD'],
  ['TOKEN_WRT', 'WRT_WORD'],
  ['TOKEN_FLOAT', 'FLOAT_SPECIAL'],
  ['TOKEN_FLOATIZE', 'FLOAT_OPERATOR_WORD'],
  ['TOKEN_MASM_PTR', 'MEMORY_OPEN_WORD'],
  ['TOKEN_MASM_FLAT', 'REGISTER'],
]);

const NASM_SPECIAL_ROLES = new Map<string, string>([
  ['S_ABS', 'ABSOLUTE_WORD'],
  ['S_REL', 'ADDRESS_WORD'],
  ['S_NOSPLIT', 'ADDRESS_WORD'],
  ['S_FAR', 'INTEL_TYPE_WORD'],
  ['S_NEAR', 'INTEL_TYPE_WORD'],
  ['S_SHORT', 'INTEL_TYPE_WORD'],
  ['S_STRICT', 'STRICT_WORD'],
  ['S_TO', 'TO_WORD'],
]);

const NASM_SYMBOL_FLAGS = new Map<string, string | undefined>([
  ['nasm:flag:TFLAG_DUP', 'DUP_WORD'],
  ['nasm:flag:TFLAG_WARN', undefined],
]);

export function nasmOperandWords(words: Keywords): Shaped {
  const keywords = new Keywords();
  const roles = new Map<string, string>();
  for (const [word, tags] of words.entries()) {
    const type = tags.find((tag) => tag.startsWith('nasm:token:'))?.slice('nasm:token:'.length);
    const value = tags.find((tag) => tag.startsWith('nasm:value:'))?.slice('nasm:value:'.length);
    if (type === 'TOKEN_ID') {
      const flags = tags.filter((tag) => tag.startsWith('nasm:flag:'));
      if (flags.length !== 1 || !NASM_SYMBOL_FLAGS.has(flags[0])) {
        throw new Error(`${word}: the symbol token flags ${flags.join(', ')} have no shape`);
      }
      const role = NASM_SYMBOL_FLAGS.get(flags[0]);
      if (role !== undefined) {
        keywords.add(word);
        roles.set(word, role);
      }
      continue;
    }
    const role = type === 'TOKEN_SPECIAL'
      ? NASM_SPECIAL_ROLES.get(value ?? '')
      : NASM_TOKEN_ROLES.get(type ?? '');
    if (role === undefined) {
      throw new Error(`${word}: the nasm token ${type} ${value} has no shape`);
    }
    keywords.add(word, 'WORD_RESERVED');
    roles.set(word, role);
  }
  return { keywords, role: (word) => roles.get(word) ?? '' };
}

const DECORATOR_TAGS = new Map<string, string>([
  ['llvm:dashed', 'DECORATOR_DASHED'],
  ['binutils:flags', 'DECORATOR_FLAGS'],
  ['llvm:flags', 'DECORATOR_FLAGS'],
  ['nasm:flags', 'DECORATOR_FLAGS'],
]);

function flaggedNames(sources: Keywords[], allowanceTags: Map<string, string>): Keywords {
  const allowances = new Map<string, Set<string>>();
  const restrictions = new Map<string, Set<string>>();
  for (const source of sources) {
    for (const [word, tags] of source.entries()) {
      allowances.set(
        word,
        new Set([...(allowances.get(word) ?? []), ...mapped(tags, allowanceTags)]),
      );
      restrictions.set(word, narrowed(restrictions.get(word), caseFlags(tags)));
    }
  }
  const keywords = new Keywords();
  for (const [word, flags] of restrictions) {
    keywords.add(word, ...(allowances.get(word) ?? []), ...flags);
  }
  return keywords;
}

export function decorators(sources: Keywords[]): Keywords {
  return flaggedNames(sources, DECORATOR_TAGS);
}

export function caseNames(sources: Keywords[]): Keywords {
  return flaggedNames(sources, new Map());
}

export function shiftWords(sources: Keywords[]): Shaped {
  const roles = new Map<string, string>();
  for (const source of sources) {
    for (const [word, tags] of source.entries()) {
      const extend = tags.some((tag) => /^\w+:extend$/.test(tag));
      if (!extend && !tags.some((tag) => /^\w+:shift$/.test(tag))) {
        throw new Error(`the shift word ${word} is neither a shift nor an extend`);
      }
      roles.set(word, extend || roles.get(word) === 'EXTEND_WORD' ? 'EXTEND_WORD' : 'SHIFT_WORD');
    }
  }
  return { keywords: caseNames(sources), role: (word) => roles.get(word) ?? '' };
}

const CPP_SHAPES = new Map<string, string>([
  ['HandleIfDirective', 'PREPROC_CONDITION'],
  ['HandleElifFamilyDirective:elif', 'PREPROC_CONDITION'],
  ['HandleDefineDirective', 'PREPROC_DEFINE'],
  ...[
    'HandleIncludeDirective',
    'HandleIncludeNextDirective',
    'HandleImportDirective',
    'HandleEmbedDirective',
  ].map((handler): [string, string] => [handler, 'PREPROC_INCLUDE']),
  ...[
    'HandleIfdefDirective',
    'HandleElifFamilyDirective:elifdef',
    'HandleElifFamilyDirective:elifndef',
    'HandleElseDirective',
    'HandleEndifDirective',
    'HandleUndefDirective',
    'HandleLineDirective',
    'HandleUserDiagnosticDirective',
    'HandlePragmaDirective',
    'HandleIdentSCCSDirective',
    'HandleMacroPublicDirective',
    'HandleMacroPrivateDirective',
    'none:assert',
    'none:unassert',
  ].map((handler): [string, string] => [handler, PREPROC_DIRECTIVE]),
]);

export function cppDirectives(names: Keywords): Shaped {
  return shapedTable(names, (word, tags) => {
    const handler = tags.find((tag) => tag.startsWith('llvm:handler:'))?.slice(
      'llvm:handler:'.length,
    );
    const shape = CPP_SHAPES.get(`${handler}:${word}`) ?? CPP_SHAPES.get(handler ?? '');
    if (shape === undefined) {
      throw new Error(`#${word}: the handler ${handler} has no shape`);
    }
    return [shape, []];
  });
}

export function nasmDirectives(names: Keywords, structure: PreprocessorStructure): Shaped {
  return shapedTable(names, (word, tags) => {
    if (word.startsWith('%')) {
      return [nasmPreprocessorShape(word, structure), []];
    }
    const override = NASM_WORD_OVERRIDES.get(word);
    if (override !== undefined) {
      return [override.shape, override.flags];
    }
    const flags = new Set<string>();
    let shape = NASM_WORD_SHAPES.get(word) ?? GENERIC_DIRECTIVE;
    if (tags.includes('nasm:section:pseudo_ops')) {
      shape = 'DATA_DIRECTIVE';
      flags.add('WORD_NAMES_LABEL');
    }
    if (tags.includes('nasm:token:TOKEN_TIMES')) {
      shape = 'TIMES';
      flags.add('WORD_RESERVED').add('WORD_NAMES_LABEL');
    }
    if (NASM_LABELLED_WORDS.has(word)) {
      flags.add('WORD_NAMES_LABEL');
    }
    if (
      (tags.includes('nasm:standard-macro') || tags.includes('yasm:standard-macro')) &&
      !tags.some((tag) => /^\w+:no-parameters$/.test(tag))
    ) {
      flags.add('WORD_RESERVED');
    }
    return [shape, [...flags]];
  });
}
