(identifier) @constant

(mnemonic) @keyword

(label
  name: (identifier) @function.definition)

(local_identifier) @label

(integer) @number

(string) @string

(line_comment) @comment

[
  "+"
  "-"
  "*"
  "/"
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

(block_comment) @comment

(preproc_comment) @comment

(directive_name) @keyword.directive @preproc

(preproc_directive) @keyword.preproc @preproc

(preproc_define
  name: (identifier) @constant)

(preproc_define
  name: (identifier) @function.special
  parameters: (preproc_params))

(preproc_params
  (identifier) @variable.parameter)

(escape_sequence) @string.escape

(char) @string

(location_counter) @constant.builtin

(symbol_type) @type.builtin

(relocation
  "@" @punctuation.special)

(relocation
  specifier: (identifier) @attribute)

(numeric_label) @label

(float) @number

[
  ".macro"
  ".endm"
  ".if"
  ".elseif"
  ".else"
  ".endif"
  ".rept"
  ".irp"
  ".irpc"
  ".endr"
] @keyword.directive @preproc

(macro_definition
  name: (identifier) @function.special.definition)

(parameter
  name: (identifier) @variable.parameter)

(repeat_block
  parameter: (identifier) @variable.parameter)

(keyword_argument
  name: (identifier) @variable.parameter)

(instruction
  mnemonic: (concatenation
    (identifier) @keyword))

(label
  name: (concatenation
    (identifier) @label))

(macro_argument) @variable.parameter

(concatenation
  "\\()" @punctuation.special)

(directive
  name: (directive_name) @_section
  .
  argument: (identifier) @namespace
  (#match? @_section "^\\.(?i:section|pushsection)$"))

(directive
  name: (directive_name) @_section
  .
  argument: (identifier)
  .
  argument: (identifier) @namespace
  (#match? @_section "^\\.(?i:section|pushsection)$"))

(register) @variable.special

(immediate
  "$" @punctuation.special)

(symbol_type
  (identifier) @type.builtin)

(symbol_type
  "@" @punctuation.special)
