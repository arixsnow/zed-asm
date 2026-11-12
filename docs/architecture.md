# Architecture

This repository builds a Zed extension for the assembly code of two architectures, ARM and x86, as
their assemblers read it. ARM code is written for GNU as and clang on ELF systems, or for Apple's
clang, which reads `;` as a comment. x86 code is written in GNU syntax, in its AT&T or Intel flavor,
or in NASM syntax, which yasm reads too. The extension gives Zed five languages for these, built
from one manifest and one set of grammar modules. A rule is written once and reaches every language
that includes its module; a new architecture is a new module.

## Languages

Each language is one grammar for one architecture, one syntax and the rules of one group of
assemblers. Assembly is the exception: it reads ARM and x86 code in GNU syntax without being told
which it is. The other four, the exact languages, follow their assemblers exactly.

| Language (Zed picker) | Grammar         | Modules             | Owns by default           | Modeline aliases                           | Toggle comment |
| --------------------- | --------------- | ------------------- | ------------------------- | ------------------------------------------ | -------------- |
| Assembly              | `asm_auto`      | core, gas, arm, x86 | `s` `S` `sx`              | `asm` `gas` `assembly`                     | `//`           |
| ARM Assembly          | `asm_arm`       | core, gas, arm      | none                      | `arm` `arm64` `aarch64` `aarch32` `thumb`  | `//`           |
| ARM Assembly (Apple)  | `asm_arm_apple` | core, gas, arm      | none                      | `arm64-apple` `apple-arm64` `darwin-arm64` | `//`           |
| x86 Assembly (GAS)    | `asm_x86_gas`   | core, gas, x86      | none                      | `x86` `x86_64` `x64` `amd64` `i386`        | `//`           |
| x86 Assembly (NASM)   | `asm_x86_nasm`  | core, nasm, x86     | `asm` `ASM` `nasm` `yasm` | `nasm` `yasm`                              | `;`            |

Toggling a comment inserts the prefix shown and one space. `sx` is GCC's suffix for assembly that
goes through the C preprocessor.

The rest of this document uses these terms:

| Term                                              | Meaning                                                                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| architecture                                      | ARM (AArch64, and AArch32 with its A32 and Thumb instruction sets) or x86 (x86-64 and i386)                  |
| GNU syntax                                        | the syntax GNU as and clang read; for x86 in its AT&T or Intel flavor                                        |
| NASM syntax                                       | the syntax nasm and yasm read                                                                                |
| dialect                                           | the rules one group of assemblers adds to a syntax: GNU as and clang on ELF, Apple's clang, or nasm and yasm |
| GNU as, clang, nasm, yasm                         | the assemblers, by their program names; GCC is the compiler                                                  |
| Assembly, ARM, ARM (Apple), x86 (GAS), x86 (NASM) | the five languages, short for their names in Zed's picker                                                    |
| exact languages                                   | every language except Assembly                                                                               |
| GNU-syntax languages                              | Assembly, ARM, ARM (Apple) and x86 (GAS)                                                                     |

A `.s` file opens as Assembly unless a modeline or a setting selects another language.
Select an exact language per file with a modeline on the first line, `// -*- mode: arm -*-` or the
Vim form `// vim: ft=arm`, or by default in `settings.json`:

```json
{ "file_types": { "ARM Assembly": ["s", "S"] } }
```

`.inc` is not claimed: PHP, Pascal and BitBake use it too.

## One manifest

`languages.config.cjs` holds the registry metadata, the per-syntax editor settings, the block kinds
both syntaxes share and the five language entries. `scripts/lib/manifest.ts` validates it on load,
so a typo fails with the name of the field. `scripts/build.ts` turns it into:

- `extension.toml`
- `languages/<dir>/config.toml` and the composed query files next to it
- `tree-sitter/tree-sitter.json`
- `tree-sitter/<grammar>/grammar.js` and `tree-sitter/<grammar>/src/scanner.c`

`scripts/tree-sitter.ts generate` then runs `tree-sitter generate` with its built-in JavaScript
engine to write each grammar's `src/parser.c`. Generated files are committed because Zed reads them
from the repository. `bun run check:generated` regenerates everything into `.build/` and fails if
any committed file differs by one byte.

## Grammar modules

`tree-sitter/common/define-grammar.js` composes a grammar from the modules the manifest names:
`core` first, then the syntax family (`gas` or `nasm`), then each architecture (`arm`, `x86`). A
module is a function of the language's syntax, architectures and dialect that returns these
tables:

- `rules`: rules it owns. A name defined by two modules is an error.
- `choices`: alternatives it adds to shared choice points (`_item`, `_line_content`, `_statement`,
  `instruction`, `_mnemonic`, `_local_label`, `_instruction_operand`, `_operand`, `_value`,
  `_expression`, `_symbol`, `_defined_name`, `immediate`, `symbol_type`). Alternatives from
  different modules are merged and duplicates dropped.
- `extras`: tokens allowed anywhere, such as block comments.

No grammar declares a word token: the scanner reads every listed word (see "Keywords" under "ARM
operands").

An instruction's operands are `_instruction_operand`, which offers everything a directive argument
(`_operand`) offers plus the ARM forms. That keeps ARM registers, memory operands and register lists
out of directive arguments, where `.quad x0` names a symbol.

Lines join at a backslash in every syntax: nasm and yasm join them, and in GNU syntax the C
preprocessor does (see C preprocessor lines). A join is a backslash and a newline, with blanks
between them in GNU syntax, as the preprocessor allows; `lexical.js` holds that rule
(`spacedJoins`), and a test checks it against the scanner's `ASM_SPACED_JOINS`.
`define-grammar.js` passes every rule through `tree-sitter/common/joins.js`. It lets a join stand
between any two characters of a terminal: regexes and token contents are rewritten so that a join
may come before every character but the first, so no token starts or ends with one, and a string of
several characters becomes a pattern aliased to its own text, so `<<` keeps its node name. A join
between tokens is an extra. The scanner steps over joins between tokens, in strings and in raw
text. In NASM its word readers and line comments step over them too (`ASM_WORD_JOINS`,
`ASM_COMMENT_JOINS`); in GNU syntax a word the scanner reads and a line comment end at a backslash.

Composition decides what a dialect can contain. Symbol types written with `@` (`.type f, @function`)
come from the x86 module. The ARM grammars have no such rule and read `@note` as a comment.

Local labels are their own node, `local_identifier`. They are the names each assembler keeps out of
the symbol table: `.L` names in the ELF assemblers, every NASM name that starts with `.` or `$.`,
and `L` names in ARM (Apple), as Apple's clang reads them for Mach-O (checked: `Ltemp` never
reaches the object file, `.Ldot` does). Other names such as `.text` stay ordinary identifiers. In
ARM (Apple) an `L` name is local in operands too, except the seven words that are also a register,
a condition or a shift (see "ARM operands").

A module may also look at the dialect. The ARM module adds dollar labels only for Assembly and ARM,
and Apple's positional macro arguments only for ARM (Apple). The scanner reads such a token wherever
the grammar allows it, which keeps the dialect decision in one place.

A global label starts a `label_block` that holds everything up to the next global label or the end
of the file. That is the span objdump gives a symbol and the span `.size f, .-f` measures. Eclipse
CDT, the only editor found that gives assembly labels an extent, ends them the same way. It also
trims trailing comment and definition lines, which a grammar could do only by looking ahead across
lines; here they stay in the block before them. Local labels, comments and preprocessor lines inside
the span belong to the block. Lines before the first global label stay at the top level.

In the grammar the top level and every body are one list of statements and label blocks. A label
block takes every statement after it (right precedence), so no statement ever follows a label block
in the tree. Keeping one list lets tree-sitter reuse a whole block after an edit (see Performance).
A second global label on the same line, after another label or after `;`, starts a block of its
own. A label right after a statement on the same line (`nop main:`) is an error in the GNU syntax,
as it is for the assemblers. nasm and yasm reject it too, but the grammar reads it as a segment with
its operand missing, the reading `es:` needs while it is typed.

Macros, conditionals and repeat blocks are blocks too, and in NASM so are structures (see Structures
under NASM). Each block has a header, a `body` of statements and label blocks, and a closer:

- `macro_definition`: `.macro` with the name and the parameters, closed by `.endm` or `.endmacro`.
- `conditional`: any of the `.if` openers with its conditions and its body, then optional
  `elseif_clause`s and an `else_clause`, each with its own body, closed by `.endif`.
- `repeat_block`: `.rept` with a count, or `.irp` and `.irpc` with a parameter and its values,
  closed by `.endr`.

A body starts at the end of its header line, with the newline or `;` that ends the header, and runs
to the next clause or the closer. Zed indents from ranges that start on the line above. Because
every body starts on its header's line, the editor indents the lines of any block and clause the
same way (see "Editor behavior").

The scanner reads the block words as whole words, in any case, as GNU as accepts them, so `.macros`
and `.ifx` stay ordinary directives (see "ARM operands", Keywords). A global label in a body starts
a block inside it, and a block between two global labels belongs to the label block before it. The
header is a rule of its own. A name the header requires closes like a missing operand when the line
ends early, so a header being typed never takes in the next line. A closer ends its block whatever
follows it, and the rest of its line must be empty: `.endif nop` closes and then reports `nop`, as
GNU as does. In a blank-separated list of parameters or values a blank ends each item, as in GNU as:
`.irp r x0 #1` has the two values `x0` and `#1`, not one shifted register.

A block still open at the end of the file ends there. The scanner ends it with a hidden zero-width
token, as tree-sitter-python does for the dedents it owes at the end of a file. The token is hidden
rather than an empty `.endm` because the tree should show a closer only where the text has one. The
body it ends is an `unclosed_body`, which leaves `body` for bodies that a real closer or clause
follows. Without the token, a block nested in a block of another kind and left open while its closer
is being typed would turn the whole outer block into one error node: tree-sitter's recovery inserts
at most one missing token. The tree has the shape the assemblers see, since they too end every open
block at the end of the file. They also report it; the grammar does not.

The assemblers read the body of a macro or a repeat block as text up to its closer, and only then
run it. `.endm` ends a macro, and `.endr` a repeat block, even while a block opened inside is still
open. Measured: a macro that leaves `.if` open is accepted by both assemblers when it is not called,
and by clang when its caller closes the `.if`; a repeat block whose `.if` the caller closes is
accepted by both. The scanner does the same. At `.endm` it ends every conditional and repeat block
still open inside, at `.endr` every conditional, each with the same hidden token, and then reads the
closer. `.endif` never ends a macro or a repeat block, because inside them it is text.

The scanner cannot see whether a macro or repeat block really encloses the line. A stray `.endm` or
`.endr` inside a conditional therefore ends that conditional too, where GNU as ignores it. Tracking
the enclosing blocks would take a copy of the block states for each way they can nest, about twice
the parser, and the stray closer changes only the rest of that one conditional. A closer outside any
block, or `.else` outside a conditional, parses as an ordinary directive, because a macro can supply
the other half: clang accepts a `.endif` or `.else` for a conditional a macro opened, and GNU as a
stray `.endm` or `.endr`. The scanner reads `.else` and `.elseif` the way it reads closers, which
tells it when one fits. A second `.else` in one conditional, or `.elseif` after `.else`, which both
assemblers reject, becomes a token no rule accepts and parses with an error.

`\name`, `\@` and `\+` are `macro_argument` nodes. Text glued to an argument forms a
`concatenation`, such as `no\s`, `\name\()_start` or `.Lx\@`, which may be a mnemonic, an operand or
a label. A label named that way does not start a block: its name exists only once the macro expands.
The scanner reads glued pieces only where nothing separates them from the piece before, and never
during error recovery, so recovery cannot glue the next line onto a name. Macro calls take keyword
arguments (`m b=2, a=1`). ARM (Apple) adds Apple's positional arguments `$0` to `$9` and `$n`, and
requires commas between parameters, as its assembler does. Apple's clang substitutes a positional
argument whatever follows it, so `$0.16b` and `$0abc` are the argument glued to text.

