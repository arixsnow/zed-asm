// SPDX-License-Identifier: MIT

const { operatorToken, precedence } = require('../core');

const PREFIX_SEMICOLONS = ['AUTO'];

const NUMBER_0_7 = '[0-7]';
const NUMBER_0_15 = '([0-9]|1[0-5])';
const NUMBER_0_31 = '([0-9]|[12][0-9]|3[01])';
const REGISTERS = [
  '[re]?(ax|bx|cx|dx|si|di|bp|sp)',
  '[abcd][hl]',
  '(si|di|bp|sp)l',
  'r([89]|[12][0-9]|3[01])[bdw]?',
  '[cdefgs]s',
  `cr${NUMBER_0_15}`,
  `d[rb]${NUMBER_0_15}`,
  `tr${NUMBER_0_7}`,
  `st([ \\t]*\\([ \\t]*${NUMBER_0_7}[ \\t]*\\))?`,
  `mm${NUMBER_0_7}`,
  `[xyz]mm${NUMBER_0_31}`,
  `k${NUMBER_0_7}`,
  `tmm${NUMBER_0_7}`,
  '[er]?ip',
  '[er]iz',
];

const INTEL_WORD_OPERATORS = [
  ['_intel_multiplicative_word', '*'],
  ['_intel_bitwise_word', '|'],
  ['_intel_comparison_word', '=='],
];

function intelOperands($) {
  const operand = choice(field('operand', $._intel_operand), $._missing_operand);
  return seq($._intel_operands, operand, repeat(seq(choice(',', $._blank), operand)));
}

