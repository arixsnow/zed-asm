// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';

import {
  aarch64PredicateQualifiers,
  aarch64Relocations,
  aarch64Shifts,
  aarch64Signature,
  armRelocations,
  armShifts,
  armSignature,
  armSuffixRelocations,
  globMatches,
  machoSectionTypes,
  objectFormats,
  pseudoOps,
  shellCaseArms,
  unescapeC,
  x86Decorators,
  x86DefaultFlags,
  x86EncodingSuffixes,
  x86IntelWords,
  x86PrefixNames,
  x86Registers,
  x86SyntaxWords,
} from '../../scripts/lib/keywords/binutils.ts';
import { assertThrowsIncluding } from '../lib/assert.ts';
import { sourceTree, testReaders } from '../lib/keyword-sources.ts';

const LOWER = ['binutils:no-mixed-case', 'binutils:no-upper-case'];
const TC_I386 = 'gas/config/tc-i386.c';
const TC_I386_INTEL = 'gas/config/tc-i386-intel.c';
const TC_AARCH64 = 'gas/config/tc-aarch64.c';
const TC_ARM = 'gas/config/tc-arm.c';
const MACH_O = 'bfd/mach-o.c';
const AARCH64_H = 'include/opcode/aarch64.h';
const AARCH64_OPC = 'opcodes/aarch64-opc.c';
const REGISTERS = 'opcodes/i386-reg.tbl';

const FLAG_CHECK = `
check_Scc_OszcOperations (const char *l)
{
  if (dot_insn ())
    {
      if (strncasecmp (suffix_string, "scc", 3) == 0)
        return true;
    }
  if (strncasecmp (suffix_string, "dfv", 3) == 0)
    {
      suffix_string += 3;
      if (*suffix_string == '=')
        suffix_string++;
    }
  if (strncasecmp (suffix_string, "of", 2) == 0)
    return true;
  if (strncasecmp (suffix_string, "CF", 2) == 0)
    return true;
}
`;

const VECTOR_OPERATIONS = `
static const struct RC_name RC_NamesTable[] =
{
  {  rne, STRING_COMMA_LEN ("rn-sae") },
  {  saeonly, STRING_COMMA_LEN ("sae") },
};

check_VecOperations (char *op_string)
{
  if (startswith (op_string, "1to"))
    {
      unsigned int bcst_type;

      if (op_string[3] == '8')
        bcst_type = 8;
      else if (op_string[3] == '1')
        bcst_type = 16;
      else
        {
          as_bad (_("Unsupported broadcast"));
          return NULL;
        }
    }
  else if (*op_string == 'z')
    {
      if (!i.mask.reg)
        return NULL;
    }
}
`;

const INTEL_SOURCE = `
static const struct
{
  const char *name;
}
const i386_operators[] =
  {
    { "and", O_bit_and, 2 },
    { "not", O_bit_not, 1 },
    { NULL, O_illegal, 0 }
  };

static const struct
{
  const char *name;
}
const i386_types[] =
  {
#define I386_TYPE(t, n) { #t, O_##t##_ptr, { n, n, n } }
    I386_TYPE(byte, 1),
    I386_TYPE(word, 2),
#undef I386_TYPE
    { "near", O_near_ptr, { 0xff04, 2, 0xff08 } },
    { NULL, O_illegal, { 0, 0, 0 } }
  };

operatorT i386_operator (const char *name, unsigned int operands, char *pc)
{
  if (strcasecmp (pname, "ptr") == 0)
    return O_ptr;
  if (strcasecmp (pname, "bcst") == 0)
    return O_bcst;
}
`;

const SHIFT_KINDS = `
enum aarch64_modifier_kind
{
  AARCH64_MOD_NONE,
  AARCH64_MOD_LSL,
  AARCH64_MOD_UXTB,
  AARCH64_MOD_SXTX,
  AARCH64_MOD_MUL,
  AARCH64_MOD_MUL_VL,
};
`;

const SHIFT_NAMES = `
const struct aarch64_name_value_pair aarch64_operand_modifiers [] =
{
  {"none", 0x0},
  {"lsl", 0x0},
  {"uxtb", 0x0},
  {"sxtx", 0x7},
  {"mul", 0x0},
  {"mul vl", 0x0},
};

aarch64_extend_operator_p (enum aarch64_modifier_kind kind)
{
  return kind > AARCH64_MOD_LSL && kind <= AARCH64_MOD_SXTX;
}
`;

