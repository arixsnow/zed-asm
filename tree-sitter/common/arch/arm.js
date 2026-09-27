// SPDX-License-Identifier: MIT

module.exports = () => ({
  rules: {
    shift: ($) =>
      seq(field('operator', alias($.identifier, $.shift_operator)), field('amount', $.immediate)),
  },
  choices: {
    immediate: [
      ($) => seq(alias($._hash, '#'), field('value', $._expression)),
    ],
    _operand: [($) => $.immediate, ($) => $.shift],
  },
});
