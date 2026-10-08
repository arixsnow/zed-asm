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

function instructionOperands($) {
  return seq(
    field('operand', $._instruction_operand),
    repeat(
      choice(
        seq(',', choice(field('operand', $._instruction_operand), $._missing_operand)),
        seq($._blank, field('operand', $._instruction_operand)),
      ),
    ),
  );
}

module.exports = (ctx) => ({
  rules: {
    source_file: ($) => repeat(choice($._item, $.label_block)),

    label_block: ($) =>
      prec.right(seq(field('label', alias($._global_label, $.label)), repeat($._item))),

    _newline: () => /\r?\n/,

    _global_label: ($) => seq(field('name', alias($._global_label_name, $.identifier)), ':'),

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
    instruction: [
      ($) => seq(field('mnemonic', $._mnemonic), optional(instructionOperands($))),
    ],
    _item: [
      ($) => alias($._local_label, $.label),
      ($) => $._newline,
      ($) => $._separator,
      ($) => seq($._line_content, choice($._newline, $._separator, $._end)),
    ],
    _line_content: [($) => $._statement],
    _mnemonic: [($) => alias($.identifier, $.mnemonic)],
    _local_label: [
      ($) => seq(field('name', alias($._local_label_name, $.local_identifier)), ':'),
    ],
    _symbol: [($) => $.identifier],
    _statement: [($) => $.instruction],
    _instruction_operand: [($) => $._operand],
    _operand: [($) => $._value],
    _value: [($) => $._expression],
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