const ARM_SHIFT_SOURCE = `
static const struct asm_shift_name shift_names [] =
{
  { "asl", SHIFT_LSL },  { "ASL", SHIFT_LSL },
  { "rrx", SHIFT_RRX },  { "RRX", SHIFT_RRX },
  { "uxtw", SHIFT_UXTW }
};

parse_shift (char **str, int i, enum parse_shift_mode mode)
{
  shift_name = str_hash_find_n (arm_shift_hsh, *str, p - *str);
  if (shift != SHIFT_RRX)
    {
      skip_whitespace (p);
    }
}
`;

const MACH_O_SOURCE = `
static const bfd_mach_o_xlat_name bfd_mach_o_section_type_name[] =
{
  { "regular", BFD_MACH_O_S_REGULAR},
  { "4byte_literals", BFD_MACH_O_S_4BYTE_LITERALS},
  { NULL, 0}
};

bfd_mach_o_get_section_type_from_name (bfd *abfd, const char *name)
{
  if (strcmp (x->name, name) == 0)
    return x->val;
}
`;

const REGISTER_TABLE = `// A comment
al, Class=Reg|Instance=Accum|Byte, 0, 0, Dw2Inval, Dw2Inval
k1, Class=RegMask, 0, 1, 94, 119
flat, Class=SReg, 0, RegFlat, Dw2Inval, Dw2Inval
st, Class=RegFP|Instance=Accum|Tbyte, 0, 0, 11, 33
st(1), Class=RegFP|Tbyte, 0, 1, 12, 34
`;

const ENCODING_BRANCHES = `if (mnem_p - 2 == dot_p && dot_p[1] == 's')
    return 1;
  else if (mnem_p - 3 == dot_p
           && dot_p[1] == 'd'
           && dot_p[2] == '8')
    return 2;`;

const SYNTAX_BRANCHES = `if (strcmp (string, "prefix") == 0)
    ask_naked_reg = 1;
  else if (strcmp (string, "noprefix") == 0)
    ask_naked_reg = -1;`;

