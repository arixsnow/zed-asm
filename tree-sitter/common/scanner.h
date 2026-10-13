// SPDX-License-Identifier: MIT

#ifndef TREE_SITTER_ASM_SCANNER_H
#define TREE_SITTER_ASM_SCANNER_H

#if !defined(__STDC_VERSION__) || __STDC_VERSION__ < 201112L
#error "scanner.h requires C11 or later"
#endif /* __STDC_VERSION__ */

#include "tree_sitter/alloc.h"
#include "tree_sitter/parser.h"

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <string.h>

#ifndef ASM_GRAMMAR_NAME
#error "define ASM_GRAMMAR_NAME before including scanner.h"
#endif /* ASM_GRAMMAR_NAME */

enum SemicolonMode {
  SEMICOLON_SEPARATES,
  SEMICOLON_COMMENTS,
  SEMICOLON_HEURISTIC,
};

#if (defined(ASM_DIALECT_AUTO) + defined(ASM_DIALECT_ARM) + defined(ASM_DIALECT_ARM_APPLE) +       \
     defined(ASM_DIALECT_X86_GAS) + defined(ASM_DIALECT_X86_NASM)) != 1
#error "define exactly one ASM_DIALECT_* macro before including scanner.h"
#endif /* exactly one ASM_DIALECT_* */

#ifdef ASM_DIALECT_AUTO
#define ASM_ARM_OPERANDS 1
#define ASM_X86_OPERANDS 1
#define ASM_BANG_OPERATOR 1
#define ASM_RELOCATION_OPERATORS 1
#define ASM_SUFFIX_RELOCATIONS 1
#define ASM_GNU_SYNTAX 1
#define ASM_HASH_IMMEDIATES 1
#define ASM_HASH_NEEDS_VALUE 1
#define ASM_AT_COMMENTS 1
#define ASM_DOLLAR_IMMEDIATES 1
#define ASM_DARWIN_LOCALS 0
#define ASM_DARWIN_ARGUMENTS 0
#define ASM_SEMICOLONS SEMICOLON_HEURISTIC
#elif defined(ASM_DIALECT_ARM)
#define ASM_ARM_OPERANDS 1
#define ASM_X86_OPERANDS 0
#define ASM_BANG_OPERATOR 1
#define ASM_RELOCATION_OPERATORS 1
#define ASM_SUFFIX_RELOCATIONS 1
#define ASM_GNU_SYNTAX 1
#define ASM_HASH_IMMEDIATES 1
#define ASM_HASH_NEEDS_VALUE 0
#define ASM_AT_COMMENTS 1
#define ASM_DOLLAR_IMMEDIATES 0
#define ASM_DARWIN_LOCALS 0
#define ASM_DARWIN_ARGUMENTS 0
#define ASM_SEMICOLONS SEMICOLON_SEPARATES
#elif defined(ASM_DIALECT_ARM_APPLE)
#define ASM_ARM_OPERANDS 1
#define ASM_X86_OPERANDS 0
#define ASM_BANG_OPERATOR 0
#define ASM_RELOCATION_OPERATORS 0
#define ASM_SUFFIX_RELOCATIONS 0
#define ASM_GNU_SYNTAX 1
#define ASM_HASH_IMMEDIATES 1
#define ASM_HASH_NEEDS_VALUE 0
#define ASM_AT_COMMENTS 0
#define ASM_DOLLAR_IMMEDIATES 0
#define ASM_DARWIN_LOCALS 1
#define ASM_DARWIN_ARGUMENTS 1
#define ASM_SEMICOLONS SEMICOLON_COMMENTS
#elif defined(ASM_DIALECT_X86_GAS)
#define ASM_ARM_OPERANDS 0
#define ASM_X86_OPERANDS 1
#define ASM_BANG_OPERATOR 1
#define ASM_RELOCATION_OPERATORS 0
#define ASM_SUFFIX_RELOCATIONS 0
#define ASM_GNU_SYNTAX 1
#define ASM_HASH_IMMEDIATES 0
#define ASM_HASH_NEEDS_VALUE 0
#define ASM_AT_COMMENTS 0
#define ASM_DOLLAR_IMMEDIATES 1
#define ASM_DARWIN_LOCALS 0
#define ASM_DARWIN_ARGUMENTS 0
#define ASM_SEMICOLONS SEMICOLON_SEPARATES
#elif defined(ASM_DIALECT_X86_NASM)
#define ASM_ARM_OPERANDS 0
#define ASM_X86_OPERANDS 0
#define ASM_BANG_OPERATOR 0
#define ASM_RELOCATION_OPERATORS 0
#define ASM_SUFFIX_RELOCATIONS 0
#define ASM_GNU_SYNTAX 0
#define ASM_HASH_IMMEDIATES 0
#define ASM_HASH_NEEDS_VALUE 0
#define ASM_AT_COMMENTS 0
#define ASM_DOLLAR_IMMEDIATES 0
#define ASM_DARWIN_LOCALS 0
#define ASM_DARWIN_ARGUMENTS 0
#define ASM_SEMICOLONS SEMICOLON_COMMENTS
#endif /* ASM_DIALECT_* */

enum TokenType {
  LINE_COMMENT,
  PREPROC_DIRECTIVE,
  HASH,
  AT_ATTACHED,
  AT_TYPE,
  SEPARATOR,
  STRING_CONTENT,
  PREPROC_ARGUMENT,
  PREPROC_LINE_END,
  PREPROC_INCLUDE,
  HEADER_NAME,
  PREPROC_DEFINE,
  PREPROC_CONDITION,
  PREPROC_PARAMS_OPEN,
  MISSING_OPERAND,
  MISSING_LABEL_OPERAND,
  MISSING_ARGUMENT,
  MISSING_REGISTER_ARGUMENT,
  MISSING_ELEMENT,
  MISSING_EXPRESSION,
  MISSING_NAME,
  MISSING_IDENTIFIER,
  MISSING_SYMBOL,
  MISSING_RELOCATION,
  UNCLOSED,
  UNCLOSED_BRACKET,
  UNCLOSED_INDEX,
  UNCLOSED_BRACE,
  UNCLOSED_MEMORY,
  UNCLOSED_ADDRESS,
  UNCLOSED_ARGUMENTS,
  GLOBAL_LABEL_NAME,
  LOCAL_LABEL_NAME,
  NUMERIC_LABEL_NAME,
  DOLLAR_LABEL_NAME,
  DOLLAR_LABEL,
  DARWIN_ARGUMENT,
  GLUED_ARGUMENT,
  GLUED_SEPARATOR,
  GLUED_TEXT,
  BLANK,
  PREFIX_WORD,
  PREFIX_SEMICOLON,
  MACRO_OPEN,
  IF_OPEN,
  REPT_OPEN,
  IRP_OPEN,
  IRPC_OPEN,
  BLANK_SEPARATED_DIRECTIVE,
  CFI_REGISTER_DIRECTIVE,
  UNWIND_REGISTER_DIRECTIVE,
  LINKER_HINT_DIRECTIVE,
  SUFFIX_RELOCATION_NAME,
  RELOCATION_SPECIFIER,
  RELOCATION_NAME,
  RELOCATION_COLON,
  REGISTER_ALIAS_WORD,
  NEON_ALIAS_WORD,
  INTEL_SYNTAX,
  ATT_SYNTAX,
  SYNTAX_PREFIX,
  SYNTAX_NOPREFIX,
  BARE_REGISTER,
  REMAINDER,
  INTEL_OPERANDS,
  INTEL_TYPE_WORD,
  INTEL_PTR_WORD,
  INTEL_UNARY_WORD,
  INTEL_MULTIPLICATIVE_WORD,
  INTEL_BITWISE_WORD,
  INTEL_COMPARISON_WORD,
  INTEL_FLAT_WORD,
  CALL_ARGUMENTS,
  MACRO_LABEL_NAME,
  INDEX_OPEN,
  MEMORY_COMMA,
  BRACKET_COLON,
  SEGMENT_COLON,
  RANGE_DASH,
  RELOCATION_SUFFIX,
  MEMORY_ADDRESS,
  PSEUDO_PREFIX,
  DECORATOR,
  MACRO_CLOSE,
  CONDITIONAL_CLOSE,
  REPEAT_CLOSE,
  ELSEIF,
  ELSE,
  BLOCK_END,
  END,
  STRAY,
  ERROR_SENTINEL,
};

enum {
  CPP_WORD_CAPACITY = 16,
  STATEMENT_WORD_CAPACITY = 32
};

enum X86Syntax {
  X86_INTEL = 1,
  X86_NOPREFIX = 2
};

enum {
  CLOSED_INPUT_BIT = 1,
  X86_SYNTAX_SHIFT = 1,
  DECIMAL_BASE = 10
};

struct Word {
  const char *name;
  TSSymbol symbol;
};

struct Scanner {
  bool closed_input;
  unsigned char x86_syntax;
};

