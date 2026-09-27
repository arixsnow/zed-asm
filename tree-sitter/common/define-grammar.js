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
  '_missing_operand',
  '_missing_expression',
  '_unclosed',
  '_error_sentinel',
];

const INLINED = ['_line_content', '_statement', '_operand', '_symbol', '_statement_group'];

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

  const ctx = { syntax: language.syntax, archs: language.archs, lexical: lexical[language.syntax] };
  const rules = {};
  const choices = {};
  const extras = [];

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
    inline: ($) => INLINED.map((name) => $[name]),
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
