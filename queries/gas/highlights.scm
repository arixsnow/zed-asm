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
