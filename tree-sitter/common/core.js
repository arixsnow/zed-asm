// SPDX-License-Identifier: MIT

const COMPARISONS = ['==', '!=', '<>', '<', '<=', '>', '>='];
const PRECEDENCE_LEVELS = {
  gnu: [['||'], ['&&'], COMPARISONS, ['+', '-'], ['|', '&', '^', '!'], ['*', '/', '%', '<<', '>>']],
  darwin: [['&&', '||'], ['|', '&', '^'], COMPARISONS, ['<<', '>>'], ['+', '-'], ['*', '/', '%']],
  c: [['||'], ['&&'], COMPARISONS, ['|'], ['^'], ['&'], ['<<', '>>'], ['+', '-'], ['*', '/', '%']],
};
const LEVEL_STEP = 10;
const DARWIN_PRECEDENCE = ['ARM_APPLE'];

function precedence(ctx) {
  const family = ctx.syntax === 'nasm'
    ? 'c'
    : DARWIN_PRECEDENCE.includes(ctx.dialect)
    ? 'darwin'
    : 'gnu';
  const levels = PRECEDENCE_LEVELS[family];
  return {
    operators: new Map(
      levels.flatMap((operators, index) =>
        operators.map((operator) => [operator, (index + 1) * LEVEL_STEP])
      ),
    ),
    unary: (levels.length + 1) * LEVEL_STEP,
  };
}

function operatorToken($, operator) {
  return operator === '%' ? alias($._remainder, '%') : operator;
}

function operandList($, name) {
  return seq(
    field(name, $._operand),
    repeat(seq(',', choice(field(name, $._operand), $._missing_argument))),
  );
}

function instructionOperands($) {
  return seq(
    field('operand', $._instruction_operand),
    repeat(
      choice(
        seq(',', choice(field('operand', $._instruction_operand), $._missing_operand)),
        seq($._blank, choice(field('operand', $._instruction_operand), $._missing_operand)),
      ),
    ),
  );
}

module.exports = (ctx) => {
  const levels = precedence(ctx);
  return {
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
          ...[...levels.operators].map(([operator, level]) =>
            prec.left(
              level,
              seq(
                field('left', $._expression),
                field('operator', operatorToken($, operator)),
                field('right', $._expression),
              ),
            )
          ),
        ),
      unary_expression: ($) =>
        prec(
          levels.unary,
          seq(field('operator', choice('-', '+', '~', '!')), field('argument', $._expression)),
        ),
      parenthesized_expression: ($) => seq('(', $._expression, choice(')', $._unclosed)),
    },
    choices: {
      instruction: [($) => seq(field('mnemonic', $._mnemonic), optional($._operands))],
      _operands: [($) => instructionOperands($)],
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
  };
};

module.exports.operandList = operandList;
module.exports.instructionOperands = instructionOperands;
module.exports.precedence = precedence;
module.exports.operatorToken = operatorToken;
