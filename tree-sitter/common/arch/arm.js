// SPDX-License-Identifier: MIT

const { ROLES } = require('../roles.js');

const DOLLAR_LABELS = ['AUTO', 'ARM'];
const POSITIONAL_MACRO_ARGUMENTS = ['ARM_APPLE'];
const AARCH32 = ['AUTO', 'ARM'];
const GNU_AS = ['AUTO', 'ARM'];
const APPLE_LOCALS = ['ARM_APPLE'];
const LINKER_HINTS = ['ARM_APPLE'];

const APPLE_LOCAL_PRECEDENCE = 1;

function separated($, step, missing) {
  return seq(',', choice(step, missing));
}

function roleSlot(role, index, $) {
  if (role.labels?.includes(index)) {
    return $._label_operand;
  }
  if (role.conditions?.includes(index)) {
    return $._condition_operand;
  }
  if (role.systems?.includes(index)) {
    return $._system_operand;
  }
  return $._role_operand;
}

function roleLast(role) {
  return Math.max(...(role.labels ?? []), ...(role.conditions ?? []), ...(role.systems ?? []));
}

function roleMissing(role, index, $) {
  if (role.labels?.includes(index) || index === role.optional) {
    return $._missing_label_operand;
  }
  return $._missing_operand;
}

function roleRest(role, index, $) {
  return index === roleLast(role) ? $._role_trailing : $[`_${role.name}_after_${index}`];
}

function roleStep(role, index, $) {
  if (index === role.optional) {
    return choice(
      prec(1, seq(field('operand', alias($._arm_register, $.register)), roleRest(role, index, $))),
      seq(field('operand', $._final_label), optional($._role_trailing)),
    );
  }
  return seq(field('operand', roleSlot(role, index, $)), optional(roleRest(role, index, $)));
}

function roleInstruction(role) {
  return ($) =>
    seq(
      field('mnemonic', alias($[`_${role.name}_instruction`], $.mnemonic)),
      optional(roleStep(role, 1, $)),
    );
}

function roleRules(role) {
  const rules = {};
  for (let index = 1; index < roleLast(role); index++) {
    rules[`_${role.name}_after_${index}`] = ($) =>
      separated($, roleStep(role, index + 1, $), roleMissing(role, index + 1, $));
  }
  return rules;
}

