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

#if defined(__GNUC__) || defined(__clang__)
#define ASM_UNUSED __attribute__((unused))
#else
#define ASM_UNUSED
#endif /* __GNUC__ || __clang__ */

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
  MISSING_EXPRESSION,
  UNCLOSED,
  UNCLOSED_BRACKET,
  UNCLOSED_BRACE,
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
  REGISTER_ALIAS_WORD,
  NEON_ALIAS_WORD,
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

struct Word {
  const char *name;
  TSSymbol symbol;
};

struct Scanner {
  bool closed_input;
};

#define ASM_STATEMENT_WORDS(X)                                                                     \
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
  X("gotoff")                                                                                      \
  X("got_prel")                                                                                    \
  X("plt")                                                                                         \
  X("target1")                                                                                     \
  X("target2")                                                                                     \
  X("sbrel")                                                                                       \
  X("prel31")                                                                                      \
  X("tlsgd")                                                                                       \
  X("tlsldm")                                                                                      \
  X("tlsldo")                                                                                      \
  X("gottpoff")                                                                                    \
  X("tpoff")                                                                                       \
  X("tlscall")                                                                                     \
  X("tlsdesc")

#define ASM_STATEMENT_WORD_FITS(word, symbol)                                                      \
  _Static_assert(sizeof(word) <= STATEMENT_WORD_CAPACITY,                                          \
                 "STATEMENT_WORD_CAPACITY must hold " word);
ASM_STATEMENT_WORDS(ASM_STATEMENT_WORD_FITS)

#define ASM_SUFFIX_RELOCATION_FITS(word)                                                           \
  _Static_assert(sizeof(word) <= STATEMENT_WORD_CAPACITY,                                          \
                 "STATEMENT_WORD_CAPACITY must hold " word);
ASM_SUFFIX_RELOCATION_NAMES(ASM_SUFFIX_RELOCATION_FITS)

#define ASM_WORD_ENTRY(word, symbol) {word, symbol},
static const struct Word STATEMENT_WORDS[] = {ASM_STATEMENT_WORDS(ASM_WORD_ENTRY)};

#define ASM_NAME_ENTRY(word) word,
static const char *const SUFFIX_RELOCATIONS[] = {ASM_SUFFIX_RELOCATION_NAMES(ASM_NAME_ENTRY)};

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

static inline bool starts_expression(int32_t codepoint) {
  if (is_alpha(codepoint) || is_digit(codepoint) || codepoint == '.' || codepoint == '(' ||
      codepoint == '-' || codepoint == '+' || codepoint == '~' || codepoint == '!') {
    return true;
  }
  if (ASM_GNU_SYNTAX) {
    return codepoint == '\'' || codepoint == '\\' || (ASM_RELOCATION_OPERATORS && codepoint == ':');
  }
  return codepoint == '?' || codepoint == '$';
}

static inline bool starts_value(int32_t codepoint) {
  return starts_expression(codepoint) || codepoint == ':';
}

static inline bool starts_operand(int32_t codepoint) {
  if (starts_expression(codepoint) || codepoint == '"') {
    return true;
  }
  if (ASM_ARM_OPERANDS && (codepoint == '[' || codepoint == '{' || codepoint == '=')) {
    return true;
  }
  if (ASM_GNU_SYNTAX) {
    return codepoint == '%' || (ASM_DOLLAR_IMMEDIATES && codepoint == '$');
  }
  return codepoint == '\'' || codepoint == '`';
}

static inline bool continues_expression(int32_t codepoint) {
  return codepoint == ')' || codepoint == '+' || codepoint == '-' || codepoint == '*' ||
         codepoint == '/' || codepoint == '<' || codepoint == '>' || codepoint == '=' ||
         codepoint == '!' || codepoint == '&' || codepoint == '|' || codepoint == '^';
}

static inline bool starts_suffix_relocation(int32_t codepoint) {
  return ASM_SUFFIX_RELOCATIONS && codepoint == '(';
}

static inline bool continues_bracket(int32_t codepoint) {
  return continues_expression(codepoint) || starts_suffix_relocation(codepoint) ||
         codepoint == ',' || codepoint == ']' || codepoint == ':';
}

