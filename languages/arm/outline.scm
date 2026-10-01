(label_block
  label: (label
    name: (_) @name)) @item

(label
  name: (local_identifier) @name) @item

(line_comment) @annotation

(macro_definition
  ".macro" @context
  name: (_) @name) @item

(preproc_define
  directive: (_) @context
  name: (_) @name
  !parameters) @item

(preproc_define
  directive: (_) @context
  name: (_) @name
  parameters: (preproc_params
    "(" @context
    ")" @context)) @item

(assignment
  name: [
    (identifier)
    (local_identifier)
  ] @name) @item

(directive
  name: (directive_name) @context
  .
  argument: [
    (identifier)
    (local_identifier)
  ] @name
  argument: (_)
  (#match? @context "^\\.(?i:equ|set|equiv|eqv)$")) @item

(block_comment) @annotation
