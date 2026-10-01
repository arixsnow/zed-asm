// SPDX-License-Identifier: MIT

const DOLLAR_LABELS = ['AUTO', 'ARM'];
const POSITIONAL_MACRO_ARGUMENTS = ['ARM_APPLE'];
const SHIFT_WORD =
  /[lL][sS][lLrR]|[aA][sS][lLrR]|[rR][oO][rR]|[mM][sS][lL]|[uUsS][xX][tT][bBhHwWxX]/;

module.exports = (ctx) => {
  const dollarLabels = DOLLAR_LABELS.includes(ctx.dialect);
  const positionalArguments = POSITIONAL_MACRO_ARGUMENTS.includes(ctx.dialect);
  return {
    rules: {
      shift: ($) =>
        prec(
          1,
          seq(
            field('operator', alias($._shift_word, $.shift_operator)),
            optional($._blank),
            field('amount', $.immediate),
          ),
        ),
      _shift_word: () => token(prec(1, SHIFT_WORD)),
    },
    choices: {
      immediate: [
        ($) => seq(alias($._hash, '#'), field('value', $._expression)),
      ],
      _value: [($) => $.immediate],
      _operand: [($) => $.shift],
      _expression: [
        ($) => alias($._shift_word, $.identifier),
        ...(dollarLabels ? [($) => alias($._dollar_label, $.numeric_label)] : []),
        ...(positionalArguments ? [($) => alias($._darwin_argument, $.macro_argument)] : []),
      ],
      _local_label: dollarLabels
        ? [($) => seq(field('name', alias($._dollar_label_name, $.numeric_label)), ':')]
        : [],
    },
  };
};