testReaders('binutils', [
  {
    name: 'x86EncodingSuffixes',
    read: x86EncodingSuffixes,
    files: { [TC_I386]: `parse_insn (void)\n{\n  ${ENCODING_BRANCHES}\n}\n` },
    expected: [['.d8', []], ['.s', []]],
    breakages: [
      {
        file: TC_I386,
        from: ENCODING_BRANCHES,
        to: 'return 0;',
        stops: 'parse_insn reads no suffix after a dot',
      },
      {
        file: TC_I386,
        from: 'mnem_p - 3 == dot_p',
        to: 'mnem_p - 4 == dot_p',
        stops: 'the suffix .d8 does not take 4 characters',
      },
    ],
  },
  {
    name: 'x86SyntaxWords',
    read: x86SyntaxWords,
    files: { [TC_I386]: `set_intel_syntax (int syntax_flag)\n{\n  ${SYNTAX_BRANCHES}\n}\n` },
    expected: [
      ['noprefix', ['binutils:naked:-1', ...LOWER]],
      ['prefix', ['binutils:naked:1', ...LOWER]],
    ],
    breakages: [
      {
        file: TC_I386,
        from: SYNTAX_BRANCHES,
        to: 'ask_naked_reg = 0;',
        stops: 'set_intel_syntax no longer compares a word as written',
      },
    ],
  },
  {
    name: 'x86DefaultFlags',
    read: x86DefaultFlags,
    files: { [TC_I386]: FLAG_CHECK },
    expected: [['cf', []], ['of', []]],
  },
  {
    name: 'x86IntelWords',
    read: x86IntelWords,
    files: { [TC_I386_INTEL]: INTEL_SOURCE },
    expected: [
      ['and', ['binutils:operator:O_bit_and:2']],
      ['bcst', ['binutils:ptr']],
      ['byte', ['binutils:type']],
      ['near', ['binutils:type']],
      ['not', ['binutils:operator:O_bit_not:1']],
      ['ptr', ['binutils:ptr']],
      ['word', ['binutils:type']],
    ],
    breakages: [
      {
        file: TC_I386_INTEL,
        from: '{ "and", O_bit_and, 2 },\n    { "not", O_bit_not, 1 },',
        to: '',
        stops: 'no binutils:operator: word',
      },
      {
        file: TC_I386_INTEL,
        from: 'I386_TYPE(byte, 1),\n    I386_TYPE(word, 2),\n#undef I386_TYPE\n' +
          '    { "near", O_near_ptr, { 0xff04, 2, 0xff08 } },',
        to: '',
        stops: 'no binutils:type word',
      },
      {
        file: TC_I386_INTEL,
        from: 'if (strcasecmp (pname, "ptr") == 0)\n    return O_ptr;\n' +
          '  if (strcasecmp (pname, "bcst") == 0)\n    return O_bcst;',
        to: '',
        stops: 'i386_operator reads no word after a size',
      },
    ],
  },
  {
    name: 'x86Decorators',
    read: x86Decorators,
    files: { [TC_I386]: `${VECTOR_OPERATIONS}${FLAG_CHECK}` },
    expected: [
      ['1to16', LOWER],
      ['1to8', LOWER],
      ['dfv', ['binutils:flags']],
      ['rn-sae', LOWER],
      ['sae', LOWER],
      ['z', LOWER],
    ],
    breakages: [
      {
        file: TC_I386,
        from: '{  rne, STRING_COMMA_LEN ("rn-sae") },\n  {  saeonly, STRING_COMMA_LEN ("sae") },',
        to: '',
        stops: 'RC_NamesTable is empty',
      },
      {
        file: TC_I386,
        from: 'unsigned int bcst_type;',
        to: 'int other;',
        stops: 'check_VecOperations reads no broadcast',
      },
      {
        file: TC_I386,
        from: "bcst_type = 8;\n      else if (op_string[3] == '1')\n        bcst_type = 16;",
        to: 'return NULL;',
        stops: 'the broadcast chain of check_VecOperations sets no count',
      },
      {
        file: TC_I386,
        from: 'if (!i.mask.reg)',
        to: 'if (other)',
        stops: 'check_VecOperations reads no zeroing-masking letter',
      },
      {
        file: TC_I386,
        from: 'if (dot_insn ())',
        to: 'if (other)',
        stops: 'check_Scc_OszcOperations has no .insn branch',
      },
      {
        file: TC_I386,
        from: "if (*suffix_string == '=')",
        to: 'if (other)',
        stops: "check_Scc_OszcOperations reads 0 words before '='",
      },
    ],
  },
  {
    name: 'aarch64Relocations',
    read: aarch64Relocations,
    files: {
      [TC_AARCH64]: `
static struct reloc_table_entry reloc_table[] =
{
  {"lo12", 0, 0, 0},
  {"got_lo12", 0, 0, 0},
};
static int f (void)
{
  if (strncasecmp (reloc_table[i].name, *str, length) == 0)
    return 1;
}
`,
    },
    expected: [['got_lo12', []], ['lo12', []]],
    breakages: [
      {
        file: TC_AARCH64,
        from: 'strncasecmp (reloc_table[i].name, *str, length) == 0',
        to: 'strcmp (reloc_table[i].name, *str) == 0',
        stops: 'find_reloc_table_entry no longer reads a name in any case',
      },
      {
        file: TC_AARCH64,
        from: '{"lo12", 0, 0, 0},\n  {"got_lo12", 0, 0, 0},',
        to: '',
        stops: 'reloc_table is empty',
      },
    ],
  },
  {
    name: 'armRelocations',
    read: armRelocations,
    files: {
      [TC_ARM]: `
static struct group_reloc_table_entry group_reloc_table[] =
  {
    { "alu", BFD_RELOC_ARM_ALU_PC_G0_NC },
  };
static int f (void)
{
  if (strncasecmp (group_reloc_table[i].name, *str, length) == 0)
    return 1;
}
parse_half (char **str)
{
  if (strncasecmp (p, ":lower16:", 9) == 0)
    return 1;
  if (strncasecmp (p, ":upper16:", 9) == 0)
    return 2;
}
`,
    },
    expected: [['alu', []], ['lower16', []], ['upper16', []]],
    breakages: [
      {
        file: TC_ARM,
        from: 'strncasecmp (group_reloc_table[i].name, *str, length) == 0',
        to: 'other',
        stops: 'find_group_reloc_table_entry no longer reads a name in any case',
      },
      {
        file: TC_ARM,
        from: 'if (strncasecmp (p, ":lower16:", 9) == 0)\n    return 1;\n' +
          '  if (strncasecmp (p, ":upper16:", 9) == 0)\n    return 2;',
        to: '',
        stops: 'parse_half reads no relocation',
      },
    ],
  },
  {
    name: 'armSuffixRelocations',
    read: armSuffixRelocations,
    files: {
      [TC_ARM]: `
static struct reloc_entry reloc_names[] =
{
  { "got", BFD_RELOC_ARM_GOT32 }, { "GOT", BFD_RELOC_ARM_GOT32 },
  { "plt", BFD_RELOC_ARM_PLT32 },
};
static int f (void)
{
  str_hash_find_n (arm_reloc_hsh, p, q - p);
}
`,
    },
    expected: [['got', ['binutils:no-mixed-case']], ['plt', LOWER]],
    breakages: [
      {
        file: TC_ARM,
        from: 'str_hash_find_n (arm_reloc_hsh, p, q - p)',
        to: 'other (p)',
        stops: 'parse_reloc no longer looks a name up as written',
      },
      {
        file: TC_ARM,
        from: '{ "plt", BFD_RELOC_ARM_PLT32 }',
        to: '{ "Plt", BFD_RELOC_ARM_PLT32 }',
        stops: '"Plt" is spelled in mixed case',
      },
    ],
  },
  {
    name: 'machoSectionTypes',
    read: machoSectionTypes,
    files: { [MACH_O]: MACH_O_SOURCE },
    expected: [['4byte_literals', LOWER], ['regular', LOWER]],
    breakages: [
      {
        file: MACH_O,
        from: 'strcmp (x->name, name) == 0',
        to: 'strcasecmp (x->name, name) == 0',
        stops: 'section types are no longer looked up as written',
      },
    ],
  },
  {
    name: 'aarch64Shifts',
    read: aarch64Shifts,
    files: {
      [AARCH64_H]: SHIFT_KINDS,
      [AARCH64_OPC]: SHIFT_NAMES,
      [TC_AARCH64]: 'checked_hash_insert (aarch64_shift_hsh, get_upper_str (name), x);\n',
    },
    expected: [
      ['lsl', ['binutils:no-mixed-case', 'binutils:shift']],
      ['mul', ['binutils:no-mixed-case', 'binutils:shift']],
      ['sxtx', ['binutils:extend', 'binutils:no-mixed-case']],
      ['uxtb', ['binutils:extend', 'binutils:no-mixed-case']],
    ],
    breakages: [
      {
        file: AARCH64_H,
        from: '  AARCH64_MOD_MUL_VL,\n',
        to: '',
        stops: 'the modifier kinds no longer index aarch64_operand_modifiers',
      },
      {
        file: AARCH64_OPC,
        from: 'return kind > AARCH64_MOD_LSL && kind <= AARCH64_MOD_SXTX;',
        to: 'return false;',
        stops: 'aarch64_extend_operator_p is no longer a kind range',
      },
      {
        file: TC_AARCH64,
        from: 'get_upper_str (name)',
        to: 'name',
        stops: 'modifiers are no longer hashed in lower and upper case',
      },
    ],
  },
  {
    name: 'armShifts',
    read: armShifts,
    files: { [TC_ARM]: ARM_SHIFT_SOURCE },
    expected: [
      ['asl', ['binutils:no-mixed-case', 'binutils:shift']],
      ['rrx', ['binutils:extend', 'binutils:no-mixed-case']],
      ['uxtw', ['binutils:no-mixed-case', 'binutils:no-upper-case', 'binutils:shift']],
    ],
    breakages: [
      {
        file: TC_ARM,
        from: 'if (shift != SHIFT_RRX)',
        to: 'if (other)',
        stops: 'parse_shift no longer reads a written shift and its amount',
      },
      {
        file: TC_ARM,
        from: 'str_hash_find_n (arm_shift_hsh, *str, p - *str)',
        to: 'other (p)',
        stops: 'parse_shift no longer reads a written shift and its amount',
      },
      {
        file: TC_ARM,
        from: `  { "asl", SHIFT_LSL },  { "ASL", SHIFT_LSL },
  { "rrx", SHIFT_RRX },  { "RRX", SHIFT_RRX },
  { "uxtw", SHIFT_UXTW }
`,
        to: '',
        stops: 'shift_names is empty',
      },
    ],
  },
  {
    name: 'aarch64PredicateQualifiers',
    read: aarch64PredicateQualifiers,
    files: {
      [TC_AARCH64]: `
parse_predication_for_operand (struct vector_type_el *parsed_type, char **str)
{
  switch (TOLOWER (*ptr))
    {
    case 'z':
      break;
    case 'm':
      break;
    }
}
`,
    },
    expected: [['m', []], ['z', []]],
    breakages: [
      {
        file: TC_AARCH64,
        from: 'switch (TOLOWER (*ptr))',
        to: 'switch (*ptr)',
        stops: 'parse_predication_for_operand reads no letter in any case',
      },
    ],
  },
  {
    name: 'x86Registers',
    read: x86Registers,
    files: { [REGISTERS]: REGISTER_TABLE },
    expected: [
      ['al', []],
      ['flat', ['binutils:RegFlat']],
      ['k1', ['binutils:RegMask']],
      ['st', ['index:2']],
    ],
    breakages: [
      {
        file: REGISTERS,
        from: 'flat, Class=SReg, 0, RegFlat, Dw2Inval, Dw2Inval',
        to: 'flat, Class=SReg, 0, RegFlat, Dw2Inval',
        stops: 'unexpected register row "flat, Class=SReg, 0, RegFlat, Dw2Inval"',
      },
      {
        file: REGISTERS,
        from: 'st, Class=RegFP|Instance=Accum|Tbyte',
        to: 'st, Class=RegFP|Tbyte',
        stops: '0 stack top registers instead of one',
      },
    ],
  },
]);

