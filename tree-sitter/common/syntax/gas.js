// SPDX-License-Identifier: MIT

const { commaList, operatorToken, precedence } = require('../core.js');

const COMMA_SEPARATED_LISTS = ['ARM_APPLE'];
const DARWIN_LOCALS = ['ARM_APPLE'];

function operandList($, name) {
    return commaList($, field(name, $._operand));
}

function instructionOperands($) {
    return seq(
        field('operand', $._instruction_operand),
        repeat(seq(',', choice(field('operand', $._instruction_operand), $._missing_operand))),
    );
}

function delimited(ctx, $, item, joined) {
    if (!COMMA_SEPARATED_LISTS.includes(ctx.dialect)) {
        return item;
    }
    return choice(item, alias(joined, $.argument));
}

function listRest(ctx, $, name, item, joined, missing) {
    const separator = COMMA_SEPARATED_LISTS.includes(ctx.dialect) ? ',' : choice(',', $._blank);
    return repeat(seq(separator, choice(field(name, delimited(ctx, $, item, joined)), missing)));
}

function argumentGroup($, item) {
    return prec.dynamic(
        -1,
        seq(
            '(',
            field('argument', item),
            repeat(seq(choice(',', $._blank), field('argument', item))),
            choice(')', $._unclosed_arguments),
        ),
    );
}

function macroArgumentList(ctx, $, item, joined) {
    return seq(
        field('argument', delimited(ctx, $, item, joined)),
        listRest(ctx, $, 'argument', item, joined, $._missing_operand),
    );
}

function preprocRest($, ...parts) {
    return [
        repeat(
            choice(
                ...parts,
                alias($.line_comment, $.preproc_comment),
                alias($.block_comment, $.preproc_comment),
            ),
        ),
        optional($._preproc_line_end),
    ];
}

