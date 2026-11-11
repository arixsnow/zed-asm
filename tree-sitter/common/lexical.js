// SPDX-License-Identifier: MIT

const BLANK = '[ \\t\\f\\v\\r]';
const GAS_NAME = '[A-Za-z0-9_.$]';
const GAS_NAME_START = '[A-Za-z_]';
const GAS_IDENTIFIER = `${GAS_NAME_START}${GAS_NAME}*`;
const GAS_DOT_NAME = `\\.${GAS_NAME}+`;
const GAS_MACRO_ARGUMENT = '\\\\(\\.?[A-Za-z_][A-Za-z0-9_.$]*|@|\\+)';
const GAS_QUOTED_NAME = '"(?:[^"\\\\]|\\\\.)*"';
const GAS_INTEGER_DIGITS = '(0[xX][0-9a-fA-F]+|0[bB][01]+|[0-9]+)';
const GAS_INTEGER_SUFFIX = '([uU][lL]{0,2}|[lL]{1,2}[uU]?)?';
const CLANG_INTEGER_SUFFIX = '[uU]?[lL]{0,2}';
const NASM_NAME = '[A-Za-z0-9_$#@~.?]';
const NASM_NAME_START = '[A-Za-z_@]';
const NASM_PLAIN_NAME = `${NASM_NAME_START}${NASM_NAME}*`;
const NASM_QUESTION_NAME = `\\?${NASM_NAME}+`;
const NASM_ESCAPED_NAME = `\\$(?:${NASM_PLAIN_NAME}|${NASM_QUESTION_NAME}|\\$${NASM_NAME}+)`;
const NASM_IDENTIFIER = `${NASM_PLAIN_NAME}|${NASM_QUESTION_NAME}|${NASM_ESCAPED_NAME}`;
const NASM_DOT_IDENTIFIER = `\\$?\\.${NASM_NAME}*`;
const NASM_DIGIT_NAME = `\\$[0-9]${NASM_NAME}*`;
const NASM_CONTEXT_START = '[A-Za-z0-9_#@~.?]';
const NASM_EXPONENT = '[eE][+-]?[0-9_]*';
const NASM_BINARY_EXPONENT = '[pP][+-]?[0-9][0-9_]*';
const LABEL_PARENTHESES_DEPTH = 8;

function parentheses(depth) {
    const inner = depth === 1 ? '[^()]' : `(?:[^()]|${parentheses(depth - 1)})`;
    return `\\(${inner}*\\)`;
}

function nasmRadixFloats(prefix, digit) {
    return [
        `${prefix}(${digit}+\\.${digit}*|\\.${digit}+)(${NASM_BINARY_EXPONENT})?`,
        `${prefix}${digit}+${NASM_BINARY_EXPONENT}`,
    ];
}

