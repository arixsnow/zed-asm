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

`languages.config.cjs` holds the registry metadata, the per-syntax editor settings and the five
language entries. `scripts/lib/manifest.ts` validates it on load, so a typo fails with the name of
the field. `scripts/build.ts` turns it into:

- `extension.toml`
- `languages/<dir>/config.toml` and the composed query files next to it
- `tree-sitter/tree-sitter.json`
- `tree-sitter/<grammar>/grammar.js` and `tree-sitter/<grammar>/src/scanner.c`

`scripts/tree-sitter.ts generate` then runs `tree-sitter generate` with its built-in JavaScript
engine to write each grammar's `src/parser.c`. Generated files are committed because Zed reads them
from the repository. `deno task check:generated` regenerates everything into `.build/` and fails if
any committed file differs by one byte.

## Grammar modules

`tree-sitter/common/define-grammar.js` composes a grammar from the modules the manifest names:
`core` first, then the syntax family (`gas` or `nasm`), then each architecture (`arm`, `x86`). A
module is a function of the language's syntax, architectures and dialect that returns three tables:

- `rules`: rules it owns. A name defined by two modules is an error.
- `choices`: alternatives it adds to shared choice points (`_item`, `_line_content`, `_statement`,
  `_mnemonic`, `_local_label`, `_operand`, `_expression`, `_symbol`, `immediate`, `symbol_type`).
  Alternatives from different modules are merged and duplicates dropped.
- `extras`: tokens allowed anywhere, such as block comments.

Composition decides what a dialect can contain. Symbol types written with `@` (`.type f, @function`)
come from the x86 module. The ARM grammars have no such rule and read `@note` as a comment.

Local labels are their own node, `local_identifier`. They are the names each assembler keeps out of
the symbol table: `.L` names in the ELF assemblers, every NASM name that starts with `.` or `$.`,
and `L` names in ARM (Apple), as Apple's clang reads them for Mach-O (checked: `Ltemp` never
reaches the object file, `.Ldot` does). Other names such as `.text` stay ordinary identifiers. In
ARM (Apple) an `L` name after an instruction is still an identifier. Operands there also hold the
register `LR` and the conditions `LT`, `LE`, `LS` and `LO` (Apple's clang accepts `mov x0, LR` and
`csel x0, x1, x2, LT`), and telling those apart from local names needs ARM's register and condition
words, which the ARM milestone adds.

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
own. A label right after a statement on the same line (`nop main:`) is an error, as it is for the
assemblers.

Macros, conditionals and repeat blocks are blocks too in the GNU-syntax languages. NASM gets label
blocks now, and its `%macro`, `%if`, `%rep`, `struc` and `istruc` blocks with the NASM milestone.
Each block has a header, a `body` of statements and label blocks, and a closer:

- `macro_definition`: `.macro` with the name and the parameters, closed by `.endm` or `.endmacro`.
- `conditional`: any of the `.if` openers with its conditions and its body, then optional
  `elseif_clause`s and an `else_clause`, each with its own body, closed by `.endif`.
- `repeat_block`: `.rept` with a count, or `.irp` and `.irpc` with a parameter and its values,
  closed by `.endr`.

A body starts at the end of its header line, with the newline or `;` that ends the header, and runs
to the next clause or the closer. Zed indents from ranges that start on the line above. Because
every body starts on its header's line, the editor indents the lines of any block and clause the
same way (see "Editor behavior").

The words are keywords in any case, as GNU as accepts them. A global label in a body starts a block
inside it, and a block between two global labels belongs to the label block before it. The header
is a rule of its own. A name the header requires closes like a missing operand when the line ends
early, so a header being typed never takes in the next line. A closer ends its block whatever
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
requires commas between parameters, as its assembler does.

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