module.exports = (ctx) => {
    const dotLocals = !DARWIN_LOCALS.includes(ctx.dialect);
    const levels = precedence(ctx);
    return {
        rules: {
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
                    seq(
                        field('operator', choice('-', '+', '~', '!')),
                        field('argument', $._expression),
                    ),
                ),
            parenthesized_expression: ($) => seq('(', $._expression, choice(')', $._unclosed)),

            directive: ($) =>
                choice(
                    seq(
                        field('name', alias($._generic_directive, $.directive_name)),
                        optional(operandList($, 'argument')),
                    ),
                    seq(
                        field('name', alias($._blank_separated_directive, $.directive_name)),
                        repeat(
                            field(
                                'argument',
                                choice($._symbol, $.integer, $.unary_expression, $.string),
                            ),
                        ),
                    ),
                    seq(
                        field('name', alias($._float_data_directive, $.directive_name)),
                        optional(commaList($, field('argument', $._float_value))),
                    ),
                    seq(
                        field('name', alias($._float_space_directive, $.directive_name)),
                        optional(
                            seq(
                                field('argument', $._value),
                                optional(
                                    seq(
                                        ',',
                                        choice(
                                            field('argument', $._float_value),
                                            $._missing_argument,
                                        ),
                                    ),
                                ),
                            ),
                        ),
                    ),
                ),
            _float_value: ($) => choice($._value, alias($._dot_float, $.float)),
            _dot_float: () => token(prec(1, ctx.lexical.dotFloat)),

            assignment: ($) =>
                prec(
                    1,
                    seq(
                        field('name', $._defined_name),
                        choice('=', '=='),
                        field('value', $._expression),
                    ),
                ),

            _definition_name: ($) =>
                choice($.identifier, alias($._dot_identifier, $.identifier), $.macro_argument),
            parameter: ($) =>
                seq(
                    field('name', $._definition_name),
                    optional(
                        seq(':', choice(field('qualifier', $.identifier), $._missing_identifier)),
                    ),
                    optional(
                        seq(
                            '=',
                            choice(
                                field(
                                    'default',
                                    delimited(ctx, $, $._call_value, $._joined_call_values),
                                ),
                                $._missing_operand,
                            ),
                        ),
                    ),
                ),

            macro_argument: () => ctx.lexical.macroArgument,

            numeric_label: () => ctx.lexical.numericLabel,
            float: () => ctx.lexical.float,

            preproc_line: ($) =>
                choice(
                    seq(
                        field('directive', alias($._preproc_include, $.preproc_directive)),
                        optional(
                            field(
                                'argument',
                                choice(alias($._header_name, $.preproc_argument), $.string),
                            ),
                        ),
                        ...preprocRest($, field('argument', $.preproc_argument)),
                    ),
                    seq(
                        field('directive', alias($._preproc_condition, $.preproc_directive)),
                        ...preprocRest(
                            $,
                            field('condition', alias($.preproc_argument, $.preproc_condition)),
                        ),
                    ),
                    seq(
                        field('directive', $.preproc_directive),
                        ...preprocRest($, field('argument', $.preproc_argument)),
                    ),
                ),
            preproc_define: ($) =>
                seq(
                    field('directive', alias($._preproc_define, $.preproc_directive)),
                    choice(
                        seq(
                            field('name', alias($._preproc_name, $.identifier)),
                            optional(field('parameters', $.preproc_params)),
                            ...preprocRest($, field('value', $.preproc_argument)),
                        ),
                        seq(...preprocRest($)),
                    ),
                ),
            _preproc_name: () => /[A-Za-z_][A-Za-z0-9_]*/,

            block_comment: () => token(seq('/*', /[^*]*\*+([^/*][^*]*\*+)*/, '/')),

            char: () =>
                token(
                    seq("'", optional(choice(/[^\\\n]/, seq('\\', optional(/./)))), optional("'")),
                ),

            relocation: ($) =>
                prec.left(
                    seq(
                        field('symbol', choice($._symbol, alias($.string, $.identifier))),
                        alias($._at_attached, '@'),
                        optional(field('specifier', alias($._relocation_specifier, $.identifier))),
                    ),
                ),
            argument_list: ($) =>
                seq(
                    $._call_arguments,
                    '(',
                    optional(field('argument', $._macro_argument)),
                    repeat(seq(',', optional(field('argument', $._macro_argument)))),
                    choice(')', $._unclosed_arguments),
                ),
            _call_argument: ($) => choice($._call_value, $.keyword_argument),
            _call_value: ($) =>
                choice($._instruction_operand, alias($._argument_group, $.argument_list)),
            ...(COMMA_SEPARATED_LISTS.includes(ctx.dialect)
                ? {
                    _joined_call_values: ($) =>
                        seq(
                            $._call_value,
                            repeat1(seq($._blank, choice($._call_value, $._missing_operand))),
                        ),
                }
                : {}),
            _argument_group: ($) => argumentGroup($, $._macro_argument),
            location_counter: () => '.',
            _percent_name: () => token(prec(-1, seq('%', optional(/[A-Za-z0-9_]+/)))),
            ...(dotLocals
                ? { _local_identifier: () => token(prec(1, ctx.lexical.localIdentifier)) }
                : {}),
        },
        choices: {
            _call_name: [($) => $.identifier],
            _macro_arguments: [
                ($) => macroArgumentList(ctx, $, $._call_argument, $._joined_call_values),
            ],
            _macro_header: [
                ($) =>
                    seq(
                        alias($._macro_open, '.macro'),
                        choice(field('name', $._definition_name), $._missing_name),
                        optional(
                            seq(
                                field('parameter', $.parameter),
                                repeat(
                                    choice(
                                        seq(
                                            ',',
                                            choice(
                                                field('parameter', $.parameter),
                                                $._missing_name,
                                            ),
                                        ),
                                        field('parameter', $.parameter),
                                    ),
                                ),
                            ),
                        ),
                    ),
            ],
            _macro_end: [($) => alias($._macro_close, '.endm')],
            _conditional_header: [
                ($) => seq(alias($._if_open, '.if'), optional(operandList($, 'condition'))),
            ],
            _elseif_header: [
                ($) => seq(alias($._elseif, '.elseif'), optional(operandList($, 'condition'))),
            ],
            _else_header: [($) => alias($._else, '.else')],
            _conditional_clauses: [
                ($) => seq(repeat1($.elseif_clause), optional($.else_clause)),
                ($) => $.else_clause,
            ],
            _open_clauses: [($) => repeat1($.elseif_clause)],
            _conditional_end: [($) => alias($._conditional_close, '.endif')],
            _repeat_header: [
                ($) => seq(alias($._rept_open, '.rept'), optional(field('count', $._expression))),
                ($) =>
                    seq(
                        choice(alias($._irp_open, '.irp'), alias($._irpc_open, '.irpc')),
                        choice(field('parameter', $._definition_name), $._missing_name),
                        listRest(
                            ctx,
                            $,
                            'value',
                            $._call_value,
                            $._joined_call_values,
                            $._missing_operand,
                        ),
                    ),
            ],
            _repeat_end: [($) => alias($._repeat_close, '.endr')],
            _glued_piece: [
                ($) => alias($._glued_argument, $.macro_argument),
                ($) => alias($._glued_separator, '\\()'),
                ($) => alias($._glued_text, $.identifier),
            ],
            _preproc_parameter: [
                ($) => choice(seq(alias($._preproc_name, $.identifier), optional('...')), '...'),
            ],
            _preproc_parameter_list: [
                ($) => seq($._preproc_parameter, repeat(seq(',', $._preproc_parameter))),
            ],
            symbol_type: [($) => $._percent_name],
            _line_content: [($) => $.preproc_line, ($) => $.preproc_define],
            _symbol: [
                ($) => alias($._dot_identifier, $.identifier),
                ...(dotLocals ? [($) => alias($._local_identifier, $.local_identifier)] : []),
            ],
            _mnemonic: [($) => $.macro_argument, ($) => $.concatenation],
            _local_label: [
                ($) => seq(field('name', alias($._macro_label, $.macro_call)), ':'),
                ($) => seq(field('name', alias($._numeric_label_name, $.numeric_label)), ':'),
                ($) => seq(field('name', choice($.macro_argument, $.concatenation)), ':'),
            ],
            _statement: [($) => $.directive, ($) => $.assignment],
            _defined_name: [
                ($) => $._symbol,
                ($) => alias($.string, $.identifier),
                ($) => $.location_counter,
            ],
            _glue_head: [($) => $._symbol, ($) => $.macro_argument],
            _keyword_name: [($) => $.identifier],
            _keyword_value: [
                ($) => field('value', delimited(ctx, $, $._call_value, $._joined_call_values)),
                ($) => $._missing_operand,
            ],
            _value: [
                ($) => $._expression,
                ($) => prec(1, $.string),
                ($) => $.symbol_type,
                ($) => alias($._section_type_word, $.identifier),
            ],
            _operand: [($) => $._value, ($) => $.keyword_argument],
            _instruction_operand: [($) => $._value],
            _operands: [($) => instructionOperands($)],
            _macro_argument: [($) => $._expression, ($) => prec(1, $.string)],
            _expression: [
                ($) => $._symbol,
                ($) => $.integer,
                ($) => $.unary_expression,
                ($) => $.binary_expression,
                ($) => $.parenthesized_expression,
                ($) => $._missing_expression,
                ($) => $.macro_call,
                ($) => alias($.string, $.identifier),
                ($) => $.char,
                ($) => $.relocation,
                ($) => $.location_counter,
                ($) => $.numeric_label,
                ($) => $.float,
                ($) => $.macro_argument,
                ($) => $.concatenation,
            ],
        },
        extras: [($) => $.block_comment],
        conflicts: [($) => [$.parenthesized_expression, $._macro_argument]],
    };
};

module.exports.argumentGroup = argumentGroup;
module.exports.macroArgumentList = macroArgumentList;
