// SPDX-License-Identifier: MIT

const { commaList, operatorToken, precedence } = require('../core.js');

const COMMA_SEPARATED_LISTS = ['ARM_APPLE'];
const DARWIN_LOCALS = ['ARM_APPLE'];
const CALL_LISTS = ['AUTO', 'ARM', 'ARM_APPLE'];

function operandList($, name) {
    return commaList($, field(name, $._operand));
}

function operandItem(ctx, $) {
    const operand = field('operand', $._instruction_operand);
    return CALL_LISTS.includes(ctx.dialect) ? choice(operand, $._call_run) : operand;
}

function operandStep(ctx, $) {
    const item = operandItem(ctx, $);
    return choice(
        seq(',', choice(item, $._missing_operand)),
        ...(CALL_LISTS.includes(ctx.dialect) ? [seq($._call_gap, item)] : []),
    );
}

function instructionOperands(ctx, $) {
    return seq(operandItem(ctx, $), repeat(operandStep(ctx, $)));
}

function joinedValues($, value) {
    return seq(value, repeat1(seq($._joining_blank, choice(value, $._missing_operand))));
}

function delimited($, item, joined) {
    return choice(item, alias(joined, $.argument));
}

function listRest(ctx, $, name, item, joined, missing) {
    const separator = COMMA_SEPARATED_LISTS.includes(ctx.dialect) ? ',' : choice(',', $._blank);
    return repeat(seq(separator, choice(field(name, delimited($, item, joined)), missing)));
}

function argumentGroup($, item) {
    return prec.dynamic(
        -1,
        seq(
            '(',
            field('argument', item),
            repeat(seq(choice(',', $._blank), choice(field('argument', item), $._missing_operand))),
            choice(')', $._unclosed_arguments),
        ),
    );
}

function macroArgumentList(ctx, $, item, joined) {
    const first = field('argument', delimited($, item, joined));
    const rest = listRest(ctx, $, 'argument', item, joined, $._missing_operand);
    return choice(seq(first, rest), seq(',', choice(first, $._missing_operand), rest));
}

function cppArguments($, marker, argument) {
    const slot = optional(choice(field('argument', argument), $._missing_operand));
    return seq(
        marker,
        '(',
        slot,
        repeat(seq(',', slot)),
        choice(alias($._call_close, ')'), $._unclosed_call),
    );
}