While a line is being typed its last construct is often still open, and the scanner closes it with
a zero-width token so that error recovery never pulls in the next line. An operand missing after a
comma, an expression missing after an operator, `(`, `#` or `$`, and a parenthesis or GNU-syntax
string left open all close at the end of the line, before a separator, or before any character that
cannot continue them. `mov x0, , x1` keeps both operands, and in `ldr x0, [x1]` only the
unsupported `[x1]` is an error. NASM strings and GNU character constants end at the closing quote or
at the end of the line. A relocation may still lack its specifier and a register its name after
`%`.

Three tests hold this. The first types every prefix of every line of the fixtures, with and without
their final newline, and of all corpus examples, and requires every other line to parse exactly as
before. The one allowed change: typing a line that holds a block's opener, clause or closer may
change how the other such lines of that block, and of the blocks around it, parse. The second types
every printable character right after each kind of open construct, in every grammar, both before a
next line and as the last line of a file with no newline after it. It does so inside a `.if` and a
`.rept` (a label block in NASM) that the end of the file closes, and the lines before must parse as
they did without it. The third reads each generated `grammar.json`, works out which input can start
an operand or an expression and which can continue a parenthesized expression, and checks that the
scanner closes exactly where the grammar allows nothing else. Only an unclosed `/*` and a
preprocessor line ending in a backslash reach further, since both really span lines.

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
the parser expects next. Its only state marks the zero-width tokens it writes at the end of the
input (see Grammar modules), so incremental reparsing can reuse any subtree before them. Each
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

|                                         | Assembly                                                                                                   | ARM          | ARM (Apple)               | x86 (GAS)   | x86 (NASM) |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------ | ------------------------- | ----------- | ---------- |
| text inside `"..."`                     | string                                                                                                     | string       | string                    | string      | string     |
| `//`                                    | comment                                                                                                    | comment      | comment                   | comment     | -          |
| `#` where an immediate fits             | immediate if a value can start after it, else comment                                                      | immediate    | immediate                 | -           | -          |
| other `#`                               | C preprocessor directive at the start of a line, else comment                                              | same         | same                      | same        | -          |
| `@` glued to a symbol                   | relocation                                                                                                 | relocation   | relocation                | relocation  | -          |
| `@` plus a letter where an operand fits | symbol type                                                                                                | comment      | -                         | symbol type | -          |
| other `@`                               | comment                                                                                                    | comment      | -                         | -           | -          |
| `;`                                     | separator before a directive or after an x86 prefix, else a comment up to the next `;` a directive follows | separator    | comment                   | separator   | comment    |
| `1$`, `1$:`                             | dollar label                                                                                               | dollar label | -                         | -           | -          |
| `\` or a name right after a name        | glued piece                                                                                                | same         | same                      | same        | -          |
| `$0` to `$9`, `$n`                      | -                                                                                                          | -            | positional macro argument | -           | -          |

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
mnemonic, so such a line is x86 code, and there `;` always separates. The prefixes are the ones GNU
as documents that either assembler accepts before a `;` (measured): `cs ds ss es fs gs`,
`data16 data32 addr16 addr32`, `lock`, `wait`, `rep repe repz repne repnz`, `notrack`, `xacquire`,
`xrelease` and the `rex` family (`rex`, `rex64`, `rex64xyz`, `rex.wrxb`).

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

During error recovery the scanner reads no label and no block closer. Every parse state that accepts
one also accepts a newline, since a blank line may stand wherever a statement may. Recovery
therefore reaches a statement start at the newline that ends the broken line, before the first word
of the next line, and where that newline cannot end recovery, a label or closer could not either. A
name with a colon read during recovery, written as a label would be, becomes one token that no rule
accepts, and recovery skips it instead of starting a statement there. Operands the grammars do not
parse yet, such as `:lo12:sym`, `#:lower16:sym`, `ptr fs:[0x28]` or NASM's `[fs:0x28]`, never
start a block. Refusing the word alone, as the grammar did until M2, was not enough: tree-sitter
resumed a statement at the refused word and read it again, outside recovery, as a label. Valid code
never enters recovery. A label after an error and a `;` still starts its block, because recovery
resumes at the `;`.

