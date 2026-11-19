# Performance

## Cost

`bun run bench` measures each grammar on two inputs of about 600 KB, with tree-sitter 0.27 and the
median of seven runs. `basics` is compiler-style functions. `fixtures` is every fixture of the
grammar joined, with `.att_syntax` after each x86 fixture, because every fixture starts in AT&T
mode. Times are milliseconds for the whole file and depend on the machine. Zed runs most queries on
the visible rows only.

| Grammar         | Input    | Parse | Edit | brackets | highlights | indents | injections | outline | overrides | textobjects | States | parser.c (MB) |
| --------------- | -------- | ----- | ---- | -------- | ---------- | ------- | ---------- | ------- | --------- | ----------- | ------ | ------------- |
| `asm_auto`      | basics   | 57.7  | 2.1  | 21.9     | 33.4       | 27.5    | 21.8       | 25.5    | 22.6      | 24.7        | 6469   | 6.9           |
| `asm_auto`      | fixtures | 88.0  | 1.3  | 38.1     | 50.8       | 44.3    | 35.9       | 41.1    | 37.0      | 39.4        | 6469   | 6.9           |
| `asm_arm`       | basics   | 54.0  | 1.5  | 20.4     | 30.2       | 24.9    | 20.1       | 23.3    | 20.6      | 21.9        | 2819   | 3.0           |
| `asm_arm`       | fixtures | 91.7  | 1.2  | 40.2     | 53.4       | 46.4    | 37.7       | 42.6    | 39.2      | 41.3        | 2819   | 3.0           |
| `asm_arm_apple` | basics   | 53.1  | 2.4  | 20.6     | 30.8       | 25.4    | 20.5       | 23.8    | 21.2      | 22.7        | 2730   | 2.9           |
| `asm_arm_apple` | fixtures | 84.4  | 1.2  | 36.7     | 48.9       | 43.2    | 34.5       | 39.9    | 35.7      | 38.5        | 2730   | 2.9           |
| `asm_x86_gas`   | basics   | 59.4  | 2.1  | 22.9     | 34.0       | 28.2    | 22.4       | 26.0    | 23.2      | 24.9        | 4146   | 4.4           |
| `asm_x86_gas`   | fixtures | 86.2  | 1.3  | 37.0     | 49.2       | 42.5    | 35.1       | 40.8    | 36.4      | 38.5        | 4146   | 4.4           |
| `asm_x86_nasm`  | basics   | 78.2  | 4.6  | 22.9     | 31.6       | 28.1    | -          | 24.2    | 23.3      | 25.1        | 4543   | 6.3           |
| `asm_x86_nasm`  | fixtures | 123.0 | 2.6  | 39.9     | 52.1       | 47.1    | -          | 42.3    | 38.6      | 42.6        | 4543   | 6.3           |

Edit is a one-character edit and its reparse. `check:budgets` holds the parse cost in CI
([checks.md](checks.md#budgets)).

## Edits

Every function is one `label_block`, which tree-sitter reuses whole after an edit. A label block is
reused whole only if its label was read in a parse state that lexes the same tokens as the state the
parser is in when it meets the block again. The label is read at a statement start inside the block
before it, so statements and label blocks form one list, and the state after a block takes what a
statement start takes. An edit lexes the same 2 to 7 tokens whatever the size of the file, which
`test/performance/performance.test.ts` checks at two sizes.

The generator keeps the ambiguity of a `repeat` in the parse table as a second action the runtime
never takes. The runtime never reuses whole a node reduced beside a second action. After an edit it
walks a list one element at a time, through the statements outside label blocks, the label blocks
and the statements of the edited block, at about 0.5 microseconds an element.

## Rules

These rules keep the parse and edit cost down:

- No grammar declares a word token ([arm.md](arm.md#keywords)).
- Each statement and the newline or `;` after it form one node. After an edit tree-sitter reuses a
  node only if its first token was read in the same parse state as before. A node that starts with
  its statement meets that, and one that starts with a newline does not, because that newline was
  read in the middle of the statement before it.
- The end of the file is a terminator token, not an optional last line without one. Every statement
  then has one context, and a label cannot follow a statement (`nop main:`).
- Rules that only name a choice (`_line_content`, `_statement`, `_mnemonic`, `_operand`, `_value`,
  `_symbol`) are inlined. `_mnemonic` alone saves a node per instruction.
- A block's header is a rule of its own. tree-sitter turns every `optional` and `choice` in a rule
  into separate productions, and a body after an inline header is copied for each header shape.
- Every kind of block has its own closer, so `.endif` cannot close a macro. Headers end like any
  statement, so their expressions share the states of instruction operands, and all blocks share one
  body rule.
- Local labels are a node, so the queries run no regular expression per label.
- A missing expression is one more alternative of `_expression`, which lets every operator, `(`, `#`
  and `$` share one parse state for it.
- A run of C calls before an operand is one hidden rule, and a plain operand stays inline. The call
  forms of typed slots are two hidden rules shared by every instruction with typed slots.
- Text objects capture only the first and the last child of a function or macro body
  (`. (_) @function.inside (_)? @function.inside .`). Zed joins the captures of one match into one
  range, the same range that capturing every child gives. `(_)* @function.inside` keeps a
  tree-sitter candidate per child.
- A pp-number is a number token followed by glued text, which keeps the lexers small.
- The instruction word is a scanner token, because it tells `movl` from a macro call such as
  `SAVE_ALL`. tree-sitter allocates every token an external scanner returns on the heap.

The scanner rules:

- The state serializes to zero bytes while it holds its initial values
  ([scanner.md](scanner.md#state)), so no token before the first mode line, open call or end of
  input stores state.
- The scanner reads past a line end only across a join, through a `/*` comment, and inside a C macro
  call, where it reads the first character after the line end and its blanks.
- It asks for the column only where a directive must start its line, for a `#` at a statement start
  in GNU syntax and a `%` word in NASM, and at a join, to know whether only blanks precede it on its
  line. It never asks during error recovery.
- It reads a word once and looks it up once in its language's dictionary
  ([scanner.md](scanner.md#generated-tables)). One hash, two reads and one compare give every role
  the word has, and the entry is passed to each check that needs it.
- A word is looked up only where a check applies to it. ARM (Apple), which has no suffix relocations
  and no x86 registers, reads no word after a `(`.

## Limits

- Error recovery is slower than parsing valid code, 0.4 to 2 MB/s on garbage against about 10 MB/s,
  and stays linear. It is slowest in NASM, whose identifiers may start with `?` or `$` and contain
  `#`, `@`, `~` and `$`, so recovery finds plausible statement starts inside garbage.
- The `gc` comment object, `(line_comment)+ @comment.around`, costs the square of one uninterrupted
  run of comment lines, about 2 ms for 1,000 lines and 0.2 s for 10,000, also in the narrow range
  Zed queries around the cursor. The comment token is per line.
- tree-sitter generate turns off optimization for `parser.c` (`#pragma GCC optimize ("O0")` and its
  clang and MSVC forms) when the main lexer has more than 300 states. The GNU-syntax lexers stay
  below that, and x86 (NASM) has 415 lexer states and compiles under the pragma.

The indents query is linear. Each `body` is one node that a pattern matches alone, and tree-sitter
keeps no candidate open while it walks the lines inside a block.