function cppRules(prefix, item, call) {
    const name = (part) => `_${prefix}cpp_${part}`;
    return {
        [name('label')]: ($) =>
            choice(
                alias($._global_label, $.label),
                alias($._local_label, $.label),
                alias($[name('call_label')], $.label),
            ),
        [name('call_label')]: ($) => seq(field('name', call($)), alias($._label_colon, ':')),
        [name('argument')]: ($) => choice(item($), alias($[name('text')], $.argument)),
        [name('text')]: ($) =>
            choice(
                $[name('items')],
                $[name('labelled')],
                seq(
                    optional($[name('statement')]),
                    repeat1(
                        seq(
                            $._separator,
                            optional(choice($[name('statement')], $._missing_operand)),
                        ),
                    ),
                ),
            ),
        [name('statement')]: ($) => choice($[name('labelled')], $[name('body')]),
        [name('labelled')]: ($) =>
            seq(repeat1($[name('label')]), optional(choice($[name('body')], $._missing_operand))),
        [name('body')]: ($) => choice(item($), $[name('items')]),
        [name('items')]: ($) =>
            seq(item($), repeat1(seq($._blank, choice(item($), $._missing_operand)))),
    };
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
                        field('name', alias($._string_directive, $.directive_name)),
                        optional(
                            seq(
                                field('argument', $._string_argument),
                                repeat(
                                    choice(
                                        field('argument', $._string_argument),
                                        seq(
                                            ',',
                                            choice(
                                                field('argument', $._string_argument),
                                                $._missing_argument,
                                            ),
                                        ),
                                    ),
                                ),
                            ),
                        ),
                    ),
                    field('name', alias(choice($._altmacro, $._noaltmacro), $.directive_name)),
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
            _string_argument: ($) =>
                choice($.string, $._symbol, $.macro_argument, $.concatenation, $.macro_call),

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
                choice(
                    $.identifier,
                    alias($._dot_identifier, $.identifier),
                    $.macro_argument,
                    $.concatenation,
                ),
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
                                    delimited($, $._call_value, $._joined_call_values),
                                ),
                                $._missing_operand,
                            ),
                        ),
                    ),
                ),

            macro_argument: () => ctx.lexical.macroArgument,

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
            argument_list: ($) => cppArguments($, $._call_arguments, $._cpp_argument),
            _call_argument: ($) => choice($._call_value, $.keyword_argument),
            _call_value: ($) => choice($._call_item, alias($._argument_group, $.argument_list)),
            _joined_call_values: ($) => joinedValues($, $._call_value),
            _argument_group: ($) => argumentGroup($, $._call_item),
            ...cppRules('', ($) => $._call_item, ($) => $.macro_call),
            _call_label: ($) => seq(field('name', alias($._macro_label, $.macro_call)), ':'),
            ...(CALL_LISTS.includes(ctx.dialect)
                ? {
                    _call_run: ($) =>
                        prec(
                            -1,
                            seq(
                                field('operand', $.macro_call),
                                choice(field('operand', $._instruction_operand), $._call_run),
                            ),
                        ),
                }
                : {}),
            _altmacro_value: ($) =>
                seq(
                    field('operator', alias($._altmacro_percent, '%')),
                    field('argument', $._expression),
                ),
            immediate: ($) =>
                seq(field('prefix', $._immediate_prefix), field('value', $._immediate_value)),
            probe_argument: ($) =>
                seq(
                    field(
                        'size',
                        choice(
                            $.integer,
                            $.identifier,
                            alias($._negative_size, $.unary_expression),
                        ),
                    ),
                    alias($._probe_at, '@'),
                    choice(field('operand', $._instruction_operand), $._missing_operand),
                ),
            _negative_size: ($) => seq(field('operator', '-'), field('argument', $.integer)),
            _mnemonic_macro_call: ($) =>
                seq(
                    field('function', alias($._macro_name, $.identifier)),
                    field('arguments', alias($._mnemonic_arguments, $.argument_list)),
                ),
            _mnemonic_arguments: ($) => cppArguments($, $._call_mnemonic, $._cpp_argument),
            _call_instruction: ($) =>
                seq(
                    field('mnemonic', alias($._mnemonic_macro_call, $.macro_call)),
                    optional($._operands),
                ),
            _pp_number: ($) =>
                seq(
                    alias(choice($.integer, $.numeric_label, $.float), 'number'),
                    alias($._glued_text, 'text'),
                ),
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
            _statement_arguments: [($) => cppArguments($, $._statement_call, $._cpp_argument)],
            _macro_header: [
                ($) =>
                    seq(
                        alias($._macro_open, '.macro'),
                        choice(
                            field('name', $._definition_name),
                            $._missing_name,
                        ),
                        optional(','),
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
                                        COMMA_SEPARATED_LISTS.includes(ctx.dialect)
                                            ? field('parameter', $.parameter)
                                            : seq($._blank, field('parameter', $.parameter)),
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
                ($) => alias($._dollar_name, $.identifier),
                ...(dotLocals ? [($) => alias($._local_identifier, $.local_identifier)] : []),
            ],
            _mnemonic: [($) => $.macro_argument, ($) => $.concatenation],
            _local_label: [
                ($) => seq(field('name', alias($._numeric_label_name, $.numeric_label)), ':'),
                ($) => seq(field('name', choice($.macro_argument, $.concatenation)), ':'),
            ],
            _item: [($) => alias($._call_label, $.label)],
            _statement: [
                ($) => $.directive,
                ($) => $.assignment,
                ($) => alias($._call_instruction, $.instruction),
            ],
            _defined_name: [
                ($) => $._symbol,
                ($) => alias($.string, $.identifier),
                ($) => $.location_counter,
                ($) => $.macro_argument,
                ($) => $.concatenation,
            ],
            _glue_head: [($) => $._symbol, ($) => $.macro_argument],
            _keyword_name: [($) => alias($._keyword_word, $.identifier)],
            _keyword_value: [
                ($) => field('value', delimited($, $._call_value, $._joined_call_values)),
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
            _operands: [($) => instructionOperands(ctx, $)],
            _call_item: [
                ($) => $._instruction_operand,
                ($) => alias($._pp_number, $.identifier),
                ($) => $.probe_argument,
                ($) => alias($._altmacro_string, $.string),
                ($) => alias($._altmacro_value, $.unary_expression),
            ],
            _expression: [
                ($) => $._symbol,
                ($) => $.integer,
                ($) => $.unary_expression,
                ($) => $.binary_expression,
                ($) => $.parenthesized_expression,
                ($) => $._missing_expression,
                ($) => $.macro_call,
                ($) => alias($._call_concatenation, $.concatenation),
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
        extras: [($) => $.block_comment, ($) => $._call_newline],
        conflicts: [($) => [$.parenthesized_expression, $._call_item]],
    };
};

module.exports.argumentGroup = argumentGroup;
module.exports.cppArguments = cppArguments;
module.exports.cppRules = cppRules;
module.exports.joinedValues = joinedValues;
module.exports.macroArgumentList = macroArgumentList;
module.exports.operandStep = operandStep;
