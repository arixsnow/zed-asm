// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';

import {
    aarch64PredicateQualifiers,
    aarch64Relocations,
    aarch64Shifts,
    aliasNames,
    armRelocations,
    armShifts,
    armSuffixRelocations,
    caseStrings,
    cppDirectives,
    indexedRegisters,
    lookedUpNames,
    machoSectionTypes,
    matcherRegisters,
    variantEntries,
    withoutMasmBlocks,
    x86Decorators,
    x86EncodingSuffixes,
    x86IntelWords,
    x86MaskRegisters,
    x86SyntaxWords,
} from '../../scripts/lib/keywords/llvm.ts';
import { assertThrowsIncluding } from '../lib/assert.ts';
import { sourceTree, testReaders } from '../lib/keyword-sources.ts';

const LOWER = ['llvm:no-mixed-case', 'llvm:no-upper-case'];
const CPP = 'clang/lib/Lex/PPDirectives.cpp';
const X86_PARSER = 'llvm/lib/Target/X86/AsmParser/X86AsmParser.cpp';
const X86_REGISTERS = 'llvm/lib/Target/X86/X86RegisterInfo.td';
const AARCH64_PARSER = 'llvm/lib/Target/AArch64/AsmParser/AArch64AsmParser.cpp';
const ARM_PARSER = 'llvm/lib/Target/ARM/AsmParser/ARMAsmParser.cpp';
const ARM_ASM_INFO = 'llvm/lib/Target/ARM/MCTargetDesc/ARMMCAsmInfo.cpp';
const ASM_INFO = 'llvm/lib/MC/MCAsmInfo.cpp';
const MACH_O = 'llvm/lib/MC/MCSectionMachO.cpp';

const CPP_SOURCE = `
void Preprocessor::HandleDirective(Token &Result) {
  Token Introducer = Result;
  if (ArgMacro) {
    if (IdentifierInfo *II = Result.getIdentifierInfo()) {
      switch (II->getPPKeywordID()) {
      case tok::pp_embedded:
        Diag(Result, diag::err_embedded_directive);
        return;
      default:
        break;
      }
    }
  }
  switch (Result.getKind()) {
  default:
    IdentifierInfo *II = Result.getIdentifierInfo();
    if (!II) break; // Not an identifier.

    // Ask what the preprocessor keyword ID is.
    switch (II->getPPKeywordID()) {
    default: break;
    case tok::pp_if:
      return HandleIfDirective(Result, Introducer, false);
    case tok::pp_elif:
    case tok::pp_elifdef:
      return HandleElifFamilyDirective(Result, Introducer, II->getPPKeywordID());
    case tok::pp_module:
    case tok::pp___preprocessed_module:
      if (Introducer.isModuleContextualKeyword())
        return HandleCXXModuleDirective(Result);
      break;
    case tok::pp___preprocessed_import:
      return HandleCXXImportDirective(Result);
    case tok::pp_import:
      switch (Introducer.getKind()) {
      case tok::hash:
        return HandleImportDirective(Introducer.getLocation(), Result);
      case tok::at:
        return HandleObjCImportDirective(Introducer, Result);
      default:
        llvm_unreachable("not a valid import directive");
      }
    case tok::pp___include_macros:
      return HandleIncludeMacrosDirective(Introducer.getLocation(), Result);
    case tok::pp_warning:
      if (LangOpts.CPlusPlus)
        Diag(Result, diag::ext_pp_warning_directive);
      return HandleUserDiagnosticDirective(Result, true);
    case tok::pp_assert:
      //isExtension = true;  // FIXME: implement #assert
      break;
    case tok::pp___public_macro:
      if (getLangOpts().Modules)
        return HandleMacroPublicDirective(Result);
      break;
    }
    break;
  }
}

void Preprocessor::HandleIncludeMacrosDirective(SourceLocation HashLoc, Token &Tok) {
  Diag(Tok.getLocation(), diag::pp_include_macros_out_of_predefines);
}

void Preprocessor::HandleCXXImportDirective(Token ImportTok) {
  assert(getLangOpts().CPlusPlusModules && ImportTok.is(tok::kw_import));
}
`;

