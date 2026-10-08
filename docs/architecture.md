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
module is a function of the language's syntax, architectures and dialect that returns these
tables:

- `rules`: rules it owns. A name defined by two modules is an error.
- `choices`: alternatives it adds to shared choice points (`_item`, `_line_content`, `_statement`,
  `instruction`, `_mnemonic`, `_local_label`, `_instruction_operand`, `_operand`, `_value`,
  `_expression`, `_symbol`, `_defined_name`, `immediate`, `symbol_type`). Alternatives from
  different modules are merged and duplicates dropped.
- `extras`: tokens allowed anywhere, such as block comments.
- `word`: the grammar's word token, which only the ARM module declares (see "ARM operands"). A
  second declaration is an error.

An instruction's operands are `_instruction_operand`, which offers everything a directive argument
(`_operand`) offers plus the ARM forms. That keeps ARM registers, memory operands and register lists
out of directive arguments, where `.quad x0` names a symbol.

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

While a line is being typed its last construct is often still open, and the scanner closes it with
a zero-width token so that error recovery never pulls in the next line. An operand missing after a
comma, an expression missing after an operator, `(`, `#` or `$`, and a parenthesis, a bracket, a
register list or a GNU-syntax string left open all close at the end of the line, before a
separator, or before any character that cannot continue them. `mov x0, , x1` keeps both operands,
and `ldr x0, [x1` closes its bracket at the end of the line. NASM strings and GNU character
constants end at the closing quote or at the end of the line. A relocation may still lack its
specifier and a register its name after `%`. In ARM a register range may lack its end, a `:lo12:`
relocation its name or its second colon, and a `sym(GOT)` suffix its name or its `)`.

Three tests hold this. The first types every prefix of every line of the fixtures, with and without
their final newline, and of all corpus examples, and requires every other line to parse exactly as
before. The one allowed change: typing a line that holds a block's opener, clause or closer may
change how the other such lines of that block, and of the blocks around it, parse. The second types
every printable character right after each kind of open construct, in every grammar, both before a
next line and as the last line of a file with no newline after it. It does so inside a `.if` and a
`.rept` (a label block in NASM) that the end of the file closes, and the lines before must parse as
they did without it. The third reads each generated `grammar.json`, works out which input can start
an operand or an expression and which can continue a parenthesized expression, a bracket or a
register list, and checks that the scanner closes exactly where the grammar allows nothing else.
Only an unclosed `/*` and a preprocessor line ending in a backslash reach further, since both really
span lines.

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
| `(` and a relocation name after a blank | the same operand                                                                                           | same         | -                         | -           | -          |
| a name after `(` in a relocation suffix | relocation name                                                                                            | same         | -                         | -           | -          |
| `.req`, `.dn`, `.qn` after a first name | register alias word                                                                                        | same         | same                      | -           | -          |

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

The same word may be a directive that must match whole: a block opener or clause, `.loc` or `.file`,
or an ARM directive with register operands. All of them are one sorted table,
`ASM_STATEMENT_WORDS`, which the scanner searches by bisection, and the indent pattern reads the
block words from it. A static assertion checks that every word fits the 32-byte buffer the scanner
reads into, and a unit test that the table stays sorted. tree-sitter's runtime gives a wasm grammar
only a few C library functions, which is why the scanner bisects by hand instead of calling
`bsearch`.

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
`#copy` as an immediate, `nop @note` reads `@note` as a symbol type, and a `%word` being typed reads
as a register until it names a symbol type such as `%function`. ARM register names are registers in
x86 code too (`movl sp, %eax`, `call a1`), and Intel's `dword ptr [rbx+4]` parses as the symbol
`ptr` and an ARM lane until the x86 milestone adds Intel operands. A bare `#` at the end of a line
is a comment there, since no value follows it. The exact languages read all of these correctly. An
ARM role slot also takes x86 operands, so `blcs %eax, %ebx` (AMD TBM) parses, though `blcs` is
also ARM's `bl` with the condition `cs`.

