# Architecture

This repository builds a Zed extension for ARM and x86 assembly. ARM code targets GNU as and clang
on ELF systems, or Apple's clang, which reads `;` as a comment. x86 code is in GNU syntax, AT&T or
Intel flavor, or in NASM syntax, which yasm also reads. The five languages are built from one
manifest and one set of grammar modules. A rule is written once and reaches every language whose
grammar includes its module, and a new architecture is a new module.

## Languages

Each language is one grammar for one architecture, one syntax and one group of assemblers.
Assembly reads ARM and x86 in GNU syntax without a selection. The other four, the exact languages,
follow their assemblers exactly.

| Language (Zed picker) | Grammar         | Modules             | Owns by default           | Modeline aliases                           | Toggle comment |
| --------------------- | --------------- | ------------------- | ------------------------- | ------------------------------------------ | -------------- |
| Assembly              | `asm_auto`      | core, gas, arm, x86 | `s` `S` `sx`              | `asm` `gas` `assembly`                     | `//`           |
| ARM Assembly          | `asm_arm`       | core, gas, arm      | none                      | `arm` `arm64` `aarch64` `aarch32` `thumb`  | `//`           |
| ARM Assembly (Apple)  | `asm_arm_apple` | core, gas, arm      | none                      | `arm64-apple` `apple-arm64` `darwin-arm64` | `//`           |
| x86 Assembly (GAS)    | `asm_x86_gas`   | core, gas, x86      | none                      | `x86` `x86_64` `x64` `amd64` `i386`        | `//`           |
| x86 Assembly (NASM)   | `asm_x86_nasm`  | core, nasm, x86     | `asm` `ASM` `nasm` `yasm` | `nasm` `yasm`                              | `;`            |

Toggling a comment inserts the prefix shown and one space. `sx` is GCC's suffix for assembly that
the C preprocessor reads first.

Terms used in this document:

| Term                                              | Meaning                                                                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| architecture                                      | ARM (AArch64, and AArch32 with its A32 and Thumb instruction sets) or x86 (x86-64 and i386)                              |
| GNU syntax                                        | the syntax GNU as and clang read, for x86 in its AT&T or Intel flavor                                                    |
| NASM syntax                                       | the syntax nasm and yasm read                                                                                            |
| dialect                                           | the rules one group of assemblers adds to a syntax, for GNU as and clang on ELF, for Apple's clang, or for nasm and yasm |
| GNU as, clang, nasm, yasm                         | the assemblers, by their program names (GCC is the compiler)                                                             |
| Assembly, ARM, ARM (Apple), x86 (GAS), x86 (NASM) | the five languages, short for their names in Zed's picker                                                                |
| exact languages                                   | every language except Assembly                                                                                           |
| GNU-syntax languages                              | Assembly, ARM, ARM (Apple) and x86 (GAS)                                                                                 |

A `.s` file opens as Assembly unless a modeline or a setting selects another language. A modeline on
the first line selects one per file (`// -*- mode: arm -*-`, or `// vim: ft=arm`), and a setting in
`settings.json` selects one by default:

```json
{ "file_types": { "ARM Assembly": ["s", "S"] } }
```

`.inc` is not claimed, since PHP, Pascal and BitBake also use it.

## One manifest

`languages.config.cjs` holds the registry metadata, the per-syntax editor settings, the block kinds
both syntaxes share and the five language entries. `scripts/lib/manifest.ts` validates it on load
and names the field of any error. `scripts/build.ts` generates from it:

- `extension.toml`
- `languages/<dir>/config.toml` and the composed query files next to it
- `tree-sitter/tree-sitter.json`
- `tree-sitter/<grammar>/grammar.js` and `tree-sitter/<grammar>/src/scanner.c`

`scripts/tree-sitter.ts generate` then runs `tree-sitter generate` with its built-in JavaScript
engine to write each grammar's `src/parser.c`. Generated files are committed, since Zed reads them
from the repository. `bun run check:generated` regenerates everything into `.build/` and fails on
any difference.

## Grammar modules

`tree-sitter/common/define-grammar.js` composes a grammar from the modules the manifest names, in
the order `core`, the syntax family (`gas` or `nasm`), then each architecture (`arm`, `x86`). A
module is a function of the language's syntax, architectures and dialect, and returns:

- `rules`, the rules it owns. A name defined by two modules is an error.
- `choices`, alternatives for shared choice points (`_item`, `_line_content`, `_statement`,
  `instruction`, `_mnemonic`, `_local_label`, `_instruction_operand`, `_operand`, `_value`,
  `_expression`, `_symbol`, `_defined_name`, `immediate`, `symbol_type`). Alternatives from several
  modules are merged and duplicates dropped.
- `extras`, tokens allowed anywhere, such as block comments.

No grammar declares a word token. The scanner reads every listed word (see ARM operands, Keywords).

`_instruction_operand` holds an instruction's operands, which are everything `_operand` (a directive
argument) holds plus the ARM forms. ARM registers, memory operands and register lists are therefore
no directive arguments, and `.quad x0` names a symbol.

A backslash followed by a newline joins two lines in every syntax. nasm and yasm join them, and in
GNU syntax the C preprocessor does (see C preprocessor lines). In GNU syntax blanks may stand
between the backslash and the newline, as the preprocessor allows. `lexical.js` holds this rule
(`spacedJoins`), and a test checks it against the scanner's `ASM_SPACED_JOINS`. `define-grammar.js`
passes every rule through `tree-sitter/common/joins.js`, which lets a join stand between any two
characters of a terminal. Regexes and token contents are rewritten so that a join may precede every
character but the first, so no token starts or ends with a join. A string of several characters
becomes a pattern aliased to its own text, so `<<` keeps its node name. A join between tokens is an
extra. The scanner steps over joins between tokens, in strings and in raw text. In NASM its word
readers and line comments also step over them (`ASM_WORD_JOINS`, `ASM_COMMENT_JOINS`). In GNU syntax
a word the scanner reads and a line comment end at a backslash.

Composition determines what a dialect contains. Symbol types written with `@` (`.type f, @function`)
come from the x86 module, and the ARM grammars read `@note` as a comment.

Local labels are the node `local_identifier`, the names each assembler keeps out of the symbol
table. These are `.L` names for the ELF assemblers, NASM names that start with `.` or `$.`, and `L`
names in ARM (Apple), as Apple's clang reads them for Mach-O (`Ltemp` never reaches the object file,
`.Ldot` does). Other names, such as `.text`, are identifiers. In ARM (Apple) an `L` name is also
local in operands, except the seven words that are also a register, a condition or a shift (see ARM
operands).

A module may also depend on the dialect. The ARM module adds dollar labels only for Assembly and
ARM, and Apple's positional macro arguments only for ARM (Apple). The scanner reads such a token
wherever the grammar allows it, so the dialect decision lives in one place.

A global label starts a `label_block`, which holds everything up to the next global label or the end
of the file. That is the span objdump gives a symbol and `.size f, .-f` measures. Eclipse CDT ends
label extents the same way and also trims trailing comment and definition lines. That needs
lookahead across lines, so here such lines stay in the block before them. Local labels, comments and
preprocessor lines inside the span belong to the block. Lines before the first global label stay at
the top level.

The top level and every body are one list of statements and label blocks. A label block takes every
statement after it (right precedence), so no statement follows a label block in the tree, and
tree-sitter reuses a whole block after an edit (see Performance). A second global label on the same
line, after another label or after `;`, starts its own block. A label after a statement on the same
line (`nop main:`) is an error in GNU syntax, as for the assemblers. nasm and yasm reject it too,
but the NASM grammar reads it as a segment with its operand missing, the reading `es:` needs while
it is typed.

Macros, conditionals and repeat blocks are blocks, and in NASM structures too (see NASM,
Structures). Each has a header, a `body` of statements and label blocks, and a closer:

- `macro_definition`, `.macro` with the name and the parameters, closed by `.endm` or `.endmacro`.
- `conditional`, an `.if` opener with its condition and body, then optional `elseif_clause`s and an
  `else_clause`, each with its body, closed by `.endif`.
- `repeat_block`, `.rept` with a count, or `.irp` and `.irpc` with a parameter and its values,
  closed by `.endr`.

A body starts at the end of its header line, with the newline or `;` that ends the header, and runs
to the next clause or the closer. Zed indents from ranges that start on the line above. Every body
starts on its header's line, so the lines of every block and clause indent alike (see Editor
behavior).

The scanner reads block words as whole words in any case, as GNU as accepts them. `.macros` and
`.ifx` are ordinary directives (see ARM operands, Keywords). A global label in a body starts a block
inside it, and a block between two global labels belongs to the label block before it. The header is
a rule of its own. A name the header requires closes like a missing operand when the line ends
early, so a header being typed never takes in the next line. A closer ends its block whatever
follows it, and the rest of its line must be empty. `.endif nop` closes and then reports `nop`, as
GNU as does. A blank in a parameter or value list follows the macro call rule (see Blocks, labels
and directive forms). In ARM `.irp r x0 #1` has the one value `x0#1`, `.macro m a, b=1 #1` the
default `1#1` and `b=1 -2` the default `1-2`. In x86 (GAS) `#1` is a comment and `b=1 -2` an error,
as in GNU as ("Bad parameter list").

A block open at the end of the file ends there, with a hidden zero-width token from the scanner, as
tree-sitter-python writes its dedents at the end of a file. The token is hidden so that the tree
shows a closer only where the text has one. Its body is an `unclosed_body`, and `body` is for bodies
that a closer or clause follows. Without the token, a block nested in a block of another kind and
left open while its closer is typed would turn the outer block into one error node, since
tree-sitter's recovery inserts at most one missing token. The assemblers also end every open block
at the end of the file, and report it. The grammar does not report it.

The assemblers read the body of a macro or repeat block as text up to its closer, then run it.
`.endm` ends a macro, and `.endr` a repeat block, even while a block opened inside is still open.
Measured, both assemblers accept a macro that leaves `.if` open when it is not called, and clang
accepts it when its caller closes the `.if`. Both accept a repeat block whose `.if` the caller
closes. The scanner does the same. At `.endm` it ends every conditional and repeat block still open
inside, at `.endr` every conditional, each with the hidden token, then reads the closer. `.endif`
never ends a macro or a repeat block, since inside them it is text.

The scanner does not see whether a macro or repeat block encloses the line, a limit. A stray `.endm`
or `.endr` inside a conditional therefore also ends that conditional, where GNU as ignores it.
Tracking the enclosing blocks would take a copy of the block states for each nesting, about twice
the parser, and the stray closer changes only the rest of that conditional. A closer outside any
block, or `.else` outside a conditional, parses as an ordinary directive, because a macro can supply
the other half. clang accepts `.endif` or `.else` for a conditional a macro opened, and GNU as a
stray `.endm` or `.endr`. The scanner reads `.else` and `.elseif` like closers, to know where one
fits. A second `.else` in a conditional, or `.elseif` after `.else`, which both assemblers reject,
becomes a token no rule accepts and parses as an error.

`\name`, `\@` and `\+` are `macro_argument` nodes. Text glued to an argument forms a `concatenation`
(`no\s`, `\name\()_start`, `.Lx\@`), which may be a mnemonic, an operand, a label, or the name of
a macro (`.macro w_avg_\bd\()_2 tap`), an assignment (`\sym\()_x = 2`) or a register alias
(`\name .req \tgt`). An ARM register glued to
an argument heads the concatenation as a `register` (`v4\sz`). A label named that way starts no
block, since its name exists only after expansion. The macro reader of GNU as (`macro.c`) gives
the glued forms below.

| Form                                                                                                | Reading                                      | Example     |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------- | ----------- |
| `\()`                                                                                               | a separator between glued pieces             | `\a\()_x`   |
| `\(text)`                                                                                           | the literal text, an `identifier` piece      | `nop\(lit)` |
| `\name'`                                                                                            | the argument, its closing apostrophe dropped | `\a'x`      | The scanner reads glued pieces |
| only where nothing separates them from the piece before, and never during error recovery, so        |                                              |             |
| recovery cannot glue the next line onto a name. Macro calls take keyword arguments (`m b=2, a=1`).  |                                              |             |
| A keyword's name is a word followed by `=` (not `==`), with blanks allowed, so a register name may  |                                              |             |
| be one (`do_thumb_abort fsr=r1, pc=r4, psr = r5`).                                                  |                                              |             |
| ARM (Apple) adds Apple's positional arguments `$0` to `$9` and `$n` and requires commas between     |                                              |             |
| parameters, as its assembler does. Apple's clang substitutes a positional argument whatever follows |                                              |             |
| it, so `$0.16b` and `$0abc` are the argument glued to text.                                         |                                              |             |

A statement ends at a newline, a statement separator or the end of the file. GNU as reads a missing
final newline as one ("end of file not at end of a line; newline inserted"), and the scanner reads
the end of the file as a zero-width terminator and as the closer of each block still open there.

When the last line is broken and no newline follows it, the scanner still closes the innermost block
at the end of the file. Error recovery then keeps every block, and only the broken line becomes an
error node. Otherwise typing the `.` of `.endm` on the last line of a new file would turn the macro
into one error node, and its name would lose its color and its outline entry.