module.exports = (ctx) => {
  const aarch32 = AARCH32.includes(ctx.dialect);
  const gnu = GNU_AS.includes(ctx.dialect);
  const dollarLabels = DOLLAR_LABELS.includes(ctx.dialect);
  const positionalArguments = POSITIONAL_MACRO_ARGUMENTS.includes(ctx.dialect);
  const appleLocals = APPLE_LOCALS.includes(ctx.dialect);
  const linkerHints = LINKER_HINTS.includes(ctx.dialect);
  const suffixRelocations = gnu && aarch32;

  return {
    rules: {
      predicate: ($) =>
        prec(
          1,
          seq(
            field('register', alias($._arm_register, $.register)),
            '/',
            field('qualifier', alias($._predicate_qualifier, $.identifier)),
          ),
        ),
      shift: ($) =>
        prec.right(
          1,
          choice(
            seq(
              field('operator', alias($._shift_word, $.shift_operator)),
              optional($._blank),
              field('amount', $._shift_amount),
            ),
            seq(
              field('operator', alias($._extend_word, $.shift_operator)),
              optional(seq(optional($._blank), field('amount', $._shift_amount))),
            ),
          ),
        ),
      _shift_amount: ($) => choice($.immediate, alias($._arm_register, $.register), $._expression),
      signed_register: ($) =>
        seq(field('sign', choice('-', '+')), field('register', alias($._arm_register, $.register))),
      _register_name: ($) =>
        choice(
          alias($._arm_register, $.register),
          prec(1, $.identifier),
          prec(1, $.macro_argument),
          prec(1, $.concatenation),
          ...(positionalArguments ? [alias($._darwin_argument, $.macro_argument)] : []),
        ),
      writeback: ($) => prec(1, seq(field('register', $._register_name), '!')),
      indexed_register: ($) =>
        prec(
          1,
          seq(
            field('register', $._register_name),
            alias($._index_open, '['),
            field('index', $._index),
            repeat(seq(',', field('index', $._index))),
            choice(']', $._unclosed_bracket),
          ),
        ),
      _index: ($) => choice(alias($._arm_register, $.register), $.index_range, $._expression),
      index_range: ($) =>
        seq(
          field('start', $._expression),
          alias($._bracket_colon, ':'),
          field('end', $._expression),
        ),
      memory_operand: ($) =>
        prec.right(seq(
          '[',
          choice(field('operand', $._memory_element), $._missing_element),
          optional(field('alignment', $.alignment)),
          repeat(seq(',', choice(field('operand', $._memory_element), $._missing_element))),
          choice(']', $._unclosed_bracket),
          optional('!'),
        )),
      _memory_element: ($) =>
        choice(
          alias($._arm_register, $.register),
          $.indexed_register,
          $.signed_register,
          $.immediate,
          $.shift,
          $.alignment,
          $._expression,
        ),
      alignment: ($) => seq(alias($._bracket_colon, ':'), field('value', $.integer)),
      register_list: ($) =>
        prec.right(seq(
          '{',
          choice(field('element', $._list_element), $._missing_name),
          repeat(seq(',', choice(field('element', $._list_element), $._missing_name))),
          choice('}', $._unclosed_brace),
          optional(seq('[', field('index', $._expression), choice(']', $._unclosed_index))),
          optional('^'),
        )),
      _list_element: ($) => choice($._register_name, $.indexed_register, $.register_range),
      register_range: ($) =>
        seq(
          field('start', $._register_name),
          alias($._range_dash, '-'),
          choice(field('end', $._register_name), $._missing_name),
        ),
      register_alias: ($) =>
        seq(
          field('name', $._defined_name),
          field(
            'directive',
            choice(
              alias($._register_alias_word, $.directive_name),
              ...(aarch32 && gnu ? [alias($._neon_alias_word, $.directive_name)] : []),
            ),
          ),
          choice(
            field('register', choice($._register_name, $.indexed_register)),
            $._missing_name,
          ),
        ),
      literal_pool: ($) => seq('=', field('value', $._expression)),
      _label_operand: ($) => choice($._value, $.memory_operand, $.literal_pool),
      _condition_operand: ($) => choice(alias($._condition, $.condition), $._instruction_operand),
      _system_operand: ($) => choice(alias($._system_register, $.register), $._instruction_operand),
      _register_directive: ($) =>
        seq(
          field(
            'name',
            choice(
              alias($._cfi_register_directive, $.directive_name),
              ...(gnu ? [alias($._unwind_register_directive, $.directive_name)] : []),
            ),
          ),
          optional(
            seq(
              field('argument', $._register_argument),
              repeat(
                seq(
                  ',',
                  choice(field('argument', $._register_argument), $._missing_register_argument),
                ),
              ),
            ),
          ),
        ),
      _register_argument: ($) =>
        choice(alias($._arm_register, $.register), $.register_list, $._operand),
      ...(linkerHints
        ? {
          _linker_hint: ($) =>
            seq(
              field('name', alias($._linker_hint_directive, $.directive_name)),
              optional(
                seq(
                  field('argument', choice($._symbol, $.integer)),
                  optional(
                    seq(
                      field('argument', $._symbol),
                      repeat(seq(',', choice(field('argument', $._symbol), $._missing_symbol))),
                    ),
                  ),
                ),
              ),
            ),
        }
        : {}),
      ...(suffixRelocations
        ? {
          _suffix_relocation: ($) =>
            prec.left(
              -1,
              seq(
                field('value', $._expression),
                $._relocation_suffix,
                '(',
                choice(
                  seq(
                    field('specifier', alias($._suffix_relocation_name, $.identifier)),
                    choice(')', $._unclosed),
                  ),
                  seq($._missing_relocation, $._unclosed),
                ),
              ),
            ),
        }
        : {}),
      ...(gnu
        ? {
          _relocation_operator: ($) =>
            prec.right(
              seq(
                ':',
                choice(
                  seq(
                    field('specifier', alias($._relocation_name, $.identifier)),
                    choice(
                      seq(alias($._relocation_colon, ':'), field('value', $._expression)),
                      $._missing_relocation,
                    ),
                  ),
                  $._missing_relocation,
                ),
              ),
            ),
        }
        : {}),
      ...(appleLocals
        ? {
          _apple_local: () =>
            token(
              prec(APPLE_LOCAL_PRECEDENCE, new RegExp(`L${ctx.lexical.nameCharacter.source}*`)),
            ),
        }
        : {}),
      _role_operand: ($) => $._instruction_operand,
      _final_label: ($) => choice(alias($._arm_register, $.identifier), $._label_operand),
      _register_operand: ($) =>
        choice(
          alias($._arm_register, $.register),
          $.indexed_register,
          $.writeback,
          $.predicate,
        ),
      _role_trailing: ($) =>
        repeat1(
          choice(
            seq(',', choice(field('operand', $._role_operand), $._missing_operand)),
          ),
        ),
      ...Object.assign({}, ...ROLES.map(roleRules)),
    },
    choices: {
      instruction: ROLES.map(roleInstruction),
      _statement: [
        ($) => $.register_alias,
        ($) => alias($._register_directive, $.directive),
        ...(linkerHints ? [($) => alias($._linker_hint, $.directive)] : []),
      ],
      immediate: [
        ($) =>
          seq(
            alias($._hash, '#'),
            field('value', choice($._expression, alias($._dot_float, $.float))),
          ),
      ],
      _value: [($) => $.immediate],
      _instruction_operand: [
        ($) => $._register_operand,
        ($) => $.signed_register,
        ($) => $.memory_operand,
        ($) => $.register_list,
        ($) => $.literal_pool,
        ($) => $.shift,
      ],
      ...(appleLocals ? { _symbol: [($) => alias($._apple_local, $.local_identifier)] } : {}),
      ...(positionalArguments
        ? { _glue_head: [($) => alias($._darwin_argument, $.macro_argument)] }
        : {}),
      _expression: [
        ...(gnu ? [($) => alias($._relocation_operator, $.relocation)] : []),
        ...(suffixRelocations ? [($) => alias($._suffix_relocation, $.relocation)] : []),
        ...(dollarLabels ? [($) => alias($._dollar_label, $.numeric_label)] : []),
        ...(positionalArguments ? [($) => alias($._darwin_argument, $.macro_argument)] : []),
      ],
      _local_label: dollarLabels
        ? [($) => seq(field('name', alias($._dollar_label_name, $.numeric_label)), ':')]
        : [],
    },
  };
};

module.exports.DOLLAR_LABELS = DOLLAR_LABELS;