To close an open construct the scanner knows which characters can start an operand or an expression
in each syntax, and which continue a parenthesized expression, a bracket (operators, `,`, `]` and
`:`) or a register list (`,`, `}`, `-` and `[`). In Assembly and ARM a `(` continues the first two
as well, since it may start a relocation suffix. Comments are read first, so the decision is made
on the next real character. `==` and `!=` need a second character, and so does a NASM `$`, which
starts a name only before a letter, `_`, `?` or `.`. A word glued to the token before it never
closes anything, since only a relocation specifier glues to an operand: M2 closed `(sym@` before
`PLT`, so `.quad (sym@PLT)` was an error.

The open tokens are valid only where the construct may end. After `[` or `{` an element is
required, so a bracket never closes before its first element; a rule based only on the next
character would otherwise close `[x1]` before the `x`.

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
- Blank-separated integers, strings, names and negated values after `.loc` and `.file` (GCC writes
  `view -0`). Every other directive separates its arguments with commas and may leave one empty.
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

## ARM operands

Measured with GNU as 2.46.1 for AArch64 (`-march=armv9.6-a+sve2+sme2+cmpbr`) and 2.45 for AArch32
(ARMv7-A with NEON, Thumb, and Armv8.1-M with MVE), and with clang 22.1 for the same targets and
for Apple arm64. An `.arch` or `.arch_extension` line turns on SVE, SME and MVE inside a file for
every one of them, so one grammar reads all of it.

### Registers

| Family          | Names                                                                                                                            | Notes                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| AArch64 general | `x0`-`x30`, `w0`-`w30`, `xzr`, `wzr`, `sp`, `wsp`, `lr`, `fp`                                                                    | `x31` and `w31` in clang only; `ip0` and `ip1` in GNU as only      |
| FP and SIMD     | `b`, `h`, `s`, `d`, `q` 0-31; `v0`-`v31` with `.8b .16b .4h .8h .2s .4s .1d .2d .1q .4b .2h .b .h .s .d .q`                      | lanes `v1.s[2]`, also with a blank before `[`                      |
| SVE             | `z0`-`z31` with `.b .h .s .d .q`; `p0`-`p15` with `.b .h .s .d`; `pn8`-`pn15`                                                    | `p0/z`, `p0/m` and `pn8/z` are a `predicate`, also with blanks     |
| SME             | `za` with a size, tiles such as `za0.d`, `za0h.s` and `za7v.d`, `zt0`                                                            | slices such as `za0h.s[w12, 0:1, vgx2]`                            |
| AArch64 system  | `c0`-`c15`, encodings such as `s3_0_c1_c0_0`                                                                                     | named system registers such as `sctlr_el1` and `nzcv` stay symbols |
| AArch32 general | `r0`-`r15`, `sb`, `sl`, `fp`, `ip`, `sp`, `lr`, `pc`, `a1`-`a4`, `v1`-`v8`                                                       | `tr` and `wr` are rejected                                         |
| AArch32 vector  | `s0`-`s31`, `d0`-`d31`, `q0`-`q15`, MVE `vpr`                                                                                    | lanes `d0[1]`, all lanes `d0[]`                                    |
| AArch32 special | `apsr`, `cpsr` and `spsr` with fields (`cpsr_fc`, `apsr_nzcvq`), `fpscr`, `fpexc`, `fpsid`, `mvfr0`-`mvfr2`, `fpinst`, `fpinst2` | coprocessors `p0`-`p15` and `c0`-`c15`                             |
| AArch32 banked  | `r8_usr`-`r12_fiq`, `sp` and `lr` with a mode (`sp_svc`, `lr_irq`), `elr_hyp`                                                    | GNU as; clang after `.arch_extension virt`                         |
| AArch32 typed   | a core, vector, VFP or coprocessor register with a NEON type: `d0.f32`, `q0.s16`, `d0.u32[1]`, `r0.i32`, `fpscr.f32`             | GNU as only                                                        |