#define ASM_STATEMENT_WORDS(X)                                                                     \
  X(".att_syntax", ATT_SYNTAX)                                                                     \
  X(".cfi_def_cfa", CFI_REGISTER_DIRECTIVE)                                                        \
  X(".cfi_def_cfa_register", CFI_REGISTER_DIRECTIVE)                                               \
  X(".cfi_llvm_def_aspace_cfa", CFI_REGISTER_DIRECTIVE)                                            \
  X(".cfi_offset", CFI_REGISTER_DIRECTIVE)                                                         \
  X(".cfi_register", CFI_REGISTER_DIRECTIVE)                                                       \
  X(".cfi_rel_offset", CFI_REGISTER_DIRECTIVE)                                                     \
  X(".cfi_restore", CFI_REGISTER_DIRECTIVE)                                                        \
  X(".cfi_return_column", CFI_REGISTER_DIRECTIVE)                                                  \
  X(".cfi_same_value", CFI_REGISTER_DIRECTIVE)                                                     \
  X(".cfi_undefined", CFI_REGISTER_DIRECTIVE)                                                      \
  X(".cfi_val_encoded_addr", CFI_REGISTER_DIRECTIVE)                                               \
  X(".cfi_val_offset", CFI_REGISTER_DIRECTIVE)                                                     \
  X(".dn", NEON_ALIAS_WORD)                                                                        \
  X(".else", ELSE)                                                                                 \
  X(".elseif", ELSEIF)                                                                             \
  X(".endif", CONDITIONAL_CLOSE)                                                                   \
  X(".endm", MACRO_CLOSE)                                                                          \
  X(".endmacro", MACRO_CLOSE)                                                                      \
  X(".endr", REPEAT_CLOSE)                                                                         \
  X(".file", BLANK_SEPARATED_DIRECTIVE)                                                            \
  X(".if", IF_OPEN)                                                                                \
  X(".ifb", IF_OPEN)                                                                               \
  X(".ifc", IF_OPEN)                                                                               \
  X(".ifdef", IF_OPEN)                                                                             \
  X(".ifeq", IF_OPEN)                                                                              \
  X(".ifeqs", IF_OPEN)                                                                             \
  X(".ifge", IF_OPEN)                                                                              \
  X(".ifgt", IF_OPEN)                                                                              \
  X(".ifle", IF_OPEN)                                                                              \
  X(".iflt", IF_OPEN)                                                                              \
  X(".ifnb", IF_OPEN)                                                                              \
  X(".ifnc", IF_OPEN)                                                                              \
  X(".ifndef", IF_OPEN)                                                                            \
  X(".ifne", IF_OPEN)                                                                              \
  X(".ifnes", IF_OPEN)                                                                             \
  X(".ifnotdef", IF_OPEN)                                                                          \
  X(".intel_syntax", INTEL_SYNTAX)                                                                 \
  X(".irp", IRP_OPEN)                                                                              \
  X(".irpc", IRPC_OPEN)                                                                            \
  X(".loc", BLANK_SEPARATED_DIRECTIVE)                                                             \
  X(".loh", LINKER_HINT_DIRECTIVE)                                                                 \
  X(".macro", MACRO_OPEN)                                                                          \
  X(".movsp", UNWIND_REGISTER_DIRECTIVE)                                                           \
  X(".qn", NEON_ALIAS_WORD)                                                                        \
  X(".rept", REPT_OPEN)                                                                            \
  X(".req", REGISTER_ALIAS_WORD)                                                                   \
  X(".save", UNWIND_REGISTER_DIRECTIVE)                                                            \
  X(".seh_save_any_reg", UNWIND_REGISTER_DIRECTIVE)                                                \
  X(".seh_save_any_reg_p", UNWIND_REGISTER_DIRECTIVE)                                              \
  X(".seh_save_any_reg_px", UNWIND_REGISTER_DIRECTIVE)                                             \
  X(".seh_save_any_reg_x", UNWIND_REGISTER_DIRECTIVE)                                              \
  X(".seh_save_freg", UNWIND_REGISTER_DIRECTIVE)                                                   \
  X(".seh_save_freg_x", UNWIND_REGISTER_DIRECTIVE)                                                 \
  X(".seh_save_fregp", UNWIND_REGISTER_DIRECTIVE)                                                  \
  X(".seh_save_fregp_x", UNWIND_REGISTER_DIRECTIVE)                                                \
  X(".seh_save_lrpair", UNWIND_REGISTER_DIRECTIVE)                                                 \
  X(".seh_save_preg", UNWIND_REGISTER_DIRECTIVE)                                                   \
  X(".seh_save_reg", UNWIND_REGISTER_DIRECTIVE)                                                    \
  X(".seh_save_reg_x", UNWIND_REGISTER_DIRECTIVE)                                                  \
  X(".seh_save_regp", UNWIND_REGISTER_DIRECTIVE)                                                   \
  X(".seh_save_regp_x", UNWIND_REGISTER_DIRECTIVE)                                                 \
  X(".seh_save_zreg", UNWIND_REGISTER_DIRECTIVE)                                                   \
  X(".setfp", UNWIND_REGISTER_DIRECTIVE)                                                           \
  X(".vsave", UNWIND_REGISTER_DIRECTIVE)

#define ASM_SUFFIX_RELOCATION_NAMES(X)                                                             \
  X("got")                                                                                         \
  X("got_prel")                                                                                    \
  X("gotoff")                                                                                      \
  X("gottpoff")                                                                                    \
  X("plt")                                                                                         \
  X("prel31")                                                                                      \
  X("sbrel")                                                                                       \
  X("target1")                                                                                     \
  X("target2")                                                                                     \
  X("tlscall")                                                                                     \
  X("tlsdesc")                                                                                     \
  X("tlsgd")                                                                                       \
  X("tlsldm")                                                                                      \
  X("tlsldo")                                                                                      \
  X("tpoff")

#define ASM_RELOCATION_NAMES(X)                                                                    \
  X("abs_g0")                                                                                      \
  X("abs_g0_nc")                                                                                   \
  X("abs_g0_s")                                                                                    \
  X("abs_g1")                                                                                      \
  X("abs_g1_nc")                                                                                   \
  X("abs_g1_s")                                                                                    \
  X("abs_g2")                                                                                      \
  X("abs_g2_nc")                                                                                   \
  X("abs_g2_s")                                                                                    \
  X("abs_g3")                                                                                      \
  X("dtprel_g0")                                                                                   \
  X("dtprel_g0_nc")                                                                                \
  X("dtprel_g1")                                                                                   \
  X("dtprel_g1_nc")                                                                                \
  X("dtprel_g2")                                                                                   \
  X("dtprel_hi12")                                                                                 \
  X("dtprel_lo12")                                                                                 \
  X("dtprel_lo12_nc")                                                                              \
  X("got")                                                                                         \
  X("got_auth")                                                                                    \
  X("got_auth_lo12")                                                                               \
  X("got_lo12")                                                                                    \
  X("gotoff_g0_nc")                                                                                \
  X("gotoff_g1")                                                                                   \
  X("gotoff_lo15")                                                                                 \
  X("gotpage_lo15")                                                                                \
  X("gottprel")                                                                                    \
  X("gottprel_g0_nc")                                                                              \
  X("gottprel_g1")                                                                                 \
  X("gottprel_lo12")                                                                               \
  X("lo12")                                                                                        \
  X("lower0_7")                                                                                    \
  X("lower16")                                                                                     \
  X("lower8_15")                                                                                   \
  X("pg_hi21")                                                                                     \
  X("pg_hi21_nc")                                                                                  \
  X("prel_g0")                                                                                     \
  X("prel_g0_nc")                                                                                  \
  X("prel_g1")                                                                                     \
  X("prel_g1_nc")                                                                                  \
  X("prel_g2")                                                                                     \
  X("prel_g2_nc")                                                                                  \
  X("prel_g3")                                                                                     \
  X("secrel_hi12")                                                                                 \
  X("secrel_lo12")                                                                                 \
  X("tlsdesc")                                                                                     \
  X("tlsdesc_auth")                                                                                \
  X("tlsdesc_auth_lo12")                                                                           \
  X("tlsdesc_lo12")                                                                                \
  X("tlsdesc_off_g0_nc")                                                                           \
  X("tlsdesc_off_g1")                                                                              \
  X("tlsgd")                                                                                       \
  X("tlsgd_g0_nc")                                                                                 \
  X("tlsgd_g1")                                                                                    \
  X("tlsgd_lo12")                                                                                  \
  X("tlsldm")                                                                                      \
  X("tlsldm_lo12_nc")                                                                              \
  X("tprel_g0")                                                                                    \
  X("tprel_g0_nc")                                                                                 \
  X("tprel_g1")                                                                                    \
  X("tprel_g1_nc")                                                                                 \
  X("tprel_g2")                                                                                    \
  X("tprel_hi12")                                                                                  \
  X("tprel_lo12")                                                                                  \
  X("tprel_lo12_nc")                                                                               \
  X("upper0_7")                                                                                    \
  X("upper16")                                                                                     \
  X("upper8_15")

#define ASM_STATEMENT_WORD_FITS(word, symbol)                                                      \
  _Static_assert(sizeof(word) <= STATEMENT_WORD_CAPACITY,                                          \
                 "STATEMENT_WORD_CAPACITY must hold " word);
ASM_STATEMENT_WORDS(ASM_STATEMENT_WORD_FITS)

#define ASM_NAME_FITS(word)                                                                        \
  _Static_assert(sizeof(word) <= STATEMENT_WORD_CAPACITY,                                          \
                 "STATEMENT_WORD_CAPACITY must hold " word);
ASM_SUFFIX_RELOCATION_NAMES(ASM_NAME_FITS)
ASM_RELOCATION_NAMES(ASM_NAME_FITS)

#define ASM_WORD_ENTRY(word, symbol) {word, symbol},
static const struct Word STATEMENT_WORDS[] = {ASM_STATEMENT_WORDS(ASM_WORD_ENTRY)};

#define ASM_X86_REGISTER_NAMES(X)                                                                  \
  X("ah")                                                                                          \
  X("al")                                                                                          \
  X("ax")                                                                                          \
  X("bh")                                                                                          \
  X("bl")                                                                                          \
  X("bp")                                                                                          \
  X("bpl")                                                                                         \
  X("bx")                                                                                          \
  X("ch")                                                                                          \
  X("cl")                                                                                          \
  X("cs")                                                                                          \
  X("cx")                                                                                          \
  X("dh")                                                                                          \
  X("di")                                                                                          \
  X("dil")                                                                                         \
  X("dl")                                                                                          \
  X("ds")                                                                                          \
  X("dx")                                                                                          \
  X("eax")                                                                                         \
  X("ebp")                                                                                         \
  X("ebx")                                                                                         \
  X("ecx")                                                                                         \
  X("edi")                                                                                         \
  X("edx")                                                                                         \
  X("eip")                                                                                         \
  X("eiz")                                                                                         \
  X("es")                                                                                          \
  X("esi")                                                                                         \
  X("esp")                                                                                         \
  X("fs")                                                                                          \
  X("gs")                                                                                          \
  X("ip")                                                                                          \
  X("rax")                                                                                         \
  X("rbp")                                                                                         \
  X("rbx")                                                                                         \
  X("rcx")                                                                                         \
  X("rdi")                                                                                         \
  X("rdx")                                                                                         \
  X("rip")                                                                                         \
  X("riz")                                                                                         \
  X("rsi")                                                                                         \
  X("rsp")                                                                                         \
  X("si")                                                                                          \
  X("sil")                                                                                         \
  X("sp")                                                                                          \
  X("spl")                                                                                         \
  X("ss")                                                                                          \
  X("st")

#define ASM_X86_INTEL_WORDS(X)                                                                     \
  X("and", INTEL_BITWISE_WORD)                                                                     \
  X("bcst", INTEL_PTR_WORD)                                                                        \
  X("byte", INTEL_TYPE_WORD)                                                                       \
  X("dword", INTEL_TYPE_WORD)                                                                      \
  X("eq", INTEL_COMPARISON_WORD)                                                                   \
  X("far", INTEL_TYPE_WORD)                                                                        \
  X("flat", INTEL_FLAT_WORD)                                                                       \
  X("fword", INTEL_TYPE_WORD)                                                                      \
  X("ge", INTEL_COMPARISON_WORD)                                                                   \
  X("gt", INTEL_COMPARISON_WORD)                                                                   \
  X("le", INTEL_COMPARISON_WORD)                                                                   \
  X("lt", INTEL_COMPARISON_WORD)                                                                   \
  X("mmword", INTEL_TYPE_WORD)                                                                     \
  X("mod", INTEL_MULTIPLICATIVE_WORD)                                                              \
  X("ne", INTEL_COMPARISON_WORD)                                                                   \
  X("near", INTEL_TYPE_WORD)                                                                       \
  X("not", INTEL_UNARY_WORD)                                                                       \
  X("offset", INTEL_UNARY_WORD)                                                                    \
  X("or", INTEL_BITWISE_WORD)                                                                      \
  X("oword", INTEL_TYPE_WORD)                                                                      \
  X("ptr", INTEL_PTR_WORD)                                                                         \
  X("qword", INTEL_TYPE_WORD)                                                                      \
  X("shl", INTEL_MULTIPLICATIVE_WORD)                                                              \
  X("short", INTEL_UNARY_WORD)                                                                     \
  X("shr", INTEL_MULTIPLICATIVE_WORD)                                                              \
  X("tbyte", INTEL_TYPE_WORD)                                                                      \
  X("word", INTEL_TYPE_WORD)                                                                       \
  X("xmmword", INTEL_TYPE_WORD)                                                                    \
  X("xor", INTEL_BITWISE_WORD)                                                                     \
  X("ymmword", INTEL_TYPE_WORD)                                                                    \
  X("zmmword", INTEL_TYPE_WORD)