test('x86DefaultFlags stops when the check names no flag', () => {
  const tree = sourceTree('binutils-no-flags', {
    [TC_I386]: 'check_Scc_OszcOperations (const char *l)\n{\n  return false;\n}\n',
  });
  assertThrowsIncluding(() => x86DefaultFlags(tree), 'check_Scc_OszcOperations names no flag');
});

test('x86PrefixNames reads the words and the braced form of the prefix rows', () => {
  const file = 'opcodes/i386-opc.tbl';
  const prefixes = (scratch: string, table: string) =>
    x86PrefixNames(sourceTree(`binutils-prefixes-${scratch}`, { [file]: table }));
  assert.deepStrictEqual(
    prefixes('plain', 'lock, 0xf0, 0, IsPrefix\nadd, 0x00, 0, Modrm\n'),
    { literal: new Set(['lock']), pseudo: false },
  );
  assert.deepStrictEqual(
    prefixes('braced', 'rep.lock, 0xf3, 0, IsPrefix\n{<pseudo>}, 0x0, 0, IsPrefix\n'),
    { literal: new Set(['rep.lock']), pseudo: true },
  );
  assertThrowsIncluding(
    () => prefixes('bad', 'L{ock, 0xf0, 0, IsPrefix\n'),
    'unexpected prefix entry "L{ock"',
  );
});