GNU as reads a register in lower case or all upper case (`X0`, not `Xzr`), clang in any case. The
grammar takes any case, since one assembler of each language does. ARM (Apple) leaves out the
AArch32 registers and `ip0` and `ip1`, which Apple's clang rejects.

A NEON type is `.8`, `.16`, `.32` or `.64`, optionally after `i`, `s`, `u`, `p` or `f`, or `.bf16`,
in any case. GNU as takes it on a core, vector, VFP special or coprocessor register (`r0.i32`,
`fpscr.f32`, `p15.f32`) but not on a PSR field. Some positions still reject it: a memory base, a
core register list, and a type also given in the mnemonic (`vadd.i32 q0.i32, q1, q2`); the grammar
reads it wherever a register goes. GNU as rejects `.x32`, `.s128` and `.bf8`, so `d0.x32` stays a
symbol.

### Where a word is a register

The assemblers decide by instruction whether a word is a register, a condition or a symbol. Both
read `adrp x0, x1` and `adrp x0, lt` as references to C globals named `x1` and `lt`. GNU as reads
`bl sp`, `b x0` and `ldr x0, x1` as branches and loads to symbols. Every assembler reads `b eq` as a
branch to the symbol `eq`, and `csel x0, x1, x2, lt` as a condition even when a symbol `lt` exists.
`mov x0, x1` reads `x1` as the register even when a symbol `x1` exists. Apple's clang reads `b LT`
as a branch to a local label.

The grammar follows this with a role table in `tree-sitter/common/arch/arm.js`: the instructions
whose operand at some position is a label or a condition. Every word may take any case.

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

A label slot reads a bare word as a symbol, whatever it is named; brackets, `#`, `=`, relocations
and expressions read the same as anywhere. A condition slot reads condition words as `condition`.
Everywhere else register words are registers and condition words are symbols. Operands before and
after the slot read normally, and a slot may stay empty while a line is typed. At a position with an
optional register the grammar reads the register when another operand follows and the label
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
| `register`         | a register with its arrangement (`v0.16b`, `z0.d`, `p0.s`) or field (`cpsr_fc`)                                                                                     | -                               |
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

After `[` or `{` an element is required. `[]`, `{}` and `d0[]` read it as a missing operand or a
missing expression, the hidden tokens an empty `( )` uses, which is also how `d0[]`, a valid lane,
parses. The scanner closes `[` and `{` at the end of a line, before a separator and before any
character that cannot continue them (see The external scanner).

### Relocations

A `:name:` relocation reads in Assembly and ARM. Apple's clang parses it but cannot encode it for
Mach-O ("unknown AArch64 fixup kind"), so ARM (Apple) keeps `@PAGE` and `@PAGEOFF`. The names:

| Names                                                                                                                                                                                                                                          | GNU as | clang |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----- |
| `lo12`, `abs_g0`-`abs_g3` with `_s` and `_nc`, `prel_g0`-`prel_g3` with `_nc`, `got`, `got_lo12`, `gotpage_lo15`, `pg_hi21_nc`, `tlsdesc`, `tlsdesc_lo12`, `dtprel_*`, `gottprel`, `gottprel_lo12`, `gottprel_g1`, `gottprel_g0_nc`, `tprel_*` | yes    | yes   |
| `pg_hi21`, `gotoff_lo15`, `gotoff_g0_nc`, `gotoff_g1`, `tlsgd`, `tlsgd_lo12`, `tlsgd_g0_nc`, `tlsgd_g1`, `tlsldm`, `tlsldm_lo12_nc`, `tlsdesc_off_g0_nc`, `tlsdesc_off_g1`                                                                     | yes    | no    |
| `secrel_lo12`, `secrel_hi12`, `got_auth`, `got_auth_lo12`, `tlsdesc_auth`, `tlsdesc_auth_lo12`                                                                                                                                                 | no     | yes   |
| AArch32 `lower16`, `upper16`, `lower0_7`, `lower8_15`, `upper0_7`, `upper8_15`                                                                                                                                                                 | yes    | yes   |

