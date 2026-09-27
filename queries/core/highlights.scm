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
