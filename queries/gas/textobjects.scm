(macro_definition
  body: (_
    .
    (_) @class.inside
    (_)? @class.inside
    .)) @class.around

(block_comment) @comment.around

(preproc_comment) @comment.around
