// SPDX-License-Identifier: MIT

const { operandList } = require('../core');

const SYMBOL_TYPES = [
  'function',
  'object',
  'tls_object',
  'common',
  'notype',
  'gnu_indirect_function',
  'gnu_unique_object',
  'progbits',
  'nobits',
  'note',
  'init_array',
  'fini_array',
  'preinit_array',
];

function preprocRest($) {
  return [
    repeat(
      choice(
        field('argument', $.preproc_argument),
        alias($.line_comment, $.preproc_comment),
        alias($.block_comment, $.preproc_comment),
      ),
    ),
    optional($._preproc_line_end),
  ];
}

module.exports = (ctx) => ({
  rules: {
    directive: ($) =>
      seq(
        field('name', alias($._dot_identifier, $.directive_name)),
        optional(operandList($, 'argument')),
      ),

    preproc_line: ($) =>
      choice(
        seq(
          field('directive', alias($._preproc_include, $.preproc_directive)),
          optional(field('argument', alias($._header_name, $.preproc_argument))),
          ...preprocRest($),
        ),
        seq(field('directive', $.preproc_directive), ...preprocRest($)),
      ),

    block_comment: () => token(seq('/*', /[^*]*\*+([^/*][^*]*\*+)*/, '/')),

    string: ($) =>
      seq(
        '"',
        repeat(choice($._string_content, $.escape_sequence)),
        choice(token.immediate('"'), $._unclosed),
      ),
    escape_sequence: () =>
      token.immediate(seq('\\', choice(/[0-7]{1,3}/, /[xX][0-9a-fA-F]+/, /[^0-7xX\n]/))),
    char: () =>
      token(seq("'", optional(choice(/[^\\\n]/, seq('\\', optional(/./)))), optional("'"))),

    relocation: ($) =>
      seq(
        field('symbol', $._symbol),
        alias($._at_attached, '@'),
        optional(field('specifier', $.identifier)),
      ),
    location_counter: () => '.',
    _local_identifier: () => token(prec(1, ctx.lexical.localIdentifier)),
  },
  choices: {
    symbol_type: [
      () => token(prec(2, seq('%', choice(...SYMBOL_TYPES)))),
      () => token(prec(-1, seq('%', optional(/[A-Za-z_][A-Za-z0-9_]*/)))),
    ],
    _line_content: [($) => $.preproc_line],
    _symbol: [
      ($) => alias($._dot_identifier, $.identifier),
      ($) => alias($._local_identifier, $.local_identifier),
    ],
    _statement: [($) => $.directive],
    _operand: [($) => $.string, ($) => $.symbol_type],
    _expression: [($) => $.char, ($) => $.relocation, ($) => $.location_counter],
  },
  extras: [($) => $.block_comment],
});
