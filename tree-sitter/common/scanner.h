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
#define ASM_COLON_TYPE_MARK 0
#define ASM_RESERVED_NAMES 0
#define ASM_NAMED_STATEMENTS 0
#define ASM_INTEL_ONLY 0
#define ASM_FOLDED_DECORATORS 0
#define ASM_BACKQUOTE_STRINGS 0
#define ASM_PERCENT_MACROS 0
#define ASM_LINE_JOINS 0
#define ASM_SPACED_JOINS 1
#define ASM_SEMICOLONS SEMICOLON_HEURISTIC
#define ASM_AARCH64_GNU_KEYWORDS 1
#define ASM_AARCH64_APPLE_KEYWORDS 1
#define ASM_AARCH32_KEYWORDS 1
#define ASM_X86_GAS_KEYWORDS 1
#define ASM_X86_NASM_KEYWORDS 0
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
#define ASM_COLON_TYPE_MARK 0
#define ASM_RESERVED_NAMES 0
#define ASM_NAMED_STATEMENTS 0
#define ASM_INTEL_ONLY 0
#define ASM_FOLDED_DECORATORS 0
#define ASM_BACKQUOTE_STRINGS 0
#define ASM_PERCENT_MACROS 0
#define ASM_LINE_JOINS 0
#define ASM_SPACED_JOINS 1
#define ASM_SEMICOLONS SEMICOLON_SEPARATES
#define ASM_AARCH64_GNU_KEYWORDS 1
#define ASM_AARCH64_APPLE_KEYWORDS 0
#define ASM_AARCH32_KEYWORDS 1
#define ASM_X86_GAS_KEYWORDS 0
#define ASM_X86_NASM_KEYWORDS 0
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
#define ASM_COLON_TYPE_MARK 0
#define ASM_RESERVED_NAMES 0
#define ASM_NAMED_STATEMENTS 0
#define ASM_INTEL_ONLY 0
#define ASM_FOLDED_DECORATORS 0
#define ASM_BACKQUOTE_STRINGS 0
#define ASM_PERCENT_MACROS 0
#define ASM_LINE_JOINS 0
#define ASM_SPACED_JOINS 1
#define ASM_SEMICOLONS SEMICOLON_COMMENTS
#define ASM_AARCH64_GNU_KEYWORDS 0
#define ASM_AARCH64_APPLE_KEYWORDS 1
#define ASM_AARCH32_KEYWORDS 0
#define ASM_X86_GAS_KEYWORDS 0
#define ASM_X86_NASM_KEYWORDS 0
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
#define ASM_COLON_TYPE_MARK 0
#define ASM_RESERVED_NAMES 0
#define ASM_NAMED_STATEMENTS 0
#define ASM_INTEL_ONLY 0
#define ASM_FOLDED_DECORATORS 0
#define ASM_BACKQUOTE_STRINGS 0
#define ASM_PERCENT_MACROS 0
#define ASM_LINE_JOINS 0
#define ASM_SPACED_JOINS 1
#define ASM_SEMICOLONS SEMICOLON_SEPARATES
#define ASM_AARCH64_GNU_KEYWORDS 0
#define ASM_AARCH64_APPLE_KEYWORDS 0
#define ASM_AARCH32_KEYWORDS 0
#define ASM_X86_GAS_KEYWORDS 1
#define ASM_X86_NASM_KEYWORDS 0
#elif defined(ASM_DIALECT_X86_NASM)
#define ASM_ARM_OPERANDS 0
#define ASM_X86_OPERANDS 1
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
#define ASM_COLON_TYPE_MARK 1
#define ASM_RESERVED_NAMES 1
#define ASM_NAMED_STATEMENTS 1
#define ASM_INTEL_ONLY 1
#define ASM_FOLDED_DECORATORS 1
#define ASM_BACKQUOTE_STRINGS 1
#define ASM_PERCENT_MACROS 1
#define ASM_LINE_JOINS 1
#define ASM_SPACED_JOINS 0
#define ASM_SEMICOLONS SEMICOLON_COMMENTS
#define ASM_AARCH64_GNU_KEYWORDS 0
#define ASM_AARCH64_APPLE_KEYWORDS 0
#define ASM_AARCH32_KEYWORDS 0
#define ASM_X86_GAS_KEYWORDS 0
#define ASM_X86_NASM_KEYWORDS 1
#endif /* ASM_DIALECT_* */

enum TokenType {
  LINE_COMMENT,
  PREPROC_DIRECTIVE,
  HASH,
  AT_ATTACHED,
  TYPE_MARK,
  SEPARATOR,
  STRING_CONTENT,
  PREPROC_ARGUMENT,
  BRACKET_ARGUMENT,
  RAW_WORD,
  TRAILING_ARGUMENT,
  PREPROC_LINE_END,
  PREPROC_INCLUDE,
  HEADER_NAME,
  PREPROC_DEFINE,
  PREPROC_SET,
  PREPROC_ASSIGN,
  PREPROC_MACRO,
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
  GLUED_LOCAL,
  GLUED_CONTEXT,
  GLUED_EXPANSION,
  BLANK,
  PREFIX_WORD,
  PREFIX_SEMICOLON,
  MACRO_OPEN,
  IF_OPEN,
  IF_MACRO_OPEN,
  IF_RAW_OPEN,
  REPT_OPEN,
  IRP_OPEN,
  IRPC_OPEN,
  STRUC_OPEN,
  ISTRUC_OPEN,
  BLANK_SEPARATED_DIRECTIVE,
  FLOAT_DATA_DIRECTIVE,
  FLOAT_SPACE_DIRECTIVE,
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
  REGISTER,
  ARM_REGISTER,
  SYSTEM_REGISTER,
  CONDITION,
  SHIFT_WORD,
  EXTEND_WORD,
  PREDICATE_QUALIFIER,
  SECTION_TYPE_WORD,
  REMAINDER,
  INTEL_OPERANDS,
  INTEL_TYPE_WORD,
  INTEL_PTR_WORD,
  INTEL_UNARY_WORD,
  INTEL_MULTIPLICATIVE_WORD,
  INTEL_BITWISE_WORD,
  INTEL_COMPARISON_WORD,
  CALL_ARGUMENTS,
  MACRO_LABEL_NAME,
  STATEMENT_CALL,
  BRACE_OPEN,
  OPERAND_GAP,
  REFERENCE_COLON,
  PREPROC_FUNCTION,
  LIST_OPEN,
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
  STRUC_CLOSE,
  ISTRUC_CLOSE,
  ELSEIF,
  ELSEIF_MACRO,
  ELSEIF_RAW,
  ELSE,
  BLOCK_END,
  END,
  STRICT_WORD,
  ADDRESS_WORD,
  ABSOLUTE_WORD,
  WRT_WORD,
  TO_WORD,
  SPECIAL_SYMBOL,
  GENERIC_DIRECTIVE,
  SECTION_DIRECTIVE,
  DECLARATION_DIRECTIVE,
  COMMON_DIRECTIVE,
  BRACKET_DIRECTIVE,
  DATA_DIRECTIVE,
  ALIGN_DIRECTIVE,
  USE_DIRECTIVE,
  TIMES,
  EQU,
  AT_WORD,
  ALIGNMENT_COLON,
  DUP_WORD,
  FLOAT_SPECIAL,
  FLOAT_OPERATOR_WORD,
  MEMORY_OPEN_WORD,
  LIST_WORD,
  CONDITIONAL_QUESTION,
  CONDITIONAL_COLON,
  UNINITIALIZED,
  ARGUMENT_REFERENCE,
  MACRO_LOCAL,
  CONTEXT_LOCAL,
  MACRO_EXPANSION,
  INSTRUCTION_NAME,
  FLAGS_INSTRUCTION,
  FIRST_LABEL_INSTRUCTION,
  FIRST_TWO_LABELS_INSTRUCTION,
  SECOND_LABEL_INSTRUCTION,
  LABEL_AFTER_OPTIONAL_FIRST_INSTRUCTION,
  THIRD_LABEL_INSTRUCTION,
  LABEL_AFTER_OPTIONAL_SECOND_INSTRUCTION,
  LABELS_THEN_CONDITION_INSTRUCTION,
  FIRST_CONDITION_INSTRUCTION,
  SECOND_CONDITION_INSTRUCTION,
  THIRD_CONDITION_INSTRUCTION,
  FOURTH_CONDITION_INSTRUCTION,
  FIRST_SYSTEM_INSTRUCTION,
  SECOND_SYSTEM_INSTRUCTION,
  THIRD_SYSTEM_INSTRUCTION,
  SECOND_AND_THIRD_SYSTEM_INSTRUCTION,
  THIRD_AND_FOURTH_SYSTEM_INSTRUCTION,
  SECOND_TO_FOURTH_SYSTEM_INSTRUCTION,
  THIRD_TO_FIFTH_SYSTEM_INSTRUCTION,
  MACRO_NAME,
  STRAY,
  ERROR_SENTINEL,
};

#define X86_INTEL 0x01U
#define X86_NOPREFIX 0x02U
#define DEFAULT_X86_SYNTAX (ASM_INTEL_ONLY ? X86_INTEL | X86_NOPREFIX : 0U)
#define CLOSED_INPUT_BIT 0x01U
#define X86_SYNTAX_SHIFT 1U

enum {
  BINARY_BASE = 2,
  OCTAL_BASE = 8,
  DECIMAL_BASE = 10,
  HEXADECIMAL_BASE = 16,
};

#define UPPER_CASE 0x01U
#define LOWER_CASE 0x02U
#define MIXED_CASE (UPPER_CASE | LOWER_CASE)

#define WORD_RESERVED 0x01U
#define WORD_NAMES_LABEL 0x02U
#define WORD_NAMES_ASSIGNMENT 0x04U
#define WORD_PTR_FOLLOWS 0x08U
#define PREFIX_PLAIN 0x01U
#define PREFIX_BRACED 0x02U
#define PREFIX_INTEL 0x04U
#define DECORATOR_DASHED 0x01U
#define DECORATOR_FLAGS 0x02U
#define CASE_NO_LOWER 0x20U
#define CASE_NO_UPPER 0x40U
#define CASE_NO_MIXED 0x80U

#define ARM_CONDITION 0x01U
#define ARM_CONDITION_INFIX 0x02U
#define ARM_CARRY 0x04U
#define ARM_VECTOR_CONDITION 0x08U

#define REGISTER_INTEL 0x01U
#define REGISTER_ARRANGED 0x02U
#define REGISTER_ELEMENT 0x04U
#define REGISTER_TYPED 0x08U
#define REGISTER_APSR_BITS 0x10U
#define REGISTER_APSR_FLAGS 0x20U
#define REGISTER_LOWER_SUFFIX 0x40U
#define REGISTER_MASK 0x80U

#define APSR_NZCVQ 0x1FU
#define APSR_NZCV 0x0FU

enum SystemField {
  SYSTEM_OP0_COUNT = 4,
  SYSTEM_OP_COUNT = 8,
  CONTROL_REGISTERS = 16,
};

enum IntegerForm {
  DECIMAL_DIGITS,
  CANONICAL_DECIMAL,
  CLANG_INTEGER,
  GAS_INTEGER,
};

enum ElementBits {
  ELEMENT_B_BITS = 8,
  ELEMENT_H_BITS = 16,
  ELEMENT_S_BITS = 32,
  ELEMENT_D_BITS = 64,
  ELEMENT_Q_BITS = 128,
  MAX_ARRANGEMENT_WIDTH = 16,
};

struct Scanner {
  bool closed_input;
  unsigned char x86_syntax;
};

#include "words.h"

enum {
  STATEMENT_WORD_CAPACITY = WORD_LENGTH + 1,
};

#define ANY_CASE 0U
#define ANY_SCOPE (~0U)
#define X86_SCOPES (SCOPE_X86_GAS | SCOPE_X86_NASM)
#define ARM_SCOPES (SCOPE_AARCH64_GNU | SCOPE_AARCH64_APPLE | SCOPE_AARCH32)
#define AARCH64_SCOPES (SCOPE_AARCH64_GNU | SCOPE_AARCH64_APPLE)

static uint32_t mixed_hash(uint32_t hash) {
  uint32_t value = hash ^ (hash >> WORD_MIX_WIDE_SHIFT);

  value *= WORD_MIX_FIRST;
  value ^= value >> WORD_MIX_NARROW_SHIFT;
  value *= WORD_MIX_SECOND;
  return value ^ (value >> WORD_MIX_WIDE_SHIFT);
}

static size_t word_vertex(uint32_t hash) {
  return (size_t)(((uint64_t)hash * WORD_SIDE) >> WORD_VERTEX_SHIFT);
}

static const struct WordEntry *word_entry(const char *word) {
  uint32_t first = WORD_FIRST_SEED;
  uint32_t second = WORD_SECOND_SEED;
  const char *text = word;
  size_t index = 0;

  if (*word == '\0') {
    return NULL;
  }
  while (*text != '\0') {
    first = (first ^ (uint32_t)(unsigned char)*text) * WORD_HASH_PRIME;
    second = (second ^ (uint32_t)(unsigned char)*text) * WORD_HASH_PRIME;
    text++;
  }
  index = (size_t)WORD_GRAPH[word_vertex(mixed_hash(first))] +
          (size_t)WORD_GRAPH[WORD_SIDE + word_vertex(mixed_hash(second))];
  if (index >= WORD_COUNT) {
    index -= WORD_COUNT;
  }
  return strcmp(word, WORDS[index].name) == 0 ? &WORDS[index] : NULL;
}

static bool case_fits(unsigned char flags, unsigned char cases) {
  return !((cases == LOWER_CASE && (flags & CASE_NO_LOWER) != 0) ||
           (cases == UPPER_CASE && (flags & CASE_NO_UPPER) != 0) ||
           (cases == MIXED_CASE && (flags & CASE_NO_MIXED) != 0));
}

static const struct WordRole *next_role(const struct WordEntry *entry, enum WordKind kind,
                                        unsigned scopes, unsigned char cases,
                                        const struct WordRole *after) {
  const struct WordRole *role = NULL;
  const struct WordRole *end = NULL;

  if (entry == NULL) {
    return NULL;
  }
  role = after == NULL ? &WORD_ROLES[entry->first] : after + 1;
  end = &WORD_ROLES[entry->first] + entry->count;
  while (role < end) {
    if (role->kind == kind && (scopes & role->scope) != 0 && case_fits(role->flags, cases)) {
      return role;
    }
    role++;
  }
  return NULL;
}

