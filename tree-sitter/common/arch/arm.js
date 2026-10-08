// SPDX-License-Identifier: MIT

const DOLLAR_LABELS = ['AUTO', 'ARM'];
const POSITIONAL_MACRO_ARGUMENTS = ['ARM_APPLE'];
const AARCH32 = ['AUTO', 'ARM'];
const GNU_AS = ['AUTO', 'ARM'];
const APPLE_LOCALS = ['ARM_APPLE'];
const LINKER_HINTS = ['ARM_APPLE'];

const KEYWORD_PRECEDENCE = 2;
const CONDITIONS = 'eq|ne|cs|hs|cc|lo|mi|pl|vs|vc|hi|ls|ge|lt|gt|le|al|nv';
const NAME_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_.$';
const COMPARE_CONDITIONS = 'gt|ge|hi|hs|eq|ne|lt|le|lo|ls';
const NUMBER_0_31 = '([12]?[0-9]|3[01])';
const NUMBER_0_15 = '([0-9]|1[0-5])';
const ARRANGEMENTS = '8b|16b|4h|8h|2s|4s|1d|2d|1q|4b|2h|[bhsdq]';
const NEON_TYPES = '([isupf]?(8|16|32|64)|bf16)';
const TYPED_AARCH32_REGISTERS = [
  `r${NUMBER_0_15}`,
  'sb|sl|fp|ip|sp|lr|pc',
  'a[1-4]|v[1-8]',
  `[sdq]${NUMBER_0_31}`,
  'fpscr|fpexc|fpsid|mvfr[0-2]|fpinst2?',
  `[pc]${NUMBER_0_15}`,
];

const REGISTERS = {
  aarch64: [
    `[xw]${NUMBER_0_31}`,
    '[xw]zr',
    'w?sp',
    'lr',
    'fp',
    `[bhsdq]${NUMBER_0_31}`,
    `v${NUMBER_0_31}(\\.(${ARRANGEMENTS}))?`,
    `z${NUMBER_0_31}(\\.[bhsdq])?`,
    `p${NUMBER_0_15}(\\.[bhsd])?`,
    `pn([89]|1[0-5])(\\.[bhsd])?`,
    'za(\\.[bhsdq])?',
    `za${NUMBER_0_15}[hv]?\\.[bhsdq]`,
    'zt0',
    `c${NUMBER_0_15}`,
    `s[0-3]_[0-7]_c${NUMBER_0_15}_c${NUMBER_0_15}_[0-7]`,
  ],
  gnuAarch64: ['ip[01]'],
  aarch32: [
    `r${NUMBER_0_15}`,
    'sb',
    'sl',
    'ip',
    'pc',
    'a[1-4]',
    '(apsr|cpsr|spsr)(_([cxsf]{1,4}|nzcvq?g?|g|fiq|irq|svc|abt|und|mon|hyp))?',
    'fpscr|fpexc|fpsid|mvfr[0-2]|fpinst2?',
    'vpr',
  ],
  gnuAarch32: [
    'r(8|9|1[0-2])_(usr|fiq)',
    '(sp|lr)_(usr|fiq|irq|svc|abt|und|mon|hyp)',
    'elr_hyp',
    `(${TYPED_AARCH32_REGISTERS.join('|')})\\.${NEON_TYPES}`,
  ],
};

const RELOCATIONS = {
  aarch64: [
    'lo12',
    'abs_g[0-3]',
    'abs_g[0-2]_(s|nc)',
    'prel_g[0-3]',
    'prel_g[0-2]_nc',
    'got',
    'pg_hi21(_nc)?',
    'got_lo12',
    'gotpage_lo15',
    'gotoff_lo15',
    'gotoff_g0_nc',
    'gotoff_g1',
    'tlsgd(_lo12|_g0_nc|_g1)?',
    'tlsdesc(_lo12)?',
    'tlsdesc_off_(g0_nc|g1)',
    'tlsldm(_lo12_nc)?',
    'dtprel_(g[0-2]|g[01]_nc|hi12|lo12(_nc)?)',
    'gottprel(_lo12|_g1|_g0_nc)?',
    'tprel_(g[0-2]|g[01]_nc|hi12|lo12(_nc)?)',
    'secrel_(lo12|hi12)',
    'got_auth(_lo12)?',
    'tlsdesc_auth(_lo12)?',
  ],
  aarch32: ['(lower|upper)16', '(lower|upper)(0_7|8_15)'],
};