static inline bool continues_brace(int32_t codepoint) {
  return codepoint == ',' || codepoint == '}' || codepoint == '-' || codepoint == '[';
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
    return is_alpha(codepoint) || codepoint == '.' || is_digit(codepoint);
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
         valid[UNWIND_REGISTER_DIRECTIVE] || valid[LINKER_HINT_DIRECTIVE];
}

static inline bool scanner_dispatches(int32_t codepoint) {
  if (ASM_GNU_SYNTAX) {
    return codepoint == '/' || codepoint == '#' || codepoint == '@' || codepoint == ';';
  }
  return codepoint == ';';
}

static inline bool closable(const bool *valid) {
  return !valid[ERROR_SENTINEL] && !valid[SEPARATOR] &&
         (valid[MISSING_OPERAND] || valid[MISSING_EXPRESSION] || valid[UNCLOSED] ||
          valid[UNCLOSED_BRACKET] || valid[UNCLOSED_BRACE]);
}

static TSSymbol closing_token(const bool *valid) {
  if (valid[MISSING_OPERAND]) {
    return MISSING_OPERAND;
  }
  if (valid[MISSING_EXPRESSION]) {
    return MISSING_EXPRESSION;
  }
  if (valid[UNCLOSED]) {
    return UNCLOSED;
  }
  if (valid[UNCLOSED_BRACKET]) {
    return UNCLOSED_BRACKET;
  }
  return UNCLOSED_BRACE;
}

static bool closes_before(int32_t codepoint, const bool *valid) {
  switch (closing_token(valid)) {
    case MISSING_OPERAND:
      return !starts_operand(codepoint);
    case MISSING_EXPRESSION:
      return !starts_expression(codepoint);
    case UNCLOSED:
      return !continues_expression(codepoint) && !starts_suffix_relocation(codepoint);
    case UNCLOSED_BRACKET:
      return !continues_bracket(codepoint);
    default:
      return !continues_brace(codepoint);
  }
}