const INTEL_SOURCE = `
bool X86AsmParser::ParseIntelNamedOperator(StringRef Name, IntelExprStateMachine &SM) {
  if (Name != Name.lower() && Name != Name.upper() &&
      !getParser().isParsingMasm())
    return false;
  if (Name.equals_insensitive("not")) {
    SM.onNot();
  } else if (Name.equals_insensitive("OR")) {
    SM.onOr();
  } else {
    return false;
  }
  return true;
}

bool X86AsmParser::ParseIntelMemoryOperandSize(unsigned &Size, StringRef *SizeStr) {
  Size = StringSwitch<unsigned>(Tok.getString())
             .Cases({"BYTE", "byte"}, 8)
             .Cases({"FLOAT", "float"}, 32)
             .Default(0);
  if (Size) {
    if (!(Tok.getString() == "PTR" || Tok.getString() == "ptr"))
      return Error(Tok.getLoc(), "Expected a word");
  }
  return false;
}

bool X86AsmParser::ParseIntelExpression(IntelExprStateMachine &SM, SMLoc &End) {
  if (Parser.isParsingMasm() &&
      ParseMasmNamedOperator(Identifier, SM, ParseError, End))
    return false;
  return false;
}
`;

const DECORATOR_SOURCE = `
bool X86AsmParser::ParseRoundingModeOp(SMLoc Start, OperandVector &Operands) {
  if (Tok.getIdentifier().starts_with("r")) {
    int rndMode = StringSwitch<int>(Tok.getIdentifier())
                      .Case("rn", X86::STATIC_ROUNDING::TO_NEAREST_INT)
                      .Case("rd", X86::STATIC_ROUNDING::TO_NEG_INF)
                      .Default(-1);
    if (!getLexer().is(AsmToken::Minus))
      return Error(Tok.getLoc(), "Expected - at this point");
  }
  if (Tok.getIdentifier() == "sae") {
    return false;
  }
  return Error(Tok.getLoc(), "unknown token in expression");
}

bool X86AsmParser::HandleAVX512Operand(OperandVector &Operands) {
  const char *BroadcastPrimitive =
      StringSwitch<const char *>(getLexer().getTok().getIdentifier())
          .Case("1to8", "{1to8}")
          .Case("1to16", "{1to16}")
          .Default(nullptr);
  if (ParseZ(Z, consumedToken))
    return true;
  if (!getX86MCRegisterClass(X86::VK1RegClassID).contains(RegNo))
    return Error(StartLoc, "Expected a mask");
  return false;
}

bool X86AsmParser::ParseZ(std::unique_ptr<X86Operand> &Z, const SMLoc &StartLoc) {
  if (getLexer().getTok().getIdentifier() == "z")
    return false;
  return true;
}

bool X86AsmParser::parseCFlagsOp(OperandVector &Operands) {
  if (Tok.getIdentifier().lower() != "dfv")
    return Error(Tok.getLoc(), "Expected a word");
  return false;
}
`;

const AARCH64_SHIFT_SOURCE = `
ParseStatus
AArch64AsmParser::tryParseOptionalShiftExtend(OperandVector &Operands) {
  std::string LowerID = Tok.getString().lower();
  AArch64_AM::ShiftExtendType ShOp =
      StringSwitch<AArch64_AM::ShiftExtendType>(LowerID)
          .Case("lsl", AArch64_AM::LSL)
          .Case("ror", AArch64_AM::ROR)
          .Case("uxtb", AArch64_AM::UXTB)
          .Default(AArch64_AM::InvalidShiftExtend);
  if (!Hash && getLexer().isNot(AsmToken::Integer)) {
    if (ShOp == AArch64_AM::LSL || ShOp == AArch64_AM::ROR) {
      return TokError("expected #imm after shift specifier");
    }
  }
}

bool AArch64AsmParser::parseOptionalMulOperand(OperandVector &Operands) {
  if (!getTok().getString().equals_insensitive("mul") ||
      !(NextIsVL || NextIsHash))
    return true;
  return false;
}
`;