const SHIFT_WORD = /lsl|lsr|asr|ror|asl|msl|mul/i;
const EXTEND_WORD = /[us]xt[bhwx]/i;
const A32_EXTEND_WORD = /rrx/i;

const ROLES = [
  {
    name: 'first_label',
    labels: [1],
    words: ['bl?', `b\\.(${CONDITIONS})`, `bc\\.(${CONDITIONS})`, `b(${CONDITIONS})`],
    aarch32Words: [`bl(${CONDITIONS})`, `b(${CONDITIONS})?\\.[wn]`, 'pld', 'pli', 'bfl?x'],
  },
  { name: 'first_two_labels', labels: [1, 2], aarch32Words: ['bfl?'] },
  {
    name: 'second_label',
    labels: [2],
    words: ['cbn?z', 'adrp?', 'ldr', 'ldrsw', 'prfm', 'movz', 'movk', 'movn'],
    aarch32Words: [
      'cbn?z\\.n',
      `adr((${CONDITIONS})(\\.[wn])?|\\.[wn])`,
      'adrl',
      `(ldrb|ldrh|ldrsb|ldrsh|vldr)(${CONDITIONS})?(\\.[wn])?`,
      `ldr((${CONDITIONS})(\\.[wn])?|\\.[wn])`,
      `ldr(${CONDITIONS})(b|h|sb|sh)`,
      'letp',
    ],
  },
  { name: 'label_after_optional_first', labels: [2], optional: 1, aarch32ConditionWords: ['le'] },
  {
    name: 'third_label',
    labels: [3],
    words: ['tbn?z', `cb[bh]?(${COMPARE_CONDITIONS})`],
    aarch32Words: ['wls', 'wlstp\\.(8|16|32|64)'],
  },
  {
    name: 'label_after_optional_second',
    labels: [3],
    optional: 2,
    aarch32Words: [`ldrd(${CONDITIONS})?`],
  },
  { name: 'labels_then_condition', labels: [1, 2, 3], conditions: [4], aarch32Words: ['bfcsel'] },
  {
    name: 'first_condition',
    conditions: [1],
    aarch32Words: ['it[te]{0,3}', 'vpt[te]{0,3}(\\.[a-z0-9]+)?', 'vcmp(\\.[a-z0-9]+)?'],
  },
  { name: 'second_condition', conditions: [2], words: ['csetm?'] },
  { name: 'third_condition', conditions: [3], words: ['cinc', 'cinv', 'cneg'] },
  {
    name: 'fourth_condition',
    conditions: [4],
    words: ['csel', 'csinc', 'csinv', 'csneg', 'ccmp', 'ccmn', 'fcsel', 'fccmpe?'],
  },
];

function keyword(rule) {
  return token(prec(KEYWORD_PRECEDENCE, rule));
}

function pattern(alternatives) {
  return new RegExp(alternatives.join('|'), 'i');
}

function separated($, step) {
  return choice(seq(',', choice(step, $._missing_operand)), seq($._blank, step));
}

function roleSlot(role, index, $) {
  if (role.labels?.includes(index)) {
    return $._label_operand;
  }
  if (role.conditions?.includes(index)) {
    return $._condition_operand;
  }
  return $._role_operand;
}