static const struct WordRole *word_role(const struct WordEntry *entry, enum WordKind kind,
                                        unsigned scopes, unsigned char cases) {
  return next_role(entry, kind, scopes, cases, NULL);
}

struct ImplicitEnd {
  TSSymbol closer;
  TSSymbol ends;
};

static const struct ImplicitEnd IMPLICIT_ENDS[] = {
    {MACRO_CLOSE, CONDITIONAL_CLOSE},
    {MACRO_CLOSE, REPEAT_CLOSE},
    {REPEAT_CLOSE, CONDITIONAL_CLOSE},
    {MACRO_CLOSE, STRUC_CLOSE},
    {MACRO_CLOSE, ISTRUC_CLOSE},
    {REPEAT_CLOSE, STRUC_CLOSE},
    {REPEAT_CLOSE, ISTRUC_CLOSE},
    {CONDITIONAL_CLOSE, STRUC_CLOSE},
    {CONDITIONAL_CLOSE, ISTRUC_CLOSE},
    {ELSEIF, STRUC_CLOSE},
    {ELSEIF, ISTRUC_CLOSE},
    {ELSEIF_MACRO, STRUC_CLOSE},
    {ELSEIF_MACRO, ISTRUC_CLOSE},
    {ELSEIF_RAW, STRUC_CLOSE},
    {ELSEIF_RAW, ISTRUC_CLOSE},
    {ELSE, STRUC_CLOSE},
    {ELSE, ISTRUC_CLOSE},
};

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

static uint32_t join_width(TSLexer *lexer) {
  uint32_t width = 1;

  if (ASM_SPACED_JOINS) {
    while (is_blank(lexer->lookahead)) {
      advance(lexer);
      width++;
    }
  } else if (lexer->lookahead == '\r') {
    advance(lexer);
    width++;
  }
  return lexer->lookahead == '\n' ? width : 0;
}

static bool joins_line(TSLexer *lexer, bool skipping) {
  if (join_width(lexer) == 0) {
    return false;
  }
  lexer->advance(lexer, skipping);
  return true;
}

static bool advance_blanks(TSLexer *lexer) {
  while (is_blank(lexer->lookahead) || (ASM_LINE_JOINS && lexer->lookahead == '\\')) {
    const bool backslash = lexer->lookahead == '\\';

    advance(lexer);
    if (backslash && !joins_line(lexer, false)) {
      return false;
    }
  }
  return true;
}

static bool cross_joins(TSLexer *lexer) {
  while (ASM_LINE_JOINS && lexer->lookahead == '\\') {
    advance(lexer);
    if (!joins_line(lexer, false)) {
      return false;
    }
  }
  return true;
}

static bool skip_joins(TSLexer *lexer) {
  while (ASM_LINE_JOINS && lexer->lookahead == '\\') {
    skip(lexer);
    if (!joins_line(lexer, true)) {
      return false;
    }
  }
  return true;
}

static bool word_continues(TSLexer *lexer, bool (*part)(int32_t), bool *stray) {
  if (!cross_joins(lexer)) {
    *stray = true;
    return false;
  }
  return part(lexer->lookahead);
}

static void advance_text(TSLexer *lexer) {
  if (ASM_LINE_JOINS && lexer->lookahead == '\\') {
    advance(lexer);
    joins_line(lexer, false);
  } else {
    advance(lexer);
  }
}

struct Gap {
  uint32_t blanks;
  uint32_t line_blanks;
  bool joined;
  bool empty_before;
};

static bool skip_gap(TSLexer *lexer, struct Gap *gap) {
  uint32_t width = 0;

  while (is_blank(lexer->lookahead) || (ASM_LINE_JOINS && lexer->lookahead == '\\')) {
    if (lexer->lookahead != '\\') {
      skip(lexer);
      gap->blanks++;
      gap->line_blanks++;
      continue;
    }
    lexer->mark_end(lexer);
    advance(lexer);
    width = join_width(lexer);
    if (width == 0) {
      return false;
    }
    if (!gap->joined) {
      gap->empty_before = lexer->get_column(lexer) == gap->line_blanks + width;
    }
    skip(lexer);
    gap->joined = true;
    gap->line_blanks = 0;
  }
  return true;
}

static bool starts_line(TSLexer *lexer, const struct Gap *gap) {
  return (!gap->joined || gap->empty_before) && lexer->get_column(lexer) == gap->line_blanks + 1;
}

static inline bool is_alpha(int32_t codepoint) {
  return (codepoint >= 'a' && codepoint <= 'z') || (codepoint >= 'A' && codepoint <= 'Z') ||
         codepoint == '_';
}

static inline bool is_digit(int32_t codepoint) {
  return codepoint >= '0' && codepoint <= '9';
}

static inline bool is_alnum(int32_t codepoint) {
  return is_alpha(codepoint) || is_digit(codepoint);
}

static inline bool continues_decorator(int32_t codepoint) {
  return is_alnum(codepoint) || codepoint == '-';
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
  return codepoint == '?' || codepoint == '@' || codepoint == '$' || codepoint == '\'' ||
         codepoint == '"' || codepoint == '`' || codepoint == '%';
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
  return ASM_GNU_SYNTAX && (codepoint == '%' || (ASM_DOLLAR_IMMEDIATES && codepoint == '$'));
}

