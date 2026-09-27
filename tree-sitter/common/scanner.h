// SPDX-License-Identifier: MIT

#ifndef TREE_SITTER_ASM_SCANNER_H
#define TREE_SITTER_ASM_SCANNER_H

#if !defined(__STDC_VERSION__) || __STDC_VERSION__ < 201112L
#error "scanner.h requires C11 or later"
#endif /* __STDC_VERSION__ */

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
#define ASM_GNU_SYNTAX 1
#define ASM_HASH_IMMEDIATES 1
#define ASM_HASH_NEEDS_VALUE 1
#define ASM_AT_COMMENTS 1
#define ASM_DOLLAR_IMMEDIATES 1
#define ASM_SEMICOLONS SEMICOLON_HEURISTIC
#elif defined(ASM_DIALECT_ARM)
#define ASM_GNU_SYNTAX 1
#define ASM_HASH_IMMEDIATES 1
#define ASM_HASH_NEEDS_VALUE 0
#define ASM_AT_COMMENTS 1
#define ASM_DOLLAR_IMMEDIATES 0
#define ASM_SEMICOLONS SEMICOLON_SEPARATES
#elif defined(ASM_DIALECT_ARM_APPLE)
#define ASM_GNU_SYNTAX 1
#define ASM_HASH_IMMEDIATES 1
#define ASM_HASH_NEEDS_VALUE 0
#define ASM_AT_COMMENTS 0
#define ASM_DOLLAR_IMMEDIATES 0
#define ASM_SEMICOLONS SEMICOLON_COMMENTS
#elif defined(ASM_DIALECT_X86_GAS)
#define ASM_GNU_SYNTAX 1
#define ASM_HASH_IMMEDIATES 0
#define ASM_HASH_NEEDS_VALUE 0
#define ASM_AT_COMMENTS 0
#define ASM_DOLLAR_IMMEDIATES 1
#define ASM_SEMICOLONS SEMICOLON_SEPARATES
#elif defined(ASM_DIALECT_X86_NASM)
#define ASM_GNU_SYNTAX 0
#define ASM_HASH_IMMEDIATES 0
#define ASM_HASH_NEEDS_VALUE 0
#define ASM_AT_COMMENTS 0
#define ASM_DOLLAR_IMMEDIATES 0
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
  MISSING_OPERAND,
  MISSING_EXPRESSION,
  UNCLOSED,
  ERROR_SENTINEL,
};

enum {
  CPP_WORD_CAPACITY = 16
};

enum CppDirectiveKind {
  CPP_NONE,
  CPP_DIRECTIVE,
  CPP_INCLUDE,
};

struct CppDirective {
  const char *name;
  enum CppDirectiveKind kind;
};

#define ASM_CPP_DIRECTIVES(X)                                                                      \
  X("define", CPP_DIRECTIVE)                                                                       \
  X("elif", CPP_DIRECTIVE)                                                                         \
  X("elifdef", CPP_DIRECTIVE)                                                                      \
  X("elifndef", CPP_DIRECTIVE)                                                                     \
  X("else", CPP_DIRECTIVE)                                                                         \
  X("endif", CPP_DIRECTIVE)                                                                        \
  X("error", CPP_DIRECTIVE)                                                                        \
  X("if", CPP_DIRECTIVE)                                                                           \
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
    return codepoint == '\'';
  }
  return codepoint == '?';
}

static inline bool starts_value(int32_t codepoint) {
  return starts_expression(codepoint) || codepoint == ':';
}

