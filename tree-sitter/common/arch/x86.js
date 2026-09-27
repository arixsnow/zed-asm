// SPDX-License-Identifier: MIT

const gas = {
  rules: {
    register: () => token(seq('%', optional(/[A-Za-z][A-Za-z0-9]*/))),
  },
  choices: {
    immediate: [
      ($) => seq('$', field('value', $._expression)),
    ],
    symbol_type: [($) => seq(alias($._at_type, '@'), $.identifier)],
    _operand: [($) => $.immediate, ($) => $.register],
  },
};

module.exports = (ctx) => (ctx.syntax === 'gas' ? gas : {});