const ARM_SHIFT_SOURCE = `
ARM_AM::ShiftOpc ARMAsmParser::tryParseShiftToken() {
  std::string lowerCase = Tok.getString().lower();
  return StringSwitch<ARM_AM::ShiftOpc>(lowerCase)
      .Case("asl", ARM_AM::lsl)
      .Case("rrx", ARM_AM::rrx)
      .Default(ARM_AM::no_shift);
}

int ARMAsmParser::tryParseShiftRegister(OperandVector &Operands) {
  if (ShiftTy == ARM_AM::rrx) {
    return 0;
  }
  return 1;
}

bool ARMAsmParser::parseMemRegOffsetShift(ARM_AM::ShiftOpc &St, unsigned &Amount) {
  StringRef ShiftName = Tok.getString();
  if (ShiftName == "lsl" || ShiftName == "LSL" || ShiftName == "asl")
    St = ARM_AM::lsl;
  else if (ShiftName == "uxtw")
    St = ARM_AM::uxtw;
  else if (ShiftName == "rrx" || ShiftName == "RRX")
    St = ARM_AM::rrx;
  else
    return Error(Loc, "illegal shift operator");
  if (St != ARM_AM::rrx) {
    return false;
  }
  return true;
}
`;

const PREDICATION_SOURCE = `
ParseStatus AArch64AsmParser::tryParseSVEPredicateVector(OperandVector &Operands) {
  auto Pred = getTok().getString().lower();
  if (RK == RegKind::SVEPredicateAsCounter && Pred != "z")
    return Error(getLoc(), "expecting predication");
  if (RK == RegKind::SVEPredicateVector && Pred != "z" && Pred != "m")
    return Error(getLoc(), "expecting predication");
  const char *ZM = Pred == "z" ? "z" : "m";
  Operands.push_back(AArch64Operand::CreateToken(ZM, getLoc(), getContext()));
}
`;

const MASK_REGISTERS = `
def K0 : X86Reg<"k0", 0>, DwarfRegNum<[118,  93,  93]>;
def K1 : X86Reg<"k1", 1>, DwarfRegNum<[119,  94,  94]>;
def VK1     : RegisterClass<"X86", [v1i1],  16,  (sequence "K%u", 0, 1)> {let Size = 16;}
`;

const ENCODING_SOURCE = `
bool X86AsmParser::parseInstruction(ParseInstructionInfo &Info, StringRef Name) {
  if (Name.consume_back(".d32")) {
    ForcedDispEncoding = DispEncoding_Disp32;
  } else if (Name.consume_back(".d8")) {
    ForcedDispEncoding = DispEncoding_Disp8;
  }
  return false;
}
`;

const SYNTAX_SOURCE = `
bool X86AsmParser::ParseDirective(AsmToken DirectiveID) {
  StringRef IDVal = DirectiveID.getIdentifier();
  if (IDVal.starts_with(".att_syntax")) {
    if (getLexer().isNot(AsmToken::EndOfStatement)) {
      if (Parser.getTok().getString() == "prefix")
        Parser.Lex();
      else if (Parser.getTok().getString() == "noprefix")
        return Error(DirectiveID.getLoc(), "not supported");
    }
    return false;
  } else if (IDVal.starts_with(".intel_syntax")) {
    if (getLexer().isNot(AsmToken::EndOfStatement)) {
      if (Parser.getTok().getString() == "noprefix")
        Parser.Lex();
      else if (Parser.getTok().getString() == "prefix")
        return Error(DirectiveID.getLoc(), "not supported");
    }
    return false;
  }
  return true;
}
`;