The scanner never asks for the column during recovery. tree-sitter works out an unknown column by
walking back to the start of the line, and while it skips characters no token accepts, it forgets
the column after every scanner call. Asking for it at each word made one long broken line cost time
in proportion to the square of its length. With that earlier rule a line of `nop a a a` took 16 ms
at 4,000 characters and 44 ms at 8,000; it now takes 10 and 19.

String text is read before any comment rule, so `.asciz "# of args"` stays a string in every
dialect. In ARM (Apple) an `@` that is not a relocation is an error, as it is for Apple's clang.
`;` alone and `nop;;nop` are empty statements in the dialects where `;` separates.

Assembly has to guess between ARM and x86, which costs three cases: `mov rax, rdi #copy` reads
`#copy` as an immediate, `nop @note` reads `@note` as a symbol type, and a `%word` being typed reads
as a register until it names a symbol type such as `%function`. A bare `#` at the end of a line is a
comment there, since no value follows it. The exact languages read all of these correctly.

To close an open construct the scanner knows which characters can start an operand or an expression
in each syntax and which continue a parenthesized expression. Comments are read first, so the
decision is made on the next real character. `==` and `!=` need a second character, and so does a
NASM `$`, which starts a name only before a letter, `_`, `?` or `.`.

The scanner is strict ISO C11. Dialect settings are 0/1 macros used in ordinary `if` statements, so
every branch compiles and type-checks in all five dialects.

## C preprocessor lines

A line that starts with a C preprocessor directive (`#define`, `#if`, `#endif` and the others in
`scanner.h`), indented or not, is a `preproc_line`, or a `preproc_define` for `#define`. After a
label or a `;`, a `#` follows the dialect's comment rules, because the preprocessor recognizes
directives only at the start of a line.

After the directive the scanner reads the rest of the line the way the preprocessor does in
assembler-with-cpp mode, measured with GCC 16.2 and clang 22.1 (`-E -x assembler-with-cpp`):

- Only `//` and `/*` start comments. `#`, `@` and `;` are ordinary text: `#define SEP ;` and
  `#define STR(x) #x` keep their arguments.
- `"` starts a literal that ends at the next unescaped `"` or at the end of the line. `'` starts one
  that ends at the next `'` or at the end of the line.
- After `#include`, `#include_next` and `#import`, `<...>` is one header name, and the `//` in
  `<a//b.h>` is not a comment. An unclosed `<` is read as a header name being typed.
- A backslash before a newline joins the two lines everywhere, including inside literals and `//`
  comments, also with blanks between the backslash and the newline. Outside literals a backslash
  does nothing else.

A `preproc_define` has the macro's `name`, its `parameters` when a `(` follows the name with no
blank between, and its `value`, the rest of the line as above. The name takes the characters of a
C identifier, so `#define a.b 1` defines `a` with the value `.b 1`, and `#define P (x)`, with a
blank before the parenthesis, defines `P` as `(x)`. Parameters are names, `...`, or GNU's named
variadic form `args...`. A `#define` without a name is complete while it is typed, and one whose
name is not an identifier (`#define 1 2`) is an error, as it is for the preprocessor. The argument
of `#if` and `#elif` is a `preproc_condition`, a C expression.

Comments after the directive become `preproc_comment` children of the line, and trailing blanks
belong to the line too. The comments keep their color, and a cursor at the end of `#endif /* X */`,
even after trailing blanks, stays in the `preproc` scope.

