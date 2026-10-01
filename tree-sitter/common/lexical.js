// SPDX-License-Identifier: MIT

const GAS_NAME = '[A-Za-z0-9_.$]';
const NASM_NAME = '[A-Za-z0-9_$#@~.?]';

module.exports = {
  gas: {
    nameCharacter: new RegExp(GAS_NAME),
    identifier: new RegExp(`[A-Za-z_]${GAS_NAME}*`),
    dotIdentifier: new RegExp(`\\.[A-Za-z_]${GAS_NAME}*`),
    localIdentifier: new RegExp(`\\.L${GAS_NAME}*`),
    integer: /0[xX][0-9a-fA-F]+|0[bB][01]+|[0-9]+/,
    numericLabel: /[0-9]+[bf]/,
    float: new RegExp(
      [
        '[0-9]+\\.[0-9]*([eE][+-]?[0-9]+)?',
        '\\.[0-9]+([eE][+-]?[0-9]+)?',
        '[0-9]+[eE][+-]?[0-9]+',
        '0[fFdDeErRsShHpP][+-]?([0-9]+\\.?[0-9]*|\\.[0-9]+)([eE][+-]?[0-9]+)?',
        '0[xXbB][+-]?([0-9]+\\.[0-9]*|\\.[0-9]+)([eE][+-]?[0-9]+)?',
        '0[xX]([0-9a-fA-F]+\\.?[0-9a-fA-F]*|\\.[0-9a-fA-F]+)[pP][+-]?[0-9]+',
      ].join('|'),
    ),
    sizedDataDirective: /\.[248][bB][yY][tT][eE]/,
    blankSeparatedDirective: /\.[lL][oO][cC]|\.[fF][iI][lL][eE]/,
    macroOpen: /\.[mM][aA][cC][rR][oO]/,
    ifOpen:
      /\.[iI][fF]([nN]?[dD][eE][fF]|[nN][oO][tT][dD][eE][fF]|[nN]?[bB]|[nN]?[cC]|[eE][qQ][sS]|[nN][eE][sS]|[eE][qQ]|[nN][eE]|[gG][eE]|[gG][tT]|[lL][eE]|[lL][tT])?/,
    elseif: /\.[eE][lL][sS][eE][iI][fF]/,
    else: /\.[eE][lL][sS][eE]/,
    reptOpen: /\.[rR][eE][pP][tT]/,
    irpOpen: /\.[iI][rR][pP]/,
    irpcOpen: /\.[iI][rR][pP][cC]/,
    macroArgument: /\\([A-Za-z_][A-Za-z0-9_]*|@|\+)/,
  },
  nasm: {
    nameCharacter: new RegExp(NASM_NAME),
    identifier: new RegExp(`\\$?[A-Za-z_?]${NASM_NAME}*`),
    dotIdentifier: new RegExp(`\\$?\\.${NASM_NAME}*`),
    integer: /0[xX][0-9a-fA-F_]+|[0-9][0-9a-fA-F_]*[hH]|0[bB][01_]+|[01][01_]*[bByY]|[0-9][0-9_]*/,
  },
};
