// SPDX-License-Identifier: MIT

const { operandList } = require('../core');

const SYMBOL_TYPES = [
  'function',
  'object',
  'tls_object',
  'common',
  'notype',
  'gnu_indirect_function',
  'gnu_unique_object',
  'progbits',
  'nobits',
  'note',
  'init_array',
  'fini_array',
  'preinit_array',
];

const COMMA_SEPARATED_LISTS = ['ARM_APPLE'];
const DARWIN_LOCALS = ['ARM_APPLE'];

function required($, rule) {
  return choice(rule, $._missing_operand);
}

function listRest($, ctx, item) {
  const afterComma = seq(',', required($, item));
  return repeat(
    COMMA_SEPARATED_LISTS.includes(ctx.dialect) ? afterComma : choice(afterComma, item),
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
  return {
    rules: {
      directive: ($) =>
        choice(
          seq(
            field(
              'name',
              choice(
                alias($._dot_identifier, $.directive_name),
                alias($._sized_data_directive, $.directive_name),
              ),
            ),
            optional(operandList($, 'argument')),
          ),
          seq(
            field('name', alias($._blank_separated_directive, $.directive_name)),
            repeat(field('argument', choice($._symbol, $.integer, $.string))),
          ),
        ),
      _sized_data_directive: () => token(ctx.lexical.sizedDataDirective),
      _blank_separated_directive: () => token(prec(1, ctx.lexical.blankSeparatedDirective)),

      assignment: ($) =>
        seq(
          field('name', choice($._symbol, $.location_counter)),
          choice('=', '=='),
          field('value', $._expression),
        ),

      _body_items: ($) =>
        seq(choice($._newline, $._separator, $._end), repeat(choice($._item, $.label_block))),
      body: ($) => $._body_items,
      unclosed_body: ($) => $._body_items,
      macro_definition: ($) =>
        seq($._macro_header, field('body', $.body), alias($._macro_close, '.endm')),
      _unclosed_macro: ($) => seq($._macro_header, field('body', $.unclosed_body)),
      _macro_header: ($) =>
        seq(
          alias($._macro_open, '.macro'),
          required($, field('name', $.identifier)),
          optional(
            seq(field('parameter', $.parameter), listRest($, ctx, field('parameter', $.parameter))),
          ),
        ),
      parameter: ($) =>
        seq(
          field('name', $.identifier),
          optional(
            choice(
              seq(':', required($, field('qualifier', $.identifier))),
              seq('=', field('default', $._value)),
            ),
          ),
        ),
      _macro_open: () => token(prec(1, ctx.lexical.macroOpen)),

      conditional: ($) =>
        seq(
          $._conditional_header,
          field('body', $.body),
          repeat($.elseif_clause),
          optional($.else_clause),
          alias($._conditional_close, '.endif'),
        ),
      _unclosed_conditional: ($) =>
        seq(
          $._conditional_header,
          choice(
            field('body', $.unclosed_body),
            seq(
              field('body', $.body),
              repeat($.elseif_clause),
              choice(
                alias($._unclosed_elseif_clause, $.elseif_clause),
                alias($._unclosed_else_clause, $.else_clause),
              ),
            ),
          ),
        ),
      _conditional_header: ($) =>
        seq(alias($._if_open, '.if'), optional(operandList($, 'condition'))),
      elseif_clause: ($) => seq($._elseif_header, field('body', $.body)),
      _unclosed_elseif_clause: ($) => seq($._elseif_header, field('body', $.unclosed_body)),
      _elseif_header: ($) =>
        seq(alias($._elseif, '.elseif'), optional(operandList($, 'condition'))),
      else_clause: ($) => seq(alias($._else, '.else'), field('body', $.body)),
      _unclosed_else_clause: ($) => seq(alias($._else, '.else'), field('body', $.unclosed_body)),
      _if_open: () => token(prec(1, ctx.lexical.ifOpen)),

      repeat_block: ($) =>
        seq($._repeat_header, field('body', $.body), alias($._repeat_close, '.endr')),
      _unclosed_repeat: ($) => seq($._repeat_header, field('body', $.unclosed_body)),
      _repeat_header: ($) =>
        choice(
          seq(alias($._rept_open, '.rept'), optional(field('count', $._expression))),
          seq(
            choice(alias($._irp_open, '.irp'), alias($._irpc_open, '.irpc')),
            required($, field('parameter', $.identifier)),
            listRest($, ctx, field('value', $._value)),
          ),
        ),
      _rept_open: () => token(prec(1, ctx.lexical.reptOpen)),
      _irp_open: () => token(prec(1, ctx.lexical.irpOpen)),
      _irpc_open: () => token(prec(1, ctx.lexical.irpcOpen)),

      macro_argument: () => ctx.lexical.macroArgument,
      concatenation: ($) =>
        seq(
          choice(
            $.identifier,
            alias($._dot_identifier, $.identifier),
            ...(dotLocals ? [alias($._local_identifier, $.local_identifier)] : []),
            $.macro_argument,
          ),
          repeat1(
            choice(
              alias($._glued_argument, $.macro_argument),
              alias($._glued_separator, '\\()'),
              alias($._glued_text, $.identifier),
            ),
          ),
        ),
      keyword_argument: ($) => seq(field('name', $.identifier), '=', field('value', $._value)),

      numeric_label: () => ctx.lexical.numericLabel,
      float: () => ctx.lexical.float,

      preproc_line: ($) =>
        choice(
          seq(
            field('directive', alias($._preproc_include, $.preproc_directive)),
            optional(field('argument', alias($._header_name, $.preproc_argument))),
            ...preprocRest($, field('argument', $.preproc_argument)),
          ),
          seq(
            field('directive', alias($._preproc_condition, $.preproc_directive)),
            ...preprocRest($, field('condition', alias($.preproc_argument, $.preproc_condition))),
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
      preproc_params: ($) =>
        seq(
          alias($._preproc_params_open, '('),
          optional(seq($._preproc_parameter, repeat(seq(',', $._preproc_parameter)))),
          ')',
        ),
      _preproc_parameter: ($) =>
        choice(seq(alias($._preproc_name, $.identifier), optional('...')), '...'),
      _preproc_name: () => /[A-Za-z_$][A-Za-z0-9_$]*/,

      block_comment: () => token(seq('/*', /[^*]*\*+([^/*][^*]*\*+)*/, '/')),

      string: ($) =>
        seq(
          '"',
          repeat(choice($._string_content, $.escape_sequence)),
          choice(token.immediate('"'), $._unclosed),
        ),
      escape_sequence: () =>
        token.immediate(seq('\\', choice(/[0-7]{1,3}/, /[xX][0-9a-fA-F]+/, /[^0-7xX\n]/))),
      char: () =>
        token(seq("'", optional(choice(/[^\\\n]/, seq('\\', optional(/./)))), optional("'"))),

      relocation: ($) =>
        prec.left(
          seq(
            field('symbol', $._symbol),
            alias($._at_attached, '@'),
            optional(field('specifier', alias($._relocation_specifier, $.identifier))),
          ),
        ),
      _relocation_specifier: () => token.immediate(prec(1, ctx.lexical.identifier)),
      location_counter: () => '.',
      ...(dotLocals
        ? { _local_identifier: () => token(prec(1, ctx.lexical.localIdentifier)) }
        : {}),
    },
    choices: {
      _item: [
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
      symbol_type: [
        () => token(prec(2, seq('%', choice(...SYMBOL_TYPES)))),
        () => token(prec(-1, seq('%', optional(/[A-Za-z_][A-Za-z0-9_]*/)))),
      ],
      _line_content: [($) => $.preproc_line, ($) => $.preproc_define],
      _symbol: [
        ($) => alias($._dot_identifier, $.identifier),
        ...(dotLocals ? [($) => alias($._local_identifier, $.local_identifier)] : []),
      ],
      _mnemonic: [($) => $.macro_argument, ($) => $.concatenation],
      _local_label: [
        ($) => seq(field('name', alias($._numeric_label_name, $.numeric_label)), ':'),
        ($) => seq(field('name', choice($.macro_argument, $.concatenation)), ':'),
      ],
      _statement: [
        ($) => $.directive,
        ($) => $.assignment,
        ($) => $.macro_definition,
        ($) => $.conditional,
        ($) => $.repeat_block,
      ],
      _value: [($) => $.string, ($) => $.symbol_type],
      _operand: [($) => $.keyword_argument],
      _expression: [
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
  };
};