Both accept the name in any case and with blanks around it (`: lo12 :`), and both reject an unknown
name (`:foo:`). The value after the second colon is any expression.

AArch32 code writes a relocation after its operand instead, in parentheses: `.word sym(GOT)` or
`bl sym(PLT)`. Both assemblers accept `got`, `gotoff`, `got_prel`, `target1`, `target2`, `sbrel`,
`tlsgd`, `tlsldm`, `tlsldo`, `gottpoff`, `tpoff`, `tlscall` and `tlsdesc`; `plt` in data needs GNU
as, `prel31` clang. Both take any case, a blank before `(` and an addend after it
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
which also keeps a register name still being typed (`{d8-d`) from breaking the line.

### Keywords

A register, condition, shift word, relocation name or role mnemonic is a keyword: a token that
matches only a whole word. tree-sitter's lexer stops at a token of higher precedence instead of
going on to a longer token of lower precedence, so with these words as ordinary tokens `bic` read as
`b` and `ic`, `blx` as `bl` and `x`, and `cselx` as `csel` and `x`. M2 had the same flaw with its
block words: `.macros` read as `.macro` and `s`, and `.loc_mark_labels` as `.loc` and
`_mark_labels`.

The ARM module therefore declares `identifier` as the grammar's word token. tree-sitter then reads a
whole identifier first and checks it against the keywords, and a keyword counts only where the
parser expects it. Two keywords may not match the same string, or tree-sitter silently drops one
from the keyword list. So all ARM keywords share one precedence, and the keyword lexer always takes
the longest word: at different precedences it stopped at the condition `cs` inside `csel`. MVE's
`le` is both a role mnemonic and a condition, so it is one token that both places accept.
`test/grammar/keywords.test.ts` checks that every case-insensitive token of every grammar ends up in
the generated keyword lexer.

Apple's `L` names and the `@` relocation specifier are not keywords: tree-sitter leaves them out
because they match the same strings as each other. They have a higher precedence than `identifier`,
so wherever one is valid it wins over an identifier of the same length, and the keyword check never
runs. The `L` pattern therefore leaves out every `L` word that is a keyword (see Apple `L` names),
and an `L` word at the start of a statement can be a mnemonic as well as an assigned name.

Words that start with `.` cannot be keywords of an identifier, so the scanner reads them whole: the
block openers, `.loc` and `.file`, the register directives above and the alias words `.req`, `.dn`
and `.qn`, which it matches in lower case only for `.dn` and `.qn`. The x86 grammars declare no word
token; they have no keywords, and the extra keyword check costs x86 (GAS) about 3.5% of its parse
time.

### Apple `L` names

In ARM (Apple) an `L` name is a `local_identifier` in operands too: `adrp x0, Ltmp0@PAGE`,
`b LBB0_2`, `.quad Ltmp0 - Lfunc_begin0`, also glued to a macro argument (`Lskip\@:`) and as an
assigned name. At the start of a statement it may also be a mnemonic, so `LDP x0, x1, [sp]` and a
macro named `Lmacro` read as instructions. The exceptions are the `L` words that are also
registers, conditions, shift words or role mnemonics: `LR`, `LT`, `LE`, `LO`, `LS`, `LSL`, `LSR`,
`LDR` and `LDRSW`. `mov x0, LR` reads a register, `csel x0, x1, x2, LT` a condition and
`LDR x0, x1` a load from a symbol, as Apple's clang does. The grammar derives these words from the
register, condition, shift and role lists and builds the `L` pattern without them.

### Limits

- Named system registers, SVE patterns (`vl8`, `all`, `pow2`), prefetch operations
  (`pldl1keep`), barrier options (`ish`) and SME's `vgx2` are symbols.