static bool close_construct(TSLexer *lexer, const bool *valid) {
  lexer->result_symbol = closing_token(valid);
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
  const TSSymbol token = closing_token(valid);

  if ((token == UNCLOSED || token == UNCLOSED_BRACKET) && (first == '=' || first == '!')) {
    return true;
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
  return starts_nasm_name(lexer->lookahead);
}

enum ClosingDecision {
  CLOSING_UNDECIDED,
  CLOSING_CLOSES,
  CLOSING_STAYS_OPEN,
};

static enum ClosingDecision closing_decision(TSLexer *lexer, const bool *valid, bool closing,
                                             bool glued) {
  if (!closing) {
    return CLOSING_UNDECIDED;
  }
  lexer->mark_end(lexer);
  if (at_line_end(lexer)) {
    return CLOSING_CLOSES;
  }
  if (scanner_dispatches(lexer->lookahead) || (glued && is_alpha(lexer->lookahead))) {
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
  return (label_fits(valid) || closer_fits(valid) || directive_word_fits(valid)) &&
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

static bool statement_word_symbol(const char *word, TSSymbol *symbol) {
  size_t low = 0;
  size_t high = sizeof(STATEMENT_WORDS) / sizeof(STATEMENT_WORDS[0]);

  while (low < high) {
    const size_t middle = low + ((high - low) / 2);
    const int order = strcmp(word, STATEMENT_WORDS[middle].name);

    if (order == 0) {
      *symbol = STATEMENT_WORDS[middle].symbol;
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

static bool read_suffix_relocation(TSLexer *lexer) {
  char word[STATEMENT_WORD_CAPACITY] = {0};
  size_t length = 0;
  size_t index = 0;

  while (is_word_char(lexer->lookahead)) {
    take_word_char(lexer, word, &length);
  }
  while (index < sizeof(SUFFIX_RELOCATIONS) / sizeof(SUFFIX_RELOCATIONS[0])) {
    if (strcmp(word, SUFFIX_RELOCATIONS[index]) == 0) {
      return true;
    }
    index++;
  }
  return false;
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
  if (!statement_word_symbol(word, &symbol) || !valid[symbol]) {
    return false;
  }
  if (symbol == REGISTER_ALIAS_WORD || (symbol == NEON_ALIAS_WORD && !upper)) {
    return finish_token(lexer, symbol);
  }
  return false;
}

static bool suffix_relocation_follows(TSLexer *lexer) {
  if (lexer->lookahead != '(') {
    return false;
  }
  advance(lexer);
  return read_suffix_relocation(lexer);
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

static bool scan_statement_word(TSLexer *lexer, const bool *valid) {
  TSSymbol symbol = GLOBAL_LABEL_NAME;
  TSSymbol keyword = MACRO_CLOSE;
  bool known = false;
  char word[STATEMENT_WORD_CAPACITY] = {0};

  lexer->mark_end(lexer);
  if (!read_label_word(lexer, valid, &symbol, word)) {
    return false;
  }
  known = word[0] != '\0' && statement_word_symbol(word, &keyword);
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
  if (valid[PREFIX_WORD] && lexer->lookahead == ';' && is_x86_prefix(word)) {
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

static enum ScanDecision scan_operand_token(TSLexer *lexer, const bool *valid, uint32_t blanks) {
  if (valid[BLANK] && blanks > 0 && separates_operand(lexer->lookahead)) {
    lexer->mark_end(lexer);
    if (ASM_SUFFIX_RELOCATIONS && suffix_relocation_follows(lexer)) {
      return SCAN_NOT_FOUND;
    }
    lexer->result_symbol = BLANK;
    return SCAN_FOUND;
  }
  if (valid[SUFFIX_RELOCATION_NAME] && is_alpha(lexer->lookahead)) {
    return decided(read_suffix_relocation(lexer) && finish_token(lexer, SUFFIX_RELOCATION_NAME));
  }
  if ((valid[REGISTER_ALIAS_WORD] || valid[NEON_ALIAS_WORD]) && lexer->lookahead == '.') {
    return decided(scan_register_alias_word(lexer, valid));
  }
  return SCAN_UNDECIDED;
}

static bool scan_gnu(TSLexer *lexer, const bool *valid, bool closed_input, bool *closes_input) {
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
  if (glued && !recovering && glue_fits(lexer, valid)) {
    return scan_glued(lexer, valid, closing);
  }
  blanks = skip_blanks(lexer);
  if (!recovering) {
    switch (scan_operand_token(lexer, valid, blanks)) {
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
  switch (closing_decision(lexer, valid, closing, blanks == 0)) {
    case CLOSING_CLOSES:
      return close_construct(lexer, valid);
    case CLOSING_STAYS_OPEN:
      return false;
    default:
      break;
  }
  if (lexer->eof(lexer)) {
    return scan_end_of_input(lexer, valid, recovering, closed_input, closes_input);
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

static bool scan_nasm(TSLexer *lexer, const bool *valid, bool closed_input, bool *closes_input) {
  const bool recovering = valid[ERROR_SENTINEL];
  const bool closing = closable(valid);
  const uint32_t blanks = skip_blanks(lexer);

  if (valid[BLANK] && !recovering && blanks > 0 && separates_operand(lexer->lookahead)) {
    return finish_token(lexer, BLANK);
  }
  switch (closing_decision(lexer, valid, closing, blanks == 0)) {
    case CLOSING_CLOSES:
      return close_construct(lexer, valid);
    case CLOSING_STAYS_OPEN:
      return false;
    default:
      break;
  }
  if (lexer->eof(lexer)) {
    return scan_end_of_input(lexer, valid, recovering, closed_input, closes_input);
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

static bool scan(TSLexer *lexer, const bool *valid, bool closed_input, bool *closes_input) {
  if (ASM_GNU_SYNTAX) {
    return scan_gnu(lexer, valid, closed_input, closes_input);
  }
  return scan_nasm(lexer, valid, closed_input, closes_input);
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

  if (!scanner->closed_input) {
    return 0;
  }
  buffer[0] = 1;
  return 1;
}

void ASM_EXPORT(_external_scanner_deserialize)(void *payload, ASM_UNUSED const char *buffer,
                                               unsigned length) {
  struct Scanner *scanner = payload;

  scanner->closed_input = length > 0;
}

bool ASM_EXPORT(_external_scanner_scan)(void *payload, TSLexer *lexer, const bool *valid_symbols) {
  struct Scanner *scanner = payload;
  bool closes_input = false;
  const bool found = scan(lexer, valid_symbols, scanner->closed_input, &closes_input);

  scanner->closed_input = closes_input;
  return found;
}

#endif /* TREE_SITTER_ASM_SCANNER_H */