static inline bool starts_operand(int32_t codepoint) {
  if (ASM_ARM_OPERANDS && (codepoint == '[' || codepoint == '{' || codepoint == '=')) {
    return true;
  }
  return starts_argument(codepoint) || (ASM_X86_OPERANDS && !ASM_INTEL_ONLY && codepoint == '*');
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
  return starts_term(codepoint) || (!ASM_INTEL_ONLY && codepoint == '%') || codepoint == '[' ||
         (!ASM_GNU_SYNTAX && codepoint == '&');
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

static inline bool value_continues(int32_t codepoint, const bool *valid, uint32_t blanks) {
  return continues_expression(codepoint) || codepoint == '%' || codepoint == '?' ||
         codepoint == ':' || codepoint == ',' ||
         (valid[BLANK] && blanks > 0 && separates_operand(codepoint));
}

static inline bool starts_gapped_operand(int32_t codepoint) {
  return is_digit(codepoint) || codepoint == '[' || codepoint == '$' || codepoint == '~' ||
         codepoint == '!' || codepoint == '.' || codepoint == '@' || codepoint == '\'' ||
         codepoint == '"' || codepoint == '`';
}

static inline bool starts_nasm_name(int32_t codepoint) {
  return is_alpha(codepoint) || codepoint == '.' || codepoint == '?' || codepoint == '@';
}

static inline bool starts_label(int32_t codepoint) {
  if (ASM_GNU_SYNTAX) {
    return is_alpha(codepoint) || codepoint == '.' || is_digit(codepoint) || codepoint == '"';
  }
  return starts_nasm_name(codepoint) || codepoint == '$' ||
         (ASM_PERCENT_MACROS && codepoint == '%');
}

static inline bool continues_label(int32_t codepoint) {
  if (ASM_GNU_SYNTAX) {
    return is_word_char(codepoint);
  }
  return is_word_char(codepoint) || codepoint == '#' || codepoint == '@' || codepoint == '~' ||
         codepoint == '?';
}

static inline bool statement_keyword_fits(const bool *valid) {
  return valid[MACRO_CLOSE] || valid[CONDITIONAL_CLOSE] || valid[REPEAT_CLOSE] ||
         valid[MACRO_OPEN] || valid[IF_OPEN] || valid[REPT_OPEN] || valid[IRP_OPEN] ||
         valid[IRPC_OPEN] || valid[BLANK_SEPARATED_DIRECTIVE] || valid[FLOAT_DATA_DIRECTIVE] ||
         valid[FLOAT_SPACE_DIRECTIVE] || valid[CFI_REGISTER_DIRECTIVE] ||
         valid[UNWIND_REGISTER_DIRECTIVE] || valid[LINKER_HINT_DIRECTIVE] || valid[INTEL_SYNTAX] ||
         valid[ATT_SYNTAX] || valid[GENERIC_DIRECTIVE] || valid[SECTION_DIRECTIVE] ||
         valid[DECLARATION_DIRECTIVE] || valid[COMMON_DIRECTIVE] || valid[BRACKET_DIRECTIVE] ||
         valid[DATA_DIRECTIVE] || valid[ALIGN_DIRECTIVE] || valid[USE_DIRECTIVE] || valid[TIMES] ||
         valid[EQU] || valid[IF_MACRO_OPEN] || valid[IF_RAW_OPEN] || valid[PREPROC_DIRECTIVE] ||
         valid[PREPROC_INCLUDE] || valid[PREPROC_DEFINE] || valid[PREPROC_SET] ||
         valid[PREPROC_ASSIGN] || valid[PREPROC_MACRO] || valid[STRUC_OPEN] || valid[ISTRUC_OPEN] ||
         valid[STRUC_CLOSE] || valid[ISTRUC_CLOSE] || valid[AT_WORD];
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

static const TSSymbol PLAIN_COLONS[] = {
    ALIGNMENT_COLON,
    CONDITIONAL_COLON,
    RELOCATION_COLON,
    SEGMENT_COLON,
};

static bool first_valid(const bool *valid, const TSSymbol *symbols, size_t count,
                        TSSymbol *symbol) {
  size_t index = 0;

  while (index < count) {
    if (valid[symbols[index]]) {
      *symbol = symbols[index];
      return true;
    }
    index++;
  }
  return false;
}

static bool closing_token(const bool *valid, TSSymbol *symbol) {
  return first_valid(valid, CLOSING_TOKENS, sizeof(CLOSING_TOKENS) / sizeof(CLOSING_TOKENS[0]),
                     symbol);
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
             (valid[UNCLOSED_MEMORY] && !valid[REGISTER]) ||
             (ASM_PERCENT_MACROS && valid[UNCLOSED_ADDRESS]);
    case '%':
      return ASM_X86_OPERANDS && !ASM_INTEL_ONLY && valid[REGISTER];
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

enum ScanDecision {
  SCAN_UNDECIDED,
  SCAN_FOUND,
  SCAN_NOT_FOUND,
};

static enum ScanDecision decided(bool found) {
  return found ? SCAN_FOUND : SCAN_NOT_FOUND;
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
    advance_text(lexer);
  }
  return finish_token(lexer, LINE_COMMENT);
}

static bool directive_follows(TSLexer *lexer) {
  if (!advance_blanks(lexer) || lexer->lookahead != '.') {
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

static bool scan_at(TSLexer *lexer, const bool *valid, bool recovering, bool glued, bool closing) {
  advance(lexer);
  if (!recovering) {
    if (glued && valid[AT_ATTACHED]) {
      return finish_token(lexer, AT_ATTACHED);
    }
    if (!ASM_COLON_TYPE_MARK && valid[TYPE_MARK] &&
        (is_alpha(lexer->lookahead) || is_digit(lexer->lookahead))) {
      return finish_token(lexer, TYPE_MARK);
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
      advance_text(lexer);
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
  const int32_t quote = ASM_BACKQUOTE_STRINGS ? '`' : '"';
  bool consumed = false;

  if (at_line_end(lexer) && valid[UNCLOSED]) {
    return finish_token(lexer, UNCLOSED);
  }
  while (lexer->lookahead != quote && !at_line_end(lexer)) {
    if (lexer->lookahead == '\\') {
      lexer->mark_end(lexer);
      advance(lexer);
      if (!(ASM_LINE_JOINS && joins_line(lexer, false)) && !at_line_end(lexer)) {
        lexer->result_symbol = STRING_CONTENT;
        return consumed;
      }
    } else {
      advance(lexer);
    }
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

static void consume_escape(TSLexer *lexer) {
  advance(lexer);
  if (is_blank(lexer->lookahead) || lexer->lookahead == '\n') {
    joins_line(lexer, false);
  } else if (!lexer->eof(lexer)) {
    advance(lexer);
  }
}

static inline bool is_quote(int32_t codepoint) {
  return codepoint == '"' || codepoint == '\'' || (ASM_BACKQUOTE_STRINGS && codepoint == '`');
}

static inline bool quote_escapes(int32_t quote) {
  return !ASM_BACKQUOTE_STRINGS || quote == '`';
}

static void skip_quoted(TSLexer *lexer) {
  const int32_t quote = lexer->lookahead;

  advance(lexer);
  while (lexer->lookahead != quote && !at_line_end(lexer)) {
    if (lexer->lookahead == '\\' && quote_escapes(quote)) {
      consume_escape(lexer);
    } else {
      advance_text(lexer);
    }
  }
  if (lexer->lookahead == quote) {
    advance(lexer);
  }
}

static void consume_quoted(TSLexer *lexer) {
  skip_quoted(lexer);
  lexer->mark_end(lexer);
}

static bool statement_call_follows(TSLexer *lexer) {
  uint32_t depth = 0;

  do {
    if (at_line_end(lexer) || lexer->lookahead == ';') {
      return true;
    }
    if (is_quote(lexer->lookahead)) {
      skip_quoted(lexer);
      continue;
    }
    if (lexer->lookahead == '(') {
      depth++;
    } else if (lexer->lookahead == ')') {
      depth--;
    }
    advance_text(lexer);
  } while (depth > 0);
  return advance_blanks(lexer) && (at_line_end(lexer) || lexer->lookahead == ';');
}

static bool preproc_line_comment(TSLexer *lexer, const bool *valid) {
  if (!valid[LINE_COMMENT]) {
    return false;
  }
  while (!at_line_end(lexer)) {
    if (lexer->lookahead == '\\') {
      advance(lexer);
      joins_line(lexer, false);
    } else {
      advance(lexer);
    }
  }
  return finish_token(lexer, LINE_COMMENT);
}

static bool raw_stops(int32_t codepoint, TSSymbol symbol) {
  if (!ASM_GNU_SYNTAX && codepoint == ';') {
    return true;
  }
  if (symbol == RAW_WORD) {
    return is_blank(codepoint) || codepoint == '=' || codepoint == ']';
  }
  return symbol == BRACKET_ARGUMENT && codepoint == ']';
}

static bool raw_text_starts(const TSLexer *lexer, TSSymbol symbol) {
  return !at_line_end(lexer) && !raw_stops(lexer->lookahead, symbol) &&
         (symbol != RAW_WORD || !is_quote(lexer->lookahead));
}

static bool scan_raw_text(TSLexer *lexer, TSSymbol symbol) {
  lexer->mark_end(lexer);
  while (!at_line_end(lexer) && !raw_stops(lexer->lookahead, symbol)) {
    if (is_quote(lexer->lookahead)) {
      consume_quoted(lexer);
    } else if (lexer->lookahead == '\\') {
      advance(lexer);
      lexer->mark_end(lexer);
      joins_line(lexer, false);
    } else if (ASM_GNU_SYNTAX && lexer->lookahead == '/') {
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
  lexer->result_symbol = symbol;
  return true;
}

static bool raw_word_fits(const bool *valid, TSSymbol *symbol) {
  if (valid[BRACKET_ARGUMENT] || valid[RAW_WORD]) {
    *symbol = valid[BRACKET_ARGUMENT] ? BRACKET_ARGUMENT : RAW_WORD;
    return true;
  }
  return false;
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

static enum ScanDecision scan_preproc_rest(TSLexer *lexer, const bool *valid) {
  const bool trailing_blanks = is_blank(lexer->lookahead);

  if (lexer->lookahead == '(' && valid[PREPROC_PARAMS_OPEN]) {
    advance(lexer);
    return decided(finish_token(lexer, PREPROC_PARAMS_OPEN));
  }
  skip_blanks(lexer);
  if (at_line_end(lexer)) {
    if (trailing_blanks && valid[PREPROC_LINE_END]) {
      return decided(finish_token(lexer, PREPROC_LINE_END));
    }
    if (valid[END] && lexer->eof(lexer)) {
      return decided(finish_token(lexer, END));
    }
    return SCAN_UNDECIDED;
  }
  if (!raw_text_starts(lexer, PREPROC_ARGUMENT)) {
    return SCAN_UNDECIDED;
  }
  if (lexer->lookahead == '<' && valid[HEADER_NAME]) {
    return decided(header_name(lexer));
  }
  if (lexer->lookahead == '"' && valid[HEADER_NAME]) {
    return SCAN_UNDECIDED;
  }
  if (ASM_GNU_SYNTAX && lexer->lookahead == '/') {
    advance(lexer);
    if (lexer->lookahead == '/') {
      return decided(preproc_line_comment(lexer, valid));
    }
    if (lexer->lookahead == '*') {
      return SCAN_NOT_FOUND;
    }
    lexer->mark_end(lexer);
  }
  return decided(scan_raw_text(lexer, PREPROC_ARGUMENT));
}

static bool needs_second_character(int32_t first, const bool *valid) {
  if (valid[REMAINDER] &&
      ((first == '=' && ASM_GNU_SYNTAX) || (first == '!' && !ASM_BANG_OPERATOR))) {
    return true;
  }
  if (first == '.') {
    return valid[MISSING_NAME] || valid[MISSING_SYMBOL];
  }
  return ASM_GNU_SYNTAX ? first == '\\' : first == '?';
}

static bool argument_name_follows(TSLexer *lexer) {
  if (lexer->lookahead == '.') {
    advance(lexer);
  }
  return is_alpha(lexer->lookahead);
}

static bool token_follows(TSLexer *lexer) {
  const int32_t first = lexer->lookahead;

  advance(lexer);
  if (!cross_joins(lexer)) {
    return false;
  }
  if (first == '=' || first == '!') {
    return lexer->lookahead == '=';
  }
  if (first == '\\') {
    return lexer->lookahead == '@' || lexer->lookahead == '+' || argument_name_follows(lexer);
  }
  if (first == '?') {
    return continues_label(lexer->lookahead);
  }
  return is_alpha(lexer->lookahead);
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

static void read_alnum(TSLexer *lexer, char *word) {
  size_t length = 0;
  bool stray = false;

  while (word_continues(lexer, is_alnum, &stray)) {
    if (length + 1 < STATEMENT_WORD_CAPACITY) {
      word[length] = (char)lexer->lookahead;
      length++;
    } else {
      word[0] = '\0';
    }
    advance(lexer);
  }
  word[stray ? 0 : length] = '\0';
}

static bool is_flag_word(const char *word) {
  char lower[STATEMENT_WORD_CAPACITY] = {0};
  size_t index = 0;

  while (word[index] != '\0' && index + 1 < STATEMENT_WORD_CAPACITY) {
    lower[index] =
        (char)(word[index] >= 'A' && word[index] <= 'Z' ? word[index] + ('a' - 'A') : word[index]);
    index++;
  }
  return word_role(word_entry(lower), KIND_DEFAULT_FLAGS, ANY_SCOPE, ANY_CASE) != NULL;
}

static bool read_default_flag(TSLexer *lexer) {
  char flag[STATEMENT_WORD_CAPACITY] = {0};

  if (ASM_PERCENT_MACROS && lexer->lookahead == '%') {
    advance(lexer);
    while (continues_label(lexer->lookahead) || lexer->lookahead == '$' ||
           lexer->lookahead == '%') {
      advance(lexer);
    }
    return true;
  }
  read_alnum(lexer, flag);
  return is_flag_word(flag);
}

static bool default_flags_follow(TSLexer *lexer) {
  if (!advance_blanks(lexer) || lexer->lookahead != '=') {
    return false;
  }
  advance(lexer);
  if (!advance_blanks(lexer)) {
    return false;
  }
  if (lexer->lookahead == '}') {
    return true;
  }
  while (read_default_flag(lexer)) {
    if (!advance_blanks(lexer)) {
      return false;
    }
    if (lexer->lookahead != ',') {
      return true;
    }
    advance(lexer);
    if (!advance_blanks(lexer)) {
      return false;
    }
  }
  return false;
}

static bool is_prefix(const struct WordEntry *entry, unsigned char x86_syntax) {
  const struct WordRole *role = word_role(entry, KIND_PREFIXES, ANY_SCOPE, ANY_CASE);

  return role != NULL && (role->flags & PREFIX_PLAIN) != 0 &&
         ((role->flags & PREFIX_INTEL) == 0 || (x86_syntax & X86_INTEL) != 0);
}

static bool is_pseudo_prefix(const struct WordEntry *entry) {
  const struct WordRole *role = word_role(entry, KIND_PREFIXES, ANY_SCOPE, ANY_CASE);

  return role != NULL && (role->flags & PREFIX_BRACED) != 0;
}

static bool pseudo_prefix_follows(TSLexer *lexer) {
  char word[STATEMENT_WORD_CAPACITY] = {0};
  size_t length = 0;
  bool stray = false;

  while (word_continues(lexer, is_alnum, &stray)) {
    take_word_char(lexer, word, &length);
  }
  return !stray && is_pseudo_prefix(word_entry(word));
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
  return (label_fits(valid) || statement_keyword_fits(valid) || valid[MACRO_NAME] ||
          valid[INSTRUCTION_NAME]) &&
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

static bool read_nasm_name_start(TSLexer *lexer, char *word, size_t *length, bool *local) {
  int32_t first = 0;
  unsigned dollars = 0;

  if (ASM_PERCENT_MACROS && lexer->lookahead == '%') {
    take_word_char(lexer, word, length);
    if (!cross_joins(lexer)) {
      return false;
    }
  }
  while (lexer->lookahead == '$') {
    dollars++;
    take_word_char(lexer, word, length);
    if (!cross_joins(lexer)) {
      return false;
    }
  }
  first = lexer->lookahead;
  if (dollars > 1) {
    return continues_label(first);
  }
  if (!starts_nasm_name(first) && !(dollars == 1 && is_digit(first))) {
    return false;
  }
  *local = first == '.';
  take_word_char(lexer, word, length);
  return cross_joins(lexer) && (first != '?' || continues_label(lexer->lookahead));
}

static bool read_label_word(TSLexer *lexer, const bool *valid, TSSymbol *symbol, char *word) {
  bool local = false;
  bool stray = false;
  size_t length = 0;

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
    if (!read_nasm_name_start(lexer, word, &length, &local)) {
      return false;
    }
  } else if (lexer->lookahead == '.') {
    take_word_char(lexer, word, &length);
    local = !ASM_DARWIN_LOCALS && lexer->lookahead == 'L';
    if (!continues_label(lexer->lookahead)) {
      return false;
    }
  } else {
    local = ASM_DARWIN_LOCALS && lexer->lookahead == 'L';
  }
  while (word_continues(lexer, continues_label, &stray)) {
    take_word_char(lexer, word, &length);
  }
  if (stray) {
    return false;
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
  if (!advance_blanks(lexer) || lexer->lookahead != ':') {
    return false;
  }
  advance(lexer);
  return finish_token(lexer, STRAY);
}

static const struct WordRole *cpp_directive(TSLexer *lexer) {
  char word[STATEMENT_WORD_CAPACITY] = {0};

  if (!advance_blanks(lexer)) {
    return NULL;
  }
  read_alnum(lexer, word);
  return word_role(word_entry(word), KIND_CPP_DIRECTIVES, ANY_SCOPE, ANY_CASE);
}

static bool scan_hash(TSLexer *lexer, const bool *valid, bool recovering, const struct Gap *gap) {
  const struct WordRole *directive = NULL;

  advance(lexer);
  if (ASM_HASH_IMMEDIATES && valid[HASH] && !recovering) {
    if (ASM_HASH_NEEDS_VALUE && !starts_value(lexer->lookahead)) {
      return line_comment(lexer, valid);
    }
    return finish_token(lexer, HASH);
  }
  if (valid[PREPROC_DIRECTIVE] && !recovering && starts_line(lexer, gap)) {
    directive = cpp_directive(lexer);
    if (directive != NULL) {
      return finish_token(lexer, valid[directive->symbol] ? directive->symbol : PREPROC_DIRECTIVE);
    }
  }
  return line_comment(lexer, valid);
}

static const struct WordRole *statement_word(const struct WordEntry *entry) {
  return word_role(entry, KIND_DIRECTIVES, ANY_SCOPE, ANY_CASE);
}

static const struct WordRole *operand_word(const struct WordEntry *entry) {
  return word_role(entry, KIND_OPERAND_WORDS, ANY_SCOPE, ANY_CASE);
}

static bool has_flag(const struct WordRole *role, unsigned char flag) {
  return role != NULL && (role->flags & flag) != 0;
}

static bool alias_case_fits(const struct WordRole *role, bool upper) {
  return role->symbol != NEON_ALIAS_WORD || !upper;
}

static const char *find_char(const char *text, char wanted) {
  while (*text != '\0') {
    if (*text == wanted) {
      return text;
    }
    text++;
  }
  return NULL;
}

static void copy_leading(char *target, const char *source, size_t length) {
  size_t index = 0;

  while (index < length && source[index] != '\0') {
    target[index] = source[index];
    index++;
  }
  target[index] = '\0';
}

static const char *find_last_char(const char *text, char wanted) {
  const char *found = NULL;

  while (*text != '\0') {
    if (*text == wanted) {
      found = text;
    }
    text++;
  }
  return found;
}

static const struct WordEntry *leading_entry(const char *word, size_t length) {
  char text[STATEMENT_WORD_CAPACITY] = {0};

  if (length >= STATEMENT_WORD_CAPACITY) {
    return NULL;
  }
  copy_leading(text, word, length);
  return word_entry(text);
}

static const struct WordRole *x86_gas_instruction(const char *word, const struct WordEntry *entry) {
  const struct WordRole *role = word_role(entry, KIND_INSTRUCTIONS, SCOPE_X86_GAS, ANY_CASE);
  const char *dot = find_last_char(word, '.');

  if (role != NULL || dot == NULL || dot == word ||
      word_role(word_entry(dot), KIND_ENCODING_SUFFIXES, SCOPE_X86_GAS, ANY_CASE) == NULL) {
    return role;
  }
  return word_role(leading_entry(word, (size_t)(dot - word)), KIND_INSTRUCTIONS, SCOPE_X86_GAS,
                   ANY_CASE);
}

enum ArmAffix {
  ARM_CONDITION_LENGTH = 2,
  ARM_INFIX_START = 3,
  ARM_INFIX_END = ARM_INFIX_START + ARM_CONDITION_LENGTH,
  ARM_INFIX_SHORTEST = ARM_INFIX_END + 1,
  ARM_TYPE_SMALLEST = 8,
  ARM_TYPE_LARGEST = 64,
};

static const struct WordRole *arm_entry(const char *word, size_t length) {
  return word_role(leading_entry(word, length), KIND_INSTRUCTIONS, SCOPE_AARCH32, ANY_CASE);
}

static bool arm_condition(const char *text) {
  return word_role(leading_entry(text, ARM_CONDITION_LENGTH), KIND_CONDITIONS, SCOPE_AARCH32,
                   ANY_CASE) != NULL;
}

static bool arm_vector_condition(const char *text) {
  return word_role(leading_entry(text, 1), KIND_VECTOR_CONDITIONS, SCOPE_AARCH32, ANY_CASE) != NULL;
}

static const struct WordRole *with_flag(const struct WordRole *role, unsigned char flag) {
  return has_flag(role, flag) ? role : NULL;
}

static const struct WordRole *arm_conditional(const char *word, size_t length) {
  const struct WordRole *entry = NULL;

  if (length <= ARM_CONDITION_LENGTH || !arm_condition(word + length - ARM_CONDITION_LENGTH)) {
    return NULL;
  }
  entry = with_flag(arm_entry(word, length - ARM_CONDITION_LENGTH), ARM_CONDITION);
  if (entry != NULL || length <= ARM_CONDITION_LENGTH + 1 ||
      word[length - ARM_CONDITION_LENGTH - 1] != 's') {
    return entry;
  }
  entry = with_flag(arm_entry(word, length - ARM_CONDITION_LENGTH - 1), ARM_CARRY);
  return has_flag(entry, ARM_CONDITION) ? entry : NULL;
}

static const struct WordRole *arm_suffixed(const char *word, size_t length) {
  const struct WordRole *entry = arm_conditional(word, length);

  if (entry == NULL && length >= 2 && word[length - 1] == 's') {
    entry = with_flag(arm_entry(word, length - 1), ARM_CARRY);
  }
  if (entry == NULL && length >= 2 && arm_vector_condition(word + length - 1)) {
    entry = with_flag(arm_entry(word, length - 1), ARM_VECTOR_CONDITION);
  }
  return entry;
}

static const struct WordRole *arm_infixed(const char *word, size_t length) {
  char text[STATEMENT_WORD_CAPACITY] = {0};

  if (length < ARM_INFIX_SHORTEST || length >= STATEMENT_WORD_CAPACITY ||
      !arm_condition(word + ARM_INFIX_START)) {
    return NULL;
  }
  copy_leading(text, word, ARM_INFIX_START);
  copy_leading(text + ARM_INFIX_START, word + ARM_INFIX_END, length - ARM_INFIX_END);
  return with_flag(word_role(word_entry(text), KIND_INSTRUCTIONS, SCOPE_AARCH32, ANY_CASE),
                   ARM_CONDITION_INFIX);
}

static bool arm_size(const char **cursor) {
  const char *text = *cursor;
  unsigned value = 0;

  if (*text < '1' || *text > '9') {
    return false;
  }
  while (is_digit(*text) && value < DECIMAL_BASE * DECIMAL_BASE) {
    value = (value * DECIMAL_BASE) + (unsigned)(*text - '0');
    text++;
  }
  *cursor = text;
  return value >= ARM_TYPE_SMALLEST && value <= ARM_TYPE_LARGEST && (value & (value - 1)) == 0;
}

static bool arm_type(const char **cursor) {
  const char *text = *cursor;

  switch (*text) {
    case 'd':
      *cursor = text + 1;
      return true;
    case 'b':
      *cursor = text + sizeof("bf16") - 1;
      return strncmp(text, "bf16", sizeof("bf16") - 1) == 0;
    case 'f':
      *cursor = text + 1;
      return !is_digit(text[1]) || arm_size(cursor);
    case 'i':
    case 'p':
    case 's':
    case 'u':
      *cursor = text + 1;
      return arm_size(cursor);
    default:
      return arm_size(cursor);
  }
}

static bool arm_qualifiers(const char *tail) {
  const char *cursor = tail;
  unsigned elements = 0;

  if (cursor[0] == '.' && (cursor[1] == 'w' || cursor[1] == 'n') &&
      (cursor[2] == '\0' || cursor[2] == '.')) {
    cursor += 2;
  }
  while (*cursor == '.' && elements < ASM_AARCH32_TYPE_ELEMENTS) {
    cursor++;
    if (!arm_type(&cursor)) {
      return false;
    }
    elements++;
  }
  return *cursor == '\0' && cursor != tail;
}

static const struct WordRole *aarch32_instruction(const char *word, const struct WordEntry *entry) {
  const char *dot = find_char(word, '.');
  const size_t length = dot == NULL ? strlen(word) : (size_t)(dot - word);
  const struct WordRole *role = NULL;

  if (length == 0 || (dot != NULL && !arm_qualifiers(dot))) {
    return NULL;
  }
  role = dot == NULL ? word_role(entry, KIND_INSTRUCTIONS, SCOPE_AARCH32, ANY_CASE)
                     : arm_entry(word, length);
  if (role == NULL) {
    role = arm_suffixed(word, length);
  }
  if (role == NULL) {
    role = arm_infixed(word, length);
  }
  return role;
}

static const struct WordRole *instruction_role(const char *word, const struct WordEntry *entry) {
  const struct WordRole *role = word_role(entry, KIND_INSTRUCTIONS, AARCH64_SCOPES, ANY_CASE);

  if (role == NULL && ASM_AARCH32_KEYWORDS) {
    role = aarch32_instruction(word, entry);
  }
  if (role == NULL && ASM_X86_GAS_KEYWORDS) {
    role = x86_gas_instruction(word, entry);
  }
  if (role == NULL) {
    role = word_role(entry, KIND_INSTRUCTIONS, SCOPE_X86_NASM, ANY_CASE);
  }
  return role;
}

static inline bool is_clause(TSSymbol symbol) {
  return symbol == ELSEIF || symbol == ELSEIF_MACRO || symbol == ELSEIF_RAW || symbol == ELSE;
}

static bool is_suffix_relocation(const struct WordEntry *entry, unsigned char cases) {
  return word_role(entry, KIND_SUFFIX_RELOCATIONS, ANY_SCOPE, cases) != NULL;
}

static bool is_relocation_name(const struct WordEntry *entry, unsigned char cases) {
  return word_role(entry, KIND_RELOCATIONS, ANY_SCOPE, cases) != NULL;
}

static bool is_condition(const struct WordEntry *entry, unsigned char cases) {
  return word_role(entry, KIND_CONDITIONS, ANY_SCOPE, cases) != NULL;
}

static bool is_macho_section_type(const struct WordEntry *entry, unsigned char cases) {
  return word_role(entry, KIND_MACHO_SECTION_TYPES, ANY_SCOPE, cases) != NULL;
}

static bool is_predicate_qualifier(const struct WordEntry *entry, unsigned char cases) {
  return word_role(entry, KIND_PREDICATE_QUALIFIERS, ANY_SCOPE, cases) != NULL;
}

static const struct WordRole *shift_word(const struct WordEntry *entry, unsigned char cases) {
  const struct WordRole *first = word_role(entry, KIND_SHIFTS, ANY_SCOPE, cases);
  const struct WordRole *role = first;

  while (role != NULL && role->symbol != EXTEND_WORD) {
    role = next_role(entry, KIND_SHIFTS, ANY_SCOPE, cases, role);
  }
  return role != NULL ? role : first;
}

static bool scan_register_alias_word(TSLexer *lexer, const bool *valid) {
  char word[STATEMENT_WORD_CAPACITY] = {0};
  size_t length = 0;
  bool upper = false;
  const struct WordRole *entry = NULL;

  while (is_word_char(lexer->lookahead)) {
    upper = upper || (lexer->lookahead >= 'A' && lexer->lookahead <= 'Z');
    take_word_char(lexer, word, &length);
  }
  entry = statement_word(word_entry(word));
  if (entry == NULL || !valid[entry->symbol]) {
    return false;
  }
  if ((entry->symbol == REGISTER_ALIAS_WORD || entry->symbol == NEON_ALIAS_WORD) &&
      alias_case_fits(entry, upper)) {
    return finish_token(lexer, entry->symbol);
  }
  return false;
}

static unsigned element_bits(char element) {
  switch (element) {
    case 'b':
      return ELEMENT_B_BITS;
    case 'h':
      return ELEMENT_H_BITS;
    case 's':
      return ELEMENT_S_BITS;
    case 'd':
      return ELEMENT_D_BITS;
    case 'q':
      return ELEMENT_Q_BITS;
    default:
      return 0;
  }
}

static bool element_fits(const char *suffix) {
  return element_bits(suffix[0]) != 0 && suffix[1] == '\0';
}

static bool arrangement_fits(const char *suffix) {
  const char *element = suffix;
  unsigned width = 0;
  unsigned bits = 0;

  while (is_digit(*element) && width <= MAX_ARRANGEMENT_WIDTH) {
    width = (width * DECIMAL_BASE) + (unsigned)(*element - '0');
    element++;
  }
  if (!element_fits(element)) {
    return false;
  }
  bits = element_bits(*element);
  if (element == suffix) {
    return bits != ELEMENT_Q_BITS;
  }
  if (width == 0 || width > MAX_ARRANGEMENT_WIDTH || (width & (width - 1)) != 0) {
    return false;
  }
  if (bits == ELEMENT_Q_BITS) {
    return width == 1;
  }
  return width * bits == ELEMENT_D_BITS || width * bits == ELEMENT_Q_BITS ||
         (width == 2 && bits == ELEMENT_H_BITS) || (width == 2 && bits == ELEMENT_B_BITS) ||
         (width == 4 && bits == ELEMENT_B_BITS);
}

static bool neon_size_fits(const char *size) {
  return strcmp(size, "8") == 0 || strcmp(size, "16") == 0 || strcmp(size, "32") == 0 ||
         strcmp(size, "64") == 0;
}

static bool neon_type_fits(const char *suffix) {
  switch (suffix[0]) {
    case 'i':
    case 'p':
    case 's':
    case 'u':
      return neon_size_fits(suffix + 1);
    case 'f':
      return suffix[1] == '\0' || neon_size_fits(suffix + 1);
    case 'd':
      return suffix[1] == '\0';
    case 'b':
      return strcmp(suffix, "bf16") == 0;
    default:
      return neon_size_fits(suffix);
  }
}

static bool suffix_fits(const char *suffix, unsigned char flags) {
  return ((flags & REGISTER_ARRANGED) != 0 && arrangement_fits(suffix)) ||
         ((flags & REGISTER_ELEMENT) != 0 && element_fits(suffix)) ||
         ((flags & REGISTER_TYPED) != 0 && neon_type_fits(suffix));
}

static const struct WordRole *register_role(const char *word, const struct WordEntry *entry,
                                            unsigned scopes) {
  char head[STATEMENT_WORD_CAPACITY] = {0};
  const char *dot = find_char(word, '.');
  const struct WordEntry *head_entry = NULL;
  const struct WordRole *role = word_role(entry, KIND_REGISTERS, scopes, ANY_CASE);

  if (role != NULL || dot == NULL) {
    return role;
  }
  copy_leading(head, word, (size_t)(dot - word));
  head_entry = word_entry(head);
  role = word_role(head_entry, KIND_REGISTERS, scopes, ANY_CASE);
  while (role != NULL && !suffix_fits(dot + 1, role->flags)) {
    role = next_role(head_entry, KIND_REGISTERS, scopes, ANY_CASE, role);
  }
  return role;
}

static const struct WordRole *x86_register(const char *word, const struct WordEntry *entry,
                                           unsigned char x86_syntax) {
  const struct WordRole *role = register_role(word, entry, X86_SCOPES);

  if (role == NULL || ((role->flags & REGISTER_INTEL) != 0 && (x86_syntax & X86_INTEL) == 0)) {
    return NULL;
  }
  return role;
}

static unsigned digit_value(char character) {
  if (character >= '0' && character <= '9') {
    return (unsigned)(character - '0');
  }
  if (character >= 'a' && character <= 'f') {
    return (unsigned)(character - 'a') + DECIMAL_BASE;
  }
  return HEXADECIMAL_BASE;
}

static const char *take_digits(const char *digit, unsigned base, unsigned limit, unsigned *value) {
  const char *start = digit;

  *value = 0;
  while (digit_value(*digit) < base) {
    *value = *value < limit ? (*value * base) + digit_value(*digit) : limit;
    digit++;
  }
  return digit == start ? NULL : digit;
}

static const char *integer_suffix_end(const char *suffix, enum IntegerForm form) {
  bool unsigned_seen = false;

  if (form != CLANG_INTEGER && form != GAS_INTEGER) {
    return suffix;
  }
  if (*suffix == 'u') {
    unsigned_seen = true;
    suffix++;
  }
  if (*suffix == 'l') {
    suffix++;
    suffix += *suffix == 'l';
    suffix += form == GAS_INTEGER && !unsigned_seen && *suffix == 'u';
  }
  return suffix;
}

static bool take_number(enum IntegerForm form, const char **text, unsigned limit, unsigned *value) {
  const bool literal = form == CLANG_INTEGER || form == GAS_INTEGER;
  const char *start = *text;
  const char *digits = start;
  const char *end = NULL;
  unsigned base = DECIMAL_BASE;

  if (literal && start[0] == '0' && (start[1] == 'x' || start[1] == 'b')) {
    base = start[1] == 'x' ? HEXADECIMAL_BASE : BINARY_BASE;
    digits = start + 2;
  } else if (literal && start[0] == '0') {
    base = OCTAL_BASE;
  }
  end = take_digits(digits, base, limit, value);
  if (end == NULL || (form == CANONICAL_DECIMAL && start[0] == '0' && end - start > 1)) {
    return false;
  }
  *text = integer_suffix_end(end, form);
  return true;
}

static bool integer_value(enum IntegerForm form, const char *text, unsigned limit,
                          unsigned *value) {
  return take_number(form, &text, limit, value) && *text == '\0';
}

static void take_register_index(TSLexer *lexer, unsigned indexes) {
  char text[STATEMENT_WORD_CAPACITY] = {0};
  size_t length = 0;
  unsigned value = 0;

  if (!advance_blanks(lexer) || lexer->lookahead != '(') {
    return;
  }
  advance(lexer);
  if (!advance_blanks(lexer)) {
    return;
  }
  while (is_word_char(lexer->lookahead)) {
    take_word_char(lexer, text, &length);
  }
  if (!integer_value(CLANG_INTEGER, text, indexes, &value) || value >= indexes) {
    return;
  }
  if (advance_blanks(lexer) && lexer->lookahead == ')') {
    advance(lexer);
    lexer->mark_end(lexer);
  }
}

static bool letters_fit(const char *text, const char *letters, unsigned *seen) {
  *seen = 0;
  while (*text != '\0') {
    const char *letter = find_char(letters, *text);
    unsigned bit = 0;

    if (letter == NULL) {
      return false;
    }
    bit = 1U << (unsigned)(letter - letters);
    if ((*seen & bit) != 0) {
      return false;
    }
    *seen |= bit;
    text++;
  }
  return *seen != 0;
}

static bool apsr_bits_fit(const char *suffix) {
  unsigned seen = 0;

  return letters_fit(suffix, "nzcvqg", &seen) &&
         ((seen & APSR_NZCVQ) == 0 || (seen & APSR_NZCVQ) == APSR_NZCVQ);
}

static bool apsr_flags_fit(const char *suffix) {
  unsigned seen = 0;

  return letters_fit(suffix, "nzcv", &seen) && seen == APSR_NZCV;
}

static bool system_suffix_fits(const char *suffix, unsigned char flags, bool upper_tail) {
  return ((flags & REGISTER_APSR_BITS) != 0 && apsr_bits_fit(suffix)) ||
         ((flags & REGISTER_APSR_FLAGS) != 0 && !upper_tail && apsr_flags_fit(suffix));
}

static bool scope_system_register(const struct WordEntry *entry, const struct WordEntry *head,
                                  const char *underscore, unsigned scope, bool upper_tail) {
  const struct WordRole *role = word_role(entry, KIND_SYSTEM_REGISTERS, scope, ANY_CASE);

  if (role != NULL) {
    return (role->flags & REGISTER_LOWER_SUFFIX) == 0 || !upper_tail;
  }
  role = word_role(head, KIND_SYSTEM_REGISTERS, scope, ANY_CASE);
  return role != NULL && system_suffix_fits(underscore + 1, role->flags, upper_tail);
}

static bool take_character(const char **text, char character) {
  if (**text != character) {
    return false;
  }
  (*text)++;
  return true;
}

static bool take_field(enum IntegerForm form, const char **text, unsigned count) {
  unsigned value = 0;

  return take_number(form, text, count, &value) && value < count;
}

static bool generic_system_register(enum IntegerForm form, const char *word) {
  const char *text = word;

  return take_character(&text, 's') && take_field(form, &text, SYSTEM_OP0_COUNT) &&
         take_character(&text, '_') && take_field(form, &text, SYSTEM_OP_COUNT) &&
         take_character(&text, '_') && take_character(&text, 'c') &&
         take_field(form, &text, CONTROL_REGISTERS) && take_character(&text, '_') &&
         take_character(&text, 'c') && take_field(form, &text, CONTROL_REGISTERS) &&
         take_character(&text, '_') && take_field(form, &text, SYSTEM_OP_COUNT) && *text == '\0';
}

static bool control_register(enum IntegerForm form, const char *word) {
  unsigned value = 0;

  return word[0] == 'c' && integer_value(form, word + 1, CONTROL_REGISTERS, &value) &&
         value < CONTROL_REGISTERS;
}

static bool system_register(const char *word, const struct WordEntry *entry, bool upper_tail) {
  char head[STATEMENT_WORD_CAPACITY] = {0};
  const char *underscore = find_char(word, '_');
  const struct WordEntry *head_entry = NULL;

  if (underscore != NULL) {
    copy_leading(head, word, (size_t)(underscore - word));
    head_entry = word_entry(head);
  }
  return scope_system_register(entry, head_entry, underscore, SCOPE_AARCH64_GNU, upper_tail) ||
         scope_system_register(entry, head_entry, underscore, SCOPE_AARCH64_APPLE, upper_tail) ||
         scope_system_register(entry, head_entry, underscore, SCOPE_AARCH32, upper_tail) ||
         (ASM_AARCH64_GNU_KEYWORDS &&
          (generic_system_register(DECIMAL_DIGITS, word) || control_register(GAS_INTEGER, word))) ||
         ((ASM_AARCH64_GNU_KEYWORDS || ASM_AARCH64_APPLE_KEYWORDS) &&
          (generic_system_register(CANONICAL_DECIMAL, word) ||
           control_register(DECIMAL_DIGITS, word)));
}

static bool finish_register(TSLexer *lexer, const struct WordRole *entry) {
  lexer->mark_end(lexer);
  if (entry->indexes > 0) {
    take_register_index(lexer, entry->indexes);
  }
  lexer->result_symbol = REGISTER;
  return true;
}

static bool register_fits(const bool *valid, const struct Scanner *scanner) {
  return ASM_X86_OPERANDS && valid[REGISTER] && (scanner->x86_syntax & X86_NOPREFIX) != 0;
}

static bool intel_word_fits(const bool *valid, const struct Scanner *scanner) {
  return ASM_X86_OPERANDS && (scanner->x86_syntax & X86_INTEL) != 0 &&
         (valid[INTEL_TYPE_WORD] || valid[INTEL_PTR_WORD] || valid[INTEL_UNARY_WORD] ||
          valid[INTEL_MULTIPLICATIVE_WORD] || valid[INTEL_BITWISE_WORD] ||
          valid[INTEL_COMPARISON_WORD] || valid[STRICT_WORD] || valid[ADDRESS_WORD] ||
          valid[ABSOLUTE_WORD] || valid[WRT_WORD] || valid[TO_WORD] || valid[DUP_WORD] ||
          valid[FLOAT_SPECIAL] || valid[FLOAT_OPERATOR_WORD] || valid[MEMORY_OPEN_WORD] ||
          valid[PREFIX_WORD]);
}

static bool arm_register_fits(const bool *valid) {
  return ASM_ARM_OPERANDS && valid[ARM_REGISTER];
}

static bool system_register_fits(const bool *valid) {
  return ASM_ARM_OPERANDS && valid[SYSTEM_REGISTER];
}

static bool arm_word_fits(const bool *valid) {
  return ASM_ARM_OPERANDS && (valid[CONDITION] || valid[SHIFT_WORD] || valid[EXTEND_WORD] ||
                              valid[PREDICATE_QUALIFIER]);
}

static bool operand_word_fits(const bool *valid, const struct Scanner *scanner) {
  return valid[SUFFIX_RELOCATION_NAME] || register_fits(valid, scanner) ||
         arm_register_fits(valid) || system_register_fits(valid) ||
         intel_word_fits(valid, scanner) || arm_word_fits(valid);
}

static unsigned char letter_case(int32_t codepoint) {
  if (codepoint >= 'A' && codepoint <= 'Z') {
    return UPPER_CASE;
  }
  return codepoint >= 'a' && codepoint <= 'z' ? LOWER_CASE : 0;
}

static bool scan_percent_register(TSLexer *lexer, const struct Scanner *scanner) {
  char word[STATEMENT_WORD_CAPACITY] = {0};
  size_t length = 0;
  bool stray = false;
  const struct WordRole *entry = NULL;

  advance(lexer);
  if (!advance_blanks(lexer)) {
    return false;
  }
  while (word_continues(lexer, continues_label, &stray)) {
    take_word_char(lexer, word, &length);
  }
  entry = x86_register(word, word_entry(word), scanner->x86_syntax);
  return !stray && entry != NULL && finish_register(lexer, entry);
}

static const struct WordRole *intel_entry(const struct WordEntry *entry, unsigned char cases) {
  return word_role(entry, KIND_OPERAND_WORDS, ANY_SCOPE, cases);
}

static bool ptr_word_follows(TSLexer *lexer) {
  char word[STATEMENT_WORD_CAPACITY] = {0};
  size_t length = 0;
  bool stray = false;
  unsigned char cases = 0;
  const struct WordRole *entry = NULL;

  if (!advance_blanks(lexer)) {
    return false;
  }
  while (word_continues(lexer, continues_label, &stray)) {
    cases |= letter_case(lexer->lookahead);
    take_word_char(lexer, word, &length);
  }
  entry = intel_entry(word_entry(word), cases);
  return !stray && entry != NULL && entry->symbol == INTEL_PTR_WORD;
}

static bool operand_after(TSLexer *lexer) {
  if (!advance_blanks(lexer) || at_line_end(lexer)) {
    return false;
  }
  switch (lexer->lookahead) {
    case ';':
    case ',':
    case ']':
    case ')':
    case '}':
      return false;
    default:
      return true;
  }
}

static enum ScanDecision scan_intel_word(TSLexer *lexer, const bool *valid,
                                         const struct Scanner *scanner,
                                         const struct WordEntry *word, unsigned char cases) {
  const struct WordRole *entry = intel_entry(word, cases);

  if (!intel_word_fits(valid, scanner) || entry == NULL || !valid[entry->symbol]) {
    return SCAN_UNDECIDED;
  }
  lexer->mark_end(lexer);
  if ((entry->flags & WORD_PTR_FOLLOWS) != 0 && !ptr_word_follows(lexer)) {
    return SCAN_NOT_FOUND;
  }
  if (entry->symbol == ABSOLUTE_WORD && !operand_after(lexer)) {
    return SCAN_NOT_FOUND;
  }
  lexer->result_symbol = entry->symbol;
  return SCAN_FOUND;
}

static bool shift_amount_follows(TSLexer *lexer) {
  return advance_blanks(lexer) &&
         ((ASM_HASH_IMMEDIATES && lexer->lookahead == '#') || starts_element(lexer->lookahead));
}

static enum ScanDecision scan_arm_word(TSLexer *lexer, const bool *valid,
                                       const struct WordEntry *word, unsigned char cases) {
  const struct WordRole *shift = NULL;

  if (!arm_word_fits(valid)) {
    return SCAN_UNDECIDED;
  }
  if (valid[CONDITION] && is_condition(word, cases)) {
    return decided(finish_token(lexer, CONDITION));
  }
  if (valid[PREDICATE_QUALIFIER] && is_predicate_qualifier(word, cases)) {
    return decided(finish_token(lexer, PREDICATE_QUALIFIER));
  }
  shift = shift_word(word, cases);
  if (shift == NULL || !valid[shift->symbol]) {
    return SCAN_UNDECIDED;
  }
  lexer->mark_end(lexer);
  if (shift->symbol == SHIFT_WORD && !shift_amount_follows(lexer)) {
    return SCAN_NOT_FOUND;
  }
  lexer->result_symbol = shift->symbol;
  return SCAN_FOUND;
}

static bool scan_operand_word(TSLexer *lexer, const bool *valid, const struct Scanner *scanner) {
  char word[STATEMENT_WORD_CAPACITY] = {0};
  size_t length = 0;
  bool stray = false;
  bool underscore = false;
  bool upper_tail = false;
  unsigned char cases = 0;
  enum ScanDecision decision = SCAN_UNDECIDED;
  const struct WordEntry *entry = NULL;
  const struct WordRole *role = NULL;

  while (word_continues(lexer, continues_label, &stray)) {
    upper_tail = upper_tail || (underscore && lexer->lookahead >= 'A' && lexer->lookahead <= 'Z');
    underscore = underscore || lexer->lookahead == '_';
    cases |= letter_case(lexer->lookahead);
    take_word_char(lexer, word, &length);
  }
  if (stray) {
    return false;
  }
  entry = word_entry(word);
  if (valid[SUFFIX_RELOCATION_NAME] && is_suffix_relocation(entry, cases)) {
    return finish_token(lexer, SUFFIX_RELOCATION_NAME);
  }
  decision = scan_intel_word(lexer, valid, scanner, entry, cases);
  if (decision == SCAN_UNDECIDED) {
    decision = scan_arm_word(lexer, valid, entry, cases);
  }
  if (decision != SCAN_UNDECIDED) {
    return decision == SCAN_FOUND;
  }
  if (register_fits(valid, scanner)) {
    role = x86_register(word, entry, scanner->x86_syntax);
    if (role != NULL) {
      return finish_register(lexer, role);
    }
  }
  if (ASM_X86_OPERANDS && valid[PREFIX_WORD] && is_prefix(entry, scanner->x86_syntax)) {
    return finish_token(lexer, PREFIX_WORD);
  }
  if (arm_register_fits(valid) && register_role(word, entry, ARM_SCOPES) != NULL) {
    return finish_token(lexer, ARM_REGISTER);
  }
  return system_register_fits(valid) && system_register(word, entry, upper_tail) &&
         finish_token(lexer, SYSTEM_REGISTER);
}

static bool scan_syntax_argument(TSLexer *lexer, const bool *valid) {
  char word[STATEMENT_WORD_CAPACITY] = {0};
  size_t length = 0;
  unsigned char cases = 0;
  const struct WordRole *entry = NULL;

  while (is_word_char(lexer->lookahead)) {
    cases |= letter_case(lexer->lookahead);
    take_word_char(lexer, word, &length);
  }
  entry = word_role(word_entry(word), KIND_SYNTAX_WORDS, ANY_SCOPE, cases);
  return entry != NULL && valid[entry->symbol] && finish_token(lexer, entry->symbol);
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

static bool skip_macro_parentheses(TSLexer *lexer) {
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
  return advance_blanks(lexer);
}

static bool reserved_name(const char *word, const struct WordEntry *entry,
                          unsigned char x86_syntax) {
  return (ASM_PERCENT_MACROS && word[0] == '%') ||
         (ASM_RESERVED_NAMES &&
          (register_role(word, entry, X86_SCOPES) != NULL || is_prefix(entry, x86_syntax))) ||
         has_flag(statement_word(entry), WORD_RESERVED) ||
         has_flag(operand_word(entry), WORD_RESERVED);
}

static const struct WordEntry *read_statement_word(TSLexer *lexer, char *word, bool *upper) {
  size_t length = 0;
  bool stray = false;

  while (word_continues(lexer, continues_label, &stray)) {
    *upper = *upper || (lexer->lookahead >= 'A' && lexer->lookahead <= 'Z');
    take_word_char(lexer, word, &length);
  }
  if (stray) {
    word[0] = '\0';
    return NULL;
  }
  return word_entry(word);
}

static bool names_assignment(const struct WordRole *entry, bool upper) {
  return has_flag(entry, WORD_NAMES_ASSIGNMENT) && alias_case_fits(entry, upper);
}

static bool labelled_statement_follows(TSLexer *lexer, const struct Scanner *scanner) {
  char next[STATEMENT_WORD_CAPACITY] = {0};
  bool upper = false;
  const struct WordEntry *entry = read_statement_word(lexer, next, &upper);
  const struct WordRole *following = statement_word(entry);

  return has_flag(following, WORD_NAMES_LABEL) || names_assignment(following, upper) ||
         is_prefix(entry, scanner->x86_syntax) || instruction_role(next, entry) != NULL;
}

static bool spaced_glue_follows(TSLexer *lexer) {
  advance(lexer);
  if (!cross_joins(lexer) || lexer->lookahead != '+') {
    return false;
  }
  advance(lexer);
  return cross_joins(lexer) && !is_digit(lexer->lookahead);
}

static bool scan_colon_label(TSLexer *lexer, const bool *valid, const struct Scanner *scanner,
                             TSSymbol symbol, const char *word, const struct WordEntry *entry) {
  char next[STATEMENT_WORD_CAPACITY] = {0};
  bool upper = false;

  if (!valid[symbol] || reserved_name(word, entry, scanner->x86_syntax)) {
    return false;
  }
  if (ASM_NAMED_STATEMENTS) {
    advance(lexer);
    if (advance_blanks(lexer) &&
        names_assignment(statement_word(read_statement_word(lexer, next, &upper)), upper)) {
      return false;
    }
  }
  lexer->result_symbol = symbol;
  return true;
}

static bool names_macro(TSSymbol symbol, const char *word) {
  return (symbol == GLOBAL_LABEL_NAME || symbol == LOCAL_LABEL_NAME) && word[0] != '\0' &&
         (ASM_GNU_SYNTAX || word[0] != '.') && word[0] != '$' && word[0] != '%';
}

static bool scan_instruction(TSLexer *lexer, const bool *valid, const struct WordRole *entry) {
  if (valid[entry->symbol]) {
    lexer->result_symbol = entry->symbol;
    return true;
  }
  if (valid[INSTRUCTION_NAME]) {
    lexer->result_symbol = INSTRUCTION_NAME;
    return true;
  }
  return false;
}

static bool scan_named_word(TSLexer *lexer, const bool *valid, TSSymbol symbol, const char *word,
                            const struct WordRole *instruction) {
  if (instruction != NULL) {
    return scan_instruction(lexer, valid, instruction);
  }
  if (!valid[MACRO_NAME] || !names_macro(symbol, word)) {
    return false;
  }
  lexer->result_symbol = MACRO_NAME;
  return true;
}

static bool scan_unlisted_word(TSLexer *lexer, const bool *valid, const struct Scanner *scanner,
                               TSSymbol symbol, const char *word, const struct WordEntry *entry) {
  char next[STATEMENT_WORD_CAPACITY] = {0};
  const struct WordEntry *next_entry = NULL;
  const struct WordRole *following = NULL;
  const struct WordRole *instruction = NULL;
  bool upper = false;

  if (ASM_GNU_SYNTAX && lexer->lookahead == '=') {
    return false;
  }
  instruction = instruction_role(word, entry);
  next_entry = read_statement_word(lexer, next, &upper);
  following = statement_word(next_entry);
  if (ASM_NAMED_STATEMENTS && valid[symbol] && instruction == NULL &&
      !reserved_name(word, entry, scanner->x86_syntax) &&
      (has_flag(following, WORD_NAMES_LABEL) || is_prefix(next_entry, scanner->x86_syntax) ||
       instruction_role(next, next_entry) != NULL ||
       (next[0] == '\0' && !names_macro(symbol, word) &&
        (at_line_end(lexer) || lexer->lookahead == ';')))) {
    lexer->result_symbol = symbol;
    return true;
  }
  if (names_assignment(following, upper)) {
    return false;
  }
  return scan_named_word(lexer, valid, symbol, word, instruction);
}

static bool scan_keyword(TSLexer *lexer, const bool *valid, TSSymbol keyword) {
  if (valid[keyword]) {
    lexer->result_symbol = keyword;
    return true;
  }
  if (is_clause(keyword) && valid[CONDITIONAL_CLOSE]) {
    lexer->result_symbol = STRAY;
    return true;
  }
  if ((ASM_GNU_SYNTAX || keyword == STRUC_CLOSE || keyword == ISTRUC_CLOSE) &&
      valid[GENERIC_DIRECTIVE]) {
    lexer->result_symbol = GENERIC_DIRECTIVE;
    return true;
  }
  return false;
}

static inline int32_t glue_escape(void) {
  return ASM_PERCENT_MACROS ? '%' : '\\';
}

static bool scan_hyphenated(TSLexer *lexer, const bool *valid, TSSymbol symbol, const char *word,
                            const struct WordEntry *entry, const struct WordRole *keyword) {
  char joined[STATEMENT_WORD_CAPACITY] = {0};
  size_t length = strlen(word);
  const struct WordRole *instruction = NULL;

  copy_leading(joined, word, length);
  while (word[0] != '\0' && (lexer->lookahead == '-' || continues_label(lexer->lookahead))) {
    take_word_char(lexer, joined, &length);
  }
  instruction = instruction_role(joined, word_entry(joined));
  if (instruction != NULL) {
    lexer->mark_end(lexer);
    return scan_instruction(lexer, valid, instruction);
  }
  if (keyword != NULL) {
    return scan_keyword(lexer, valid, keyword->symbol);
  }
  return scan_named_word(lexer, valid, symbol, word, instruction_role(word, entry));
}

static bool scan_parenthesized_word(TSLexer *lexer, const bool *valid,
                                    const struct Scanner *scanner, TSSymbol symbol,
                                    const char *word, const struct WordEntry *entry,
                                    const struct WordRole *keyword) {
  if (skip_macro_parentheses(lexer) &&
      (lexer->lookahead == ':' ||
       (ASM_NAMED_STATEMENTS && labelled_statement_follows(lexer, scanner)))) {
    lexer->result_symbol = MACRO_LABEL_NAME;
    return true;
  }
  if (keyword != NULL) {
    return scan_keyword(lexer, valid, keyword->symbol);
  }
  return scan_named_word(lexer, valid, symbol, word, instruction_role(word, entry));
}

static bool scan_word_role(TSLexer *lexer, const bool *valid, const struct Scanner *scanner,
                           TSSymbol symbol, const char *word) {
  const struct WordEntry *entry = word_entry(word);
  const struct WordRole *keyword = statement_word(entry);
  bool stray = false;
  bool glued = false;

  if (keyword != NULL && ends_inner_block(keyword->symbol, valid)) {
    if (advance_blanks(lexer) && lexer->lookahead == ':') {
      return false;
    }
    lexer->result_symbol = BLOCK_END;
    return true;
  }
  lexer->mark_end(lexer);
  if (lexer->lookahead == '-') {
    return scan_hyphenated(lexer, valid, symbol, word, entry, keyword);
  }
  glued = lexer->lookahead == glue_escape();
  stray = !advance_blanks(lexer);
  if (!stray && lexer->lookahead == '(' && valid[MACRO_LABEL_NAME]) {
    return scan_parenthesized_word(lexer, valid, scanner, symbol, word, entry, keyword);
  }
  if (ASM_PERCENT_MACROS && !stray && keyword == NULL && lexer->lookahead == '%' &&
      spaced_glue_follows(lexer)) {
    return false;
  }
  if (!stray && lexer->lookahead == ':') {
    return scan_colon_label(lexer, valid, scanner, symbol, word, entry);
  }
  if (valid[PREFIX_WORD] && is_prefix(entry, scanner->x86_syntax) &&
      (stray || prefix_ends(lexer))) {
    lexer->result_symbol = PREFIX_WORD;
    return true;
  }
  if (keyword != NULL) {
    return scan_keyword(lexer, valid, keyword->symbol);
  }
  return !stray && !glued && scan_unlisted_word(lexer, valid, scanner, symbol, word, entry);
}

static bool scan_statement_word(TSLexer *lexer, const bool *valid, const struct Scanner *scanner) {
  TSSymbol symbol = GLOBAL_LABEL_NAME;
  char word[STATEMENT_WORD_CAPACITY] = {0};

  lexer->mark_end(lexer);
  if (!read_label_word(lexer, valid, &symbol, word)) {
    return false;
  }
  return scan_word_role(lexer, valid, scanner, symbol, word);
}

static bool scan_relocation_specifier(TSLexer *lexer) {
  while (is_word_char(lexer->lookahead)) {
    advance(lexer);
  }
  return finish_token(lexer, RELOCATION_SPECIFIER);
}

static bool glue_fits(const TSLexer *lexer, const bool *valid) {
  if (lexer->lookahead == glue_escape()) {
    return valid[GLUED_ARGUMENT] || valid[GLUED_SEPARATOR];
  }
  return valid[GLUED_TEXT] && continues_label(lexer->lookahead);
}

static bool read_argument_tail(TSLexer *lexer) {
  bool stray = false;

  if (lexer->lookahead == '-' || lexer->lookahead == '+') {
    advance(lexer);
  } else if (lexer->lookahead == '*') {
    advance(lexer);
    if (!cross_joins(lexer) || lexer->lookahead != '?') {
      return false;
    }
  }
  if (!cross_joins(lexer)) {
    return false;
  }
  if (lexer->lookahead == '?') {
    advance(lexer);
    if (!cross_joins(lexer)) {
      return false;
    }
    if (lexer->lookahead == '?') {
      advance(lexer);
    }
    return true;
  }
  if (!is_digit(lexer->lookahead)) {
    return false;
  }
  while (word_continues(lexer, is_digit, &stray)) {
    advance(lexer);
  }
  return !stray;
}

static TSSymbol read_macro_token(TSLexer *lexer);

static TSSymbol glued_variant(TSSymbol symbol) {
  switch (symbol) {
    case MACRO_LOCAL:
      return GLUED_LOCAL;
    case CONTEXT_LOCAL:
      return GLUED_CONTEXT;
    case MACRO_EXPANSION:
      return GLUED_EXPANSION;
    default:
      return STRAY;
  }
}

static bool read_percent_glue(TSLexer *lexer, const bool *valid, TSSymbol *symbol) {
  int32_t next = 0;

  advance(lexer);
  if (!cross_joins(lexer)) {
    return false;
  }
  next = lexer->lookahead;
  if (next == '+') {
    advance(lexer);
    if (!cross_joins(lexer)) {
      return false;
    }
    if (!is_digit(lexer->lookahead)) {
      *symbol = GLUED_SEPARATOR;
      return valid[GLUED_SEPARATOR];
    }
  } else if (next == '%' || next == '$' || next == '{' || next == '[' || next == '!') {
    *symbol = glued_variant(read_macro_token(lexer));
    return *symbol != STRAY && valid[*symbol];
  } else if (!is_digit(next) && next != '?' && next != '-' && next != '*') {
    *symbol = REMAINDER;
    return valid[REMAINDER];
  }
  *symbol = GLUED_ARGUMENT;
  return valid[GLUED_ARGUMENT] && read_argument_tail(lexer);
}

static bool read_glued_escape(TSLexer *lexer, const bool *valid, TSSymbol *symbol) {
  if (ASM_PERCENT_MACROS) {
    return read_percent_glue(lexer, valid, symbol);
  }
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
  if (!argument_name_follows(lexer)) {
    return false;
  }
  while (is_word_char(lexer->lookahead)) {
    advance(lexer);
  }
  return true;
}

static bool scan_glued(TSLexer *lexer, const bool *valid, bool closing) {
  TSSymbol symbol = GLUED_ARGUMENT;
  bool stray = false;

  if (lexer->lookahead != glue_escape()) {
    while (word_continues(lexer, continues_label, &stray)) {
      advance(lexer);
    }
    return !stray && finish_token(lexer, GLUED_TEXT);
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

enum ParenthesisContent {
  CONTENT_OTHER,
  CONTENT_MEMORY,
  CONTENT_SUFFIX,
};

static enum ParenthesisContent parenthesis_content(TSLexer *lexer, unsigned char x86_syntax) {
  char word[STATEMENT_WORD_CAPACITY] = {0};
  size_t length = 0;
  unsigned char cases = 0;
  const bool att = ASM_X86_OPERANDS && (x86_syntax & X86_INTEL) == 0;
  const bool suffix = ASM_SUFFIX_RELOCATIONS && !is_blank(lexer->lookahead);
  const bool bare_register = att && (x86_syntax & X86_NOPREFIX) != 0;
  const struct WordEntry *entry = NULL;

  if (!advance_blanks(lexer)) {
    return CONTENT_OTHER;
  }
  if (att && (lexer->lookahead == '%' || lexer->lookahead == ',')) {
    return CONTENT_MEMORY;
  }
  if (!suffix && !bare_register) {
    return CONTENT_OTHER;
  }
  while (is_word_char(lexer->lookahead)) {
    cases |= letter_case(lexer->lookahead);
    take_word_char(lexer, word, &length);
  }
  entry = word_entry(word);
  if (suffix && is_suffix_relocation(entry, cases)) {
    return CONTENT_SUFFIX;
  }
  if (bare_register && x86_register(word, entry, x86_syntax) != NULL) {
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
  if (split && !(ASM_PERCENT_MACROS && valid[CALL_ARGUMENTS])) {
    lexer->result_symbol = BLANK;
    return content == CONTENT_OTHER ? SCAN_FOUND : SCAN_NOT_FOUND;
  }
  if (valid[CALL_ARGUMENTS] || valid[RELOCATION_SUFFIX]) {
    lexer->result_symbol = valid[CALL_ARGUMENTS] ? CALL_ARGUMENTS : RELOCATION_SUFFIX;
    return SCAN_FOUND;
  }
  return SCAN_NOT_FOUND;
}

static bool operands_follow(const TSLexer *lexer, const bool *valid,
                            const struct Scanner *scanner) {
  if (!ASM_X86_OPERANDS || !valid[INTEL_OPERANDS] || (scanner->x86_syntax & X86_INTEL) == 0 ||
      at_line_end(lexer)) {
    return false;
  }
  return !scanner_dispatches(lexer->lookahead) && lexer->lookahead != '=' &&
         lexer->lookahead != ':';
}

static bool braced_token_follows(TSLexer *lexer, TSSymbol symbol, bool mark_open);

static bool scan_operands(TSLexer *lexer, const bool *valid, const struct Scanner *scanner) {
  char word[STATEMENT_WORD_CAPACITY] = {0};
  const struct WordEntry *word_found = NULL;
  const struct WordRole *entry = NULL;
  const struct WordRole *instruction = NULL;
  bool upper = false;

  lexer->mark_end(lexer);
  lexer->result_symbol = INTEL_OPERANDS;
  if (!ASM_NAMED_STATEMENTS) {
    return true;
  }
  if (lexer->lookahead == '{' && valid[PSEUDO_PREFIX]) {
    if (braced_token_follows(lexer, PSEUDO_PREFIX, false)) {
      return finish_token(lexer, PSEUDO_PREFIX);
    }
    return true;
  }
  if (lexer->lookahead == '%' && valid[GLUED_SEPARATOR]) {
    return !spaced_glue_follows(lexer) || finish_token(lexer, GLUED_SEPARATOR);
  }
  word_found = read_statement_word(lexer, word, &upper);
  entry = statement_word(word_found);
  if ((has_flag(entry, WORD_NAMES_ASSIGNMENT) || has_flag(entry, WORD_NAMES_LABEL)) &&
      valid[entry->symbol]) {
    return finish_token(lexer, entry->symbol);
  }
  if (valid[PREFIX_WORD] && is_prefix(word_found, scanner->x86_syntax)) {
    return finish_token(lexer, PREFIX_WORD);
  }
  instruction = instruction_role(word, word_found);
  if (instruction != NULL && (valid[instruction->symbol] || valid[INSTRUCTION_NAME])) {
    lexer->mark_end(lexer);
    return scan_instruction(lexer, valid, instruction);
  }
  return true;
}

static void read_balanced(TSLexer *lexer, int32_t open) {
  const int32_t close = open == '{' ? '}' : ']';
  uint32_t depth = 0;

  while (!at_line_end(lexer)) {
    if (lexer->lookahead == open) {
      depth++;
    } else if (lexer->lookahead == close) {
      depth--;
      if (depth == 0) {
        advance(lexer);
        return;
      }
    }
    advance_text(lexer);
  }
}

static TSSymbol read_local_token(TSLexer *lexer, int32_t sigil) {
  bool stray = false;

  advance(lexer);
  if (!cross_joins(lexer)) {
    return STRAY;
  }
  while (sigil == '$' && lexer->lookahead == '$') {
    advance(lexer);
    if (!cross_joins(lexer)) {
      return STRAY;
    }
  }
  if (!continues_label(lexer->lookahead)) {
    return STRAY;
  }
  while (word_continues(lexer, continues_label, &stray)) {
    advance(lexer);
  }
  if (stray) {
    return STRAY;
  }
  return sigil == '%' ? MACRO_LOCAL : CONTEXT_LOCAL;
}

static TSSymbol read_expansion(TSLexer *lexer, int32_t next) {
  bool stray = false;

  if (next != '!') {
    read_balanced(lexer, next);
    return MACRO_EXPANSION;
  }
  advance(lexer);
  if (!cross_joins(lexer)) {
    return STRAY;
  }
  if (is_quote(lexer->lookahead)) {
    consume_quoted(lexer);
  }
  while (word_continues(lexer, continues_label, &stray)) {
    advance(lexer);
  }
  return stray ? STRAY : MACRO_EXPANSION;
}

static TSSymbol read_prefixed_argument(TSLexer *lexer, int32_t next) {
  lexer->mark_end(lexer);
  advance(lexer);
  if (!cross_joins(lexer)) {
    return STRAY;
  }
  if (next == '*') {
    return lexer->lookahead == '?' && read_argument_tail(lexer) ? ARGUMENT_REFERENCE : REMAINDER;
  }
  if (!is_digit(lexer->lookahead)) {
    return next == '+' ? GLUED_SEPARATOR : REMAINDER;
  }
  return read_argument_tail(lexer) ? ARGUMENT_REFERENCE : REMAINDER;
}

static TSSymbol read_macro_token(TSLexer *lexer) {
  const int32_t next = lexer->lookahead;

  if (next == '%' || next == '$') {
    return read_local_token(lexer, next);
  }
  if (next == '{' || next == '[' || next == '!') {
    return read_expansion(lexer, next);
  }
  if (next == '+' || next == '-' || next == '*') {
    return read_prefixed_argument(lexer, next);
  }
  return read_argument_tail(lexer) ? ARGUMENT_REFERENCE : REMAINDER;
}

static enum ScanDecision scan_macro_token(TSLexer *lexer, const bool *valid, uint32_t blanks) {
  const int32_t next = lexer->lookahead;
  const bool marked = next == '+' || next == '-' || next == '*';
  const bool gap = !marked && valid[OPERAND_GAP] && blanks > 0;
  const TSSymbol symbol = read_macro_token(lexer);

  if (symbol == STRAY) {
    return at_line_end(lexer) && closable(valid) ? decided(close_construct(lexer, valid))
                                                 : SCAN_NOT_FOUND;
  }
  if (symbol == REMAINDER && valid[REMAINDER]) {
    lexer->result_symbol = REMAINDER;
    return marked ? SCAN_FOUND : decided(finish_token(lexer, REMAINDER));
  }
  if (symbol != REMAINDER && valid[symbol]) {
    return decided(finish_token(lexer, symbol));
  }
  if (symbol != REMAINDER && gap) {
    lexer->result_symbol = OPERAND_GAP;
    return SCAN_FOUND;
  }
  return decided(!marked && closable(valid) && close_construct(lexer, valid));
}

static enum ScanDecision scan_percent_word(TSLexer *lexer, const bool *valid) {
  bool stray = false;

  if (valid[REMAINDER]) {
    return decided(finish_token(lexer, REMAINDER));
  }
  if ((!valid[MACRO_EXPANSION] && !valid[PREPROC_FUNCTION]) || valid[INSTRUCTION_NAME]) {
    return decided(closable(valid) && close_construct(lexer, valid));
  }
  while (word_continues(lexer, continues_label, &stray)) {
    advance(lexer);
  }
  if (stray) {
    return SCAN_NOT_FOUND;
  }
  lexer->mark_end(lexer);
  if (valid[PREPROC_FUNCTION] && advance_blanks(lexer) && lexer->lookahead == '(') {
    lexer->result_symbol = PREPROC_FUNCTION;
    return SCAN_FOUND;
  }
  if (!valid[MACRO_EXPANSION]) {
    return SCAN_NOT_FOUND;
  }
  lexer->result_symbol = MACRO_EXPANSION;
  return SCAN_FOUND;
}

static enum ScanDecision scan_percent(TSLexer *lexer, const bool *valid,
                                      const struct Scanner *scanner, const struct Gap *gap) {
  char word[STATEMENT_WORD_CAPACITY] = {0};
  size_t length = 0;
  bool joined = false;
  bool line_start = false;
  bool stray = false;
  bool spaced = false;

  lexer->mark_end(lexer);
  if (!ASM_PERCENT_MACROS) {
    advance(lexer);
    return decided(valid[REMAINDER] && finish_token(lexer, REMAINDER));
  }
  take_word_char(lexer, word, &length);
  if (ASM_LINE_JOINS && lexer->lookahead == '\\') {
    joined = true;
    line_start = starts_line(lexer, gap);
    if (!cross_joins(lexer)) {
      return SCAN_NOT_FOUND;
    }
  }
  if (valid[LIST_OPEN] && (lexer->lookahead == '(' || is_blank(lexer->lookahead))) {
    spaced = is_blank(lexer->lookahead);
    if (advance_blanks(lexer) && lexer->lookahead == '(') {
      advance(lexer);
      return decided(finish_token(lexer, LIST_OPEN));
    }
    if (spaced) {
      return decided(closable(valid) && close_construct(lexer, valid));
    }
  }
  if (!is_alpha(lexer->lookahead)) {
    return scan_macro_token(lexer, valid, gap->blanks);
  }
  if (!joined) {
    line_start = starts_line(lexer, gap);
  }
  if (!statement_keyword_fits(valid) || !line_start) {
    return scan_percent_word(lexer, valid);
  }
  while (word_continues(lexer, continues_label, &stray)) {
    take_word_char(lexer, word, &length);
  }
  if (stray) {
    return SCAN_NOT_FOUND;
  }
  return decided(scan_word_role(lexer, valid, scanner, GLOBAL_LABEL_NAME, word));
}

static enum ScanDecision scan_relocation_name(TSLexer *lexer, const bool *valid) {
  char word[STATEMENT_WORD_CAPACITY] = {0};
  size_t length = 0;
  const int32_t first = lexer->lookahead;

  unsigned char cases = 0;

  lexer->mark_end(lexer);
  while (is_word_char(lexer->lookahead)) {
    cases |= letter_case(lexer->lookahead);
    take_word_char(lexer, word, &length);
  }
  if (is_relocation_name(word_entry(word), cases)) {
    return decided(finish_token(lexer, RELOCATION_NAME));
  }
  return decided(closable(valid) && closes_before(first, valid) && close_construct(lexer, valid));
}

static const struct WordRole *decorator_entry(const struct WordEntry *entry, unsigned char cases) {
  return word_role(entry, KIND_DECORATORS, ANY_SCOPE, cases);
}

static bool is_mask_register(const char *word, const struct WordEntry *entry) {
  return has_flag(register_role(word, entry, X86_SCOPES), REGISTER_MASK);
}

static bool read_decorator_word(TSLexer *lexer, bool (*continues)(int32_t), char *word,
                                unsigned char *cases) {
  size_t length = 0;
  bool stray = false;

  while (word_continues(lexer, continues, &stray)) {
    *cases |= letter_case(lexer->lookahead);
    take_word_char(lexer, word, &length);
  }
  return !stray && length > 0 && word[0] != '\0';
}

static bool folded_decorator_follows(TSLexer *lexer) {
  char word[STATEMENT_WORD_CAPACITY] = {0};
  unsigned char cases = 0;
  const struct WordEntry *found = NULL;
  const struct WordRole *entry = NULL;

  if (!read_decorator_word(lexer, continues_decorator, word, &cases)) {
    return false;
  }
  found = word_entry(word);
  entry = decorator_entry(found, cases);
  if (has_flag(entry, DECORATOR_FLAGS)) {
    return default_flags_follow(lexer);
  }
  return (entry != NULL && !has_flag(entry, DECORATOR_DASHED)) || is_mask_register(word, found);
}

static bool joined_decorator_fits(const char *head, const char *tail, unsigned char cases) {
  char joined[STATEMENT_WORD_CAPACITY] = {0};
  const size_t head_length = strlen(head);
  const size_t tail_length = strlen(tail);

  if (head_length + 1 + tail_length >= STATEMENT_WORD_CAPACITY) {
    return false;
  }
  copy_leading(joined, head, head_length);
  joined[head_length] = '-';
  copy_leading(joined + head_length + 1, tail, tail_length);
  return decorator_entry(word_entry(joined), cases) != NULL;
}

static bool decorator_body_follows(TSLexer *lexer) {
  char word[STATEMENT_WORD_CAPACITY] = {0};
  char tail[STATEMENT_WORD_CAPACITY] = {0};
  unsigned char cases = 0;
  unsigned char tail_cases = 0;
  bool spaced = false;
  const struct WordEntry *found = NULL;
  const struct WordRole *entry = NULL;

  if (ASM_FOLDED_DECORATORS) {
    return folded_decorator_follows(lexer);
  }
  if (lexer->lookahead == '%') {
    advance(lexer);
    return advance_blanks(lexer) && read_decorator_word(lexer, is_alnum, word, &cases) &&
           is_mask_register(word, word_entry(word));
  }
  if (!read_decorator_word(lexer, is_alnum, word, &cases)) {
    return false;
  }
  found = word_entry(word);
  if (is_mask_register(word, found)) {
    return true;
  }
  entry = decorator_entry(found, cases);
  if (has_flag(entry, DECORATOR_FLAGS)) {
    return default_flags_follow(lexer);
  }
  spaced = is_blank(lexer->lookahead);
  if (!advance_blanks(lexer)) {
    return false;
  }
  if (lexer->lookahead != '-') {
    return entry != NULL && !has_flag(entry, DECORATOR_DASHED);
  }
  advance(lexer);
  spaced = spaced || is_blank(lexer->lookahead);
  if (!advance_blanks(lexer) || !read_decorator_word(lexer, is_alnum, tail, &tail_cases)) {
    return false;
  }
  return has_flag(entry, DECORATOR_DASHED) ||
         (!spaced && joined_decorator_fits(word, tail, cases | tail_cases));
}

static bool braced_token_follows(TSLexer *lexer, TSSymbol symbol, bool mark_open) {
  advance(lexer);
  if (mark_open) {
    lexer->mark_end(lexer);
  }
  if (!advance_blanks(lexer)) {
    return false;
  }
  if (symbol == PSEUDO_PREFIX ? !pseudo_prefix_follows(lexer) : !decorator_body_follows(lexer)) {
    return false;
  }
  if (!advance_blanks(lexer) || lexer->lookahead != '}') {
    return false;
  }
  advance(lexer);
  return true;
}

static enum ScanDecision scan_braced(TSLexer *lexer, const bool *valid, uint32_t blanks) {
  const TSSymbol symbol = valid[PSEUDO_PREFIX] ? PSEUDO_PREFIX : DECORATOR;
  const bool blank = valid[BLANK] && (ASM_PERCENT_MACROS || (blanks > 0 && separates_operand('{')));
  const bool open = valid[BRACE_OPEN] && !blank;

  lexer->mark_end(lexer);
  if ((valid[DECORATOR] || valid[PSEUDO_PREFIX]) && braced_token_follows(lexer, symbol, open)) {
    return decided(finish_token(lexer, symbol));
  }
  if (blank || open) {
    if (open && !valid[DECORATOR] && !valid[PSEUDO_PREFIX]) {
      advance(lexer);
      lexer->mark_end(lexer);
    }
    lexer->result_symbol = blank ? BLANK : BRACE_OPEN;
    return SCAN_FOUND;
  }
  return decided(closable(valid) && closes_before('{', valid) && close_construct(lexer, valid));
}

static bool colon_fits(const bool *valid) {
  TSSymbol symbol = BRACKET_COLON;

  return (ASM_COLON_TYPE_MARK && valid[TYPE_MARK]) || valid[BRACKET_COLON] ||
         first_valid(valid, PLAIN_COLONS, sizeof(PLAIN_COLONS) / sizeof(PLAIN_COLONS[0]), &symbol);
}

static enum ScanDecision scan_type_colon(TSLexer *lexer, uint32_t blanks) {
  if (blanks > 0) {
    return SCAN_NOT_FOUND;
  }
  lexer->mark_end(lexer);
  lexer->result_symbol = TYPE_MARK;
  return decided(advance_blanks(lexer) && (is_alpha(lexer->lookahead) ||
                                           is_digit(lexer->lookahead) || lexer->lookahead == '('));
}

static enum ScanDecision scan_bracket_colon(TSLexer *lexer, const bool *valid) {
  lexer->mark_end(lexer);
  if (ASM_RELOCATION_OPERATORS && valid[MISSING_ELEMENT]) {
    if (!advance_blanks(lexer) || !is_digit(lexer->lookahead)) {
      return SCAN_NOT_FOUND;
    }
  }
  lexer->result_symbol = BRACKET_COLON;
  return SCAN_FOUND;
}

static enum ScanDecision scan_colon(TSLexer *lexer, const bool *valid, uint32_t blanks) {
  TSSymbol symbol = BRACKET_COLON;
  bool plain = false;

  lexer->mark_end(lexer);
  advance(lexer);
  if (valid[REFERENCE_COLON]) {
    lexer->mark_end(lexer);
    plain =
        first_valid(valid, PLAIN_COLONS, sizeof(PLAIN_COLONS) / sizeof(PLAIN_COLONS[0]), &symbol);
    if (!plain || (advance_blanks(lexer) && (lexer->lookahead == '(' || lexer->lookahead == ':'))) {
      symbol = REFERENCE_COLON;
    }
    lexer->result_symbol = symbol;
    return SCAN_FOUND;
  }
  if (ASM_COLON_TYPE_MARK && valid[TYPE_MARK]) {
    return scan_type_colon(lexer, blanks);
  }
  if (first_valid(valid, PLAIN_COLONS, sizeof(PLAIN_COLONS) / sizeof(PLAIN_COLONS[0]), &symbol)) {
    return decided(finish_token(lexer, symbol));
  }
  return scan_bracket_colon(lexer, valid);
}

static enum ScanDecision unread_word(TSLexer *lexer, const bool *valid, int32_t first,
                                     uint32_t blanks) {
  if ((valid[BLANK] || valid[OPERAND_GAP]) && blanks > 0) {
    lexer->result_symbol = valid[BLANK] ? BLANK : OPERAND_GAP;
    return SCAN_FOUND;
  }
  return decided(closable(valid) && closes_before(first, valid) && close_construct(lexer, valid));
}

static enum ScanDecision scan_word_token(TSLexer *lexer, const bool *valid,
                                         const struct Scanner *scanner, uint32_t blanks) {
  const int32_t first = lexer->lookahead;

  lexer->mark_end(lexer);
  if (scan_operand_word(lexer, valid, scanner)) {
    return SCAN_FOUND;
  }
  return unread_word(lexer, valid, first, blanks);
}

static enum ScanDecision scan_digit_word(TSLexer *lexer, const bool *valid, uint32_t blanks) {
  char word[STATEMENT_WORD_CAPACITY] = {0};
  size_t length = 0;
  bool stray = false;
  unsigned char cases = 0;
  const int32_t first = lexer->lookahead;

  lexer->mark_end(lexer);
  while (is_digit(lexer->lookahead)) {
    take_word_char(lexer, word, &length);
  }
  if (valid[DOLLAR_LABEL] && lexer->lookahead == '$') {
    advance(lexer);
    return decided(finish_token(lexer, DOLLAR_LABEL));
  }
  while (word_continues(lexer, continues_label, &stray)) {
    cases |= letter_case(lexer->lookahead);
    take_word_char(lexer, word, &length);
  }
  if (!stray && valid[SECTION_TYPE_WORD] && is_macho_section_type(word_entry(word), cases)) {
    return decided(finish_token(lexer, SECTION_TYPE_WORD));
  }
  return unread_word(lexer, valid, first, blanks);
}

static bool starts_group_item(TSLexer *lexer, const struct Scanner *scanner) {
  const int32_t first = lexer->lookahead;

  if (first == '\\') {
    advance(lexer);
    return lexer->lookahead == '@' || lexer->lookahead == '+' || lexer->lookahead == '(' ||
           argument_name_follows(lexer);
  }
  if (first == '$' && ASM_DARWIN_ARGUMENTS) {
    advance(lexer);
    return is_digit(lexer->lookahead);
  }
  if (ASM_X86_OPERANDS && (scanner->x86_syntax & X86_INTEL) != 0) {
    return starts_intel_expression(first);
  }
  return starts_expression(first) || (ASM_X86_OPERANDS && ASM_GNU_SYNTAX && first == '%');
}

static enum ScanDecision scan_blank(TSLexer *lexer, const bool *valid,
                                    const struct Scanner *scanner, uint32_t blanks) {
  if (!valid[BLANK] || blanks == 0 || !separates_operand(lexer->lookahead) ||
      (lexer->lookahead == ':' && colon_fits(valid))) {
    return SCAN_UNDECIDED;
  }
  if (lexer->lookahead == '(') {
    return scan_parenthesis(lexer, valid, scanner->x86_syntax, true);
  }
  lexer->mark_end(lexer);
  if (valid[UNCLOSED_ARGUMENTS] && !starts_group_item(lexer, scanner)) {
    return decided(close_construct(lexer, valid));
  }
  lexer->result_symbol = BLANK;
  return SCAN_FOUND;
}

static bool scan_special_symbol(TSLexer *lexer) {
  advance(lexer);
  if (lexer->lookahead != '.') {
    return false;
  }
  advance(lexer);
  if (!continues_label(lexer->lookahead)) {
    return false;
  }
  while (continues_label(lexer->lookahead)) {
    advance(lexer);
  }
  return finish_token(lexer, SPECIAL_SYMBOL);
}

static enum ScanDecision scan_list_word(TSLexer *lexer, const bool *valid) {
  char word[STATEMENT_WORD_CAPACITY] = {0};
  size_t length = 0;
  bool stray = false;

  while (word_continues(lexer, continues_label, &stray)) {
    take_word_char(lexer, word, &length);
  }
  if (!stray && word_role(word_entry(word), KIND_LIST_WORDS, ANY_SCOPE, ANY_CASE) != NULL) {
    return decided(finish_token(lexer, LIST_WORD));
  }
  if (valid[PREPROC_ARGUMENT] || valid[TRAILING_ARGUMENT]) {
    return decided(
        scan_raw_text(lexer, valid[PREPROC_ARGUMENT] ? PREPROC_ARGUMENT : TRAILING_ARGUMENT));
  }
  return SCAN_NOT_FOUND;
}

static enum ScanDecision scan_question_mark(TSLexer *lexer, const bool *valid) {
  lexer->mark_end(lexer);
  advance(lexer);
  if (!cross_joins(lexer)) {
    return SCAN_NOT_FOUND;
  }
  if (!continues_label(lexer->lookahead)) {
    return decided(
        finish_token(lexer, valid[UNINITIALIZED] ? UNINITIALIZED : CONDITIONAL_QUESTION));
  }
  return decided(!valid[UNINITIALIZED] && closable(valid) && close_construct(lexer, valid));
}

static enum ScanDecision scan_open_parenthesis(TSLexer *lexer, const bool *valid,
                                               const struct Scanner *scanner) {
  if (valid[STATEMENT_CALL]) {
    lexer->mark_end(lexer);
    if (!statement_call_follows(lexer)) {
      return SCAN_NOT_FOUND;
    }
    lexer->result_symbol = STATEMENT_CALL;
    return SCAN_FOUND;
  }
  if (valid[CALL_ARGUMENTS] || valid[RELOCATION_SUFFIX] || valid[MEMORY_ADDRESS]) {
    return scan_parenthesis(lexer, valid, scanner->x86_syntax, false);
  }
  return SCAN_UNDECIDED;
}

static enum ScanDecision scan_operand_gap(TSLexer *lexer, const bool *valid, uint32_t blanks) {
  const int32_t first = lexer->lookahead;

  if (!valid[OPERAND_GAP] || blanks == 0 || !starts_gapped_operand(first)) {
    return SCAN_UNDECIDED;
  }
  lexer->mark_end(lexer);
  if (first == '!') {
    advance(lexer);
    if (!cross_joins(lexer) || lexer->lookahead == '=') {
      return SCAN_NOT_FOUND;
    }
  }
  lexer->result_symbol = OPERAND_GAP;
  return SCAN_FOUND;
}

static enum ScanDecision scan_expected_token(TSLexer *lexer, const bool *valid,
                                             const struct Scanner *scanner, uint32_t blanks) {
  const int32_t first = lexer->lookahead;

  if (first == ':' && (colon_fits(valid) || valid[REFERENCE_COLON])) {
    return scan_colon(lexer, valid, blanks);
  }
  if ((first == ',' && valid[MEMORY_COMMA]) || (first == '-' && valid[RANGE_DASH])) {
    advance(lexer);
    return decided(finish_token(lexer, first == ',' ? MEMORY_COMMA : RANGE_DASH));
  }
  if (first == '(') {
    return scan_open_parenthesis(lexer, valid, scanner);
  }
  if (first == '[' && valid[INDEX_OPEN]) {
    advance(lexer);
    return decided(finish_token(lexer, INDEX_OPEN));
  }
  if (first == '.' && valid[SPECIAL_SYMBOL]) {
    lexer->mark_end(lexer);
    return decided(scan_special_symbol(lexer));
  }
  if (first == '.' && (valid[REGISTER_ALIAS_WORD] || valid[NEON_ALIAS_WORD])) {
    return decided(scan_register_alias_word(lexer, valid));
  }
  if (first == '.' && valid[LIST_WORD]) {
    return scan_list_word(lexer, valid);
  }
  if (is_alpha(first) && (valid[SYNTAX_PREFIX] || valid[SYNTAX_NOPREFIX])) {
    return decided(scan_syntax_argument(lexer, valid));
  }
  return SCAN_UNDECIDED;
}

static enum ScanDecision scan_operand_token(TSLexer *lexer, const bool *valid,
                                            const struct Scanner *scanner, const struct Gap *gap) {
  const int32_t first = lexer->lookahead;
  const uint32_t blanks = gap->blanks;
  enum ScanDecision decision = SCAN_UNDECIDED;

  if (first == '%' && !ASM_PERCENT_MACROS && blanks > 0 && valid[BLANK] &&
      separates_operand(first)) {
    return scan_blank(lexer, valid, scanner, blanks);
  }
  if (first == '%' && (ASM_PERCENT_MACROS || valid[REMAINDER])) {
    return scan_percent(lexer, valid, scanner, gap);
  }
  if (first == '%' && ASM_X86_OPERANDS && valid[REGISTER]) {
    return decided(scan_percent_register(lexer, scanner));
  }
  if (is_digit(first) && (valid[SECTION_TYPE_WORD] || valid[DOLLAR_LABEL])) {
    return scan_digit_word(lexer, valid, blanks);
  }
  if (is_alpha(first) && valid[RELOCATION_NAME]) {
    return scan_relocation_name(lexer, valid);
  }
  if (is_alpha(first) && operand_word_fits(valid, scanner) && !statement_word_fits(lexer, valid)) {
    return scan_word_token(lexer, valid, scanner, blanks);
  }
  if (first == '{' && (valid[DECORATOR] || valid[PSEUDO_PREFIX] || valid[BRACE_OPEN])) {
    return scan_braced(lexer, valid, blanks);
  }
  if (first == '?' && (valid[CONDITIONAL_QUESTION] || valid[UNINITIALIZED])) {
    return scan_question_mark(lexer, valid);
  }
  decision = scan_blank(lexer, valid, scanner, blanks);
  if (decision == SCAN_UNDECIDED) {
    decision = scan_operand_gap(lexer, valid, blanks);
  }
  if (decision != SCAN_UNDECIDED) {
    return decision;
  }
  return scan_expected_token(lexer, valid, scanner, blanks);
}

static enum ScanDecision scan_open_content(TSLexer *lexer, const bool *valid, bool closing) {
  bool glued = !is_blank(lexer->lookahead);

  if (valid[STRING_CONTENT]) {
    return decided(scan_string_content(lexer, valid));
  }
  if (glued && valid[LIST_WORD] && lexer->lookahead == '.') {
    return scan_list_word(lexer, valid);
  }
  if (ASM_PERCENT_MACROS && glued && valid[PREPROC_ARGUMENT] && glue_fits(lexer, valid)) {
    return decided(scan_glued(lexer, valid, closing));
  }
  if (valid[PREPROC_ARGUMENT]) {
    return scan_preproc_rest(lexer, valid);
  }
  if (glued && valid[RELOCATION_SPECIFIER] && is_alpha(lexer->lookahead)) {
    return decided(scan_relocation_specifier(lexer));
  }
  if (glued && ASM_LINE_JOINS && lexer->lookahead == '\\' &&
      (valid[GLUED_ARGUMENT] || valid[GLUED_SEPARATOR] || valid[GLUED_TEXT])) {
    if (!skip_joins(lexer)) {
      return SCAN_NOT_FOUND;
    }
    glued = !is_blank(lexer->lookahead);
  }
  if (glued && glue_fits(lexer, valid)) {
    return decided(scan_glued(lexer, valid, closing));
  }
  return SCAN_UNDECIDED;
}

static enum ScanDecision scan_line_token(TSLexer *lexer, const bool *valid,
                                         const struct Scanner *scanner, const struct Gap *gap) {
  TSSymbol raw = RAW_WORD;

  if (valid[TRAILING_ARGUMENT] && raw_text_starts(lexer, TRAILING_ARGUMENT) &&
      !value_continues(lexer->lookahead, valid, gap->blanks)) {
    return decided(scan_raw_text(lexer, TRAILING_ARGUMENT));
  }
  if (raw_word_fits(valid, &raw) && raw_text_starts(lexer, raw)) {
    return decided(scan_raw_text(lexer, raw));
  }
  if (operands_follow(lexer, valid, scanner)) {
    return decided(scan_operands(lexer, valid, scanner));
  }
  return scan_operand_token(lexer, valid, scanner, gap);
}

static bool scan_stray_backslash(TSLexer *lexer, const bool *valid) {
  TSSymbol raw = TRAILING_ARGUMENT;

  if (valid[TRAILING_ARGUMENT] || raw_word_fits(valid, &raw)) {
    return scan_raw_text(lexer, raw);
  }
  return closable(valid) && closes_before('\\', valid) && close_construct(lexer, valid);
}

static bool scan(TSLexer *lexer, const bool *valid, const struct Scanner *scanner,
                 bool *closes_input) {
  const bool recovering = valid[ERROR_SENTINEL];
  const bool glued = !is_blank(lexer->lookahead);
  const bool closing = closable(valid);
  enum ScanDecision decision = SCAN_UNDECIDED;
  struct Gap gap = {0, 0, false, false};

  if (!recovering) {
    decision = scan_open_content(lexer, valid, closing);
  }
  if (decision != SCAN_UNDECIDED) {
    return decision == SCAN_FOUND;
  }
  if (!skip_gap(lexer, &gap)) {
    return !recovering && scan_stray_backslash(lexer, valid);
  }
  if (!recovering) {
    decision = scan_line_token(lexer, valid, scanner, &gap);
  }
  if (decision != SCAN_UNDECIDED) {
    return decision == SCAN_FOUND;
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
    return scan_statement_word(lexer, valid, scanner);
  }
  if (!scanner_dispatches(lexer->lookahead)) {
    return false;
  }
  switch (lexer->lookahead) {
    case '/':
      return scan_slash(lexer, valid, closing);
    case '#':
      return scan_hash(lexer, valid, recovering, &gap);
    case '@':
      return scan_at(lexer, valid, recovering, glued, closing);
    case ';':
      return scan_semicolon(lexer, valid, recovering, closing);
    default:
      return false;
  }
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
  struct Scanner *scanner = ts_calloc(1, sizeof(struct Scanner));

  scanner->x86_syntax = DEFAULT_X86_SYNTAX;
  return scanner;
}

void ASM_EXPORT(_external_scanner_destroy)(void *payload) {
  ts_free(payload);
}

unsigned ASM_EXPORT(_external_scanner_serialize)(void *payload, char *buffer) {
  const struct Scanner *scanner = payload;

  if (!scanner->closed_input && scanner->x86_syntax == DEFAULT_X86_SYNTAX) {
    return 0;
  }
  buffer[0] = (char)((scanner->closed_input ? CLOSED_INPUT_BIT : 0U) |
                     ((unsigned)scanner->x86_syntax << X86_SYNTAX_SHIFT));
  return 1;
}

void ASM_EXPORT(_external_scanner_deserialize)(void *payload, const char *buffer, unsigned length) {
  struct Scanner *scanner = payload;
  const unsigned char state = length > 0 ? (unsigned char)buffer[0] : 0;

  scanner->closed_input = (state & CLOSED_INPUT_BIT) != 0;
  scanner->x86_syntax =
      length > 0 ? (unsigned char)(state >> X86_SYNTAX_SHIFT) : DEFAULT_X86_SYNTAX;
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
