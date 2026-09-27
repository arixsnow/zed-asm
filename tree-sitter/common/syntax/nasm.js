// SPDX-License-Identifier: MIT

module.exports = () => ({
  rules: {
    string: () =>
      token(
        choice(
          seq("'", /[^'\n]*/, optional("'")),
          seq('"', /[^"\n]*/, optional('"')),
          seq('`', repeat(choice(/[^`\\\n]/, /\\./)), optional('`')),
        ),
      ),
  },
  choices: {
    _symbol: [($) => alias($._dot_identifier, $.local_identifier)],
    _operand: [($) => $.string],
  },
});