testReaders('llvm', [
    {
        name: 'x86EncodingSuffixes',
        read: x86EncodingSuffixes,
        files: { [X86_PARSER]: ENCODING_SOURCE },
        expected: [['.d32', []], ['.d8', []]],
        breakages: [
            {
                file: X86_PARSER,
                from: `if (Name.consume_back(".d32")) {
    ForcedDispEncoding = DispEncoding_Disp32;
  } else if (Name.consume_back(".d8")) {
    ForcedDispEncoding = DispEncoding_Disp8;
  }`,
                to: '',
                stops: 'parseInstruction reads no suffix after a dot',
            },
        ],
    },
    {
        name: 'x86SyntaxWords',
        read: x86SyntaxWords,
        files: { [X86_PARSER]: SYNTAX_SOURCE },
        expected: [
            ['noprefix', [...LOWER, 'llvm:syntax:intel']],
            ['prefix', [...LOWER, 'llvm:syntax:att']],
        ],
        breakages: [
            {
                file: X86_PARSER,
                from: 'IDVal.starts_with(".att_syntax")',
                to: 'IDVal == ".other"',
                stops: '.att_syntax no longer takes a word as written',
            },
            {
                file: X86_PARSER,
                from: 'IDVal.starts_with(".intel_syntax")',
                to: 'IDVal == ".other"',
                stops: '.intel_syntax no longer takes a word as written',
            },
        ],
    },
    {
        name: 'cppDirectives',
        read: cppDirectives,
        files: { [CPP]: CPP_SOURCE },
        expected: [
            ['__public_macro', ['llvm:handler:HandleMacroPublicDirective']],
            ['assert', ['llvm:handler:none']],
            ['elif', ['llvm:handler:HandleElifFamilyDirective']],
            ['elifdef', ['llvm:handler:HandleElifFamilyDirective']],
            ['if', ['llvm:handler:HandleIfDirective']],
            ['import', ['llvm:handler:HandleImportDirective']],
            ['warning', ['llvm:handler:HandleUserDiagnosticDirective']],
        ],
        breakages: [
            {
                file: CPP,
                from: 'if (!II) break; // Not an identifier.',
                to: 'if (II == nullptr) return;',
                stops: 'HandleDirective no longer switches on the directive word',
            },
            {
                file: CPP,
                from: 'if (Introducer.isModuleContextualKeyword())\n        ',
                to: '',
                stops: 'a word left out of the table may now be a # directive',
            },
            {
                file: CPP,
                from: 'assert(getLangOpts().CPlusPlusModules && ImportTok.is(tok::kw_import));',
                to: '',
                stops: 'a word left out of the table may now be a # directive',
            },
            {
                file: CPP,
                from: 'Diag(Tok.getLocation(), diag::pp_include_macros_out_of_predefines);',
                to: '',
                stops: 'a word left out of the table may now be a # directive',
            },
        ],
    },
    {
        name: 'x86IntelWords',
        read: x86IntelWords,
        files: { [X86_PARSER]: INTEL_SOURCE },
        expected: [
            ['byte', ['llvm:no-mixed-case', 'llvm:ptr-follows', 'llvm:size']],
            ['float', ['llvm:no-mixed-case', 'llvm:ptr-follows', 'llvm:size']],
            ['not', ['llvm:no-mixed-case', 'llvm:operator:onNot']],
            ['or', ['llvm:no-mixed-case', 'llvm:operator:onOr']],
            ['ptr', ['llvm:no-mixed-case', 'llvm:ptr']],
        ],
        breakages: [
            {
                file: X86_PARSER,
                from: 'if (Name != Name.lower() && Name != Name.upper() &&\n' +
                    '      !getParser().isParsingMasm())\n    return false;',
                to: '',
                stops: 'ParseIntelNamedOperator no longer rejects mixed case',
            },
            {
                file: X86_PARSER,
                from: 'SM.onNot();',
                to: '',
                stops: 'the named operator "not" calls no handler',
            },
            {
                file: X86_PARSER,
                from: 'if (Parser.isParsingMasm() &&\n      ParseMasmNamedOperator',
                to: 'if (ParseMasmNamedOperator',
                stops: 'ParseMasmNamedOperator is no longer MASM only',
            },
            {
                file: X86_PARSER,
                from: 'Tok.getString() == "ptr"',
                to: 'Tok.getString() == "other"',
                stops: 'ParseIntelMemoryOperandSize no longer requires one word after a size',
            },
            {
                file: X86_PARSER,
                from: '.Cases({"FLOAT", "float"}, 32)',
                to: '.Case("FLOAT", 32)',
                stops: 'ParseIntelMemoryOperandSize has a case this reader does not know',
            },
            {
                file: X86_PARSER,
                from: '.Cases({"FLOAT", "float"}, 32)',
                to: '.Cases({"FLOAT", "real"}, 32)',
                stops: 'the size case {"FLOAT", "real"} is not one word',
            },
        ],
    },
    {
        name: 'x86Decorators with any word after the dash',
        read: x86Decorators,
        files: { [X86_PARSER]: DECORATOR_SOURCE },
        expected: [
            ['1to16', LOWER],
            ['1to8', LOWER],
            ['dfv', ['llvm:flags']],
            ['rd', ['llvm:dashed', ...LOWER]],
            ['rn', ['llvm:dashed', ...LOWER]],
            ['sae', LOWER],
            ['z', LOWER],
        ],
        breakages: [
            {
                file: X86_PARSER,
                from: 'if (!getLexer().is(AsmToken::Minus))',
                to: 'if (other)',
                stops: 'ParseRoundingModeOp reads no rounding mode before a',
            },
            {
                file: X86_PARSER,
                from: '.Case("1to8", "{1to8}")\n          .Case("1to16", "{1to16}")',
                to: '',
                stops: 'HandleAVX512Operand reads no broadcast',
            },
            {
                file: X86_PARSER,
                from: 'if (ParseZ(Z, consumedToken))',
                to: 'if (other)',
                stops: 'HandleAVX512Operand no longer reads a zeroing mark',
            },
            {
                file: X86_PARSER,
                from: 'getIdentifier() == "z"',
                to: 'getIdentifier().empty()',
                stops: 'ParseZ compares no identifier',
            },
            {
                file: X86_PARSER,
                from: 'Tok.getIdentifier().lower() != "dfv"',
                to: 'other',
                stops: 'parseCFlagsOp reads no flags decorator',
            },
        ],
    },
    {
        name: 'x86Decorators with a fixed word after the dash',
        read: x86Decorators,
        files: {
            [X86_PARSER]: DECORATOR_SOURCE.replace(
                '"Expected - at this point");',
                '"Expected - at this point");\n    if (Tok.getIdentifier() != "sae")\n      return false;',
            ),
        },
        expected: [
            ['1to16', LOWER],
            ['1to8', LOWER],
            ['dfv', ['llvm:flags']],
            ['rd-sae', LOWER],
            ['rn-sae', LOWER],
            ['sae', LOWER],
            ['z', LOWER],
        ],
    },
    {
        name: 'aarch64Shifts',
        read: aarch64Shifts,
        files: { [AARCH64_PARSER]: AARCH64_SHIFT_SOURCE },
        expected: [
            ['lsl', ['llvm:shift']],
            ['mul', ['llvm:shift']],
            ['ror', ['llvm:shift']],
            ['uxtb', ['llvm:extend']],
        ],
        breakages: [
            {
                file: AARCH64_PARSER,
                from: 'std::string LowerID = Tok.getString().lower();',
                to: 'StringRef LowerID = Tok.getString();',
                stops: 'tryParseOptionalShiftExtend no longer reads its words',
            },
            {
                file: AARCH64_PARSER,
                from: 'return TokError("expected #imm after shift specifier");',
                to: 'return false;',
                stops: 'tryParseOptionalShiftExtend no longer reads its words',
            },
            {
                file: AARCH64_PARSER,
                from: '!(NextIsVL || NextIsHash)',
                to: 'other',
                stops: 'no shift words, or mul no longer needs an amount',
            },
        ],
    },
    {
        name: 'armShifts',
        read: armShifts,
        files: { [ARM_PARSER]: ARM_SHIFT_SOURCE },
        expected: [
            ['asl', ['llvm:shift']],
            ['lsl', ['llvm:no-mixed-case', 'llvm:shift']],
            ['rrx', ['llvm:extend']],
            ['uxtw', ['llvm:no-mixed-case', 'llvm:no-upper-case', 'llvm:shift']],
        ],
        breakages: [
            {
                file: ARM_PARSER,
                from: 'std::string lowerCase = Tok.getString().lower();',
                to: 'StringRef lowerCase = Tok.getString();',
                stops: 'the shift parsers no longer read their words and amounts',
            },
            {
                file: ARM_PARSER,
                from: 'if (ShiftTy == ARM_AM::rrx)',
                to: 'if (other)',
                stops: 'the shift parsers no longer read their words and amounts',
            },
            {
                file: ARM_PARSER,
                from: 'if (St != ARM_AM::rrx)',
                to: 'if (other)',
                stops: 'the shift parsers no longer read their words and amounts',
            },
            {
                file: ARM_PARSER,
                from: '.Case("asl", ARM_AM::lsl)\n      .Case("rrx", ARM_AM::rrx)',
                to: '',
                stops: 'the shift parsers name no word',
            },
        ],
    },
    {
        name: 'machoSectionTypes',
        read: machoSectionTypes,
        files: {
            [MACH_O]: `
static constexpr struct {
  StringLiteral AssemblerName, EnumName;
} SectionTypeDescriptors[MachO::LAST_KNOWN_SECTION_TYPE + 1] = {
    {StringLiteral("regular"), StringLiteral("S_REGULAR")},    // 0x00
    {StringLiteral(""), StringLiteral("S_ZEROFILL")},          // 0x01
    {StringLiteral("4byte_literals"), StringLiteral("S_4BYTE_LITERALS")},
};
bool f() {
  return SectionType == Descriptor.AssemblerName;
}
`,
        },
        expected: [['4byte_literals', LOWER], ['regular', LOWER]],
        breakages: [
            {
                file: MACH_O,
                from: 'return SectionType == Descriptor.AssemblerName;',
                to: 'return SectionType.equals_insensitive(Descriptor.AssemblerName);',
                stops: 'section types are no longer compared as written',
            },
            {
                file: MACH_O,
                from: '{StringLiteral("regular"), StringLiteral("S_REGULAR")},    // 0x00\n    ' +
                    '{StringLiteral(""), StringLiteral("S_ZEROFILL")},          // 0x01\n    ' +
                    '{StringLiteral("4byte_literals"), StringLiteral("S_4BYTE_LITERALS")},',
                to: '{StringLiteral(""), StringLiteral("S_ZEROFILL")},',
                stops: 'SectionTypeDescriptors names no type',
            },
        ],
    },
    {
        name: 'aarch64PredicateQualifiers',
        read: aarch64PredicateQualifiers,
        files: { [AARCH64_PARSER]: PREDICATION_SOURCE },
        expected: [['m', []], ['z', []]],
        breakages: [
            {
                file: AARCH64_PARSER,
                from: 'auto Pred = getTok().getString().lower();',
                to: 'auto Pred = getTok().getString();',
                stops: 'the predication type is no longer read in any case',
            },
            {
                file: AARCH64_PARSER,
                from: 'CreateToken(ZM',
                to: 'CreateToken(Pred',
                stops: 'the predication type is no longer read in any case',
            },
        ],
    },
    {
        name: 'aarch64Relocations',
        read: aarch64Relocations,
        files: {
            [AARCH64_PARSER]: `
bool AArch64AsmParser::parseSymbolicImmVal(const MCExpr *&ImmVal) {
    std::string LowerCase = getTok().getIdentifier().lower();
    RefKind = StringSwitch<AArch64::Specifier>(LowerCase)
                  .Case("lo12", AArch64::S_LO12)
                  .Case("GOT_LO12", AArch64::S_GOT_LO12)
                  .Default(AArch64::S_INVALID);
}
`,
        },
        expected: [['got_lo12', []], ['lo12', []]],
        breakages: [
            {
                file: AARCH64_PARSER,
                from: 'getTok().getIdentifier().lower()',
                to: 'getTok().getIdentifier()',
                stops: 'parseSymbolicImmVal no longer reads a relocation in any case',
            },
            {
                file: AARCH64_PARSER,
                from: '.Case("lo12", AArch64::S_LO12)\n                  ' +
                    '.Case("GOT_LO12", AArch64::S_GOT_LO12)',
                to: '',
                stops: 'no name matches',
            },
        ],
    },
    {
        name: 'armRelocations',
        read: armRelocations,
        files: {
            [ARM_PARSER]: `
bool ARMAsmParser::parsePrefix(ARM::Specifier &Spec) {
  static const struct PrefixEntry {
    const char *Spelling;
  } PrefixEntries[] = {
      {"upper16", ARM::S_HI16, COFF | ELF | MACHO},
      {"lower16", ARM::S_LO16, COFF | ELF | MACHO},
  };
  auto Prefix = find_if(PrefixEntries, [&](const PrefixEntry &PE) {
    return PE.Spelling == IDVal;
  });
}
`,
        },
        expected: [['lower16', LOWER], ['upper16', LOWER]],
        breakages: [
            {
                file: ARM_PARSER,
                from: 'return PE.Spelling == IDVal;',
                to: 'return IDVal.equals_insensitive(PE.Spelling);',
                stops: 'parsePrefix no longer compares a relocation as written',
            },
        ],
    },
    {
        name: 'armSuffixRelocations',
        read: armSuffixRelocations,
        files: {
            [ARM_ASM_INFO]: `
static const MCAsmInfo::AtSpecifier AtSpecifierDefs[] = {
    {{"GOT"}, ARM::S_GOT},
    {{"plt"}, ARM::S_PLT},
};
void f() {
  UseParensForSpecifier = true;
}
`,
            [ASM_INFO]: 'auto It = NameToAtSpecifier.find(Name.lower());\n',
        },
        expected: [['got', []], ['plt', []]],
        breakages: [
            {
                file: ARM_ASM_INFO,
                from: 'UseParensForSpecifier = true;',
                to: '',
                stops: 'no ARM target writes a specifier in parentheses',
            },
            {
                file: ASM_INFO,
                from: 'Name.lower()',
                to: 'Name',
                stops: 'specifiers are no longer looked up in any case',
            },
        ],
    },
]);