Two cases are not modeled. A comment opener split by a backslash-newline (`/`, backslash, newline,
`*`) is joined by the preprocessor but not by the scanner; no real code writes it. A `// note`
ending in a backslash on a code line swallows the next line in a `.S` file, which goes through the
preprocessor, but not in a `.s` file, which GNU as reads directly. Both open as the same language,
so the grammar ends that comment at the end of its line.

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
- Dollar labels (`1$:`, `1$`) in Assembly and ARM only.
- `NAME = expr`, `NAME == expr` and `. = expr` as `assignment`. `.equ`, `.set`, `.equiv` and `.eqv`
  stay directives whose first argument is the name, which keeps `.set noreorder` a plain directive.
- A `float` in any of the three forms: decimal, prefixed and hexadecimal. A prefixed float with `x`
  or `b` needs a point; `0x10` and `0b11` stay integers.
- Blank-separated integers, strings and names after `.loc` and `.file`. Every other directive
  separates its arguments with commas and may leave one empty.
- Macro definitions with the parameters `a`, `a=default`, `a:req` and `a:vararg`, separated by
  commas or blanks (only commas in ARM (Apple)), closed by `.endm` or `.endmacro`.
- Macro arguments `\name`, `\@` and `\+`, alone or glued to text, and keyword arguments in calls.
  Apple's `$0` to `$9` and `$n` in ARM (Apple) only.
- Conditionals with every `.if` opener measured, `.elseif` and `.else`, closed by `.endif`, and
  repeat blocks with `.rept`, `.irp` and `.irpc`, closed by `.endr`. `.irp` values are separated
  by commas or blanks (only commas in ARM (Apple)).