#define ASM_X86_PSEUDO_PREFIXES(X)                                                                 \
  X("disp16")                                                                                      \
  X("disp32")                                                                                      \
  X("disp8")                                                                                       \
  X("evex")                                                                                        \
  X("load")                                                                                        \
  X("nf")                                                                                          \
  X("nooptimize")                                                                                  \
  X("rex")                                                                                         \
  X("rex2")                                                                                        \
  X("store")                                                                                       \
  X("vex")                                                                                         \
  X("vex2")                                                                                        \
  X("vex3")

#define ASM_X86_REGISTER_FAMILIES(X)                                                               \
  X("cr", 0, 15, "")                                                                               \
  X("db", 0, 15, "")                                                                               \
  X("dr", 0, 15, "")                                                                               \
  X("k", 0, 7, "")                                                                                 \
  X("mm", 0, 7, "")                                                                                \
  X("r", 8, 31, "bdw")                                                                             \
  X("tmm", 0, 7, "")                                                                               \
  X("tr", 0, 7, "")                                                                                \
  X("xmm", 0, 31, "")                                                                              \
  X("ymm", 0, 31, "")                                                                              \
  X("zmm", 0, 31, "")

struct RegisterFamily {
  const char *prefix;
  unsigned first;
  unsigned last;
  const char *suffixes;
};

#define ASM_NAME_ENTRY(word) word,
static const char *const SUFFIX_RELOCATIONS[] = {ASM_SUFFIX_RELOCATION_NAMES(ASM_NAME_ENTRY)};
static const char *const RELOCATION_NAMES[] = {ASM_RELOCATION_NAMES(ASM_NAME_ENTRY)};
static const char *const X86_REGISTER_NAMES[] = {ASM_X86_REGISTER_NAMES(ASM_NAME_ENTRY)};
static const char *const X86_PSEUDO_PREFIXES[] = {ASM_X86_PSEUDO_PREFIXES(ASM_NAME_ENTRY)};
static const struct Word INTEL_WORDS[] = {ASM_X86_INTEL_WORDS(ASM_WORD_ENTRY)};

#define ASM_FAMILY_ENTRY(prefix, first, last, suffixes) {prefix, first, last, suffixes},
static const struct RegisterFamily X86_REGISTER_FAMILIES[] = {
    ASM_X86_REGISTER_FAMILIES(ASM_FAMILY_ENTRY)};

static const char *const X86_PREFIXES[] = {
    "cs",   "ds",   "ss",  "es",   "fs",   "gs",    "data16", "data32",  "addr16",   "addr32",
    "lock", "wait", "rep", "repe", "repz", "repne", "repnz",  "notrack", "xacquire", "xrelease",
};

struct ImplicitEnd {
  TSSymbol closer;
  TSSymbol ends;
};

static const struct ImplicitEnd IMPLICIT_ENDS[] = {
    {MACRO_CLOSE, CONDITIONAL_CLOSE},
    {MACRO_CLOSE, REPEAT_CLOSE},
    {REPEAT_CLOSE, CONDITIONAL_CLOSE},
};

enum CppDirectiveKind {
  CPP_NONE,
  CPP_DIRECTIVE,
  CPP_INCLUDE,
  CPP_DEFINE,
  CPP_CONDITION,
};

struct CppDirective {
  const char *name;
  enum CppDirectiveKind kind;
};

#define ASM_CPP_DIRECTIVES(X)                                                                      \
  X("define", CPP_DEFINE)                                                                          \
  X("elif", CPP_CONDITION)                                                                         \
  X("elifdef", CPP_DIRECTIVE)                                                                      \
  X("elifndef", CPP_DIRECTIVE)                                                                     \
  X("else", CPP_DIRECTIVE)                                                                         \
  X("endif", CPP_DIRECTIVE)                                                                        \
  X("error", CPP_DIRECTIVE)                                                                        \
  X("if", CPP_CONDITION)                                                                           \
  X("ifdef", CPP_DIRECTIVE)                                                                        \
  X("ifndef", CPP_DIRECTIVE)                                                                       \
  X("import", CPP_INCLUDE)                                                                         \
  X("include", CPP_INCLUDE)                                                                        \
  X("include_next", CPP_INCLUDE)                                                                   \
  X("line", CPP_DIRECTIVE)                                                                         \
  X("pragma", CPP_DIRECTIVE)                                                                       \
  X("undef", CPP_DIRECTIVE)                                                                        \
  X("warning", CPP_DIRECTIVE)

#define ASM_CPP_DIRECTIVE_FITS(word, kind)                                                         \
  _Static_assert(sizeof(word) <= CPP_WORD_CAPACITY, "CPP_WORD_CAPACITY must hold " word);
ASM_CPP_DIRECTIVES(ASM_CPP_DIRECTIVE_FITS)

#define ASM_CPP_DIRECTIVE_ENTRY(word, kind) {word, kind},
static const struct CppDirective CPP_DIRECTIVES[] = {ASM_CPP_DIRECTIVES(ASM_CPP_DIRECTIVE_ENTRY)};

static inline void advance(TSLexer *lexer) {
  lexer->advance(lexer, false);
}

static inline void skip(TSLexer *lexer) {
  lexer->advance(lexer, true);
}

static inline bool is_blank(int32_t codepoint) {
  return codepoint == ' ' || codepoint == '\t' || codepoint == '\f' || codepoint == '\v' ||
         codepoint == '\r';
}

static inline bool is_alpha(int32_t codepoint) {
  return (codepoint >= 'a' && codepoint <= 'z') || (codepoint >= 'A' && codepoint <= 'Z') ||
         codepoint == '_';
}

static inline bool is_digit(int32_t codepoint) {
  return codepoint >= '0' && codepoint <= '9';
}

static inline bool is_word_char(int32_t codepoint) {
  return is_alpha(codepoint) || is_digit(codepoint) || codepoint == '.' || codepoint == '$';
}

static inline bool starts_term(int32_t codepoint) {
  if (is_alpha(codepoint) || is_digit(codepoint) || codepoint == '.' || codepoint == '(' ||
      codepoint == '-' || codepoint == '+' || codepoint == '~' || codepoint == '!') {
    return true;
  }
  if (ASM_GNU_SYNTAX) {
    return codepoint == '\'' || codepoint == '\\' || codepoint == '"';
  }
  return codepoint == '?' || codepoint == '$';
}

static inline bool starts_expression(int32_t codepoint) {
  return starts_term(codepoint) || (ASM_RELOCATION_OPERATORS && codepoint == ':');
}

static inline bool starts_value(int32_t codepoint) {
  return starts_expression(codepoint) || codepoint == ':';
}

static inline bool starts_argument(int32_t codepoint) {
  if (starts_expression(codepoint)) {
    return true;
  }
  if (ASM_GNU_SYNTAX) {
    return codepoint == '%' || (ASM_DOLLAR_IMMEDIATES && codepoint == '$');
  }
  return codepoint == '"' || codepoint == '\'' || codepoint == '`';
}

static inline bool starts_operand(int32_t codepoint) {
  if (ASM_ARM_OPERANDS && (codepoint == '[' || codepoint == '{' || codepoint == '=')) {
    return true;
  }
  return starts_argument(codepoint) || (ASM_X86_OPERANDS && codepoint == '*');
}

static inline bool starts_label_operand(int32_t codepoint) {
  return starts_argument(codepoint) || (ASM_ARM_OPERANDS && (codepoint == '[' || codepoint == '='));
}

static inline bool starts_register_argument(int32_t codepoint) {
  return starts_argument(codepoint) || (ASM_ARM_OPERANDS && codepoint == '{');
}

static inline bool starts_element(int32_t codepoint) {
  return starts_expression(codepoint) || (ASM_DOLLAR_IMMEDIATES && codepoint == '$');
}

static inline bool starts_name(int32_t codepoint) {
  return is_alpha(codepoint) || codepoint == '.' || codepoint == '\\';
}

static inline bool starts_symbol(int32_t codepoint) {
  return is_alpha(codepoint) || codepoint == '.';
}

static inline bool starts_intel_expression(int32_t codepoint) {
  return starts_term(codepoint) || codepoint == '%' || codepoint == '[';
}

static inline bool continues_expression(int32_t codepoint) {
  return codepoint == ')' || codepoint == '+' || codepoint == '-' || codepoint == '*' ||
         codepoint == '/' || codepoint == '<' || codepoint == '>' || codepoint == '=' ||
         codepoint == '!' || codepoint == '&' || codepoint == '|' || codepoint == '^';
}

static inline bool separates_operand(int32_t codepoint) {
  if (codepoint == '[') {
    return false;
  }
  if (codepoint == '#') {
    return ASM_HASH_IMMEDIATES && !ASM_HASH_NEEDS_VALUE;
  }
  if (codepoint == '$' && ASM_DARWIN_ARGUMENTS) {
    return true;
  }
  return starts_operand(codepoint) && !continues_expression(codepoint);
}

static inline bool starts_nasm_name(int32_t codepoint) {
  return is_alpha(codepoint) || codepoint == '.' || codepoint == '?';
}

static inline bool starts_label(int32_t codepoint) {
  if (ASM_GNU_SYNTAX) {
    return is_alpha(codepoint) || codepoint == '.' || is_digit(codepoint) || codepoint == '"';
  }
  return starts_nasm_name(codepoint) || codepoint == '$';
}

static inline bool continues_label(int32_t codepoint) {
  if (ASM_GNU_SYNTAX) {
    return is_word_char(codepoint);
  }
  return is_word_char(codepoint) || codepoint == '#' || codepoint == '@' || codepoint == '~' ||
         codepoint == '?';
}

static inline bool closer_fits(const bool *valid) {
  return valid[MACRO_CLOSE] || valid[CONDITIONAL_CLOSE] || valid[REPEAT_CLOSE];
}

static inline bool directive_word_fits(const bool *valid) {
  return valid[MACRO_OPEN] || valid[IF_OPEN] || valid[REPT_OPEN] || valid[IRP_OPEN] ||
         valid[IRPC_OPEN] || valid[BLANK_SEPARATED_DIRECTIVE] || valid[CFI_REGISTER_DIRECTIVE] ||
         valid[UNWIND_REGISTER_DIRECTIVE] || valid[LINKER_HINT_DIRECTIVE] || valid[INTEL_SYNTAX] ||
         valid[ATT_SYNTAX];
}

