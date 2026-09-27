// SPDX-License-Identifier: MIT

module.exports = {
  gas: {
    identifier: /[A-Za-z_][A-Za-z0-9_.$]*/,
    dotIdentifier: /\.[A-Za-z_][A-Za-z0-9_.$]*/,
    localIdentifier: /\.L[A-Za-z0-9_.$]*/,
    integer: /0[xX][0-9a-fA-F]+|0[bB][01]+|[0-9]+/,
  },
  nasm: {
    identifier: /[A-Za-z_?][A-Za-z0-9_$#@~.?]*/,
    dotIdentifier: /\.\.?[A-Za-z_?@][A-Za-z0-9_$#@~.?]*/,
    integer: /0[xX][0-9a-fA-F_]+|[0-9][0-9a-fA-F_]*[hH]|0[bB][01_]+|[01][01_]*[bByY]|[0-9][0-9_]*/,
  },
};