test('shellCaseArms reads patterns and bodies, keeping nested cases in a body', () => {
  const text = `
  a*-*-linux* | \\
  b-*-*)  fmt=elf ;;
  c-*-*)  case x in
            y) fmt=coff ;;
          esac ;;
  d-*-*)  ;;
`;
  assert.deepStrictEqual(shellCaseArms(text, 'it'), [
    { patterns: ['a*-*-linux*', 'b-*-*'], body: '  fmt=elf ' },
    {
      patterns: ['c-*-*'],
      body: '  case x in\n            y) fmt=coff ;;\n          esac ',
    },
    { patterns: ['d-*-*'], body: '  ' },
  ]);
});

test('shellCaseArms stops on an arm it cannot read', () => {
  assertThrowsIncluding(() => shellCaseArms('a) fmt=elf\n', 'it'), 'it: an arm does not end');
  assertThrowsIncluding(() => shellCaseArms('a$b) x ;;\n', 'it'), 'it: unexpected arm pattern');
  assertThrowsIncluding(() => shellCaseArms('a) x ;;\nb\n', 'it'), 'it: text after the last arm');
});

test('globMatches takes the whole word and shell wildcards only', () => {
  const rows: [string, string, boolean][] = [
    ['arm*', 'armv7', true],
    ['arm*', 'xarm', false],
    ['i?86', 'i386', true],
    ['i?86', 'i86', false],
    ['[!a]rm', 'brm', true],
    ['[!a]rm', 'arm', false],
    ['[ab]rm', 'brm', true],
    ['a.b', 'a.b', true],
    ['a.b', 'axb', false],
    ['a+b', 'a+b', true],
    ['*', 'anything', true],
  ];
  for (const [glob, word, expected] of rows) {
    assert.strictEqual(globMatches(glob, word), expected, `${glob} on ${word}`);
  }
});

const CONFIGURE = 'gas/configure.tgt';

