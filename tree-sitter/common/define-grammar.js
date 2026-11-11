// SPDX-License-Identifier: MIT

const { languages } = require('../../languages.config.cjs');
const { joinTolerant } = require('./joins.js');
const { INSTRUCTION_TOKENS } = require('./roles.js');
const lexical = require('./lexical.js');

const MODULES = {
  core: require('./core.js'),
  gas: require('./syntax/gas.js'),
  nasm: require('./syntax/nasm.js'),
  arm: require('./arch/arm.js'),
  x86: require('./arch/x86.js'),
  'x86.gas': require('./arch/x86.gas.js'),
  'x86.nasm': require('./arch/x86.nasm.js'),
};

const EXTERNALS = [
  'line_comment',
  'preproc_directive',
  '_hash',
  '_at_attached',
  '_type_mark',
  '_separator',
  '_string_content',
  'preproc_argument',
  '_bracket_argument',
  '_raw_word',
  '_trailing_argument',
  '_preproc_line_end',
  '_preproc_include',
  '_header_name',
  '_preproc_define',
  '_preproc_set',
  '_preproc_assign',
  '_preproc_macro',
  '_preproc_condition',
  '_preproc_params_open',
  '_missing_operand',
  '_missing_label_operand',
  '_missing_argument',
  '_missing_register_argument',
  '_missing_element',
  '_missing_expression',
  '_missing_name',
  '_missing_identifier',
  '_missing_symbol',
  '_missing_relocation',
  '_unclosed',
  '_unclosed_bracket',
  '_unclosed_index',
  '_unclosed_brace',
  '_unclosed_memory',
  '_unclosed_address',
  '_unclosed_arguments',
  '_global_label_name',
  '_local_label_name',
  '_numeric_label_name',
  '_dollar_label_name',
  '_dollar_label',
  '_darwin_argument',
  '_glued_argument',
  '_glued_separator',
  '_glued_text',
  '_glued_local',
  '_glued_context',
  '_glued_expansion',
  '_blank',
  '_prefix_word',
  '_prefix_semicolon',
  '_macro_open',
  '_if_open',
  '_if_macro_open',
  '_if_raw_open',
  '_rept_open',
  '_irp_open',
  '_irpc_open',
  '_struc_open',
  '_istruc_open',
  '_blank_separated_directive',
  '_float_data_directive',
  '_float_space_directive',
  '_cfi_register_directive',
  '_unwind_register_directive',
  '_linker_hint_directive',
  '_suffix_relocation_name',
  '_relocation_specifier',
  '_relocation_name',
  '_relocation_colon',
  '_register_alias_word',
  '_neon_alias_word',
  '_intel_syntax',
  '_att_syntax',
  '_syntax_prefix',
  '_syntax_noprefix',
  '_register',
  '_arm_register',
  '_system_register',
  '_condition',
  '_shift_word',
  '_extend_word',
  '_predicate_qualifier',
  '_section_type_word',
  '_remainder',
  '_intel_operands',
  '_intel_type_word',
  '_intel_ptr_word',
  '_intel_unary_word',
  '_intel_multiplicative_word',
  '_intel_bitwise_word',
  '_intel_comparison_word',
  '_call_arguments',
  '_macro_label_name',
  '_statement_call',
  '_brace_open',
  '_operand_gap',
  '_reference_colon',
  '_preproc_function',
  '_list_open',
  '_index_open',
  '_memory_comma',
  '_bracket_colon',
  '_segment_colon',
  '_range_dash',
  '_relocation_suffix',
  '_memory_address',
  '_pseudo_prefix',
  'decorator',
  '_macro_close',
  '_conditional_close',
  '_repeat_close',
  '_struc_close',
  '_istruc_close',
  '_elseif',
  '_elseif_macro',
  '_elseif_raw',
  '_else',
  '_block_end',
  '_end',
  '_strict_word',
  '_address_word',
  '_absolute_word',
  '_wrt_word',
  '_to_word',
  'special_symbol',
  '_generic_directive',
  '_section_directive',
  '_declaration_directive',
  '_common_directive',
  '_bracket_directive',
  '_data_directive',
  '_align_directive',
  '_use_directive',
  '_times',
  '_equ',
  '_at_word',
  '_alignment_colon',
  '_dup_word',
  '_float_special',
  '_float_operator_word',
  '_memory_open_word',
  '_list_word',
  '_conditional_question',
  '_conditional_colon',
  'uninitialized',
  '_argument_reference',
  'macro_local',
  'context_local',
  'macro_expansion',
  ...INSTRUCTION_TOKENS,
  '_macro_name',
  '_stray',
  '_error_sentinel',
];

