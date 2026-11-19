// SPDX-License-Identifier: MIT

const { operatorToken, precedence } = require('../core.js');

function intelOperands($) {
    const operand = choice(field('operand', $._intel_operand), $._missing_operand);
    return seq($._intel_operands, operand, repeat(seq(',', operand)));
}

function intelLevels(ctx) {
    const levels = precedence(ctx);
    return {
        levels,
        type: levels.unary - 6,
        word: levels.unary - 5,
        segment: levels.unary - 4,
        bracket: levels.unary - 2,
    };
}

function x86Decorators(ctx) {
    const level = ctx.archs.includes('arm') ? 2 : 0;
    return { level, decorates: (rule) => prec(level, rule) };
}

module.exports = (ctx) => {
    const intel = intelLevels(ctx);
    const { levels } = intel;
    const { decorates } = x86Decorators(ctx);
    return {
        rules: {
            _intel_decorated: ($) =>
                seq(
                    field('operand', $._intel_expression),
                    repeat1(field('decorator', $._decorator_item)),
                ),
            _decorator_item: ($) => choice($.decorator, alias($._macro_decorator, $.decorator)),
            _macro_decorator: ($) => seq($._decorator_open, '{', $._decorator_value, '}'),
            _intel_parenthesized: ($) => seq('(', $._intel_expression, choice(')', $._unclosed)),
            _intel_memory: ($) =>
                prec.left(
                    intel.bracket,
                    seq(
                        choice(
                            seq(
                                field('displacement', $._intel_expression),
                                alias($._index_open, '['),
                            ),
                            '[',
                        ),
                        $._bracket_inside,
                        choice(']', $._unclosed_address),
                    ),
                ),
            typed_operand: ($) =>
                prec.right(
                    intel.type,
                    seq(field('type', $.operand_type), field('operand', $._intel_expression)),
                ),
            segment_override: ($) =>
                prec.right(
                    intel.segment,
                    seq(
                        field('segment', $._segment_name),
                        alias($._segment_colon, ':'),
                        field('operand', $._intel_expression),
                    ),
                ),
        },
        choices: {
            _x86_register: [($) => decorates(alias($._register, $.register))],
            _intel_operand: [($) => $._plain_intel_operand],
            _plain_intel_operand: [
                ($) => $._intel_expression,
                ($) => alias($._intel_decorated, $.decorated_operand),
                ($) => prec(1, $.string),
            ],
            _intel_expression: [
                ($) => $.integer,
                ($) => $._symbol,
                ($) => $._x86_register,
                ($) => alias($._intel_binary, $.binary_expression),
                ($) => alias($._intel_unary, $.unary_expression),
                ($) => alias($._intel_parenthesized, $.parenthesized_expression),
                ($) => alias($._intel_memory, $.memory_operand),
                ($) => $.typed_operand,
                ($) => $.segment_override,
                ($) => $._missing_expression,
            ],
            _intel_binary: [...levels.operators].map(([operator, level]) => ($) =>
                prec.left(
                    level,
                    seq(
                        field('left', $._intel_expression),
                        field('operator', operatorToken($, operator)),
                        field('right', $._intel_expression),
                    ),
                )
            ),
            _intel_unary: [
                ($) =>
                    prec(
                        levels.unary,
                        seq(
                            field('operator', choice('-', '+', '~', '!')),
                            field('argument', $._intel_expression),
                        ),
                    ),
            ],
            _segment_name: [($) => $._intel_expression],
            _memory_inside: [($) => field('address', $._intel_expression)],
            _bracket_inside: [($) => $._memory_inside],
            instruction: [
                ($) =>
                    seq(
                        repeat1(field('prefix', alias($._prefix_word, $.prefix))),
                        optional($._instruction_body),
                    ),
                ($) =>
                    seq(
                        optional(field('prefix', alias($._prefix_word, $.prefix))),
                        repeat1(field('prefix', alias($._pseudo_prefix, $.prefix))),
                        repeat(field('prefix', alias($._prefix_word, $.prefix))),
                        choice($._instruction_body, $._missing_name),
                    ),
            ],
            _operands: [($) => intelOperands($)],
        },
    };
};

module.exports.intelLevels = intelLevels;
module.exports.x86Decorators = x86Decorators;