- In ARM (Apple) the nine `L` words above are identifiers wherever they are not keywords, where
  Apple's clang reads `b LT` and `b LDR` as local labels. The keyword lexer gives each word one
  token, and making these words local only in operands would take a token of their own for each.
- An alias name is an identifier where it is used; only its `.req` line shows that it names a
  register. A predicate takes a register only, because `pg/z` with a name is also a division.
- The grammar reads operand shapes, not instructions: `zero {za0.s-za3.s}` parses, though the
  assemblers reject that list for `zero`.

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
bracket pairs, so Zed highlights the partner and Move to Enclosing Bracket jumps between them.

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
  `scripts/lib/indent.ts` generates it from `scanner.h`: the block words of each kind, and each
  dialect's reading of `;`, `#` and `@`. It matches a line that
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
| Register, register alias name, predicate `p0/z`     | `@variable.special`                                           |
| Condition in a condition slot                       | `@keyword.operator`                                           |
| `=` of a literal pool                               | `@punctuation.special`                                        |
| String, escape, character                           | `@string`, `@string.escape`, `@string`                        |
| Directive, block word (`.macro`, `.if`, `.endr`)    | `@keyword.directive @preproc`                                 |
| C preprocessor directive                            | `@keyword.preproc @preproc`                                   |
| Symbol type                                         | `@type.builtin`                                               |
| Relocation specifier (`@PLT`, `:lo12:`, `(GOT)`)    | `@attribute`                                                  |
| Shift operator                                      | `@keyword.operator`                                           |
| Location counter `.`                                | `@constant.builtin`                                           |
| Operators, brackets, delimiters; `!`, `^`, `-`      | `@operator`, `@punctuation.bracket`, `@punctuation.delimiter` |
| Comments, including on `#` lines                    | `@comment`                                                    |
| Macro name                                          | `@function.special.definition`                                |
| `#define` name, of a function-like macro            | `@constant`, `@function.special`                              |
| Macro parameter and argument, keyword argument name | `@variable.parameter`                                         |
| `\()` in a glued name                               | `@punctuation.special`                                        |
| `#if` and `#elif` condition                         | Zed's C highlighting, injected                                |
| Section a `.section` or `.pushsection` switches to  | `@namespace` (Mach-O: segment and section)                    |

