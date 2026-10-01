(label_block
  label: (_)
  .
  (_) @function.inside
  (_)? @function.inside
  .) @function.around

(line_comment)+ @comment.around

(macro_definition
  body: (_
    .
    (_) @class.inside
    (_)? @class.inside
    .)) @class.around

(block_comment) @comment.around

(preproc_comment) @comment.around