static inline bool scanner_dispatches(int32_t codepoint) {
  if (ASM_GNU_SYNTAX) {
    return codepoint == '/' || codepoint == '#' || codepoint == '@' || codepoint == ';';
  }
  return codepoint == ';';
}

static const TSSymbol CLOSING_TOKENS[] = {
    UNCLOSED,
    UNCLOSED_BRACKET,
    UNCLOSED_INDEX,
    UNCLOSED_BRACE,
    UNCLOSED_MEMORY,
    UNCLOSED_ADDRESS,
    UNCLOSED_ARGUMENTS,
    MISSING_OPERAND,
    MISSING_LABEL_OPERAND,
    MISSING_ARGUMENT,
    MISSING_REGISTER_ARGUMENT,
    MISSING_ELEMENT,
    MISSING_EXPRESSION,
    MISSING_NAME,
    MISSING_IDENTIFIER,
    MISSING_SYMBOL,
    MISSING_RELOCATION,
};

static bool closing_token(const bool *valid, TSSymbol *symbol) {
  size_t index = 0;

  while (index < sizeof(CLOSING_TOKENS) / sizeof(CLOSING_TOKENS[0])) {
    if (valid[CLOSING_TOKENS[index]]) {
      *symbol = CLOSING_TOKENS[index];
      return true;
    }
    index++;
  }
  return false;
}

static inline bool closable(const bool *valid) {
  TSSymbol symbol = UNCLOSED;

  return !valid[ERROR_SENTINEL] && !valid[SEPARATOR] && closing_token(valid, &symbol);
}

static inline bool starts_operator(int32_t codepoint) {
  return codepoint == '+' || codepoint == '-' || codepoint == '*' || codepoint == '/' ||
         codepoint == '<' || codepoint == '>' || codepoint == '=' || codepoint == '!' ||
         codepoint == '&' || codepoint == '|' || codepoint == '^';
}

static bool continues_open(int32_t codepoint, const bool *valid) {
  if (starts_operator(codepoint) && valid[REMAINDER]) {
    return true;
  }
  switch (codepoint) {
    case ')':
      return valid[UNCLOSED] || valid[UNCLOSED_ARGUMENTS] || valid[UNCLOSED_MEMORY];
    case ']':
      return valid[UNCLOSED_BRACKET] || valid[UNCLOSED_INDEX] || valid[UNCLOSED_ADDRESS];
    case '}':
      return valid[UNCLOSED_BRACE];
    case ',':
      return valid[UNCLOSED_BRACKET] || valid[UNCLOSED_ARGUMENTS] || valid[UNCLOSED_BRACE] ||
             (valid[UNCLOSED_MEMORY] && !valid[BARE_REGISTER]);
    case '%':
      return ASM_X86_OPERANDS && valid[BARE_REGISTER];
    default:
      return false;
  }
}

static bool starts_missing_operand(int32_t codepoint, const bool *valid) {
  if (ASM_X86_OPERANDS && valid[INTEL_TYPE_WORD]) {
    return starts_intel_expression(codepoint) || codepoint == '$';
  }
  return starts_operand(codepoint);
}

static bool starts_missing_expression(int32_t codepoint, const bool *valid) {
  if (ASM_X86_OPERANDS && valid[INTEL_TYPE_WORD]) {
    return starts_intel_expression(codepoint);
  }
  return starts_expression(codepoint);
}

static bool missing_continues(int32_t codepoint, const bool *valid) {
  return (valid[MISSING_OPERAND] && starts_missing_operand(codepoint, valid)) ||
         (valid[MISSING_LABEL_OPERAND] && starts_label_operand(codepoint)) ||
         (valid[MISSING_ARGUMENT] && starts_argument(codepoint)) ||
         (valid[MISSING_REGISTER_ARGUMENT] && starts_register_argument(codepoint)) ||
         (valid[MISSING_ELEMENT] && starts_element(codepoint)) ||
         (valid[MISSING_EXPRESSION] && starts_missing_expression(codepoint, valid)) ||
         (valid[MISSING_NAME] && starts_name(codepoint)) ||
         (valid[MISSING_IDENTIFIER] && is_alpha(codepoint)) ||
         (valid[MISSING_SYMBOL] && starts_symbol(codepoint));
}

static bool closes_before(int32_t codepoint, const bool *valid) {
  return !missing_continues(codepoint, valid) && !continues_open(codepoint, valid);
}

static bool close_construct(TSLexer *lexer, const bool *valid) {
  TSSymbol symbol = UNCLOSED;

  if (!closing_token(valid, &symbol)) {
    return false;
  }
  lexer->result_symbol = symbol;
  return true;
}

static inline bool at_line_end(const TSLexer *lexer) {
  return lexer->lookahead == '\n' || lexer->eof(lexer);
}

static bool finish_token(TSLexer *lexer, TSSymbol symbol) {
  lexer->mark_end(lexer);
  lexer->result_symbol = symbol;
  return true;
}

static bool line_comment(TSLexer *lexer, const bool *valid) {
  if (!valid[LINE_COMMENT]) {
    return false;
  }
  while (!at_line_end(lexer)) {
    advance(lexer);
  }
  return finish_token(lexer, LINE_COMMENT);
}

static enum CppDirectiveKind cpp_directive_kind(TSLexer *lexer) {
  char word[CPP_WORD_CAPACITY] = {0};
  size_t length = 0;
  size_t index = 0;

  while (is_blank(lexer->lookahead)) {
    advance(lexer);
  }
  while (is_alpha(lexer->lookahead)) {
    if (length + 1 == sizeof(word)) {
      return CPP_NONE;
    }
    word[length] = (char)lexer->lookahead;
    length++;
    advance(lexer);
  }
  if (length == 0 || is_word_char(lexer->lookahead)) {
    return CPP_NONE;
  }
  while (index < sizeof(CPP_DIRECTIVES) / sizeof(CPP_DIRECTIVES[0])) {
    if (strcmp(word, CPP_DIRECTIVES[index].name) == 0) {
      return CPP_DIRECTIVES[index].kind;
    }
    index++;
  }
  return CPP_NONE;
}

static bool directive_follows(TSLexer *lexer) {
  while (is_blank(lexer->lookahead)) {
    advance(lexer);
  }
  if (lexer->lookahead != '.') {
    return false;
  }
  advance(lexer);
  return is_alpha(lexer->lookahead);
}

static bool scan_slash(TSLexer *lexer, const bool *valid, bool closing) {
  advance(lexer);
  if (lexer->lookahead == '/') {
    return line_comment(lexer, valid);
  }
  if (closing && lexer->lookahead != '*' && closes_before('/', valid)) {
    return close_construct(lexer, valid);
  }
  return false;
}

static bool scan_hash(TSLexer *lexer, const bool *valid, bool recovering, uint32_t blanks) {
  enum CppDirectiveKind kind = CPP_NONE;

  advance(lexer);
  if (ASM_HASH_IMMEDIATES && valid[HASH] && !recovering) {
    if (ASM_HASH_NEEDS_VALUE && !starts_value(lexer->lookahead)) {
      return line_comment(lexer, valid);
    }
    return finish_token(lexer, HASH);
  }
  if (valid[PREPROC_DIRECTIVE] && !recovering && lexer->get_column(lexer) == blanks + 1) {
    kind = cpp_directive_kind(lexer);
    if (kind == CPP_INCLUDE && valid[PREPROC_INCLUDE]) {
      return finish_token(lexer, PREPROC_INCLUDE);
    }
    if (kind == CPP_DEFINE && valid[PREPROC_DEFINE]) {
      return finish_token(lexer, PREPROC_DEFINE);
    }
    if (kind == CPP_CONDITION && valid[PREPROC_CONDITION]) {
      return finish_token(lexer, PREPROC_CONDITION);
    }
    if (kind != CPP_NONE) {
      return finish_token(lexer, PREPROC_DIRECTIVE);
    }
  }
  return line_comment(lexer, valid);
}

static bool scan_at(TSLexer *lexer, const bool *valid, bool recovering, bool glued, bool closing) {
  advance(lexer);
  if (!recovering) {
    if (glued && valid[AT_ATTACHED]) {
      return finish_token(lexer, AT_ATTACHED);
    }
    if (valid[AT_TYPE] && is_alpha(lexer->lookahead)) {
      return finish_token(lexer, AT_TYPE);
    }
  }
  if (ASM_AT_COMMENTS) {
    return line_comment(lexer, valid);
  }
  if (closing) {
    return close_construct(lexer, valid);
  }
  return false;
}

static bool semicolon_comment(TSLexer *lexer, const bool *valid) {
  if (!valid[LINE_COMMENT]) {
    return false;
  }
  while (!at_line_end(lexer)) {
    if (lexer->lookahead != ';') {
      advance(lexer);
      continue;
    }
    lexer->mark_end(lexer);
    advance(lexer);
    if (directive_follows(lexer)) {
      lexer->result_symbol = LINE_COMMENT;
      return true;
    }
  }
  return finish_token(lexer, LINE_COMMENT);
}

static bool scan_semicolon(TSLexer *lexer, const bool *valid, bool recovering, bool closing) {
  if (valid[PREFIX_SEMICOLON]) {
    advance(lexer);
    return finish_token(lexer, PREFIX_SEMICOLON);
  }
  if (ASM_SEMICOLONS == SEMICOLON_SEPARATES && closing) {
    return close_construct(lexer, valid);
  }
  advance(lexer);
  if (ASM_SEMICOLONS == SEMICOLON_COMMENTS) {
    return line_comment(lexer, valid);
  }
  if (ASM_SEMICOLONS == SEMICOLON_SEPARATES) {
    if (!valid[SEPARATOR]) {
      return false;
    }
    return finish_token(lexer, SEPARATOR);
  }
  if (closing || (valid[SEPARATOR] && !recovering)) {
    if (!closing) {
      lexer->mark_end(lexer);
    }
    if (directive_follows(lexer)) {
      if (closing) {
        return close_construct(lexer, valid);
      }
      lexer->result_symbol = SEPARATOR;
      return true;
    }
  }
  return semicolon_comment(lexer, valid);
}

static bool scan_string_content(TSLexer *lexer, const bool *valid) {
  bool consumed = false;

  if (at_line_end(lexer) && valid[UNCLOSED]) {
    return finish_token(lexer, UNCLOSED);
  }

  while (lexer->lookahead != '"' && lexer->lookahead != '\\' && !at_line_end(lexer)) {
    advance(lexer);
    consumed = true;
  }
  if (!consumed) {
    return false;
  }
  return finish_token(lexer, STRING_CONTENT);
}

static uint32_t skip_blanks(TSLexer *lexer) {
  uint32_t count = 0;

  while (is_blank(lexer->lookahead)) {
    skip(lexer);
    count++;
  }
  return count;
}

static void consume_line_join(TSLexer *lexer) {
  while (is_blank(lexer->lookahead)) {
    advance(lexer);
  }
  if (lexer->lookahead == '\n') {
    advance(lexer);
  }
}

static void consume_escape(TSLexer *lexer) {
  advance(lexer);
  if (is_blank(lexer->lookahead) || lexer->lookahead == '\n') {
    consume_line_join(lexer);
  } else if (!lexer->eof(lexer)) {
    advance(lexer);
  }
}