test('x86MaskRegisters expands the VK1 sequence to the names of its registers', () => {
    const files = { [X86_REGISTERS]: MASK_REGISTERS, [X86_PARSER]: DECORATOR_SOURCE };
    assert.deepStrictEqual(x86MaskRegisters(sourceTree('llvm-masks', files)), ['k0', 'k1']);
    assertThrowsIncluding(
        () =>
            x86MaskRegisters(
                sourceTree('llvm-masks-class', {
                    ...files,
                    [X86_REGISTERS]: 'def K0 : X86Reg<"k0", 0>;\n',
                }),
            ),
        'VK1 is no longer a register sequence',
    );
    assertThrowsIncluding(
        () =>
            x86MaskRegisters(
                sourceTree('llvm-masks-parser', {
                    ...files,
                    [X86_PARSER]: DECORATOR_SOURCE.replace(
                        'X86::VK1RegClassID',
                        'X86::VK2RegClassID',
                    ),
                }),
            ),
        'HandleAVX512Operand no longer takes VK1 registers as masks',
    );
    assertThrowsIncluding(
        () =>
            x86MaskRegisters(
                sourceTree('llvm-masks-register', {
                    ...files,
                    [X86_REGISTERS]: MASK_REGISTERS.replace('def K1 :', 'def K9 :'),
                }),
            ),
        'no register K1',
    );
});