module.exports = {
    gas: {
        nameCharacter: new RegExp(GAS_NAME),
        identifier: new RegExp(GAS_IDENTIFIER),
        dotIdentifier: new RegExp(GAS_DOT_NAME),
        localIdentifier: new RegExp(`\\.L${GAS_NAME}*`),
        integer: new RegExp(`${GAS_INTEGER_DIGITS}${GAS_INTEGER_SUFFIX}`),
        clangInteger: new RegExp(`${GAS_INTEGER_DIGITS}${CLANG_INTEGER_SUFFIX}`),
        numericLabel: /[0-9]+[bf]/,
        float: new RegExp(
            [
                '[0-9]+\\.[0-9]*([eE][+-]?[0-9]+)?',
                '[0-9]+[eE][+-]?[0-9]+',
                '0[fFdDeErRsShHpP][+-]?([0-9]+\\.?[0-9]*|\\.[0-9]+)([eE][+-]?[0-9]+)?',
                '0[xXbB][+-]?([0-9]+\\.[0-9]*|\\.[0-9]+)([eE][+-]?[0-9]+)?',
                '0[xX]([0-9a-fA-F]+\\.?[0-9a-fA-F]*|\\.[0-9a-fA-F]+)[pP][+-]?[0-9]+',
            ].join('|'),
        ),
        dotFloat: /\.[0-9]+([eE][+-]?[0-9]+)?/,
        escapedQuote: '"',
        escape: /[0-7]{1,3}|[xX][0-9a-fA-F]+|[^0-7xX\n]/,
        macroArgument: new RegExp(GAS_MACRO_ARGUMENT),
        nameStart: new RegExp(GAS_NAME_START),
        labelName: ({ dollarLabels = false, name = GAS_IDENTIFIER } = {}) => {
            const word = [
                name,
                GAS_DOT_NAME,
                dollarLabels ? '[0-9]+\\$?' : '[0-9]+',
                GAS_QUOTED_NAME,
            ];
            const head = [name, GAS_DOT_NAME, GAS_MACRO_ARGUMENT];
            const piece = [GAS_MACRO_ARGUMENT, '\\\\\\(\\)', `${GAS_NAME}+`];
            return new RegExp(
                [
                    `(?:${word.join('|')})(?:${BLANK}*${parentheses(LABEL_PARENTHESES_DEPTH)})?`,
                    `(?:${head.join('|')})(?:${piece.join('|')})*`,
                ].join('|'),
            );
        },
    },
    nasm: {
        lineJoins: true,
        nameCharacter: new RegExp(NASM_NAME),
        identifier: new RegExp(NASM_IDENTIFIER),
        digitName: new RegExp(NASM_DIGIT_NAME),
        dotIdentifier: new RegExp(NASM_DOT_IDENTIFIER),
        nameStart: new RegExp(NASM_NAME_START),
        labelName: ({ name = NASM_PLAIN_NAME } = {}) =>
            new RegExp(
                [
                    NASM_ESCAPED_NAME,
                    NASM_DIGIT_NAME,
                    name,
                    NASM_QUESTION_NAME,
                    NASM_DOT_IDENTIFIER,
                    `%%${NASM_NAME}+`,
                    `%\\$+${NASM_CONTEXT_START}${NASM_NAME}*`,
                ].join('|'),
            ),
        escapedQuote: '`',
        escape:
            /[0-7]{1,3}|x[0-9a-fA-F]{0,2}|u[0-9a-fA-F]{0,4}|U[0-9a-fA-F]{0,8}|\^[^\n]?|[^0-7xuU\n]/,
        integer: new RegExp(
            [
                '0[xXhH][0-9a-fA-F_]+',
                '[0-9][0-9a-fA-F_]*[hHxX]',
                '\\$[0-9][0-9a-fA-F_]*',
                '0[oOqQ][0-7_]+',
                '[0-7][0-7_]*[oOqQ]',
                '0[bByY][01_]+',
                '[01][01_]*[bByY]',
                '0[dDtT][0-9_]+',
                '[0-9][0-9_]*[dDtT]',
                '[0-9][0-9_]*',
            ].join('|'),
        ),
        float: new RegExp(
            [
                `[0-9][0-9_]*\\.[0-9_]*(${NASM_EXPONENT})?`,
                `[0-9][0-9_]*${NASM_EXPONENT}`,
                `0[dDtT]([0-9_]+\\.[0-9_]*|\\.[0-9_]+)(${NASM_EXPONENT})?`,
                `0[dDtT][0-9_]+${NASM_EXPONENT}`,
                ...nasmRadixFloats('0[xXhH]', '[0-9a-fA-F_]'),
                `\\$[0-9][0-9a-fA-F_]*\\.[0-9a-fA-F_]*(${NASM_BINARY_EXPONENT})?`,
                `\\$[0-9][0-9a-fA-F_]*${NASM_BINARY_EXPONENT}`,
                ...nasmRadixFloats('0[oOqQ]', '[0-7_]'),
                ...nasmRadixFloats('0[bByY]', '[01_]'),
                '[0-9][0-9_]*[pP]',
                '0[pP][0-9_]+',
            ].join('|'),
        ),
    },
};
