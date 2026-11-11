// SPDX-License-Identifier: MIT

const { argumentGroup, macroArgumentList } = require('../syntax/gas.js');
const { intelLevels } = require('./x86.js');

const PREFIX_SEMICOLONS = ['AUTO'];

function plainList($, first, rest) {
  return seq(
    field('operand', first),
    repeat(seq(',', choice(field('operand', rest), $._missing_operand))),
  );
}

const INTEL_WORD_OPERATORS = [
  ['_intel_multiplicative_word', '*'],
  ['_intel_bitwise_word', '|'],
  ['_intel_comparison_word', '=='],
];

module.exports = (ctx) => {
  if (ctx.syntax !== 'gas') {
    return {};
  }
  const prefixSemicolons = PREFIX_SEMICOLONS.includes(ctx.dialect);
  const intel = intelLevels(ctx);
  const { levels } = intel;
  return {
    conflicts: [($) => [$._intel_macro_argument, $._intel_parenthesized]],
    rules: {
      _register_concatenation: ($) =>
        seq(
          choice(alias($._register, $.register), alias($._percent_name, $.register)),
          $._glued_pieces,
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
      _intel_macro_argument: ($) => choice($._intel_expression, prec(1, $.string)),
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
      _flags_operands: ($) =>
        choice(
          seq(
            field('operand', $.decorator),
            optional(plainList($, $._flags_att_first, $._instruction_operand)),
          ),
          plainList($, $._flags_att_first, $._instruction_operand),
          seq(
            $._intel_operands,
            choice(
              seq(
                field('operand', $.decorator),
                optional(plainList($, $._plain_intel_operand, $._intel_operand)),
              ),
              plainList($, $._plain_intel_operand, $._intel_operand),
            ),
          ),
        ),
      _flags_att_first: ($) => choice($._value, $._plain_att_operand),
      _intel_call_argument: ($) =>
        choice(
          $._intel_operand,
          $.keyword_argument,
          alias($._intel_argument_group, $.argument_list),
        ),
      _intel_argument_group: ($) => argumentGroup($, $._intel_macro_argument),
      ...(prefixSemicolons
        ? { _prefix_instruction: ($) => field('prefix', alias($._prefix_word, $.prefix)) }
        : {}),
    },
    choices: {
      _x86_register: [
        ($) => alias($._percent_name, $.register),
        ($) => alias($._register_concatenation, $.concatenation),
      ],
      _intel_operand: [($) => $.decorator],
      _plain_intel_operand: [($) => $.immediate],
      _macro_arguments: [
        ($) => seq($._intel_operands, macroArgumentList(ctx, $, $._intel_call_argument)),
      ],
      _intel_expression: [
        ($) => $.float,
        ($) => $.char,
        ($) => $.numeric_label,
        ($) => $.location_counter,
        ($) => alias($.string, $.identifier),
        ($) => alias($._intel_macro_call, $.macro_call),
        ($) => $.relocation,
        ($) => $.macro_argument,
        ($) => $.concatenation,
      ],
      _intel_binary: INTEL_WORD_OPERATORS.map(([word, sameAs]) => ($) =>
        prec.left(
          levels.operators.get(sameAs),
          seq(
            field('left', $._intel_expression),
            field('operator', alias($[word], $.operator_word)),
            field('right', $._intel_expression),
          ),
        )
      ),
      _intel_unary: [
        ($) =>
          prec(
            intel.word,
            seq(
              field('operator', alias($._intel_unary_word, $.operator_word)),
              field('argument', $._intel_expression),
            ),
          ),
      ],
      immediate: [
        ($) => seq('$', field('value', $._expression)),
      ],
      symbol_type: [($) => seq(alias($._type_mark, '@'), choice($.identifier, $.integer))],
      _statement: [($) => alias($._syntax_directive, $.directive)],
      _value: [($) => $.immediate, ($) => alias($._register, $.register)],
      _macro_argument: [($) => $._x86_register],
      _expression: [
        ($) => alias($._word_binary, $.binary_expression),
        ($) => alias($._word_unary, $.unary_expression),
      ],
      _instruction_operand: [($) => $._plain_att_operand, ($) => $.decorator],
      _plain_att_operand: [
        ($) => alias($._register_concatenation, $.concatenation),
        ($) => alias($._att_memory, $.memory_operand),
        ($) => $.indirect,
        ($) => $.decorated_operand,
      ],
      _instruction_body: [
        ($) =>
          seq(
            field('mnemonic', alias($._flags_instruction, $.mnemonic)),
            optional($._flags_operands),
          ),
      ],
      ...(prefixSemicolons
        ? {
          _item: [($) => seq(alias($._prefix_instruction, $.instruction), $._prefix_semicolon)],
        }
        : {}),
    },
  };
};
