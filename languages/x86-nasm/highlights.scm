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

(directive_name) @keyword.directive @preproc

(preproc_directive) @keyword.preproc @preproc

(operator_word) @keyword.operator

[
  "%macro"
  "%endmacro"
  "%if"
  "%elif"
  "%else"
  "%endif"
  "%rep"
  "%endrep"
  "struc"
  "endstruc"
  "istruc"
  "iend"
  "at"
  "times"
  "equ"
] @keyword.directive @preproc

".nolist" @attribute

(macro_definition
  name: (identifier) @function.special.definition)

(preproc_line
  name: (identifier) @function.special)

(macro_call
  function: (identifier) @function.special)

(macro_reference
  name: (identifier) @function.special)

(label
  name: (concatenation
    (identifier) @function.definition))

(preproc_define
  name: (identifier) @constant)

(preproc_define
  name: (identifier) @function.special
  parameters: (preproc_params))

(preproc_params
  (identifier) @variable.parameter)

(parameter_count) @number

(structure
  name: [
    (identifier)
    (local_identifier)
  ] @type)

(structure_instance
  name: [
    (identifier)
    (local_identifier)
  ] @type)

[
  (macro_argument)
  (macro_local)
  (context_local)
  (macro_expansion)
] @variable.parameter

(keyword_argument
  name: (identifier) @variable.parameter)

(instruction
  mnemonic: (concatenation
    (identifier) @keyword))

(concatenation
  "%+" @punctuation.special)

(register) @variable.special

(float) @number

[
  (location_counter)
  (section_start)
  (uninitialized)
] @constant.builtin

(symbol_type
  (identifier) @type.builtin)

(directive
  name: (directive_name) @_section
  .
  argument: (identifier) @namespace
  (#match? @_section "^(?i:section|segment)$"))

[
  "%%"
  "//"
  "<<<"
  ">>>"
  "<=>"
  "^^"
  "="
  "?"
] @operator

[
  "["
  "]"
  "{"
  "}"
  "%("
] @punctuation.bracket

[
  (prefix)
  (operand_type)
  (address_modifier)
  "wrt"
  "__?masm_ptr?__"
] @keyword

(typed_operand
  type: (identifier) @keyword)

[
  (decorator)
  (special_symbol)
] @attribute