function formats(scratch: string, arms: string, cpu: string): Set<string> {
  return objectFormats(
    sourceTree(`binutils-formats-${scratch}`, {
      [CONFIGURE]: `# A comment\ncase \${generic_target} in\n${arms}esac\n`,
    }),
    cpu,
  );
}

test('objectFormats reads the formats of a cpu, leaving the any-cpu arms out', () => {
  const arms = `  arm-*-elf*)      fmt=elf ;;
  arm-*-pe*)       fmt=coff em=pe ;;
  aarch64-*-*)     fmt=macho
    case x in
      y) ;;
    esac ;;
  *-*-other*)      fmt=aout ;;
`;
  assert.deepStrictEqual(formats('arm', arms, 'arm'), new Set(['elf', 'coff']));
  assert.deepStrictEqual(formats('aarch64', arms, 'aarch64'), new Set(['macho']));
});

test('objectFormats stops on a cpu without a format and on ECOFF', () => {
  assertThrowsIncluding(
    () => formats('none', '  arm-*-*)  fmt=elf ;;\n', 'x86'),
    'no object format for x86',
  );
  assertThrowsIncluding(
    () => formats('ecoff', '  arm-*-*)  fmt=ecoff ;;\n', 'arm'),
    'arm builds ECOFF',
  );
  assertThrowsIncluding(
    () => formats('multi', '  arm-*-*)  fmt=multi ;;\n', 'arm'),
    'arm builds ECOFF',
  );
});

const PSEUDO_FILE = 'gas/config/tc-x.c';
const PSEUDO_TABLE = `
const pseudo_typeS md_pseudo_table[] =
{
#ifdef X
  {"word", cons, 2},
#endif
  // A comment
  SEH_CMDS
  {"skip" "x", s_space, 0},
  {NULL, NULL, 0}
};
`;

test('pseudoOps reads each row, expanding macros and leaving preprocessor lines out', () => {
  const tree = sourceTree('binutils-pseudo', { [PSEUDO_FILE]: PSEUDO_TABLE });
  assert.deepStrictEqual(
    pseudoOps(
      tree,
      PSEUDO_FILE,
      'md_pseudo_table',
      new Map([['SEH_CMDS', '{"seh", s_seh, 1},']]),
    ),
    [
      { name: 'word', handler: 'cons', argument: '2' },
      { name: 'seh', handler: 's_seh', argument: '1' },
      { name: 'skipx', handler: 's_space', argument: '0' },
    ],
  );
});

test('pseudoOps stops on a missing table or a row it cannot read', () => {
  const tree = sourceTree('binutils-pseudo-bad', {
    [PSEUDO_FILE]: 'const pseudo_typeS md_pseudo_table[] =\n{\n  {"word", cons},\n};\n',
  });
  assertThrowsIncluding(() => pseudoOps(tree, PSEUDO_FILE, 'other'), 'no other');
  assertThrowsIncluding(
    () => pseudoOps(tree, PSEUDO_FILE, 'md_pseudo_table'),
    'is not a name, a handler and an argument',
  );
});

test('unescapeC reads named and octal escapes and stops on any other', () => {
  assert.strictEqual(unescapeC('a\\tb\\n'), 'a\tb\n');
  assert.strictEqual(unescapeC('\\157p\\"\\\\'), 'op"\\');
  assertThrowsIncluding(() => unescapeC('\\q'), 'unexpected escape \\q');
});

test('aarch64Signature reads one slot per operand, leaving the rest out', () => {
  assert.strictEqual(
    aarch64Signature(
      '{ AARCH64_OPND_Rd, AARCH64_OPND_ADDR_PCREL19, AARCH64_OPND_NIL }, { AARCH64_OPND_QLF_X }',
    ),
    'OL',
  );
  assert.strictEqual(aarch64Signature('{ AARCH64_OPND_COND, AARCH64_OPND_SYSREG }'), 'CS');
  assert.strictEqual(aarch64Signature('{ AARCH64_OPND_NIL }'), '');
});

test('armSignature reads one slot per operand, in lower case when optional', () => {
  assert.strictEqual(armSignature('{OP_oRR, OP_EXP, OP_stop}'), 'oL');
  assert.strictEqual(armSignature('{OP_RR, OP_COND}'), 'OC');
  assert.strictEqual(armSignature('{OP_wPSR, OP_RR}'), 'SO');
  assert.strictEqual(armSignature('{OP_stop}'), '');
});