module.exports = (ctx) => {
  if (ctx.syntax !== 'gas') {
    return {};
  }
  const prefixSemicolons = PREFIX_SEMICOLONS.includes(ctx.dialect);
  const levels = precedence(ctx);
  const intel = {
    type: levels.unary - 6,
    word: levels.unary - 5,
    segment: levels.unary - 4,
    bracket: levels.unary - 2,
  };
  return {
    conflicts: [($) => [$._intel_macro_argument, $._intel_parenthesized]],
    rules: {
      register: () => token(seq('%', /[ \t]*/, new RegExp(`(${REGISTERS.join('|')})`, 'i'))),
      _register_concatenation: ($) =>
        seq(choice($.register, alias($._percent_name, $.register)), $._glued_pieces),
      _x86_register: ($) =>
        choice(
          $.register,
          alias($._percent_name, $.register),
          alias($._bare_register, $.register),
          alias($._register_concatenation, $.concatenation),
        ),
      _att_memory: ($) =>
        choice(
          seq(
            field('segment', $._x86_register),
            ':',
            choice($._att_address, field('displacement', $._expression)),
          ),
          $._att_address,
        ),
      _att_address: ($) =>
        prec(
          1,
          seq(
            optional(field('displacement', $._expression)),
            $._memory_address,
            '(',
            choice(
              seq(field('base', $._x86_register), $._after_memory_register),
              seq(alias($._memory_comma, ','), $._after_memory_comma),
            ),
          ),
        ),
      _after_memory_register: ($) => choice($._memory_close, seq(',', $._after_memory_comma)),
      _after_memory_comma: ($) =>
        choice(
          $._memory_close,
          seq(
            field('index', $._x86_register),
            choice(
              $._memory_close,
              seq(',', optional(field('scale', $._expression)), choice(')', $._unclosed)),
            ),
          ),
          seq(field('scale', $._expression), choice(')', $._unclosed)),
        ),
      _memory_close: ($) => choice(')', $._unclosed_memory),
      indirect: ($) =>
        seq(
          '*',
          field(
            'operand',
            choice($._x86_register, alias($._att_memory, $.memory_operand), $._expression),
          ),
        ),
      _syntax_directive: ($) =>
        seq(
          field('name', alias(choice($._intel_syntax, $._att_syntax), $.directive_name)),
          optional(
            field('argument', alias(choice($._syntax_prefix, $._syntax_noprefix), $.identifier)),
          ),
        ),
      decorated_operand: ($) =>
        seq(
          field('operand', choice($._x86_register, alias($._att_memory, $.memory_operand))),
          repeat1(field('decorator', $.decorator)),
        ),
      _intel_operand: ($) =>
        choice(
          $._intel_expression,
          alias($._intel_decorated, $.decorated_operand),
          $.decorator,
          prec(1, $.string),
          $.immediate,
        ),
      _intel_decorated: ($) =>
        seq(field('operand', $._intel_expression), repeat1(field('decorator', $.decorator))),
      _intel_expression: ($) =>
        choice(
          $.integer,
          $.float,
          $.char,
          $.numeric_label,
          $.location_counter,
          $._symbol,
          alias($.string, $.identifier),
          alias($._intel_macro_call, $.macro_call),
          $.relocation,
          $.macro_argument,
          $.concatenation,
          $._x86_register,
          alias($._intel_binary, $.binary_expression),
          alias($._intel_unary, $.unary_expression),
          alias($._intel_parenthesized, $.parenthesized_expression),
          alias($._intel_memory, $.memory_operand),
          $.typed_operand,
          $.segment_override,
          $._missing_expression,
        ),
      _intel_binary: ($) =>
        choice(
          ...[...levels.operators].map(([operator, level]) =>
            prec.left(
              level,
              seq(
                field('left', $._intel_expression),
                field('operator', operatorToken($, operator)),
                field('right', $._intel_expression),
              ),
            )
          ),
          ...INTEL_WORD_OPERATORS.map(([word, sameAs]) =>
            prec.left(
              levels.operators.get(sameAs),
              seq(
                field('left', $._intel_expression),
                field('operator', alias($[word], $.operator_word)),
                field('right', $._intel_expression),
              ),
            )
          ),
        ),
      _intel_unary: ($) =>
        choice(
          prec(
            levels.unary,
            seq(
              field('operator', choice('-', '+', '~', '!')),
              field('argument', $._intel_expression),
            ),
          ),
          prec(
            intel.word,
            seq(
              field('operator', alias($._intel_unary_word, $.operator_word)),
              field('argument', $._intel_expression),
            ),
          ),
        ),
      _intel_macro_call: ($) =>
        seq(
          field('function', $.identifier),
          field('arguments', alias($._intel_argument_list, $.argument_list)),
        ),
      _intel_argument_list: ($) =>
        seq(
          $._call_arguments,
          '(',
          optional(field('argument', $._intel_macro_argument)),
          repeat(seq(',', optional(field('argument', $._intel_macro_argument)))),
          choice(')', $._unclosed_arguments),
        ),
      _intel_statement_arguments: ($) =>
        prec.dynamic(
          -1,
          seq(
            '(',
            field('argument', $._intel_macro_argument),
            repeat(seq(',', field('argument', $._intel_macro_argument))),
            choice(')', $._unclosed_arguments),
          ),
        ),
      _intel_macro_argument: ($) => choice($._intel_expression, prec(1, $.string)),
      _intel_parenthesized: ($) => seq('(', $._intel_expression, choice(')', $._unclosed)),
      _intel_memory: ($) =>
        prec.left(
          intel.bracket,
          seq(
            choice(seq(field('displacement', $._intel_expression), alias($._index_open, '[')), '['),
            field('address', $._intel_expression),
            choice(']', $._unclosed_address),
          ),
        ),
      _word_binary: ($) =>
        choice(
          ...INTEL_WORD_OPERATORS.map(([word, sameAs]) =>
            prec.left(
              levels.operators.get(sameAs),
              seq(
                field('left', $._expression),
                field('operator', alias($[word], $.operator_word)),
                field('right', $._expression),
              ),
            )
          ),
        ),
      _word_unary: ($) =>
        prec(
          intel.word,
          seq(
            field('operator', alias($._intel_unary_word, $.operator_word)),
            field('argument', $._expression),
          ),
        ),
      operand_type: ($) => seq($._intel_type_word, optional($._intel_ptr_word)),
      typed_operand: ($) =>
        prec.right(
          intel.type,
          seq(field('type', $.operand_type), field('operand', $._intel_expression)),
        ),
      segment_override: ($) =>
        prec.right(
          intel.segment,
          seq(
            field('segment', choice($._intel_expression, alias($._intel_flat_word, 'flat'))),
            alias($._segment_colon, ':'),
            field('operand', $._intel_expression),
          ),
        ),
      ...(prefixSemicolons
        ? { _prefix_instruction: ($) => field('prefix', alias($._prefix_word, $.prefix)) }
        : {}),
    },
    choices: {
      instruction: [
        ($) =>
          seq(
            repeat1(field('prefix', alias($._prefix_word, $.prefix))),
            optional(seq(field('mnemonic', $._mnemonic), optional($._operands))),
          ),
        ($) =>
          seq(
            optional(field('prefix', alias($._prefix_word, $.prefix))),
            repeat1(field('prefix', alias($._pseudo_prefix, $.prefix))),
            repeat(field('prefix', alias($._prefix_word, $.prefix))),
            choice(seq(field('mnemonic', $._mnemonic), optional($._operands)), $._missing_name),
          ),
      ],
      _operands: [
        ($) => intelOperands($),
        ($) =>
          seq(
            $._intel_operands,
            field('operand', alias($._intel_statement_arguments, $.argument_list)),
          ),
      ],
      immediate: [
        ($) => seq('$', field('value', $._expression)),
      ],
      symbol_type: [($) => seq(alias($._at_type, '@'), $.identifier)],
      _statement: [($) => alias($._syntax_directive, $.directive)],
      _value: [
        ($) => $.immediate,
        ($) => $.register,
        ($) => alias($._bare_register, $.register),
      ],
      _macro_argument: [($) => $._x86_register],
      _expression: [
        ($) => alias($._word_binary, $.binary_expression),
        ($) => alias($._word_unary, $.unary_expression),
      ],
      _instruction_operand: [
        ($) => alias($._register_concatenation, $.concatenation),
        ($) => alias($._att_memory, $.memory_operand),
        ($) => $.indirect,
        ($) => $.decorated_operand,
        ($) => $.decorator,
      ],
      ...(prefixSemicolons
        ? {
          _item: [($) => seq(alias($._prefix_instruction, $.instruction), $._prefix_semicolon)],
        }
        : {}),
    },
  };
};
