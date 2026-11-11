// SPDX-License-Identifier: MIT

const COMPARISONS = ['==', '!=', '<>', '<', '<=', '>', '>='];
const PRECEDENCE_LEVELS = {
    gnu: [['||'], ['&&'], COMPARISONS, ['+', '-'], ['|', '&', '^', '!'], [
        '*',
        '/',
        '%',
        '<<',
        '>>',
    ]],
    darwin: [['&&', '||'], ['|', '&', '^'], COMPARISONS, ['<<', '>>'], ['+', '-'], ['*', '/', '%']],
    nasm: [
        ['||'],
        ['^^'],
        ['&&'],
        [...COMPARISONS, '=', '<=>'],
        ['|'],
        ['^'],
        ['&'],
        ['<<', '>>', '<<<', '>>>'],
        ['+', '-'],
        ['*', '/', '//', '%', '%%'],
    ],
};
const LEVEL_STEP = 10;
const DARWIN_PRECEDENCE = ['ARM_APPLE'];
const CLANG_INTEGERS = ['ARM_APPLE'];

function precedence(ctx) {
    const family = ctx.syntax === 'nasm'
        ? 'nasm'
        : DARWIN_PRECEDENCE.includes(ctx.dialect)
        ? 'darwin'
        : 'gnu';
    const levels = PRECEDENCE_LEVELS[family];
    return {
        operators: new Map(
            levels.flatMap((operators, index) =>
                operators.map((operator) => [operator, (index + 1) * LEVEL_STEP])
            ),
        ),
        unary: (levels.length + 1) * LEVEL_STEP,
    };
}

function operatorToken($, operator) {
    return operator === '%' ? alias($._remainder, '%') : operator;
}

function commaList($, item) {
    return seq(item, repeat(seq(',', choice(item, $._missing_argument))));
}

module.exports = (ctx) => ({
    rules: {
        source_file: ($) => repeat(choice($._item, $.label_block)),

        label_block: ($) =>
            prec.right(seq(field('label', alias($._global_label, $.label)), repeat($._item))),

        _newline: () => /\r?\n/,

        identifier: () => ctx.lexical.identifier,
        _dot_identifier: () => ctx.lexical.dotIdentifier,
        integer: () =>
            CLANG_INTEGERS.includes(ctx.dialect) ? ctx.lexical.clangInteger : ctx.lexical.integer,

        escape_sequence: () => token.immediate(seq('\\', ctx.lexical.escape)),

        _body_items: ($) =>
            seq(choice($._newline, $._separator, $._end), repeat(choice($._item, $.label_block))),
        body: ($) => $._body_items,
        unclosed_body: ($) => $._body_items,
        macro_definition: ($) => seq($._macro_header, field('body', $.body), $._macro_end),
        _unclosed_macro: ($) => seq($._macro_header, field('body', $.unclosed_body)),
        conditional: ($) =>
            seq(
                $._conditional_header,
                field('body', $.body),
                optional($._conditional_clauses),
                $._conditional_end,
            ),
        _unclosed_conditional: ($) =>
            seq(
                $._conditional_header,
                choice(
                    field('body', $.unclosed_body),
                    seq(
                        field('body', $.body),
                        optional($._open_clauses),
                        choice(
                            alias($._unclosed_elseif_clause, $.elseif_clause),
                            alias($._unclosed_else_clause, $.else_clause),
                        ),
                    ),
                ),
            ),
        elseif_clause: ($) => seq($._elseif_header, field('body', $.body)),
        _unclosed_elseif_clause: ($) => seq($._elseif_header, field('body', $.unclosed_body)),
        else_clause: ($) => seq($._else_header, field('body', $.body)),
        _unclosed_else_clause: ($) => seq($._else_header, field('body', $.unclosed_body)),
        repeat_block: ($) => seq($._repeat_header, field('body', $.body), $._repeat_end),
        _unclosed_repeat: ($) => seq($._repeat_header, field('body', $.unclosed_body)),

        concatenation: ($) => seq($._glue_head, $._glued_pieces),
        _glued_pieces: ($) => repeat1($._glued_piece),

        preproc_params: ($) =>
            seq(
                alias($._preproc_params_open, '('),
                optional($._preproc_parameter_list),
                ')',
            ),

        _macro_invocation: ($) =>
            seq(
                field('function', alias($._macro_name, $.identifier)),
                optional(field('arguments', alias($._macro_arguments, $.argument_list))),
            ),

        keyword_argument: ($) => seq(field('name', $._keyword_name), '=', $._keyword_value),

        macro_call: ($) =>
            seq(field('function', $._call_name), field('arguments', $.argument_list)),
        _macro_label: ($) =>
            seq(
                field('function', alias($._macro_label_name, $.identifier)),
                field('arguments', $.argument_list),
            ),
    },
    choices: {
        instruction: [($) => $._instruction_body],
        _instruction_body: [($) => seq(field('mnemonic', $._mnemonic), optional($._operands))],
        _item: [
            ($) => alias($._local_label, $.label),
            ($) => $._newline,
            ($) => $._separator,
            ($) => seq($._line_content, choice($._newline, $._separator, $._end)),
            ($) =>
                seq(
                    choice(
                        alias($._unclosed_macro, $.macro_definition),
                        alias($._unclosed_conditional, $.conditional),
                        alias($._unclosed_repeat, $.repeat_block),
                    ),
                    $._block_end,
                ),
        ],
        _line_content: [($) => $._statement],
        _mnemonic: [($) => alias($._instruction_name, $.mnemonic)],
        _global_label: [
            ($) => seq(field('name', alias($._global_label_name, $.identifier)), ':'),
        ],
        _local_label: [
            ($) => seq(field('name', alias($._local_label_name, $.local_identifier)), ':'),
        ],
        _symbol: [($) => $.identifier],
        _statement: [
            ($) => $.instruction,
            ($) => alias($._macro_invocation, $.macro_call),
            ($) => $.macro_definition,
            ($) => $.conditional,
            ($) => $.repeat_block,
        ],
        string: [
            ($) =>
                seq(
                    ctx.lexical.escapedQuote,
                    repeat(choice($._string_content, $.escape_sequence)),
                    choice(token.immediate(ctx.lexical.escapedQuote), $._unclosed),
                ),
        ],
    },
    extras: [() => /[ \t\f\v\r]/, ($) => $.line_comment],
});

module.exports.commaList = commaList;
module.exports.precedence = precedence;
module.exports.operatorToken = operatorToken;
