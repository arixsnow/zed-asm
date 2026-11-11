; SPDX-License-Identifier: MIT

(macro_definition
  "%macro" @context
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

(label
  name: (macro_call) @name) @item

(assignment
  name: [
    (identifier)
    (local_identifier)
  ] @name) @item

(structure
  "struc" @context
  name: (_) @name) @item

(structure_body
  (label
    name: (identifier) @name) @item)
