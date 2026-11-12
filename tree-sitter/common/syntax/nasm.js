// SPDX-License-Identifier: MIT

const { commaList } = require('../core.js');

function argumentList($, name, value = $._intel_expression) {
    const argument = field(name, value);
    return seq(argument, repeat(seq(choice(',', $._blank), choice(argument, $._missing_argument))));
}

function valueList($, value) {
    return seq(
        optional(field('argument', value)),
        repeat(seq(',', optional(field('argument', value)))),
    );
}

function macroReference($, name) {
    return seq(
        field(name, $._name),
        optional(
            seq(
                field('parameters', $.parameter_count),
                optional(alias($._trailing_argument, $.preproc_argument)),
            ),
        ),
    );
}

function conditionHeaders([generic, macro, raw], keyword) {
    return [
        ($) =>
            seq(
                alias($[generic], keyword),
                optional(
                    seq(
                        argumentList($, 'condition'),
                        optional(alias($._trailing_argument, $.preproc_argument)),
                    ),
                ),
            ),
        ($) => seq(alias($[macro], keyword), optional(macroReference($, 'condition'))),
        ($) => seq(alias($[raw], keyword), optional(field('condition', $.preproc_argument))),
    ];
}

module.exports = (ctx) => ({
    conflicts: [
        ($) => [$._parenthesized_float, $._intel_operand],
        ($) => [$._intel_parenthesized, $._intel_operand],
    ],
    rules: {
        _name: ($) => choice($._symbol, $._macro_token),
        _digit_name: () => token(prec(-1, ctx.lexical.digitName)),
        _macro_token: ($) => choice($._macro_leaf, $.concatenation),
        _macro_leaf: ($) =>
            choice(
                alias($._argument_reference, $.macro_argument),
                $.macro_local,
                $.context_local,
                $.macro_expansion,
            ),
        _macro_arguments: ($) =>
            seq(
                field('argument', $._macro_value),
                repeat(seq(',', choice(field('argument', $._macro_value), $._missing_operand))),
            ),
        _macro_value: ($) => choice($._macro_item, alias($._macro_items, $.argument)),
        _macro_items: ($) => seq($._macro_item, repeat1(seq($._blank, $._macro_item))),
        _macro_item: ($) =>
            choice(
                $._intel_operand,
                alias($._brace_group, $.argument_list),
                alias($._parenthesized_group, $.argument_list),
                $.macro_reference,
            ),
        _parenthesized_group: ($) =>
            prec.dynamic(
                -1,
                seq('(', valueList($, $._macro_value), choice(')', $._unclosed_arguments)),
            ),
        argument_list: ($) =>
            seq(
                $._call_arguments,
                '(',
                valueList($, $._macro_value),
                choice(')', $._unclosed_arguments),
            ),
        _statement_arguments: ($) =>
            seq(
                $._statement_call,
                '(',
                valueList($, $._macro_value),
                choice(')', $._unclosed_arguments),
            ),
        _brace_group: ($) =>
            seq(
                alias($._brace_open, '{'),
                valueList($, $._macro_value),
                choice('}', $._unclosed_brace),
            ),
        macro_reference: ($) =>
            seq(
                field('name', $._name),
                alias($._reference_colon, ':'),
                optional(field('parameters', $.argument_list)),
                optional(seq(alias($._reference_colon, ':'), field('count', $._intel_expression))),
            ),
        _call_statement: ($) =>
            seq(
                field('function', alias($._macro_name, $.identifier)),
                field('arguments', alias($._statement_arguments, $.argument_list)),
            ),
        _macro_statement: ($) =>
            choice(
                alias($._macro_invocation, $.macro_call),
                alias($._call_statement, $.macro_call),
            ),
        parameter_count: ($) => seq(token(/[0-9]+(-([0-9]+|\*))?\+?/), optional($._list_word)),
        preproc_line: ($) =>
            choice(
                seq(
                    field('directive', $.preproc_directive),
                    optional(field('argument', $.preproc_argument)),
                ),
                seq(
                    field('directive', alias($._preproc_include, $.preproc_directive)),
                    choice(field('argument', $.string), $._missing_argument),
                ),
                seq(
                    field('directive', alias($._preproc_macro, $.preproc_directive)),
                    optional(macroReference($, 'name')),
                ),
            ),
        preproc_define: ($) =>
            choice(
                seq(
                    field('directive', alias($._preproc_define, $.preproc_directive)),
                    optional(
                        seq(
                            field('name', $._name),
                            optional(field('parameters', $.preproc_params)),
                            optional(field('value', $.preproc_argument)),
                        ),
                    ),
                ),
                seq(
                    field('directive', alias($._preproc_set, $.preproc_directive)),
                    optional(
                        seq(field('name', $._name), optional(field('value', $.preproc_argument))),
                    ),
                ),
                seq(
                    field('directive', alias($._preproc_assign, $.preproc_directive)),
                    optional(seq(field('name', $._name), field('value', $._intel_expression))),
                ),
            ),
        _glue_operand: ($) => choice($._symbol, $._macro_leaf, $.integer),
        _quoted_string: () =>
            token(
                choice(
                    seq("'", /(?:[^'\\\n]|\\\r?\n|\\)*/, optional("'")),
                    seq('"', /(?:[^"\\\n]|\\\r?\n|\\)*/, optional('"')),
                ),
            ),
        directive: ($) =>
            choice(
                $._generic_form,
                $._section_form,
                $._declaration_form,
                $._common_form,
                $._align_form,
                $._use_form,
                seq(
                    '[',
                    choice(
                        $._generic_form,
                        $._section_form,
                        $._declaration_form,
                        $._common_form,
                        $._align_form,
                        $._bracket_form,
                    ),
                    optional(']'),
                ),
            ),
        _generic_form: ($) =>
            seq(
                field('name', alias($._generic_directive, $.directive_name)),
                optional(argumentList($, 'argument', $._standard_argument)),
            ),
        _section_form: ($) =>
            seq(
                field('name', alias($._section_directive, $.directive_name)),
                optional(
                    seq(
                        field('argument', choice(alias($._raw_word, $.identifier), $.string)),
                        repeat(
                            field(
                                'argument',
                                choice(alias($._raw_word, $.identifier), $.keyword_argument),
                            ),
                        ),
                    ),
                ),
            ),
        _declaration_form: ($) =>
            seq(
                field('name', alias($._declaration_directive, $.directive_name)),
                optional(commaList($, $._declared)),
            ),
        _declared: ($) =>
            seq(
                field('argument', choice($._name, $.macro_call)),
                optional(
                    seq(
                        repeat1(field('argument', $.symbol_type)),
                        repeat(seq($._blank, field('argument', $._intel_expression))),
                    ),
                ),
            ),
        _common_form: ($) =>
            seq(
                field('name', alias($._common_directive, $.directive_name)),
                optional(commaList($, $._common_declared)),
            ),
        _common_declared: ($) =>
            seq(
                field('argument', choice($._name, $.macro_call)),
                field('argument', $._intel_expression),
                optional(
                    seq(alias($._alignment_colon, ':'), field('argument', $._intel_expression)),
                ),
            ),
        _bracket_form: ($) =>
            seq(
                field('name', alias($._bracket_directive, $.directive_name)),
                optional(field('argument', alias($._bracket_argument, $.preproc_argument))),
            ),
        _standard_argument: ($) =>
            choice($._intel_expression, alias($._brace_group, $.argument_list)),
        _align_form: ($) =>
            seq(
                field('name', alias($._align_directive, $.directive_name)),
                optional(
                    seq(
                        field('argument', $._standard_argument),
                        optional(
                            seq(
                                ',',
                                choice(
                                    field('statement', $._repeated_statement),
                                    field('argument', alias($._brace_group, $.argument_list)),
                                    $._missing_name,
                                ),
                            ),
                        ),
                    ),
                ),
            ),
        _use_form: ($) => field('name', alias($._use_directive, $.directive_name)),
        _data_form: ($) =>
            seq(
                field('name', alias($._data_directive, $.directive_name)),
                optional(commaList($, field('argument', $._data_argument))),
            ),
        _data_argument: ($) =>
            choice(
                $._data_value,
                alias($._dup_expression, $.binary_expression),
                alias($._percent_list, $.argument_list),
                alias($._typed_list, $.typed_operand),
            ),
        _data_value: ($) =>
            choice(
                $._intel_expression,
                $._float_operand,
                $.uninitialized,
                alias($._typed_atom, $.typed_operand),
            ),
        _typed_atom: ($) =>
            seq(
                field('type', $.operand_type),
                field('operand', choice($.uninitialized, $._float_operand)),
            ),
        _typed_list: ($) => seq(field('type', $.operand_type), field('operand', $._data_list)),
        _data_list: ($) =>
            choice(
                alias($._parenthesized_list, $.argument_list),
                alias($._percent_list, $.argument_list),
            ),
        _parenthesized_list: ($) => seq($._call_arguments, '(', $._list_rest),
        _percent_list: ($) => seq(alias($._list_open, '%('), $._list_rest),
        _list_rest: ($) =>
            seq(
                repeat(seq(field('argument', $._data_argument), ',')),
                choice(
                    seq(choice(field('argument', $._data_value), $._missing_argument), ')'),
                    seq(optional(field('argument', $._data_argument)), $._unclosed_arguments),
                ),
            ),
        _dup_expression: ($) =>
            seq(
                field('left', $._intel_expression),
                field('operator', alias($._dup_word, $.operator_word)),
                field(
                    'right',
                    choice($._data_value, $._data_list, alias($._typed_list, $.typed_operand)),
                ),
            ),

        float: () => ctx.lexical.float,
        _float_value: ($) => choice($.float, alias($._float_special, $.float)),
        _float_operand: ($) =>
            choice(
                $._float_value,
                alias($._signed_float, $.unary_expression),
                alias($._parenthesized_float, $.parenthesized_expression),
            ),
        _signed_float: ($) =>
            seq(field('operator', choice('-', '+')), field('argument', $._float_operand)),
        _parenthesized_float: ($) => seq('(', $._float_operand, choice(')', $._unclosed)),
        _float_operation: ($) =>
            seq(
                field('operator', alias($._float_operator_word, $.operator_word)),
                choice(
                    field('argument', alias($._float_argument, $.parenthesized_expression)),
                    $._missing_argument,
                ),
            ),
        _float_argument: ($) =>
            seq('(', choice($._intel_expression, $._float_operand), choice(')', $._unclosed)),

        location_counter: () => '$',
        section_start: () => '$$',

        times: ($) =>
            seq(
                alias($._times, 'times'),
                field('count', $._intel_expression),
                choice(field('statement', $._repeated_statement), $._missing_name),
            ),
        _repeated_statement: ($) =>
            choice($.instruction, alias($._data_form, $.directive), $.times, $._macro_statement),

        _structure_name: ($) =>
            choice($._name, $.macro_call, alias($._brace_group, $.argument_list)),
        _struc_header: ($) =>
            seq(
                alias($._struc_open, 'struc'),
                choice(field('name', $._structure_name), $._missing_symbol),
                optional(seq(',', field('offset', $._standard_argument))),
            ),
        _structure_items: ($) =>
            seq(
                choice($._newline, $._separator, $._end),
                repeat(choice($._item, alias($._global_label, $.label))),
            ),
        structure: ($) =>
            seq(
                $._struc_header,
                field('body', alias($._structure_items, $.structure_body)),
                alias($._struc_close, 'endstruc'),
            ),
        _unclosed_structure: ($) =>
            seq($._struc_header, field('body', alias($._structure_items, $.structure_body))),
        _istruc_header: ($) =>
            seq(
                alias($._istruc_open, 'istruc'),
                choice(field('name', $._structure_name), $._missing_symbol),
            ),
        structure_instance: ($) =>
            seq($._istruc_header, field('body', $.body), alias($._istruc_close, 'iend')),
        _unclosed_structure_instance: ($) => seq($._istruc_header, field('body', $.unclosed_body)),
        field_initializer: ($) =>
            seq(
                alias($._at_word, 'at'),
                field('field', $._standard_argument),
                optional(seq(',', optional($._field_data))),
            ),
        _unclosed_field_initializer: ($) =>
            seq(
                alias($._at_word, 'at'),
                field('field', $._standard_argument),
                ',',
                optional($._field_label),
                field(
                    'statement',
                    choice(
                        alias($._unclosed_structure, $.structure),
                        alias($._unclosed_structure_instance, $.structure_instance),
                    ),
                ),
            ),
        _field_label: ($) =>
            choice(alias($._global_label, $.label), alias($._local_label, $.label)),
        _field_data: ($) =>
            choice(
                seq($._field_label, optional(field('statement', $._field_statement))),
                field('statement', $._field_statement),
                field('argument', alias($._brace_group, $.argument_list)),
            ),
        _field_statement: ($) =>
            choice(
                $.instruction,
                $._macro_statement,
                $.directive,
                alias($._data_form, $.directive),
                $.times,
                $.assignment,
                $.structure,
                $.structure_instance,
            ),

        assignment: ($) =>
            seq(
                field('name', choice($._name, alias($._macro_label, $.macro_call))),
                optional(':'),
                alias($._equ, 'equ'),
                field('value', $._intel_expression),
            ),
    },
    choices: {
        _call_name: [($) => $._name, ($) => alias($._preproc_function, $.identifier)],
        _global_label: [($) => field('name', alias($._global_label_name, $.identifier))],
        _local_label: [
            ($) => field('name', alias($._local_label_name, $.local_identifier)),
            ($) => seq(field('name', $._macro_token), ':'),
            ($) => prec(-1, field('name', $._macro_token)),
            ($) => seq(field('name', alias($._macro_label, $.macro_call)), optional(':')),
        ],
        _item: [
            ($) =>
                seq(
                    choice(
                        alias($._unclosed_structure, $.structure),
                        alias($._unclosed_structure_instance, $.structure_instance),
                        alias($._unclosed_field_initializer, $.field_initializer),
                    ),
                    $._block_end,
                ),
        ],
        _line_content: [
            ($) => $.assignment,
            ($) => $.preproc_line,
            ($) => $.preproc_define,
            ($) => $.field_initializer,
        ],
        _mnemonic: [($) => $._macro_token],
        _intel_expression: [
            ($) => $._macro_token,
            ($) => $.macro_call,
        ],
        _glue_head: [($) => $._symbol, ($) => $._macro_leaf],
        _glued_piece: [
            ($) => alias($._glued_argument, $.macro_argument),
            ($) => alias($._glued_local, $.macro_local),
            ($) => alias($._glued_context, $.context_local),
            ($) => alias($._glued_expansion, $.macro_expansion),
            ($) => seq(alias($._glued_separator, '%+'), choice($._glue_operand, $._missing_symbol)),
            ($) => alias($._glued_text, $.identifier),
        ],
        _macro_header: [
            ($) =>
                seq(
                    alias($._macro_open, '%macro'),
                    choice(field('name', $._name), $._missing_identifier),
                    optional(
                        seq(
                            field('parameters', $.parameter_count),
                            optional(field('default', $.preproc_argument)),
                        ),
                    ),
                ),
        ],
        _macro_end: [($) => seq(alias($._macro_close, '%endmacro'), optional($.preproc_argument))],
        _conditional_header: conditionHeaders(
            ['_if_open', '_if_macro_open', '_if_raw_open'],
            '%if',
        ),
        _elseif_header: conditionHeaders(['_elseif', '_elseif_macro', '_elseif_raw'], '%elif'),
        _else_header: [($) => seq(alias($._else, '%else'), optional($.preproc_argument))],
        _conditional_clauses: [($) => repeat1(choice($.elseif_clause, $.else_clause))],
        _open_clauses: [($) => repeat1(choice($.elseif_clause, $.else_clause))],
        _conditional_end: [
            ($) => seq(alias($._conditional_close, '%endif'), optional($.preproc_argument)),
        ],
        _repeat_header: [
            ($) =>
                seq(
                    alias($._rept_open, '%rep'),
                    optional(alias($._list_word, '.nolist')),
                    field('count', $._intel_expression),
                    optional(alias($._trailing_argument, $.preproc_argument)),
                ),
        ],
        _repeat_end: [($) => seq(alias($._repeat_close, '%endrep'), optional($.preproc_argument))],
        _preproc_parameter: [
            ($) =>
                repeat1(
                    choice('=', '&', '&&', '!', '+', $.identifier, token(/\/[ \t]*[A-Za-z]+/)),
                ),
        ],
        _preproc_parameter_list: [
            ($) => seq($._preproc_parameter, repeat(seq(',', optional($._preproc_parameter)))),
            ($) =>
                seq(
                    ',',
                    optional($._preproc_parameter),
                    repeat(seq(',', optional($._preproc_parameter))),
                ),
        ],
        _statement: [
            ($) => $.directive,
            ($) => alias($._data_form, $.directive),
            ($) => $.times,
            ($) => $.structure,
            ($) => $.structure_instance,
            ($) => alias($._call_statement, $.macro_call),
        ],
        _symbol: [
            ($) => alias($._dot_identifier, $.local_identifier),
            ($) => alias($._digit_name, $.identifier),
        ],
        string: [($) => $._quoted_string],
        _keyword_name: [($) => alias($._raw_word, $.identifier)],
        _keyword_value: [
            ($) => field('value', $._intel_expression),
            ($) => $._missing_argument,
        ],
        symbol_type: [
            ($) =>
                seq(
                    alias($._type_mark, ':'),
                    choice(
                        $.identifier,
                        $.integer,
                        alias($._intel_parenthesized, $.parenthesized_expression),
                    ),
                ),
        ],
    },
});