static inline bool starts_operand(int32_t codepoint) {
  if (starts_expression(codepoint) || codepoint == '"') {
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

static inline bool scanner_dispatches(int32_t codepoint) {
  if (ASM_GNU_SYNTAX) {
    return codepoint == '/' || codepoint == '#' || codepoint == '@' || codepoint == ';';
  }
  return codepoint == ';';
}

static inline bool closable(const bool *valid) {
  return !valid[ERROR_SENTINEL] && !valid[SEPARATOR] &&
         (valid[MISSING_OPERAND] || valid[MISSING_EXPRESSION] || valid[UNCLOSED]);
}

static TSSymbol closing_token(const bool *valid) {
  if (valid[MISSING_OPERAND]) {
    return MISSING_OPERAND;
  }
  if (valid[MISSING_EXPRESSION]) {
    return MISSING_EXPRESSION;
  }
  return UNCLOSED;
}

static bool closes_before(int32_t codepoint, const bool *valid) {
  switch (closing_token(valid)) {
    case MISSING_OPERAND:
      return !starts_operand(codepoint);
    case MISSING_EXPRESSION:
      return !starts_expression(codepoint);
    default:
      return !continues_expression(codepoint);
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

static bool scan_hash(TSLexer *lexer, const bool *valid, bool recovering) {
  enum CppDirectiveKind kind = CPP_NONE;

  advance(lexer);
  if (ASM_HASH_IMMEDIATES && valid[HASH] && !recovering) {
    if (ASM_HASH_NEEDS_VALUE && !starts_value(lexer->lookahead)) {
      return line_comment(lexer, valid);
    }
    return finish_token(lexer, HASH);
  }
  if (valid[PREPROC_DIRECTIVE] && !recovering) {
    kind = cpp_directive_kind(lexer);
    if (kind == CPP_INCLUDE && valid[PREPROC_INCLUDE]) {
      return finish_token(lexer, PREPROC_INCLUDE);
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

static bool scan_semicolon(TSLexer *lexer, const bool *valid, bool recovering, bool closing) {
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
  return line_comment(lexer, valid);
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

static void skip_blanks(TSLexer *lexer) {
  while (is_blank(lexer->lookahead)) {
    skip(lexer);
  }
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

  skip_blanks(lexer);
  if (at_line_end(lexer)) {
    if (trailing_blanks && valid[PREPROC_LINE_END]) {
      return finish_token(lexer, PREPROC_LINE_END);
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

static bool token_follows(TSLexer *lexer, const bool *valid) {
  const int32_t first = lexer->lookahead;

  if (closing_token(valid) == UNCLOSED && (first == '=' || first == '!')) {
    advance(lexer);
    return lexer->lookahead == '=';
  }
  if (!ASM_GNU_SYNTAX && first == '.') {
    advance(lexer);
    if (lexer->lookahead == '.') {
      advance(lexer);
    }
    return is_alpha(lexer->lookahead) || lexer->lookahead == '?' || lexer->lookahead == '@';
  }
  return true;
}

static bool closes_here(TSLexer *lexer, const bool *valid, bool closing) {
  if (!closing) {
    return false;
  }
  lexer->mark_end(lexer);
  if (at_line_end(lexer)) {
    return true;
  }
  if (scanner_dispatches(lexer->lookahead)) {
    return false;
  }
  return closes_before(lexer->lookahead, valid) || !token_follows(lexer, valid);
}

static bool scan_gnu(TSLexer *lexer, const bool *valid) {
  const bool recovering = valid[ERROR_SENTINEL];
  const bool glued = !is_blank(lexer->lookahead);
  const bool closing = closable(valid);

  if (valid[STRING_CONTENT] && !recovering) {
    return scan_string_content(lexer, valid);
  }
  if (valid[PREPROC_ARGUMENT] && !recovering) {
    return scan_preproc_rest(lexer, valid);
  }
  skip_blanks(lexer);
  if (closes_here(lexer, valid, closing)) {
    return close_construct(lexer, valid);
  }
  switch (lexer->lookahead) {
    case '/':
      return scan_slash(lexer, valid, closing);
    case '#':
      return scan_hash(lexer, valid, recovering);
    case '@':
      return scan_at(lexer, valid, recovering, glued, closing);
    case ';':
      return scan_semicolon(lexer, valid, recovering, closing);
    default:
      return false;
  }
}

static bool scan_nasm(TSLexer *lexer, const bool *valid) {
  const bool closing = closable(valid);

  skip_blanks(lexer);
  if (closes_here(lexer, valid, closing)) {
    return close_construct(lexer, valid);
  }
  if (lexer->lookahead == ';') {
    return scan_semicolon(lexer, valid, valid[ERROR_SENTINEL], closing);
  }
  return false;
}

static bool scan(TSLexer *lexer, const bool *valid) {
  if (ASM_GNU_SYNTAX) {
    return scan_gnu(lexer, valid);
  }
  return scan_nasm(lexer, valid);
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
  return NULL;
}

void ASM_EXPORT(_external_scanner_destroy)(ASM_UNUSED void *payload) {
}

unsigned ASM_EXPORT(_external_scanner_serialize)(ASM_UNUSED void *payload,
                                                 ASM_UNUSED char *buffer) {
  return 0;
}

void ASM_EXPORT(_external_scanner_deserialize)(ASM_UNUSED void *payload,
                                               ASM_UNUSED const char *buffer,
                                               ASM_UNUSED unsigned length) {
}

bool ASM_EXPORT(_external_scanner_scan)(ASM_UNUSED void *payload, TSLexer *lexer,
                                        const bool *valid_symbols) {
  return scan(lexer, valid_symbols);
}

#endif /* TREE_SITTER_ASM_SCANNER_H */
