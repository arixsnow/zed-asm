; SPDX-License-Identifier: MIT

(immediate
    "$" @punctuation.special)

(symbol_type
    (identifier) @type.builtin)

(symbol_type
    "@" @punctuation.special)

(prefix) @keyword

(operand_type) @keyword

(operator_word) @keyword.operator

(unary_expression
    operator: (operator_word) @keyword
    (#match? @keyword "^(?i:offset|imagerel|short)$"))

(decorator) @attribute
