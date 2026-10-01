// SPDX-License-Identifier: MIT

const PREFIX_SEMICOLONS = ['AUTO'];

module.exports = (ctx) => {
  if (ctx.syntax !== 'gas') {
    return {};
  }
  const prefixSemicolons = PREFIX_SEMICOLONS.includes(ctx.dialect);
  return {
    rules: {
      register: () => token(seq('%', optional(/[A-Za-z][A-Za-z0-9]*/))),
      ...(prefixSemicolons
        ? { _prefix_instruction: ($) => field('mnemonic', alias($._prefix_word, $.mnemonic)) }
        : {}),
    },
    choices: {
      immediate: [
        ($) => seq('$', field('value', $._expression)),
      ],
      symbol_type: [($) => seq(alias($._at_type, '@'), $.identifier)],
      _value: [($) => $.immediate, ($) => $.register],
      ...(prefixSemicolons
        ? {
          _item: [($) => seq(alias($._prefix_instruction, $.instruction), $._prefix_semicolon)],
        }
        : {}),
    },
  };
};