Two tree-sitter rules apply here. When the error appears only at the end of the file, as with `.`
waiting for `= expr`, recovery keeps the block only if the scanner closes it there, because no state
inside a block accepts the bare end of the file. With no block open, recovery skips the token. When
the error comes earlier, as with a lone `1` or `\`, the parser is still recovering at the end of the
file, and tree-sitter ignores a zero-width token unless the scanner state changed
(`ignore_empty_external_token` in its `parser.c`). The tokens the scanner writes at the end of the
input therefore carry a one-byte state that no other token has, and the first of them counts.
Python's grammar relies on the same rule for its final dedents. During recovery the scanner writes
nothing when the token before already closed the input, so recovery ends without relying on
tree-sitter to ignore the repeat.

While a line is typed its last construct is often open. The scanner closes it with a zero-width
token, so error recovery never pulls in the next line. An operand missing after a comma, an
expression missing after an operator, `(`, `#` or `$`, and a parenthesis, bracket, register list or
GNU-syntax string left open close at the line end, before a separator, or before any character that
cannot continue them. Each missing piece and each open construct has its own closing token (see The
external scanner). `mov x0, , x1` keeps both operands, and `ldr x0, [x1` closes its bracket at the
line end. Character constants and strings end at the closing quote or the line end, unless the line
ends in a join, which continues them. A relocation may lack its specifier, and a register its name
after `%`. In ARM a register range may lack its end, a `:lo12:` relocation its name or its second
colon, and a `sym(GOT)` suffix its name or its `)`.

Three tests cover this:

1. `test/grammar/typing.test.ts` types every prefix of every fixture line, with and without the
   final newline, and of every corpus example, and requires every other line to parse as before.
   Exempt are the lines a typed line continues into through a join (any line but a GNU-syntax line
   comment), the lines an unclosed `/*` reaches up to its `*/` or the end of the file, the lines an
   unclosed C macro call takes up to its `)`, and, for a typed line that holds a block's opener,
   clause or closer, also on a line it joins before or after the typing, the other such lines of
   that block and of the blocks around it. A mode line
   (`.intel_syntax`, `.att_syntax`, `.altmacro`, `.noaltmacro`) is not checked, since its mode
   changes the lines after it.
2. The same file types every printable character after each kind of open construct, in every
   grammar, before a next line and as the last line of a file without a final newline, inside a
   `.if` and a `.rept` (a label block in NASM) that the end of the file closes. The lines before
   must parse unchanged.
3. `test/grammar/closing.test.ts` checks the scanner against each generated `parser.c`. It parses a
   line that stops at an open construct, once for every grammar site that uses a closing token, and
   reads from tree-sitter's debug log the parse states before any error recovery. For every
   printable character followed by `a` or `=`, the scanner must close exactly when no token those
   states accept can start the text, and with the token that site uses.

## Query and test sources

Query fragments are in `queries/<source>/`, corpus tests in `test/corpus/<source>/`. For each
language the sources run from general to specific. They are `core`, the syntax family, each
architecture, then `<arch>.<syntax>` for material that holds for one pairing (AT&T operands and `@`
symbol types are in `x86.gas`). Corpus tests also include a directory named after the grammar, for
one dialect's behavior.

Zed allows one file per query kind and paints a character with the last capture pushed for it. The
build concatenates fragments from general to specific, so later patterns override earlier ones.

## The external scanner

`tree-sitter/common/scanner.h` makes every lexing decision that depends on the dialect or on what
the parser expects next. Its state has four values. They are whether it has written the zero-width
tokens that end the input (see Grammar modules), the x86 syntax mode (see x86 operands), the
alternate macro mode (see Blocks, labels and directive forms), and the number of open C macro calls
(see Expressions, C macro calls). It serializes to zero bytes while all four hold their initial
values, to one byte for the first three, and to five bytes while a call is open. Incremental
reparsing therefore reuses any subtree before the first mode line, open call or end of input. Each
grammar's generated `src/scanner.c` defines `ASM_GRAMMAR_NAME` and one `ASM_DIALECT_*` macro and
includes it. Defining none or two is a compile error.

What the assemblers do, measured with GNU as 2.46.1 (x86-64, AArch64) and 2.45 (AArch32), clang
22.1, nasm 3.02 and yasm 1.3.0:

|                    | GNU as x86-64             | GNU as AArch64   | GNU as AArch32   | clang ELF         | clang Apple arm64    | nasm and yasm |
| ------------------ | ------------------------- | ---------------- | ---------------- | ----------------- | -------------------- | ------------- |
| `;`                | separator                 | separator        | separator        | separator         | comment              | comment       |
| `//` at line start | comment                   | comment          | comment          | comment           | comment              | error         |
| `//` after code    | error                     | comment          | comment          | comment           | comment              | error         |
| `#` at line start  | comment                   | comment          | comment          | comment           | comment              | error         |
| `#` after code     | comment                   | immediate prefix | immediate prefix | depends on target | immediate prefix     | error         |
| `@`                | symbol type (`@function`) | error            | comment          | depends on target | relocation (`@PAGE`) | -             |
| `'a` / `'a'`       | both accepted             | both accepted    | both accepted    | only `'a'`        | only `'a'`           | `'a` warns    |

What the scanner decides:

|                                                  | Assembly                                                                                                   | ARM          | ARM (Apple)               | x86 (GAS)   | x86 (NASM) |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ------------ | ------------------------- | ----------- | ---------- |
| text inside `"..."`                              | string                                                                                                     | string       | string                    | string      | string     |
| `//`                                             | comment                                                                                                    | comment      | comment                   | comment     | -          |
| `#` where an immediate fits                      | immediate if a value can start after it, else comment                                                      | immediate    | immediate                 | -           | -          |
| other `#`                                        | C preprocessor directive at the start of a line, else comment                                              | same         | same                      | same        | -          |
| `@` glued to a symbol                            | relocation                                                                                                 | relocation   | relocation                | relocation  | -          |
| `@` glued to a size in a C macro call argument   | probe argument                                                                                             | same         | same                      | same        | -          |
| `@` plus a letter or digit where an operand fits | symbol type                                                                                                | comment      | -                         | symbol type | -          |
| other `@`                                        | comment                                                                                                    | comment      | -                         | -           | -          |
| `;`                                              | separator before a directive or after an x86 prefix, else a comment up to the next `;` a directive follows | separator    | comment                   | separator   | comment    |
| `;` inside a C macro call                        | separator                                                                                                  | separator    | comment                   | separator   | -          |
| line comment inside a C macro call               | ends at the end of its argument                                                                            | same         | same                      | same        | -          |
| `%%`                                             | separator                                                                                                  | -            | separator                 | -           | -          |
| `1$`, `1$:`                                      | dollar label                                                                                               | dollar label | -                         | -           | -          |
| `\` or a name right after a name                 | glued piece                                                                                                | same         | same                      | same        | -          |
| `$0` to `$9`, `$n`                               | -                                                                                                          | -            | positional macro argument | -           | -          |
| `(` and a relocation name after a blank          | the same operand                                                                                           | same         | -                         | -           | -          |
| a name after `(` in a relocation suffix          | relocation name                                                                                            | same         | -                         | -           | -          |
| a name after `:` in a relocation                 | relocation name                                                                                            | same         | -                         | -           | -          |
| `{` where a decorator or prefix fits             | decorator or pseudo-prefix                                                                                 | -            | -                         | same        | -          |
| `.req`, `.dn`, `.qn` after a first name          | register alias word                                                                                        | same         | same                      | -           | -          |

In Assembly a `;` is a separator when a directive follows it, and a comment otherwise. A `.s` file
does not state whether it targets GNU as and clang ELF, where `;` separates, or Apple's clang, where
it starts a comment. Zed cannot route a file by content, since it reads a language's
`first_line_pattern` only when no suffix matches, and Assembly owns `.s`. A modeline, or the ARM,
ARM (Apple) and x86 (GAS) languages, give the exact reading. The rule applies to every `;` on a
line, so a `;` comment ends where a later `;` is followed by a directive. `.rept 2; nop; .endr`
closes its block with `; nop` as a comment, and `mov w1, #0 ; =0x0` is a comment to the line end.

A `;` after an x86 prefix also separates (`rep; movsb`, `lock; incl %eax`). No prefix is an ARM
mnemonic, so such a line is x86 code, where `;` always separates. The prefixes are the x86 (GAS)
prefix words (see x86 operands, Prefixes).

The preprocessor ends a C macro call at its `)`. Inside a call, an assembler line comment (`@`, `#`,
and `;` in ARM (Apple)) ends at the end of its argument, the next `,` or `)` outside parentheses,
with strings and C comments skipped. A `//` comment ends at the line end. An `@` glued to a size,
with an operand right after it, is the `@` of a probe argument instead (see Expressions, C macro
calls).

`%%` separates statements in ARM (Apple), as in Apple's clang (`SeparatorString` in LLVM's
`AArch64MCAsmInfo.cpp`), and in Assembly. No x86 or GNU ARM operand starts with `%%`.

A value starts with a letter, a digit or one of `_ . ( - + ~ ! ' :`. In Assembly `svc #0` has an
immediate, and `nop # note` and `nop #*** banner ***` are comments.

At a statement start the scanner reads the next word. Followed by blanks and a colon, the word is a
label name, local when the assembler keeps it out of the symbol table (`.L` in the ELF dialects, `L`
in ARM (Apple), `.` in NASM) and global otherwise. In GNU syntax a word of digits is a numeric
label. In Assembly and ARM it may end in `$`, a dollar label of GNU as for 32-bit ARM. Inside a
block, its closing word (`.endm`, `.endmacro`, `.endif` or `.endr`) is the closer. The scanner reads
these words because the parser would otherwise have to decide at the first letter of a line whether
the block ends, before it sees the colon. The word takes the characters of the grammar's names, and
a test checks every printable character against `lexical.js`.

A statement inside a C macro call argument starts with a label or an item. The scanner reads the
word once. Followed by a colon, blanks allowed, it is a label name. Otherwise it takes its operand
role, so `X(r4: nop)` has a label and `cfi_rel_offset (r4, 0)` a register. GNU as drops the blanks
between a statement's first word and its colon (`app.c`). A label named by a call (`L(x):`) is
decided at its colon, which the scanner reads as `_label_colon`. At a statement start the scanner
instead looks past the parentheses for the colon, once per statement. Inside calls that look would
repeat at every nested call and take quadratic time.

The same word may be a directive that must match whole, such as a block opener or clause, `.loc` or
`.file`, an ARM directive with register operands, or a NASM directive such as `section` or `db`. The
words come from tables generated from the upstream sources, one table per architecture and dialect.
Each language looks them up in one dictionary built from the tables of its architectures (see
Generated tables). The scanner hashes a word once and reads every role it has from that one entry
(directive, instruction, register, prefix and the rest), each with its architecture, token and
flags. The indent pattern reads the block words from the tables. The flags state, for example, that
a reserved word is never a label, and that in NASM a word can make the name before it a label
(`x db 1`) or an assignment name (`len equ 5`). The scanner keeps a word's first characters, one
more than the longest word of its dictionary. A longer word matches no keyword, whole or with an
affix, and reads as a name (a 45-character `a_macro_name_longer_than_every_keyword_of_gas 1, 2` is a
macro call). tree-sitter's
runtime gives a wasm grammar only a few C library functions, so the hash is the scanner's own.

During error recovery the scanner reads no label and no block closer. Every parse state that accepts
one also accepts a newline, since a blank line may stand wherever a statement may. Recovery
therefore reaches a statement start at the newline that ends the broken line, and where that newline
cannot end recovery, a label or closer could not either. A name with a colon read during recovery
becomes one token that no rule accepts, and recovery skips it instead of starting a statement there.
Operands the grammars do not parse, such as `ptr fs:[0x28]`, `%fs:sym@tpoff`, NASM's `[fs:0x28]` or
`:lo12:sym` in ARM (Apple), never start a block. Refusing only the word does not suffice, since
tree-sitter resumes a statement at the refused word and reads it again, outside recovery, as a
label. Valid code never enters recovery. A label after an error and a `;` still starts its block,
because recovery resumes at the `;`.

The scanner never asks for the column during recovery. tree-sitter computes an unknown column by
walking back to the line start, and while it skips characters no token accepts, it forgets the
column after every scanner call. Asking at each word made a long broken line cost quadratic time.
Measured on `nop a a a`, a line takes 16 ms at 4,000 characters and 44 ms at 8,000 with column
requests, and 10 and 19 ms without.

String text is read before any comment rule, so `.asciz "# of args"` is a string in every dialect.
In ARM (Apple) an `@` that is not a relocation is an error, as for Apple's clang. `;` alone and
`nop;;nop` are empty statements in the dialects where `;` separates.

Assembly guesses between ARM and x86, with these limits. `mov rax, rdi #copy` reads `#copy` as an
immediate, and `nop @note` reads `@note` as a symbol type. ARM register names are registers in x86
code too (`movl sp, %eax`, `call a1`). Assembly reads AT&T until a `.intel_syntax` line. Before one,
Intel's `dword ptr [rbx+4]` parses as the symbols `dword` and `ptr` and an ARM lane, and after one
as a typed memory operand, as in x86 (GAS). A bare `#` at a line end is a comment there, since no
value follows it. The exact languages read all of these correctly. An ARM role slot also takes x86
operands, so `blcs %eax, %ebx` (AMD TBM) parses, though `blcs` is also ARM's `bl` with the condition
`cs`.

The scanner sees only which of its own tokens the parser accepts. Each closing token therefore
stands for one kind of construct, with a fixed set of characters that continue it. A missing piece
closes before any character that cannot start it:

| Token                        | The missing piece                                                                         | Starts with                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `_missing_operand`           | an instruction operand or a condition, an item of a C macro call argument                 | a value, in ARM also `[`, `{` and `=`, in x86 also `*`          |
| `_missing_label_operand`     | an ARM branch target                                                                      | a value, `[` or `=`                                             |
| `_missing_argument`          | a directive argument or an `.irp` value                                                   | a value                                                         |
| `_missing_register_argument` | an argument of `.cfi_offset`, `.save` and the other register directives                   | a value, in ARM also `{`                                        |
| `_missing_element`           | an element of an ARM bracket                                                              | an expression, in Assembly and ARM also `$`                     |
| `_missing_expression`        | an expression                                                                             | an expression                                                   |
| `_missing_register`          | a register list element, a range end, a `.req` register                                   | a letter, `_` or `\`, in ARM (Apple) also `$`                   |
| `_missing_name`              | a `.macro` name or parameter, an `.irp` parameter, the statement after `{vex}` or `times` | a letter, `_`, `\`, or `.` before a letter                      |
| `_missing_identifier`        | a parameter's qualifier (`:req`), a `%macro` name                                         | a letter or `_`                                                 |
| `_missing_symbol`            | an `.loh` argument, a NASM structure name                                                 | a letter, `_`, or `.` before a letter                           |
| `_missing_relocation`        | the name or second colon of `:lo12:`, the name in `sym(GOT)`                              | nothing the parser reads (the scanner reads the name and colon) |

An expression starts with a letter, a digit or one of `_ . ( - + ~ !`, in GNU syntax also with
`' " \`, in Assembly and ARM with `:` (a relocation), and in NASM with `? $`. A value starts as an
expression does, in GNU syntax also with `%` (an x86 register or a symbol type such as `%function`),
and in x86 with `$`. In Intel operands an expression has no relocation `:` and also starts with `%`
or `[`, and an operand also starts with `$`. Wherever the parser takes an x86 register, `%` starts
one.

An open construct closes before any character that cannot continue it, and also continues with an
operator where the parser takes one:

| Token                 | The open construct                         | Continues with                                                  |
| --------------------- | ------------------------------------------ | --------------------------------------------------------------- |
| `_unclosed`           | a parenthesis, an AT&T scale               | `)`                                                             |
| `_unclosed_bracket`   | an ARM memory operand or register index    | `]` and `,`                                                     |
| `_unclosed_index`     | the lane after a register list, `{v0.s}[1` | `]`                                                             |
| `_unclosed_brace`     | a register list                            | `}` and `,`                                                     |
| `_unclosed_memory`    | an AT&T memory operand                     | `)`, a `,` after a register or index, `%` where a register fits |
| `_unclosed_address`   | an Intel bracket                           | `]`                                                             |
| `_unclosed_arguments` | the arguments of a macro call              | `)` and `,`                                                     |

Where a character has several meanings, the scanner reads the token itself, and only where the
parser expects it. These are the comma right after an AT&T `(` (`(,%rax,8)`), the colon of an ARM
alignment or index range, the colon of an Intel segment (`fs:[0x28]`), the `[` after an Intel
displacement (`sym[rip]`), the dash of a register range, the `!` of an ARM writeback, the `^` after
a register list, the `)` of a C macro call and, inside a call, the colon of a label named by a call,
a relocation name after `:` and the colon after it, a pseudo-prefix, a decorator, the `%` of a
register built by a call (`%VMM(1)`) and the `@` of a probe argument. Before a `(` it writes a
zero-width marker of what the parentheses open (see Expressions, and x86 operands, Operand
forms). At the start of an ARM
bracket element a colon begins an alignment when a digit follows (`[r0, :64]`) and a relocation
otherwise (`[x0, :lo12:sym]`). The first colon of `:lo12:` is the parser's own token, since a
label's colon is the same character (`\name\()_start:`). When a missing piece and an open construct
can both close, the construct closes as it stands, so `.word (` at the end of a line holds an empty
parenthesis. Inside a C macro call a line end closes nothing. A construct nested in the call closes
at the line end only when the first character of the next line cannot continue it.

Comments are read first, so the decision is made on the next character that is not a comment. Where
an operator may continue, `=` in GNU syntax and `!` in ARM (Apple) and NASM decide only with a
second `=` (`==`, `!=`). In the other GNU-syntax languages `!` alone is an operator, and in ARM
(Apple) `a !b` in a call argument is two items. A GNU-syntax `\` needs a name, `@` or `+` after it,
a NASM `?` a name character, and a `.` where only a name fits a letter or `_`. The only word that
may be glued to a complete operand is a relocation specifier after `@`, which the scanner reads
itself. Any other glued word closes like any character that cannot continue, so `[0x` (a hex number
being typed) closes its bracket before the `x`, and the error stays on its line.

The open tokens are valid only where the construct may end. After `[` or `{` an element is required,
so a bracket never closes before its first element. A rule based only on the next character would
close `[x1]` before the `x`.

The scanner is strict ISO C11. Dialect settings are 0/1 macros used in ordinary `if` statements, so
every branch compiles and type-checks in all five dialects.

## Generated tables

Every word list that decides how a line parses is generated. `scripts/keywords.ts` reads the
upstream sources and writes `tree-sitter/common/keywords.h`, which is committed, so building the
parsers needs no upstream source. Each table is an X-macro named `ASM_<scope>_<kind>`. The scope is
an architecture with an `ASM_<scope>_KEYWORDS` setting in `scanner.h`, or `GNU` for the tables every
GNU-syntax language reads.

| Tables                                                                 | Read from                         |
| ---------------------------------------------------------------------- | --------------------------------- |
| `ASM_X86_GAS_INSTRUCTIONS`, `_DIRECTIVES`, `_REGISTERS`, `_PREFIXES`   | binutils, LLVM, yasm's GAS parser |
| `ASM_X86_GAS_OPERAND_WORDS`, `_DECORATORS`, `_DEFAULT_FLAGS`           | binutils, LLVM                    |
| `ASM_X86_GAS_ENCODING_SUFFIXES`, `_SYNTAX_WORDS`                       | binutils, LLVM                    |
| `ASM_X86_NASM_INSTRUCTIONS`, `_DIRECTIVES`                             | nasm, yasm's NASM parser          |
| `ASM_X86_NASM_REGISTERS`, `_PREFIXES`, `_OPERAND_WORDS`, `_DECORATORS` | nasm                              |
| `ASM_X86_NASM_DEFAULT_FLAGS`, `_LIST_WORDS`                            | nasm                              |
| `ASM_AARCH64_GNU_*`, `ASM_AARCH32_*`                                   | binutils, LLVM                    |
| `ASM_AARCH64_APPLE_*`                                                  | LLVM                              |
| `ASM_GNU_MACHO_SECTION_TYPES`                                          | binutils, LLVM                    |
| `ASM_GNU_CPP_DIRECTIVES`                                               | clang                             |

Assembly reads the AArch64 GNU, AArch64 Apple, AArch32 and x86 GAS tables, ARM the AArch64 GNU and
AArch32 tables, ARM (Apple) the AArch64 Apple tables, and x86 (GAS) and x86 (NASM) their own. The
GNU-syntax languages also read the `GNU` tables. `bun run build` merges a language's tables into one
dictionary in `tree-sitter/common/words.h`, one section per language. Each word appears once, with
one role for every table that lists it, in the order `scanner.h` lists its `ASM_*_KEYWORDS` settings
(AArch64 GNU, AArch64 Apple, AArch32, x86 GAS, NASM). Lookups prefer the earlier role, so a
directive both AArch64 and x86 define reads as AArch64's in Assembly.

The dictionary is a minimal perfect hash built as nasm builds its token table (`perllib/phash.ph`).
Two seeded 32-bit hashes of the word name two vertices of a graph, and the values stored at the two
add up to the word's index. A lookup costs one hash, two reads and one string compare, and the
compare also rejects a word that is no keyword. The build tries seeds until the graph has no
conflict and checks that every word finds itself. `check:c` builds `test/c/words.c` for each
language and checks the same in C. Every word finds its own entry, and the empty word and each word
with a character no word holds find none.

The tables follow the upstream heads, not the installed releases. The installed tools only
cross-check them. A table is a superset, so a word reads if any assembler of the dialect takes it.
Where sources disagree about a word, what one of them allows counts (a register that takes a suffix
in either), and a restriction holds only if every source that lists the word imposes it (a word is
case-limited only if all of them limit it). Each reader tags what its source states, and
`scripts/lib/keywords/shapes.ts` merges the tags into scanner tokens and flags.

The strings `ASM_<scope>_SYMBOL_CHARACTERS` hold the symbol characters of GNU as's input scrubber
(`app.c`). `ASM_GNU_SYMBOL_CHARACTERS` is the symbol components of `app.c`'s `lex` table (letters,
digits, `_`, `.`, `$`). The bytes from 128 up are symbol characters too, and the reader stops if
`lex` changes that. A target's string is its `tc_symbol_chars` minus its comment, line comment and
line separator characters (`do_scrub_begin`), read from `tc-*.h` and `tc-*.c` through gcc for an
ELF Linux build (`OBJ_ELF`, `TE_LINUX`). The strings are `%(*-[` for x86, `[]{}` for AArch32 and
empty for AArch64. `words.h` holds each language's union as two 64-bit ASCII masks,
`SYMBOL_CHARACTERS`.

nasm's token classes (registers, prefixes, operand words, decorators) come from nasm alone, so where
nasm and yasm read a word differently, the grammar follows nasm. Statement words are the union with
yasm, since nasm rejects the yasm-only lines rather than reading them differently.

To regenerate, keep clones named `binutils`, `llvm`, `nasm` and `yasm` in one directory and run:

```sh
scripts/dev --sources ../references bun run keywords
scripts/dev bun run generate
```

The first command builds `llvm-tblgen` once under `.build/tblgen`, which takes a few minutes, and
runs each project's own table generators. The second regenerates the parsers.
`ASM_KEYWORD_SOURCES` in `keywords.h` records the commit of each source, so a change of upstream
shows in the diff of that file.

A reader checks the shape of the source it reads and stops the generator when the shape no longer
fits. That is a new handler, token type or operator it has no form for, or a guard it relies on that
is gone (a name compared in any case, a word that must follow another). A reader cannot detect a
word written in a form it has never met. A change of form usually removes what it matched, and then
it stops. `test/unit/keywords-*.test.ts` run each reader on small inline sources, without upstream
sources, and check its names, its tags and each of its stops.

Hand-written, because upstream has no list of them:

- Which token a word becomes, in the handler and word maps in `shapes.ts` and the instruction roles
  in `tree-sitter/common/roles.js`. Signatures that fit no role stop the generator.
- Forms, which are small rules rather than word lists. Names and numbers are in
  `tree-sitter/common/lexical.js`. The scanner holds the AArch32 type suffixes (`.f32`, `.bf16`),
  the AArch64 arrangements and element sizes, the letters of `APSR_nzcvq` and the local label
  prefixes.

A word reads by its table even when a macro redefines it, since the definition may be in another
file. GNU as and clang let a macro take an instruction's name. clang, nasm and yasm also let it take
a directive's, while GNU as warns and ignores the macro. As a limit, `add 1, 2` after
`.macro add a b` reads as an instruction, and `add 1 2`, blank separated, is an error on that line,
though the assemblers accept it.

## C preprocessor lines

A line that starts with a C preprocessor directive, indented or not, is a `preproc_line`, or a
`preproc_define` for `#define`. After a label or a `;`, a `#` follows the dialect's comment rules,
since the preprocessor recognizes directives only at the start of a line.

The directives are the generated table `ASM_GNU_CPP_DIRECTIVES`, read from the cases of clang's
`HandleDirective` (`clang/lib/Lex/PPDirectives.cpp`). The handler each word calls gives its form:

| Form                               | Words                                                                                                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Name, parameters and value         | `define`                                                                                                                                                                             |
| A C expression                     | `if`, `elif`                                                                                                                                                                         |
| A header name or string, then text | `include`, `include_next`, `import`, `embed`                                                                                                                                         |
| Text                               | `ifdef`, `ifndef`, `elifdef`, `elifndef`, `else`, `endif`, `undef`, `line`, `error`, `warning`, `pragma`, `ident`, `sccs`, `assert`, `unassert`, `__public_macro`, `__private_macro` |

GCC's directives are a subset of these (measured with GCC 16.2), so no GCC source is read. Two rows
are directives to one preprocessor only. clang names `assert` and `unassert` but leaves them
unimplemented and passes them to the assembler, while GCC implements them. clang reads
`__public_macro` and `__private_macro` when modules are on, while GCC passes them on.

clang's other words are left out, and those lines read as comments, as the assembler reads them.
`module` and `__preprocessed_module` are directives only after a C++ `module` keyword, never after
`#`. `__preprocessed_import` needs C++ modules. `__include_macros` is an error outside clang's own
buffers, and GCC does not know it. The generator stops if any of these facts changes, and on a
handler it has no form for.

Directive lines are preprocessor lines, comments are comments, and every other line parses as
assembly, in every branch of a conditional group. No condition is evaluated, `#if 0` included. C
text outside a comment is an error (the C declarations in glibc's `#ifdef __svml_*_typedef`
groups).

The directive word is compared as written, so `#DEFINE` is a comment. It ends where a C identifier
ends. `.` and `$` are not identifier characters in assembler-with-cpp mode, so `#endif.x` is
`#endif` with the argument `.x`.

After the directive the scanner reads the rest of the line as the preprocessor does in
assembler-with-cpp mode (measured with GCC 16.2 and clang 22.1, `-E -x assembler-with-cpp`):

- Only `//` and `/*` start comments. `#`, `@` and `;` are text, so `#define SEP ;` and
  `#define STR(x) #x` keep their arguments.
- `"` starts a literal that ends at the next unescaped `"` or at the line end, and `'` starts one
  that ends at the next `'` or at the line end.
- After `#include`, `#include_next`, `#import` and `#embed`, `<...>` is one header name, and the
  `//` in `<a//b.h>` is no comment. An unclosed `<` is a header name being typed.
- A backslash before a newline joins the two lines everywhere, including inside literals and `//`
  comments, also with blanks between the backslash and the newline. Outside literals a backslash
  has no other effect.

A `preproc_define` has the macro's `name`, its `parameters` when `(` follows the name without a
blank, and its `value`, the rest of the line as above. The name takes the characters of a C
identifier. `#define a.b 1` defines `a` with the value `.b 1`, `#define a$b 1` defines `a` with the
value `$b 1`, and `#define P (x)`, with a blank before the parenthesis, defines `P` as `(x)`.
Parameters are names, `...`, or GNU's named variadic form `args...`. A `#define` without a name is
complete while it is typed, and one whose name is not an identifier (`#define 1 2`, `#define $x 1`)
is an error, as for the preprocessor. The argument of `#if` and `#elif` is a `preproc_condition`, a
C expression.

Comments after the directive are `preproc_comment` children of the line, and trailing blanks belong
to the line. A cursor at the end of `#endif /* X */`, also after trailing blanks, is in the
`preproc` scope.

Not modeled:

- A comment opener split by a backslash-newline (`/`, backslash, newline, `*`), which the
  preprocessor joins.
- A directive word split that way, and a comment between `#` and the word (`# /* c */ define N`),
  both directives to the preprocessor and comment lines here.
- A `// note` that ends in a backslash on a code line. In a `.S` file it continues the comment on
  the next line, and in a `.s` file, which GNU as reads directly, it does not. Both open as the same
  language, and the grammar ends the comment at its line end.

The preprocessor joins code lines the same way. In a `.S` file every line that ends in a backslash,
also with blanks before the newline, continues on the next, and a join inside a word splices it
(GCC's manual says "you may split a line anywhere, even in the middle of a word"). GNU as and clang
reject a backslash-newline in the code of a `.s` file, so every GNU-syntax language joins code lines
as the preprocessor does without misreading any valid `.s` file. A join is a blank between tokens
and a splice inside a name, a number or an operator, and a string continues past it. `.long A | \`
followed by `B` on the next line is one directive. A backslash that no newline follows keeps its GNU
meaning, a macro argument (`\reg`) or `\()`.

As a limit, a word the scanner reads (a mnemonic, a directive, a register, a prefix or a statement's
label) ends at a backslash. The scanner cannot see the character after a backslash without reading
it, and tree-sitter gives it one token end and no way back, so `push\width`, a word and a macro
argument, and `.lo\` followed by `ng` on the next line, one word, cannot be told apart. None of the
7,245 joins in the pinned Linux, glibc and FFmpeg sources splits such a word. At a backslash that is
no join between two tokens, the scanner hands the rest of the scan a lexer that offers the backslash
again, so every token is decided as without joins.

## Blocks, labels and directive forms

Measured with GNU as 2.46.1 (x86-64, AArch64) and 2.45 (AArch32) and clang 22.1 (x86-64, AArch64,
AArch32, Apple arm64). All of them accept:

- `.macro` with the parameters `a, b`, `a=1`, `a = 1`, `a:req` and `rest:vararg`, keyword calls
  such as `m b=2, a=1`, `.exitm` and `.purgem`.
- In a macro body, `\name`, the counter `\@`, the separator `\()` and `\+`, each glued to other text
  (`no\s`, `\name\()_end`), as the mnemonic (`\op`) or as a label (`\name:`).
- `.if`, `.elseif`, `.else`, `.endif` and the conditions `.ifdef`, `.ifndef`, `.ifnotdef`, `.ifb`,
  `.ifnb`, `.ifc`, `.ifnc`, `.ifeqs`, `.ifnes`, `.ifeq`, `.ifne`, `.ifge`, `.ifgt`, `.ifle`,
  `.iflt`.
- `.rept N`, `.irp r, 1, 2` and `.irpc c, 123`, each closed by `.endr`.
- Numeric labels `0:`, `1:` and `10:`, referenced as `1b` (backward) and `1f` (forward). `1B` and
  `1b:` are errors.
- A blank before a label's colon (`lbl :`, `.Lx :`, `1 :`).
- `.equ`, `.set` and `.equiv` with `NAME, expr` (the comma is required), `NAME = expr` and
  `. = expr`.
- Decimal floats in `.float`, `.single` and `.double` (`1.5`, `.5`, `1.`, `1e3`, `1E3`, `1.5e+3`,
  `-1.5`, `1` and `inf`). `1.5f` is an error.
- Blank-separated arguments in `.loc 1 2 3 prologue_end is_stmt 0`, where commas are an error.
- Adjacent strings in `.ascii` (`.ascii "a" "b"` stores `ab`).
- Empty arguments (`.p2align 4,,10`, `.balign 8,,4`).
- `.byte 1 -2` as one value, -1. `.byte 1 2` is an error.
- `.2byte`, `.4byte` and `.8byte`, which compilers write in debug information. `.1byte`, `.3byte`
  and `.16byte` are errors.

Differences:

|                                                   | GNU as x86-64 | GNU as AArch64 | GNU as AArch32                                  | clang ELF                                                          | clang Apple arm64    |
| ------------------------------------------------- | ------------- | -------------- | ----------------------------------------------- | ------------------------------------------------------------------ | -------------------- |
| Directive names in upper case                     | accepted      | accepted       | accepted                                        | accepted, except `.text`, `.data`, `.section`, `.endm` and `.endr` | same as clang ELF    |
| `.endmacro`                                       | error         | error          | error                                           | closes a macro                                                     | closes a macro       |
| Blanks between macro parameters (`.macro m a b`)  | accepted      | accepted       | accepted                                        | accepted                                                           | error                |
| Blanks between `.irp` and `.irpc` values          | accepted      | accepted       | accepted                                        | error                                                              | error                |
| One-line blocks (`.rept 2; nop; .endr`)           | accepted      | accepted       | accepted                                        | accepted                                                           | `;` starts a comment |
| `$0` to `$9` and `$n` in a macro body             | error         | error          | error                                           | error                                                              | positional arguments |
| Dollar label `1$:`                                | error         | error          | accepted, forgotten at the next non-local label | error                                                              | error                |
| `.eqv NAME, expr`, `NAME == expr`                 | accepted      | accepted       | accepted                                        | error                                                              | error                |
| Prefixed floats `0f1.5`, `0d1.5`, `0f+1.5`, `0f1` | accepted      | accepted       | accepted                                        | error                                                              | error                |
| Hexadecimal float `0x1.8p0`                       | error         | error          | error                                           | accepted                                                           | accepted             |
| Integer suffixes `1u`, `1UL`, `1ll`, `0x10ull`    | ignored       | ignored        | ignored                                         | ignored                                                            | ignored              |
| Integer suffixes `1LU`, `1llu`                    | ignored       | ignored        | ignored                                         | error                                                              | error                |
| Macro call `m 1 2`                                | two arguments | two arguments  | two arguments                                   | two arguments                                                      | one argument `12`    |
| Macro call `m 1 -2`                               | two arguments | one argument   | one argument                                    | one argument                                                       | one argument         |
| Adjacent strings in `.asciz` and `.string`        | accepted      | accepted       | accepted                                        | error                                                              | error                |

GNU as takes any of `f`, `d`, `e`, `r`, `s`, `x`, `h`, `p` and `b`, in either case, as the letter of
a prefixed float, and inside a float directive reads `0x10` as 10.0, the prefix followed by a
decimal number. clang reads `.MACRO` but ends a macro body only at a lower-case `.endm` or
`.endmacro`, and a repeat body only at a lower-case `.endr`.

A construct parses in a language when at least one of that language's assemblers accepts it. The
grammar reads:

- Numeric labels as `numeric_label`, defined (`1:`) or referenced (`1b`, `1f`). Only lower-case `b`
  and `f` count, so `0b101` and `0x1f` stay integers.
- An `integer` in decimal, octal, `0x` or `0b` form with the suffixes its assemblers ignore, `U` and
  then `L` or `LL`, in any case. ARM (Apple) does not read GNU as's `U` after the `L`s (`1LU`) as
  part of the integer, since clang rejects it.
- Dollar labels (`1$:`, `1$`) in Assembly and ARM only.
- `NAME = expr`, `NAME == expr` and `. = expr` as `assignment`. `.equ`, `.set`, `.equiv` and `.eqv`
  stay directives whose first argument is the name, so `.set noreorder` is a plain directive.
- A `float` in the decimal, prefixed and hexadecimal forms. A prefixed float with `x` or `b` needs a
  point, so `0x10` and `0b11` stay integers.
- Blank-separated integers, strings, names and negated values after `.loc` and `.file` (GCC writes
  `view -0`).
- Arguments of the string directives (`.ascii`, `.asciz`, `.string` to `.string64`, from GNU as's
  `stringer` handler and clang's `DK_ASCII`, `DK_ASCIZ` and `DK_STRING`) separated by commas or
  blanks. GNU as joins adjacent strings (`read.c`, "Treat "a" "b" as "ab""), and a name or a C macro
  call stands for a macro that expands to a string (`.ascii KERN_WARNING "..."` in the Linux
  sources). Every other directive separates its arguments with commas and may leave one empty.
- Macro definitions with the parameters `a`, `a=default`, `a:req` and `a:vararg`, separated by
  commas or blanks (only commas in ARM (Apple)), closed by `.endm` or `.endmacro`. A comma may
  follow the name (`.macro loadsp, rb`), as in both assemblers.
- Macro arguments `\name`, `\@` and `\+`, alone or glued to text, keyword arguments in calls, and
  an empty first argument (`diff_pixels , aligned=1`).
- `.altmacro` and `.noaltmacro` (see Alternate macro mode).
  Apple's `$0` to `$9` and `$n` in ARM (Apple) only.
- Conditionals with every `.if` opener measured, `.elseif` and `.else`, closed by `.endif`, and
  repeat blocks with `.rept`, `.irp` and `.irpc`, closed by `.endr`. `.irp` values are separated
  by commas or blanks (only commas in ARM (Apple)). Every branch of a conditional parses, `.if 0`
  included.

A macro call has the form of an instruction, and its arguments may be separated by blanks. GNU as
("Multiple arguments can be separated by blanks or commas") and clang ELF split `m 1 2` into two
arguments, Apple's clang joins it into the one argument `12`, and nasm and yasm pass `1 2` as one
argument. The generated instruction and directive tables tell a call from an instruction (see
Generated tables), and only a call takes blank-separated arguments. Instruction operands are
separated by commas, as every assembler requires, so `movl %eax %ebx`, `add x0, x1 x2`, and NASM's
`mov eax 1` and `push 1 2` are errors. The exception is NASM, where a name or a macro token before
an operand may be a macro that expands first (see NASM, Macro calls and macro words). Directive
arguments and `.if` conditions are separated by commas (`.byte 1 2` is an error). As a limit, a
macro named like an instruction (`.macro mov a b`, then `mov 1 2`) reads as the instruction.

A blank in a macro call, an `.irp` or `.irpc` value list or a macro parameter list follows GNU as's
input scrubber (`app.c`) and macro reader (`macro.c`, `get_any_string`). After a symbol character
or a string, a blank before a symbol character, a quote or a backslash separates two items. Every
other blank is dropped. The symbol characters are generated per target (see Generated tables). ARM
takes the AArch64 and AArch32 characters, x86 (GAS) the x86 ones and Assembly both. Separated:
`m a "b"` and `m a \b` everywhere, `m 1 -2` and `m foo (%rax)` in x86 (GAS) and Assembly.

| After a dropped blank      | Reads as                                 | Example                         |
| -------------------------- | ---------------------------------------- | ------------------------------- |
| an operator                | one expression                           | `m 1 -2` in ARM                 |
| `(` after a name           | a call or a relocation suffix            | `m F (1)`, `m sym (GOT)` in ARM |
| any other start of a value | one `argument` holding the joined values | `m x0 #1` in ARM, `m a ~b`      |

The separating and the joining blank are zero-width scanner tokens. Assembly writes neither before
`#` (x86's comment). clang ELF splits at every blank no operator follows (`parseMacroArgument`), and
reads x86 `m 1 -2` as one argument. ARM (Apple) follows Apple's clang, which never splits at a
blank, and joins every two blank-separated values.

An ARM shift joins its amount (`lsl #2`), also across a kept blank in a macro list (FFmpeg's
`add_sh r2, r2, r4, asr r3`), which is GNU as's reading for a `:vararg` parameter. The shift words
are the ones the assemblers take with an amount (`lsl lsr asr ror asl msl` and the extends
`uxtb`...`sxtx`, measured). Alone they are symbols. Neither assembler splits an argument inside
parentheses. Parentheses that hold no expression are an `argument_list`, split at commas and at
blanks before a character that starts an operand and cannot continue the one before. C macro call
arguments follow their own rule (see Expressions, C macro calls).

Limits:

- A kept blank separates after `)`, after `]` and `}` in x86 (GAS), and after a character constant,
  where GNU as drops it (`m 4(%rsp) 8(%rsp)` is one argument in GNU as).
- An operator is never an item of its own (`m 1 - 2` in x86 is three arguments in GNU as).
- A shift passed to a plain parameter is two arguments in GNU as (`asr`, `r3`).

NASM names follow what nasm 3.02 and yasm 1.3.0 accept. A name is an optional `$`, which turns a
reserved word into a name (`$eax` is a symbol, not the register), then a letter, `_`, `?`, `@` or
`.`, then letters, digits and `_ $ # @ ~ . ?`. Both assemblers take `@` first (`@x:`, `@:`,
`mov eax, @x`), as nasm's lexer does, and the NASM manual leaves it out. After the escaping `$` any
name character may follow, `$` included, so `$$foo` is the name `$foo`, and `$$` alone is the start
of the section. A name that starts with `.` or `$.` is local. Both assemblers accept `.1:`, `.$x:`,
`.#x:`, `.@x:`, `$.y:` and `$eax:`. Only nasm accepts the bare `.:` (yasm reports "label or
instruction expected"), and only yasm accepts `..x:` and `....:` (nasm reports "unrecognised special
symbol"). The grammar reads all of them, as labels and in operands, since each is valid for one of
the language's assemblers. A `$` starts a name only before a letter, `_`, `?`, `@`, `.` or another
`$`. A `$` alone is the current position, so an operand may start at any `$`.

### Alternate macro mode

`.altmacro` turns GNU as's alternate macro mode on and `.noaltmacro` turns it off. The words are
generated from GNU as's `s_altmacro` entries and clang's `DK_ALTMACRO` and `DK_NOALTMACRO`. The
scanner keeps the mode, in text order, in one bit of its state. Every GNU-syntax language reads it.
In the mode a macro call argument, a keyword argument's value and an `.irp` or `.irpc` value may
also be the items below, as GNU as's `get_any_string` and `getstring` read them.

| Item     | Node                                                    | Example                    |
| -------- | ------------------------------------------------------- | -------------------------- |
| `%expr`  | `unary_expression` with the operator `%`                | `put_pic %(.Lpic_idx - 1)` |
| `<text>` | `string`, nested pairs inside, `!` escaping a character | `m <q r>, <a!>b>`          |
| `'text'` | `string`, `''` for a quote                              | `m 'it''s'`                |

A `<` ends the argument before it, glued or after a blank (`m a<b c>` is `a` and `<b c>`). An
unclosed `<text` or `'text` ends at the line end. Outside the mode `%` and `<` are operators
(`m %function`, `m a<b`).

## Expressions

GNU as and clang group operators by GNU's precedence, not C's, on every ELF target, x86 and ARM.
clang uses a third order on Apple targets, and nasm and yasm use C's. Measured with fifteen `.if`
probes per assembler (`2 + 3 << 1` is 8 in GNU's order, 10 in Apple's and nasm's), the levels from
the highest to the lowest are:

| Level | GNU syntax on ELF | Apple (clang) | NASM and yasm |
| ----- | ----------------- | ------------- | ------------- |
| 1     | `* / % << >>`     | `* / %`       | `* /`         |
| 2     | `\| & ^ !`        | `+ -`         | `+ -`         |
| 3     | `+ -`             | `<< >>`       | `<< >>`       |
| 4     | comparisons       | comparisons   | `&`           |
| 5     | `&&`              | `\| & ^`      | `^`           |
| 6     | `\|\|`            | `&& \|\|`     | `\|`          |
| 7     |                   |               | comparisons   |
| 8     |                   |               | `&&`          |
| 9     |                   |               | `\|\|`        |

Assembly, ARM and x86 (GAS) use the first column, ARM (Apple) the second, x86 (NASM) the third.
Operators of one level group from the left. Assembly, ARM and x86 (GAS) read the binary `!` (or-not,
`1 ! 2` is `1 | ~2`), as GNU as does on every target. clang takes it for x86 and AArch64 ELF and
rejects it for AArch32 and Apple. `%` is the remainder in every GNU-syntax language. In x86 code a
`%` that starts a register name is a register (see x86 operands). In Intel syntax GNU as keeps its
own order and reads `shl`, `shr` and `mod` at level 1, `and`, `or` and `xor` at level 2 and `eq`,
`ne`, `lt`, `le`, `gt` and `ge` with the comparisons, while clang's Intel mode uses C's order
(`2 + 3 shl 1` is 8 in GNU as, 10 in clang). The grammar follows GNU as. Precedence shapes the tree
only, never a color.

In GNU syntax `$` starts a name (`$x:`, `.word $4`, `foo+$bar`), as `LEX_DOLLAR` makes it in GNU as
and clang reads it. Before an operand where an immediate fits and a register may stand, `$` is the
immediate prefix instead. That holds in instruction operands, macro arguments and the ARM directives
with register operands (see ARM operands, Directives with register operands).

| Input                        | x86 (GAS)    | ARM and Assembly                | ARM (Apple)                     |
| ---------------------------- | ------------ | ------------------------------- | ------------------------------- |
| `mov $4, %eax`, `add r0, $4` | an immediate | an immediate, as `#4`           | the macro argument `$4`         |
| `add x0, x1, $foo`           | -            | an immediate                    | the name `$foo`                 |
| `.word $4`, `.long $foo + 4` | the names    | the names                       | `$4` an argument, `$foo` a name |
| `$x:`                        | a label      | a label                         | a label                         |
| `movw r0, $:lower16:x`       | -            | an error, as in both assemblers | an error                        |

In ARM (Apple) `$0` to `$9` and `$n` are macro arguments before any other reading. As a limit,
`.pad $4` reads `$4` as a name, while GNU as reads the immediate 4 there.

A quoted name is a symbol where a symbol is needed, as a label (`"a b":`), in an operand, after `$`,
with `@PLT` or `:lo12:`, and in memory operands. GNU as and clang accept all of these on every
target, and gcc's Intel output quotes every symbol. A quoted operand alone stays a string, since GNU
macros take string arguments (`ALTERNATIVE "", "lfence", X86_FEATURE_LFENCE`).

A `symbol_type` is `%` and a name or a number in every GNU dialect, and `@` and a name or an
`integer` in x86 (GAS) and Assembly (`.type f, %function`, `.type f, %STT_FUNC`, `.type f, %2`,
`.section .c,"a",@0x70000001`). Any name reads, as both assemblers parse one before they check it.
GNU as rejects `%Function` and warns on LLVM's `%llvm_lto`, and clang rejects GNU as's `%exidx`. GNU
as reads a number for both directives, clang for a section type only (`%2` is an error to clang). No
list of ELF type names is kept.

Mach-O section types are names, so `regular`, `cstring_literals` and `symbol_stubs` are identifiers.
The types that start with a digit (`4byte_literals`, `8byte_literals`, `16byte_literals`), which the
identifier pattern of `lexical.js` does not match, are scanner words, from a table generated from
GNU as's `bfd_mach_o_section_type_name` and clang's `SectionTypeDescriptors`. Both assemblers
compare the type as written, so `4BYTE_LITERALS` is no type.

### C macro calls

In `.S` files the C preprocessor runs before the assembler, so the source contains C macro calls
(`PER_CPU_VAR(x)`, `USER(9f, ldr x0, [x1])`, `L(loop)`). The GNU-syntax languages read them by these
rules:

| Construct                                                        | Reading                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name(`                                                          | `macro_call` with the fields `function` and `arguments`, except AT&T memory, whose parentheses start with a register, or with a comma that an index or a scale follows (`sym(%rip)`, `t(,%rax,8)`, `4(,1)`). Otherwise `(,` opens a call whose first argument is empty (`F(, x y)`) |
| `name (`                                                         | a call (`.word F (1)`), inside a call argument too unless the parentheses hold an AT&T memory operand with a register (`END (SYM (a, b))`), and two arguments where GNU as keeps the blank in a macro list (`m F (1)` in x86 (GAS) and Assembly)                                    |
| statement `name(...)`                                            | a call statement when the parentheses end the statement at a line end, separator or comment, also after x86 decorators, which become `decorator` children (`_ASM_EXTABLE(1b, 3b)`, `ENTRY_P2ALIGN (STRCHR, 5)`, `CMP_R1_S2_VMM (%VMM(0), (%rsi), %VMM(1), %k1){%k2}`)               |
| statement `name(...)` and operands                               | an `instruction` whose `mnemonic` is the call, when `(` follows the name directly and a blank and an operand follow the parentheses (`__ASM_SIZE(push,) %__ASM_REG(dx)`)                                                                                                            |
| instruction name before `(`                                      | a call when `(` follows directly (`PLD( pld [r1] )`, `BX(ip)`), and the instruction when a blank separates them (`lgdt (%eax)`)                                                                                                                                                     |
| `name(...):`                                                     | a `label` whose `name` is the call (`L(loop):`)                                                                                                                                                                                                                                     |
| line end inside a call                                           | a blank, at any nesting depth inside the call                                                                                                                                                                                                                                       |
| argument                                                         | empty, one item, or a run of items                                                                                                                                                                                                                                                  |
| item                                                             | an instruction operand (an Intel operand in Intel mode), a pp-number or a probe argument                                                                                                                                                                                            |
| probe argument                                                   | `probe_argument` with the fields `size` and `operand`, a size (an integer, a negated integer or a name) glued to `@` and an operand (`4@%eax`, `-4@8(%esp)`, `LP_SIZE@%RDI_LP`, `8@x0`)                                                                                             |
| statement in an argument                                         | split at the dialect's separator (see The external scanner), and may start with labels (`EXC(1: movw (%esi), %bx)`)                                                                                                                                                                 |
| blank, then `[`, `(`, or an operator directly before its operand | the next item (`pld [r1, #-4]`, `movw (%esi)`, `jmp *%\reg`)                                                                                                                                                                                                                        |
| operator with blanks on both sides                               | a binary operator (`i + 2`)                                                                                                                                                                                                                                                         |
| digit word                                                       | an assembler number when one matches the whole word (`1f`, `1.5`, `1e+5`), otherwise a pp-number                                                                                                                                                                                    |
| pp-number                                                        | one `identifier`, an assembler number token followed by the scanner's glued text (`128_more`, `28bytes`)                                                                                                                                                                            |
| call glued to a name                                             | a `concatenation` where a value stands (`.word F(x).y`)                                                                                                                                                                                                                             |

GCC's manual says arguments "can cross as many lines in the source file as you wish", and a blank
may stand between the macro name and `(`. The rules for instruction names and for blanks inside
arguments are preferences by shape, since the preprocessor's reading depends on `#define`s the
parser does not see. The limits are that `push(%rax)` reads as a call and `X(a -1)` as two items,
and that `F(x)y` reads as one concatenation, while cpp puts a blank before `y` when the expansion
ends in a name (`cpp_avoid_paste`).
`.macro` arguments follow GNU as instead (see Blocks, labels and directive forms).

SystemTap's `sys/sdt.h` turns the arguments of a probe in assembler code into a string in the note
section (`.ascii #x`), and gdb reads each as `N@OP` (`stap-probe.c`), an optional size `[-]1`, `2`,
`4` or `8` and an operand of the architecture. In the source the size may be a macro name
(`LP_SIZE`). The `@` belongs to a probe argument when it is glued to the size and an operand starts
right after it, and in ARM that comes before the `@` comment. Where a relocation fits, after a
name, a word after the `@` stays a relocation specifier (`sym@PLT`).

The glued text of a pp-number takes the dialect's name characters, `$` included in GNU syntax, while
GCC and clang in assembler mode end a pp-number at `$`. A sign ends the glued text, so `0x1e+2` is
an expression.

The scanner state holds the number of open calls. A call marker raises it. The call's `)`, read by
the scanner, and the call's zero-width closing token lower it. While the count is positive, a line
end is a blank before the next item of a run, otherwise a hidden extra token. Error recovery writes
no such token, and a statement start resets the count to zero. An unclosed call takes the following
lines as arguments up to the next `)`, as an unclosed `/*` takes them as a comment.

## ARM operands

Measured with GNU as 2.46.1 for AArch64 (`-march=armv9.6-a+sve2+sme2+cmpbr`) and 2.45 for AArch32
(ARMv7-A with NEON, Thumb, and Armv8.1-M with MVE), and with clang 22.1 for the same targets and
for Apple arm64. In every one of them an `.arch` or `.arch_extension` line turns on SVE, SME and MVE
inside a file, so one grammar reads all of it.

### Registers

The register names are generated from `reg_names` in GNU as's `tc-aarch64.c` and `tc-arm.c`, and
from LLVM's register matchers with the aliases its parsers add. ARM takes the GNU as and LLVM names,
ARM (Apple) LLVM's AArch64 names, and Assembly both. The scanner reads a register as one whole word,
suffix included, and looks it up. A register word glued to `(` is a name (`R8(x)` is a call), since
no assembler takes a register there.

| Family          | Names                                                                                                                            | Suffix                                                                                                                |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| AArch64 general | `x0`-`x30`, `w0`-`w30`, `xzr`, `wzr`, `sp`, `wsp`, `lr`, `fp`, and `x31` and `w31` (clang), `ip0` and `ip1` (GNU as)             | -                                                                                                                     |
| FP and SIMD     | `b`, `h`, `s`, `d`, `q` 0-31 and `v0`-`v31`                                                                                      | for `v` an arrangement `.8b .16b .4h .8h .2s .4s .1d .2d .1q .2b .4b .2h` or an element `.b .h .s .d`                 |
| SVE             | `z0`-`z31`, `p0`-`p15`, `pn0`-`pn15`                                                                                             | an element `.b .h .s .d .q`                                                                                           |
| SME             | `za`, the tiles `za0`-`za15` with `h` or `v` for a slice (`za3h`), `zt0`                                                         | an element for `za`, and for a tile an element its number fits (`.b` tile 0, `.h` 0-1, `.s` 0-3, `.d` 0-7, `.q` 0-15) |
| clang only      | `nzcv`, `fpcr`, `fpsr`, `fpmr`, `vg`, `ffr`, and the register halves of its register allocator such as `w0_hi`                   | -                                                                                                                     |
| AArch32 general | `r0`-`r15`, `sb`, `sl`, `fp`, `ip`, `sp`, `lr`, `pc`, `wr`, `a1`-`a4`, `v1`-`v8`, Armv8.1-M `zr`                                 | a NEON type (GNU as)                                                                                                  |
| AArch32 vector  | `s0`-`s31`, `d0`-`d31`, `q0`-`q15`, the VFP and MVE specials `fpscr` to `vpr`, iWMMXt and XScale names, `ra_auth_code`           | a NEON type (GNU as)                                                                                                  |
| AArch32 other   | coprocessors `p0`-`p15`, `c0`-`c15`, `cr0`-`cr15`, banked `r8_usr` to `elr_hyp`, and clang's `apsr`, `cpsr`, `spsr`, `apsr_nzcv` | a NEON type on its own names (GNU as)                                                                                 |

GNU as reads a register in lower case or all upper case (`X0`, not `Xzr`), clang in any case. The
grammar takes any case, since one assembler of each language does. ARM (Apple) leaves out the
AArch32 registers and `ip0` and `ip1`, which Apple's clang rejects.

Both assemblers accept the same arrangements, a count of 1, 2, 4, 8 or 16 lanes whose size in bits
is 64 or 128, `.1q`, and the dot-product shapes `.2b`, `.4b` and `.2h`. GNU as also takes leading
zeros in the count (`v0.016b`). A NEON type is `.8`, `.16`, `.32` or `.64`, optionally after `i`,
`s`, `u`, `p` or `f`, or `.f` (32 bits), `.d` (64 bits) or `.bf16`, in any case. GNU as takes it on
every register of its table (`r0.i32`, `fpscr.f32`, `p15.f32`) and rejects it on a memory base, in a
core register list, and when the mnemonic also gives the type (`vadd.i32 q0.i32, q1, q2`). The
grammar reads it wherever a register goes. A suffix no rule takes leaves the whole word a symbol
(`d0.x32`, `v0.q`, `za1.b`).

### System registers

A system register is a `register` only in the operand slots that take one, the system roles in the
table below. Elsewhere it is a symbol, as both assemblers read it (`b tpidr_el0` branches to a
symbol). The names are generated:

- AArch64, from GNU as's `aarch64-sys-regs.def` and PSTATE fields and LLVM's system register, PSTATE
  and SVCR tables.
- AArch32, from GNU as's `cpsr` and `spsr` fields (`cpsr_fc`) and M-profile names (`primask`,
  `basepri_max`) and LLVM's M-profile and banked register tables.

Rules add the forms no table lists:

- AArch64 generic encodings `s<op0>_<op1>_c<n>_c<m>_<op2>`, `op0` 0-3, `op1` and `op2` 0-7, `n` and
  `m` 0-15 (`s3_0_c1_c0_0`). clang reads each field in decimal without leading zeros, GNU as with
  them too (`s3_0_c01_c0_0`).
- The control registers of `sys`, `sysl` and `sysp`, which are `c` and a number from 0 to 15. clang
  reads decimal digits (`c7`, `c07`). GNU as reads an expression there, of which the grammar takes
  one integer in any GNU form (`c0x7`, `c016`, `c7u`). An expression such as `c(3+4)`, which GNU as
  also takes, is no register.
- AArch32 APSR bits after `apsr`, `iapsr`, `eapsr`, `psr` and `xpsr`, with `n`, `z`, `c`, `v` and
  `q` all or none, and `g`, in any order (`apsr_nzcvq`, `apsr_gnzcvq`, `xpsr_g`).
- `APSR_` with `nzcv` in any order, which GNU as reads in `vmrs` and the CDE instructions.

A `cpsr` or `spsr` field takes lower case only (`CPSR_fc`, not `CPSR_FC`), as both assemblers
require, and so do the `APSR_` flags in an order other than clang's `nzcv`.

Every system slot of a language reads every form, so a name valid in one system slot is a register
in all of them. `mrs x0, c7` reads `c7` as a register, though no assembler takes it there. No valid
program changes, since no assembler takes a symbol in a system slot. The names a slot takes depend
on the instruction (readable registers for `mrs`, writable ones for `msr`, 128-bit ones for `mrrs`
and `msrr`, PSR masks per instruction), and both assemblers check them after parsing. clang's
`tryParseSysReg` takes any word in a system register slot and leaves unknown names to its matcher.
The grammar leaves that check to the assembler, as for every operand, and slots split by kind would
still not be exact.

### Where a word is a register

The assemblers decide by instruction whether a word is a register, a condition or a symbol. Both
read `adrp x0, x1` and `adrp x0, lt` as references to C globals named `x1` and `lt`. GNU as reads
`bl sp`, `b x0` and `ldr x0, x1` as branches and loads to symbols. Every assembler reads `b eq` as a
branch to the symbol `eq`, and `csel x0, x1, x2, lt` as a condition even when a symbol `lt` exists.
`mov x0, x1` reads `x1` as the register even when a symbol `x1` exists. Apple's clang reads `b LT`
as a branch to a local label.

The grammar models this with roles. `tree-sitter/common/roles.js` lists the positions where an
instruction takes a label, a condition or a system register, and each generated instruction carries
the role its operand types fit. Every word may take any case.

| Role                             | Words                                                                                                                                                                                                                                        | Position |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| label                            | `b`, `bl`, `b.<cond>`, `bc.<cond>`, `b<cond>`, and in AArch32 `bl<cond>`, `b<cond>.w`, `b<cond>.n`, `pld`, `pli`, `bfx`, `bflx`                                                                                                              | 1        |
| two labels                       | AArch32 `bf`, `bfl`                                                                                                                                                                                                                          | 1 and 2  |
| label                            | `cbz`, `cbnz`, `adr`, `adrp`, `ldr`, `ldrsw`, `prfm`, `movz`, `movk`, `movn`, and in AArch32 `cbz.n`, `cbnz.n`, `adr`, `ldr`, `ldrb`, `ldrh`, `ldrsb`, `ldrsh` and `vldr` with a condition and a width, `adrl`, divided `ldr<cond>b`, `letp` | 2        |
| label                            | `tbz`, `tbnz`, `cb<cc>`, `cbb<cc>`, `cbh<cc>`, and in AArch32 `wls`, `wlstp.<size>`                                                                                                                                                          | 3        |
| label after an optional register | AArch32 `le` (`le lr, label` or `le label`), `ldrd` (`ldrd r0, r1, label` or `ldrd r0, label`)                                                                                                                                               | last     |
| three labels, then a condition   | AArch32 `bfcsel` (clang reads only numeric labels there, GNU as also `r1`)                                                                                                                                                                   | 1-3, 4   |
| condition                        | AArch32 `it` to `itttt`, `vpt` to `vptttt`, `vcmp`                                                                                                                                                                                           | 1        |
| condition                        | `cset`, `csetm`                                                                                                                                                                                                                              | 2        |
| condition                        | `cinc`, `cinv`, `cneg`                                                                                                                                                                                                                       | 3        |
| condition                        | `csel`, `csinc`, `csinv`, `csneg`, `ccmp`, `ccmn`, `fcsel`, `fccmp`, `fccmpe`                                                                                                                                                                | 4        |
| system register                  | `msr`, `msrr`, and in AArch32 `vmrs`                                                                                                                                                                                                         | 1        |
| system register                  | `mrs`, and in AArch32 `cx1`, `cx1a`                                                                                                                                                                                                          | 2        |
| system register                  | `mrrs`, and in AArch32 `mrc`, `cx1d`, `cx1da`                                                                                                                                                                                                | 3        |
| system register                  | `sys`, `sysp`, and in AArch32 `cx2`, `cx2a`                                                                                                                                                                                                  | 2 and 3  |
| system register                  | `sysl`, and in AArch32 `cx2d`, `cx2da`                                                                                                                                                                                                       | 3 and 4  |
| system register                  | AArch32 `cx3`, `cx3a`                                                                                                                                                                                                                        | 2-4      |
| system register                  | AArch32 `cx3d`, `cx3da`                                                                                                                                                                                                                      | 3-5      |

The roles come from the operand types upstream gives each instruction. These are GNU as's AArch64
operand kinds and AArch32 operand codes, and the operand classes of LLVM's AArch64 matcher, in which
a register pair (`x0, x1`) counts as two operands.

- A label slot reads a bare word as a symbol, whatever it is named. Brackets, `#`, `=`, relocations
  and expressions read as anywhere.
- A system slot reads system registers as `register` and anything else as anywhere.
- A condition slot reads condition words as `condition`.
- Everywhere else register words are registers, and system register and condition words are
  symbols.

Operands before and after the slot read normally, and a slot may stay empty while a line is typed.
At a position with an optional register the grammar reads the register when another operand follows
and the label otherwise, as GNU as does. `le r1` and `ldrd r0, r2` branch to and load from labels
named `r1` and `r2`, and `le lr` branches to a label named `lr`. `blx`, which takes a register or a
label, has no role. No table lists every instruction's operands, since it would add thousands of
entries for each Arm release and still misread macros, which can take an instruction's name. A role
mnemonic glued to a macro argument (`b\cond`, `ldr\size`) is one `concatenation`, as at the start of
any statement. The instruction it becomes is unknown, so its operands read normally.

Directive arguments are symbols, so `.quad x0, lr` stores two addresses. The exceptions are the
directives with register operands (see Directives with register operands).

### Operand forms

| Node               | Form                                                                                                                                                                | Fields                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `register`         | a register with its arrangement (`v0.16b`, `z0.d`, `p0.s`), type (`d0.f32`) or field (`cpsr_fc`)                                                                    | -                               |
| `predicate`        | `p0/z`, `p0/m`, `pn8/z`                                                                                                                                             | `register`, `qualifier`         |
| `indexed_register` | a register or name glued to `[...]` or after a blank (`v1.s[2]`, `d0[]`, `za0h.s[w12, 0:1, vgx2]`)                                                                  | `register`, `index`             |
| `index_range`      | `0:1` in an index                                                                                                                                                   | `start`, `end`                  |
| `memory_operand`   | `[` elements `]` with an optional `!`, also after a blank                                                                                                           | `operand`, `alignment`          |
| `alignment`        | `:128` after the base (`[r0:128]`, `[r0 :128]`, `[r0, :128]`)                                                                                                       | `value`                         |
| `signed_register`  | `-r2`, `+r2`                                                                                                                                                        | `sign`, `register`              |
| `writeback`        | `r0!`                                                                                                                                                               | `register`                      |
| `register_list`    | `{` elements `}` with an optional lane `[1]` (also after a blank) and `^`, a C macro call also an element with no comma needed after it (`{r4, UNWIND(fpreg,) pc}`) | `element`, `index`              |
| `register_range`   | `r4-r7`, `v0.16b - v3.16b`, `{v31.16b-v2.16b}`, and two registers in a macro or C call argument (`neon_load_multi d0-d3, src`)                                      | `start`, `end`                  |
| `literal_pool`     | `=expr`, in any operand (`ldr x0, =sym`, and `ldr q0, =sym` in clang)                                                                                               | `value`                         |
| `shift`            | a shift with an immediate or register amount (`lsl #3`, `lsl 3`, `lsl r2`), an extend with an optional amount (`sxtw`, `uxtw #2`), `rrx`, SVE `mul vl` and `mul #4` | `operator`, `amount`            |
| `condition`        | a condition word in a condition slot                                                                                                                                | -                               |
| `relocation`       | `:lo12:sym`, `#:lower16:sym`, `sym(GOT)`, `sym@PAGE`                                                                                                                | `specifier`, `value`, `symbol`  |
| `register_alias`   | `name .req x0`, `name .dn d0`, `name .qn q0`                                                                                                                        | `name`, `directive`, `register` |

After `[` or `{` an element is required. `[]` holds a missing element, `{}` a missing register and
`d0[]` a missing expression, the hidden tokens that close constructs being typed. `d0[]`, a valid
lane, parses the same way. The scanner closes `[` and `{` at the end of a line, before a separator
and before any character that cannot continue them (see The external scanner).

A C macro call in an operand list or a register list of ARM, ARM (Apple) and Assembly needs no comma
before or after it (cpp expands it to operands with their commas, or to nothing).

| Place                              | Example                                 |
| ---------------------------------- | --------------------------------------- |
| after an operand                   | `orreq ip, ip, r6 ARM_BE8(, lsl #24)`   |
| before an operand                  | `add r0, F(x) r1`                       |
| between register list elements     | `push {r4 UNWIND(fpreg,) lr}`           |
| in an instruction with typed slots | `b.eq F(x) label`, `ldr x0, label F(x)` |

An operator after the call continues an expression (`add r0, F(x) - r1`). The operands after a call
in an instruction with typed slots are untyped. In Assembly a call after an x86 register or an AT&T
memory operand is a decorator (`%k0 COND_MASK(k2)`, `(%rax) M(k1)`), and a name before a call is a
typed operand (`mov r0, sym F(x)`).

### Relocations

A `:name:` relocation reads in Assembly and ARM. Apple's clang parses it but cannot encode it for
Mach-O ("unknown AArch64 fixup kind"), so ARM (Apple) reads `@PAGE` and `@PAGEOFF` only. The names
are generated from GNU as's `reloc_table` in `tc-aarch64.c`, `group_reloc_table` and the words
`parse_half` reads in `tc-arm.c`, and from clang's `parseSymbolicImmVal` (AArch64) and `parsePrefix`
(AArch32).

| Names                                                                                                                                                                                                                                                   | GNU as | clang |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----- |
| `lo12`, `abs_g0`-`abs_g3` with `_s` and `_nc`, `prel_g0`-`prel_g3` with `_nc`, `got`, `got_lo12`, `gotpage_lo15`, `pg_hi21_nc`, `tlsdesc`, `tlsdesc_lo12`, `dtprel_*`, `gottprel`, `gottprel_lo12`, `gottprel_g1`, `gottprel_g0_nc`, `tprel`, `tprel_*` | yes    | yes   |
| `pg_hi21`, `gotpage_lo14`, `gotoff_lo15`, `gotoff_g0_nc`, `gotoff_g1`, `tlsgd`, `tlsgd_lo12`, `tlsgd_g0_nc`, `tlsgd_g1`, `tlsldm`, `tlsldm_lo12_nc`, `tlsdesc_off_g0_nc`, `tlsdesc_off_g1`                                                              | yes    | no    |
| `dtprel`, `secrel_lo12`, `secrel_hi12`, `got_auth`, `got_auth_lo12`, `tlsdesc_auth`, `tlsdesc_auth_lo12`                                                                                                                                                | no     | yes   |
| AArch32 `lower16`, `upper16`, `lower0_7`, `lower8_15`, `upper0_7`, `upper8_15`                                                                                                                                                                          | yes    | yes   |
| AArch32 group relocations `pc_g0`, `pc_g0_nc`, `pc_g1`, `pc_g1_nc`, `pc_g2`, `sb_g0`, `sb_g0_nc`, `sb_g1`, `sb_g1_nc`, `sb_g2`                                                                                                                          | yes    | no    |

Both accept a name with blanks around it (`: lo12 :`), and both reject an unknown name (`:foo:`).
GNU as takes every name in any case, and so does clang for AArch64, while clang's AArch32 names are
lower case only. The value after the second colon is any expression. The clang column follows LLVM's
current source, and clang 22.1 does not read `dtprel` and `tprel`.

AArch32 code also writes a relocation after its operand, in parentheses (`.word sym(GOT)`,
`bl sym(PLT)`). The names are generated from GNU as's `reloc_names` in `tc-arm.c` and clang's
`AtSpecifierDefs` in `ARMMCAsmInfo.cpp`. Both assemblers accept `got`, `gotoff`, `got_prel`,
`target1`, `target2`, `sbrel`, `tlsgd`, `tlsldm`, `tlsldo`, `gottpoff`, `tpoff`, `tlscall`,
`tlsdesc`, `funcdesc`, `gotfuncdesc`, `gotofffuncdesc`, `tlsgd_fdpic`, `tlsldm_fdpic` and
`gottpoff_fdpic`. `plt` in data and `tlsdescseq` need GNU as, and `prel31`, `none`, `imgrel` and
`secrel32` need clang. clang takes any case. GNU as takes only the lower and upper case spellings
its table lists (`sym(Got)` is an error), and its table spells the upper case of `gottpoff_fdpic` as
`GOTTPOFF_FDIC`, which the grammar reads too. Both take a blank before `(` and an addend after it
(`sym(GOT)+4`). GNU as also applies the name to the whole expression before it (`sym+4(GOT)`), and
the grammar reads it the same way. In a blank-separated `.irp` list `a (b)` is the call `a(b)` in
ARM and the two values `a` and `(b)` in Assembly. This form reads in Assembly and ARM. The scanner
reads its names. After `(` it reads the name as a whole word, and it does not split a
blank-separated operand before `(` and a name, so `bl sym (PLT)` is one operand, as both assemblers
read it.

### Directives with register operands

In these directives register words are registers:

- The CFI directives `.cfi_def_cfa`, `.cfi_def_cfa_register`, `.cfi_llvm_def_aspace_cfa`,
  `.cfi_offset`, `.cfi_val_offset`, `.cfi_rel_offset`, `.cfi_register`, `.cfi_restore`,
  `.cfi_undefined`, `.cfi_same_value`, `.cfi_return_column` and `.cfi_val_encoded_addr`, in every
  ARM language. Both assemblers read a register or a number there, and clang also takes a symbol.
- The AArch32 unwinding directives `.save {r4-r7, lr}`, `.vsave {d8-d15}`, `.setfp fp, sp, #8` and
  `.movsp ip`.
- The Windows on ARM64 directives `.seh_save_reg`, `.seh_save_regp`, `.seh_save_fregp` and the other
  twelve `.seh_save_*` directives that name a register, which clang reads for `aarch64-windows`.

The unwinding and Windows directives read in Assembly and ARM. ARM (Apple) adds `.loh`, the linker
optimization hint clang writes. `.loh AdrpAdd Lloh0, Lloh1` is a kind (a name or a number), a blank,
then labels separated by commas.

`name .req reg` gives a register a second name. GNU as and clang accept it on every ARM target,
clang in any case and GNU as in lower case, and the grammar reads it in any case in every ARM
language. NEON's `.dn` and `.qn` do the same for `d` and `q` registers, with a type or a lane
(`sum .dn d4.f32`, `lane .dn d5.f32[1]`). Only GNU as for AArch32 accepts them, and only in lower
case, so they read in Assembly and ARM and nowhere in upper case. Elsewhere `sum .dn d0` is an
instruction named `sum`.

Both assemblers accept an alias wherever a register goes, also in register lists, ranges, writeback,
lanes and before an arrangement (`src.16b`). The same positions take a macro argument
(`{\r0\().16b, \r1\().16b}`, `\v\().s[1]`, `ldm \base!, {\a}`), and ARM (Apple) a positional
argument (`{$0.16b}`). FFmpeg's and dav1d's NEON macros use these throughout. The grammar reads
`.req`, `.dn` and `.qn` lines as a `register_alias`. A name or macro argument in a register list, a
range, a writeback or before a lane is an `identifier`, a `macro_argument` or a `concatenation`, so
a register name being typed (`{d8-d`) does not break the line. A concatenation there starts with a
register, a name or a macro argument, never a dot name. GNU as and clang read `.foo .req r1` as an
unknown directive and reject `{.foo}`, so a register list closes before `.foo` and the error stays
on its line. x86 register positions use the same rule with their own heads, a register or a `%` name
(`%xmm\i`).

### Keywords

Every listed word is a scanner word. The scanner reads it whole and looks it up in its generated
table, only where the parser expects that kind of word. This holds for instructions, directives,
registers, relocation names, conditions, shift and extend words and the predicate qualifier.

No grammar declares a word token. tree-sitter's lexer stops at a token of higher precedence instead
of going on to a longer token of lower precedence, so a word as an ordinary token splits a longer
word (`lsls` as `lsl` and `s`, `.macros` as `.macro` and `s`). Keywords of a word token require one
shared precedence, no two keywords matching the same string, and an Apple `L` pattern that leaves
out every `L` keyword. `test/grammar/keywords.test.ts` checks that no grammar has a
case-insensitive token.

The words come from upstream:

| Words                      | GNU as                                                              | clang                                                                              |
| -------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| AArch64 conditions         | `aarch64_conds`, with the SVE aliases and `ul`                      | `parseCondCodeString`, with the SVE aliases                                        |
| AArch32 conditions         | `conds`                                                             | `ARMCondCodeFromString`                                                            |
| AArch64 shifts and extends | `aarch64_operand_modifiers`, extends by `aarch64_extend_operator_p` | `tryParseOptionalShiftExtend`, extends by the words that need no amount, and `mul` |
| AArch32 shifts             | `shift_names`, where `rrx` takes no amount                          | `tryParseShiftToken`, `parseMemRegOffsetShift`                                     |
| SVE predicate qualifier    | `parse_predication_for_operand` (`z`, `m`)                          | the predication check of the SVE predicate parser                                  |

A condition reads as one only in a condition slot (see Where a word is a register). A shift word
reads as one only before its amount (`lsl #2`, `lsl r1`), which both assemblers require, so
`mov x0, lsl` loads the symbol `lsl`. An extend word reads with or without its amount (`uxtw`,
`uxtw #2`), and a word that is an extend in one architecture of a language and a shift in another
(`uxtw` in AArch64 and AArch32) reads as an extend. Case follows the assemblers. GNU as hashes its
conditions and modifiers in lower and upper case and lists its AArch32 shifts in both, and clang
takes any case for these. So a word clang knows takes any case, and GNU as's `ul` takes lower or
upper case only (`Ul` is a symbol). clang's AArch32 `uxtw` comes from `parseMemRegOffsetShift`,
which lists `uxtw` and `UXTW` only.

The scanner reads the relocation specifier after `@` and accepts it only right after the `@`. The
relocation names of `:lo12:` and `sym(GOT)` are scanner words too, since the scanner closes `:lo`
and `sym(G` while they are typed.

Words that start with `.` cannot be identifiers, so the scanner reads them whole as well. These are
the block openers, `.loc` and `.file`, the register directives above and the alias words `.req`,
`.dn` and `.qn`, the last two in lower case only.

### Apple `L` names

In ARM (Apple) an `L` name is a `local_identifier` in operands too (`adrp x0, Ltmp0@PAGE`,
`b LBB0_2`, `.quad Ltmp0 - Lfunc_begin0`), also glued to a macro argument (`Lskip\@:`) and as an
assigned name. At the start of a statement it may also be a mnemonic, so `LDP x0, x1, [sp]` and a
macro named `Lmacro` read as instructions. The scanner reads register, condition and shift words
before the grammar's `L` pattern applies, so such a word reads as one where the parser expects it
and as a local name elsewhere. `mov x0, LR` reads a register, `b LR` and `.quad LR` the local symbol
`LR`, and `b LDR` the local symbol `LDR`. `csel x0, x1, x2, LT` reads a condition and
`add x0, x1, x2, LSL #2` a shift, while `b LT`, `b LSL` and `mov x0, LSL` read local symbols, as
Apple's clang does.

### Limits

- SVE patterns (`vl8`, `all`, `pow2`), prefetch operations (`pldl1keep`), barrier options (`ish`),
  the AT, DC, IC and TLBI operations (`vae1`, `civac`) and SME's `vgx2` are symbols.
- An alias name is an identifier where it is used, and only its `.req` line shows that it names a
  register. A predicate takes a register only, because `pg/z` with a name is also a division.
- The grammar reads operand shapes, not instructions, so `zero {za0.s-za3.s}` parses, though the
  assemblers reject that list for `zero`.

## x86 operands

Measured with GNU as 2.46.1 (`--64` and `--32`) and clang 22.1 (`x86_64` and `i686` Linux,
`x86_64` Apple). A construct reads when one assembler of the language accepts it, in 64-bit or
32-bit code, since `.code16`, `.code32` and `.code64` switch between them inside a file.

### Syntax mode

GNU as and clang read AT&T syntax until a `.intel_syntax` line, and AT&T again after `.att_syntax`.
The scanner keeps the mode, in text order, in two bits of its state. One says Intel or AT&T, the
other whether a bare register name is a register. Assembly follows the same lines.

| Line                                | Mode                       | Assemblers |
| ----------------------------------- | -------------------------- | ---------- |
| `.intel_syntax noprefix`            | Intel, bare register names | both       |
| `.intel_syntax`                     | Intel, bare register names | both       |
| `.intel_syntax prefix`              | Intel, registers take `%`  | GNU as     |
| `.att_syntax`, `.att_syntax prefix` | AT&T                       | both       |
| `.att_syntax noprefix`              | AT&T, bare register names  | GNU as     |

`.intel_syntax` alone follows clang, which reads bare names as registers there. GNU as on ELF
requires `%` until `noprefix`, so the two differ only on code GNU as rejects. With bare register
names, every register name is a register in every operand, even where a symbol of that name exists,
as both assemblers read it. A quoted `"rbx"` is the symbol, and the same holds in directive
arguments (`.cfi_offset rbp, -16`). In Intel mode the scanner reads the Intel keywords below in
operands and, as GNU as does, in directive expressions (`.long 1 shl 2`, which clang rejects).
Everywhere else they are symbols, so `movq byte, %rax` loads the symbol `byte`.

tree-sitter reuses no subtree whose preceding scanner state differs, so changing or deleting a mode
line reparses everything after it, and no other edit is affected. The mode takes one byte of the
serialized state, and none in a file that never leaves AT&T.

### Operand forms

| Node                     | Form                                                                                                                                                  | Fields                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `register`               | `%rax`, `% st ( 1 )`, a bare name in noprefix mode, and in an instruction operand `%` and any name or a C macro call (`%VRCX`, `%VMM(1)`)             | -                                                   |
| `memory_operand` (AT&T)  | `disp(base, index, scale)` with each part optional, `%fs:` before it, the base or index also a name or macro argument (`0x00(STATEP)`, `(SRC, %rcx)`) | `segment`, `displacement`, `base`, `index`, `scale` |
| `memory_operand` (Intel) | `[expr]`, also after a displacement (`8[rbp]`, `sym[rip]`, `[rbx][rcx*4]`)                                                                            | `displacement`, `address`                           |
| `typed_operand`          | `dword ptr [rbx]`, `qword [rbx]`, `near ptr target`, and in AT&T a name before an operand (`__percpu 4(%esi)`)                                        | `type`, `operand`                                   |
| `operand_type`           | a size word with an optional `ptr` or `bcst`, or `near`, `far`                                                                                        | -                                                   |
| `segment_override`       | Intel `fs:[0x28]`, `fs:0x28`, `FLAT:sym`, `0x10:0x1000`                                                                                               | `segment`, `operand`                                |
| `indirect`               | AT&T `*%rax`, `*(%rax)`, `*8(,%rax,8)`                                                                                                                | `operand`                                           |
| `decorated_operand`      | an operand and its decorators (`%zmm3{%k1}{z}`, `sym{%k1}`)                                                                                           | `operand`, `decorator`                              |
| `decorator`              | see Decorators                                                                                                                                        | -                                                   |
| `immediate`              | AT&T `$expr` in an instruction operand (`.long $4` is the symbol `$4`)                                                                                | `prefix`, `value`                                   |
| `prefix`                 | see Prefixes, as fields of `instruction`                                                                                                              | -                                                   |
| `operator_word`          | Intel `shl`, `and`, `eq`, `not`, `offset`, `imagerel`, `short` in an expression                                                                       | -                                                   |

cpp replaces names before GNU as reads an operand, so the AT&T forms take macro names where the
assembler takes a register:

- A base or index may be a name or a macro argument when no name stands before the `(`
  (`0x00(STATEP)`, `\i*32(SRC)`, `(SRC, %rcx)`, `(%ebx,INDEX,4)`, `0(\dst)`). With a name before
  the `(` the parentheses are a call (`sym(KEY)`). A name in parentheses followed by `(` or an
  operator stays a parenthesized expression (`(key_table)(CTX, %r8, 8)`, `(VEC_SIZE)-1`). After a
  leading comma a name is the index, not the scale (`(,INDEX,4)`).
- A name, a blank and an operand form a `typed_operand` whose `type` is the name
  (`__percpu 4(%esi)`, `.Lbswap32_mask rRIP`), the shape of a macro that expands to a segment, a
  prefix or a suffix, as in NASM (see NASM, Macro calls and macro words). The blank is a zero-width
  scanner token, written before a letter, a digit, `.`, `\` or `"`, which cannot continue the name.

### Registers

The register names are generated from GNU as's `i386-reg.tbl`, LLVM's register matcher with the
`db0`-`db15` alias its parser adds, and the registers of yasm's register table:

| Family     | Names                                                                                                        | Notes                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| general    | `rax`-`rsp`, `eax`-`esp`, `ax`-`sp`, `al`-`dh`, `sil`, `dil`, `bpl`, `spl`, GNU as's `axl`-`dxl`             |                                                     |
| numbered   | `r8`-`r31` with no suffix or `d`, `w` or `b`                                                                 | `r16`-`r31` are APX                                 |
| segment    | `cs`, `ds`, `es`, `fs`, `gs`, `ss`, `flat`                                                                   | `flat` in Intel syntax only, as GNU as reads it     |
| control    | `cr0`-`cr15`, `dr0`-`dr15`, `db0`-`db15`, `tr0`-`tr7`                                                        |                                                     |
| x87        | `st` with an index `st(0)`-`st(7)`, `st0`-`st7`                                                              | `st0`-`st7` in GNU as's CFI directives and yasm     |
| vector     | `mm0`-`mm7`, `xmm0`-`xmm31`, `ymm0`-`ymm31`, `zmm0`-`zmm31`, `k0`-`k7`, `tmm0`-`tmm7`, `bnd0`-`bnd3`, `bsr0` | yasm's groups `mm`, `xmm` and `ymm` take an index   |
| addressing | `rip`, `eip`, `ip`, `riz`, `eiz`                                                                             |                                                     |
| special    | `eflags`, `rflags`, `fs.base`, `gs.base`, `tr`, `ldtr`, `fcw`, `fsw`, `mxcsr`                                | GNU as reads them in CFI directives, clang anywhere |
| clang only | `flags`, `dirflag`, `fp0`-`fp7`, `fpcr`, `fpsr`, `ssp`, `tmmcfg`                                             |                                                     |

Every assembler reads every name in any case. In AT&T syntax a register is `%` and a name, with
blanks allowed after `%` (`% rax`). An index follows `st`, `mm`, `xmm` or `ymm` in parentheses, with
blanks allowed anywhere (`% st ( 1 )`), and is an integer below the register's count, 8 for `st` and
`mm` and 16 for `xmm` and `ymm`. GNU as reads one digit there, clang and yasm an integer token. The
grammar takes clang's integer, suffixes included, so `%st(0x1)` and `%st(1u)` are `%st(1)`. Any
other register word glued to `(` is a name, since no assembler takes a register there. In Assembly
`R8(%rsp)` is memory with the displacement `R8`, where ARM's `r8` would otherwise read.

In an instruction operand `%` and a name is a `register` also when the name is no register
(`%VRCX`), since GNU as reads only a register after `%` there and cpp may build the name. `%`, a
name and `(` is a `register` whose child is the `macro_call` (`%VMM(1)`, `%VGPR_SZ(SHIFT_REG, 32)`),
as cpp reads the `%` punctuator and a function-like macro. The scanner writes the `%` as a token of
its own when a name and `(` follow and the name is no register. In directive arguments `%` and a
name that is no register stays a `symbol_type` (`.type f, %function`). Where both fit, as in a macro
argument, the register reading wins. ARM code keeps `symbol_type` in every operand, since its macro
arguments take `%function` and share one closing token with instruction operands.

### Intel keywords

The words are generated from GNU as's `tc-i386-intel.c` (`i386_operators`, with the kind taken from
each operator code, `i386_types`, and the `ptr` and `bcst` that `i386_operator` reads after a size)
and from clang's `X86AsmParser` (the named operators, with the kind taken from the handler each one
calls, and `ParseIntelMemoryOperandSize`):

| Words                                                                                         | Kind     | Assemblers                                         |
| --------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------- |
| `byte`, `word`, `dword`, `fword`, `qword`, `mmword`, `tbyte`, `xmmword`, `ymmword`, `zmmword` | size     | both                                               |
| `oword`                                                                                       | size     | GNU as                                             |
| `float`, `long`, `double`, `xword`                                                            | size     | clang, only before `ptr`                           |
| `ptr`, `bcst`                                                                                 | size     | both, only right after a size word                 |
| `offset`                                                                                      | operator | both                                               |
| `imagerel`                                                                                    | operator | clang                                              |
| `short`, `near`, `far`                                                                        | operator | GNU as, and clang reads `short` only before a name |
| `and`, `or`, `xor`, `not`, `mod`, `shl`, `shr`                                                | operator | both                                               |
| `eq`, `ne`, `lt`, `le`, `gt`, `ge`                                                            | operator | GNU as                                             |

GNU as reads them in any case, clang in lower or upper case, so the words only clang reads take
lower or upper case only (`Float ptr` and `Imagerel` are symbols). clang errors on its size words
without `ptr`, and GNU as reads them as symbols, so `mov eax, float` loads the symbol `float`.
`imagerel` is in LLVM's current source, and clang 22.1 does not read it. `tword`, `type`, `size`,
`length`, `seg`, `dup` and the other MASM words are ordinary symbols in both, since clang reads them
only for MASM and Microsoft inline assembly. `ptr` and `bcst` alone are symbols too (`call ptr`). A
size word alone is a value in GNU as, so `mov eax, byte` loads 1. Every one of these words can name
a label (`byte:`).

### Prefixes

The prefix words are generated from GNU as's `IsPrefix` rows and pseudo-prefixes in `i386-opc.tbl`,
clang's prefix switches and braced prefixes in `X86AsmParser`, and yasm's GAS prefix rows. A column
says whether that assembler's table lists the word:

| Prefix                                                                                                                   | GNU as | clang | yasm |
| ------------------------------------------------------------------------------------------------------------------------ | ------ | ----- | ---- |
| `rep`, `repe`, `repz`, `repne`, `repnz`, `lock`, `data16`, `data32`, `addr16`, `addr32`, `xacquire`, `xrelease`, `rex64` | yes    | yes   | yes  |
| `cs`, `ds`, `es`, `fs`, `gs`, `ss`, `notrack`                                                                            | yes    | yes   | no   |
| `wait`, `bnd`, `rex.` with `w`, `r`, `x`, `b` in that order                                                              | yes    | no    | no   |
| `word`, `dword`, `aword`, `adword`, `ht`, `hnt`, `rex`, `rexx` to `rexxyz`, `rex64x` to `rex64xyz`                       | yes    | no    | yes  |
| `addr64`, `data64`, `qword`, `aqword`                                                                                    | no     | no    | yes  |
| `acquire`, `release`, in Intel syntax only                                                                               | no     | yes   | no   |
| `{vex}`, `{vex2}`, `{vex3}`, `{evex}`, `{rex}`, `{rex2}`, `{nf}`, `{disp8}`, `{disp32}`                                  | yes    | yes   | no   |
| `{load}`, `{store}`, `{disp16}`, `{nooptimize}`, `{noimm8s}`                                                             | yes    | no    | no   |

Prefixes take any case. A pseudo-prefix in braces takes blanks inside and needs none after it
(`{vex}vpdpbusd`), and several may stand in a row (`{load} {disp32} movq`, GNU as). One prefix word
may precede them and any number follow them (`lock {disp32} addl`, GNU as). A pseudo-prefix after a
second prefix word, or after a word that follows another pseudo-prefix, is an error in both. A
prefix alone on a line applies to the next instruction, and `rep; movsb` separates the two with `;`
(see The external scanner).

### Decorators

The decorator words are generated from GNU as's `tc-i386.c` (`RC_NamesTable`, the broadcast counts
of `check_VecOperations`, its zeroing letter, and the word before `=` in `check_Scc_OszcOperations`)
and from clang's `X86AsmParser` (`ParseRoundingModeOp`, the broadcast cases, `ParseZ` and
`parseCFlagsOp`). The masks are the registers of the mask classes, GNU as's `RegMask` in
`i386-reg.tbl` and LLVM's `VK1`.

| Decorator                                               | Notes                                                  |
| ------------------------------------------------------- | ------------------------------------------------------ |
| `{%k0}` to `{%k7}`, `{k0}` to `{k7}`                    | a mask, `{k1}` in clang for AT&T and in both for Intel |
| `{z}`                                                   | zeroing, after or before the mask                      |
| `{1to2}`, `{1to4}`, `{1to8}`, `{1to16}`, `{1to32}`      | broadcast                                              |
| `{rn-sae}`, `{rd-sae}`, `{ru-sae}`, `{rz-sae}`, `{sae}` | rounding, an operand of its own                        |
| `{rn-` and any word `}`, the same for `rd`, `ru`, `rz`  | rounding in clang, which skips the word after `-`      |
| `{dfv=of,sf,zf,cf}`                                     | APX flags, any of the four, also none                  |

Blanks are allowed inside braces and between them, and around clang's `-`. `{z}`, `{1toN}` and the
rounding forms are lower case only, and `{dfv=...}` and the masks take any case. Both assemblers
parse `{k0}` and reject it as a write mask afterwards, so it reads as a mask.

A decorator follows a register, a memory operand or any expression, so a symbol or a macro name
takes one (`vmovdqu8 %zmm0, sym{%k1}`, `GHASHDATA0_XMM{%k1}{z}`), as GNU as and clang accept. In an
instruction operand a blank and a C macro call after a register or memory operand is one of its
decorators (`%k0 COND_MASK(k2)` in glibc, where `COND_MASK` expands to `{%k2}` or to nothing), since
both assemblers take a blank before a decorator. After a name the same shape is a typed operand
(see Operand forms). A C macro call statement may end in decorators, which decorate the last
operand of its expansion (see Expressions, C macro calls).

A brace group after an operand that holds one macro token, or one name the tables list as neither a
decorator word (in any case) nor a register, is a decorator, since the preprocessor expands it
before the assembler checks it. The token is the decorator's child. `{Z}` and `{k0}` stay errors,
and `{k9}` reads as a name.

| Form                           | Tree                                                        |
| ------------------------------ | ----------------------------------------------------------- |
| `%zmm1{\mask}` (GNU)           | `(decorator (macro_argument))`                              |
| `%1{%4}`, `m%1{%%mask}` (NASM) | `(decorator (macro_argument))`, `(decorator (macro_local))` |
| `[o(pd_16305)] {bcstd}` (NASM) | `(decorator (identifier))`                                  |

The scanner reads a pseudo-prefix and a decorator whole, each from its generated table, and writes
a zero-width `_decorator_open` before the `{` of such a brace group after an operand, unless a
separating blank stands before it. A `{` that starts none of them closes what is open.

### Limits

- A file assembled with `-msyntax=intel` or `-masm=intel` and no mode line reads as AT&T, since the
  text does not show the mode.
- The mode follows the text. Across `#if` branches the later line wins, and a macro body reads in
  the mode where it is written.
- A statement's first word is a mnemonic even when it names a C macro, since GNU as cannot tell
  without the definitions.
- Apple's x86-64 output parses, but its `L` temporaries are ordinary labels, since the x86 languages
  follow ELF's `.L` and no language targets Apple x86.
- The grammar reads operand shapes, not instructions, so `movq %al, %rbx` parses.

## NASM

x86 (NASM) reads what nasm 3.02 and yasm 1.3.0 accept, measured with `-f elf64`, `-f elf32` and
`-f bin`, and for format-specific directives with `-f obj`, `-f win32`, `-f win64` and `-f macho64`.
The grammar accepts what either assembler accepts, and the tables say which one does. Where the two
read the same text differently, the grammar follows nasm, the maintained assembler. So `rip` is a
symbol, the AVX-512, AMX and MPX registers are registers, `bnd` is a prefix, braces are decorators
and pseudo-prefixes, and `!` is logical not. The output format is not in the text, so every format's
directives are directives in every file.

### Registers

The register names are nasm's, generated from `x86/regs.dat` by nasm's own `regs.pl`. The registers
yasm reads and nasm does not, its `rip` and its register groups (`st(1)`, `xmm(3)`), are symbols to
nasm and therefore symbols here.

| Family              | Names                                                                                             | nasm                          | yasm                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------- |
| general             | `rax`-`r15`, `eax`-`r15d`, `ax`-`r15w`, `al`-`r15b`, `ah` `bh` `ch` `dh`, `sil` `dil` `bpl` `spl` | yes                           | yes                                                                    |
| APX general         | `r16`-`r31` and their `d`, `w`, `b` forms                                                         | yes                           | no (symbols)                                                           |
| segment             | `cs` `ds` `es` `fs` `gs` `ss`, and `segr6` `segr7` in nasm                                        | yes                           | yes, without `segr6` `segr7`                                           |
| control, debug      | `cr0`-`cr31`, `dr0`-`dr31`                                                                        | yes                           | `cr0` `cr2` `cr3` `cr4` `cr8` and `dr0`-`dr7` (the others are symbols) |
| test                | `tr0`-`tr7`                                                                                       | yes, with an obsolete warning | reserved, but rejects the instruction                                  |
| x87                 | `st0`-`st7`                                                                                       | yes                           | yes                                                                    |
| MMX, SSE, AVX       | `mm0`-`mm7`, `xmm0`-`xmm15`, `ymm0`-`ymm15`                                                       | yes                           | yes                                                                    |
| AVX-512             | `xmm16`-`xmm31`, `ymm16`-`ymm31`, `zmm0`-`zmm31`, `k0`-`k7`                                       | yes                           | no (symbols)                                                           |
| AMX, MPX            | `tmm0`-`tmm7`, `bnd0`-`bnd3`                                                                      | yes                           | no (symbols)                                                           |
| instruction pointer | `rip`                                                                                             | no (a symbol)                 | yes, in `[rip+8]`                                                      |

Names are case-insensitive. A register name cannot be a label (both reject `eax:`), and `$` escapes
it (`$eax:`). `st(0)`, a bare `st`, `r8l`, `db0`, `eiz`, `riz`, `ip` and `eip` are not nasm
registers.

### Prefixes

The prefix words come from nasm. They are the `TOKEN_PREFIX` sections of `asm/tokens.dat` (those
marked `TFLAG_BRC` only in braces), plus the segment registers and `strict`, which `add_prefix` in
`asm/parser.c` also takes. yasm's prefixes are all nasm prefixes too. Measured with nasm 3.02 and
yasm 1.3.0, nasm parses `segr6 nop` with `segr6` as a prefix and then refuses to encode it.

| Words                                                                                     | nasm                | yasm                |
| ----------------------------------------------------------------------------------------- | ------------------- | ------------------- |
| `rep` `repe` `repz` `repne` `repnz` `lock` `xacquire` `xrelease`                          | yes                 | yes                 |
| `o16` `o32` `o64` `a16` `a32` `a64`                                                       | yes                 | yes                 |
| `bnd`                                                                                     | yes                 | no (a label)        |
| `asp` `osp` `nobnd`                                                                       | yes                 | no (a label)        |
| `wait`                                                                                    | yes                 | no (an instruction) |
| `cs` `ds` `es` `fs` `gs` `ss` before an instruction                                       | yes                 | yes                 |
| `segr6` `segr7` before an instruction                                                     | parsed, not encoded | no (a label)        |
| `strict` before an instruction                                                            | yes                 | no (an error)       |
| `{vex}` `{vex2}` `{vex3}` `{evex}` `{rex}` `{rex2}` `{nf}` `{zu}` `{pt}` `{pn}`, any case | yes                 | no (yasm skips `{`) |

Prefix words are reserved in any case, except the words nasm takes only in braces, so `rex nop` is a
colonless label `rex` and `nop`. `notrack`, `data16` and `addr32` are not NASM prefixes, and
`notrack jmp rax` assembles as a colonless label and `jmp rax`. GNU's `{load}`, `{store}`, `{disp8}`
and `{disp32}` are not valid brace tokens in nasm, and neither are `{nd}`, `{cf}` or `{nooc}`.

The decorators are generated from the same file, from its decorator rows (`{1to2}` to `{1to32}`,
`{rn-sae}` to `{rz-sae}`, `{sae}`, `{z}`) and its `dfv=` constants (`{dfv=of,cf}`, also none). The
masks are the registers `regs.dat` lets stand in braces, `k1` to `k7`, since nasm rejects `{k0}` as
a brace token. All of them take any case (`{K1}{Z}`, `{RN-SAE}`, `{DFV=}`), with no blanks inside
the word (`{rn - sae}` is an error).

### Size words and operand keywords

The words are generated from nasm's `asm/tokens.dat`, with the kind taken from each token type and,
for the special words, from their value, and from the `%idefalias` lines of `macros/standard.mac`
that name a token, which spell the function words without `?` (`__utf16__`):

| Words                                                 | Where                                                          | nasm  | yasm                |
| ----------------------------------------------------- | -------------------------------------------------------------- | ----- | ------------------- |
| `byte` `word` `dword` `qword` `tword` `oword` `yword` | before an operand, and first inside a bracket (`[dword ebx]`)  | yes   | yes                 |
| `zword`                                               | the same                                                       | yes   | no (a symbol)       |
| `long`                                                | the same, 32 bits                                              | yes   | yes                 |
| `strict`                                              | before a size word or an operand                               | yes   | yes                 |
| `short` `near` `far`                                  | before a jump or call target                                   | yes   | yes                 |
| `rel` `abs` `nosplit`                                 | first inside a bracket, and in `default rel` and `default abs` | yes   | yes                 |
| `seg`                                                 | unary operator                                                 | yes   | yes                 |
| `wrt`                                                 | after an operand, before a special symbol or a segment         | yes   | also `rip`, chained |
| `to`                                                  | x87 `fadd to st1`                                              | yes   | yes                 |
| `__?masm_ptr?__`                                      | opens a memory operand without brackets                        | yes   | undefined symbol    |
| `__?masm_flat?__`                                     | the flat segment before `:`                                    | yes   | undefined symbol    |
| `ptr`                                                 | a symbol, not a keyword                                        | warns | undefined symbol    |

All of these are reserved in any case. A memory operand is `[` expression `]` with the base, index,
scale and displacement in any order (`[rcx*4+rbx]`, `[-8+rbp]`), blanks anywhere, and a segment
inside (`[fs:0x28]`, both) or before it (`fs:[0x28]`, nasm only). Both reject nested brackets. Far
pointers are `0x10:0x1000`. nasm also takes the MPX split form, a base, a comma and an index
(`[rax+3, rbx]`, `[, rcx*1]`), read with the index in an `index` field, and an address-size prefix
first inside a bracket (`[a32 foo]`). `abs` also stands before an operand (`jmp abs x`), the only
one of the three nasm takes there. With no operand after it, as in `default abs`, it is a plain
argument.

nasm also opens a memory operand at `&` or `__?masm_ptr?__`, with no closing bracket. `&x + 4`,
`dword &x`, `&rel x` and `dword __?masm_ptr?__ x` load from memory as `[x + 4]` and the others do,
and the reference runs to the end of the operand. It is the same `memory_operand`, with the same
modifiers. `%use masm` defines `ptr` and `flat` as these two tokens. The grammar does not expand
macros, so `dword ptr foo` reads `ptr` as a word before an operand (see Macro calls and macro
words). `__?masm_flat?__` reads as the segment `register`, as GAS's `FLAT:` does. yasm takes
neither.

Special symbols start with `..`. They are `..plt`, `..got`, `..gotpcrel`, `..sym`, `..gottpoff`,
`..tlsie`, `..gotoff` and `..gotpc` for ELF, `..start` for obj and `..imagebase` for win64, each
valid in its own output format. `..@` names are the labels nasm generates for macro locals. Any
other `..name` is an error in nasm and an ordinary label in yasm.

### Directives

| Directive                                                                                                | nasm                             | yasm                                                    |
| -------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------- |
| `bits` `use16` `use32` `use64` `default` `section` `segment` `absolute` `extern` `global` `common` `cpu` | yes                              | yes                                                     |
| `default bnd`, `default nobnd`                                                                           | yes                              | no                                                      |
| `static` `required` `float` `sectalign`                                                                  | yes                              | no                                                      |
| `align` `alignb`                                                                                         | yes                              | yes                                                     |
| `struc` `endstruc` `istruc` `at` `iend`                                                                  | yes                              | yes                                                     |
| `db` `dw` `dd` `dq` `dt`, `resb` `resw` `resd` `resq` `rest` `reso` `resy`                               | yes                              | yes                                                     |
| `do`                                                                                                     | floats, strings, `?`             | integers, strings, `?`                                  |
| `dy`                                                                                                     | strings, `?`                     | integers, strings, `?`                                  |
| `dz`, `resz`                                                                                             | yes (`dz` takes strings and `?`) | no                                                      |
| `equ`, `times` (nested `times 2 times 3` in nasm only), `incbin`                                         | yes                              | yes                                                     |
| `[warning ...]`, `[list ...]`, `[dollarhex ...]`, `[debug ...]` (bracket form only)                      | yes                              | `[warning]` ignored with a warning, the others rejected |
| `org`, `[map ...]`                                                                                       | `-f bin`                         | `-f bin`                                                |
| `group` `uppercase` `import` `export`, `..start`                                                         | `-f obj`                         | no                                                      |
| `safeseh`                                                                                                | `-f win32`                       | `-f win32`                                              |
| `osabi`                                                                                                  | ELF                              | no                                                      |
| `subsections_via_symbols` `no_dead_strip`                                                                | `-f macho64`                     | `-f macho64`                                            |

Directive words are case-insensitive and take the bracket form (`[bits 64]`, `[section .text]`).
At the start of a statement they are always directives. `bits:`, `global:`, `extern:`, `common:`,
`cpu:`, `absolute:`, `align:`, `alignb:`, `struc:`, `at:`, `incbin:` and `times:` are rejected, and
`section:` declares a section named `:`. nasm reads `db:`, `dd:`, `resb:`, `equ:` and `istruc:` as
labels (yasm rejects the data words), and a format directive followed by a colon is a label in every
other output format. In an expression `section`, `db`, `align` and `global` are symbols to nasm.

A word with no colon is a label when a data, reserve, `times`, `equ` or `incbin` word follows it
(`x db 1`). nasm also reads `start nop` as a label and an instruction, since it knows `nop`.

### Preprocessor

| Directives                                                                                                     | Argument                                                                  | yasm |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---- |
| `%define` `%xdefine` `%idefine` `%ixdefine`                                                                    | name, optional `(params)`, raw value                                      | yes  |
| `%undef`                                                                                                       | name                                                                      | yes  |
| `%assign` `%iassign`                                                                                           | name, expression                                                          | yes  |
| `%defstr` `%idefstr` `%deftok` `%ideftok` `%defalias` `%idefalias` `%undefalias` `%strcat` `%strlen` `%substr` | name, raw                                                                 | no   |
| `%macro` `%imacro`                                                                                             | name, parameter count (`1`, `1-3`, `0-*`, `1+`, `1.nolist`), raw defaults | yes  |
| `%rmacro` `%irmacro`                                                                                           | read as `%macro` with a "reserved directive" warning                      | no   |
| `%endmacro` (a name after it is accepted)                                                                      | -                                                                         | yes  |
| `%unmacro` `%unimacro`, `%exitmacro`                                                                           | name and count, none for `%exitmacro`                                     | no   |
| `%rotate`                                                                                                      | expression                                                                | yes  |
| `%if` `%elif`                                                                                                  | expression                                                                | yes  |
| `%ifn` `%elifn`                                                                                                | expression                                                                | no   |
| `%ifdef` `%ifndef` `%elifdef` `%elifndef`, `%ifctx` `%ifnctx`                                                  | one or more names                                                         | yes  |
| `%ifmacro` `%ifnmacro`                                                                                         | name and parameter count                                                  | yes  |
| `%ifidn` `%ifidni` `%ifnidn`                                                                                   | raw tokens, two comma-separated lists                                     | yes  |
| `%ifid` `%ifnum` `%ifstr` `%iftoken` `%ifempty` `%ifdirective` `%ifdifi`                                       | raw tokens                                                                | no   |
| `%ifenv` `%ifnenv`                                                                                             | one or more names, strings or `%!NAME`                                    | no   |
| `%ifdefalias` `%ifndefalias`                                                                                   | one or more names                                                         | no   |
| `%iffile`, `%ifusing`, `%ifusable`, and their `n` forms                                                        | a file or package name                                                    | no   |
| `%else` `%endif`                                                                                               | text after them is ignored with a warning                                 | yes  |
| `%rep`                                                                                                         | optional `.nolist`, then an expression, required                          | yes  |
| `%endrep` `%exitrep`                                                                                           | -                                                                         | yes  |
| `%include`                                                                                                     | string                                                                    | yes  |
| `%pathsearch` `%depend` `%use`                                                                                 | name and string (`%pathsearch`), string (`%depend`), name (`%use`)        | no   |
| `%push` `%pop` `%repl`                                                                                         | context name                                                              | yes  |
| `%arg` `%local` `%stacksize`                                                                                   | raw                                                                       | no   |
| `%error` `%warning` `%fatal`                                                                                   | raw message                                                               | yes  |
| `%line` `%clear`                                                                                               | raw                                                                       | yes  |
| `%pragma` `%null`                                                                                              | raw                                                                       | no   |

Every `%if` form above also has an `%elif` form and a negated `n` form, read from `asm/pptok.dat`.

`.nolist` takes any case. In a macro count it must touch the count, since `%macro m 1 .nolist`, with
a blank, makes it a default value, which nasm warns about. Before a `%rep` count only that exact
word counts, so `%rep .nolistx` repeats by the symbol `.nolistx`.

Preprocessor words are case-insensitive, and `%` must touch the word (`% define` is rejected). A
directive counts only as the first token of its line, after blanks. Both assemblers reject
`f: %macro m 0` and `%%l: %rep 2` ("instruction expected"), and the grammar reports them, as GNU's C
preprocessor lines also start their line. A raw value ends at a `;` outside quotes, so
`%define A 1 ; comment` defines `1` and `%define A ';'` defines `';'`. `//` and `/*` start no
comment, so `%define D 10 // 3` keeps the signed division in its value. Text after a closer or
`%else`, and after a complete condition, `%rep` count or macro reference with its parameter count,
is ignored by both assemblers with a warning (`-w+pp-trailing`), and the grammar reads it as raw
text (`%endif done`, `%rep 3 junk`, `%ifmacro m 1 x`). GNU as and clang reject such text, so GNU
syntax keeps the error.

A line that ends with a backslash continues on the next line, in both assemblers and everywhere. The
backslash and the newline are deleted with no space left, in operands, in `%define` values, in
strings and inside `;` comments, so `; note \` comments out the line after it. A blank after the
backslash, or the end of the file, prevents the join, and a CRLF line end joins. The grammar reads a
join as a blank between tokens, as tree-sitter-c does. Comments, strings and raw text continue past
it, and a join inside a token splices it as nasm does (`d\` and then `b 4` is `db 4`, see Grammar
modules). A word that ends right before a join, with a character that cannot continue it on the next
line, keeps the join inside its node. The scanner cannot see past the line end without reading it,
and its zero-width tokens rule out marking the end early. A directive after a line that holds only a
backslash still starts its line, and one after `nop \` does not. GNU syntax joins lines as the C
preprocessor does (see C preprocessor lines).

| Token              | Meaning                                                                                                     | yasm |
| ------------------ | ----------------------------------------------------------------------------------------------------------- | ---- |
| `%1`, `%2`, ...    | macro parameter (`%` and a digit is always one, so `7%2` is an error outside a macro and `7 % 2` is modulo) | yes  |
| `%0`               | parameter count                                                                                             | yes  |
| `%00`              | the label before the macro call                                                                             | yes  |
| `%-1`, `%+1`       | a condition-code parameter, inverted or not                                                                 | yes  |
| `%{1:3}`, `%{-1}`  | parameter ranges                                                                                            | yes  |
| `%%x`              | macro-local label (`%%%x` is an error)                                                                      | yes  |
| `%$x`, `%$$x`      | context-local label, in the current or the enclosing context                                                | yes  |
| `%[expr]`          | indirection                                                                                                 | no   |
| `%?`, `%??`, `%*?` | the macro name as called, as defined                                                                        | yes  |
| `%+`               | joins the tokens on both sides                                                                              | yes  |
| `%!NAME`           | environment variable                                                                                        | yes  |

### Macro calls and macro words

nasm expands single-line macros anywhere on a line, and the parser does not see their definitions,
so it reads the shapes a macro can take. Measured with nasm 3.02 and yasm 1.3.0 and with the test
suites of both, 522 of the 525 upstream test files either assembler accepts parse with no errors.
The other three hold deliberate errors in `%ifdef ERROR` or dead code. libjpeg-turbo's `simd/`
parses with no errors.

| Form                                       | Example                                        | Node                                |
| ------------------------------------------ | ---------------------------------------------- | ----------------------------------- |
| a function-like call in any expression     | `[GOTOFF(eax, PW_ONE)]`, `f (1)`               | `macro_call`                        |
| a call statement, parentheses end the line | `g(1, 2)`, `ERR(rdpid ax)`                     | `macro_call`                        |
| a preprocessor function                    | `%chr(40, 41)`, `%str(%1)`                     | `macro_call`                        |
| a `%map` macro with subparameters          | `%map(alpha:("!"):2, foo)`                     | `macro_reference`                   |
| braces protect commas                      | `m {1, 2}, 3`, `struc {s}`, `align {4}`        | `argument_list`                     |
| parentheses holding a comma, in a call     | `g((1, 2))`                                    | `argument_list`                     |
| a call names a label or an `equ`           | `EXTN(f):`, `f(y) nop`, `f(y) equ 2`           | `label`, `assignment`               |
| a word or macro token before an operand    | `XMMWORD [rsp]`, `kmov %3 %1, %1`              | `typed_operand`, the word as `type` |
| a macro token as a name                    | `%define %$x 1`, `%1:`, `%%a nop`, `%00 equ 3` | the token                           |
| a glued name, with or without blanks       | `%%top_%$x:`, `_t_ %+ %1:`                     | `concatenation`                     |
| a call glued to a name                     | `jmp mangle(x).main`, `[m(x).pass2]`           | `concatenation`                     |
| a number token with letters, an argument   | `INV_TXFM_FN %1, 16x16`, `AVX_INSTR p, 3dnow`  | `identifier`                        |
| a bare `%word` where an operand fits       | `dir %iffile`, `dir [%iffile]`                 | `macro_expansion`                   |

A word followed by `(` has no other meaning in an expression, so a call needs no blank rule. At the
start of a statement the parentheses make a call only when they end the line. Otherwise they open
the first of a multi-line macro's arguments (`m (1) + 2, 3`). Any `%word(` is a function, so a new
nasm function reads without a table. A bare `%word` is valid only as a macro argument and never
starts a statement, so `f: %define X 1` stays an error.

A name or a macro token followed by an operand is a macro the assembler expands first, such as a
size (`%define XMMWORD`), an operator, or `ptr` under `%use masm`. Both assemblers reject the same
text when the word is no macro. The parser does not see the definition, so it reads the word as the
`type` of a `typed_operand`, like `dword`. A register or a number before an operand is never a
macro, so `mov eax 1` and `push 1 2` stay errors. `x[ebx]` and `8 [ebx]` stay displacements. With a
blank, `x [ebx]` reads `x` as a type, the form of a macro-defined size. As a limit, nasm reads a
symbol there as a displacement, and here the blank decides.

A macro token names whatever a symbol names, such as defines, assignments, labels with or without a
colon, macros, structures, declared symbols and `equ`. A dot name or a `$` name alone on its line is
a label (`.end`), as nasm reads it, and a plain word alone stays a macro call. A word followed by a
data word or a mnemonic and then a comma is a macro call with that word as its first argument
(`SBUTTERFLY dq, %2`, `AVX_INSTR pfadd, mmx`). Both assemblers reject a label there. A name
escaped with `$` keeps any name characters after it, `$` included (`$$foo`, `$$$foo`), and `$3`
names a symbol where only a name can stand, for `[dollarhex off]`.

Single-line macro parameters take nasm's modifiers `=x` (evaluate, with a radix such as `=x/x`),
`&x` and `&&x` (quote), `!x` (keep blanks), `x+` (greedy), and empty parameters (`(a, =b, )`).

Data lists follow the manual's grammar, with `%(...)`, a size before parentheses
(`dw byte (?, 44)`), and `dup` with an optional size before its list. A list may hold lists, but not
as its last item. `db 2 dup (2 dup (0), 1)` assembles and `db 2 dup (1, 2 dup (0))` is an error in
both assemblers. A list still open at the end of its line may end with anything, so typing a nested
list never changes the lines around it.

A braced prefix may follow the mnemonic (`add {nf} eax, ecx`, `add{evex} dword [rdx], 16`). A brace
constant (`{dfv=of,cf}`) is a value in any expression. At the start of an operand it is the whole
operand, so `ccmpl {dfv=of} rdx, r30` needs no comma, as in nasm's parser.

### Structures

`struc`, `endstruc`, `istruc`, `at` and `iend` are standard macros in both assemblers, not syntax.
The generated table reads them from `macros/standard.mac` and its yasm counterpart, and they take
any case.

| Node                 | Form                                  | Fields                   |
| -------------------- | ------------------------------------- | ------------------------ |
| `structure`          | `struc name[, offset]` ... `endstruc` | `name`, `offset`, `body` |
| `structure_instance` | `istruc name` ... `iend`              | `name`, `body`           |
| `field_initializer`  | `at field[, data]`                    | `field`, `statement`     |

A name is a symbol, a `.name` or a macro token (`%1`, `%%a`, `%$a`, `%1_b`). The offset and the
field are expressions, and a comma with nothing after it is accepted. The body of a `structure` is a
`structure_body`, in which `.x: resd 1` and `mt_long: resd 1` are both a `label` and a `directive`.
A label there opens no block, since a field does not own the lines after it.

The data of an `at` line is a line of its own, since the macro expands it as `%2` on its own line.
It may be an instruction, a data directive, another directive, a macro call, `times`, `equ`, a
structure or an instance, with a label in front (`at s.x, l: dd 1`). It sits in a `statement` field,
as in `times` and `align`. More data may follow on the next lines, as siblings of the `at` line.

As macros, the blocks need not balance where they are written. Both assemblers accept each of these
cases, and the grammar reads them:

- An `at` line reads anywhere, not only in an instance, since a macro or a `%if` may hold it.
- A closer with no open block of its kind is a plain `directive`. `%macro f 0` with `endstruc` in
  its body is valid, and so is `endstruc` in both branches of a `%if`.
- `%endmacro`, `%endrep`, `%endif`, `%else` and `%elif` end a structure or instance opened inside
  their block, so `%if 1`, `struc a`, `%endif`, `endstruc` reads with no error.
- A block with no closer is accepted, and its body is an `unclosed_body`, as for the other blocks.

A label may stand before each of the five words, with or without a colon. `iend`, `endstruc`,
`use16` and the other standard macros that take no parameters may also name a label (`iend: nop`),
which both assemblers accept with a warning. The table reads that from the macro's parameter count.
Every other standard macro is reserved, since `at: nop` would be a call of `at`.

Limits:

- A body takes any statement. `mov eax, 1` in a `struc` body parses, though both assemblers reject
  code in an absolute section.
- A stray `endstruc`, or `endstruc` closing an `istruc`, is no error here, though both assemblers
  reject it outside a macro. The grammar cannot tell it from the valid forms above.
- A `%` directive as the data of an `at` line (`at s.x, %define y 1`) is an error here, though both
  assemblers accept it, since a directive counts only as the first token of its line.
- `iend nop` reads as a directive with an argument, and `istruc: nop` as an error. Both assemblers
  read the first as a label before `nop` and the second as an instance named `: nop`.

### Numbers and operators

| Form                                                                                                                                              | nasm              | yasm            |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------- |
| `0x1f` `0X1F` `1fh` `17o` `17q` `101b`                                                                                                            | yes               | yes             |
| `$1f`                                                                                                                                             | deprecated, warns | yes             |
| `0h1f` `0o17` `0q17` `0b101` `0y101` `101y` `0d99` `99d` `0t99` `99t`, `1fx`, and `0x` and `0h` as zero                                           | yes               | no              |
| `_` between digits (`1_000`, `0x_ff`)                                                                                                             | yes               | in `0x_ff` only |
| `1.5` `1.` `1.e10`                                                                                                                                | yes               | yes             |
| `1e10` `1E+5`, `0x1.8p0` `0x1p3` `0b1.1` `0o1.1`, `1_000.5`                                                                                       | yes               | no              |
| `__?Infinity?__` `__?QNaN?__` `__?SNaN?__`, `__Infinity__`-style spellings                                                                        | yes               | no              |
| `__?float32?__(1.5)` and the other float functions (`float8`, `float16`, `bfloat16`, `float64`, `float80m`, `float80e`, `float128l`, `float128h`) | yes               | no              |
| `__?utf16?__ 'ab'`, `__?utf16?__('ab')` and the other string functions (`utf16le`, `utf16be`, `utf32`, `utf32le`, `utf32be`)                      | yes               | no              |
| `__?ilog2e?__ 64`, `__?ilog2e?__(64)` and the other integer functions (`ilog2w`, `ilog2f`, `ilog2c`)                                              | yes               | no              |
| `'a'` `"ab"`                                                                                                                                      | yes               | yes             |
| `` `c` `` with C-style escapes (`\n`, `\x41`, `\u263a`, `\e`) and control escapes (`\^@`, `` \^` ``)                                              | yes               | no              |
| `?` (uninitialized)                                                                                                                               | yes               | one per line    |

nasm's manual calls the float, string and integer functions special operators, and its evaluator
reads them as prefix operators, so each is the `operator_word` of a `unary_expression`, as `seg` is.
A float function needs its parentheses (`__?float32?__ 1.5` is an error), and the others take any
operand, parenthesized or not. Each also has a spelling without `?` (`__float32__`, `__utf16__`,
`__ilog2e__`) from `standard.mac`. `bfloat16` has none, so `__bfloat16__` is a symbol.

`.5` is a local label, not a float, and `$af` is the symbol `af`, not a number, since `$` makes a
number only before a digit. `$` alone is the current position and `$$` the start of the section.
`?x` is a name, so `1 ?x : 3` is an error, and the conditional needs a blank after `?`. Floats are
accepted in data directives. nasm rejects them as instruction operands, and yasm does not.

Operators bind as in C, measured with `dd` values (`2 + 3 << 1` is 10, `1 | 2 ^ 3` is 1,
`3 & 1 == 1` is 1, `1 ? 0 ? 5 : 6 : 7` is 6). From the loosest, the levels are `?:` (nasm only,
right-associative), `||`, `^^`, `&&` (nasm only), the comparisons `=` `==` `!=` `<>` `<` `<=` `>`
`>=` and `<=>` (`<=>` nasm only), `|`, `^`, `&`, the shifts `<<` `>>` `<<<` `>>>`, `+` `-`, then `*`
`/` `//` `%` `%%`, and the unary `-` `+` `~` `!`, `seg` and the special operators. nasm accepts
every operator in instruction operands and `%if` alike. yasm skips `!` and misreads `>>>`. Division
with `/` and `%` is unsigned (`-7 / 2` is -4 in 32 bits in nasm), `//` and `%%` signed.

### Blocks

| Case                                                                     | nasm                      | yasm     |
| ------------------------------------------------------------------------ | ------------------------- | -------- |
| `%if`, `%macro` or `%rep` open at the end of the file                    | error                     | error    |
| `struc` or `istruc` open at the end of the file                          | accepted                  | accepted |
| `%endif`, `%endmacro`, `%endrep` with nothing open                       | error                     | error    |
| a second `%else`, or `%elif` after `%else`                               | warns, ignores the branch | accepted |
| `at .x` with the short field name                                        | accepted                  | error    |
| `at field` with no data, `at field, times 4 db 0`                        | accepted                  | accepted |
| blocks nested in any order, `struc` inside `%if`, `%macro` inside `%rep` | accepted                  | accepted |

The grammar closes every open block at the end of the file, as for GNU syntax, so typing an opener
never breaks the lines below it.

### Limits

The parser reads the text as written and expands no macro, so some valid files read with errors:

- A macro named like an instruction or directive reads as that instruction or directive. After
  `%macro mov 1`, both assemblers accept `mov 1 2` as a call with the one argument `1 2`, and here
  it is a `mov` with a missing comma. The definition may be in another file, which the parser cannot
  open.
- Both branches of a `%if` parse, since choosing one needs the condition's value. `mov eax 1` inside
  `%if 0` is an error here, and both assemblers skip it.
- A macro body parses where it is written, not as it expands. `mov eax, 1 %1` in a body is an error
  here, and `m +2` makes it `mov eax, 1 +2` for both assemblers.
- A `%define` value is raw text, since it may hold any tokens, and its uses parse where they appear.
- With a blank, `x [ebx]` reads `x` as a size (see Macro calls and macro words), while nasm reads a
  symbol there as a displacement.
- A `%` directive counts only as the first token of its line, so `at s.x, %define y 1` is an error
  here (see Structures).

## Editor behavior

Each language's comment markers are exactly the characters its assemblers accept at the start of a
line. They are `//`, `#` and `@` in ARM, `//`, `#` and `;` in ARM (Apple), `//` and `#` in x86
(GAS), all four in Assembly, and `;` in NASM. Enter after a full-line comment starts the next line
with the same marker, and a comment after code does not continue. Toggle comment inserts `//`, which
GNU as and clang accept at the start of a line on every target, and `;` in NASM.

A `#` line that is a C preprocessor directive is not a comment. There the `preproc` scope limits the
markers to `//`, and Enter after `#define X 1` or `#endif /* X */` inserts nothing. As a limit, at
the end of a file, with nothing after the cursor, Zed ignores scopes and uses the base markers, so
Enter after `#define X 1` inserts `#` and a space, and `/*` closes inside a comment. Zed's own
languages behave the same.

GNU as and clang accept `/* */` block comments. `/*` followed by Enter adds the closing `*/` and
starts the new line with a space, `*` and a space. NASM has no block comments.

`[`, `(` and `{` close everywhere. `"` closes outside strings. `'` closes outside strings and
comments, since clang accepts only `'a'`, GNU as accepts `'a` and `'a'`, and in a comment `'` is
usually an apostrophe. `/*` closes outside strings and comments. NASM closes all three of its string
quotes, `"`, `'` and backquote. A pair closes only when a space, the end of the line or one of `,`
`;` `)` `]` `}` follows, the characters that can come after a closing bracket in assembly, so typing
`(` before `.Lend` inserts no `)`. Enter between a pair gives a plain new line. In the ARM languages
`[ ]` and `{ }` are bracket pairs, so Zed highlights the partner and Move to Enclosing Bracket jumps
between them. In NASM `[ ]`, the `{ }` of a brace argument and the `%(` of a data list with its `)`
are bracket pairs.

Double-click selects what the grammar reads as one name. `.` joins `.Lloop` and `b.eq`, `$` joins
`foo$1`, and `%` joins `%rax` and `%function`. NASM adds `?`, `@` and `#`, which its names may
contain.

Enter after a label indents one level, and typing `name:` on an indented line moves it back one
level. Labels stay at the level of the block around them, and code sits one level in. Both come from
the parse. A label opens an indent range from its end to the end of the file, label block or block
body that holds it, and moves back by cutting the range around it. Only what the parser reads as a
label counts, so a reserved word (`eax:` in NASM), a `name:` inside a comment, and a macro-call
label nested to any depth (`L(a(b(x))):`) behave as the parser reads them. Tab size and hard tabs
come from the user's Zed settings.

A label in a NASM `struc` is a field and stays where it is typed. A new line follows the field above
it, so a structure keeps its layout. The nasm manual and nasm's tests indent fields, and
libjpeg-turbo and yasm's tests keep them at column 0. Nothing moves a field, so a field typed on its
own line (`.x:`) indents the next line through the pattern below, and a field typed there stays at
that level.

Enter after a line that opens a block (`.macro`, any `.if` opener, `.elseif`, `.else`, `.rept`,
`.irp`, `.irpc`, and in NASM `%macro`, `%imacro`, any `%if` or `%elif` opener, `%else`, `%rep`,
`struc`, `istruc`) indents one level. A NASM block word counts only at the start of its line, as
nasm reads it, so no label comes before it. Typing a clause or a closer aligns it with the line that
opened its block, whatever the indentation of the body, and a body may also stay flush with its
opener, as in the Linux sources. A block opened and closed on one line (`.rept 2; nop; .endr`) does
not indent the next line, except in ARM (Apple) and NASM, where `;` starts a comment. Section
directives such as `.text` keep the indentation they are typed with, so both styles stay.
Hand-written GNU code indents them in 81 of 97 surveyed lines (Linux, glibc and FreeBSD indent, musl
does not), and compiler output always does. `#if` and `#ifdef` bodies get no indentation and no
structure, since `.S` files keep them at the indentation of the code around them (Linux, glibc).

Two mechanisms do this, as in Zed's own languages:

- The tree. `indents.scm` in `queries/core` gives every block body an indent range (`body`, and
  `unclosed_body` for a block that the end of the file closes) and every label a range from its end
  (`@start`) to the end of the node that holds it. Every label is also an `@outdent`, which cuts the
  innermost range holding it, so a label moves back to the opener of that range and ends the range
  of the label before it. A `structure_body` has an indent range too, and its labels have neither
  capture. A clause or a real closer always ends a `body`. Zed aligns a line with the start row of a
  range that ends at the start of that line, so each clause and closer goes to its own opener, also
  after a closed inner block at the same column. The extension sets no `decrease_indent_patterns`.
  With them Zed, as in its Bash and Python, aligns a matching line with the nearest opener at or
  left of it, closed or not, which fits Python's column blocks and not keyword blocks.
- A pattern. Zed indents from a tree range only when the range ends after the start of the new line.
  No range does that on the last line of a file, where a block or label still being typed ends, so
  Enter after an opener or a label uses `increase_indent_pattern`, as Zed's Ruby, Bash and Python
  do. `scripts/lib/indent.ts` generates it. Its label part takes the label forms in `lexical.js`. In
  GNU syntax these are plain and dot names, digits (`1$` too in ARM and Assembly), quoted names,
  names built from macro arguments (`\name\()_end:`) and macro calls (`L(loop):`). In NASM they are
  names with `$`, `?`, `@` or `.`, `%%x` and `%$x`. A blank may come before the colon. NASM's
  reserved names, read from the scanner's tables, are left out as a trie complement. Its block part
  takes the block kinds of the language's syntax (a kind names its syntax in `languages.config.cjs`,
  or belongs to all) and, from `scanner.h`, each syntax's block words and each dialect's strings,
  comments and reading of `;`, `#` and `@`. A kind with no opener word in a dialect of its syntax
  stops the build. The block part matches a line that holds an opener with no closer of the same
  kind in a later statement of the line, and it reads strings, character constants and comments as
  the scanner does.

  The label part leaves out a label followed by a word that ends the label's range on its own line,
  read from the generated tables as a word complement. In every syntax that is a block closer or
  clause (`a: .endm`, `b: .else`). The closer ends the body that holds the label, and a clause still
  indents through the block part. In NASM it is also a word that names its statement (the data and
  reserve words, `times`, `at`, the structure words, and `equ`, after which the parser reads an
  assignment and no label), as in `.x: resd 1`, `.a: times 4 resd 1` and `n: equ 3`. A pattern match
  outranks nearly every tree range and does not see the enclosing structure. Without the exclusion
  each new field would indent, and `endstruc` right after a field would land too deep. At the end of
  a file Enter after `buf: resb 4` keeps the level, and elsewhere the label's tree range indents the
  next line. A test parses every label form with each grammar, followed by nothing, by code and by
  each of these words, and checks that the label part matches a line exactly when the parser reads a
  label at its start whose range goes on past the line.

The pattern has five limits where it differs from the parser, each beyond a regular expression. Each
changes only whether the next line starts indented:

- The same block kind opened twice and closed once on one line (`.if A; .if B; .endif`).
- In ARM, a `#` comment on an opener line that contains `; .endr`. The scanner reads `#` as an
  immediate or a comment by whether an operand fits there.
- A label built from a macro argument before a closer on the same line.
- A macro-call label nested deeper than eight parentheses, on the last line of a file. Enter after
  it does not indent there, since only the pattern applies and a regular expression cannot count.
  Elsewhere the tree indents under it.
- A clause after `.endr` or `.endm` on its line. The pattern reads it as the end of the clause's
  conditional, while the closer may instead close a repeat block or macro inside that conditional.

Zed looks for indentation ranges within 16 KB around the edited line, so a closer typed more than
about 8 KB below its opener is not re-aligned, as Zed's C does for `}`. At the end of a file, a line
typed after a blank line starts at column 0, since Zed applies the pattern only to the line right
after the one it matches. It takes the indentation of its label or block from the tree as soon as
its first character is typed. The assembly languages keep Zed's default
`auto_indent_using_last_non_empty_line`, as its C does. Zed's Python and Bash set it to `false`,
with which Enter on an empty line of saved code, whose blanks Zed strips on save, goes to column 0.

While `.elseif` is typed, the line passes through `.else`. It moves out, back in at `.elsei`, and
out again at `.elseif`. `.endm` to `.endmacro` does the same, as Zed's Bash does with `fi` and
`file`.

The outline lists every global label with its local labels nested under it (`.L` names in the ELF
dialects, `L` names in ARM (Apple), dot names in NASM), macros (`.macro m`), `#define` names
(`#define F( )` for function-like ones, as Zed's C shows them) and assigned names (`NAME = expr`,
and `.equ`, `.set`, `.equiv` and `.eqv` with a name and a value). `.set noreorder` stays out. NASM
lists `%macro m`, the `%define` family (`%define N`, `%define F( )`, `%assign K`), the name of
`x equ 1`, and structures (`struc point`) with their fields. Universal Ctags, Eclipse CDT, asm-lsp,
ASM Code Lens and Emacs nasm-mode list the same kinds, and none of them lists sections. Numeric
labels are reused many times and stay out, as in ctags. Sections stay out. Compilers switch sections
inside a function (`-ffunction-sections`, jump tables in `.rodata`), so a section would cut a
function in two. Breadcrumbs show the label block around the cursor, and the comments right above an
item are its annotation, as in Zed's C.

In vim mode `af` selects a label block, from its label to the next global label, and `if` the
statements after the label. `ac` and `ic` select a macro and its body, and in NASM also a structure
or an instance. `gc` selects a comment, with consecutive line comments as one, as in Zed's Rust.

The condition of `#if` and `#elif` is injected as C, so Zed's C grammar colors it. `#define`
values stay plain, since in `.S` files they are often assembly (`#define SAVE push %rbp`).

The debuggers are CodeLLDB, then GDB. CodeLLDB runs on Linux and macOS, and GDB does not run on
Apple silicon.

## Highlighting

| Element                                                          | Capture                                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------- |
| Instruction, also glued (`no\s`)                                 | `@keyword`                                                    |
| Global label definition                                          | `@function.definition`                                        |
| Local or numeric label, defined or used                          | `@label`                                                      |
| Other symbol, assigned name                                      | `@constant`                                                   |
| Integer, float, `#` and `$` sigils                               | `@number`, `@punctuation.special`                             |
| Register, register alias name, predicate `p0/z`                  | `@variable.special`                                           |
| Condition in a condition slot                                    | `@keyword.operator`                                           |
| `=` of a literal pool                                            | `@punctuation.special`                                        |
| String, escape, character                                        | `@string`, `@string.escape`, `@string`                        |
| Directive, block word (`.macro`, `.if`, `.endr`)                 | `@keyword.directive @preproc`                                 |
| C preprocessor directive                                         | `@keyword.preproc @preproc`                                   |
| Symbol type                                                      | `@type.builtin`                                               |
| Relocation specifier (`@PLT`, `:lo12:`, `(GOT)`)                 | `@attribute`                                                  |
| SystemTap probe `@` (`4@%eax`)                                   | `@punctuation.special`                                        |
| Shift operator                                                   | `@keyword.operator`                                           |
| x86 prefix and pseudo-prefix (`lock`, `{vex}`)                   | `@keyword`                                                    |
| Intel size and type words (`dword ptr`, `near`)                  | `@keyword`                                                    |
| Intel `offset`, `imagerel` and `short`                           | `@keyword`                                                    |
| Intel operator word (`shl`, `and`, `not`, `eq`)                  | `@keyword.operator`                                           |
| NASM operator word (`seg`, `dup`, `__?utf16?__`)                 | `@keyword.operator`                                           |
| AVX-512 decorator (`{%k1}`, `{z}`, `{rn-sae}`)                   | `@attribute`                                                  |
| C macro call in an operand or a label (`L(loop)`)                | `@function.special`                                           |
| Location counter `.`                                             | `@constant.builtin`                                           |
| Operators, brackets, delimiters, and `!`, `^`, `-`               | `@operator`, `@punctuation.bracket`, `@punctuation.delimiter` |
| Comments, including on `#` lines                                 | `@comment`                                                    |
| Macro name                                                       | `@function.special.definition`                                |
| `#define` name, of a function-like macro                         | `@constant`, `@function.special`                              |
| Macro parameter and argument, keyword argument name              | `@variable.parameter`                                         |
| `\()` in a glued name                                            | `@punctuation.special`                                        |
| `#if` and `#elif` condition                                      | Zed's C highlighting, injected                                |
| Section a `.section` or `.pushsection` switches to               | `@namespace` (segment and section in Mach-O)                  |
| NASM block word (`%macro`, `%if`, `struc`, `at`, `times`, `equ`) | `@keyword.directive @preproc`                                 |
| NASM preprocessor line (`%define`, `%include`)                   | `@keyword.preproc @preproc`                                   |
| NASM macro token (`%1`, `%%x`, `%$x`, `%[x]`)                    | `@variable.parameter`                                         |
| NASM `%define` name, of a macro with parameters                  | `@constant`, `@function.special`                              |
| NASM parameter count (`1-3`, `0-*`)                              | `@number`                                                     |
| Structure name in `struc` and `istruc`                           | `@type`                                                       |
| NASM `$`, `$$` and `?`                                           | `@constant.builtin`                                           |
| NASM `rel`, `abs`, `strict`, `wrt`, sizes, prefixes              | `@keyword`                                                    |
| NASM `..plt`, a decorator, `.nolist`                             | `@attribute`                                                  |
| x86 (GAS) name before an operand (`__percpu 4(%esi)`)            | `@keyword`                                                    |
| NASM word before an operand (`XMMWORD [rsp]`)                    | `@keyword`                                                    |
| NASM macro call, preprocessor function, `%map` reference         | `@function.special`                                           |
| NASM glued label (`a%1:`)                                        | `@function.definition`                                        |
| NASM `{ }` of a brace argument, `%(` of a data list              | `@punctuation.bracket`                                        |
| NASM `%+` in a glued name                                        | `@punctuation.special`                                        |
| Section a `section` or `segment` switches to                     | `@namespace`                                                  |

`!` after a memory operand or a register, `^` after a register list and `-` in a range are
operators, and so are `*` before an x86 indirect operand and `%` as a remainder. A label named by a
macro call (`L(loop):`) takes the call's capture, since its uses look like any other call. Planned
are control-flow instructions as `@keyword.control`, branch targets as `@function`, and data labels.

## Checks

The tooling is TypeScript run by Bun, and the scripts in `package.json` are its commands. Every
command runs in a container that `scripts/dev` and `scripts/zed` start with `--network=none`, so no
check, test or script reaches the network. Only the image build and `scripts/fetch-sources`, which
run on the host, download anything. The image pins Bun, its npm tools and dprint with its plugins,
and `bunfig.toml` turns off Bun's automatic package installs, so importing a package the image lacks
fails at once. `scripts/dev --sources DIR` also mounts DIR read-only at `/sources`, for the commands
that read upstream sources and real code. Podman relabels a tree mounted with `z` for SELinux,
rewriting the label of every file in it (about 150,000 in LLVM) on each run, so that container runs
with `--security-opt label=disable` instead and DIR stays untouched. `test/unit/commands.test.ts`
requires a row in the table below for every script, `--network=none` as the only network option of
both launchers, and a read-only `/sources` mount that is never relabeled.

All hand-written code and configuration, and what the generators write, is indented with four
spaces. Only test data keeps hard tabs, and `.editorconfig` tells editors the same. dprint formats
TypeScript, JavaScript, JSON, Markdown and YAML to 100 columns, with single quotes and braces on
every block. clang-format formats the C by `.clang-format`, with 100 columns, a function's brace on
its own line, a line break before a binary operator, one `&&` or `||` operand per line once a
condition breaks, and aligned macros. It needs clang-format 23, the first to read the per-operator
`BreakBinaryOperations` setting. oxlint fails on every correctness rule of its eslint, typescript,
unicorn, oxc and import plugins and on the further rules in `.oxlintrc.json`, among them `curly` for
every block, `eqeqeq`, and `import/extensions`, which requires the file extension in every relative
`import` and `require`. A disable comment that hides nothing is an error. `tsc` from TypeScript 7
checks every TypeScript file in `scripts/` and `test/` with `strict` and the unused-name,
switch-fallthrough and `override` checks, and, with `skipLibCheck` off, the type packages as well.

| Command                   | What it does                                                                                                                                                                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run test`            | every check except the sanitizers (formatting, lint, types, generated files and parsers up to date, unit and performance tests, C checks, shell checks, corpus tests, queries, fixtures)                                                                                                          |
| `bun run build`           | writes the files generated from `languages.config.cjs` and `queries/`                                                                                                                                                                                                                             |
| `bun run generate`        | runs `build`, then regenerates all five parsers                                                                                                                                                                                                                                                   |
| `bun run set-grammar-rev` | pins the commit Zed fetches the grammars from (`bun run set-grammar-rev <sha>`) and runs `build`                                                                                                                                                                                                  |
| `bun run keywords`        | regenerates `tree-sitter/common/keywords.h` from the upstream sources at `/sources` (`scripts/dev --sources DIR`, see Generated tables), not a check                                                                                                                                              |
| `bun run real-code`       | every file of every file set in `test/real-code/sources.gitconfig` parses without an error in each of its languages outside the never-taken branches of a `[group]` guard, from the clones at `/sources` (`scripts/dev --sources DIR`), and `--summary` counts every error line by its first word |
| `bun run fmt`             | formats with dprint, and the C scanner with clang-format                                                                                                                                                                                                                                          |
| `bun run lint`            | oxlint                                                                                                                                                                                                                                                                                            |
| `bun run check:types`     | `tsc` on every TypeScript file                                                                                                                                                                                                                                                                    |
| `bun run check:generated` | fails if a generated file or parser differs from what the build and `tree-sitter generate` write                                                                                                                                                                                                  |
| `bun run check:c`         | clang-format, GCC and clang with strict warnings as errors, both static analyzers, clang-tidy, that `scanner.h` rejects zero or two dialect macros, that each dictionary finds every word and no other (`test/c/words.c`), and that each grammar built to wasm imports only what Zed supplies     |
| `bun run check:shell`     | shellcheck, with every optional check, on every script with a shell shebang                                                                                                                                                                                                                       |
| `bun run check:queries`   | compiles every generated query against its grammar                                                                                                                                                                                                                                                |
| `bun run check:fixtures`  | every fixture, and a CRLF and a no-final-newline copy of it, assembles with the real toolchains, and every fixture parses without errors                                                                                                                                                          |
| `bun run test:unit`       | the unit, highlight, tree, typing and structure tests in parallel, then the performance tests alone                                                                                                                                                                                               |
| `bun run corpus`          | composes each grammar's corpus tests from `test/corpus/`                                                                                                                                                                                                                                          |
| `bun run test:corpus`     | runs `corpus`, then the corpus tests of all five grammars                                                                                                                                                                                                                                         |
| `bun run sanitize`        | corpus and fuzzing against parsers built with AddressSanitizer and UndefinedBehaviorSanitizer                                                                                                                                                                                                     |
| `bun run budgets`         | measures each grammar's parse cost with callgrind and writes it to `test/budgets.json` with the states and parser size, not a check                                                                                                                                                               |
| `bun run check:budgets`   | measures the baseline tree at DIR and this tree in the same image and fails on any cost change `test/budgets.json` does not declare (`bun run check:budgets DIR`)                                                                                                                                 |
| `bun run bench`           | prints parse, edit and query times, states and parser size for every grammar, not a check                                                                                                                                                                                                         |
| `bun run zed:qa`          | the `docs/qa.md` checks, which `scripts/zed` runs in the container that holds Zed and a display                                                                                                                                                                                                   |
| `scripts/zed`             | the `docs/qa.md` checks in the real Zed app, in Podman on a virtual display                                                                                                                                                                                                                       |
| `scripts/fetch-sources`   | fetches the real code pinned in `test/real-code/sources.gitconfig` into a directory, on the host (`--update DIR` first moves each pin to its branch head), not a check                                                                                                                            |

`scripts/zed` builds the `zed` stage of the Containerfile, with Xvfb, xdotool, Mesa's software
Vulkan, and Zed from its official install script, always the latest release. It compiles each
grammar to wasm with the flags the tree-sitter CLI uses, installs the result as an ordinary
extension folder and drives Zed with keystrokes. Each check compares the saved file, or what a step
copied, read with xclip. The vim checks run last, after vim mode is turned on in the settings. The
network is off and each run starts from an empty Zed profile. The files Zed opens live in the
container's home, outside the repository, so Zed never reads the repository's git data. The run
prints each result as it finishes, records a check that throws as failed and continues, and keeps
the Zed log either way.

Zed loads every grammar as wasm through tree-sitter's wasm runtime, which supplies a module with 25
C library functions only (`malloc`, `memcmp`, `strlen`, `towlower` and the like, listed in
`lib/src/wasm-stdlib/imports.txt` at the tree-sitter revision Zed pins). A grammar that calls any
other, such as `strchr`, fails to load, and Zed opens its files with no language.
`scripts/lib/wasm.ts` reads the import section of each built module and holds that list, and
`check:c` and `scripts/zed` both refuse a module that imports anything else.

`test/real-code/sources.gitconfig` pins the real code. For each source it holds a URL, branch and
commit, and for each file set a source, `include` and `exclude` globs and the languages that parse
it. `scripts/fetch-sources DIR` runs on the host with `sh` and `git`. Per source it fetches the
pinned commit into `DIR/<source>` with `--depth 1 --filter=blob:none` and a non-cone sparse checkout
of the `include` globs, 22 MB for all three. With nothing changed it does nothing, and `--update`
first moves each pin to its branch head. It checks the whole pin file before writing anything and
refuses a `DIR/<source>` that is not a sparse checkout of the pinned URL. Sparse patterns are
last-match-wins across file sets, so `bun run real-code` applies the excludes.
`scripts/lib/real-code.ts` parses the pin file and rejects what git would read differently (quotes,
escapes, `#` or `;` in a value, upper-case names, repeated sections).

`bun run real-code` first checks each clone against the pins. Its HEAD is the pinned commit, its
sparse patterns are the includes, every checked-out file matches an include and every include
matches a file. `scripts/lib/wildmatch.ts` matches globs as git's wildmatch does for sparse
patterns. It matches on bytes, `*` and `?` stop at `/`, `**` spans directories only between slashes,
brackets take ranges, `!` or `^` and the POSIX classes, and a path matches when it or a parent
directory does. A file fails when tree-sitter reports an error in its tree (`--json-summary`), and
the error lines come from a query for every ERROR and MISSING node. One parse and one query run per
language cover all files.

A `[group]` section names text that no build of a source assembles. It holds the source, `guard`
globs over C macro names (`*` stands for name characters) and `verified`, the commit at which the
whole tree was searched for the guards. The check reads each file's conditional groups as cpp does.
It splices lines first, then replaces each comment with a blank, and a quote that its line does not
close runs to the line end, as in clang's assembler mode. A branch whose condition tests only a listed guard's
definition (`#ifdef`, `#elifdef`, `#if defined(G)`) is never taken, and so are the branches after
one that tests its absence (`#ifndef`, `#if !defined G`). Error lines inside a never-taken branch
are expected, and the report counts them. Every other error line still fails its file.

| Section                        | Guard              | Text                                          |
| ------------------------------ | ------------------ | --------------------------------------------- |
| `[group "glibc SVML layouts"]` | `__svml_*_typedef` | the C layouts of glibc's x86 SVML data tables |

The check stops when `verified` is not the pinned commit, when a checked-out file defines a guard
(`#define`, `#undef` or a `-D` flag), and when the guards guard no group. After `--update` moves a
pin, the guards are searched in the whole tree at the new commit, a full clone at that revision
(`git clone --depth 1 --revision=COMMIT URL DIR`), before `verified` is set to it.

`bun run budgets` measures each grammar's parse of its two bench inputs, `basics` and the fixtures
joined, under callgrind's cache simulation, and writes the cost to `test/budgets.json` with the
states, the parser.c size and a hash of each input. The cost is gungraun's estimated cycles, L1 hits
plus 5 times LL hits plus 35 times RAM accesses. Measured on the x86 (GAS) parser against M4's,
instruction counts rate it 0.3% cheaper, wall-clock time about 3% slower, and the estimate, which
includes the cache misses of the keyword dictionary, 0.9% dearer. Callgrind collects inside
`ts_parser_parse` only, with a fixed cache model (32 KiB 8-way L1 caches, a 16 MiB 16-way LL, 64 B
lines) and `LD_BIND_NOW=1`, which keeps dynamic linking outside. Each library and input is copied to
one fixed path first, since a longer path moves the buffers and with them the cache misses. The same
parser on the same input then repeats its count exactly.

The count still moves with the image's compilers and glibc, which CI rebuilds weekly, so the check
compares within one image. `bun run check:budgets DIR` measures the baseline tree at DIR and this
one, and each change in cost must match the change `test/budgets.json` declares between the two,
within 1 point plus a tenth of the declared change. An undeclared speedup fails as a slowdown does,
so the declared costs stay exact. An input the baseline declares no cost for, or measured with other
text, has no baseline and passes. The states, parser.c size and input hashes are the same anywhere,
and a unit test requires them to match the tree. CI exports the push's previous head, or a pull
request's base, with `git archive`. Locally, `git archive HEAD | tar -x -C .build/budgets-baseline`
gives the last commit.

The fixtures live in `test/fixtures/<dialect>/`, and every assembler of the dialect must accept each
file there. Forms that only one assembler accepts, such as `.eqv` and `0f1.5` in GNU as or
`.endmacro` and `0x1.8p0` in clang, go in a subdirectory named after that assembler (`gas/`,
`clang/`, `nasm/`, `yasm/`), and only that assembler runs on them. `.S` files go through clang
alone, which runs the C preprocessor. The x86-64 AT&T, AArch64 and Apple arm64 fixtures hold every
form measured above that the grammar reads, each in every dialect whose assemblers accept it, and
the Intel and NASM fixtures add labels and blocks in their own notation. Each ARM dialect has an
`operands.s` with its operand forms, role-table collisions, relocations and register directives, and
`.arch` lines turn on SVE and SME in the AArch64 files. `t32-gnu/mve.s` covers MVE.

The highlight tests run `tree-sitter query --captures` and apply Zed's two rules. A character takes
the last capture that covers it, and the scope at a cursor comes from the smallest capture that
contains it (edges count only for `.inclusive` captures). Offsets are compared in bytes, as
tree-sitter reports them. tree-sitter's own highlight tests use another rule than Zed's.

The tree tests compare parse trees. UTF-8 text must parse exactly like ASCII text of the same kind,
and every fixture must parse the same with CRLF line endings and without its final newline. A parse
counts as clean only if tree-sitter never entered error recovery, which its debug log shows even
when the recovery left no visible node. The rejection test is the converse. Syntax that every
assembler of a language rejects, such as `.loc 1, 2, 3`, `1B`, `nop main:` or `.word sym(FOO)`, must
parse in that language with an error on exactly the offending lines. The test reads each file's
parse status as well as its tree, since tree-sitter does not always mark a missing node in the
printed tree. Operands that parse with errors, such as `:lo12:.LC0` in ARM (Apple) or
`qword ptr fs:[0x28]` in AT&T mode, must leave the function around them one label block.
`test/grammar/keywords.test.ts` checks that no grammar has a word token or a case-insensitive token
(see ARM operands, Keywords).

The structure tests replay typing in `test/lib/zed.ts`, a model of what Zed's editor does with this
extension's settings and queries. It covers autoindent (`suggest_autoindents` and
`compute_autoindents` in `crates/language/src/buffer.rs`) for the one row that Enter or a keystroke
re-indents, Enter with comment continuation, the `/*` prefix and the closing indent of a block
comment, and bracket auto-close. The model knows the Zed features the generated configs and queries
use and refuses a config or query that uses any other, so it cannot silently disagree with Zed. Zed
finds the closing indent of a block comment through the node around its `*/`. In these grammars that
node is always the comment token the overrides query captures, and the model takes that capture. It
reads scopes from the assembly layer only, since the C layer inside `#if` conditions would need
tree-sitter-c, which the toolchain does not include. Each case types code key by key and compares
the text Zed would show. Two more tests hold the indent pattern. One parses 5,280 opener lines in
each GNU-syntax language and 3,756 in NASM, and requires the pattern to agree with the parser on
each. The cases that parse with an error are not compared, and their number per grammar is fixed.
The other runs the patterns through tree-sitter, whose `#match?` uses the Rust regex engine Zed
uses, and requires the same answers.

The same model builds the outline (items, their text and nesting, and the comment annotation Zed
attaches), the breadcrumbs at a cursor and the vim text objects `af`, `if`, `ac`, `ic` and `gc`,
after Zed's `outline_items_containing`, `symbols_containing` and vim's `text_object`. Cases cover
every language. A compiler-output test compiles `test/structure/sample.c` at test time with GCC and
clang for x86-64 (AT&T and `-masm=intel`), i386, AArch64, ARM and Thumb, and with clang for Apple
x86-64 and Apple arm64, at `-O0`, `-O2` and `-O2 -g`. It parses each result in every language that
reads it and derives the expected outline from the assembly text with the assemblers' rules. Every
symbol owns the lines up to the next one, and a temporary label (`.L` in ELF, `L` in Apple arm64) or
an assigned name belongs to the symbol above it. Apple x86-64's `L` labels are ordinary labels, as
the x86 languages read them (see x86 operands, Limits). The outline must match exactly. Jump tables
that GCC puts in `.rodata` in the middle of a function must stay inside it. A second test parses the
same output in every language that reads it and requires no error. The sample adds a thread-local
variable, a conditional select and a loop that vectorizes, so the output holds TLS relocations,
`sym(TPOFF)`, `.save`, `.cfi_offset`, `.loh` and vector register lists. Both Apple targets name
macOS 11 (`-apple-macos11`), the first macOS on arm64, since clang refuses thread-local storage
without a version. The dev image carries GCC for AArch64 (`gcc-aarch64-linux-gnu`) and for
bare-metal ARM (`arm-none-eabi-gcc-cs`) for this test.

The typing and closing tests are specified under Grammar modules. The performance tests compare
timings taken on the same machine, so they hold on any computer. When its size doubles, an input may
at most triple its time. That covers 31 inputs (garbage, one very long line, deep or unclosed
parentheses, an unclosed `/*`, unterminated strings, binary bytes, joined preprocessor lines,
nested, unclosed and broken blocks, thousands of clauses, glued macro arguments, long parameter and
`.irp` lists and stray labels, and in NASM unclosed `%if` lines, a long `%define` value, macro-local
labels, `%+` glues with and without blanks, a long call statement, nested argument groups and
braces, and words before an operand, among others), every query of every language on one function,
macro, `.if` or `.rept` body, and a line of any printable character repeated, alone, before a blank
or before a letter, in every grammar. A character whose time grows more than 2.5 times when its line
doubles is measured again before it fails. A one-character edit may cost at most half a full parse,
in the middle of a large file, inside one large block, and typed at the end of a file inside an open
block. An edit in the middle of a file must also lex the same number of tokens when the file holds
twice as many functions, at the top level and inside a block.

The unit tests also enforce the repository rules of ASCII only, LF line endings, a final newline and
an SPDX license line in every hand-written source file.

CI runs `bun run test`, `bun run sanitize` and `bun run check:budgets` in the same container for
every push and for pull requests from forks. Building the 3.0 GB image compiles tree-sitter and
dprint from source, so CI saves it in the Actions cache under the image tag and the ISO week
(`scripts/dev --image` prints the tag, a hash of the Containerfile) and loads it instead of
building, until the Containerfile changes or the week ends. Fedora's package updates therefore reach
CI within a week. The unit tests run their files in parallel, except the performance tests, which
run alone afterwards, since they compare timings. Compiled parsers are cached in `.build/lib` of
their tree under a hash of their sources and the tree-sitter version, so the test, query and fixture
checks build each grammar once.

## Performance

Measured on 600 KB inputs with tree-sitter 0.27, median of seven runs (nine for the M1 comparison).
Each comparison table runs two parsers on the same inputs in one session, and the older parsers are
built from their milestone commit (`git archive` into `.build/`).

M1 and M2 on compiler-style functions built from `basics`:

| Grammar       | Parse (ms)   | One-character edit (ms) | Highlight query (ms) | States     | parser.c         |
| ------------- | ------------ | ----------------------- | -------------------- | ---------- | ---------------- |
| asm_auto      | 57.1 -> 55.8 | 14.2 -> 2.3             | 35.3 -> 32.4         | 137 -> 489 | 161 KB -> 573 KB |
| asm_arm       | 48.9 -> 50.0 | 9.6 -> 1.9              | 30.0 -> 28.4         | 135 -> 470 | 157 KB -> 557 KB |
| asm_arm_apple | 50.8 -> 49.6 | 10.7 -> 2.9             | 31.0 -> 30.1         | 135 -> 428 | 157 KB -> 480 KB |
| asm_x86_gas   | 58.3 -> 56.6 | 14.4 -> 2.3             | 35.5 -> 33.0         | 135 -> 464 | 159 KB -> 529 KB |
| asm_x86_nasm  | 52.1 -> 45.1 | 17.2 -> 3.5             | 30.6 -> 24.5         | 87 -> 72   | 85 KB -> 87 KB   |

M2 has three and a half times M1's states, parses the same code within 2% of M1 or faster, and edits
it four to six times faster, since every function is one `label_block`, which tree-sitter reuses
whole after an edit. On code without labels (`basics` without its label, x86 GAS, three runs) both
parse and highlight alike, and M2 edits about 5% slower (14.6 -> 15.4 ms), 12% when one line in ten
holds two statements joined by `;` (13.7 -> 15.4 ms).

Edit time depends on how tree-sitter reuses a list. The generator keeps the ambiguity of a `repeat`
in the parse table as a second action the runtime never takes, and the runtime marks every node
reduced beside a second action as fragile and never reuses it whole. After an edit it therefore
walks a list one element at a time, through the statements outside label blocks, the label blocks,
and the statements of the edited block, at about 0.5 microseconds an element, in M1 and M2 alike.

A label block is reused whole only if its label was read in a parse state that lexes the same tokens
as the state the parser is in when it meets the block again. The label is read at a statement start
inside the block before it, so statements and label blocks form one list, and the state after a
block takes what a statement start takes. An edit lexes the same 2 to 7 tokens whatever the size of
the file, which `test/performance/performance.test.ts` checks at two sizes. As a measured
alternative, label blocks listed after the statements (`seq(repeat(_item), repeat(label_block))`)
leave the parser after a block in a state that takes only a label or the end of the file, so
tree-sitter reads every label again and walks every block statement by statement, about 10 ms an
edit.

The two differences on label-free code are per element. M2 reuses a statement with its terminator,
where M1 reused a whole line, since a block header and its body may share a line
(`.rept 2; nop; .endr`), so a `nop; nop` line is two elements. The state the walk runs through
accepts everything that can start a statement, 42 entries against M1's 19, since labels, blocks,
macro arguments and `#define` lines start one. tree-sitter finds an entry in such a state by a
linear scan.

M3 and M4 on `basics`:

| Grammar       | Parse (ms)   | One-character edit (ms) | States      | parser.c           |
| ------------- | ------------ | ----------------------- | ----------- | ------------------ |
| asm_auto      | 62.4 -> 55.0 | 2.6 -> 2.1              | 973 -> 2981 | 1123 KB -> 2801 KB |
| asm_arm       | 55.1 -> 56.0 | 2.0 -> 1.8              | 954 -> 1292 | 1088 KB -> 1351 KB |
| asm_arm_apple | 55.5 -> 57.5 | 3.2 -> 3.2              | 871 -> 1229 | 886 KB -> 1209 KB  |
| asm_x86_gas   | 58.8 -> 64.8 | 2.5 -> 2.4              | 466 -> 1806 | 517 KB -> 1710 KB  |
| asm_x86_nasm  | 46.6 -> 46.4 | 3.5 -> 3.4              | 72 -> 71    | 90 KB -> 106 KB    |

x86 (GAS) parses 10% slower and edits as fast, and Assembly parses 12% faster. x86 (GAS) has four
times M3's states, for AT&T and Intel operands, the mode words, prefixes, decorators and macro
calls. Removing one change at a time from a scratch copy, the Intel operator words in directive
expressions cost x86 (GAS) 70 states, the marker before an AT&T memory `(` 51, empty macro arguments
45, the closing categories after a blank 31 and a scale without an index 4. The closing categories
cost the ARM grammars about 50 states each, 2 to 4%. M3's ARM languages parse 9 to 12% slower than
M2's, from the keyword check after every identifier and a larger lexer.

M4 on all fixtures of each grammar repeated (blocks, macros, directives, preprocessor lines and the
operand fixtures), with every query the language ships (`bun run bench`). Each fixture is a file of
its own, which both assemblers start in AT&T mode, so the bench ends every x86 fixture with
`.att_syntax`:

| Grammar       | Parse | Edit | brackets | highlights | indents | injections | outline | overrides | textobjects |
| ------------- | ----- | ---- | -------- | ---------- | ------- | ---------- | ------- | --------- | ----------- |
| asm_auto      | 82.9  | 1.5  | 35.3     | 48.4       | 33.7    | 33.7       | 38.2    | 34.7      | 37.4        |
| asm_arm       | 91.5  | 1.5  | 36.1     | 49.1       | 34.1    | 34.1       | 38.5    | 35.4      | 37.3        |
| asm_arm_apple | 85.5  | 1.6  | 33.4     | 45.9       | 31.6    | 31.5       | 36.9    | 32.9      | 35.8        |
| asm_x86_gas   | 86.4  | 1.6  | 33.8     | 44.9       | 32.2    | 32.1       | 36.9    | 33.2      | 35.2        |
| asm_x86_nasm  | 64.7  | 6.4  | 27.0     | 35.3       | -       | -          | 29.9    | 27.4      | 29.8        |

Times are in milliseconds for the whole file, and Zed runs most queries on the visible rows only.

M4 and M5 on `basics` and the fixtures. For NASM the fixtures are M4's set, which both parsers read
without errors. On M5's own NASM fixtures, which add seven denser files, NASM parses in 122.9 ms and
edits in 2.6 ms.

| Grammar       | Basics parse (ms) | Fixtures parse (ms) | States       | parser.c           |
| ------------- | ----------------- | ------------------- | ------------ | ------------------ |
| asm_auto      | 55.1 -> 54.2      | 83.7 -> 81.3        | 2981 -> 3279 | 2868 KB -> 3367 KB |
| asm_arm       | 56.1 -> 49.9      | 91.3 -> 83.1        | 1292 -> 1571 | 1383 KB -> 1667 KB |
| asm_arm_apple | 56.5 -> 50.0      | 86.3 -> 76.7        | 1229 -> 1404 | 1238 KB -> 1473 KB |
| asm_x86_gas   | 64.4 -> 66.3      | 86.3 -> 88.7        | 1806 -> 2165 | 1752 KB -> 2184 KB |
| asm_x86_nasm  | 45.3 -> 77.9      | 64.5 -> 102.9       | 71 -> 4341   | 108 KB -> 5939 KB  |

M5 looks up every statement's first word in the generated instruction and directive tables to tell a
macro call from an instruction (see Generated tables), in one perfect-hashed dictionary per
language, with one hash and one compare per word. Assembly parses 3% faster than M4, ARM 9% and ARM
(Apple) 11% faster, and x86 (GAS) 3% slower, with 20% more states for Intel operands, prefixes and
decorators. A file of only `nop` lines, which M4 read without a lookup, parses 4 to 23% slower.
One-character edits are as fast as in M4 or faster. As a measured alternative, bisecting each table
of the language, up to six in Assembly at about 100 cycles each, made Assembly 13% and x86 (GAS) 9%
slower than M4 on the fixtures, and a file of `nop` lines 11 to 39% slower in every GNU-syntax
language.

A callgrind profile of x86 (GAS) against M4, with the cache model of the budgets, shows that the
scanner and lexer spend about 1,250 fewer instructions per statement than M4's, and tree-sitter's
runtime spends more. M4 lexed the mnemonic as an internal `identifier`, which tree-sitter keeps
inline in the tree. M5's instruction word is a scanner token, and tree-sitter heap-allocates every
token an external scanner returns, about 375 instructions per statement for the allocation and the
last-external-token bookkeeping. Parse-table lookups are as many as in M4 but cost about 470 more
instructions per statement, from the layout `tree-sitter generate` gives the larger table. In
estimated cycles x86 (GAS) is 1.7% cheaper than M4 on `basics`, 1.0% dearer on the fixtures and 3.4%
dearer on `nop` lines. The wall-clock gap above is larger, and the estimate models the caches, not
branch prediction. The instruction word stays a scanner token, since it tells `movl` from a macro
call such as `SAVE_ALL`.

tree-sitter-generate (`render.rs`) puts `#pragma GCC optimize ("O0")`, with its clang and MSVC
forms, at the top of `parser.c` when the main lexer has more than 300 states. The GNU-syntax lexers
stay below that limit, with Assembly at 264 states, ARM 263, ARM (Apple) 258 and x86 (GAS) 262. A
pp-number as one regex token added 82 states to each and 31% to x86 (GAS) on `basics`, nearly all of
it in `ts_lex`, so the pp-number is a number token followed by glued text. x86 (NASM) has 415 lexer
states and compiles under the pragma.

Macro names in token positions and the blank rule of GNU macro lists grew the parse states of x86
(GAS) from 2,885 to 3,937, of Assembly from 4,304 to 5,601, of ARM from 1,999 to 2,375 and of ARM
(Apple) from 1,847 to 2,086, with the lexers unchanged. On `basics` Assembly costs 0.5% more, ARM
0.6% and ARM (Apple) 0.1%. x86 (GAS) has 93 large states (52 before), indexed directly, and costs
8.2% less, nearly all of it in `ts_language_next_state` and `ts_language_table_entry` (9.4M to
1.7M and 6.8M to 4.3M, profiled before the blank rule).

The GNU macro forms, the `$` immediates and names, alternate macro mode and C calls without commas
grew the parse states of x86 (GAS) from 3,937 to 4,063, of Assembly from 5,601 to 5,784, of ARM
from 2,375 to 2,748 and of ARM (Apple) from 2,086 to 2,433. On `basics` Assembly costs 2.5% more,
ARM 4.4%, ARM (Apple) 4.4%, x86 (GAS) 3.0% and x86 (NASM) 0.2%. Removing one change at a time
from a scratch copy:

| Change                                | x86 (GAS) | Assembly | ARM | ARM (Apple) |
| ------------------------------------- | --------- | -------- | --- | ----------- |
| C calls without commas in operands    | -         | -        | 224 | 215         |
| `$` names in data                     | 76        | 90       | 63  | 51          |
| names and arguments as register names | -         | 41       | 51  | 56          |
| a register heading a concatenation    | -         | 17       | 21  | 17          |
| register ranges in call arguments     | -         | 20       | 20  | 15          |
| alternate macro mode items            | 12        | 12       | 12  | 9           |
| an empty first macro argument         | 10        | 10       | 5   | 5           |
| a comma after the macro name          | 6         | 6        | 6   | 6           |
| a macro name built from arguments     | 3         | 3        | 5   | 5           |

A run of C calls before an operand is one hidden rule, and a plain operand stays inline. Wrapping
every operand in a hidden rule took 31 states more off ARM and cost 6 points more on `basics`, one
reduction per operand. Writing the run inline in each list position cost 125 states more.

C calls without commas in Assembly operands and in typed slots, and parameter names built from
arguments, then grew x86 (GAS) from 4,063 to 4,067 states, Assembly from 5,784 to 6,363, ARM from
2,748 to 2,795 and ARM (Apple) from 2,433 to 2,706. On `basics` Assembly costs 0.29% more, ARM
0.13%, ARM (Apple) 0.12% less and x86 (GAS) 0.07% less. Removing one change at a time:

| Change                                         | x86 (GAS) | Assembly | ARM | ARM (Apple) |
| ---------------------------------------------- | --------- | -------- | --- | ----------- |
| C calls without commas in Assembly operands    | -         | 57       | -   | -           |
| C calls in typed slots                         | -         | 166      | 45  | 44          |
| names built from arguments (parameter, `.irp`) | 4         | 4        | 2   | 229         |

The call forms of typed slots are two hidden rules shared by every instruction with typed slots.
Written inline in each slot they cost Assembly 1,340 states, ARM 397 and ARM (Apple) 396.

NASM calls before a word and a comma, calls glued to a name, number tokens in macro arguments and
brace groups holding a macro token or a name then grew x86 (GAS) from 4,067 to 4,146 states,
Assembly from 6,363 to 6,469, ARM from 2,795 to 2,819, ARM (Apple) from 2,706 to 2,730 and x86
(NASM) from 4,341 to 4,543. On `basics` x86 (NASM) costs 0.28% more, ARM (Apple) 0.47%, Assembly
0.25%, ARM 0.06% and x86 (GAS) 0.04%.

NASM parses 60% slower than M4 on the fixtures and 72% on `basics`, since its grammar grew from 71
states to 4341 to read the preprocessor, macro calls and structures. Removing one rule at a time
from a scratch copy, split memory operands cost 532 states, `macro_reference` 318, calls in
expressions 247, macro tokens as mnemonics 172 and as labels 168, a list that stays open while it is
typed 167, the argument group read by GLR 141, the nested-list rule 127 and words before an operand
57.

Rules for parse cost:

- No grammar declares a word token. With one declared, an M2 grammar measured edits at 56 to 105% of
  a full parse. Removing the word token ARM had from M3 to M5 for its condition and shift keywords,
  with its keyword lexer, took 9 to 14 states off each ARM grammar with parse and edit times
  unchanged (fixtures in 94.4 ms for Assembly, 91.0 for ARM and 79.9 for ARM (Apple), and edits in
  1.1 to 1.2 ms).
- Each statement and the newline or `;` after it form one node. After an edit tree-sitter reuses a
  node only if its first token was read in the same parse state as before. A node that starts with
  its statement meets that, and one that starts with a newline does not, since that newline was read
  in the middle of the statement before it. In a 120,000-line NASM file a one-character edit cost
  67% of a full parse with the newline first, and 35% with it last.
- The end of the file is a terminator token, not an optional last line without one. That optional
  line is a second context for every statement, which doubles most expression states, and it lets a
  label follow a statement (`nop main:`). x86 GAS measured 205 states with the optional line and 119
  with the token.
- Rules that only name a choice (`_line_content`, `_statement`, `_mnemonic`, `_operand`, `_value`,
  `_symbol`) are inlined. `_mnemonic` alone saves a node per instruction, 4 to 9% of parse time.
  Inlining `_expression` too parses 5 to 10% faster in the GNU-syntax grammars but doubles their
  parse tables.
- A block's header is a rule of its own. tree-sitter turns every `optional` and `choice` in a rule
  into separate productions, and a macro body after an inline header is copied for each header
  shape. The header rule took x86 GAS from 284 states to 240.
- Every kind of block has its own closer. tree-sitter does not merge parse states whose valid
  scanner tokens differ, so each kind keeps its own copy of the statement states, about 100 states
  apiece. One shared closer would merge them but let `.endif` close a macro. Headers end like any
  statement, which lets their expressions share the states of instruction operands, and all blocks
  share one body rule. Together these took x86 GAS from 456 states to 399. ARM (Apple) has fewer
  states, since its lists take commas only.
- Local labels are a node, not a regular-expression predicate in the queries, which saves 10% of
  highlight time on label-dense code such as compiler output.
- A missing expression is one more alternative of `_expression`, which lets every operator, `(`, `#`
  and `$` share one parse state for it. Writing it into each of those rules cost 17% more states and
  10% more parser for the same trees.
- Text objects capture only the first and the last child of a function or macro body
  (`. (_) @function.inside (_)? @function.inside .`). Zed joins the captures of one match into one
  range, the same range that capturing every child gives. `(_)* @function.inside` makes tree-sitter
  keep a candidate per child, which takes 1 s for a function of 10,000 lines and 16 s for 40,000,
  against 5 and 22 ms.
- The scanner state is four values (see The external scanner), serialized to zero bytes while all
  hold their initial values, so no token before the first mode line, open call or end of input
  stores state. The scanner reads past a line end only across a backslash-newline join, through a
  `/*` comment, and inside a C macro call, where it reads the first character after the line end and
  its blanks. It asks for the column only where a directive must start its line, for a `#` at a
  statement start in GNU syntax and a `%` word in NASM, and at a join, to know whether only blanks
  precede it on its line.
- The scanner reads a word once and looks it up once in its language's dictionary. One hash, two
  reads and one compare give every role the word has, and the entry is passed to each check that
  needs it. Bisecting the per-architecture tables, once per table and question, cost Assembly 12.5
  ms of a 95 ms fixtures parse, most of the scanner's time. A word is looked up only where a check
  applies to it, so ARM (Apple), which has no suffix relocations and no x86 registers, reads no word
  after a `(`. The label check, reading the word and the blanks after it, costs about 2% of a parse,
  the price of labels as tokens.

Error recovery is slower than parsing valid code (0.4 to 2 MB/s on garbage against about 10 MB/s)
and stays linear. It is slowest in NASM, whose identifiers may start with `?` or `$` and contain
`#`, `@`, `~` and `$`, so recovery finds plausible statement starts inside garbage.

One query costs more than linear time, in a shape real code rarely has. The `gc` comment object,
`(line_comment)+ @comment.around`, written as Zed's built-in languages write `(comment)+`, costs the
square of one uninterrupted run of comment lines, about 2 ms for 1,000 lines and 0.2 s for 10,000,
also in the narrow range Zed queries around the cursor. The only linear form is one token for a
whole run of comment lines, with which every keystroke in a comment reads the whole run again, so
the token is per line.

The indents query is linear. Each `body` is one node that a pattern matches alone, and tree-sitter
keeps no candidate open while it walks the lines inside a block. Patterns that see the closer after
each body took 1 s per query on 2,700 nested unclosed `.if` lines in Zed's 16 KB window, and the
body patterns take under 2 ms.

## Adding an architecture

1. Write `tree-sitter/common/arch/<arch>.js` and register it in `MODULES` in `define-grammar.js`.
2. Add it to `ARCHS` in `scripts/lib/manifest.ts`. A test keeps that list equal to the files in
   `tree-sitter/common/arch/`.
3. Add a language to `languages.config.cjs`. If its comment rules differ, add an `ASM_DIALECT_*`
   block to `scanner.h`, include it in the count above the blocks, and add the name to `DIALECTS` in
   `scripts/lib/manifest.ts`.
4. Add `queries/<arch>/`, `test/corpus/<arch>/`, highlight cases in `test/highlight/cases.ts` and a
   fixture directory with its assemblers in `FIXTURE_DIALECTS` in `scripts/verify-fixtures.ts`.
5. Run `scripts/dev bun run generate`, `scripts/dev bun run test` and `scripts/zed`.
