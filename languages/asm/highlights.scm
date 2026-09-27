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

(escape_sequence) @string.escape

(char) @string

(location_counter) @constant.builtin

(symbol_type) @type.builtin

(relocation
  "@" @punctuation.special)

(relocation
  specifier: (identifier) @attribute)

(immediate
  "#" @punctuation.special)

(shift_operator) @keyword.operator

(register) @variable.special

(immediate
  "$" @punctuation.special)

(symbol_type
  (identifier) @type.builtin)

(symbol_type
  "@" @punctuation.special)
