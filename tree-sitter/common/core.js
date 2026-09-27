// SPDX-License-Identifier: MIT

const PREC = {
  logical_or: 1,
  logical_and: 2,
  compare: 3,
  bit_or: 4,
  bit_xor: 5,
  bit_and: 6,
  shift: 7,
  additive: 8,
  multiplicative: 9,
  unary: 10,
};

const BINARY_OPERATORS = [
  ['||', PREC.logical_or],
  ['&&', PREC.logical_and],
  ...['==', '!=', '<>', '<', '<=', '>', '>='].map((operator) => [operator, PREC.compare]),
  ['|', PREC.bit_or],
  ['^', PREC.bit_xor],
  ['&', PREC.bit_and],
  ['<<', PREC.shift],
  ['>>', PREC.shift],
  ['+', PREC.additive],
  ['-', PREC.additive],
  ['*', PREC.multiplicative],
  ['/', PREC.multiplicative],
];

function operandList($, name) {
  return seq(
    field(name, $._operand),
    repeat(seq(',', choice(field(name, $._operand), $._missing_operand))),
  );
}

module.exports = (ctx) => ({
  rules: {
    source_file: ($) => seq(repeat($._line), optional($._line_content)),

    _line: ($) => seq(optional($._line_content), $._newline),
    _newline: () => /\r?\n/,
    _statements: ($) =>
      choice(
        seq(
          repeat($._separator),
          $._statement_group,
          repeat(seq(repeat1($._separator), $._statement_group)),
          repeat($._separator),
        ),
        repeat1($._separator),
      ),
    _statement_group: ($) => choice(seq(repeat1($.label), optional($._statement)), $._statement),

    label: ($) => seq(field('name', $._symbol), ':'),

    instruction: ($) =>
      seq(
        field('mnemonic', alias($.identifier, $.mnemonic)),
        optional(operandList($, 'operand')),
      ),

    identifier: () => ctx.lexical.identifier,
    _dot_identifier: () => ctx.lexical.dotIdentifier,
    integer: () => ctx.lexical.integer,

    binary_expression: ($) =>
      choice(
        ...BINARY_OPERATORS.map(([operator, precedence]) =>
          prec.left(
            precedence,
            seq(
              field('left', $._expression),
              field('operator', operator),
              field('right', $._expression),
            ),
          )
        ),
      ),
    unary_expression: ($) =>
      prec(
        PREC.unary,
        seq(field('operator', choice('-', '+', '~', '!')), field('argument', $._expression)),
      ),
    parenthesized_expression: ($) => seq('(', $._expression, choice(')', $._unclosed)),
  },
  choices: {
    _line_content: [($) => $._statements],
    _symbol: [($) => $.identifier],
    _statement: [($) => $.instruction],
    _operand: [($) => $._expression],
    _expression: [
      ($) => $._symbol,
      ($) => $.integer,
      ($) => $.unary_expression,
      ($) => $.binary_expression,
      ($) => $.parenthesized_expression,
      ($) => $._missing_expression,
    ],
  },
  extras: [() => /[ \t\f\v\r]/, ($) => $.line_comment],
});

module.exports.operandList = operandList;
