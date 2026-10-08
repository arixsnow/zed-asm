(immediate
  "#" @punctuation.special)

(literal_pool
  "=" @punctuation.special)

(shift_operator) @keyword.operator

(condition) @keyword.operator

(register_alias
  name: (identifier) @variable.special)

(predicate
  "/" @variable.special
  qualifier: (identifier) @variable.special)

[
  "["
  "]"
  "{"
  "}"
] @punctuation.bracket