const MATCHER = `
[[maybe_unused]]
static MCRegister MatchRegisterName(StringRef Name) {
  switch (Name.size()) {
  case 2:
    return X86::AX;\t // "ax"
  case 3:
    return X86::EAX;\t // "eax"
  }
  return X86::NoRegister;
}
`;

test('matcherRegisters reads every register the matcher returns', () => {
    assert.deepStrictEqual(matcherRegisters(MATCHER, 'MatchRegisterName'), ['ax', 'eax']);
});

test('matcherRegisters stops when a return has no name or none are found', () => {
    assertThrowsIncluding(
        () =>
            matcherRegisters(
                MATCHER.replace('return X86::AX;\t // "ax"', 'return X86::AX;'),
                'MatchRegisterName',
            ),
        'MatchRegisterName: read 1 of 2 register names',
    );
    assertThrowsIncluding(
        () =>
            matcherRegisters(
                'static MCRegister MatchRegisterName(StringRef Name) {\n  return 0;\n}\n',
                'MatchRegisterName',
            ),
        'MatchRegisterName: read 0 of 0 register names',
    );
    assertThrowsIncluding(() => matcherRegisters(MATCHER, 'Other'), 'no Other');
});

test('caseStrings lists the cases in lower case and stops on none', () => {
    assert.deepStrictEqual(caseStrings('.Case("FP", X::A)\n.Case("lr", X::B)', 'it'), ['fp', 'lr']);
    assertThrowsIncluding(() => caseStrings('.Default(0)', 'it'), 'it: no register names');
});

