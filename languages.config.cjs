// SPDX-License-Identifier: MIT

'use strict';

const repository = 'https://github.com/arixsnow/zed-asm';

const extension = {
  id: 'asm',
  name: 'Asm',
  version: '0.1.0',
  description:
    'ARM (GNU/LLVM and Apple) and x86 (AT&T, Intel and NASM) assembly: precise highlighting, label indentation and comment continuation.',
  authors: ['Arka Mondal <arka@arkamondal.net>'],
  license: 'MIT',
  repository,
  grammarRev: '4e407027e1ba8c3585f1bd3e7ca239fe3a5d44cf',
};

const syntaxes = {
  gas: {
    blockComments: true,
    brackets: [
      { start: '{', end: '}', close: true, newline: false },
      { start: '[', end: ']', close: true, newline: false },
      { start: '(', end: ')', close: true, newline: false },
      { start: '"', end: '"', close: true, newline: false, not_in: ['string'] },
      { start: "'", end: "'", close: true, newline: false, not_in: ['string', 'comment'] },
      { start: '/*', end: ' */', close: true, newline: false, not_in: ['string', 'comment'] },
    ],
    labelPattern: '^\\s*(?:[A-Za-z_.][A-Za-z0-9_.$]*|[0-9]+):',
    blocks: [
      { openers: ['macroOpen'], clauses: [], closer: 'MACRO_CLOSE' },
      { openers: ['ifOpen'], clauses: ['elseif', 'else'], closer: 'CONDITIONAL_CLOSE' },
      { openers: ['reptOpen', 'irpOpen', 'irpcOpen'], clauses: [], closer: 'REPEAT_CLOSE' },
    ],
    overrides: { preproc: { line_comments: ['// '] } },
  },
  nasm: {
    blockComments: false,
    brackets: [
      { start: '{', end: '}', close: true, newline: false },
      { start: '[', end: ']', close: true, newline: false },
      { start: '(', end: ')', close: true, newline: false },
      { start: '"', end: '"', close: true, newline: false, not_in: ['string'] },
      { start: '`', end: '`', close: true, newline: false, not_in: ['string'] },
      { start: "'", end: "'", close: true, newline: false, not_in: ['string', 'comment'] },
    ],
    labelPattern: '^\\s*[A-Za-z_.?$@][A-Za-z0-9_$#@~.?]*:',
    blocks: [],
  },
};

const languages = [
  {
    dir: 'asm',
    name: 'Assembly',
    grammar: 'asm_auto',
    dialect: 'AUTO',
    syntax: 'gas',
    archs: ['arm', 'x86'],
    pathSuffixes: ['s', 'S', 'sx'],
    modelineAliases: ['asm', 'gas', 'assembly'],
    lineComments: ['// ', '# ', '@ ', '; '],
    wordCharacters: ['.', '$', '%'],
  },
  {
    dir: 'arm',
    name: 'ARM Assembly',
    grammar: 'asm_arm',
    dialect: 'ARM',
    syntax: 'gas',
    archs: ['arm'],
    pathSuffixes: [],
    modelineAliases: ['arm', 'arm64', 'aarch64', 'aarch32', 'thumb'],
    lineComments: ['// ', '# ', '@ '],
    wordCharacters: ['.', '$', '%'],
  },
  {
    dir: 'arm-apple',
    name: 'ARM Assembly (Apple)',
    grammar: 'asm_arm_apple',
    dialect: 'ARM_APPLE',
    syntax: 'gas',
    archs: ['arm'],
    pathSuffixes: [],
    modelineAliases: ['arm64-apple', 'apple-arm64', 'darwin-arm64'],
    lineComments: ['// ', '# ', '; '],
    wordCharacters: ['.', '$', '%'],
  },
  {
    dir: 'x86-gas',
    name: 'x86 Assembly (GAS)',
    grammar: 'asm_x86_gas',
    dialect: 'X86_GAS',
    syntax: 'gas',
    archs: ['x86'],
    pathSuffixes: [],
    modelineAliases: ['x86', 'x86_64', 'x64', 'amd64', 'i386'],
    lineComments: ['// ', '# '],
    wordCharacters: ['.', '$', '%'],
  },
  {
    dir: 'x86-nasm',
    name: 'x86 Assembly (NASM)',
    grammar: 'asm_x86_nasm',
    dialect: 'X86_NASM',
    syntax: 'nasm',
    archs: ['x86'],
    pathSuffixes: ['asm', 'ASM', 'nasm', 'yasm'],
    modelineAliases: ['nasm', 'yasm'],
    lineComments: ['; '],
    wordCharacters: ['.', '$', '%', '?', '@', '#'],
  },
];

const shared = {
  autoclose_before: ',;)]}',
  debuggers: ['CodeLLDB', 'GDB'],
};

module.exports = { extension, syntaxes, languages, shared };