The grammar is line oriented: a statement ends at a newline, at a statement separator or at the end
of the file. GNU as reads a missing final newline as one ("end of file not at end of a line; newline
inserted"). The scanner reads the end of the file as a zero-width terminator, and as the closer of
each block still open there.

When the last line is broken and no newline follows it, the scanner still closes the innermost block
at the end of the file. Error recovery then keeps every block, and only the broken line becomes an
error node, as it would before a final newline.
Without this, typing the `.` of `.endm` as the last line of a new file would turn the whole macro
into one error node for a keystroke: its name would lose its color and the macro would leave the
outline.

Two tree-sitter rules shape this. When the error shows only at the end of the file, as with `.`
waiting for `= expr`, recovery keeps the block only if the scanner closes it there, because no state
inside a block accepts the bare end of the file; with no block open, recovery skips the token. When
the error comes earlier, as with a lone `1` or `\`, the parser is still recovering at the end of the
file. tree-sitter then ignores a zero-width token unless the scanner's state changed
(`ignore_empty_external_token` in its `parser.c`). The tokens the scanner writes at the end of the
input therefore carry a one-byte state that no other token has, and the first of them counts.
Python's grammar relies on the same rule for the dedents it writes at the end of a file. The scanner
reads the state back. During recovery it writes nothing when the token before already closed the
input, so recovery ends on its own instead of relying on tree-sitter to ignore the repeat.

While a line is being typed its last construct is often still open, and the scanner closes it with a
zero-width token so that error recovery never pulls in the next line. An operand missing after a
comma, an expression missing after an operator, `(`, `#` or `$`, and a parenthesis, a bracket, a
register list or a GNU-syntax string left open all close at the end of the line, before a separator,
or before any character that cannot continue them. Each missing piece and each open construct has a
closing token of its own (see The external scanner). `mov x0, , x1` keeps both operands, and
`ldr x0, [x1` closes its bracket at the end of the line. Character constants and strings end at the
closing quote or at the end of the line, unless the line ends in a join, which continues them on
the next line. A relocation may still lack its specifier and a register its name
after `%`. In ARM a register range may lack its end, a `:lo12:` relocation its name or its second
colon, and a `sym(GOT)` suffix its name or its `)`.

Three tests hold this. The first types every prefix of every line of the fixtures, with and without
their final newline, and of all corpus examples, and requires every other line to parse exactly as
before. Some constructs really span lines: a line that ends in a join (any line but a GNU-syntax
line comment) takes in the lines it continues into, and an unclosed `/*` reaches
its next `*/` or the end of the file. The test computes those lines from the text and lets them
change, as part of the typed line. The other allowed change: typing a line that holds a block's
opener, clause or closer may change how the other such lines of that block, and of the blocks around
it, parse. The second types every printable character right after each kind of open construct, in
every grammar, both before a next line and as the last line of a file with no newline after it. It
does so inside a `.if` and a `.rept` (a label block in NASM) that the end of the file closes, and
the lines before must parse as they did without it. The third, `test/grammar/closing.test.ts`,
checks the scanner against the parse table in each generated `parser.c`. It parses a line that stops
at an open construct, once for every grammar site that uses a closing token, and reads from
tree-sitter's debug log the parse states the parser is in there before any error recovery. For every
printable character followed by `a` or `=`, the scanner must close exactly when no token those
states accept can start the text, and close with the token that site uses.

## Query and test sources

Query fragments live in `queries/<source>/` and corpus tests in `test/corpus/<source>/`. For each
language the sources run from general to specific: `core`, the syntax family, each architecture,
then `<arch>.<syntax>` for material that only holds for that pair (AT&T operands and `@` symbol
types live in `x86.gas`). Corpus tests also include a directory named after the grammar for
behavior that belongs to one dialect.

Zed allows one file per query kind and paints a character with the last capture pushed for it, so
the build concatenates fragments from general to specific and later patterns override earlier ones.

## The external scanner

`tree-sitter/common/scanner.h` makes every lexing decision that depends on the dialect or on what
the parser expects next. Its state is one byte that holds two things: that it has written the
zero-width tokens that end the input (see Grammar modules), and the x86 syntax mode (see x86
operands). The byte stays empty until the first mode line and the end of the input, so incremental
reparsing can reuse any subtree of AT&T code before them. Each
grammar's generated `src/scanner.c` defines `ASM_GRAMMAR_NAME` and one `ASM_DIALECT_*` macro and
includes it; defining none or two is a compile error.

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
| `@` plus a letter or digit where an operand fits | symbol type                                                                                                | comment      | -                         | symbol type | -          |
| other `@`                                        | comment                                                                                                    | comment      | -                         | -           | -          |
| `;`                                              | separator before a directive or after an x86 prefix, else a comment up to the next `;` a directive follows | separator    | comment                   | separator   | comment    |
| `1$`, `1$:`                                      | dollar label                                                                                               | dollar label | -                         | -           | -          |
| `\` or a name right after a name                 | glued piece                                                                                                | same         | same                      | same        | -          |
| `$0` to `$9`, `$n`                               | -                                                                                                          | -            | positional macro argument | -           | -          |
| `(` and a relocation name after a blank          | the same operand                                                                                           | same         | -                         | -           | -          |
| a name after `(` in a relocation suffix          | relocation name                                                                                            | same         | -                         | -           | -          |
| a name after `:` in a relocation                 | relocation name                                                                                            | same         | -                         | -           | -          |
| `{` where a decorator or prefix fits             | decorator or pseudo-prefix                                                                                 | -            | -                         | same        | -          |
| `.req`, `.dn`, `.qn` after a first name          | register alias word                                                                                        | same         | same                      | -           | -          |

In Assembly a `;` is a separator when a directive follows it and a comment otherwise. The file does
not say whether it is written for GNU as and clang ELF, where `;` separates, or for Apple's clang,
where it starts a comment. Nor can Zed route such a file by its content: it reads a language's
`first_line_pattern` only when no suffix matches, and Assembly owns `.s`. A modeline, or the ARM,
ARM (Apple) and x86 (GAS) languages, give the exact reading. The rule holds for every `;` on a line,
so a `;` comment ends where a later `;` is followed by a directive. `.rept 2; nop; .endr` closes its
block, with `; nop` as a comment, and `mov w1, #0 ; =0x0` stays a comment to the end of the line. An
earlier version let the first comment run to the end of the line and swallow the directive, which
left one-line blocks open to the end of the file.

A `;` after an x86 prefix separates too (`rep; movsb`, `lock; incl %eax`). No prefix is an ARM
mnemonic, so such a line is x86 code, and there `;` always separates. The prefixes are the x86 (GAS)
prefix words (see x86 operands, Prefixes).

A value can start with a letter, a digit or one of `_ . ( - + ~ ! ' :`. In Assembly `svc #0` has an
immediate, while `nop # note` and `nop #*** banner ***` are comments.

At the start of a statement the scanner reads the next word. If blanks and a colon follow, the word
is a label name: local when the assembler keeps it out of the symbol table (`.L` in the ELF
dialects, `L` in ARM (Apple), `.` in NASM), global otherwise. In the GNU syntax a word of digits is
a numeric label, and in Assembly and ARM it may end in `$`, a dollar label of GNU as for 32-bit ARM.
Inside a block, its closing word (`.endm`, `.endmacro`, `.endif` or `.endr`) is the closer. Left to
the grammar, the parser would have to decide at the first letter of a line whether the current
block ends, before it could see the colon. The word takes the characters of the grammar's names,
and a test checks every printable character against `lexical.js`.

The same word may be a directive that must match whole: a block opener or clause, `.loc` or `.file`,
an ARM directive with register operands, or a NASM directive such as `section` or `db`. The words
come from tables generated from the upstream sources, one table per architecture and dialect, and
each language looks them up in one dictionary built from the tables of its architectures (see
Generated tables). The scanner hashes a word once and reads every role it has from that one entry:
directive, instruction, register, prefix and the rest, each with its architecture, token and flags.
The indent pattern reads the block words from the tables. The flags say, for example, that a
reserved word is never a label, and that in NASM a word can make the name before it a label
(`x db 1`) or an assignment name (`len equ 5`). The scanner reads a word into a buffer one byte
longer than the longest word of its dictionary, so a longer word is no keyword. tree-sitter's
runtime gives a wasm grammar only a few C library functions, so the hash is the scanner's own.

During error recovery the scanner reads no label and no block closer. Every parse state that accepts
one also accepts a newline, since a blank line may stand wherever a statement may. Recovery
therefore reaches a statement start at the newline that ends the broken line, before the first word
of the next line, and where that newline cannot end recovery, a label or closer could not either. A
name with a colon read during recovery, written as a label would be, becomes one token that no rule
accepts, and recovery skips it instead of starting a statement there. Operands the grammars do not
parse yet, such as `ptr fs:[0x28]`, `%fs:sym@tpoff`, NASM's `[fs:0x28]` or `:lo12:sym` in ARM
(Apple), never start a block. Refusing the word alone, as the grammar did until M2, was not enough:
tree-sitter resumed a statement at the refused word and read it again, outside recovery, as a label.
Valid code never enters recovery. A label after an error and a `;` still starts its block, because
recovery resumes at the `;`.

The scanner never asks for the column during recovery. tree-sitter works out an unknown column by
walking back to the start of the line, and while it skips characters no token accepts, it forgets
the column after every scanner call. Asking for it at each word made one long broken line cost time
in proportion to the square of its length. With that earlier rule a line of `nop a a a` took 16 ms
at 4,000 characters and 44 ms at 8,000; it now takes 10 and 19.

String text is read before any comment rule, so `.asciz "# of args"` stays a string in every
dialect. In ARM (Apple) an `@` that is not a relocation is an error, as it is for Apple's clang.
`;` alone and `nop;;nop` are empty statements in the dialects where `;` separates.

Assembly has to guess between ARM and x86, which costs these cases: `mov rax, rdi #copy` reads
`#copy` as an immediate and `nop @note` reads `@note` as a symbol type. ARM register names are
registers in x86 code too (`movl sp, %eax`, `call a1`). Assembly reads AT&T until a `.intel_syntax`
line, so before one, Intel's `dword ptr [rbx+4]` parses as the symbols `dword` and `ptr` and an ARM
lane; after one, it is a typed memory operand, as in x86 (GAS). A bare `#` at the end of a line is a
comment there, since no value follows it. The exact languages read all of these correctly. An ARM
role slot also takes x86 operands, so `blcs %eax, %ebx` (AMD TBM) parses, though `blcs` is also
ARM's `bl` with the condition `cs`.

The scanner sees only which of its own tokens the parser accepts. So each closing token stands for
one kind of construct, and the scanner knows what may continue it. A missing piece closes before
any character that cannot start it:

| Token                        | The missing piece                                                                         | Starts with                                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `_missing_operand`           | an instruction operand or a condition                                                     | a value; in ARM also `[`, `{` and `=`; in x86 also `*`         |
| `_missing_label_operand`     | an ARM branch target                                                                      | a value, `[` or `=`                                            |
| `_missing_argument`          | a directive argument or an `.irp` value                                                   | a value                                                        |
| `_missing_register_argument` | an argument of `.cfi_offset`, `.save` and the other register directives                   | a value; in ARM also `{`                                       |
| `_missing_element`           | an element of an ARM bracket                                                              | an expression; in Assembly also `$`                            |
| `_missing_expression`        | an expression                                                                             | an expression                                                  |
| `_missing_register`          | a register list element, a range end, a `.req` register                                   | a letter, `_` or `\`; in ARM (Apple) also `$`                  |
| `_missing_name`              | a `.macro` name or parameter, an `.irp` parameter, the statement after `{vex}` or `times` | a letter, `_`, `\`, or `.` before a letter                     |
| `_missing_identifier`        | a parameter's qualifier (`:req`), a `%macro` name                                         | a letter or `_`                                                |
| `_missing_symbol`            | an `.loh` argument, a NASM structure name                                                 | a letter, `_`, or `.` before a letter                          |
| `_missing_relocation`        | the name or second colon of `:lo12:`, the name in `sym(GOT)`                              | nothing the parser reads; the scanner reads the name and colon |

An expression starts with a letter, a digit or one of `_ . ( - + ~ !`, in the GNU syntax also
`' " \`, in Assembly and ARM `:` (a relocation), and in NASM `? $`. A value starts as an expression
does, and in the GNU syntax also with `%` (an x86 register or a symbol type such as `%function`)
and in x86 with `$`. In Intel operands an expression has no relocation `:` and also starts with `%`
or `[`; an operand also starts with `$`. Wherever the parser takes an x86 register, `%` starts one.

An open construct closes before any character that cannot continue it. Each one also continues
with an operator where the parser takes one:

| Token                 | The open construct                         | Continues with                                                  |
| --------------------- | ------------------------------------------ | --------------------------------------------------------------- |
| `_unclosed`           | a parenthesis, an AT&T scale               | `)`                                                             |
| `_unclosed_bracket`   | an ARM memory operand or register index    | `]` and `,`                                                     |
| `_unclosed_index`     | the lane after a register list, `{v0.s}[1` | `]`                                                             |
| `_unclosed_brace`     | a register list                            | `}` and `,`                                                     |
| `_unclosed_memory`    | an AT&T memory operand                     | `)`, a `,` after a register or index, `%` where a register fits |
| `_unclosed_address`   | an Intel bracket                           | `]`                                                             |
| `_unclosed_arguments` | the arguments of a macro call              | `)` and `,`                                                     |

Where a character means different things, the scanner reads the token itself, and only where the
parser expects it: the comma right after an AT&T `(` (`(,%rax,8)`), the colon of an ARM alignment
or index range, the colon of an Intel segment (`fs:[0x28]`), the `[` after an Intel displacement
(`sym[rip]`), the dash of a register range, a relocation name after `:` and the colon after it, a
pseudo-prefix and a decorator. Before a `(` it writes a zero-width marker of what the parentheses
open (see Expressions). At the start of an ARM bracket element a colon begins an alignment
when a digit follows (`[r0, :64]`) and a relocation otherwise (`[x0, :lo12:sym]`). The first colon
of `:lo12:` stays the parser's own token, since a label's colon is the same character
(`\name\()_start:`). When a missing piece and an open construct could both close, the construct
closes as it stands, so `F(` at the end of a line is an empty call.

Comments are read first, so the decision is made on the next real character. `==` and `!=` need a
second character (`!` alone is an operator in the GNU-syntax languages except ARM (Apple)), and so
does a NASM `$`, which starts a name only before a letter, `_`, `?` or `.`, and a `.` where only a
name fits. The only word that may be glued to a complete operand is a relocation
specifier after `@`, and the scanner reads that itself, so any other glued word closes like any
character that cannot continue: `[0x` (a hex number being typed) closes its bracket before the `x`
and the error stays on its line. M2 left every glued word open instead, which let tree-sitter's
recovery carry an Intel bracket over to the next line.

The open tokens are valid only where the construct may end. After `[` or `{` an element is
required, so a bracket never closes before its first element; a rule based only on the next
character would otherwise close `[x1]` before the `x`.

The scanner is strict ISO C11. Dialect settings are 0/1 macros used in ordinary `if` statements, so
every branch compiles and type-checks in all five dialects.

## Generated tables

Every word list that decides how a line parses is generated. `scripts/keywords.ts` reads the
upstream sources and writes `tree-sitter/common/keywords.h`, which is checked in, so building the
parsers needs no upstream source. Each table is an X-macro named `ASM_<scope>_<kind>`. The scope is
an architecture that has an `ASM_<scope>_KEYWORDS` setting in `scanner.h`, or `GNU` for the tables
every GNU-syntax language reads.

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
AArch32 tables, ARM (Apple) the AArch64 Apple tables, and x86 (GAS) and x86 (NASM) their own; the
GNU-syntax languages also read the `GNU` tables. `bun run build` merges a language's tables into one
dictionary in `tree-sitter/common/words.h`, a section per language. Each word appears once, with one
role for every table that lists it, in the order `scanner.h` lists its `ASM_*_KEYWORDS` settings.
That is the order the lookups prefer, AArch64 GNU, AArch64 Apple, AArch32, x86 GAS, then NASM, so a
directive both AArch64 and x86 define reads as AArch64's in Assembly.

The dictionary is a minimal perfect hash built the way nasm builds its token table
(`perllib/phash.ph`): two seeded 32-bit hashes of the word name two vertices of a graph, and the
values stored at the two add up to the word's index. A lookup costs one hash of the word, two reads,
and one string compare, which also rejects a word that is no keyword. The build tries seeds until
the graph has no conflict and checks that every word finds itself. `check:c` builds
`test/c/words.c` for each language and checks the same in C: every word finds its own entry, and
the empty word and each word with a character no word holds find none.

The tables follow the upstream heads, not the installed releases, so a word the next release
accepts already reads. The installed tools only cross-check them. A table is a superset: a word
reads if any assembler of the dialect takes it. Where sources disagree about a word, what one of
them allows counts (a register that takes a suffix in either), and a restriction holds only if
every source that lists the word imposes it (a word stays case-limited only if all of them limit
it). Each reader tags what its source says, and `scripts/lib/keywords/shapes.ts` merges the tags
into scanner tokens and flags.

nasm's token classes (registers, prefixes, operand words, decorators) come from nasm alone, because
where nasm and yasm read a word differently the grammar follows nasm. Statement words stay the
union with yasm, since nasm rejects the yasm-only lines outright rather than reading them another
way.

To regenerate, keep clones named `binutils`, `llvm`, `nasm` and `yasm` in one directory and run:

```sh
scripts/dev --sources ../references bun run keywords
scripts/dev bun run generate
```

The first command builds `llvm-tblgen` once under `.build/tblgen`, which takes a few minutes, and
runs each project's own table generators. The second regenerates the parsers.
`ASM_KEYWORD_SOURCES` in `keywords.h` records the commit of each source, so a change of upstream
shows in the diff of that one file.

A reader checks the shape of the source it reads and stops the generator when it no longer fits: a
new handler, token type or operator it has no form for, or a guard it relies on that has gone (a
name compared in any case, a word that must follow another). A reader cannot see a word written in
a form it has never met, but a change of form usually removes what it matched, and then it stops.
`test/unit/keywords-*.test.ts` run each reader on small inline sources, with no upstream source, and
check its names, its tags and each of its stops.

What stays hand-written is what upstream has no list of:

- Which token a word becomes: the handler and word maps in `shapes.ts`, and the instruction roles in
  `tree-sitter/common/roles.js`. Signatures that fit no role stop the generator.
- Forms, which are small rules rather than word lists: names and numbers in
  `tree-sitter/common/lexical.js`, and in the scanner the AArch32 type suffixes (`.f32`, `.bf16`),
  the AArch64 arrangements and element sizes, the letters of `APSR_nzcvq` and the local label
  prefixes.

A word reads by its table even when a macro redefines it, since the definition may live in another
file. GNU as and clang let a macro take an instruction's name; clang, nasm and yasm also let it take
a directive's, while GNU as warns and ignores the macro. `add 1, 2` after `.macro add a b` then
reads as an instruction, and `add 1 2`, blank separated, is an error on that line though the
assemblers take it.

## C preprocessor lines

A line that starts with a C preprocessor directive, indented or not, is a `preproc_line`, or a
`preproc_define` for `#define`. After a label or a `;`, a `#` follows the dialect's comment rules,
because the preprocessor recognizes directives only at the start of a line.

The directives are the generated table `ASM_GNU_CPP_DIRECTIVES`. It reads the cases of clang's
`HandleDirective` (`clang/lib/Lex/PPDirectives.cpp`), and the handler each word calls gives its
form:

| Form                               | Words                                                                                                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Name, parameters and value         | `define`                                                                                                                                                                             |
| A C expression                     | `if`, `elif`                                                                                                                                                                         |
| A header name or string, then text | `include`, `include_next`, `import`, `embed`                                                                                                                                         |
| Text                               | `ifdef`, `ifndef`, `elifdef`, `elifndef`, `else`, `endif`, `undef`, `line`, `error`, `warning`, `pragma`, `ident`, `sccs`, `assert`, `unassert`, `__public_macro`, `__private_macro` |

GCC's directives are a subset of these, measured with GCC 16.2, so no GCC source is needed. Two rows
are directives to one preprocessor only. clang names `assert` and `unassert` but leaves them
unimplemented, so it passes them to the assembler; GCC implements them. clang reads `__public_macro`
and `__private_macro` when modules are on; GCC passes them on.

clang's other words are left out, and those lines read as comments, as the assembler reads them.
`module` and `__preprocessed_module` are directives only after a C++ `module` keyword, never after
`#`. `__preprocessed_import` needs C++ modules. `__include_macros` is an error outside clang's own
buffers, and GCC does not know it. The generator stops if any of these facts changes, and on a
handler it has no form for.

The word is compared as written, so `#DEFINE` is a comment. It ends where a C identifier ends. `.`
and `$` are not identifier characters in assembler-with-cpp mode, so `#endif.x` is `#endif` with the
argument `.x`.

After the directive the scanner reads the rest of the line the way the preprocessor does in
assembler-with-cpp mode, measured with GCC 16.2 and clang 22.1 (`-E -x assembler-with-cpp`):

- Only `//` and `/*` start comments. `#`, `@` and `;` are ordinary text: `#define SEP ;` and
  `#define STR(x) #x` keep their arguments.
- `"` starts a literal that ends at the next unescaped `"` or at the end of the line. `'` starts one
  that ends at the next `'` or at the end of the line.
- After `#include`, `#include_next`, `#import` and `#embed`, `<...>` is one header name, and the
  `//` in `<a//b.h>` is not a comment. An unclosed `<` is read as a header name being typed.
- A backslash before a newline joins the two lines everywhere, including inside literals and `//`
  comments, also with blanks between the backslash and the newline. Outside literals a backslash
  does nothing else.

A `preproc_define` has the macro's `name`, its `parameters` when a `(` follows the name with no
blank between, and its `value`, the rest of the line as above. The name takes the characters of a
C identifier, so `#define a.b 1` defines `a` with the value `.b 1`, `#define a$b 1` defines `a` with
the value `$b 1`, and `#define P (x)`, with a blank before the parenthesis, defines `P` as `(x)`.
Parameters are names, `...`, or GNU's named variadic form `args...`. A `#define` without a name is
complete while it is typed, and one whose name is not an identifier (`#define 1 2`, `#define $x 1`)
is an error, as it is for the preprocessor. The argument of `#if` and `#elif` is a
`preproc_condition`, a C expression.

Comments after the directive become `preproc_comment` children of the line, and trailing blanks
belong to the line too. The comments keep their color, and a cursor at the end of `#endif /* X */`,
even after trailing blanks, stays in the `preproc` scope.

Four cases are not modeled. A comment opener split by a backslash-newline (`/`, backslash, newline,
`*`) is joined by the preprocessor but not by the scanner. A directive word split that way, and a
comment between the `#` and the word (`# /* c */ define N`), are directives to the preprocessor and
comment lines here. No real code writes these three. A `// note` ending in a backslash on a code
line swallows the next line in a `.S` file, which goes through the preprocessor, but not in a `.s`
file, which GNU as reads directly. Both open as the same language, so the grammar ends that comment
at the end of its line.

The preprocessor joins code lines the same way: in a `.S` file every line that ends in a backslash,
also with blanks before the newline, continues on the next, and a join inside a word splices it
(GCC's manual: "you may split a line anywhere, even in the middle of a word"). GNU as and clang
reject a backslash-newline in the code of a `.s` file, so every GNU-syntax language joins code
lines as the preprocessor does, and no valid `.s` file reads differently. A join is a blank
between tokens, a splice inside a name, a number or an operator, and a string continues past it:
`.long A | \` and `B` on the next line is one directive. A backslash that no newline follows keeps
its GNU meaning, a macro argument (`\reg`) or `\()`. A word the scanner reads, a mnemonic, a
directive, a register, a prefix or a statement's label, ends at a backslash. The scanner cannot see
the character after a backslash without reading it, and tree-sitter gives it one token end and no
way back, so it cannot tell `push\width`, a word and a macro argument, from `.lo\` and `ng` on the
next line, one word. None of the 7,245 joins in the pinned Linux, glibc and FFmpeg sources splits
such a word. When the scanner meets a backslash that is no join between two tokens, it hands the
rest of the scan a lexer that offers the backslash again, so every token is decided as without
joins.

## Blocks, labels and directive forms

Measured with GNU as 2.46.1 (x86-64, AArch64) and 2.45 (AArch32) and clang 22.1 (x86-64, AArch64,
AArch32, Apple arm64). Every one of them accepts:

- `.macro` with the parameters `a, b`, `a=1`, `a = 1`, `a:req` and `rest:vararg`, keyword calls
  such as `m b=2, a=1`, `.exitm` and `.purgem`.
- In a macro body: `\name`, the counter `\@`, the separator `\()`, `\+`, all of them glued to
  other text (`no\s`, `\name\()_end`), as the mnemonic (`\op`) or as a label (`\name:`).
- `.if`, `.elseif`, `.else`, `.endif` and the conditions `.ifdef`, `.ifndef`, `.ifnotdef`, `.ifb`,
  `.ifnb`, `.ifc`, `.ifnc`, `.ifeqs`, `.ifnes`, `.ifeq`, `.ifne`, `.ifge`, `.ifgt`, `.ifle`,
  `.iflt`.
- `.rept N`, `.irp r, 1, 2` and `.irpc c, 123`, each closed by `.endr`.
- Numeric labels `0:`, `1:` and `10:`, referenced as `1b` (backward) and `1f` (forward). `1B` and
  `1b:` are errors.
- A blank before a label's colon: `lbl :`, `.Lx :`, `1 :`.
- `.equ`, `.set` and `.equiv` with `NAME, expr` (the comma is required), `NAME = expr` and
  `. = expr`.
- Decimal floats in `.float`, `.single` and `.double`: `1.5`, `.5`, `1.`, `1e3`, `1E3`, `1.5e+3`,
  `-1.5`, `1` and `inf`. `1.5f` is an error.
- Blank-separated arguments in `.loc 1 2 3 prologue_end is_stmt 0`; commas there are an error.
- Empty arguments: `.p2align 4,,10`, `.balign 8,,4`.
- `.byte 1 -2` as one value, -1. `.byte 1 2` is an error.
- `.2byte`, `.4byte` and `.8byte`, which compilers write in debug information. `.1byte`, `.3byte`
  and `.16byte` are errors.

Where they differ:

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

GNU as takes any of `f`, `d`, `e`, `r`, `s`, `x`, `h`, `p` and `b`, in either case, as the letter of
a prefixed float, and inside a float directive it reads `0x10` as 10.0: the prefix, then a decimal
number. clang reads `.MACRO` but ends a macro body only at a lower-case `.endm` or `.endmacro`, and
a repeat body only at a lower-case `.endr`.

A construct parses in a language when at least one of that language's assemblers accepts it. So far
the grammar reads:

- Numeric labels as `numeric_label`, defined (`1:`) or referenced (`1b`, `1f`). Only lower-case `b`
  and `f` count, so `0b101` and `0x1f` stay integers.
- An `integer` in decimal, octal, `0x` or `0b` form with the suffixes its assemblers ignore: `U`,
  then `L` or `LL`, in any case. GNU as also takes a `U` after the `L`s (`1LU`), which clang
  rejects, so ARM (Apple) does not read that as one integer.
- Dollar labels (`1$:`, `1$`) in Assembly and ARM only.
- `NAME = expr`, `NAME == expr` and `. = expr` as `assignment`. `.equ`, `.set`, `.equiv` and `.eqv`
  stay directives whose first argument is the name, which keeps `.set noreorder` a plain directive.
- A `float` in any of the three forms: decimal, prefixed and hexadecimal. A prefixed float with `x`
  or `b` needs a point; `0x10` and `0b11` stay integers.
- Blank-separated integers, strings, names and negated values after `.loc` and `.file` (GCC writes
  `view -0`). Every other directive separates its arguments with commas and may leave one empty.
- Macro definitions with the parameters `a`, `a=default`, `a:req` and `a:vararg`, separated by
  commas or blanks (only commas in ARM (Apple)), closed by `.endm` or `.endmacro`.
- Macro arguments `\name`, `\@` and `\+`, alone or glued to text, and keyword arguments in calls.
  Apple's `$0` to `$9` and `$n` in ARM (Apple) only.
- Conditionals with every `.if` opener measured, `.elseif` and `.else`, closed by `.endif`, and
  repeat blocks with `.rept`, `.irp` and `.irpc`, closed by `.endr`. `.irp` values are separated
  by commas or blanks (only commas in ARM (Apple)).

A macro call looks like an instruction, and its arguments may be separated by blanks. GNU as
("Multiple arguments can be separated by blanks or commas") and clang ELF split `m 1 2` into two
arguments, Apple's clang joins it into the one argument `12`, and nasm and yasm pass `1 2` as one
argument. The generated instruction and directive tables tell a call from an instruction (see
Macro calls), so only a call takes blank-separated arguments. An instruction separates its operands
with commas, as every assembler requires: `movl %eax %ebx`, `add x0, x1 x2`, and NASM's `mov eax 1`
and `push 1 2` are errors. In NASM a name or a macro token before an operand is the exception, since
it may be a macro that expands first (see NASM, Macro calls and macro words). A macro named like
an instruction (`.macro mov a b`, then `mov 1 2`) reads as the instruction, a limit. Directive
arguments and `.if` conditions need commas too (`.byte 1 2` is an error).

The blank must be there. The scanner reads it as a zero-width token, only after real blanks and
before a character that starts an operand and cannot continue the one before. `1B` stays an error,
and `1 -2` stays one expression, which is how the assemblers read an instruction's operand. In
Assembly the scanner does not do this before `#`, which after code is x86's comment
(`movq %rax, %rbx #save`). An ARM shift joins its amount (`lsl #2`). The shift words are the ones
the assemblers take with an amount (`lsl lsr asr ror asl msl` and the extends `uxtb`...`sxtx`,
measured); such a word alone is an ordinary symbol, and `m x0 #1` has the two operands `x0` and
`#1`. A blank-separated `.irp` list or macro parameter list never holds a shift, since GNU as ends
each item at a blank.

NASM names follow what nasm 3.02 and yasm 1.3.0 accept: an optional `$`, which turns a reserved word
into a name (`$eax` is a symbol, not the register), then a letter, `_`, `?`, `@` or `.`, then
letters, digits and `_ $ # @ ~ . ?`. Both assemblers take `@` first (`@x:`, `@:`, `mov eax, @x`), as
nasm's own lexer does, although the NASM manual leaves it out. After the escaping `$` any name
character may follow, `$` included, so `$$foo` is the name `$foo`; `$$` alone is the start of the
section. A name that starts with `.` or `$.` is local. Both assemblers accept `.1:`, `.$x:`, `.#x:`,
`.@x:`, `$.y:` and `$eax:`. Only nasm accepts the bare `.:` (yasm: "label or instruction
expected"), and only yasm accepts `..x:` and `....:` (nasm: "unrecognised special symbol"). The
grammar reads all of them, as labels and in operands, since each is valid for one of the language's
assemblers. A `$` starts a name only before a letter, `_`, `?`, `@`, `.` or another `$`, so the
scanner looks at the next character before it closes an open operand at a `$`.

## Expressions

GNU as and clang group operators by GNU's precedence, not C's, on every ELF target, x86 and ARM
alike. clang uses a third order on Apple targets, and nasm and yasm use C's. Measured with fifteen
`.if` probes per assembler (`2 + 3 << 1` is 8 with GNU's order, 10 with Apple's and nasm's), from
the highest level to the lowest:

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

Assembly, ARM and x86 (GAS) use the first column, ARM (Apple) the second and x86 (NASM) the third.
Operators on one level group from the left. The binary `!` (or-not: `1 ! 2` is `1 | ~2`) reads
wherever GNU as reads it; clang takes it for x86 and AArch64 ELF and rejects it for AArch32 and
Apple. `%` is the remainder in every GNU-syntax language; in x86 code a `%` that starts a register
name is a register instead (see x86 operands). In Intel syntax GNU as keeps its own order and reads
`shl`, `shr` and `mod` at level 1, `and`, `or` and `xor` at level 2 and `eq`, `ne`, `lt`, `le`, `gt`
and `ge` with the comparisons, while clang's Intel mode switches to C's order (`2 + 3 shl 1` is 8 in
GNU as and 10 in clang). The grammar follows GNU as there. Precedence shapes the tree only, never a
color.

In `.S` files the C preprocessor runs first, so operands hold C macro calls: Linux's
`PER_CPU_VAR(x)`, glibc's `L(loop)` and `VMM(1)`. In every GNU-syntax language a name followed by
`(` is a `macro_call` (`function`, `arguments`), and as in C any argument may be empty (`F(,1)`).
AT&T memory wins when the parentheses start with a register or a comma (`sym(%rip)`, `t(,%rax,8)`,
and `8(rbx)` in noprefix mode). Where an instruction's operands may be separated by blanks, a blank
before `(` keeps GNU's reading of two arguments (`m 1 (2)`); elsewhere a blank changes nothing
(`.word F (1)`). A label written as a call (`L(loop):`) is a local label named by its call. A
statement's first word stays its mnemonic, since GNU as cannot tell a macro from an instruction
without the definitions, and a statement may take one argument list as its operand
(`_ASM_EXTABLE(1b, 3b)`, `ENTRY_P2ALIGN (STRCHR, 5)`). Before a `(` the scanner writes a zero-width
marker of what the parentheses open: call arguments, a relocation suffix or an AT&T memory address.
It decides from the text after the `(` and from the markers the parser accepts there, so no parse
conflict has to choose between the readings.

A quoted name is a symbol where a symbol is needed: as a label (`"a b":`), in an operand, after `$`,
with `@PLT` or `:lo12:`, and in memory operands. GNU as and clang accept all of these on every
target, and gcc's Intel output quotes every symbol. A quoted operand on its own stays a string,
since GNU macros take string arguments (`ALTERNATIVE "", "lfence", X86_FEATURE_LFENCE`).

A `symbol_type` is `%` and a name or a number in every GNU dialect, and `@` and a name or an
`integer` in x86 (GAS) and Assembly: `.type f, %function`, `.type f, %STT_FUNC`, `.type f, %2`,
`.section .c,"a",@0x70000001`. Any name reads, as both assemblers parse one before they check it:
GNU as rejects `%Function` and warns on LLVM's `%llvm_lto`, clang rejects GNU as's `%exidx`. GNU as
reads a number for both directives, clang for a section type only (`%2` is an error to clang). Until
M5 the grammar listed the ELF type names, which changed no tree, since any other `%` name read as a
symbol type too.

Mach-O section types are names: `regular`, `cstring_literals`, `symbol_stubs` read as identifiers.
The ones the identifier cannot read, because they start with a digit (`4byte_literals`,
`8byte_literals`, `16byte_literals`), are scanner words: the table is generated from GNU as's
`bfd_mach_o_section_type_name` and clang's `SectionTypeDescriptors` and keeps the names the
identifier pattern of `lexical.js` does not match. Both assemblers compare the type as written, so
`4BYTE_LITERALS` is no type.

## ARM operands

Measured with GNU as 2.46.1 for AArch64 (`-march=armv9.6-a+sve2+sme2+cmpbr`) and 2.45 for AArch32
(ARMv7-A with NEON, Thumb, and Armv8.1-M with MVE), and with clang 22.1 for the same targets and
for Apple arm64. An `.arch` or `.arch_extension` line turns on SVE, SME and MVE inside a file for
every one of them, so one grammar reads all of it.

### Registers

The register names are generated: `reg_names` in GNU as's `tc-aarch64.c` and `tc-arm.c`, and LLVM's
register matchers with the aliases its parsers add. ARM takes the GNU as and LLVM names, ARM (Apple)
LLVM's AArch64 names, and Assembly both. The scanner reads a register as one whole word, suffix
included, and looks it up.

| Family          | Names                                                                                                                        | Suffix                                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| AArch64 general | `x0`-`x30`, `w0`-`w30`, `xzr`, `wzr`, `sp`, `wsp`, `lr`, `fp`; `x31` and `w31` (clang), `ip0` and `ip1` (GNU as)             | -                                                                                                        |
| FP and SIMD     | `b`, `h`, `s`, `d`, `q` 0-31; `v0`-`v31`                                                                                     | `v`: an arrangement `.8b .16b .4h .8h .2s .4s .1d .2d .1q .2b .4b .2h` or an element `.b .h .s .d`       |
| SVE             | `z0`-`z31`, `p0`-`p15`, `pn0`-`pn15`                                                                                         | an element `.b .h .s .d .q`                                                                              |
| SME             | `za`, the tiles `za0`-`za15` with `h` or `v` for a slice (`za3h`), `zt0`                                                     | `za` an element; a tile an element its number fits: `.b` tile 0, `.h` 0-1, `.s` 0-3, `.d` 0-7, `.q` 0-15 |
| clang only      | `nzcv`, `fpcr`, `fpsr`, `fpmr`, `vg`, `ffr`, and the register halves of its register allocator such as `w0_hi`               | -                                                                                                        |
| AArch32 general | `r0`-`r15`, `sb`, `sl`, `fp`, `ip`, `sp`, `lr`, `pc`, `wr`, `a1`-`a4`, `v1`-`v8`, Armv8.1-M `zr`                             | GNU as: a NEON type                                                                                      |
| AArch32 vector  | `s0`-`s31`, `d0`-`d31`, `q0`-`q15`, the VFP and MVE specials `fpscr` to `vpr`, iWMMXt and XScale names, `ra_auth_code`       | GNU as: a NEON type                                                                                      |
| AArch32 other   | coprocessors `p0`-`p15`, `c0`-`c15`, `cr0`-`cr15`; banked `r8_usr` to `elr_hyp`; clang's `apsr`, `cpsr`, `spsr`, `apsr_nzcv` | GNU as: a NEON type on its own names                                                                     |

GNU as reads a register in lower case or all upper case (`X0`, not `Xzr`), clang in any case. The
grammar takes any case, since one assembler of each language does. ARM (Apple) leaves out the
AArch32 registers and `ip0` and `ip1`, which Apple's clang rejects.

Both assemblers accept the same arrangements: a count of 1, 2, 4, 8 or 16 lanes whose size in bits
is 64 or 128, `.1q`, and the dot-product shapes `.2b`, `.4b` and `.2h`; GNU as also takes leading
zeros in the count (`v0.016b`). A NEON type is `.8`, `.16`, `.32` or `.64`, optionally after `i`,
`s`, `u`, `p` or `f`, or `.f` (32 bits), `.d` (64 bits) or `.bf16`, in any case. GNU as takes it on
every register of its table (`r0.i32`, `fpscr.f32`, `p15.f32`). Some positions still reject it: a
memory base, a core register list, and a type also given in the mnemonic
(`vadd.i32 q0.i32, q1, q2`); the grammar reads it wherever a register goes. A suffix no rule takes
leaves the whole word a symbol: `d0.x32`, `v0.q`, `za1.b`.

### System registers

A system register reads as a `register` only in the operand slots that take one, the system roles
in the table below; elsewhere it is a symbol, as both assemblers read it (`b tpidr_el0` branches to
a symbol). The names are generated:

- AArch64: GNU as's `aarch64-sys-regs.def` and PSTATE fields, LLVM's system register, PSTATE and
  SVCR tables.
- AArch32: GNU as's `cpsr` and `spsr` fields (`cpsr_fc`) and M-profile names (`primask`,
  `basepri_max`), LLVM's M-profile and banked register tables.

Rules add the forms no table lists:

- AArch64 generic encodings `s<op0>_<op1>_c<n>_c<m>_<op2>`, `op0` 0-3, `op1` and `op2` 0-7, `n` and
  `m` 0-15 (`s3_0_c1_c0_0`). clang reads each field in decimal without leading zeros, GNU as with
  them too (`s3_0_c01_c0_0`).
- The control registers of `sys`, `sysl` and `sysp`: `c` and a number from 0 to 15. clang reads
  decimal digits (`c7`, `c07`); GNU as reads an expression there, of which the grammar takes one
  integer in any GNU form (`c0x7`, `c016`, `c7u`). An expression such as `c(3+4)`, which GNU as
  also takes, does not read as a register.
- AArch32 APSR bits after `apsr`, `iapsr`, `eapsr`, `psr` and `xpsr`: `n`, `z`, `c`, `v` and `q`
  all or none, and `g`, in any order (`apsr_nzcvq`, `apsr_gnzcvq`, `xpsr_g`).
- `APSR_` with `nzcv` in any order, which GNU as reads in `vmrs` and the CDE instructions.

A `cpsr` or `spsr` field takes lower case only (`CPSR_fc`, not `CPSR_FC`), as both assemblers
require, and so do the `APSR_` flags in an order other than clang's `nzcv`.

Every system slot of a language reads every form, so a name valid in one system slot reads as a
register in all of them: `mrs x0, c7` reads `c7` as a register, though no assembler takes it there.
This changes no valid program, since no assembler takes a symbol in a system slot. Which names a
slot takes depends on the instruction (readable registers for `mrs`, writable ones for `msr`,
128-bit ones for `mrrs` and `msrr`, PSR masks per instruction), and both assemblers check that after
parsing: clang's `tryParseSysReg` takes any word in a system register slot and leaves unknown names
to its matcher. Splitting the slots by kind would still not be exact, so the grammar leaves the
check to the assembler, as it does for every operand.

### Where a word is a register

The assemblers decide by instruction whether a word is a register, a condition or a symbol. Both
read `adrp x0, x1` and `adrp x0, lt` as references to C globals named `x1` and `lt`. GNU as reads
`bl sp`, `b x0` and `ldr x0, x1` as branches and loads to symbols. Every assembler reads `b eq` as a
branch to the symbol `eq`, and `csel x0, x1, x2, lt` as a condition even when a symbol `lt` exists.
`mov x0, x1` reads `x1` as the register even when a symbol `x1` exists. Apple's clang reads `b LT`
as a branch to a local label.

The grammar follows this with roles: `tree-sitter/common/roles.js` lists the positions where an
instruction takes a label, a condition or a system register, and each generated instruction carries
the role its operand types fit. Every word may take any case.

| Role                             | Words                                                                                                                                                                                                                                 | Position |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| label                            | `b`, `bl`, `b.<cond>`, `bc.<cond>`, `b<cond>`; AArch32 `bl<cond>`, `b<cond>.w`, `b<cond>.n`, `pld`, `pli`, `bfx`, `bflx`                                                                                                              | 1        |
| two labels                       | AArch32 `bf`, `bfl`                                                                                                                                                                                                                   | 1 and 2  |
| label                            | `cbz`, `cbnz`, `adr`, `adrp`, `ldr`, `ldrsw`, `prfm`, `movz`, `movk`, `movn`; AArch32 `cbz.n`, `cbnz.n`, `adr`, `ldr`, `ldrb`, `ldrh`, `ldrsb`, `ldrsh` and `vldr` with a condition and a width, `adrl`, divided `ldr<cond>b`, `letp` | 2        |
| label                            | `tbz`, `tbnz`, `cb<cc>`, `cbb<cc>`, `cbh<cc>`; AArch32 `wls`, `wlstp.<size>`                                                                                                                                                          | 3        |
| label after an optional register | AArch32 `le` (`le lr, label` or `le label`), `ldrd` (`ldrd r0, r1, label` or `ldrd r0, label`)                                                                                                                                        | last     |
| three labels, then a condition   | AArch32 `bfcsel` (clang reads only numeric labels there; GNU as also `r1`)                                                                                                                                                            | 1-3, 4   |
| condition                        | AArch32 `it` to `itttt`, `vpt` to `vptttt`, `vcmp`                                                                                                                                                                                    | 1        |
| condition                        | `cset`, `csetm`                                                                                                                                                                                                                       | 2        |
| condition                        | `cinc`, `cinv`, `cneg`                                                                                                                                                                                                                | 3        |
| condition                        | `csel`, `csinc`, `csinv`, `csneg`, `ccmp`, `ccmn`, `fcsel`, `fccmp`, `fccmpe`                                                                                                                                                         | 4        |
| system register                  | `msr`, `msrr`; AArch32 `vmrs`                                                                                                                                                                                                         | 1        |
| system register                  | `mrs`; AArch32 `cx1`, `cx1a`                                                                                                                                                                                                          | 2        |
| system register                  | `mrrs`; AArch32 `mrc`, `cx1d`, `cx1da`                                                                                                                                                                                                | 3        |
| system register                  | `sys`, `sysp`; AArch32 `cx2`, `cx2a`                                                                                                                                                                                                  | 2 and 3  |
| system register                  | `sysl`; AArch32 `cx2d`, `cx2da`                                                                                                                                                                                                       | 3 and 4  |
| system register                  | AArch32 `cx3`, `cx3a`                                                                                                                                                                                                                 | 2-4      |
| system register                  | AArch32 `cx3d`, `cx3da`                                                                                                                                                                                                               | 3-5      |

The roles come from the operand types upstream gives each instruction: GNU as's AArch64 operand
kinds and AArch32 operand codes, and the operand classes of LLVM's AArch64 matcher, in which a
register pair (`x0, x1`) counts as two operands. A label slot reads a bare word as a symbol,
whatever it is named; brackets, `#`, `=`, relocations and expressions read the same as anywhere. A
system slot reads system registers as `register` and anything else as anywhere. A condition slot
reads condition words as `condition`. Everywhere else register words are registers and system
register and condition words are symbols. Operands before and after the slot read normally, and a
slot may stay empty while a line is typed. At a position with an optional register the grammar reads
the register when another operand follows and the label
otherwise, as GNU as does: `le r1` and `ldrd r0, r2` branch to and load from labels named `r1` and
`r2`, and `le lr` branches to a label named `lr`. `blx`, which takes a register or a label, is not
in the table. A table of every instruction's operands would add thousands of entries for each Arm
release and would still be wrong for macros, which can take an instruction's name. A role mnemonic
glued to a macro argument (`b\cond`, `ldr\size`) is one `concatenation`, as at the start of any
statement; the grammar cannot know which instruction it becomes, so its operands read normally.

Directive arguments are symbols: `.quad x0, lr` stores two addresses. The exceptions are the
directives that take registers, below.

### Operand forms

| Node               | Form                                                                                                                                                                | Fields                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `register`         | a register with its arrangement (`v0.16b`, `z0.d`, `p0.s`), type (`d0.f32`) or field (`cpsr_fc`)                                                                    | -                               |
| `predicate`        | `p0/z`, `p0/m`, `pn8/z`                                                                                                                                             | `register`, `qualifier`         |
| `indexed_register` | a register or name glued to `[...]` or after a blank: `v1.s[2]`, `d0[]`, `za0h.s[w12, 0:1, vgx2]`                                                                   | `register`, `index`             |
| `index_range`      | `0:1` in an index                                                                                                                                                   | `start`, `end`                  |
| `memory_operand`   | `[` elements `]` with an optional `!`, also after a blank                                                                                                           | `operand`, `alignment`          |
| `alignment`        | `:128` after the base: `[r0:128]`, `[r0 :128]`, `[r0, :128]`                                                                                                        | `value`                         |
| `signed_register`  | `-r2`, `+r2`                                                                                                                                                        | `sign`, `register`              |
| `writeback`        | `r0!`                                                                                                                                                               | `register`                      |
| `register_list`    | `{` elements `}` with an optional lane `[1]` (also after a blank) and `^`                                                                                           | `element`, `index`              |
| `register_range`   | `r4-r7`, `v0.16b - v3.16b`, `{v31.16b-v2.16b}`                                                                                                                      | `start`, `end`                  |
| `literal_pool`     | `=expr`, in any operand: `ldr x0, =sym`, `ldr q0, =sym` (clang)                                                                                                     | `value`                         |
| `shift`            | a shift with an immediate or register amount (`lsl #3`, `lsl 3`, `lsl r2`), an extend with an optional amount (`sxtw`, `uxtw #2`), `rrx`, SVE `mul vl` and `mul #4` | `operator`, `amount`            |
| `condition`        | a condition word in a condition slot                                                                                                                                | -                               |
| `relocation`       | `:lo12:sym`, `#:lower16:sym`, `sym(GOT)`, and as before `sym@PAGE`                                                                                                  | `specifier`, `value`, `symbol`  |
| `register_alias`   | `name .req x0`, `name .dn d0`, `name .qn q0`                                                                                                                        | `name`, `directive`, `register` |

After `[` or `{` an element is required. `[]` reads a missing element, `{}` a missing register and
`d0[]` a missing expression, the hidden tokens that close constructs being typed, which is also how
`d0[]`, a valid lane, parses. The scanner closes `[` and `{` at the end of a line, before a
separator and before any character that cannot continue them (see The external scanner).

### Relocations

A `:name:` relocation reads in Assembly and ARM. Apple's clang parses it but cannot encode it for
Mach-O ("unknown AArch64 fixup kind"), so ARM (Apple) keeps `@PAGE` and `@PAGEOFF`. The names are
generated: GNU as's `reloc_table` in `tc-aarch64.c`, and `group_reloc_table` and the words
`parse_half` reads in `tc-arm.c`; clang's `parseSymbolicImmVal` (AArch64) and `parsePrefix`
(AArch32).

| Names                                                                                                                                                                                                                                                   | GNU as | clang |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----- |
| `lo12`, `abs_g0`-`abs_g3` with `_s` and `_nc`, `prel_g0`-`prel_g3` with `_nc`, `got`, `got_lo12`, `gotpage_lo15`, `pg_hi21_nc`, `tlsdesc`, `tlsdesc_lo12`, `dtprel_*`, `gottprel`, `gottprel_lo12`, `gottprel_g1`, `gottprel_g0_nc`, `tprel`, `tprel_*` | yes    | yes   |
| `pg_hi21`, `gotpage_lo14`, `gotoff_lo15`, `gotoff_g0_nc`, `gotoff_g1`, `tlsgd`, `tlsgd_lo12`, `tlsgd_g0_nc`, `tlsgd_g1`, `tlsldm`, `tlsldm_lo12_nc`, `tlsdesc_off_g0_nc`, `tlsdesc_off_g1`                                                              | yes    | no    |
| `dtprel`, `secrel_lo12`, `secrel_hi12`, `got_auth`, `got_auth_lo12`, `tlsdesc_auth`, `tlsdesc_auth_lo12`                                                                                                                                                | no     | yes   |
| AArch32 `lower16`, `upper16`, `lower0_7`, `lower8_15`, `upper0_7`, `upper8_15`                                                                                                                                                                          | yes    | yes   |
| AArch32 group relocations `pc_g0`, `pc_g0_nc`, `pc_g1`, `pc_g1_nc`, `pc_g2`, `sb_g0`, `sb_g0_nc`, `sb_g1`, `sb_g1_nc`, `sb_g2`                                                                                                                          | yes    | no    |

Both accept a name with blanks around it (`: lo12 :`), and both reject an unknown name (`:foo:`).
GNU as takes every name in any case, and so does clang for AArch64; clang's AArch32 names are lower
case only. The value after the second colon is any expression. clang 22.1 does not read `dtprel` and
`tprel` yet; they come from LLVM's current source.

AArch32 code writes a relocation after its operand instead, in parentheses: `.word sym(GOT)` or
`bl sym(PLT)`. The names are generated from GNU as's `reloc_names` in `tc-arm.c` and clang's
`AtSpecifierDefs` in `ARMMCAsmInfo.cpp`. Both assemblers accept `got`, `gotoff`, `got_prel`,
`target1`, `target2`, `sbrel`, `tlsgd`, `tlsldm`, `tlsldo`, `gottpoff`, `tpoff`, `tlscall`,
`tlsdesc`, `funcdesc`, `gotfuncdesc`, `gotofffuncdesc`, `tlsgd_fdpic`, `tlsldm_fdpic` and
`gottpoff_fdpic`; `plt` in data and `tlsdescseq` need GNU as, `prel31`, `none`, `imgrel` and
`secrel32` clang. clang takes any case; GNU as only the lower and upper case spellings its table
lists (`sym(Got)` is an error), and its table spells the upper case of `gottpoff_fdpic` as
`GOTTPOFF_FDIC`, which the grammar reads too. Both take a blank before `(` and an addend after it
(`sym(GOT)+4`). GNU as also applies the name to the whole expression before it (`sym+4(GOT)`),
which the grammar reads the same way. In a blank-separated `.irp` list `a (b)` stays two values, as
GNU as reads it. This form reads in Assembly and ARM. The scanner owns its names: after `(` it reads
the name as a whole word, and it does not split a blank-separated operand before `(` and a name, so
`bl sym (PLT)` is one operand, as both assemblers read it.

### Directives with register operands

A few directives take registers, and there register words are registers:

- CFI: `.cfi_def_cfa`, `.cfi_def_cfa_register`, `.cfi_llvm_def_aspace_cfa`, `.cfi_offset`,
  `.cfi_val_offset`, `.cfi_rel_offset`, `.cfi_register`, `.cfi_restore`, `.cfi_undefined`,
  `.cfi_same_value`, `.cfi_return_column`, `.cfi_val_encoded_addr`, in every ARM language. Both
  assemblers read a register or a number there; clang also takes a symbol.
- AArch32 unwinding: `.save {r4-r7, lr}`, `.vsave {d8-d15}`, `.setfp fp, sp, #8`, `.movsp ip`.
- Windows on ARM64: `.seh_save_reg`, `.seh_save_regp`, `.seh_save_fregp` and the other twelve
  `.seh_save_*` directives that name a register, which clang reads for `aarch64-windows`.

The unwinding and Windows directives read in Assembly and ARM. ARM (Apple) adds `.loh`, the linker
optimization hint clang writes: `.loh AdrpAdd Lloh0, Lloh1`, a kind (a name or a number), a blank,
then labels separated by commas.

`name .req reg` gives a register a second name. GNU as and clang accept it on every ARM target,
clang in any case and GNU as in lower case; the grammar reads it in any case in every ARM language.
NEON's `.dn` and `.qn` do the same for `d` and `q` registers, with a type or a lane
(`sum .dn d4.f32`, `lane .dn d5.f32[1]`). Only GNU as for AArch32 accepts them, and only in lower
case, so they read in Assembly and ARM and nowhere in upper case; elsewhere `sum .dn d0` is an
instruction named `sum`.

Both assemblers accept an alias wherever a register goes, also in register lists, ranges,
writeback, lanes and before an arrangement (`src.16b`). The same positions take a macro argument
(`{\r0\().16b, \r1\().16b}`, `\v\().s[1]`, `ldm \base!, {\a}`), and ARM (Apple) a positional
argument (`{$0.16b}`), which FFmpeg's and dav1d's NEON macros use throughout. The grammar reads
`.req`, `.dn` and `.qn` lines as a `register_alias`. A name or macro argument in a register list, a
range, a writeback or before a lane is an `identifier`, a `macro_argument` or a `concatenation`,
which also keeps a register name still being typed (`{d8-d`) from breaking the line. A
concatenation there starts with a register, a name or a macro argument, never a dot name: GNU as
and clang read `.foo .req r1` as an unknown directive and reject `{.foo}`, so a register list
closes before `.foo` and the error stays on its line. x86 register positions use the same rule
with their own heads, a register or a `%` name (`%xmm\i`).

### Keywords

Every listed word is a scanner word: the scanner reads it whole and looks it up in its generated
table, only where the parser expects that kind of word. That holds for instructions, directives,
registers, relocation names, and since M5 for conditions, shift and extend words and the predicate
qualifier, which were grammar keywords before. tree-sitter's lexer stops at a token of higher
precedence instead of going on to a longer token of lower precedence, so a word as an ordinary
token splits a longer word (`lsls` read as `lsl` and `s`, M2's `.macros` as `.macro` and `s`).
Keywords of a word token avoided that but brought rules of their own: one shared precedence, no two
keywords matching the same string, and an Apple `L` pattern that had to leave out every `L`
keyword. With every word in the scanner, no grammar declares a word token, and
`test/grammar/keywords.test.ts` checks that no grammar has a case-insensitive token.

The words come from upstream:

| Words                      | GNU as                                                              | clang                                                                          |
| -------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| AArch64 conditions         | `aarch64_conds`, with the SVE aliases and `ul`                      | `parseCondCodeString`, with the SVE aliases                                    |
| AArch32 conditions         | `conds`                                                             | `ARMCondCodeFromString`                                                        |
| AArch64 shifts and extends | `aarch64_operand_modifiers`, extends by `aarch64_extend_operator_p` | `tryParseOptionalShiftExtend`, extends by the words that need no amount; `mul` |
| AArch32 shifts             | `shift_names`; `rrx` takes no amount                                | `tryParseShiftToken`, `parseMemRegOffsetShift`                                 |
| SVE predicate qualifier    | `parse_predication_for_operand` (`z`, `m`)                          | the predication check of the SVE predicate parser                              |

A condition reads as one only in a condition slot (see Where a word is a register). A shift word
reads as one only before its amount (`lsl #2`, `lsl r1`), which both assemblers require, so
`mov x0, lsl` loads the symbol `lsl`. An extend word reads with or without its amount (`uxtw`,
`uxtw #2`); a word that is an extend in one architecture of a language and a shift in another
(`uxtw` in AArch64 and AArch32) reads as an extend. Case follows the assemblers: GNU as hashes its
conditions and modifiers in lower and upper case and lists its AArch32 shifts in both, clang takes
any case for these, so a word clang knows takes any case and GNU as's `ul` takes lower or upper case
only (`Ul` is a symbol). clang's AArch32 `uxtw` comes from `parseMemRegOffsetShift`, which lists
`uxtw` and `UXTW` only.

The relocation specifier after `@` is read by the scanner, which accepts it only right after the
`@`. The relocation names of `:lo12:` and `sym(GOT)` are scanner words too, because the scanner
must know them to close `:lo` or `sym(G` while they are typed.

Words that start with `.` cannot be identifiers, so the scanner reads them whole as well: the block
openers, `.loc` and `.file`, the register directives above and the alias words `.req`, `.dn` and
`.qn`, which it matches in lower case only for `.dn` and `.qn`.

### Apple `L` names

In ARM (Apple) an `L` name is a `local_identifier` in operands too: `adrp x0, Ltmp0@PAGE`,
`b LBB0_2`, `.quad Ltmp0 - Lfunc_begin0`, also glued to a macro argument (`Lskip\@:`) and as an
assigned name. At the start of a statement it may also be a mnemonic, so `LDP x0, x1, [sp]` and a
macro named `Lmacro` read as instructions. A register, condition or shift word reads as one where
the parser expects it and as a local name elsewhere, since the scanner reads those words before
the grammar's `L` pattern: `mov x0, LR` reads a register, `b LR` and `.quad LR` the local symbol
`LR`, and `b LDR` the local symbol `LDR`. `csel x0, x1, x2, LT` reads a condition and
`add x0, x1, x2, LSL #2` a shift, while `b LT`, `b LSL` and `mov x0, LSL` read local symbols, as
Apple's clang does.

### Limits

- SVE patterns (`vl8`, `all`, `pow2`), prefetch operations (`pldl1keep`), barrier options (`ish`),
  the AT, DC, IC and TLBI operations (`vae1`, `civac`) and SME's `vgx2` are symbols.
- An alias name is an identifier where it is used; only its `.req` line shows that it names a
  register. A predicate takes a register only, because `pg/z` with a name is also a division.
- The grammar reads operand shapes, not instructions: `zero {za0.s-za3.s}` parses, though the
  assemblers reject that list for `zero`.

## x86 operands

Measured with GNU as 2.46.1 (`--64` and `--32`) and clang 22.1 (`x86_64` and `i686` Linux,
`x86_64` Apple). A construct reads when one assembler of the language accepts it, in 64-bit or
32-bit code, since `.code16`, `.code32` and `.code64` switch between them inside a file.

### Syntax mode

GNU as and clang read AT&T syntax until a `.intel_syntax` line, and AT&T again after `.att_syntax`.
The scanner keeps the mode, in text order, in two bits of its state: Intel or AT&T, and whether a
bare register name is a register. Assembly follows the same lines.

| Line                                | Mode                       | Assemblers |
| ----------------------------------- | -------------------------- | ---------- |
| `.intel_syntax noprefix`            | Intel, bare register names | both       |
| `.intel_syntax`                     | Intel, bare register names | both       |
| `.intel_syntax prefix`              | Intel, registers take `%`  | GNU as     |
| `.att_syntax`, `.att_syntax prefix` | AT&T                       | both       |
| `.att_syntax noprefix`              | AT&T, bare register names  | GNU as     |

`.intel_syntax` alone follows clang, which reads bare names as registers there; GNU as on ELF wants
`%` until `noprefix`, so the two differ only on code GNU as rejects. With bare register names, every
register name is a register in every operand, even where a symbol of that name exists, as both
assemblers read it; a quoted `"rbx"` is the symbol, and the same holds in directive arguments
(`.cfi_offset rbp, -16`). In Intel mode the scanner reads the Intel keywords below, in operands and,
as GNU as does, in directive expressions (`.long 1 shl 2`; clang rejects them there). Everywhere
else they are symbols, so `movq byte, %rax` loads the symbol `byte`.

tree-sitter reuses no subtree whose preceding scanner state differs. Changing or deleting a mode
line therefore reads everything after it again, and every other edit costs what it did before. The
state is one byte, and none at all in a file that never leaves AT&T.

### Operand forms

| Node                     | Form                                                                            | Fields                                              |
| ------------------------ | ------------------------------------------------------------------------------- | --------------------------------------------------- |
| `register`               | `%rax`, `% st ( 1 )`, a bare name in noprefix mode                              | -                                                   |
| `memory_operand` (AT&T)  | `disp(base, index, scale)` with each part optional, `%fs:` before it            | `segment`, `displacement`, `base`, `index`, `scale` |
| `memory_operand` (Intel) | `[expr]`, also after a displacement: `8[rbp]`, `sym[rip]`, `[rbx][rcx*4]`       | `displacement`, `address`                           |
| `typed_operand`          | `dword ptr [rbx]`, `qword [rbx]`, `near ptr target`                             | `type`, `operand`                                   |
| `operand_type`           | a size word with an optional `ptr` or `bcst`; `near`, `far`                     | -                                                   |
| `segment_override`       | Intel `fs:[0x28]`, `fs:0x28`, `FLAT:sym`, `0x10:0x1000`                         | `segment`, `operand`                                |
| `indirect`               | AT&T `*%rax`, `*(%rax)`, `*8(,%rax,8)`                                          | `operand`                                           |
| `decorated_operand`      | an operand and its decorators, `%zmm3{%k1}{z}`                                  | `operand`, `decorator`                              |
| `decorator`              | see Decorators                                                                  | -                                                   |
| `immediate`              | AT&T `$expr`                                                                    | `value`                                             |
| `prefix`                 | see Prefixes, as fields of `instruction`                                        | -                                                   |
| `operator_word`          | Intel `shl`, `and`, `eq`, `not`, `offset`, `imagerel`, `short` in an expression | -                                                   |

### Registers

The register names are generated from GNU as's `i386-reg.tbl`, LLVM's register matcher with the
`db0`-`db15` alias its parser adds, and the registers of yasm's register table:

| Family     | Names                                                                                                        | Notes                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| general    | `rax`-`rsp`, `eax`-`esp`, `ax`-`sp`, `al`-`dh`, `sil`, `dil`, `bpl`, `spl`, GNU as's `axl`-`dxl`             |                                                     |
| numbered   | `r8`-`r31` with no suffix or `d`, `w` or `b`                                                                 | `r16`-`r31` are APX                                 |
| segment    | `cs`, `ds`, `es`, `fs`, `gs`, `ss`; `flat`                                                                   | `flat` in Intel syntax only, as GNU as reads it     |
| control    | `cr0`-`cr15`, `dr0`-`dr15`, `db0`-`db15`, `tr0`-`tr7`                                                        |                                                     |
| x87        | `st` with an index `st(0)`-`st(7)`, `st0`-`st7`                                                              | `st0`-`st7` in GNU as's CFI directives and yasm     |
| vector     | `mm0`-`mm7`, `xmm0`-`xmm31`, `ymm0`-`ymm31`, `zmm0`-`zmm31`, `k0`-`k7`, `tmm0`-`tmm7`, `bnd0`-`bnd3`, `bsr0` | yasm's groups `mm`, `xmm` and `ymm` take an index   |
| addressing | `rip`, `eip`, `ip`, `riz`, `eiz`                                                                             |                                                     |
| special    | `eflags`, `rflags`, `fs.base`, `gs.base`, `tr`, `ldtr`, `fcw`, `fsw`, `mxcsr`                                | GNU as reads them in CFI directives, clang anywhere |
| clang only | `flags`, `dirflag`, `fp0`-`fp7`, `fpcr`, `fpsr`, `ssp`, `tmmcfg`                                             |                                                     |

Every assembler reads every name in any case. In AT&T syntax a register is `%` and a name, with
blanks allowed after `%` (`% rax`). An index follows `st`, `mm`, `xmm` or `ymm` in parentheses, with
blanks allowed anywhere (`% st ( 1 )`), and is an integer below the register's count: 8 for `st` and
`mm`, 16 for `xmm` and `ymm`. GNU as reads one digit there, clang and yasm an integer token, so the
grammar takes clang's integer, suffixes included: `%st(0x1)` and `%st(1u)` are `%st(1)`.

### Intel keywords

The words are generated from GNU as's `tc-i386-intel.c` (`i386_operators`, with the kind taken from
each operator code, `i386_types`, and the `ptr` and `bcst` that `i386_operator` reads after a size)
and from clang's `X86AsmParser` (the named operators, with the kind taken from the handler each one
calls, and `ParseIntelMemoryOperandSize`):

| Words                                                                                         | Kind     | Assemblers                                     |
| --------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------- |
| `byte`, `word`, `dword`, `fword`, `qword`, `mmword`, `tbyte`, `xmmword`, `ymmword`, `zmmword` | size     | both                                           |
| `oword`                                                                                       | size     | GNU as                                         |
| `float`, `long`, `double`, `xword`                                                            | size     | clang, only before `ptr`                       |
| `ptr`, `bcst`                                                                                 | size     | both, only right after a size word             |
| `offset`                                                                                      | operator | both                                           |
| `imagerel`                                                                                    | operator | clang                                          |
| `short`, `near`, `far`                                                                        | operator | GNU as; clang reads `short` only before a name |
| `and`, `or`, `xor`, `not`, `mod`, `shl`, `shr`                                                | operator | both                                           |
| `eq`, `ne`, `lt`, `le`, `gt`, `ge`                                                            | operator | GNU as                                         |

GNU as reads them in any case, clang in lower or upper case, so the words only clang reads take
lower or upper case only: `Float ptr` and `Imagerel` are symbols. clang errors on its size words
without `ptr`, and GNU as reads them as symbols, so `mov eax, float` loads the symbol `float`.
`imagerel` comes from LLVM's current source; clang 22.1 does not read it yet. `tword`, `type`,
`size`, `length`, `seg`, `dup` and the other MASM words are ordinary symbols in both: clang reads
them only for MASM and Microsoft inline assembly. `ptr` and `bcst` alone are symbols too
(`call ptr`). A size word alone is a value in GNU as: `mov eax, byte` loads 1. Every one of these
words can still name a label (`byte:`).

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
(`{vex}vpdpbusd`), and several may stand in a row (`{load} {disp32} movq`, GNU as). One prefix
word may come before them and any number after them (`lock {disp32} addl`, GNU as), as GNU as
measures; a pseudo-prefix after a second prefix word, or after a word that follows another
pseudo-prefix, is an error in both. A prefix alone on a line applies to the next instruction, and
`rep; movsb` separates the two with `;` (see The external scanner).

### Decorators

The decorator words are generated from GNU as's `tc-i386.c` (`RC_NamesTable`, the broadcast counts
of `check_VecOperations`, its zeroing letter, and the word before `=` in
`check_Scc_OszcOperations`) and from clang's `X86AsmParser` (`ParseRoundingModeOp`, the broadcast
cases, `ParseZ` and `parseCFlagsOp`). The masks are the registers of the mask classes: GNU as's
`RegMask` in `i386-reg.tbl` and LLVM's `VK1`.

| Decorator                                               | Notes                                                  |
| ------------------------------------------------------- | ------------------------------------------------------ |
| `{%k0}` to `{%k7}`, `{k0}` to `{k7}`                    | a mask; `{k1}` in clang for AT&T and in both for Intel |
| `{z}`                                                   | zeroing, after or before the mask                      |
| `{1to2}`, `{1to4}`, `{1to8}`, `{1to16}`, `{1to32}`      | broadcast                                              |
| `{rn-sae}`, `{rd-sae}`, `{ru-sae}`, `{rz-sae}`, `{sae}` | rounding, an operand of its own                        |
| `{rn-` and any word `}`, the same for `rd`, `ru`, `rz`  | rounding in clang, which skips the word after `-`      |
| `{dfv=of,sf,zf,cf}`                                     | APX flags, any of the four, also none                  |

Blanks are allowed inside braces and between them, and around clang's `-`. `{z}`, `{1toN}` and the
rounding forms are lower case only; `{dfv=...}` and the masks take any case. Both assemblers parse
`{k0}` and reject it as a write mask afterwards, so it reads as a mask.

The scanner reads a pseudo-prefix and a decorator whole, each from its generated table, so a `{`
that starts neither closes what is open.

### Limits

- A file assembled with `-msyntax=intel` or `-masm=intel` and no mode line reads as AT&T, since the
  text does not show the mode.
- The mode follows the text: across `#if` branches the later line wins, and a macro body reads in
  the mode where it is written.
- A statement's first word is a mnemonic even when it names a C macro, as GNU as cannot tell without
  the definitions.
- Apple's x86-64 output parses, but its `L` temporaries are ordinary labels: the x86 languages
  follow ELF's `.L`, and there is no Apple x86 language.
- The grammar reads operand shapes, not instructions: `movq %al, %rbx` parses.

## NASM

x86 (NASM) reads what nasm 3.02 and yasm 1.3.0 accept, measured with `-f elf64`, `-f elf32` and
`-f bin`, and for format-specific directives with `-f obj`, `-f win32`, `-f win64` and
`-f macho64`. The grammar accepts what either assembler accepts, and the tables say which one does.
Where the two read the same text differently, the grammar follows nasm, the maintained assembler:
`rip` is a symbol, the AVX-512, AMX and MPX registers are registers, `bnd` is a prefix, braces are
decorators and pseudo-prefixes, and `!` is logical not. The parser can't see the output format, so
every format's directives are directives in every file.

### Registers

The register names are nasm's, generated from `x86/regs.dat` by nasm's own `regs.pl`. yasm reads no
register that nasm lacks the same way: its `rip` and its register groups (`st(1)`, `xmm(3)`) are
symbols to nasm, so they are symbols here.

| Family              | Names                                                                                             | nasm                          | yasm                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------- |
| general             | `rax`-`r15`, `eax`-`r15d`, `ax`-`r15w`, `al`-`r15b`, `ah` `bh` `ch` `dh`, `sil` `dil` `bpl` `spl` | yes                           | yes                                                                   |
| APX general         | `r16`-`r31` and their `d`, `w`, `b` forms                                                         | yes                           | no: symbols                                                           |
| segment             | `cs` `ds` `es` `fs` `gs` `ss`, and `segr6` `segr7` in nasm                                        | yes                           | yes, without `segr6` `segr7`                                          |
| control, debug      | `cr0`-`cr31`, `dr0`-`dr31`                                                                        | yes                           | `cr0` `cr2` `cr3` `cr4` `cr8` and `dr0`-`dr7`; the others are symbols |
| test                | `tr0`-`tr7`                                                                                       | yes, with an obsolete warning | reserved, but rejects the instruction                                 |
| x87                 | `st0`-`st7`                                                                                       | yes                           | yes                                                                   |
| MMX, SSE, AVX       | `mm0`-`mm7`, `xmm0`-`xmm15`, `ymm0`-`ymm15`                                                       | yes                           | yes                                                                   |
| AVX-512             | `xmm16`-`xmm31`, `ymm16`-`ymm31`, `zmm0`-`zmm31`, `k0`-`k7`                                       | yes                           | no: symbols                                                           |
| AMX, MPX            | `tmm0`-`tmm7`, `bnd0`-`bnd3`                                                                      | yes                           | no: symbols                                                           |
| instruction pointer | `rip`                                                                                             | no: a symbol                  | yes, in `[rip+8]`                                                     |

Names are case-insensitive. A register name can't be a label (`eax:` is rejected by both), and `$`
escapes it (`$eax:`). `st(0)`, a bare `st`, `r8l`, `db0`, `eiz`, `riz`, `ip` and `eip` are not
nasm registers.

### Prefixes

The prefix words are nasm's: the `TOKEN_PREFIX` sections of `asm/tokens.dat` (those marked
`TFLAG_BRC` only in braces), and what `add_prefix` in `asm/parser.c` also takes, the segment
registers and `strict`. yasm's prefixes are all nasm prefixes too. Measured with nasm 3.02 and
yasm 1.3.0; nasm parses `segr6 nop` with `segr6` as a prefix and then refuses to encode it.

| Words                                                                                     | nasm                | yasm               |
| ----------------------------------------------------------------------------------------- | ------------------- | ------------------ |
| `rep` `repe` `repz` `repne` `repnz` `lock` `xacquire` `xrelease`                          | yes                 | yes                |
| `o16` `o32` `o64` `a16` `a32` `a64`                                                       | yes                 | yes                |
| `bnd`                                                                                     | yes                 | no: a label        |
| `asp` `osp` `nobnd`                                                                       | yes                 | no: a label        |
| `wait`                                                                                    | yes                 | no: an instruction |
| `cs` `ds` `es` `fs` `gs` `ss` before an instruction                                       | yes                 | yes                |
| `segr6` `segr7` before an instruction                                                     | parsed, not encoded | no: a label        |
| `strict` before an instruction                                                            | yes                 | no: an error       |
| `{vex}` `{vex2}` `{vex3}` `{evex}` `{rex}` `{rex2}` `{nf}` `{zu}` `{pt}` `{pn}`, any case | yes                 | no: yasm skips `{` |

Prefix words are reserved in any case, except the words nasm takes only in braces: `rex nop` is a
colonless label `rex` and `nop`. `notrack`, `data16` and `addr32` are not NASM prefixes either:
`notrack jmp rax` assembles as a colonless label and `jmp rax`. GNU's `{load}`, `{store}`,
`{disp8}` and `{disp32}` are not valid brace tokens in nasm, and neither are `{nd}`, `{cf}` or
`{nooc}`.

The decorators are generated from the same file: its decorator rows (`{1to2}` to `{1to32}`,
`{rn-sae}` to `{rz-sae}`, `{sae}`, `{z}`) and its `dfv=` constants (`{dfv=of,cf}`, also none). The
masks are the registers `regs.dat` lets stand in braces, `k1` to `k7`: nasm rejects `{k0}` as a
brace token. All of them take any case (`{K1}{Z}`, `{RN-SAE}`, `{DFV=}`), with no blanks inside
the word (`{rn - sae}` is an error).

### Size words and operand keywords

The words are generated from nasm's `asm/tokens.dat`, with the kind taken from each token type and,
for the special words, from their value, and from the `%idefalias` lines of `macros/standard.mac`
that name a token, which spell the function words without `?` (`__utf16__`):

| Words                                                 | Where                                                         | nasm  | yasm                |
| ----------------------------------------------------- | ------------------------------------------------------------- | ----- | ------------------- |
| `byte` `word` `dword` `qword` `tword` `oword` `yword` | before an operand, and first inside a bracket (`[dword ebx]`) | yes   | yes                 |
| `zword`                                               | the same                                                      | yes   | no: a symbol        |
| `long`                                                | the same, 32 bits                                             | yes   | yes                 |
| `strict`                                              | before a size word or an operand                              | yes   | yes                 |
| `short` `near` `far`                                  | before a jump or call target                                  | yes   | yes                 |
| `rel` `abs` `nosplit`                                 | first inside a bracket; `default rel`, `default abs`          | yes   | yes                 |
| `seg`                                                 | unary operator                                                | yes   | yes                 |
| `wrt`                                                 | after an operand, before a special symbol or a segment        | yes   | also `rip`, chained |
| `to`                                                  | x87 `fadd to st1`                                             | yes   | yes                 |
| `__?masm_ptr?__`                                      | opens a memory operand without brackets                       | yes   | undefined symbol    |
| `__?masm_flat?__`                                     | the flat segment before `:`                                   | yes   | undefined symbol    |
| `ptr`                                                 | not a keyword: a symbol                                       | warns | undefined symbol    |

All of these are reserved in any case. A memory operand is `[` expression `]` with the base, index,
scale and displacement in any order (`[rcx*4+rbx]`, `[-8+rbp]`), blanks anywhere, and a segment
inside (`[fs:0x28]`, both) or before it (`fs:[0x28]`, nasm only). Nested brackets are rejected by
both. Far pointers are `0x10:0x1000`. nasm also takes the MPX split form, a base, a comma and an
index (`[rax+3, rbx]`, `[, rcx*1]`), read with the index in an `index` field, and an address-size
prefix first inside a bracket (`[a32 foo]`). `abs` also stands before an operand (`jmp abs x`),
the only one of the three nasm takes there; with no operand after it, as in `default abs`, it is a
plain argument.

nasm also opens a memory operand at `&` or `__?masm_ptr?__`, with no closing bracket: `&x + 4`,
`dword &x`, `&rel x` and `dword __?masm_ptr?__ x` load from memory as `[x + 4]` and the others do,
and the reference runs to the end of the operand. It is the same `memory_operand`, with the same
modifiers. `%use masm` defines `ptr` and `flat` as these two tokens; the grammar cannot expand the
macro, so `dword ptr foo` reads `ptr` as a word before an operand (see Macro calls and macro
words). `__?masm_flat?__` reads as the segment `register`, as GAS's
`FLAT:` does. yasm takes neither.

Special symbols start with `..`: `..plt`, `..got`, `..gotpcrel`, `..sym`, `..gottpoff`, `..tlsie`,
`..gotoff` and `..gotpc` for ELF, `..start` for obj, `..imagebase` for win64, each valid in its own
output format. `..@` names are the labels nasm generates for macro locals. Any other `..name` is an
error in nasm and an ordinary label in yasm.

### Directives

| Directive                                                                                                | nasm                     | yasm                                                    |
| -------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------- |
| `bits` `use16` `use32` `use64` `default` `section` `segment` `absolute` `extern` `global` `common` `cpu` | yes                      | yes                                                     |
| `default bnd`, `default nobnd`                                                                           | yes                      | no                                                      |
| `static` `required` `float` `sectalign`                                                                  | yes                      | no                                                      |
| `align` `alignb`                                                                                         | yes                      | yes                                                     |
| `struc` `endstruc` `istruc` `at` `iend`                                                                  | yes                      | yes                                                     |
| `db` `dw` `dd` `dq` `dt`, `resb` `resw` `resd` `resq` `rest` `reso` `resy`                               | yes                      | yes                                                     |
| `do`                                                                                                     | floats, strings, `?`     | integers, strings, `?`                                  |
| `dy`                                                                                                     | strings, `?`             | integers, strings, `?`                                  |
| `dz`, `resz`                                                                                             | yes (`dz`: strings, `?`) | no                                                      |
| `equ`, `times` (nested `times 2 times 3` in nasm only), `incbin`                                         | yes                      | yes                                                     |
| `[warning ...]`, `[list ...]`, `[dollarhex ...]`, `[debug ...]` (bracket form only)                      | yes                      | `[warning]` ignored with a warning; the others rejected |
| `org`, `[map ...]`                                                                                       | `-f bin`                 | `-f bin`                                                |
| `group` `uppercase` `import` `export`, `..start`                                                         | `-f obj`                 | no                                                      |
| `safeseh`                                                                                                | `-f win32`               | `-f win32`                                              |
| `osabi`                                                                                                  | ELF                      | no                                                      |
| `subsections_via_symbols` `no_dead_strip`                                                                | `-f macho64`             | `-f macho64`                                            |

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
| `%unmacro` `%unimacro`, `%exitmacro`                                                                           | name and count; none                                                      | no   |
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
| `%pathsearch` `%depend` `%use`                                                                                 | name and string; string; name                                             | no   |
| `%push` `%pop` `%repl`                                                                                         | context name                                                              | yes  |
| `%arg` `%local` `%stacksize`                                                                                   | raw                                                                       | no   |
| `%error` `%warning` `%fatal`                                                                                   | raw message                                                               | yes  |
| `%line` `%clear`                                                                                               | raw                                                                       | yes  |
| `%pragma` `%null`                                                                                              | raw                                                                       | no   |

Every `%if` form above also has an `%elif` form and a negated `n` form, read from `asm/pptok.dat`.

`.nolist` takes any case. In a macro count it must touch the count: `%macro m 1 .nolist`, with a
blank, makes it a default value, which nasm warns about. Before a `%rep` count only that exact word
counts, so `%rep .nolistx` repeats by the symbol `.nolistx`.

Preprocessor words are case-insensitive, and `%` must touch the word: `% define` is rejected. A
directive counts only as the first token of its line, after blanks: both assemblers reject
`f: %macro m 0` and `%%l: %rep 2` ("instruction expected"), and the grammar reports them, as GNU's C
preprocessor lines start their line too. A raw value ends at a `;` outside quotes, so
`%define A 1 ; comment` defines `1` and `%define A ';'` defines `';'`. `//` and `/*` start no
comment, so `%define D 10 // 3` keeps the signed division in its value. Text after a closer or
`%else`, and after a complete condition, `%rep` count or macro reference with its parameter count,
is ignored by both assemblers with a warning (`-w+pp-trailing`); the grammar reads it as raw text
(`%endif done`, `%rep 3 junk`, `%ifmacro m 1 x`). GNU as and clang reject such text, so GNU syntax
keeps the error.

A line that ends with a backslash continues on the next line, in both assemblers and everywhere: the
backslash and the newline are deleted with no space left, in operands, in `%define` values, in
strings and inside `;` comments, so `; note \` comments out the line after it. A blank after the
backslash, or the end of the file, prevents the join; a CRLF line end joins. The grammar reads a
join as a blank between tokens, as tree-sitter-c does, comments, strings and raw text continue past
it, and a join inside a token splices it as nasm does (`d\` and then `b 4` is `db 4`; see Grammar
modules). A word that ends right before a join, with a character that cannot continue it on the next
line, keeps the join inside its node: the scanner cannot see past the line end without reading it,
and its zero-width tokens rule out marking the end early. A directive after a line that holds only a
backslash still starts its line, and one after `nop \` does not. GNU syntax joins lines as the C
preprocessor does (see C preprocessor lines).

| Token              | Meaning                                                                                                    | yasm |
| ------------------ | ---------------------------------------------------------------------------------------------------------- | ---- |
| `%1`, `%2`, ...    | macro parameter; `%` and a digit is always one, so `7%2` is an error outside a macro and `7 % 2` is modulo | yes  |
| `%0`               | parameter count                                                                                            | yes  |
| `%00`              | the label before the macro call                                                                            | yes  |
| `%-1`, `%+1`       | a condition-code parameter, inverted or not                                                                | yes  |
| `%{1:3}`, `%{-1}`  | parameter ranges                                                                                           | yes  |
| `%%x`              | macro-local label; `%%%x` is an error                                                                      | yes  |
| `%$x`, `%$$x`      | context-local label, in the current or the enclosing context                                               | yes  |
| `%[expr]`          | indirection                                                                                                | no   |
| `%?`, `%??`, `%*?` | the macro name as called, as defined                                                                       | yes  |
| `%+`               | joins the tokens on both sides                                                                             | yes  |
| `%!NAME`           | environment variable                                                                                       | yes  |

### Macro calls and macro words

nasm expands single-line macros anywhere on a line, and the parser cannot see their definitions, so
it reads the shapes a macro can take. Measured with nasm 3.02 and yasm 1.3.0, and with the test
suites of both: 522 of the 525 upstream test files either assembler accepts parse clean. The other
three hold deliberate errors in `%ifdef ERROR` or dead code. libjpeg-turbo's `simd/` parses with
no errors.

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
| a bare `%word` where an operand fits       | `dir %iffile`, `dir [%iffile]`                 | `macro_expansion`                   |

A word followed by `(` has no other meaning in an expression, so the call needs no blank rule. At
the start of a statement the parentheses make a call only when they end the line; otherwise they
open the first of a multi-line macro's arguments (`m (1) + 2, 3`). Any `%word(` is a function, so
a new nasm function reads without a table. A bare `%word` is valid only as a macro argument, so it
never starts a statement: `f: %define X 1` stays an error.

A name or a macro token followed by an operand is a macro that the assembler expands first: a size
(`%define XMMWORD`), an operator, or `ptr` under `%use masm`. Both assemblers reject the same text
when the word is no macro, but the parser cannot see that, so it reads the word as the `type` of a
`typed_operand`, like `dword`. This replaces the earlier rule that only a comma separates operands:
a register or a number before an operand is never a macro, so `mov eax 1` and `push 1 2` stay
errors. `x[ebx]` and `8 [ebx]` stay displacements; with a blank, `x [ebx]` reads `x` as a type,
since that is how a macro-defined size is written. nasm itself reads a symbol there as a
displacement. That is a limit: the blank decides.

A macro token names whatever a symbol names: defines, assignments, labels with or without a colon,
macros, structures, declared symbols and `equ`. A dot name or a `$` name alone on its line is a
label (`.end`), as nasm reads it; a plain word alone stays a macro call. A name escaped with `$`
keeps any name characters after it, `$` included (`$$foo`, `$$$foo`), and `$3` names a symbol where
only a name can stand, for `[dollarhex off]`.

Single-line macro parameters take nasm's modifiers: `=x` (evaluate, with a radix such as `=x/x`),
`&x` and `&&x` (quote), `!x` (keep blanks), `x+` (greedy), and empty parameters (`(a, =b, )`).

Data lists follow the manual's grammar: `%(...)`, a size before parentheses (`dw byte (?, 44)`), and
`dup` with an optional size before its list. A list may hold lists, but not as its last item:
`db 2 dup (2 dup (0), 1)` assembles and `db 2 dup (1, 2 dup (0))` is an error in both assemblers.
A list still open at the end of its line may end with anything, so typing a nested list never
changes the lines around it.

A braced prefix may follow the mnemonic (`add {nf} eax, ecx`, `add{evex} dword [rdx], 16`). A brace
constant (`{dfv=of,cf}`) is a value in any expression; at the start of an operand it is the whole
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
A label there opens no block, because a field does not own the lines after it.

The data of an `at` line is a line of its own, because the macro expands it as `%2` on its own line.
So it may be an instruction, a data directive, another directive, a macro call, `times`, `equ`, a
structure or an instance, with a label in front (`at s.x, l: dd 1`). It sits in a `statement` field,
as in `times` and `align`. More data may follow on the next lines, as siblings of the `at` line.

Because these are macros, the blocks need not balance where they are written. Both assemblers accept
each of these, so the grammar does too:

- An `at` line reads anywhere, not only in an instance, because a macro or a `%if` may hold it.
- A closer with no open block of its kind is a plain `directive`. `%macro f 0` with `endstruc` in
  its body is valid, and so is `endstruc` in both branches of a `%if`.
- `%endmacro`, `%endrep`, `%endif`, `%else` and `%elif` end a structure or instance opened inside
  their block, so `%if 1`, `struc a`, `%endif`, `endstruc` reads with no error.
- A block with no closer is accepted, and its body is an `unclosed_body`, as for the other blocks.

A label may stand before each of the five words, with or without a colon. `iend`, `endstruc`,
`use16` and the other standard macros that take no parameters may also name a label (`iend: nop`),
which both assemblers accept with a warning. The table reads that from the macro's parameter count.
Any other standard macro is reserved, since `at: nop` would be a call of `at`.

Limits:

- A body takes any statement. `mov eax, 1` in a `struc` body parses, though both assemblers reject
  code in an absolute section.
- A stray `endstruc`, or `endstruc` closing an `istruc`, is no error here, though both assemblers
  reject it outside a macro. The grammar cannot tell it from the valid forms above.
- A `%` directive as the data of an `at` line (`at s.x, %define y 1`) is an error here, though both
  assemblers accept it: a directive counts only as the first token of its line.
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
reads them as prefix operators, so each is the `operator_word` of a `unary_expression`, as `seg`
is. A float function needs its parentheses (`__?float32?__ 1.5` is an error); the others take any
operand, parenthesized or not. Each also has a spelling without `?` (`__float32__`, `__utf16__`,
`__ilog2e__`) from `standard.mac`; `__bfloat16__` has none, so it is a symbol.

`.5` is a local label, not a float, and `$af` is the symbol `af`, not a number: `$` makes a number
only before a digit. `$` alone is the current position and `$$` the start of the section. `?x` is a
name, so `1 ?x : 3` is an error; the conditional needs a blank after `?`. Floats are accepted in
data directives; nasm rejects them as instruction operands, yasm doesn't.

Operators bind as in C, measured with `dd` values (`2 + 3 << 1` is 10, `1 | 2 ^ 3` is 1,
`3 & 1 == 1` is 1, `1 ? 0 ? 5 : 6 : 7` is 6). From the loosest: `?:` (nasm only, right-associative),
`||`, `^^`, `&&` (nasm only), the comparisons `=` `==` `!=` `<>` `<` `<=` `>` `>=` and `<=>` (`<=>`
nasm only), `|`, `^`, `&`, the shifts `<<` `>>` `<<<` `>>>`, `+` `-`, then `*` `/` `//` `%` `%%`,
and the unary `-` `+` `~` `!`, `seg` and the special operators. nasm accepts every operator in
instruction operands and `%if` alike. yasm skips `!` and misreads `>>>`. Division with `/` and `%`
is unsigned (`-7 / 2` is -4 in 32 bits in nasm), `//` and `%%` signed.

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

The grammar closes every open block at the end of the file, as it does for GAS, so that typing an
opener never breaks the lines below it.

### Limits

The parser reads the text as written and expands no macro, so a few valid files read with errors:

- A macro named like an instruction or directive reads as that instruction or directive. After
  `%macro mov 1`, both assemblers accept `mov 1 2` as a call with the one argument `1 2`; here it is
  a `mov` with a missing comma. The definition may sit in another file, which a parser cannot open.
- Both branches of a `%if` parse, since choosing one needs the condition's value: `mov eax 1` inside
  `%if 0` is an error here, and both assemblers skip it.
- A macro body parses where it is written, not as it expands: `mov eax, 1 %1` in a body is an error
  here, and `m +2` makes it `mov eax, 1 +2` for both assemblers.
- A `%define` value is raw text, since it may hold any tokens; its uses parse where they appear.
- With a blank, `x [ebx]` reads `x` as a size (see Macro calls and macro words); nasm reads a symbol
  there as a displacement.
- A `%` directive counts only as the first token of its line, so `at s.x, %define y 1` is an error
  here (see Structures).

## Editor behavior

Every language lists as comment markers exactly the characters its assemblers accept at the start of
a line: `//`, `#` and `@` in ARM, `//`, `#` and `;` in ARM (Apple), `//` and `#` in x86 (GAS), all
four in Assembly, and `;` in NASM. Enter after a full-line comment starts the next line with the
same marker; a comment after code does not continue. Toggle comment inserts `//`, which GNU as and
clang accept at the start of a line on every target, and `;` in NASM.

A `#` line that is a C preprocessor directive is not a comment. There the `preproc` scope limits
the markers to `//`, and Enter after `#define X 1` or `#endif /* X */` inserts nothing. Zed has one
limitation here. When nothing follows the cursor, at the very end of a file, Zed ignores scopes and
uses the base markers, so Enter after `#define X 1` inserts `#` and a space, and `/*` closes inside
a comment. Zed's own languages have the same limitation.

GNU as and clang accept `/* */` block comments. `/*` followed by Enter adds the closing `*/` and
starts the new line with a space, `*` and a space. NASM has no block comments.

`[`, `(` and `{` close everywhere. `"` closes outside strings. `'` closes outside strings and
comments: clang accepts only `'a'`, GNU as accepts `'a` and `'a'`, and in a comment `'` is usually
an apostrophe. `/*` closes outside strings and comments. NASM closes all three of its string quotes,
`"`, `'` and backquote. A pair closes only when a space, the end of the line or one of `,` `;` `)`
`]` `}` follows, the characters that can come after a closing bracket in assembly; typing `(` before
`.Lend` inserts no `)`. Enter between a pair gives a plain new line, because an assembly statement
ends at the end of its line and no bracket spans lines. In the ARM languages `[ ]` and `{ }` are
bracket pairs, so Zed highlights the partner and Move to Enclosing Bracket jumps between them; in
NASM `[ ]`, the `{ }` of a brace argument and the `%(` of a data list with its `)` are.

Double-click selects what the grammar reads as one name. `.` joins `.Lloop` and `b.eq`, `$` joins
`foo$1`, and `%` joins `%rax` and `%function`. NASM adds `?`, `@` and `#`, which its names may
contain.

Enter after a label indents one level, and typing `name:` on an indented line moves it back one
level: labels stay at the level of the block around them and code sits one level in. Both come from
the parse. A label opens an indent range from its end to the end of the file, label block or block
body that holds it, and moves back by cutting the range around it. Only what the parser reads as a
label counts, so a reserved word (`eax:` in NASM), a `name:` inside a comment, and a macro-call
label nested to any depth (`L(a(b(x))):`) behave as the parser reads them. Tab size and hard tabs
come from the user's Zed settings.

A label in a NASM `struc` is a field, and stays where it is typed. A new line follows the field
above it, so a structure keeps its layout: the nasm manual and nasm's tests indent fields,
libjpeg-turbo and yasm's tests keep them at column 0. Nothing moves a field, so a field typed on its
own line (`.x:`) indents the next line through the pattern below, and a field typed there stays at
that level.

Enter after a line that opens a block (`.macro`, any `.if` opener, `.elseif`, `.else`, `.rept`,
`.irp`, `.irpc`; in NASM `%macro`, `%imacro`, any `%if` or `%elif` opener, `%else`, `%rep`, `struc`,
`istruc`) indents one level. A NASM block word counts only at the start of its line, as nasm reads
it, so no label comes before it. Typing a clause or a closer aligns it with the line that opened its
block, whatever the indentation of the body; a body may also stay flush with its opener, as in the
Linux sources. A block opened and closed on one line (`.rept 2; nop; .endr`) does not indent the
next line, except in ARM (Apple) and NASM, where `;` starts a comment. Section directives such as
`.text` stay where they are typed. Hand-written GNU code indents them in 81 of 97 surveyed lines
(Linux, glibc and FreeBSD indent, musl does not) and compiler output always does; leaving them alone
keeps both styles. `#if` and `#ifdef` bodies get no indentation and no structure, since real `.S`
files keep them at the indentation of the code around them (Linux, glibc).

Two mechanisms do this, as in Zed's own languages:

- The tree. `indents.scm` in `queries/core` gives every block body an indent range (`body`, and
  `unclosed_body` for a block that the end of the file closes) and every label a range from its end
  (`@start`) to the end of the node that holds it. Every label is also an `@outdent`, which cuts the
  innermost range holding it, so a label moves back to the opener of that range and ends the range
  of the label before it. A `structure_body` has an indent range too, and its labels have neither
  capture. A clause or a real closer always ends a `body`. Zed aligns a line with the
  start row of a range that ends at the start of that line, so each clause and closer goes to its
  own opener, also after a closed inner block at the same column. Zed's `decrease_indent_patterns`,
  which its Bash and Python use, align with the nearest opener at or left of the line whether it is
  closed or not. That is right for Python, whose blocks are columns, and wrong for keyword blocks;
  the extension does not use them.
- A pattern. Zed indents from a tree range only when the range ends after the start of the new line.
  No range can do that on the last line of a file, where a block or label still being typed ends, so
  Enter after an opener or a label uses `increase_indent_pattern`, as Zed's Ruby, Bash and Python
  do. `scripts/lib/indent.ts` generates it. Its label part takes the label forms in `lexical.js`: in
  GNU syntax plain and dot names, digits (`1$` too in ARM and Assembly), quoted names, names built
  from macro arguments (`\name\()_end:`) and macro calls (`L(loop):`); in NASM names with `$`, `?`,
  `@` or `.`, `%%x` and `%$x`; a blank may come before the colon. NASM's reserved names, read from
  the scanner's tables, are left out as a trie complement. Its block part takes the block kinds of
  the language's syntax (a kind names its syntax in `languages.config.cjs`, or belongs to all) and
  `scanner.h`: each syntax's block words, and each dialect's strings, comments and reading of `;`,
  `#` and `@`. A kind with no opener word in a dialect of its syntax stops the build. The block part
  matches a line that holds an opener with no closer of the same kind in a later statement of the
  line, and it reads strings, character constants and comments the way the scanner does.

  The label part leaves out a label followed by a word that ends the label's range on its own line,
  read from the generated tables as a word complement. In every syntax that is a block closer or
  clause (`a: .endm`, `b: .else`): the closer ends the body that holds the label, and a clause still
  indents through the block part. In NASM it is also a word that names its statement: the data and
  reserve words, `times`, `at`, the structure words, and `equ`, after which the parser reads an
  assignment and no label at all (`.x: resd 1`, `.a: times 4 resd 1`, `n: equ 3`). A pattern match
  outranks nearly every tree range and cannot know it is inside a structure, so without this each
  new field would indent, and `endstruc` right after a field would land too deep. So at the end of a
  file Enter after `buf: resb 4` stays level; elsewhere the label's tree range still indents the
  next line. A test parses every label form with each grammar, followed by nothing, by code and by
  each of these words, and checks that the label part matches a line exactly when the parser reads
  a label at its start whose range goes on past the line.

The pattern cannot follow the parser in five cases, since each needs more than a regular expression.
Each changes only whether the next line starts indented:

- The same block kind opened twice and closed once on one line (`.if A; .if B; .endif`).
- In ARM, a `#` comment on an opener line that contains `; .endr`. The scanner reads `#` as an
  immediate or a comment by whether an operand fits there.
- A label built from a macro argument before a closer on the same line.
- A macro-call label nested deeper than eight parentheses, on the last line of a file: Enter after
  it does not indent there, since only the pattern applies and a regular expression cannot count.
  Elsewhere the tree indents under it.
- A clause after `.endr` or `.endm` on its line. The pattern reads it as the end of the clause's
  conditional, while the closer may instead close a repeat block or macro inside that conditional.

Zed looks for indentation ranges within 16 KB around the edited line. A closer typed more than about
8 KB below its opener is therefore not re-aligned; Zed's C does the same for `}`. At the end of a
file, a line typed after a blank line starts at column 0, since Zed applies the pattern only to the
line right after the one it matches, and it takes the indentation of its label or block from the
tree as soon as its first character is typed. Zed's Python and Bash set
`auto_indent_using_last_non_empty_line = false`, but then Enter on an empty line of saved code,
whose blanks Zed strips on save, goes to column 0. The assembly languages keep Zed's default, as its
C does.

While `.elseif` is typed, the line passes through `.else`: it moves out, back in at `.elsei`, and
out again at `.elseif`. `.endm` to `.endmacro` does the same, as Zed's Bash does with `fi` and
`file`.

The outline lists every global label with its local labels nested under it (`.L` names in the ELF
dialects, `L` names in ARM (Apple), dot names in NASM), macros (`.macro m`), `#define` names
(`#define F( )` for function-like ones, as Zed's C shows them) and assigned names: `NAME = expr`,
and `.equ`, `.set`, `.equiv` and `.eqv` with a name and a value; `.set noreorder` stays out. NASM
lists `%macro m`, the `%define` family (`%define N`, `%define F( )`, `%assign K`), the name of
`x equ 1`, and structures (`struc point`) with their fields. Universal Ctags, Eclipse CDT, asm-lsp,
ASM Code Lens and Emacs nasm-mode list the same kinds, and none of them lists sections. Numeric
labels are reused many times and stay out, as in ctags. Sections stay out too: compilers switch
sections inside a function (`-ffunction-sections`, jump tables in `.rodata`), so a section would cut
a function in two. Breadcrumbs show the label block around the cursor, and the comments right above
an item are its annotation, as in Zed's C.

In vim mode `af` selects a label block, from its label to the next global label, and `if` the
statements after the label; `ac` and `ic` select a macro and its body, and in NASM also a structure
or an instance; `gc` selects a comment, with consecutive line comments as one, as in Zed's Rust.

The condition of `#if` and `#elif` is injected as C, so Zed's C grammar colors it. `#define`
values stay plain, because in `.S` files they are often assembly (`#define SAVE push %rbp`).

The debuggers are CodeLLDB, then GDB. CodeLLDB runs on Linux and macOS; GDB does not run on Apple
silicon.

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
| Shift operator                                                   | `@keyword.operator`                                           |
| x86 prefix and pseudo-prefix (`lock`, `{vex}`)                   | `@keyword`                                                    |
| Intel size and type words (`dword ptr`, `near`)                  | `@keyword`                                                    |
| Intel `offset`, `imagerel` and `short`                           | `@keyword`                                                    |
| Intel operator word (`shl`, `and`, `not`, `eq`)                  | `@keyword.operator`                                           |
| NASM operator word (`seg`, `dup`, `__?utf16?__`)                 | `@keyword.operator`                                           |
| AVX-512 decorator (`{%k1}`, `{z}`, `{rn-sae}`)                   | `@attribute`                                                  |
| C macro call in an operand or a label (`L(loop)`)                | `@function.special`                                           |
| Location counter `.`                                             | `@constant.builtin`                                           |
| Operators, brackets, delimiters; `!`, `^`, `-`                   | `@operator`, `@punctuation.bracket`, `@punctuation.delimiter` |
| Comments, including on `#` lines                                 | `@comment`                                                    |
| Macro name                                                       | `@function.special.definition`                                |
| `#define` name, of a function-like macro                         | `@constant`, `@function.special`                              |
| Macro parameter and argument, keyword argument name              | `@variable.parameter`                                         |
| `\()` in a glued name                                            | `@punctuation.special`                                        |
| `#if` and `#elif` condition                                      | Zed's C highlighting, injected                                |
| Section a `.section` or `.pushsection` switches to               | `@namespace` (Mach-O: segment and section)                    |
| NASM block word (`%macro`, `%if`, `struc`, `at`, `times`, `equ`) | `@keyword.directive @preproc`                                 |
| NASM preprocessor line (`%define`, `%include`)                   | `@keyword.preproc @preproc`                                   |
| NASM macro token (`%1`, `%%x`, `%$x`, `%[x]`)                    | `@variable.parameter`                                         |
| NASM `%define` name, of a macro with parameters                  | `@constant`, `@function.special`                              |
| NASM parameter count (`1-3`, `0-*`)                              | `@number`                                                     |
| Structure name in `struc` and `istruc`                           | `@type`                                                       |
| NASM `$`, `$$` and `?`                                           | `@constant.builtin`                                           |
| NASM `rel`, `abs`, `strict`, `wrt`, sizes, prefixes              | `@keyword`                                                    |
| NASM `..plt`, a decorator, `.nolist`                             | `@attribute`                                                  |
| NASM word before an operand (`XMMWORD [rsp]`)                    | `@keyword`                                                    |
| NASM macro call, preprocessor function, `%map` reference         | `@function.special`                                           |
| NASM glued label (`a%1:`)                                        | `@function.definition`                                        |
| NASM `{ }` of a brace argument, `%(` of a data list              | `@punctuation.bracket`                                        |
| NASM `%+` in a glued name                                        | `@punctuation.special`                                        |
| Section a `section` or `segment` switches to                     | `@namespace`                                                  |

`!` after a memory operand or a register, `^` after a register list and `-` in a range are
operators, and so are `*` before an x86 indirect operand and `%` as a remainder. A label named by a
macro call (`L(loop):`) looks like the call where it is used, since a use cannot be told from any
other call. Planned: control-flow instructions as `@keyword.control`, branch targets as `@function`,
data labels.

## Checks

The tooling is TypeScript that Bun runs, and the scripts in `package.json` are its commands. Every
command runs in a container that `scripts/dev` and `scripts/zed` start with `--network=none`, so no
check, test or script can reach the network. Only the image build and `scripts/fetch-sources`,
which run on the host, download anything. The image
pins Bun, its npm tools and dprint with its plugins, and `bunfig.toml` turns off Bun's automatic
package installs, so importing a package the image lacks fails at once. `scripts/dev --sources DIR`
also mounts DIR read-only at `/sources`, for the command that reads upstream sources
(`bun run keywords`). Podman would relabel a tree mounted with `z` for SELinux, rewriting the label
of every file in it (about 150,000 in LLVM) on each run, so that container runs with
`--security-opt label=disable` instead and DIR stays untouched. `test/unit/commands.test.ts`
requires a row in the table below for every script, `--network=none` as the only network option of
both launchers, and a read-only `/sources` mount that is never relabeled.

All hand-written code and configuration, and what the generators write, is indented with four
spaces; only test data keeps hard tabs, and `.editorconfig` tells editors the same. dprint formats
TypeScript, JavaScript, JSON, Markdown and YAML to 100 columns, with single quotes and braces on
every block. clang-format formats the C by `.clang-format`: 100 columns, a function's brace on its
own line, a line break before a binary operator, one `&&` or `||` operand per line once a condition
breaks, and aligned macros. It needs clang-format 23, which is the first to read the per-operator
`BreakBinaryOperations` setting. oxlint fails on every correctness rule of its eslint, typescript,
unicorn, oxc and import plugins and on the further rules in `.oxlintrc.json`, among them `curly`
for every block, `eqeqeq`, and `import/extensions`, which wants the file extension in every
relative `import` and `require`. A disable comment that hides nothing is an error too. `tsc` from
TypeScript 7 checks every TypeScript file in `scripts/` and `test/` with `strict` and the
unused-name, switch-fallthrough and `override` checks, and with `skipLibCheck` off it checks the
type packages as well.

| Command                   | What it does                                                                                                                                                                                                                                                                                  |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run test`            | every check except the sanitizers: formatting, lint, types, generated files and parsers up to date, unit and performance tests, C checks, shell checks, corpus tests, queries, fixtures                                                                                                       |
| `bun run build`           | writes the files generated from `languages.config.cjs` and `queries/`                                                                                                                                                                                                                         |
| `bun run generate`        | runs `build`, then regenerates all five parsers                                                                                                                                                                                                                                               |
| `bun run set-grammar-rev` | pins the commit Zed fetches the grammars from (`bun run set-grammar-rev <sha>`) and runs `build`                                                                                                                                                                                              |
| `bun run keywords`        | not a check: regenerates `tree-sitter/common/keywords.h` from the upstream sources at `/sources` (`scripts/dev --sources DIR`); see "Generated tables"                                                                                                                                        |
| `bun run real-code`       | every file of every file set in `test/real-code/sources.gitconfig` parses without an error in each of its languages, from the clones at `/sources` (`scripts/dev --sources DIR`); `--summary` counts every error line by its first word                                                       |
| `bun run fmt`             | formats with dprint, and the C scanner with clang-format                                                                                                                                                                                                                                      |
| `bun run lint`            | oxlint                                                                                                                                                                                                                                                                                        |
| `bun run check:types`     | `tsc` on every TypeScript file                                                                                                                                                                                                                                                                |
| `bun run check:generated` | fails if a generated file or parser differs from what the build and `tree-sitter generate` write                                                                                                                                                                                              |
| `bun run check:c`         | clang-format, GCC and clang with strict warnings as errors, both static analyzers, clang-tidy, that `scanner.h` rejects zero or two dialect macros, that each dictionary finds every word and no other (`test/c/words.c`), and that each grammar built to wasm imports only what Zed supplies |
| `bun run check:shell`     | shellcheck, with every optional check, on every script with a shell shebang                                                                                                                                                                                                                   |
| `bun run check:queries`   | compiles every generated query against its grammar                                                                                                                                                                                                                                            |
| `bun run check:fixtures`  | every fixture, and a CRLF and a no-final-newline copy of it, assembles with the real toolchains; every fixture parses without errors                                                                                                                                                          |
| `bun run test:unit`       | the unit, highlight, tree, typing and structure tests in parallel, then the performance tests alone                                                                                                                                                                                           |
| `bun run corpus`          | composes each grammar's corpus tests from `test/corpus/`                                                                                                                                                                                                                                      |
| `bun run test:corpus`     | runs `corpus`, then the corpus tests of all five grammars                                                                                                                                                                                                                                     |
| `bun run sanitize`        | corpus and fuzzing against parsers built with AddressSanitizer and UndefinedBehaviorSanitizer                                                                                                                                                                                                 |
| `bun run budgets`         | not a check: measures each grammar's parse cost with callgrind and writes it to `test/budgets.json` with the states and parser size                                                                                                                                                           |
| `bun run check:budgets`   | measures the baseline tree at DIR and this tree in the same image and fails on any cost change `test/budgets.json` does not declare (`bun run check:budgets DIR`)                                                                                                                             |
| `bun run bench`           | not a check: prints parse, edit and query times, states and parser size for every grammar                                                                                                                                                                                                     |
| `bun run zed:qa`          | the `docs/qa.md` checks; `scripts/zed` runs it in the container that holds Zed and a display                                                                                                                                                                                                  |
| `scripts/zed`             | the `docs/qa.md` checks in the real Zed app, in Podman on a virtual display                                                                                                                                                                                                                   |
| `scripts/fetch-sources`   | not a check: fetches the real code pinned in `test/real-code/sources.gitconfig` into a directory, on the host (`--update DIR` first moves each pin to its branch head)                                                                                                                        |

`scripts/zed` builds the `zed` stage of the Containerfile: Xvfb, xdotool, Mesa's software Vulkan,
and Zed from its official install script, always the latest release. It compiles each grammar to
wasm with the flags the tree-sitter CLI uses, installs the result as an ordinary extension folder
and drives Zed with keystrokes. Each check then compares the saved file, or what a step copied, read
with xclip. The vim checks run last, after vim mode is turned on in the settings. The network is
off and each run starts from an empty Zed profile. The files Zed opens live in the container's home,
outside the repository, so Zed never reads the repository's git data. The run prints each result as
it finishes, records a check that throws as failed and goes on, and keeps the Zed log either way.

Zed loads every grammar as wasm through tree-sitter's wasm runtime, which supplies a module with 25
C library functions only (`lib/src/wasm-stdlib/imports.txt` at the tree-sitter revision Zed pins:
`malloc`, `memcmp`, `strlen`, `towlower` and the like). A grammar that calls any other, such as
`strchr`, fails to load, and Zed opens its files with no language. `scripts/lib/wasm.ts` reads the
import section of each built module and holds that list; `check:c` and `scripts/zed` both refuse a
module that imports anything else.

`test/real-code/sources.gitconfig` pins the real code: per source a URL, branch and commit; per
file set a source, `include` and `exclude` globs and the languages that parse it.
`scripts/fetch-sources DIR` runs on the host with `sh` and `git`. Per source it fetches the pinned
commit into `DIR/<source>` with `--depth 1 --filter=blob:none` and a non-cone sparse checkout of the
`include` globs, 22 MB for all three. With nothing changed it does nothing; `--update` first moves
each pin to its branch head. It checks the whole pin file before writing anything and refuses a
`DIR/<source>` that is not a sparse checkout of the pinned URL. Sparse patterns are last-match-wins
across file sets, so `bun run real-code` applies the excludes. `scripts/lib/real-code.ts` parses
the pin file and rejects what git would read differently: quotes, escapes, `#` or `;` in a value,
upper-case names, repeated sections.

`bun run real-code` first checks each clone against the pins: its HEAD is the pinned commit, its
sparse patterns are the includes, every checked-out file matches an include and every include
matches a file. `scripts/lib/wildmatch.ts` matches globs as git's wildmatch does for sparse
patterns: on bytes, `*` and `?` stop at `/`, `**` spans directories only between slashes, brackets
take ranges, `!` or `^` and the POSIX classes, and a path matches when it or a parent directory
does. A file fails when tree-sitter reports an error in its tree (`--json-summary`); the error lines
come from a query for every ERROR and MISSING node. One parse and one query run per language cover
all files.

`bun run budgets` measures each grammar's parse of its two bench inputs, `basics` and the fixtures
joined, under callgrind's cache simulation, and writes the cost to `test/budgets.json` with the
states, the parser.c size and a hash of each input. The cost is gungraun's estimated cycles: L1 hits
plus 5 times LL hits plus 35 times RAM accesses. Instruction counts alone rate the x86 (GAS) parser
0.3% cheaper than M4's, where wall-clock timing shows it about 3% slower; the estimate, which sees
the cache misses of the keyword dictionary, rates it 0.9% dearer. Callgrind collects inside
`ts_parser_parse` only, with a fixed cache model (32 KiB 8-way L1 caches, a 16 MiB 16-way LL, 64 B
lines) and `LD_BIND_NOW=1`, so that dynamic linking stays outside. Each library and input is
copied to one fixed path first, since a longer path moves the buffers and with them the cache
misses; the same parser on the same input then repeats its count exactly.

The count still moves with the image's compilers and glibc, which CI rebuilds weekly, so the check
compares within one image. `bun run check:budgets DIR` measures the baseline tree at DIR and this
one, and each change in cost must match the change `test/budgets.json` declares between the two,
within 1 point plus a tenth of the declared change. An undeclared speedup fails as well as a
slowdown, so the declared costs stay exact. An input the baseline declares no cost for, or measured
with other text, has no baseline and passes. The states, parser.c size and input hashes are the
same anywhere, and a unit test requires them to match the tree. CI exports the push's previous
head, or a pull request's base, with `git archive`; locally,
`git archive HEAD | tar -x -C .build/budgets-baseline` gives the last commit.

The fixtures live in `test/fixtures/<dialect>/`, and every assembler of the dialect must accept each
file there. Forms that only one assembler accepts, such as `.eqv` and `0f1.5` in GNU as or
`.endmacro` and `0x1.8p0` in clang, go in a subdirectory named after that assembler (`gas/`,
`clang/`, `nasm/`, `yasm/`), and only that assembler runs on them. `.S` files go through clang
alone, which runs the C preprocessor. The x86-64 AT&T, AArch64 and Apple arm64 fixtures hold every
form measured above that the grammar reads, each in every dialect whose assemblers accept it; the
Intel and NASM fixtures add labels and blocks in their own notation. Each ARM dialect has an
`operands.s` with its operand forms, role-table collisions, relocations and register directives,
and `.arch` lines turn on SVE and SME in the AArch64 files; `t32-gnu/mve.s` covers MVE.

The highlight tests run `tree-sitter query --captures` and apply Zed's two rules: a character takes
the last capture that covers it, and the scope at a cursor comes from the smallest capture that
contains it (edges count only for `.inclusive` captures). Offsets are compared in bytes, as
tree-sitter reports them. tree-sitter's own highlight tests use a different rule and would report
the wrong result.

The tree tests compare parse trees. UTF-8 text must parse exactly like ASCII text of the same kind,
and every fixture must parse the same with CRLF line endings and without its final newline. A parse
counts as clean only if tree-sitter never entered error recovery, which its debug log shows even
when the recovery left no visible node. The rejection test goes the other way. Syntax that every
assembler of a language rejects, such as `.loc 1, 2, 3`, `1B`, `nop main:` or `.word sym(FOO)`,
must parse in that language with an error on exactly the offending lines. The test reads each
file's parse status as well as its tree, because tree-sitter does not always mark a missing node
in the printed tree. Operands that parse with errors, such as `:lo12:.LC0` in ARM (Apple) or
`qword ptr fs:[0x28]` in AT&T mode, must leave the function around them one label block.
`test/grammar/keywords.test.ts` checks that no grammar has a word token or a case-insensitive token
(see "Keywords" under "ARM operands").

The structure tests replay typing in `test/lib/zed.ts`, a model of what Zed's editor does with this
extension's settings and queries. It covers autoindent (`suggest_autoindents` and
`compute_autoindents` in `crates/language/src/buffer.rs`) for the one row that Enter or a keystroke
re-indents, Enter with comment continuation, the `/*` prefix and the closing indent of a block
comment, and bracket auto-close. The model knows the Zed features the generated configs and queries
use and refuses a config or query that uses any other, so it cannot silently disagree with Zed. Zed
finds the closing indent of a block comment through the node around its `*/`. In these grammars that
node is always the comment token the overrides query captures, and the model takes that capture. It
reads scopes from the assembly layer only; the C layer inside `#if` conditions would need
tree-sitter-c, which the toolchain does not include. Each case types code key by key and compares
the text Zed would show. Two more tests hold the indent pattern. One parses 5,280 opener lines in
each GNU-syntax language and 3,756 in NASM, and requires the pattern to agree with the parser on
each; the cases that parse with an error are not compared, and their number per grammar is fixed.
The other runs the patterns through tree-sitter, whose `#match?` uses the Rust regex engine Zed
uses, and requires the same answers.

The same model builds the outline (items, their text and nesting, and the comment annotation Zed
attaches), the breadcrumbs at a cursor and the vim text objects `af`, `if`, `ac`, `ic` and `gc`,
after Zed's `outline_items_containing`, `symbols_containing` and vim's `text_object`. Cases cover
every language. A compiler-output test compiles `test/structure/sample.c` at test time with GCC and
clang for x86-64 (AT&T and `-masm=intel`), i386, AArch64, ARM and Thumb, and with clang for Apple
x86-64 and Apple arm64, at `-O0`, `-O2` and `-O2 -g`. It parses each result in every language that
reads it and derives the expected outline from the assembly text with the assemblers' rules: every
symbol owns the lines up to the next one, and a temporary label (`.L` in ELF, `L` in Apple arm64)
or an assigned name belongs to the symbol above it. Apple x86-64's `L` labels are ordinary labels,
as the x86 languages read them (see Limits under x86 operands). The outline must match exactly.
Jump tables that GCC puts in `.rodata` in the middle of a function must stay inside it. A second
test parses the same output in every language that reads it and requires no error at all; the
sample adds a thread-local variable, a conditional select and a loop that vectorizes, so the
output holds TLS relocations, `sym(TPOFF)`, `.save`, `.cfi_offset`, `.loh` and vector register
lists. Both Apple targets name macOS 11 (`-apple-macos11`), the first macOS on arm64, since clang
refuses thread-local storage without a version. For this the dev image carries GCC for AArch64
(`gcc-aarch64-linux-gnu`) and for bare-metal ARM (`arm-none-eabi-gcc-cs`).

The typing and closing tests are described under grammar modules. The performance tests compare
timings taken on the same machine, so they hold on any computer. When its size doubles, an input
may at most triple its time. That covers 31 inputs (garbage, one very long line, deep or unclosed
parentheses, an unclosed `/*`, unterminated strings, binary bytes, joined preprocessor lines,
nested, unclosed and broken blocks, thousands of clauses, glued macro arguments, long parameter and
`.irp` lists, stray labels; in NASM unclosed `%if` lines, a long `%define` value, macro-local
labels, `%+` glues with and without blanks, a long call statement, nested argument groups and
braces, words before an operand; and more), every query of every language on one function,
macro, `.if` or `.rept` body, and a line of any printable character repeated, alone, before a blank
or before a letter, in every grammar. A character whose time grows more than 2.5 times when its
line doubles is measured again before it fails. A one-character edit may cost at most half a full
parse, in the middle of a large file, inside one large block, and typed at the end of a file inside
an open block. An edit in the middle of a file must also lex the same number of tokens when the
file holds twice as many functions, at the top level and inside a block.

The unit tests also enforce the repository rules: ASCII only, LF line endings, a final newline and
an SPDX license line in every hand-written source file.

CI runs `bun run test`, `bun run sanitize` and `bun run check:budgets` in the same container for
every push and for pull requests from forks. Building the 3.0 GB image compiles tree-sitter and
dprint from source, so CI saves it in the Actions cache under the image tag and the ISO week
(`scripts/dev --image` prints the tag, a hash of the Containerfile) and loads it instead of
building, until the Containerfile changes or the week ends; Fedora's package updates still reach CI
within a week. The unit tests run their files in parallel, except the performance tests, which run
alone afterwards because they compare timings. Compiled parsers are cached in `.build/lib` of their
tree under a hash of their sources and the tree-sitter version, so the test, query and fixture
checks build each grammar once.

## Performance

Measured on 600 KB inputs with tree-sitter 0.27, median of seven runs (nine for the M1
comparison). The first table runs the M1 and M2 parsers on the same code, compiler-style functions
built from `basics`, in one session; the M1 parsers were rebuilt from the last M1 commit:

| Grammar       | Parse (ms)   | One-character edit (ms) | Highlight query (ms) | States     | parser.c         |
| ------------- | ------------ | ----------------------- | -------------------- | ---------- | ---------------- |
| asm_auto      | 57.1 -> 55.8 | 14.2 -> 2.3             | 35.3 -> 32.4         | 137 -> 489 | 161 KB -> 573 KB |
| asm_arm       | 48.9 -> 50.0 | 9.6 -> 1.9              | 30.0 -> 28.4         | 135 -> 470 | 157 KB -> 557 KB |
| asm_arm_apple | 50.8 -> 49.6 | 10.7 -> 2.9             | 31.0 -> 30.1         | 135 -> 428 | 157 KB -> 480 KB |
| asm_x86_gas   | 58.3 -> 56.6 | 14.4 -> 2.3             | 35.5 -> 33.0         | 135 -> 464 | 159 KB -> 529 KB |
| asm_x86_nasm  | 52.1 -> 45.1 | 17.2 -> 3.5             | 30.6 -> 24.5         | 87 -> 72   | 85 KB -> 87 KB   |

M2 has three and a half times the states and still parses the same code within 2% of M1 or faster.
It edits that code four to six times faster, because every function is one `label_block` that
tree-sitter reuses whole after an edit. On code without labels (`basics` without its label, x86
GAS, three runs) the two parse and highlight alike, and M2 edits about 5% slower, 14.6 -> 15.4 ms,
or 12% when one line in ten holds two statements joined by `;`, 13.7 -> 15.4 ms.

The edit time depends on how tree-sitter reuses a list. The generator keeps the ambiguity of a
`repeat` in the parse table as a second action that the runtime never takes. The runtime marks every
node reduced beside a second action as fragile and never reuses it whole, so after an edit it walks
a list one element at a time: the statements outside label blocks, the label blocks, and the
statements of the edited block. That holds in M1 and M2 alike, at about 0.5 microseconds an element.

A label block is reused whole only if its label was read in a parse state that lexes the same
tokens as the state the parser is in when it meets the block again. The label is read at a
statement start inside the block before it. An earlier M2 grammar listed the label blocks after the
statements (`seq(repeat(_item), repeat(label_block))`). After a block the parser was then in a state
that takes only a label or the end of the file, so tree-sitter read every label again and walked
every block statement by statement, about 10 ms an edit. With one list of statements and label
blocks, the state after a block takes what a statement start takes. An edit now lexes the same 2 to
7 tokens whatever the size of the file, which `test/performance/performance.test.ts` checks at two
sizes.

The two differences on label-free code are per element. M2 reuses a statement with its terminator,
where M1 reused a whole line, because a block header and its body may share a line
(`.rept 2; nop; .endr`); a `nop; nop` line is two elements. And the state the walk runs through
accepts everything that can start a statement, 42 entries against M1's 19, now that labels, blocks,
macro arguments and `#define` lines start one; tree-sitter finds an entry in such a state by a
linear scan.

The second table runs the M3 and M4 parsers on the same `basics` code in one session, median of
seven runs; the M3 parsers were built from the M3 commit (`git archive` into `.build/`):

| Grammar       | Parse (ms)   | One-character edit (ms) | States      | parser.c           |
| ------------- | ------------ | ----------------------- | ----------- | ------------------ |
| asm_auto      | 62.4 -> 55.0 | 2.6 -> 2.1              | 973 -> 2981 | 1123 KB -> 2801 KB |
| asm_arm       | 55.1 -> 56.0 | 2.0 -> 1.8              | 954 -> 1292 | 1088 KB -> 1351 KB |
| asm_arm_apple | 55.5 -> 57.5 | 3.2 -> 3.2              | 871 -> 1229 | 886 KB -> 1209 KB  |
| asm_x86_gas   | 58.8 -> 64.8 | 2.5 -> 2.4              | 466 -> 1806 | 517 KB -> 1710 KB  |
| asm_x86_nasm  | 46.6 -> 46.4 | 3.5 -> 3.4              | 72 -> 71    | 90 KB -> 106 KB    |

x86 (GAS) parses 10% slower and edits as fast; Assembly parses 12% faster. x86 (GAS) has four times
the states of M3: AT&T and Intel operands, the mode words, prefixes, decorators and macro calls.
Taking one change out of a scratch copy at a time, the Intel operator words in directive expressions
cost x86 (GAS) 70 states, the marker before an AT&T memory `(` 51, empty macro arguments 45, the
closing categories after a blank 31 and a scale without an index 4. The closing categories cost the
ARM grammars about 50 states each, 2 to 4%. M3's ARM languages parse 9 to 12% slower than M2's,
because of the keyword check after every identifier and a larger lexer.

The third table is M4 on all fixtures of each grammar repeated, which hold blocks, macros,
directives, preprocessor lines and the operand fixtures, with every query the language ships
(`bun run bench`). Each fixture is a file of its own, which both assemblers start in AT&T mode, so
the bench ends every x86 fixture with `.att_syntax`:

| Grammar       | Parse | Edit | brackets | highlights | indents | injections | outline | overrides | textobjects |
| ------------- | ----- | ---- | -------- | ---------- | ------- | ---------- | ------- | --------- | ----------- |
| asm_auto      | 82.9  | 1.5  | 35.3     | 48.4       | 33.7    | 33.7       | 38.2    | 34.7      | 37.4        |
| asm_arm       | 91.5  | 1.5  | 36.1     | 49.1       | 34.1    | 34.1       | 38.5    | 35.4      | 37.3        |
| asm_arm_apple | 85.5  | 1.6  | 33.4     | 45.9       | 31.6    | 31.5       | 36.9    | 32.9      | 35.8        |
| asm_x86_gas   | 86.4  | 1.6  | 33.8     | 44.9       | 32.2    | 32.1       | 36.9    | 33.2      | 35.2        |
| asm_x86_nasm  | 64.7  | 6.4  | 27.0     | 35.3       | -       | -          | 29.9    | 27.4      | 29.8        |

Times are in milliseconds for the whole file; Zed runs most queries on the visible rows only.

The fourth table runs the M4 and M5 parsers on the same inputs in one session, median of seven
runs; the M4 parsers were built from the M4 commit (`git archive` into `.build/`). For NASM the
fixtures are M4's set, which both parsers read without errors. On M5's own NASM fixtures, which add
seven denser files, NASM parses in 122.9 ms and edits in 2.6 ms.

| Grammar       | Basics parse (ms) | Fixtures parse (ms) | States       | parser.c           |
| ------------- | ----------------- | ------------------- | ------------ | ------------------ |
| asm_auto      | 55.1 -> 54.2      | 83.7 -> 81.3        | 2981 -> 3279 | 2868 KB -> 3367 KB |
| asm_arm       | 56.1 -> 49.9      | 91.3 -> 83.1        | 1292 -> 1571 | 1383 KB -> 1667 KB |
| asm_arm_apple | 56.5 -> 50.0      | 86.3 -> 76.7        | 1229 -> 1404 | 1238 KB -> 1473 KB |
| asm_x86_gas   | 64.4 -> 66.3      | 86.3 -> 88.7        | 1806 -> 2165 | 1752 KB -> 2184 KB |
| asm_x86_nasm  | 45.3 -> 77.9      | 64.5 -> 102.9       | 71 -> 4341   | 108 KB -> 5939 KB  |

M5 looks up every statement's first word in the generated instruction and directive tables, which
is how it tells a macro call from an instruction (see Macro calls). It first bisected each table
of the language, up to six in Assembly at about 100 cycles each. That made Assembly 13% and x86
(GAS) 9% slower than M4 on the fixtures, and a file of `nop` lines 11 to 39% slower in every
GNU-syntax language. One perfect-hashed dictionary per language (see Generated tables) makes each
word one hash and one compare. Assembly now parses 3% faster than M4, ARM 9% and ARM (Apple) 11%
faster, and x86 (GAS) 3% slower, with 20% more states for Intel operands, prefixes and decorators. A
file of nothing but `nop` lines, which M4 read without any lookup, still parses 4 to 23% slower.
One-character edits are as fast as in M4 or faster.

A callgrind profile of x86 (GAS) against M4, with the cache model of the budgets, shows where the
time goes. The scanner and lexer now spend about 1,250 fewer instructions per statement than M4's;
tree-sitter's runtime spends more. M4 lexed the mnemonic as an internal `identifier`, which
tree-sitter keeps inline in the tree. M5's instruction word is a scanner token, and tree-sitter
heap-allocates every token an external scanner returns: about 375 instructions per statement for
the allocation and the last-external-token bookkeeping. Parse-table lookups are as many as in M4
but cost about 470 more per statement, from the layout `tree-sitter generate` gives the larger
table. In estimated cycles x86 (GAS) is 1.7% cheaper than M4 on `basics`, 1.0% dearer on the
fixtures and 3.4% dearer on `nop` lines; the wall-clock gap above is larger, and the estimate models
the caches but not branch prediction. The scanner token is what tells `movl` from a macro call such
as `SAVE_ALL`, so it stays.

NASM parses 60% slower than M4 on the fixtures and 72% on `basics`, because its grammar grew from
71 states to 4341 to read the preprocessor, macro calls and structures. Taking one rule out of a
scratch copy at a time, split memory operands cost 532 states, `macro_reference` 318, calls in
expressions 247, macro tokens as mnemonics 172 and as labels 168, a list that stays open while it
is typed 167, the argument group read by GLR 141, the nested-list rule 127 and words before an
operand 57.

What keeps it there:

- No grammar declares a word token. M2 measured edits at 56 to 105% of a full parse with one
  declared in an earlier version of its grammar. M3 to M5 gave ARM one for its condition and shift
  keywords; since M5 the scanner reads those words, and dropping the word token and its keyword
  lexer took 9 to 14 states off each ARM grammar with parse and edit times unchanged (fixtures
  94.4 ms Assembly, 91.0 ARM, 79.9 ARM (Apple); edits 1.1 to 1.2 ms).
- Each statement and the newline or `;` after it form one node. After an edit tree-sitter reuses a
  node only if its first token was read in the same parse state as before. A node that starts with
  its statement meets that; one that starts with a newline does not, because that newline was read
  in the middle of the statement before it. In a 120,000-line NASM file a one-character edit cost
  67% of a full parse with the newline first, and 35% with it last.
- The end of the file is a terminator token, not an optional last line without one. That optional
  line was a second context for every statement, which doubled most expression states, and it let a
  label follow a statement (`nop main:`). The token took x86 GAS from 205 states to 119.
- Rules that only name a choice (`_line_content`, `_statement`, `_mnemonic`, `_operand`, `_value`,
  `_symbol`) are inlined. `_mnemonic` alone saves a node per instruction, 4 to 9% of parse time.
  Inlining `_expression` too parses 5 to 10% faster in the GNU-syntax grammars but doubles their
  parse tables.
- A block's header is a rule of its own. tree-sitter turns every `optional` and `choice` in a rule
  into separate productions, and a macro body after an inline header was copied for each header
  shape; the header rule took x86 GAS from 284 states to 240.
- Every kind of block has its own closer. tree-sitter does not merge parse states whose valid
  scanner tokens differ, so each kind keeps its own copy of the statement states, about 100 states
  apiece. One shared closer would merge them but let `.endif` close a macro. Headers end like any
  statement, which lets their expressions share the states of instruction operands, and all blocks
  share one body rule; together these took x86 GAS from 456 states to 399. ARM (Apple) has fewer
  states because its lists take commas only.
- Local labels are a node rather than a regular-expression predicate in the queries, which saved 10%
  of highlight time on label-dense code such as compiler output.
- A missing expression is one more alternative of `_expression`, which lets every operator, `(`, `#`
  and `$` share one parse state for it. Writing it into each of those rules cost 17% more states and
  10% more parser for the same trees.
- Text objects capture only the first and the last child of a function or macro body
  (`. (_) @function.inside (_)? @function.inside .`). Zed joins the captures of one match into one
  range, the same range that capturing every child gives. `(_)* @function.inside` made tree-sitter
  keep a candidate per child: 1 s for a function of 10,000 lines and 16 s for 40,000, now 5 and
  22 ms.
- The scanner allocates one byte per parser, stores no state on any token before the end of the
  input, and reads at most to the end of the line. It asks for the column in one case only: for a
  `#` at the start of a statement, since the preprocessor reads a directive only when the `#` starts
  its line.
- The scanner reads a word once and looks it up once in its language's dictionary: one hash, two
  reads and one compare give every role the word has, and the entry is passed to each check that
  needs it. Bisecting the per-architecture tables, once per table and question, cost Assembly
  12.5 ms of a 95 ms fixtures parse, most of the scanner's time. A word is looked up only where a
  check applies to it, so ARM (Apple), which has no suffix relocations and no x86 registers, reads
  no word after a `(`. The label check, reading the word and the blanks after it, costs about 2% of
  a parse: the price of labels as tokens.

Error recovery is slower than parsing valid code (0.4 to 2 MB/s on garbage against about 10 MB/s)
but stays linear. It is slowest in NASM, whose identifiers may start with `?` or `$` and contain
`#`, `@`, `~` and `$`, so recovery keeps finding plausible statement starts inside garbage.

One query costs more than linear time, in a shape real code rarely has. The `gc` comment object,
`(line_comment)+ @comment.around`, written the way Zed's built-in languages write `(comment)+`,
costs the square of one uninterrupted run of comment lines: about 2 ms for 1,000 lines and 0.2 s for
10,000, also in the narrow range Zed queries around the cursor. The only linear form would be one
token for a whole run of comment lines, and every keystroke in a comment would then read the whole
run again; for typing's sake the token stays per line.

The indents query is linear. Each `body` is one node that a pattern matches alone, and tree-sitter
keeps no candidate open while it walks the lines inside a block. With patterns that had to see the
closer after each body, 2,700 nested unclosed `.if` lines in Zed's 16 KB window took 1 s per query;
they now take under 2 ms.

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