static void consume_quoted(TSLexer *lexer) {
  const int32_t quote = lexer->lookahead;

  advance(lexer);
  while (lexer->lookahead != quote && !at_line_end(lexer)) {
    if (lexer->lookahead == '\\') {
      consume_escape(lexer);
    } else {
      advance(lexer);
    }
  }
  if (lexer->lookahead == quote) {
    advance(lexer);
  }
  lexer->mark_end(lexer);
}

static bool preproc_line_comment(TSLexer *lexer, const bool *valid) {
  if (!valid[LINE_COMMENT]) {
    return false;
  }
  while (!at_line_end(lexer)) {
    if (lexer->lookahead == '\\') {
      advance(lexer);
      consume_line_join(lexer);
    } else {
      advance(lexer);
    }
  }
  return finish_token(lexer, LINE_COMMENT);
}

static bool preproc_argument(TSLexer *lexer) {
  lexer->mark_end(lexer);
  while (!at_line_end(lexer)) {
    if (lexer->lookahead == '"' || lexer->lookahead == '\'') {
      consume_quoted(lexer);
    } else if (lexer->lookahead == '\\') {
      advance(lexer);
      lexer->mark_end(lexer);
      consume_line_join(lexer);
    } else if (lexer->lookahead == '/') {
      advance(lexer);
      if (lexer->lookahead == '/' || lexer->lookahead == '*') {
        break;
      }
      lexer->mark_end(lexer);
    } else if (is_blank(lexer->lookahead)) {
      advance(lexer);
    } else {
      advance(lexer);
      lexer->mark_end(lexer);
    }
  }
  lexer->result_symbol = PREPROC_ARGUMENT;
  return true;
}

static bool header_name(TSLexer *lexer) {
  while (lexer->lookahead != '>' && !at_line_end(lexer)) {
    advance(lexer);
  }
  if (lexer->lookahead == '>') {
    advance(lexer);
  }
  return finish_token(lexer, HEADER_NAME);
}

static bool scan_preproc_rest(TSLexer *lexer, const bool *valid) {
  const bool trailing_blanks = is_blank(lexer->lookahead);

  if (lexer->lookahead == '(' && valid[PREPROC_PARAMS_OPEN]) {
    advance(lexer);
    return finish_token(lexer, PREPROC_PARAMS_OPEN);
  }
  skip_blanks(lexer);
  if (at_line_end(lexer)) {
    if (trailing_blanks && valid[PREPROC_LINE_END]) {
      return finish_token(lexer, PREPROC_LINE_END);
    }
    if (valid[END] && lexer->eof(lexer)) {
      return finish_token(lexer, END);
    }
    return false;
  }
  if (lexer->lookahead == '<' && valid[HEADER_NAME]) {
    return header_name(lexer);
  }
  if (lexer->lookahead == '/') {
    advance(lexer);
    if (lexer->lookahead == '/') {
      return preproc_line_comment(lexer, valid);
    }
    if (lexer->lookahead == '*') {
      return false;
    }
    lexer->mark_end(lexer);
  }
  return preproc_argument(lexer);
}

static bool needs_second_character(int32_t first, const bool *valid) {
  if (valid[REMAINDER] && (first == '=' || (first == '!' && !ASM_BANG_OPERATOR))) {
    return true;
  }
  if (first == '.') {
    return valid[MISSING_NAME] || valid[MISSING_SYMBOL];
  }
  if (ASM_GNU_SYNTAX) {
    return first == '\\';
  }
  return first == '$';
}

static bool token_follows(TSLexer *lexer) {
  const int32_t first = lexer->lookahead;

  advance(lexer);
  if (first == '=' || first == '!') {
    return lexer->lookahead == '=';
  }
  if (first == '\\') {
    return is_alpha(lexer->lookahead) || lexer->lookahead == '@' || lexer->lookahead == '+';
  }
  if (first == '.') {
    return is_alpha(lexer->lookahead);
  }
  return starts_nasm_name(lexer->lookahead);
}

static void take_word_char(TSLexer *lexer, char *word, size_t *length) {
  int32_t codepoint = lexer->lookahead;

  if (word != NULL) {
    if (codepoint >= 'A' && codepoint <= 'Z') {
      codepoint += 'a' - 'A';
    }
    if (*length + 1 < STATEMENT_WORD_CAPACITY) {
      word[*length] = (char)codepoint;
      (*length)++;
    } else {
      word[0] = '\0';
    }
  }
  advance(lexer);
}

static void skip_inline_blanks(TSLexer *lexer) {
  while (lexer->lookahead == ' ' || lexer->lookahead == '\t') {
    advance(lexer);
  }
}

static void read_alnum(TSLexer *lexer, char *word) {
  size_t length = 0;

  while (is_alpha(lexer->lookahead) || is_digit(lexer->lookahead)) {
    if (length + 1 < STATEMENT_WORD_CAPACITY) {
      word[length] = (char)lexer->lookahead;
      length++;
    } else {
      word[0] = '\0';
    }
    advance(lexer);
  }
  word[length] = '\0';
}

static bool same_letters(const char *word, const char *lower) {
  while (*lower != '\0') {
    if (*word != *lower && *word != *lower - ('a' - 'A')) {
      return false;
    }
    word++;
    lower++;
  }
  return *word == '\0';
}

static bool is_mask_register(const char *word) {
  return (word[0] == 'k' || word[0] == 'K') && word[1] >= '0' && word[1] <= '7' && word[2] == '\0';
}

static bool is_rounding_word(const char *word) {
  return strcmp(word, "rn") == 0 || strcmp(word, "rd") == 0 || strcmp(word, "ru") == 0 ||
         strcmp(word, "rz") == 0;
}

static bool is_broadcast(const char *word) {
  return strcmp(word, "1to2") == 0 || strcmp(word, "1to4") == 0 || strcmp(word, "1to8") == 0 ||
         strcmp(word, "1to16") == 0 || strcmp(word, "1to32") == 0;
}

static bool is_flag_word(const char *word) {
  return same_letters(word, "of") || same_letters(word, "sf") || same_letters(word, "zf") ||
         same_letters(word, "cf");
}

static bool word_after(TSLexer *lexer, int32_t separator, char *word) {
  skip_inline_blanks(lexer);
  if (lexer->lookahead != separator) {
    return false;
  }
  advance(lexer);
  skip_inline_blanks(lexer);
  read_alnum(lexer, word);
  return true;
}

static bool default_flags_follow(TSLexer *lexer) {
  char flag[STATEMENT_WORD_CAPACITY] = {0};

  skip_inline_blanks(lexer);
  if (lexer->lookahead != '=') {
    return false;
  }
  advance(lexer);
  skip_inline_blanks(lexer);
  if (lexer->lookahead == '}') {
    return true;
  }
  read_alnum(lexer, flag);
  while (is_flag_word(flag)) {
    skip_inline_blanks(lexer);
    if (lexer->lookahead != ',') {
      return true;
    }
    flag[0] = '\0';
    if (!word_after(lexer, ',', flag)) {
      return false;
    }
  }
  return false;
}

static bool decorator_body_follows(TSLexer *lexer) {
  char word[STATEMENT_WORD_CAPACITY] = {0};
  char rest[STATEMENT_WORD_CAPACITY] = {0};

  if (lexer->lookahead == '%') {
    advance(lexer);
    skip_inline_blanks(lexer);
    read_alnum(lexer, word);
    return is_mask_register(word);
  }
  read_alnum(lexer, word);
  if (is_mask_register(word) || strcmp(word, "z") == 0 || strcmp(word, "sae") == 0 ||
      is_broadcast(word)) {
    return true;
  }
  if (is_rounding_word(word)) {
    return word_after(lexer, '-', rest) && strcmp(rest, "sae") == 0;
  }
  return same_letters(word, "dfv") && default_flags_follow(lexer);
}

