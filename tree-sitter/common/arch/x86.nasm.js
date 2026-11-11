// SPDX-License-Identifier: MIT

const { intelLevels } = require('./x86.js');

module.exports = (ctx) => {
  if (ctx.syntax !== 'nasm') {
    return {};
  }
  const { levels, type } = intelLevels(ctx);
  return {
    rules: {
      _flags_operands: ($) =>
        seq(
          $._intel_operands,
          choice(
            prec(
              1,
              seq(
                field('operand', $.decorator),
                field('operand', $._intel_operand),
                repeat(seq(',', choice(field('operand', $._intel_operand), $._missing_operand))),
              ),
            ),
            seq(
              field('operand', $._plain_intel_operand),
              repeat(seq(',', choice(field('operand', $._intel_operand), $._missing_operand))),
            ),
          ),
        ),
      address_modifier: ($) =>
        prec(
          1,
          choice(
            $._address_word,
            $._absolute_word,
            $._intel_type_word,
            alias($._prefix_word, $.prefix),
          ),
        ),
      operand_type: ($) =>
        prec.right(
          choice(
            seq($._strict_word, optional($._intel_type_word)),
            $._intel_type_word,
            $._to_word,
            $._absolute_word,
          ),
        ),
      _word_typed: ($) =>
        prec.right(
          type,
          seq(
            field('type', $._name),
            $._operand_gap,
            field('operand', $._intel_expression),
          ),
        ),
      conditional_expression: ($) =>
        prec.right(
          seq(
            field('condition', $._intel_expression),
            alias($._conditional_question, '?'),
            field('consequence', $._intel_expression),
            alias($._conditional_colon, ':'),
            field('alternative', $._intel_expression),
          ),
        ),
      relocation: ($) =>
        prec.left(
          seq(
            field('symbol', $._intel_expression),
            alias($._wrt_word, 'wrt'),
            field('specifier', choice($.special_symbol, $._intel_expression)),
          ),
        ),
      _bracketless_memory: ($) =>
        prec.right(
          seq(choice('&', alias($._memory_open_word, '__?masm_ptr?__')), $._memory_inside),
        ),
    },
    choices: {
      _memory_inside: [
        ($) =>
          seq(
            repeat1(field('modifier', $.address_modifier)),
            field('address', $._intel_expression),
          ),
      ],
      _bracket_inside: [
        ($) =>
          seq(
            repeat(field('modifier', $.address_modifier)),
            optional(field('address', $._intel_expression)),
            ',',
            field('index', $._intel_expression),
          ),
      ],
      _intel_expression: [
        ($) => $.relocation,
        ($) => $.string,
        ($) => $.location_counter,
        ($) => $.section_start,
        ($) => $.decorator,
        ($) => alias($._float_operation, $.unary_expression),
        ($) => alias($._bracketless_memory, $.memory_operand),
        ($) => alias($._word_typed, $.typed_operand),
        ($) => $.conditional_expression,
      ],
      _plain_intel_operand: [($) => $._float_operand],
      _instruction_body: [
        ($) =>
          seq(
            field('mnemonic', $._mnemonic),
            repeat1(field('prefix', alias($._pseudo_prefix, $.prefix))),
            optional($._operands),
          ),
        ($) =>
          seq(
            field('mnemonic', alias($._flags_instruction, $.mnemonic)),
            repeat(field('prefix', alias($._pseudo_prefix, $.prefix))),
            optional($._flags_operands),
          ),
      ],
      _intel_unary: [
        ($) =>
          prec(
            levels.unary,
            seq(
              field('operator', alias($._intel_unary_word, $.operator_word)),
              field('argument', $._intel_expression),
            ),
          ),
      ],
    },
  };
};