An instruction's operands may be separated by blanks as well as commas. That is the syntax of a
macro call, and a macro call looks like an instruction. GNU as ("Multiple arguments can be separated
by blanks or commas") and clang ELF split `m 1 2` into two arguments, Apple's clang joins it into
the one argument `12`, and nasm and yasm pass `1 2` as one argument. A macro may even take an
instruction's name (`.macro mov a b`, then `mov 1 2`, accepted by GNU as and clang). Whether a blank
may stand between operands therefore depends on what the word is, which the grammar does not check,
just as it accepts `nop 5`. Directive arguments and `.if` conditions still need commas, as every
assembler requires (`.byte 1 2` is an error).

The blank must be there. The scanner reads it as a zero-width token, only after real blanks and
before a character that starts an operand and cannot continue the one before. `1B` stays an error,
and `1 -2` stays one expression, which is how the assemblers read an instruction's operand. In
Assembly the scanner does not do this before `#`, which after code is x86's comment
(`movq %rax, %rbx #save`). An ARM shift joins its amount (`lsl #2`). The shift words are the ones
the assemblers take with an amount (`lsl lsr asr ror asl msl` and the extends `uxtb`...`sxtx`,
measured); such a word alone is an ordinary symbol, and `m x0 #1` has the two operands `x0` and
`#1`. A blank-separated `.irp` list or macro parameter list never holds a shift, since GNU as ends
each item at a blank.

NASM names follow the NASM manual and what nasm 3.02 and yasm 1.3.0 accept: an optional `$`, which
turns a reserved word into a name (`$eax` is a symbol, not the register), then a letter, `_`, `?`
or `.`, then letters, digits and `_ $ # @ ~ . ?`. A name that starts with `.` or `$.` is local.
Both assemblers accept `.1:`, `.$x:`, `.#x:`, `.@x:`, `$.y:` and `$eax:`. Only nasm accepts the
bare `.:` (yasm: "label or instruction expected"), and only yasm accepts `..x:` and `....:` (nasm:
"unrecognised special symbol"). The grammar reads all of them, as labels and in operands, since each
is valid for one of the language's assemblers. A `$` starts a name only before a letter, `_`, `?`
or `.`, so the scanner looks at the next character before it closes an open operand at a `$`.

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
ends at the end of its line and no bracket spans lines.

Double-click selects what the grammar reads as one name. `.` joins `.Lloop` and `b.eq`, `$` joins
`foo$1`, and `%` joins `%rax` and `%function`. NASM adds `?`, `@` and `#`, which its names may
contain.

Enter after a label indents one level, and typing `name:` on an indented line moves it back one
level: labels stay at column 0 and code sits one level in. Zed matches these patterns against the
line text only, so a prose line such as `Returns: x0` inside a multi-line block comment also moves
back when you type the colon. Tab size and hard tabs come from the user's Zed settings.

Enter after a line that opens a block (`.macro`, any `.if` opener, `.elseif`, `.else`, `.rept`,
`.irp`, `.irpc`) indents one level. Typing a clause or a closer aligns it with the line that opened
its block, whatever the indentation of the body; a body may also stay flush with its opener, as in
the Linux sources. A block opened and closed on one line (`.rept 2; nop; .endr`) does not indent the
next line, except in ARM (Apple), where `;` starts a comment. Section directives such as `.text`
stay where they are typed. Hand-written GNU code indents them in 81 of 97 surveyed lines (Linux,
glibc and FreeBSD indent, musl does not) and compiler output always does; leaving them alone keeps
both styles. `#if` and `#ifdef` bodies get no indentation and no structure, since real `.S` files
keep them at the indentation of the code around them (Linux, glibc).

Two mechanisms do this, as in Zed's own languages:

- The tree. `indents.scm` is one pattern, `(body) @indent`. A clause or a real closer always ends a
  `body`, since a body that the end of the file closes is an `unclosed_body`. Zed aligns a line with
  the start row of a range that ends at the start of that line, so each clause and closer goes to
  its own opener, also after a closed inner block at the same column. Zed's
  `decrease_indent_patterns`, which its Bash and Python use, align with the nearest opener at or
  left of the line whether it is closed or not. That is right for Python, whose blocks are columns,
  and wrong for keyword blocks; the extension does not use them.
- A pattern. Zed indents from a tree range only when the range ends after the start of the new line.
  No range can do that on the last line of a file, where a block still being typed ends, so Enter
  after an opener uses `increase_indent_pattern`, as Zed's Ruby, Bash and Python do.
  `scripts/lib/indent.ts` generates it from `lexical.js` (the opener words) and `scanner.h` (the
  closers of each block kind and each dialect's reading of `;`, `#` and `@`). It matches a line that
  holds an opener with no closer of the same kind in a later statement of the line, and it reads
  strings, character constants and comments the way the scanner does.

The pattern cannot follow the parser in four cases, since each needs more than a regular expression.
Each changes only whether the next line starts indented:

- The same block kind opened twice and closed once on one line (`.if A; .if B; .endif`).
- In ARM, a `#` comment on an opener line that contains `; .endr`. The scanner reads `#` as an
  immediate or a comment by whether an operand fits there.
- A label built from a macro argument before a closer on the same line.
- A clause after `.endr` or `.endm` on its line. The pattern reads it as the end of the clause's
  conditional, while the closer may instead close a repeat block or macro inside that conditional.

Zed looks for indentation ranges within 16 KB around the edited line. A closer typed more than about
8 KB below its opener is therefore not re-aligned; Zed's C does the same for `}`. A blank line typed
right after a label, or after an opener whose block is not closed yet, sends the next line back to
column 0. Zed applies the pattern only to the line right after the one it matches, and a line after
a blank one takes its indentation from the last non-empty line. Zed's Python and Bash set
`auto_indent_using_last_non_empty_line = false` to avoid that, but then Enter on an empty line of
saved code, whose blanks Zed strips on save, goes to column 0. The assembly languages keep Zed's
default, as its C does.

While `.elseif` is typed, the line passes through `.else`: it moves out, back in at `.elsei`, and
out again at `.elseif`. `.endm` to `.endmacro` does the same, as Zed's Bash does with `fi` and
`file`.

The outline lists every global label with its local labels nested under it (`.L` names in the ELF
dialects, `L` names in ARM (Apple), dot names in NASM), macros (`.macro m`), `#define` names
(`#define F( )` for function-like ones, as Zed's C shows them) and assigned names: `NAME = expr`,
and `.equ`, `.set`, `.equiv` and `.eqv` with a name and a value; `.set noreorder` stays out.
Universal Ctags, Eclipse CDT, asm-lsp, ASM Code Lens and Emacs nasm-mode list the same kinds, and
none of them lists sections. Numeric labels are reused many times and stay out, as in ctags.
Sections stay out too: compilers switch sections inside a function (`-ffunction-sections`, jump
tables in `.rodata`), so a section would cut a function in two. Breadcrumbs show the label block
around the cursor, and the comments right above an item are its annotation, as in Zed's C.

In vim mode `af` selects a label block, from its label to the next global label, and `if` the
statements after the label; `ac` and `ic` select a macro and its body; `gc` selects a comment, with
consecutive line comments as one, as in Zed's Rust.

The condition of `#if` and `#elif` is injected as C, so Zed's C grammar colors it. `#define`
values stay plain, because in `.S` files they are often assembly (`#define SAVE push %rbp`).

The debuggers are CodeLLDB, then GDB. CodeLLDB runs on Linux and macOS; GDB does not run on Apple
silicon.

## Highlighting

| Element                                             | Capture                                                       |
| --------------------------------------------------- | ------------------------------------------------------------- |
| Instruction, also glued (`no\s`)                    | `@keyword`                                                    |
| Global label definition                             | `@function.definition`                                        |
| Local or numeric label, defined or used             | `@label`                                                      |
| Other symbol, assigned name                         | `@constant`                                                   |
| Integer, float, `#` and `$` sigils                  | `@number`, `@punctuation.special`                             |
| Register (AT&T)                                     | `@variable.special`                                           |
| String, escape, character                           | `@string`, `@string.escape`, `@string`                        |
| Directive, block word (`.macro`, `.if`, `.endr`)    | `@keyword.directive @preproc`                                 |
| C preprocessor directive                            | `@keyword.preproc @preproc`                                   |
| Symbol type                                         | `@type.builtin`                                               |
| Relocation specifier                                | `@attribute`                                                  |
| Shift operator                                      | `@keyword.operator`                                           |
| Location counter `.`                                | `@constant.builtin`                                           |
| Operators, brackets, delimiters                     | `@operator`, `@punctuation.bracket`, `@punctuation.delimiter` |
| Comments, including on `#` lines                    | `@comment`                                                    |
| Macro name                                          | `@function.special.definition`                                |
| `#define` name, of a function-like macro            | `@constant`, `@function.special`                              |
| Macro parameter and argument, keyword argument name | `@variable.parameter`                                         |
| `\()` in a glued name                               | `@punctuation.special`                                        |
| `#if` and `#elif` condition                         | Zed's C highlighting, injected                                |
| Section a `.section` or `.pushsection` switches to  | `@namespace` (Mach-O: segment and section)                    |

Planned: control-flow instructions as `@keyword.control`, branch targets as `@function`, ARM and
Intel registers, data labels.

## Checks

The tooling is TypeScript on Deno, and every task in `deno.json` passes explicit `--allow-*` flags.
The build may write generated files but never `tree-sitter/common` or the manifest. The checks
write only `.build/`, the `corpus` task writes `tree-sitter/<grammar>/test/`, and the Zed checks
also write their container's home. No command may start `deno` itself, and only the sanitizer run
may start arbitrary programs. `test/unit/permissions.test.ts` enforces all of this.

| Command                    | What it checks                                                                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deno task test`           | formatting, lint, types, generated files and parsers up to date, unit, highlight, tree, typing and performance tests, C checks, corpus tests, query compilation, fixtures |
| `deno task check:c`        | clang-format, GCC and clang with strict warnings as errors, both static analyzers, clang-tidy, and that `scanner.h` rejects zero or two dialect macros                    |
| `deno task test:corpus`    | the corpus tests of all five grammars                                                                                                                                     |
| `deno task sanitize`       | corpus and fuzzing against parsers built with AddressSanitizer and UndefinedBehaviorSanitizer                                                                             |
| `deno task check:fixtures` | every fixture, and a CRLF and a no-final-newline copy of it, assembles with the real toolchains; every fixture parses without errors                                      |
| `deno task bench`          | not a check: prints parse, edit and query times, states and parser size for every grammar                                                                                 |
| `scripts/zed`              | the `docs/qa.md` checks in the real Zed app, in Podman on a virtual display                                                                                               |

`scripts/zed` builds the `zed` stage of the Containerfile: Xvfb, xdotool, Mesa's software Vulkan,
and Zed from its official install script, always the latest release. It compiles each grammar to
wasm with the flags the tree-sitter CLI uses, installs the result as an ordinary extension folder
and drives Zed with keystrokes. Each check then compares the saved file, or what a step copied, read
with xclip. The vim checks run last, after vim mode is turned on in the settings. The network is
off and each run starts from an empty Zed profile. The files Zed opens live in the container's home,
outside the repository, so Zed never reads the repository's git data.

The fixtures live in `test/fixtures/<dialect>/`, and every assembler of the dialect must accept each
file there. Forms that only one assembler accepts, such as `.eqv` and `0f1.5` in GNU as or
`.endmacro` and `0x1.8p0` in clang, go in a subdirectory named after that assembler (`gas/`,
`clang/`, `nasm/`, `yasm/`), and only that assembler runs on them. `.S` files go through clang
alone, which runs the C preprocessor. The x86-64 AT&T, AArch64 and Apple arm64 fixtures hold every
form measured above that the grammar reads, each in every dialect whose assemblers accept it; the
A32, Thumb, Intel and NASM fixtures add labels and blocks in their own notation.

The highlight tests run `tree-sitter query --captures` and apply Zed's two rules: a character takes
the last capture that covers it, and the scope at a cursor comes from the smallest capture that
contains it (edges count only for `.inclusive` captures). Offsets are compared in bytes, as
tree-sitter reports them. tree-sitter's own highlight tests use a different rule and would report
the wrong result.

The tree tests compare parse trees. UTF-8 text must parse exactly like ASCII text of the same kind,
and every fixture must parse the same with CRLF line endings and without its final newline. A parse
counts as clean only if tree-sitter never entered error recovery, which its debug log shows even
when the recovery left no visible node. The rejection test goes the other way. Syntax that every
assembler of a language rejects, such as `.loc 1, 2, 3`, `1B` or `nop main:`, must parse in that
language with an error on exactly the offending lines. Operands that still parse with errors, such
as `:lo12:.LC0`, `#:lower16:sym`, `%fs:sym@tpoff` or NASM's `es:[bx]`, must leave the function
around them one label block.

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
the text Zed would show. Two more tests hold the indent pattern. One parses 5,280 opener lines per
dialect and requires the pattern to agree with the parser on each; the cases that parse with an
error are not compared, and their number per grammar is fixed. The other runs the patterns through
tree-sitter, whose `#match?` uses the Rust regex engine Zed uses, and requires the same answers.

The same model builds the outline (items, their text and nesting, and the comment annotation Zed
attaches), the breadcrumbs at a cursor and the vim text objects `af`, `if`, `ac`, `ic` and `gc`,
after Zed's `outline_items_containing`, `symbols_containing` and vim's `text_object`. Cases cover
every language. A compiler-output test compiles `test/structure/sample.c` at test time with GCC and
clang for x86-64, AArch64, ARM and Thumb, and with clang for Apple arm64, at `-O0`, `-O2` and
`-O2 -g`. It parses each result in every language that reads it and derives the expected outline
from the assembly text with the assemblers' rules: every symbol owns the lines up to the next one,
and a temporary label (`.L` in ELF, `L` in Mach-O) or an assigned name belongs to the symbol above
it. The outline must match exactly. Jump tables that GCC puts in `.rodata` in the middle of a
function must stay inside it, and all of this has to hold while operands such as ARM memory operands
still parse as errors. For this the dev image carries GCC for AArch64 (`gcc-aarch64-linux-gnu`) and
for bare-metal ARM (`arm-none-eabi-gcc-cs`).

The typing and closing tests are described under grammar modules. The performance tests compare
timings taken on the same machine, so they hold on any computer. When its size doubles, an input
may at most triple its time. That covers 22 hostile inputs (garbage, one very long line, deep or
unclosed parentheses, an unclosed `/*`, unterminated strings, binary bytes, joined preprocessor
lines, nested, unclosed and broken blocks, thousands of clauses, glued macro arguments, long
parameter and `.irp` lists, stray labels and more), every query of every language on one function,
macro, `.if` or `.rept` body, and a line of any printable character repeated, alone, before a blank
or before a letter, in every grammar. A character whose time grows more than 2.5 times when its
line doubles is measured again before it fails. A one-character edit may cost at most half a full
parse, in the middle of a large file, inside one large block, and typed at the end of a file inside
an open block. An edit in the middle of a file must also lex the same number of tokens when the
file holds twice as many functions, at the top level and inside a block.

The unit tests also enforce the repository rules: ASCII only, LF line endings, a final newline and
an SPDX license line in every hand-written source file.

CI runs `deno task test` and `deno task sanitize` in the same container for every push and for pull
requests from forks.

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

The second table is M2 on all fixtures of each grammar repeated, which holds blocks, macros,
directives and preprocessor lines, with every query the language ships (`deno task bench`):

| Grammar       | Parse | Edit | brackets | highlights | indents | injections | outline | overrides | textobjects |
| ------------- | ----- | ---- | -------- | ---------- | ------- | ---------- | ------- | --------- | ----------- |
| asm_auto      | 75.6  | 1.8  | 30.1     | 42.6       | 29.7    | 29.1       | 34.8    | 30.2      | 32.8        |
| asm_arm       | 72.8  | 1.9  | 29.5     | 41.2       | 29.2    | 28.6       | 33.9    | 29.5      | 32.6        |
| asm_arm_apple | 72.5  | 1.8  | 30.3     | 42.4       | 29.5    | 29.4       | 33.8    | 30.3      | 33.6        |
| asm_x86_gas   | 72.8  | 1.7  | 30.2     | 42.2       | 30.0    | 29.3       | 34.9    | 30.4      | 33.3        |
| asm_x86_nasm  | 64.0  | 6.2  | 27.6     | 35.4       | -       | -          | 30.1    | 27.6      | 30.3        |

Times are in milliseconds for the whole file; Zed runs most queries on the visible rows only.

What keeps it there:

- The grammar declares no `word` token. tree-sitter reuses a `word` token only in the exact parse
  state it was built in, so with one declared almost every line after an edit was lexed again; an
  edit cost 56 to 105% of a full parse, now 2 to 10%.
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
- The scanner compares a statement's first word with the block words and x86 prefixes only where
  one of them fits, and otherwise only looks for a label colon after it. Comparing every word cost a
  quarter of the scanner's time, 2.5% of a parse. The label check itself, reading the word and the
  blanks after it, costs about 2% of a parse: the price of labels as tokens.

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
4. Add `tree-sitter/<grammar>` to the write paths of the `build` and `set-grammar-rev` tasks and
   `tree-sitter/<grammar>/test` to those of the `corpus` task. The permissions test fails until they
   match the manifest.
5. Add `queries/<arch>/`, `test/corpus/<arch>/`, highlight cases in `test/highlight/cases.ts` and a
   fixture directory with its assemblers in `FIXTURE_DIALECTS` in `scripts/verify-fixtures.ts`.
6. Run `scripts/dev deno task generate`, `scripts/dev deno task test` and `scripts/zed`.