static bool listed_name(const char *word, const char *const *names, size_t count) {
  size_t low = 0;
  size_t high = count;

  while (low < high) {
    const size_t middle = low + ((high - low) / 2);
    const int order = strcmp(word, names[middle]);

    if (order == 0) {
      return true;
    }
    if (order < 0) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  return false;
}

static bool pseudo_prefix_follows(TSLexer *lexer) {
  char word[STATEMENT_WORD_CAPACITY] = {0};
  size_t length = 0;

  while (is_alpha(lexer->lookahead) || is_digit(lexer->lookahead)) {
    take_word_char(lexer, word, &length);
  }
  return listed_name(word, X86_PSEUDO_PREFIXES,
                     sizeof(X86_PSEUDO_PREFIXES) / sizeof(X86_PSEUDO_PREFIXES[0]));
}

static bool braced_token_follows(TSLexer *lexer, TSSymbol symbol) {
  advance(lexer);
  skip_inline_blanks(lexer);
  if (symbol == PSEUDO_PREFIX ? !pseudo_prefix_follows(lexer) : !decorator_body_follows(lexer)) {
    return false;
  }
  skip_inline_blanks(lexer);
  if (lexer->lookahead != '}') {
    return false;
  }
  advance(lexer);
  return true;
}

enum ClosingDecision {
  CLOSING_UNDECIDED,
  CLOSING_CLOSES,
  CLOSING_STAYS_OPEN,
};

static enum ClosingDecision closing_decision(TSLexer *lexer, const bool *valid, bool closing) {
  if (!closing) {
    return CLOSING_UNDECIDED;
  }
  lexer->mark_end(lexer);
  if (at_line_end(lexer)) {
    return CLOSING_CLOSES;
  }
  if (scanner_dispatches(lexer->lookahead)) {
    return CLOSING_UNDECIDED;
  }
  if (closes_before(lexer->lookahead, valid)) {
    return CLOSING_CLOSES;
  }
  if (!needs_second_character(lexer->lookahead, valid)) {
    return CLOSING_UNDECIDED;
  }
  if (token_follows(lexer)) {
    return CLOSING_STAYS_OPEN;
  }
  return CLOSING_CLOSES;
}

static bool label_fits(const bool *valid) {
  return valid[GLOBAL_LABEL_NAME] || valid[LOCAL_LABEL_NAME] || valid[NUMERIC_LABEL_NAME] ||
         valid[DOLLAR_LABEL_NAME];
}

static bool statement_word_fits(TSLexer *lexer, const bool *valid) {
  return (label_fits(valid) || closer_fits(valid) || directive_word_fits(valid) ||
          valid[PREFIX_WORD]) &&
         starts_label(lexer->lookahead);
}

static bool scan_end_of_input(TSLexer *lexer, const bool *valid, bool recovering, bool closed_input,
                              bool *closes_input) {
  if (recovering && closed_input) {
    return false;
  }
  if (valid[END] && !recovering) {
    *closes_input = true;
    return finish_token(lexer, END);
  }
  if (valid[BLOCK_END] || recovering || !label_fits(valid)) {
    *closes_input = true;
    return finish_token(lexer, BLOCK_END);
  }
  return false;
}

static bool read_quoted_label(TSLexer *lexer, TSSymbol *symbol) {
  const char *const local_prefix = ASM_DARWIN_LOCALS ? "L" : ".L";
  size_t matched = 0;
  size_t length = 0;

  advance(lexer);
  while (lexer->lookahead != '"') {
    if (at_line_end(lexer)) {
      return false;
    }
    if (matched == length && local_prefix[matched] != '\0' &&
        lexer->lookahead == local_prefix[matched]) {
      matched++;
    }
    if (lexer->lookahead == '\\') {
      advance(lexer);
      if (at_line_end(lexer)) {
        return false;
      }
    }
    advance(lexer);
    length++;
  }
  advance(lexer);
  *symbol = local_prefix[matched] == '\0' ? LOCAL_LABEL_NAME : GLOBAL_LABEL_NAME;
  return true;
}

static bool read_label_word(TSLexer *lexer, const bool *valid, TSSymbol *symbol, char *word) {
  bool local = false;
  size_t length = 0;
  char *kept_word = NULL;

  if (((closer_fits(valid) || directive_word_fits(valid)) && lexer->lookahead == '.') ||
      valid[PREFIX_WORD]) {
    kept_word = word;
  }

  if (is_digit(lexer->lookahead)) {
    while (is_digit(lexer->lookahead)) {
      advance(lexer);
    }
    *symbol = NUMERIC_LABEL_NAME;
    if (lexer->lookahead == '$' && valid[DOLLAR_LABEL_NAME]) {
      advance(lexer);
      *symbol = DOLLAR_LABEL_NAME;
    }
    return true;
  }
  if (ASM_GNU_SYNTAX && lexer->lookahead == '"') {
    return read_quoted_label(lexer, symbol);
  }
  if (!ASM_GNU_SYNTAX) {
    if (lexer->lookahead == '$') {
      take_word_char(lexer, kept_word, &length);
    }
    if (!starts_nasm_name(lexer->lookahead)) {
      return false;
    }
    local = lexer->lookahead == '.';
    take_word_char(lexer, kept_word, &length);
  } else if (lexer->lookahead == '.') {
    take_word_char(lexer, kept_word, &length);
    local = !ASM_DARWIN_LOCALS && lexer->lookahead == 'L';
    if (!is_alpha(lexer->lookahead)) {
      return false;
    }
  } else {
    local = ASM_DARWIN_LOCALS && lexer->lookahead == 'L';
  }
  while (continues_label(lexer->lookahead)) {
    take_word_char(lexer, kept_word, &length);
  }
  *symbol = GLOBAL_LABEL_NAME;
  if (local) {
    *symbol = LOCAL_LABEL_NAME;
  }
  return true;
}

static bool scan_stray_label(TSLexer *lexer, const bool *valid) {
  TSSymbol symbol = GLOBAL_LABEL_NAME;
  char word[STATEMENT_WORD_CAPACITY] = {0};

  if (!read_label_word(lexer, valid, &symbol, word)) {
    return false;
  }
  while (is_blank(lexer->lookahead)) {
    advance(lexer);
  }
  if (lexer->lookahead != ':') {
    return false;
  }
  advance(lexer);
  return finish_token(lexer, STRAY);
}

static bool word_symbol(const char *word, const struct Word *words, size_t count,
                        TSSymbol *symbol) {
  size_t low = 0;
  size_t high = count;

  while (low < high) {
    const size_t middle = low + ((high - low) / 2);
    const int order = strcmp(word, words[middle].name);

    if (order == 0) {
      *symbol = words[middle].symbol;
      return true;
    }
    if (order < 0) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  return false;
}

static inline bool is_closer(TSSymbol symbol) {
  return symbol == MACRO_CLOSE || symbol == CONDITIONAL_CLOSE || symbol == REPEAT_CLOSE;
}

static inline bool is_clause(TSSymbol symbol) {
  return symbol == ELSEIF || symbol == ELSE;
}

static bool is_suffix_relocation(const char *word) {
  return listed_name(word, SUFFIX_RELOCATIONS,
                     sizeof(SUFFIX_RELOCATIONS) / sizeof(SUFFIX_RELOCATIONS[0]));
}

static bool scan_register_alias_word(TSLexer *lexer, const bool *valid) {
  char word[STATEMENT_WORD_CAPACITY] = {0};
  size_t length = 0;
  bool upper = false;
  TSSymbol symbol = REGISTER_ALIAS_WORD;

  while (is_word_char(lexer->lookahead)) {
    upper = upper || (lexer->lookahead >= 'A' && lexer->lookahead <= 'Z');
    take_word_char(lexer, word, &length);
  }
  if (!word_symbol(word, STATEMENT_WORDS, sizeof(STATEMENT_WORDS) / sizeof(STATEMENT_WORDS[0]),
                   &symbol) ||
      !valid[symbol]) {
    return false;
  }
  if (symbol == REGISTER_ALIAS_WORD || (symbol == NEON_ALIAS_WORD && !upper)) {
    return finish_token(lexer, symbol);
  }
  return false;
}

static bool numbered_register(const char *word, const struct RegisterFamily *family) {
  const char *prefix = family->prefix;
  const char *suffix = family->suffixes;
  const char *rest = word;
  unsigned number = 0;
  size_t digits = 0;

  while (*prefix != '\0') {
    if (*prefix != *rest) {
      return false;
    }
    prefix++;
    rest++;
  }
  while (is_digit(rest[digits]) && digits < 2) {
    number = (number * DECIMAL_BASE) + (unsigned)(rest[digits] - '0');
    digits++;
  }
  if (digits == 0 || (digits == 2 && rest[0] == '0') || number < family->first ||
      number > family->last) {
    return false;
  }
  rest += digits;
  if (*rest == '\0') {
    return true;
  }
  if (rest[1] != '\0') {
    return false;
  }
  while (*suffix != '\0') {
    if (*suffix == *rest) {
      return true;
    }
    suffix++;
  }
  return false;
}

static bool is_x86_register(const char *word) {
  size_t index = 0;

  if (listed_name(word, X86_REGISTER_NAMES,
                  sizeof(X86_REGISTER_NAMES) / sizeof(X86_REGISTER_NAMES[0]))) {
    return true;
  }
  while (index < sizeof(X86_REGISTER_FAMILIES) / sizeof(X86_REGISTER_FAMILIES[0])) {
    if (numbered_register(word, &X86_REGISTER_FAMILIES[index])) {
      return true;
    }
    index++;
  }
  return false;
}

static void take_stack_index(TSLexer *lexer) {
  skip_inline_blanks(lexer);
  if (lexer->lookahead != '(') {
    return;
  }
  advance(lexer);
  skip_inline_blanks(lexer);
  if (lexer->lookahead < '0' || lexer->lookahead > '7') {
    return;
  }
  advance(lexer);
  skip_inline_blanks(lexer);
  if (lexer->lookahead == ')') {
    advance(lexer);
    lexer->mark_end(lexer);
  }
}

static bool bare_register_fits(const bool *valid, const struct Scanner *scanner) {
  return ASM_X86_OPERANDS && valid[BARE_REGISTER] && (scanner->x86_syntax & X86_NOPREFIX) != 0;
}

static bool intel_word_fits(const bool *valid, const struct Scanner *scanner) {
  return ASM_X86_OPERANDS && (scanner->x86_syntax & X86_INTEL) != 0 &&
         (valid[INTEL_TYPE_WORD] || valid[INTEL_PTR_WORD] || valid[INTEL_UNARY_WORD] ||
          valid[INTEL_MULTIPLICATIVE_WORD] || valid[INTEL_BITWISE_WORD] ||
          valid[INTEL_COMPARISON_WORD] || valid[INTEL_FLAT_WORD]);
}

static bool operand_word_fits(const bool *valid, const struct Scanner *scanner) {
  return valid[SUFFIX_RELOCATION_NAME] || bare_register_fits(valid, scanner) ||
         intel_word_fits(valid, scanner);
}

static bool scan_intel_word(TSLexer *lexer, const bool *valid, const struct Scanner *scanner,
                            const char *word) {
  TSSymbol symbol = INTEL_TYPE_WORD;

  if (!intel_word_fits(valid, scanner) ||
      !word_symbol(word, INTEL_WORDS, sizeof(INTEL_WORDS) / sizeof(INTEL_WORDS[0]), &symbol) ||
      !valid[symbol]) {
    return false;
  }
  if (symbol == INTEL_FLAT_WORD && lexer->lookahead != ':') {
    return false;
  }
  return finish_token(lexer, symbol);
}

static bool scan_operand_word(TSLexer *lexer, const bool *valid, const struct Scanner *scanner) {
  char word[STATEMENT_WORD_CAPACITY] = {0};
  size_t length = 0;

  while (is_word_char(lexer->lookahead)) {
    take_word_char(lexer, word, &length);
  }
  if (valid[SUFFIX_RELOCATION_NAME] && is_suffix_relocation(word)) {
    return finish_token(lexer, SUFFIX_RELOCATION_NAME);
  }
  if (scan_intel_word(lexer, valid, scanner, word)) {
    return true;
  }
  if (!bare_register_fits(valid, scanner) || !is_x86_register(word)) {
    return false;
  }
  lexer->mark_end(lexer);
  if (strcmp(word, "st") == 0) {
    take_stack_index(lexer);
  }
  lexer->result_symbol = BARE_REGISTER;
  return true;
}

static bool scan_syntax_argument(TSLexer *lexer, const bool *valid) {
  char word[STATEMENT_WORD_CAPACITY] = {0};
  size_t length = 0;
  bool upper = false;

  while (is_word_char(lexer->lookahead)) {
    upper = upper || (lexer->lookahead >= 'A' && lexer->lookahead <= 'Z');
    take_word_char(lexer, word, &length);
  }
  if (upper) {
    return false;
  }
  if (valid[SYNTAX_PREFIX] && strcmp(word, "prefix") == 0) {
    return finish_token(lexer, SYNTAX_PREFIX);
  }
  if (valid[SYNTAX_NOPREFIX] && strcmp(word, "noprefix") == 0) {
    return finish_token(lexer, SYNTAX_NOPREFIX);
  }
  return false;
}

static void follow_x86_syntax(struct Scanner *scanner, TSSymbol symbol) {
  switch (symbol) {
    case INTEL_SYNTAX:
      scanner->x86_syntax = X86_INTEL | X86_NOPREFIX;
      break;
    case ATT_SYNTAX:
      scanner->x86_syntax = 0;
      break;
    case SYNTAX_PREFIX:
      scanner->x86_syntax = (unsigned char)(scanner->x86_syntax & ~X86_NOPREFIX);
      break;
    case SYNTAX_NOPREFIX:
      scanner->x86_syntax = (unsigned char)(scanner->x86_syntax | X86_NOPREFIX);
      break;
    default:
      break;
  }
}

static bool is_rex_prefix(const char *word) {
  const char *rest = word + 3;

  if (strncmp(word, "rex", 3) != 0) {
    return false;
  }
  if (*rest == '.') {
    rest++;
    if (*rest == '\0') {
      return false;
    }
    rest += *rest == 'w';
    rest += *rest == 'r';
    rest += *rest == 'x';
    rest += *rest == 'b';
    return *rest == '\0';
  }
  if (strncmp(rest, "64", 2) == 0) {
    rest += 2;
  }
  rest += *rest == 'x';
  rest += *rest == 'y';
  rest += *rest == 'z';
  return *rest == '\0';
}

static bool is_x86_prefix(const char *word) {
  size_t index = 0;

  while (index < sizeof(X86_PREFIXES) / sizeof(X86_PREFIXES[0])) {
    if (strcmp(word, X86_PREFIXES[index]) == 0) {
      return true;
    }
    index++;
  }
  return is_rex_prefix(word);
}

static bool prefix_ends(const TSLexer *lexer) {
  const int32_t next = lexer->lookahead;

  return at_line_end(lexer) || next == ';' || next == '{' || next == '#' || next == '/' ||
         next == '\\' || is_alpha(next);
}

static bool ends_inner_block(TSSymbol closer, const bool *valid) {
  size_t index = 0;

  if (!valid[BLOCK_END] || valid[closer]) {
    return false;
  }
  while (index < sizeof(IMPLICIT_ENDS) / sizeof(IMPLICIT_ENDS[0])) {
    if (IMPLICIT_ENDS[index].closer == closer && valid[IMPLICIT_ENDS[index].ends]) {
      return true;
    }
    index++;
  }
  return false;
}

static bool macro_label_follows(TSLexer *lexer) {
  unsigned depth = 0;

  do {
    if (at_line_end(lexer)) {
      return false;
    }
    if (lexer->lookahead == '(') {
      depth++;
    } else if (lexer->lookahead == ')') {
      depth--;
    }
    advance(lexer);
  } while (depth > 0);
  skip_inline_blanks(lexer);
  return lexer->lookahead == ':';
}

static bool scan_statement_word(TSLexer *lexer, const bool *valid) {
  TSSymbol symbol = GLOBAL_LABEL_NAME;
  TSSymbol keyword = MACRO_CLOSE;
  bool known = false;
  char word[STATEMENT_WORD_CAPACITY] = {0};

  lexer->mark_end(lexer);
  if (!read_label_word(lexer, valid, &symbol, word)) {
    return false;
  }
  known = word[0] != '\0' &&
          word_symbol(word, STATEMENT_WORDS, sizeof(STATEMENT_WORDS) / sizeof(STATEMENT_WORDS[0]),
                      &keyword);
  if (known && is_closer(keyword) && ends_inner_block(keyword, valid)) {
    while (is_blank(lexer->lookahead)) {
      advance(lexer);
    }
    if (lexer->lookahead == ':') {
      return false;
    }
    lexer->result_symbol = BLOCK_END;
    return true;
  }
  lexer->mark_end(lexer);
  while (is_blank(lexer->lookahead)) {
    advance(lexer);
  }
  if (lexer->lookahead == '(' && valid[MACRO_LABEL_NAME] && macro_label_follows(lexer)) {
    lexer->result_symbol = MACRO_LABEL_NAME;
    return true;
  }
  if (lexer->lookahead == ':') {
    if (!valid[symbol]) {
      return false;
    }
    lexer->result_symbol = symbol;
    return true;
  }
  if (word[0] == '\0') {
    return false;
  }
  if (valid[PREFIX_WORD] && is_x86_prefix(word) && prefix_ends(lexer)) {
    lexer->result_symbol = PREFIX_WORD;
    return true;
  }
  if (!known) {
    return false;
  }
  if (valid[keyword]) {
    lexer->result_symbol = keyword;
    return true;
  }
  if (is_clause(keyword) && valid[CONDITIONAL_CLOSE]) {
    lexer->result_symbol = STRAY;
    return true;
  }
  return false;
}

static bool scan_relocation_specifier(TSLexer *lexer) {
  while (is_word_char(lexer->lookahead)) {
    advance(lexer);
  }
  return finish_token(lexer, RELOCATION_SPECIFIER);
}

static bool glue_fits(const TSLexer *lexer, const bool *valid) {
  if (lexer->lookahead == '\\') {
    return valid[GLUED_ARGUMENT] || valid[GLUED_SEPARATOR];
  }
  return valid[GLUED_TEXT] && is_word_char(lexer->lookahead);
}

static bool read_glued_escape(TSLexer *lexer, const bool *valid, TSSymbol *symbol) {
  advance(lexer);
  if (lexer->lookahead == '(') {
    advance(lexer);
    if (lexer->lookahead != ')' || !valid[GLUED_SEPARATOR]) {
      return false;
    }
    advance(lexer);
    *symbol = GLUED_SEPARATOR;
    return true;
  }
  if (!valid[GLUED_ARGUMENT]) {
    return false;
  }
  *symbol = GLUED_ARGUMENT;
  if (lexer->lookahead == '@' || lexer->lookahead == '+') {
    advance(lexer);
    return true;
  }
  if (!is_alpha(lexer->lookahead)) {
    return false;
  }
  while (is_alpha(lexer->lookahead) || is_digit(lexer->lookahead)) {
    advance(lexer);
  }
  return true;
}

static bool scan_glued(TSLexer *lexer, const bool *valid, bool closing) {
  TSSymbol symbol = GLUED_ARGUMENT;

  if (lexer->lookahead != '\\') {
    while (is_word_char(lexer->lookahead)) {
      advance(lexer);
    }
    return finish_token(lexer, GLUED_TEXT);
  }
  lexer->mark_end(lexer);
  if (read_glued_escape(lexer, valid, &symbol)) {
    return finish_token(lexer, symbol);
  }
  if (closing) {
    return close_construct(lexer, valid);
  }
  return false;
}

static bool scan_dollar_label(TSLexer *lexer) {
  while (is_digit(lexer->lookahead)) {
    advance(lexer);
  }
  if (lexer->lookahead != '$') {
    return false;
  }
  advance(lexer);
  return finish_token(lexer, DOLLAR_LABEL);
}

static bool scan_darwin_argument(TSLexer *lexer, const bool *valid, bool closing) {
  lexer->mark_end(lexer);
  advance(lexer);
  if (is_digit(lexer->lookahead) || lexer->lookahead == 'n') {
    advance(lexer);
    return finish_token(lexer, DARWIN_ARGUMENT);
  }
  if (closing) {
    return close_construct(lexer, valid);
  }
  return false;
}

enum ScanDecision {
  SCAN_UNDECIDED,
  SCAN_FOUND,
  SCAN_NOT_FOUND,
};

static enum ScanDecision decided(bool found) {
  return found ? SCAN_FOUND : SCAN_NOT_FOUND;
}

static bool relocation_operator_follows(TSLexer *lexer) {
  advance(lexer);
  skip_inline_blanks(lexer);
  if (!is_alpha(lexer->lookahead)) {
    return false;
  }
  while (is_word_char(lexer->lookahead)) {
    advance(lexer);
  }
  skip_inline_blanks(lexer);
  return lexer->lookahead == ':';
}

static bool segment_colon_follows(TSLexer *lexer) {
  return ASM_X86_OPERANDS && ASM_RELOCATION_OPERATORS && lexer->lookahead == ':' &&
         !relocation_operator_follows(lexer);
}

enum ParenthesisContent {
  CONTENT_OTHER,
  CONTENT_MEMORY,
  CONTENT_SUFFIX,
};

static enum ParenthesisContent parenthesis_content(TSLexer *lexer, unsigned char x86_syntax) {
  char word[STATEMENT_WORD_CAPACITY] = {0};
  size_t length = 0;
  const bool glued = !is_blank(lexer->lookahead);
  const bool att = ASM_X86_OPERANDS && (x86_syntax & X86_INTEL) == 0;

  skip_inline_blanks(lexer);
  if (att && (lexer->lookahead == '%' || lexer->lookahead == ',')) {
    return CONTENT_MEMORY;
  }
  while (is_word_char(lexer->lookahead)) {
    take_word_char(lexer, word, &length);
  }
  if (glued && ASM_SUFFIX_RELOCATIONS && is_suffix_relocation(word)) {
    return CONTENT_SUFFIX;
  }
  if (att && (x86_syntax & X86_NOPREFIX) != 0 && is_x86_register(word)) {
    return CONTENT_MEMORY;
  }
  return CONTENT_OTHER;
}

static enum ScanDecision scan_parenthesis(TSLexer *lexer, const bool *valid,
                                          unsigned char x86_syntax, bool split) {
  enum ParenthesisContent content = CONTENT_OTHER;

  lexer->mark_end(lexer);
  advance(lexer);
  content = parenthesis_content(lexer, x86_syntax);
  if (valid[MEMORY_ADDRESS] && content == CONTENT_MEMORY) {
    lexer->result_symbol = MEMORY_ADDRESS;
    return SCAN_FOUND;
  }
  if (valid[RELOCATION_SUFFIX] && content == CONTENT_SUFFIX) {
    lexer->result_symbol = RELOCATION_SUFFIX;
    return SCAN_FOUND;
  }
  if (split) {
    lexer->result_symbol = BLANK;
    return content == CONTENT_OTHER ? SCAN_FOUND : SCAN_NOT_FOUND;
  }
  if (valid[CALL_ARGUMENTS] || valid[RELOCATION_SUFFIX]) {
    lexer->result_symbol = valid[CALL_ARGUMENTS] ? CALL_ARGUMENTS : RELOCATION_SUFFIX;
    return SCAN_FOUND;
  }
  return SCAN_NOT_FOUND;
}

static bool intel_operands_follow(const TSLexer *lexer, const bool *valid,
                                  const struct Scanner *scanner) {
  if (!ASM_X86_OPERANDS || !valid[INTEL_OPERANDS] || (scanner->x86_syntax & X86_INTEL) == 0 ||
      at_line_end(lexer)) {
    return false;
  }
  return lexer->lookahead != ';' && lexer->lookahead != '#' && lexer->lookahead != '/' &&
         lexer->lookahead != '@' && lexer->lookahead != '=';
}

static bool scan_remainder(TSLexer *lexer, const bool *valid) {
  if (!valid[REMAINDER] || lexer->lookahead != '%') {
    return false;
  }
  advance(lexer);
  return finish_token(lexer, REMAINDER);
}

static enum ScanDecision scan_relocation_name(TSLexer *lexer, const bool *valid) {
  char word[STATEMENT_WORD_CAPACITY] = {0};
  size_t length = 0;
  const int32_t first = lexer->lookahead;

  lexer->mark_end(lexer);
  while (is_word_char(lexer->lookahead)) {
    take_word_char(lexer, word, &length);
  }
  if (listed_name(word, RELOCATION_NAMES, sizeof(RELOCATION_NAMES) / sizeof(RELOCATION_NAMES[0]))) {
    return decided(finish_token(lexer, RELOCATION_NAME));
  }
  return decided(closable(valid) && closes_before(first, valid) && close_construct(lexer, valid));
}

static enum ScanDecision scan_braced(TSLexer *lexer, const bool *valid, uint32_t blanks) {
  const TSSymbol symbol = valid[PSEUDO_PREFIX] ? PSEUDO_PREFIX : DECORATOR;

  lexer->mark_end(lexer);
  if (braced_token_follows(lexer, symbol)) {
    return decided(finish_token(lexer, symbol));
  }
  if (valid[BLANK] && blanks > 0 && separates_operand('{')) {
    lexer->result_symbol = BLANK;
    return SCAN_FOUND;
  }
  return decided(closable(valid) && closes_before('{', valid) && close_construct(lexer, valid));
}

static bool scan_colon(TSLexer *lexer, const bool *valid) {
  advance(lexer);
  lexer->mark_end(lexer);
  if (valid[RELOCATION_COLON] || valid[SEGMENT_COLON]) {
    lexer->result_symbol = valid[RELOCATION_COLON] ? RELOCATION_COLON : SEGMENT_COLON;
    return true;
  }
  if (ASM_RELOCATION_OPERATORS && valid[MISSING_ELEMENT]) {
    skip_inline_blanks(lexer);
    if (!is_digit(lexer->lookahead)) {
      return false;
    }
  }
  lexer->result_symbol = BRACKET_COLON;
  return true;
}

static enum ScanDecision scan_word_token(TSLexer *lexer, const bool *valid,
                                         const struct Scanner *scanner, uint32_t blanks) {
  const int32_t first = lexer->lookahead;

  lexer->mark_end(lexer);
  if (scan_operand_word(lexer, valid, scanner)) {
    return SCAN_FOUND;
  }
  if (valid[BLANK] && blanks > 0) {
    lexer->result_symbol = BLANK;
    return SCAN_FOUND;
  }
  return decided(closable(valid) && closes_before(first, valid) && close_construct(lexer, valid));
}

static enum ScanDecision scan_blank(TSLexer *lexer, const bool *valid,
                                    const struct Scanner *scanner, uint32_t blanks) {
  if (!valid[BLANK] || blanks == 0 || !separates_operand(lexer->lookahead)) {
    return SCAN_UNDECIDED;
  }
  if (lexer->lookahead == '(') {
    return scan_parenthesis(lexer, valid, scanner->x86_syntax, true);
  }
  lexer->mark_end(lexer);
  if (segment_colon_follows(lexer)) {
    return SCAN_NOT_FOUND;
  }
  lexer->result_symbol = BLANK;
  return SCAN_FOUND;
}

static enum ScanDecision scan_expected_token(TSLexer *lexer, const bool *valid,
                                             unsigned char x86_syntax) {
  const int32_t first = lexer->lookahead;

  if (first == ':' && (valid[BRACKET_COLON] || valid[RELOCATION_COLON] || valid[SEGMENT_COLON])) {
    return decided(scan_colon(lexer, valid));
  }
  if ((first == ',' && valid[MEMORY_COMMA]) || (first == '-' && valid[RANGE_DASH])) {
    advance(lexer);
    return decided(finish_token(lexer, first == ',' ? MEMORY_COMMA : RANGE_DASH));
  }
  if (first == '(' &&
      (valid[CALL_ARGUMENTS] || valid[RELOCATION_SUFFIX] || valid[MEMORY_ADDRESS])) {
    return scan_parenthesis(lexer, valid, x86_syntax, false);
  }
  if (first == '[' && valid[INDEX_OPEN]) {
    advance(lexer);
    return decided(finish_token(lexer, INDEX_OPEN));
  }
  if (first == '.' && (valid[REGISTER_ALIAS_WORD] || valid[NEON_ALIAS_WORD])) {
    return decided(scan_register_alias_word(lexer, valid));
  }
  if (is_alpha(first) && (valid[SYNTAX_PREFIX] || valid[SYNTAX_NOPREFIX])) {
    return decided(scan_syntax_argument(lexer, valid));
  }
  return SCAN_UNDECIDED;
}

static enum ScanDecision scan_operand_token(TSLexer *lexer, const bool *valid,
                                            const struct Scanner *scanner, uint32_t blanks) {
  const int32_t first = lexer->lookahead;
  enum ScanDecision decision = SCAN_UNDECIDED;

  if (scan_remainder(lexer, valid)) {
    return SCAN_FOUND;
  }
  if (is_alpha(first) && valid[RELOCATION_NAME]) {
    return scan_relocation_name(lexer, valid);
  }
  if (is_alpha(first) && operand_word_fits(valid, scanner)) {
    return scan_word_token(lexer, valid, scanner, blanks);
  }
  if (first == '{' && (valid[DECORATOR] || valid[PSEUDO_PREFIX])) {
    return scan_braced(lexer, valid, blanks);
  }
  decision = scan_blank(lexer, valid, scanner, blanks);
  if (decision != SCAN_UNDECIDED) {
    return decision;
  }
  return scan_expected_token(lexer, valid, scanner->x86_syntax);
}

static bool scan_gnu(TSLexer *lexer, const bool *valid, const struct Scanner *scanner,
                     bool *closes_input) {
  const bool recovering = valid[ERROR_SENTINEL];
  const bool glued = !is_blank(lexer->lookahead);
  const bool closing = closable(valid);
  uint32_t blanks = 0;

  if (valid[STRING_CONTENT] && !recovering) {
    return scan_string_content(lexer, valid);
  }
  if (valid[PREPROC_ARGUMENT] && !recovering) {
    return scan_preproc_rest(lexer, valid);
  }
  if (glued && !recovering && valid[RELOCATION_SPECIFIER] && is_alpha(lexer->lookahead)) {
    return scan_relocation_specifier(lexer);
  }
  if (glued && !recovering && glue_fits(lexer, valid)) {
    return scan_glued(lexer, valid, closing);
  }
  blanks = skip_blanks(lexer);
  if (!recovering && intel_operands_follow(lexer, valid, scanner)) {
    return finish_token(lexer, INTEL_OPERANDS);
  }
  if (!recovering) {
    switch (scan_operand_token(lexer, valid, scanner, blanks)) {
      case SCAN_FOUND:
        return true;
      case SCAN_NOT_FOUND:
        return false;
      default:
        break;
    }
  }
  if (valid[DARWIN_ARGUMENT] && !recovering && lexer->lookahead == '$') {
    return scan_darwin_argument(lexer, valid, closing);
  }
  switch (closing_decision(lexer, valid, closing)) {
    case CLOSING_CLOSES:
      return close_construct(lexer, valid);
    case CLOSING_STAYS_OPEN:
      return false;
    default:
      break;
  }
  if (lexer->eof(lexer)) {
    return scan_end_of_input(lexer, valid, recovering, scanner->closed_input, closes_input);
  }
  if (recovering && starts_label(lexer->lookahead)) {
    return scan_stray_label(lexer, valid);
  }
  if (statement_word_fits(lexer, valid)) {
    return scan_statement_word(lexer, valid);
  }
  if (valid[DOLLAR_LABEL] && !recovering && is_digit(lexer->lookahead)) {
    return scan_dollar_label(lexer);
  }
  switch (lexer->lookahead) {
    case '/':
      return scan_slash(lexer, valid, closing);
    case '#':
      return scan_hash(lexer, valid, recovering, blanks);
    case '@':
      return scan_at(lexer, valid, recovering, glued, closing);
    case ';':
      return scan_semicolon(lexer, valid, recovering, closing);
    default:
      return false;
  }
}

static bool scan_nasm(TSLexer *lexer, const bool *valid, const struct Scanner *scanner,
                      bool *closes_input) {
  const bool recovering = valid[ERROR_SENTINEL];
  const bool closing = closable(valid);
  const uint32_t blanks = skip_blanks(lexer);

  if (!recovering && scan_remainder(lexer, valid)) {
    return true;
  }
  if (valid[BLANK] && !recovering && blanks > 0 && separates_operand(lexer->lookahead)) {
    return finish_token(lexer, BLANK);
  }
  switch (closing_decision(lexer, valid, closing)) {
    case CLOSING_CLOSES:
      return close_construct(lexer, valid);
    case CLOSING_STAYS_OPEN:
      return false;
    default:
      break;
  }
  if (lexer->eof(lexer)) {
    return scan_end_of_input(lexer, valid, recovering, scanner->closed_input, closes_input);
  }
  if (recovering && starts_label(lexer->lookahead)) {
    return scan_stray_label(lexer, valid);
  }
  if (statement_word_fits(lexer, valid)) {
    return scan_statement_word(lexer, valid);
  }
  if (lexer->lookahead == ';') {
    return scan_semicolon(lexer, valid, recovering, closing);
  }
  return false;
}

static bool scan(TSLexer *lexer, const bool *valid, const struct Scanner *scanner,
                 bool *closes_input) {
  if (ASM_GNU_SYNTAX) {
    return scan_gnu(lexer, valid, scanner, closes_input);
  }
  return scan_nasm(lexer, valid, scanner, closes_input);
}

#define ASM_CONCAT_(a, b) a##b
#define ASM_CONCAT(a, b) ASM_CONCAT_(a, b)
#define ASM_EXPORT(suffix) ASM_CONCAT(ASM_CONCAT(tree_sitter_, ASM_GRAMMAR_NAME), suffix)

void *ASM_EXPORT(_external_scanner_create)(void);
void ASM_EXPORT(_external_scanner_destroy)(void *payload);
unsigned ASM_EXPORT(_external_scanner_serialize)(void *payload, char *buffer);
void ASM_EXPORT(_external_scanner_deserialize)(void *payload, const char *buffer, unsigned length);
bool ASM_EXPORT(_external_scanner_scan)(void *payload, TSLexer *lexer, const bool *valid_symbols);

void *ASM_EXPORT(_external_scanner_create)(void) {
  return ts_calloc(1, sizeof(struct Scanner));
}

void ASM_EXPORT(_external_scanner_destroy)(void *payload) {
  ts_free(payload);
}

unsigned ASM_EXPORT(_external_scanner_serialize)(void *payload, char *buffer) {
  const struct Scanner *scanner = payload;

  if (!scanner->closed_input && scanner->x86_syntax == 0) {
    return 0;
  }
  buffer[0] = (char)((scanner->closed_input ? CLOSED_INPUT_BIT : 0) |
                     (scanner->x86_syntax << X86_SYNTAX_SHIFT));
  return 1;
}

void ASM_EXPORT(_external_scanner_deserialize)(void *payload, const char *buffer, unsigned length) {
  struct Scanner *scanner = payload;
  const unsigned char state = length > 0 ? (unsigned char)buffer[0] : 0;

  scanner->closed_input = (state & CLOSED_INPUT_BIT) != 0;
  scanner->x86_syntax = (unsigned char)(state >> X86_SYNTAX_SHIFT);
}

bool ASM_EXPORT(_external_scanner_scan)(void *payload, TSLexer *lexer, const bool *valid_symbols) {
  struct Scanner *scanner = payload;
  bool closes_input = false;
  const bool found = scan(lexer, valid_symbols, scanner, &closes_input);

  scanner->closed_input = closes_input;
  if (found) {
    follow_x86_syntax(scanner, lexer->result_symbol);
  }
  return found;
}

#endif /* TREE_SITTER_ASM_SCANNER_H */