const INLINED = [
  '_line_content',
  '_statement',
  '_instruction_operand',
  '_operands',
  '_operand',
  '_value',
  '_symbol',
  '_name',
  '_macro_token',
  '_macro_leaf',
  '_call_name',
  '_preproc_parameter_list',
  '_defined_name',
  '_glue_head',
  '_mnemonic',
  '_instruction_body',
  '_plain_att_operand',
  '_plain_intel_operand',
  '_segment_name',
  '_memory_inside',
  '_bracket_inside',
  '_keyword_name',
  '_keyword_value',
  '_macro_end',
  '_else_header',
  '_conditional_clauses',
  '_open_clauses',
  '_conditional_end',
  '_repeat_end',
  '_glued_piece',
];

module.exports = function defineGrammar(grammarName, catalog = languages) {
  const language = catalog.find((candidate) => candidate.grammar === grammarName);
  if (!language) {
    throw new Error(`languages.config.cjs declares no language with grammar "${grammarName}"`);
  }

  const moduleNames = [
    'core',
    language.syntax,
    ...language.archs,
    ...language.archs
      .map((arch) => `${arch}.${language.syntax}`)
      .filter((name) => Object.hasOwn(MODULES, name)),
  ];
  for (const moduleName of moduleNames) {
    if (!Object.hasOwn(MODULES, moduleName)) {
      throw new Error(`unknown module "${moduleName}" for grammar "${grammarName}"`);
    }
  }

  const ctx = {
    syntax: language.syntax,
    archs: language.archs,
    dialect: language.dialect,
    lexical: lexical[language.syntax],
  };
  const rules = {};
  const choices = {};
  const extras = [];
  const conflicts = [];

  for (const moduleName of moduleNames) {
    const fragment = MODULES[moduleName](ctx);
    for (const [name, rule] of Object.entries(fragment.rules ?? {})) {
      if (name in rules) {
        throw new Error(`rule "${name}" is defined twice (again by module "${moduleName}")`);
      }
      rules[name] = rule;
    }
    for (const [name, alternatives] of Object.entries(fragment.choices ?? {})) {
      (choices[name] ??= []).push(...alternatives);
    }
    extras.push(...(fragment.extras ?? []));
    conflicts.push(...(fragment.conflicts ?? []));
  }

  for (const [name, alternatives] of Object.entries(choices)) {
    if (name in rules) {
      throw new Error(`"${name}" is both a rule and a choice point`);
    }
    rules[name] = ($) => choice(...unique(alternatives.map((alternative) => alternative($))));
  }

  if (ctx.lexical.lineJoins) {
    for (const [name, rule] of Object.entries(rules)) {
      rules[name] = ($) => joinTolerant(rule($));
    }
  }

  return grammar({
    name: grammarName,
    externals: ($) => EXTERNALS.map((name) => $[name]),
    extras: ($) => extras.map((extra) => extra($)),
    conflicts: ($) => unique(conflicts.map((conflict) => conflict($))),
    inline: ($) => INLINED.filter((name) => name in rules).map((name) => $[name]),
    rules,
  });
};

function unique(alternatives) {
  const seen = new Set();
  return alternatives.filter((rule) => {
    const key = rule instanceof RegExp ? `/${rule.source}/${rule.flags}` : JSON.stringify(rule);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