function roleLast(role) {
  return Math.max(...(role.labels ?? []), ...(role.conditions ?? []));
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

function roleInstruction(role, tokens) {
  return ($) =>
    seq(
      field('mnemonic', choice(...tokens.map((name) => alias($[name], $.mnemonic)))),
      optional(roleStep(role, 1, $)),
    );
}

function roleRules(role, words, conditionWords) {
  const rules = {};
  if (words.length > 0) {
    rules[`_${role.name}_word`] = () => keyword(pattern(words));
  }
  if (conditionWords.length > 0) {
    rules[`_${role.name}_condition_word`] = () => keyword(pattern(conditionWords));
  }
  for (let index = 1; index < roleLast(role); index++) {
    rules[`_${role.name}_after_${index}`] = ($) => separated($, roleStep(role, index + 1, $));
  }
  return rules;
}

function roleTokens(role, words, conditionWords) {
  return [
    ...(words.length > 0 ? [`_${role.name}_word`] : []),
    ...(conditionWords.length > 0 ? [`_${role.name}_condition_word`] : []),
  ];
}

function nameExcept(words) {
  const next = new Map();
  for (const word of words.filter((word) => word !== '')) {
    next.set(word[0], [...(next.get(word[0]) ?? []), word.slice(1)]);
  }
  const free = [...NAME_CHARACTERS].filter((character) => !next.has(character.toLowerCase()));
  const branches = [
    `[${free.join('')}][${NAME_CHARACTERS}]*`,
    ...[...next].map(([character, rests]) =>
      `[${character}${character.toUpperCase()}](${nameExcept(rests)})`
    ),
  ];
  return words.includes('') ? branches.join('|') : `(${branches.join('|')})?`;
}

function appleLocal(keywords) {
  const words = keywords.filter((word) => /^l/i.test(word));
  for (const word of words) {
    if (!/^[a-z0-9_]+$/.test(word)) {
      throw new Error(`ARM keyword "${word}" starts with l but is not a plain word`);
    }
  }
  return new RegExp(`L(${nameExcept(words.map((word) => word.slice(1)))})`);
}

module.exports = (ctx) => {
  const aarch32 = AARCH32.includes(ctx.dialect);
  const gnu = GNU_AS.includes(ctx.dialect);
  const dollarLabels = DOLLAR_LABELS.includes(ctx.dialect);
  const positionalArguments = POSITIONAL_MACRO_ARGUMENTS.includes(ctx.dialect);
  const appleLocals = APPLE_LOCALS.includes(ctx.dialect);
  const linkerHints = LINKER_HINTS.includes(ctx.dialect);
  const suffixRelocations = gnu && aarch32;
  const registers = [
    ...REGISTERS.aarch64,
    ...(gnu ? REGISTERS.gnuAarch64 : []),
    ...(aarch32 ? REGISTERS.aarch32 : []),
    ...(aarch32 && gnu ? REGISTERS.gnuAarch32 : []),
  ];
  const relocations = gnu ? [...RELOCATIONS.aarch64, ...(aarch32 ? RELOCATIONS.aarch32 : [])] : [];
  const roles = ROLES.map((role) => {
    const words = [...(role.words ?? []), ...(aarch32 ? role.aarch32Words ?? [] : [])];
    const conditionWords = aarch32 ? role.aarch32ConditionWords ?? [] : [];
    return { role, words, conditionWords, tokens: roleTokens(role, words, conditionWords) };
  }).filter(({ tokens }) => tokens.length > 0);
  const roleConditionWords = roles.flatMap(({ conditionWords }) => conditionWords);
  const conditions = CONDITIONS.split('|').filter((word) => !roleConditionWords.includes(word));
  const conditionTokens = roles.filter(({ conditionWords }) => conditionWords.length > 0)
    .map(({ role }) => `_${role.name}_condition_word`);
  const extendWords = aarch32 ? [EXTEND_WORD.source, A32_EXTEND_WORD.source] : [EXTEND_WORD.source];
  const roleTokenNames = roles.flatMap(({ tokens }) => tokens);
  const keywords = [
    ...registers,
    ...CONDITIONS.split('|'),
    ...SHIFT_WORD.source.split('|'),
    ...extendWords,
    ...roles.flatMap(({ words, conditionWords }) => [...words, ...conditionWords]),
  ];

  return {
    word: ($) => $.identifier,
    rules: {
      _arm_register: () => keyword(pattern(registers)),
      condition: () => keyword(pattern(conditions)),
      _shift_word: () => keyword(SHIFT_WORD),
      _extend_word: () => keyword(pattern(extendWords)),
      predicate: ($) =>
        prec(
          1,
          seq(
            field('register', alias($._arm_register, $.register)),
            '/',
            field('qualifier', alias($._predicate_qualifier, $.identifier)),
          ),
        ),
      _predicate_qualifier: () => keyword(/[zm]/i),
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
          $.identifier,
          $.macro_argument,
          $.concatenation,
          ...(positionalArguments ? [alias($._darwin_argument, $.macro_argument)] : []),
        ),
      writeback: ($) => prec(1, seq(field('register', $._register_name), '!')),
      indexed_register: ($) =>
        prec(
          1,
          seq(
            field('register', $._register_name),
            '[',
            field('index', $._index),
            repeat(seq(',', field('index', $._index))),
            choice(']', $._unclosed_bracket),
          ),
        ),
      _index: ($) => choice(alias($._arm_register, $.register), $.index_range, $._expression),
      index_range: ($) => seq(field('start', $._expression), ':', field('end', $._expression)),
      memory_operand: ($) =>
        prec.right(seq(
          '[',
          choice(field('operand', $._memory_element), $._missing_operand),
          optional(field('alignment', $.alignment)),
          repeat(seq(',', choice(field('operand', $._memory_element), $._missing_operand))),
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
      alignment: ($) => seq(':', field('value', $.integer)),
      register_list: ($) =>
        prec.right(seq(
          '{',
          choice(field('element', $._list_element), $._missing_operand),
          repeat(seq(',', choice(field('element', $._list_element), $._missing_operand))),
          choice('}', $._unclosed_brace),
          optional(seq('[', field('index', $._expression), choice(']', $._unclosed_bracket))),
          optional('^'),
        )),
      _list_element: ($) => choice($._register_name, $.indexed_register, $.register_range),
      register_range: ($) =>
        seq(
          field('start', $._register_name),
          '-',
          choice(field('end', $._register_name), $._missing_operand),
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
            $._missing_operand,
          ),
        ),
      literal_pool: ($) => seq('=', field('value', $._expression)),
      _label_operand: ($) => choice($._value, $.memory_operand, $.literal_pool),
      _role_concatenation: ($) =>
        seq(choice(...roleTokenNames.map((name) => alias($[name], $.identifier))), $._glued_pieces),
      _condition_operand: ($) =>
        choice(
          $.condition,
          ...conditionTokens.map((name) => alias($[name], $.condition)),
          $._instruction_operand,
        ),
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
                seq(',', choice(field('argument', $._register_argument), $._missing_operand)),
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
                      repeat(seq(',', choice(field('argument', $._symbol), $._missing_operand))),
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
                '(',
                choice(
                  field('specifier', alias($._suffix_relocation_name, $.identifier)),
                  $._missing_expression,
                ),
                choice(')', $._unclosed),
              ),
            ),
        }
        : {}),
      ...(relocations.length > 0
        ? {
          _relocation_operator: ($) =>
            prec.right(
              seq(
                ':',
                choice(
                  seq(
                    field('specifier', alias($._relocation_name, $.identifier)),
                    choice(seq(':', field('value', $._expression)), $._missing_expression),
                  ),
                  $._missing_expression,
                ),
              ),
            ),
          _relocation_name: () => keyword(pattern(relocations)),
        }
        : {}),
      ...(appleLocals ? { _apple_local: () => token(prec(1, appleLocal(keywords))) } : {}),
      _role_operand: ($) => $._instruction_operand,
      ...(roles.some(({ role }) => role.optional !== undefined)
        ? {
          _final_label: ($) => choice(alias($._arm_register, $.identifier), $._label_operand),
        }
        : {}),
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
            seq($._blank, field('operand', $._role_operand)),
          ),
        ),
      ...Object.assign(
        {},
        ...roles.map(({ role, words, conditionWords }) => roleRules(role, words, conditionWords)),
      ),
    },
    choices: {
      instruction: roles.map(({ role, tokens }) => roleInstruction(role, tokens)),
      _statement: [
        ($) => $.register_alias,
        ($) => alias($._register_directive, $.directive),
        ...(linkerHints ? [($) => alias($._linker_hint, $.directive)] : []),
      ],
      immediate: [
        ($) => seq(alias($._hash, '#'), field('value', $._expression)),
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
      _defined_name: roleTokenNames.map((name) => ($) => alias($[name], $.identifier)),
      _mnemonic: [
        ($) => alias($._role_concatenation, $.concatenation),
        ...(appleLocals ? [($) => alias($._apple_local, $.mnemonic)] : []),
      ],
      ...(positionalArguments
        ? { _glue_head: [($) => alias($._darwin_argument, $.macro_argument)] }
        : {}),
      _expression: [
        ($) => alias($._shift_word, $.identifier),
        ...(relocations.length > 0 ? [($) => alias($._relocation_operator, $.relocation)] : []),
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