const LOOKUPS = `
ParseStatus P::tryParseSysReg(OperandVector &Operands) {
  auto MRS = AArch64SysReg::lookupSysRegByName(Tok.getString());
  auto PState = AArch64PState::lookupPStateByName(Tok.getString());
}
`;

const LOOKUP_TABLES = `
constexpr SysReg SysRegsList[] = {
  { 0xc000 }, /* "VBAR_EL1" */
  { 0xc001 }, /* "sp_el0" */
 };
constexpr PState PStatesList[] = {
  { 0x5 }, /* "SPSel" */
 };
`;

test('lookedUpNames follows each lookup of a function to its table', () => {
    assert.deepStrictEqual(
        lookedUpNames('it', LOOKUPS, [/^ParseStatus P::tryParseSysReg\(/m], LOOKUP_TABLES)
            .entries(),
        [['sp_el0', []], ['spsel', []], ['vbar_el1', []]],
    );
});

test('lookedUpNames stops on a function without a lookup or a lookup without a table', () => {
    assertThrowsIncluding(
        () => lookedUpNames('it', 'bool f() {\n  return 0;\n}\n', [/^bool f\(/m], LOOKUP_TABLES),
        'it: ^bool f\\( looks up no names',
    );
    assertThrowsIncluding(
        () => lookedUpNames('it', LOOKUPS, [/^ParseStatus P::tryParseSysReg\(/m], ''),
        'no SysReg table',
    );
});

test('indexedRegisters turn numbered forms into a count on the base name', () => {
    assert.deepStrictEqual(indexedRegisters(['st', 'st(1)', 'st(0)', 'ax']).entries(), [
        ['ax', []],
        ['st', ['index:2']],
    ]);
    assertThrowsIncluding(
        () => indexedRegisters(['fp(0)']),
        'the register matcher indexes fp, which it does not name',
    );
});

test('withoutMasmBlocks removes each MASM block with its braces', () => {
    assert.strictEqual(
        withoutMasmBlocks(
            'a; if (getParser().isParsingMasm()) { b { c } } d; if (Parser.isParsingMasm()) { e } f;',
        ),
        'a;  d;  f;',
    );
});

test('variantEntries read the mnemonic and operand classes of each match table', () => {
    const entries = variantEntries(`
static const MatchEntry MatchTable0[] = {
  { 0 /* ADD */, X86::ADD, Convert__Reg1_0, AMFBS_None, { MCK_GR32, MCK_Imm }, },
  { 5 /* mov */, X86::MOV, Convert__Reg1_0, AMFBS_None, { }, },
};
static const MatchEntry MatchTable1[] = {
  { 9 /* add */, X86::ADD, Convert__Reg1_0, AMFBS_None, { MCK_GR64 }, },
};
`);
    assert.deepStrictEqual([...entries], [
        [0, [
            { mnemonic: 'add', classes: ['MCK_GR32', 'MCK_Imm'] },
            { mnemonic: 'mov', classes: [] },
        ]],
        [1, [{ mnemonic: 'add', classes: ['MCK_GR64'] }]],
    ]);
    assertThrowsIncluding(() => variantEntries(''), 'the asm matcher has no MatchTable');
});

test('aliasNames read the aliases of each variant, in lower case', () => {
    const aliases = aliasNames(`
static void applyMnemonicAliases(StringRef &Mnemonic, unsigned VariantID) {
  switch (VariantID) {
  case 0:
    if (memcmp(Mnemonic.data()+0, "JMP", 3) != 0) // "JMP"
      break;
  case 1:
    if (memcmp(Mnemonic.data()+0, "b", 1) != 0) // "b"
      break;
  }
}
`);
    assert.deepStrictEqual([...aliases], [[0, new Set(['jmp'])], [1, new Set(['b'])]]);
    assert.deepStrictEqual(aliasNames('no aliases'), new Map());
});
