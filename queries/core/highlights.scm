; SPDX-License-Identifier: MIT

(identifier) @constant

(mnemonic) @keyword

(label
    name: (identifier) @function.definition)

(local_identifier) @label

(integer) @number

(string) @string

(escape_sequence) @string.escape

(line_comment) @comment

[
    "+"
    "-"
    "*"
    "/"
    "%"
    "<<"
    ">>"
    "&"
    "|"
    "^"
    "~"
    "!"
    "&&"
    "||"
    "=="
    "!="
    "<>"
    "<"
    "<="
    ">"
    ">="
] @operator

[
    "("
    ")"
] @punctuation.bracket

[
    ","
    ":"
] @punctuation.delimiter
