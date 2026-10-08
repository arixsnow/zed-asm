// SPDX-License-Identifier: MIT

const { languages } = require('../../languages.config.cjs');
const lexical = require('./lexical');

const MODULES = {
  core: require('./core'),
  gas: require('./syntax/gas'),
  nasm: require('./syntax/nasm'),
  arm: require('./arch/arm'),
  x86: require('./arch/x86'),
};

const EXTERNALS = [
  'line_comment',
  'preproc_directive',
  '_hash',
  '_at_attached',
  '_at_type',
  '_separator',
  '_string_content',
  'preproc_argument',
  '_preproc_line_end',
  '_preproc_include',
  '_header_name',
  '_preproc_define',
  '_preproc_condition',
  '_preproc_params_open',
  '_missing_operand',
  '_missing_expression',
  '_unclosed',
  '_unclosed_bracket',
  '_unclosed_brace',
  '_global_label_name',
  '_local_label_name',
  '_numeric_label_name',
  '_dollar_label_name',
  '_dollar_label',
  '_darwin_argument',
  '_glued_argument',
  '_glued_separator',
  '_glued_text',
  '_blank',
  '_prefix_word',
  '_prefix_semicolon',
  '_macro_open',
  '_if_open',
  '_rept_open',
  '_irp_open',
  '_irpc_open',
  '_blank_separated_directive',
  '_cfi_register_directive',
  '_unwind_register_directive',
  '_linker_hint_directive',
  '_suffix_relocation_name',
  '_register_alias_word',
  '_neon_alias_word',
  '_macro_close',
  '_conditional_close',
  '_repeat_close',
  '_elseif',
  '_else',
  '_block_end',
  '_end',
  '_stray',
  '_error_sentinel',
];

const INLINED = [
  '_line_content',
  '_statement',
  '_instruction_operand',
  '_operand',
  '_value',
  '_symbol',
  '_defined_name',
  '_glue_head',
  '_mnemonic',
];

module.exports = function defineGrammar(grammarName, catalog = languages) {
  const language = catalog.find((candidate) => candidate.grammar === grammarName);
  if (!language) {
    throw new Error(`languages.config.cjs declares no language with grammar "${grammarName}"`);
  }

  const moduleNames = ['core', language.syntax, ...language.archs];
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
  let word;

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
    if (fragment.word !== undefined) {
      if (word !== undefined) {
        throw new Error(`the word token is declared twice (again by module "${moduleName}")`);
      }
      word = fragment.word;
    }
  }

  for (const [name, alternatives] of Object.entries(choices)) {
    if (name in rules) {
      throw new Error(`"${name}" is both a rule and a choice point`);
    }
    rules[name] = ($) => choice(...unique(alternatives.map((alternative) => alternative($))));
  }

  return grammar({
    name: grammarName,
    externals: ($) => EXTERNALS.map((name) => $[name]),
    extras: ($) => extras.map((extra) => extra($)),
    ...(word === undefined ? {} : { word }),
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