`!` after a memory operand or a register, `^` after a register list and `-` in a range are
operators. Planned: control-flow instructions as `@keyword.control`, branch targets as `@function`,
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
| `deno task check:shell`    | shellcheck, with every optional check, on every script with a shell shebang                                                                                               |
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
in the printed tree. Operands that still parse with errors, such as `%fs:sym@tpoff`, NASM's
`es:[bx]` or `:lo12:.LC0` in ARM (Apple), must leave the function around them one label block.
`test/grammar/keywords.test.ts` checks that every case-insensitive token is a keyword (see "ARM
operands").

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
function must stay inside it. A second test parses the same output for every ARM target in every
language that reads it and requires no error at all; the sample adds a thread-local variable, a
conditional select and a loop that vectorizes, so the output holds TLS relocations, `sym(TPOFF)`,
`.save`, `.cfi_offset`, `.loh` and vector register lists. x86 output joins it with the x86 GAS
milestone. Apple's target is `arm64-apple-macos11`, the first macOS on arm64, since clang refuses
thread-local storage without a version. For this the dev image carries GCC for AArch64
(`gcc-aarch64-linux-gnu`) and for bare-metal ARM (`arm-none-eabi-gcc-cs`).

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
requests from forks. Building the 2.8 GB image takes about four minutes, so CI saves it in the
Actions cache under the image tag and the ISO week (`scripts/dev --image` prints the tag, a hash
of the Containerfile) and loads it instead of building, until the Containerfile changes or the
week ends; Fedora's package updates still reach CI within a week. The unit tests run their files
in parallel, except the performance tests, which run alone afterwards because they compare
timings. Compiled parsers are cached in `.build/lib` under a hash of their sources and the
tree-sitter version, so the test, query and fixture checks build each grammar once.

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

The second table runs the M2 and M3 parsers on the same `basics` code in one session, median of
nine runs; the M2 parsers were built from the M2 commit:

| Grammar       | Parse (ms)   | One-character edit (ms) | States     | parser.c          |
| ------------- | ------------ | ----------------------- | ---------- | ----------------- |
| asm_auto      | 56.3 -> 61.6 | 2.3 -> 2.5              | 489 -> 973 | 573 KB -> 1123 KB |
| asm_arm       | 50.2 -> 55.0 | 1.9 -> 2.1              | 470 -> 954 | 557 KB -> 1088 KB |
| asm_arm_apple | 49.4 -> 55.4 | 2.9 -> 3.1              | 428 -> 871 | 480 KB -> 886 KB  |
| asm_x86_gas   | 57.1 -> 57.6 | 2.3 -> 2.3              | 464 -> 466 | 529 KB -> 517 KB  |
| asm_x86_nasm  | 45.2 -> 45.8 | 3.5 -> 3.3              | 72 -> 72   | 87 KB -> 90 KB    |

The ARM languages parse 9 to 12% slower and edit as fast. The difference is the keyword check after
every identifier and a larger lexer; the x86 grammars, which declare no word token, parse as before.
Of the new states, the directives with register operands cost 81, ARM (Apple)'s `.loh` 52, the
relocation suffix 29 and macro arguments in register positions 14; the rest are the operand forms
and the role table.

The third table is M3 on all fixtures of each grammar repeated, which holds blocks, macros,
directives, preprocessor lines and, in the ARM grammars, the operand fixtures, with every query the
language ships (`deno task bench`):

| Grammar       | Parse | Edit | brackets | highlights | indents | injections | outline | overrides | textobjects |
| ------------- | ----- | ---- | -------- | ---------- | ------- | ---------- | ------- | --------- | ----------- |
| asm_auto      | 88.1  | 1.6  | 34.3     | 47.7       | 32.7    | 33.2       | 37.7    | 34.3      | 36.8        |
| asm_arm       | 89.5  | 1.6  | 35.9     | 48.6       | 34.0    | 34.0       | 37.9    | 35.4      | 37.5        |
| asm_arm_apple | 82.9  | 1.6  | 33.1     | 45.6       | 32.0    | 31.4       | 36.0    | 32.8      | 35.3        |
| asm_x86_gas   | 74.2  | 1.6  | 30.1     | 42.7       | 29.5    | 29.2       | 34.8    | 30.1      | 33.3        |
| asm_x86_nasm  | 64.2  | 6.4  | 27.0     | 35.5       | -       | -          | 30.4    | 27.8      | 30.1        |

Times are in milliseconds for the whole file; Zed runs most queries on the visible rows only.

What keeps it there:

- Only the ARM module declares a word token. M2 measured edits at 56 to 105% of a full parse with
  one declared in an earlier version of its grammar and left it out. M3 needs it for whole-word
  keywords, and on the current grammars edits cost the same with it: 1.6 to 3.1 ms, 2 to 6% of a
  full parse, and an edit still lexes the same few tokens however large the file. The x86 grammars
  leave it out because they have no keywords and it costs them 3.5% of a parse.
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
- The scanner copies a statement's first word only when it starts with `.` and a word from its
  table fits there, or when an x86 prefix fits, and finds it in the sorted table by bisection, about
  six comparisons. Comparing it against each table in turn cost x86 (GAS) 3.5% of a parse once the
  openers, which fit at every statement start, and the register directives joined the closers.
  Otherwise the scanner only looks for a label colon after the word. That label check, reading the
  word and the blanks after it, costs about 2% of a parse: the price of labels as tokens.

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
