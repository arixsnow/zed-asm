# Scanner

`tree-sitter/common/scanner.h` makes every lexing decision that depends on the dialect or on what
the parser expects next. Each grammar's generated `src/scanner.c` defines `ASM_GRAMMAR_NAME` and one
`ASM_DIALECT_*` macro and includes it. Defining none or two is a compile error. The scanner is
strict ISO C11. Dialect settings are 0/1 macros in ordinary `if` statements, so every branch
compiles and type-checks in all five dialects.

## State

The scanner state has four values:

| Value                                              | Described in                                  |
| -------------------------------------------------- | --------------------------------------------- |
| whether the zero-width end-of-input tokens are out | [grammar.md](grammar.md#end-of-file)          |
| the x86 syntax mode                                | [x86.md](x86.md#syntax-mode)                  |
| the alternate macro mode                           | [grammar.md](grammar.md#alternate-macro-mode) |
| the number of open C macro calls                   | [grammar.md](grammar.md#c-macro-calls)        |

The state serializes to zero bytes while all four values are initial, to one byte while no call is
open, and to five bytes while a call is open. Incremental reparsing reuses any subtree before the
first mode line, open call or end of input.

After an edit, tree-sitter lexes the token after a reused node in the parse state that follows the
node's reduction, where a fresh parse lexes it in the state before that reduction. The scanner
returns the same token in both. Its state changes only with the tokens it returns. The open-call
count says whether a line is inside a C call, and the zero-width `_call_reset` clears a count that
error recovery left behind ([grammar.md](grammar.md#c-macro-calls)). A call closes with its own
zero-width token, `_unclosed_call`, apart from the `_unclosed_arguments` of an
argument group. Joins are crossed before a glued token is decided, and a blank before `/`, `#`,
`@` or `;` leaves the decision to the reader of that character. `test/grammar/incremental.test.ts`
checks the result with random edits.

## Comments and separators

The assemblers read these characters as follows (GNU as 2.46.1 for x86-64 and AArch64, 2.45 for
AArch32, clang 22.1, nasm 3.02 and yasm 1.3.0):

|                    | GNU as x86-64             | GNU as AArch64   | GNU as AArch32   | clang ELF         | clang Apple arm64    | nasm and yasm |
| ------------------ | ------------------------- | ---------------- | ---------------- | ----------------- | -------------------- | ------------- |
| `;`                | separator                 | separator        | separator        | separator         | comment              | comment       |
| `//` at line start | comment                   | comment          | comment          | comment           | comment              | error         |
| `//` after code    | error                     | comment          | comment          | comment           | comment              | error         |
| `#` at line start  | comment                   | comment          | comment          | comment           | comment              | error         |
| `#` after code     | comment                   | immediate prefix | immediate prefix | depends on target | immediate prefix     | error         |
| `@`                | symbol type (`@function`) | error            | comment          | depends on target | relocation (`@PAGE`) | -             |
| `'a` / `'a'`       | both accepted             | both accepted    | both accepted    | only `'a'`        | only `'a'`           | `'a` warns    |

The scanner decides:

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

String text is read before any comment rule, so `.asciz "# of args"` is a string in every dialect.
In ARM (Apple) an `@` that is not a relocation is an error, as for Apple's clang. `;` alone and
`nop;;nop` are empty statements in the dialects where `;` separates.

In Assembly a `;` is a separator when a directive follows it, and a comment otherwise. A `.s` file
does not name its assembler, and Zed reads a language's `first_line_pattern` only when no suffix
matches. A modeline, or the ARM, ARM (Apple) and x86 (GAS) languages, give the exact reading. The
rule applies to every `;` on a line, so a `;` comment ends where a later `;` is followed by a
directive. `.rept 2; nop; .endr` closes its block with `; nop` as a comment, and `mov w1, #0 ; =0x0`
is a comment to the line end.

A `;` after an x86 prefix also separates (`rep; movsb`, `lock; incl %eax`). No prefix is an ARM
mnemonic, so such a line is x86 code, where `;` always separates. The prefixes are the x86 (GAS)
prefix words ([x86.md](x86.md#prefixes)).

`%%` separates statements in ARM (Apple), as in Apple's clang, and in Assembly. No x86 or GNU ARM
operand starts with `%%`.

A value starts with a letter, a digit or one of `_ . ( - + ~ ! ' :`. In Assembly `svc #0` has an
immediate, and `nop # note` and `nop #*** banner ***` are comments.

The preprocessor ends a C macro call at its `)`. Inside a call, an assembler line comment (`@`, `#`,
and `;` in ARM (Apple)) ends at the end of its argument, the next `,` or `)` outside parentheses,
with strings and C comments skipped. A `//` comment ends at the line end. An `@` glued to a size,
with an operand right after it, is the `@` of a probe argument instead
([grammar.md](grammar.md#c-macro-calls)).

## Statement words

At a statement start the scanner reads the next word. Followed by blanks and a colon, the word is a
label name. It is local when the assembler keeps it out of the symbol table (`.L` in the ELF
dialects, `L` in ARM (Apple), `.` in NASM) and global otherwise. In GNU syntax a word of digits is a
numeric label. In Assembly and ARM it may end in `$`, a dollar label of GNU as for AArch32. Inside a
block, its closing word (`.endm`, `.endmacro`, `.endif` or `.endr`) is the closer. The parser sees
the colon before it decides whether a block ends. The word takes the characters of the grammar's
names, and a test checks every printable character against `lexical.js`.

A statement inside a C macro call argument starts with a label or an item. The scanner reads the
word once. Followed by a colon, blanks allowed, it is a label name. Otherwise it takes its operand
role, so `X(r4: nop)` has a label and `cfi_rel_offset (r4, 0)` a register. GNU as drops the blanks
between a statement's first word and its colon. A label named by a call (`L(x):`) is decided at its
colon, which the scanner reads as `_label_colon`. At a statement start the scanner looks past the
parentheses for the colon, once per statement. Inside a call it does not look ahead.

The same word may be a directive that must match whole, such as a block opener or clause, `.loc` or
`.file`, an ARM directive with register operands, or a NASM directive such as `section` or `db`. The
words come from the generated tables, one per architecture and dialect ([Generated
tables](#generated-tables)). Each language looks them up in one dictionary built from the tables of
its architectures. The scanner hashes a word once and reads every role it has from that one entry
(directive, instruction, register, prefix and the others), each with its architecture, token and
flags. The flags state, for example, that a reserved word is never a label, and that in NASM a word
can make the name before it a label (`x db 1`) or an assignment name (`len equ 5`). The indent
pattern reads the block words from the same tables.

The scanner keeps a word's first characters, one more than the longest word of its dictionary. A
longer word matches no keyword, whole or with an affix, and reads as a name. A 45-character
`a_macro_name_longer_than_every_keyword_of_gas 1, 2` is a macro call. The hash is the scanner's own,
because tree-sitter gives a wasm grammar only a few C library functions.

## Numbers

The scanner reads every number token. In GNU syntax these are `integer`, `float`, `numeric_label`
and `_dot_float`, a float that starts with `.` (`.5`). In NASM they are `integer`, `float` and
`_digit_name`, a `$` and a digit followed by name characters (`$1x`). `lexical.js` holds their
forms as regular expressions, one row per token with its precedence. `bun run build` compiles the
rows of a syntax into one DFA in `tree-sitter/common/numbers.h`, with a section for the GNU-syntax
languages, one for ARM (Apple), whose integers take clang's suffixes, and one for NASM. A table maps
each ASCII character to a class and each state and class to the next state, and names the token
each state ends. A number costs one lookup per character. The build reads a subset of regular
expressions (classes, groups, `|`, `?`, `*`, `+` and `{m,n}`, all in ASCII) and stops on anything
else.

The tables decide as tree-sitter's generated lexer does. The longest match wins. Once a token has
ended, a transition that only tokens of lower precedence take is cut. `_dot_float` (precedence 1)
ends `.5x` after `.5`, and `integer` ends `$1x` after `$1`, where `_digit_name` (precedence -1)
would go on. Of two tokens that end at the same length, the higher precedence wins, then the
earlier row. A row may name a rival, a grammar token without precedence that is valid wherever the
row's token is. `_dot_identifier`, the GNU dot name, is the rival of `_dot_float`. When the rival
ends last, the scanner returns no token and tree-sitter's lexer reads the name, so `.5e` is a
symbol.

A join inside a number is invisible. The reader steps over a join before any character but the
first, so `0x1\`, newline, `f` is `0x1f`, and `.0\`, newline, `L` reads as `.0L` does.

The scanner reads a number where a number token is valid and the next character can start one.
Statement words, digit words in an operand, glued text and labels read during error recovery may
begin with a number, and the scanner reads each of them in lockstep with the number. When the word
turns out to be none of its kinds, the scanner returns the number. A token ends at the last
position the scanner marks, and the scanner cannot move back, so it can return the number only
while it stands on the number's end. As a limit, a word check that marks the end of a longer word
and then fails returns no number for the digits before it. This happens for digits followed by `$`
and no `:` in a C macro call argument in Assembly, and for a NASM `$`-digit name followed by a join
at a statement start that is no label.

## Error recovery

During error recovery the scanner reads no label and no block closer. A name with a colon read
during recovery is one token that no rule accepts, and recovery skips it instead of starting a
statement there. Operands the grammars do not parse, such as `ptr fs:[0x28]`, `%fs:sym@tpoff`,
NASM's `[fs:0x28]` or `:lo12:sym` in ARM (Apple), never start a block. Valid code never enters
recovery. A label after an error and a `;` still starts its block, because recovery resumes at the
`;`.

The scanner never asks for the column during recovery. While tree-sitter skips characters it forgets
the column after every scanner call, and it computes an unknown column by walking back to the line
start.

## Assembly limits

Assembly reads both ARM and x86, with these limits:

- `mov rax, rdi #copy` reads `#copy` as an immediate, and `nop @note` reads `@note` as a symbol
  type.
- ARM register names are registers in x86 code too (`movl sp, %eax`, `call a1`).
- Assembly reads AT&T until a `.intel_syntax` line. Before one, Intel's `dword ptr [rbx+4]` parses
  as the symbols `dword` and `ptr` and an ARM lane, and after one as a typed memory operand, as in
  x86 (GAS).
- A bare `#` at a line end is a comment, because no value follows it.
- An ARM role slot also takes x86 operands, so `blcs %eax, %ebx` (AMD TBM) parses, though `blcs` is
  also ARM's `bl` with the condition `cs`.

The exact languages read all of these correctly.

## Closing tokens

The scanner sees only which of its own tokens the parser accepts. Each closing token stands for one
kind of construct, with a fixed set of characters that continue it. A missing piece closes before
any character that cannot start it:

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

An open construct closes before any character that cannot continue it. It also continues with an
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

The open tokens are valid only where the construct may end. After `[` or `{` an element is required,
so a bracket never closes before its first element, and `[x1]` stays whole. When a missing piece and
an open construct can both close, the construct closes as it stands, so `.word (` at the end of a
line holds an empty parenthesis. Inside a C macro call a line end closes nothing. A construct nested
in the call closes at the line end only when the first character of the next line cannot continue
it.

Comments are read first, and the decision is made on the next character that is not a comment. Where
an operator may continue, `=` in GNU syntax and `!` in ARM (Apple) and NASM decide only with a
second `=` (`==`, `!=`). In the other GNU-syntax languages `!` alone is an operator, and in ARM
(Apple) `a !b` in a call argument is two items. A GNU-syntax `\` needs a name, `@` or `+` after it,
a NASM `?` a name character, and a `.` where only a name fits a letter or `_`. The only word that
may be glued to a complete operand is a relocation specifier after `@`, which the scanner reads
itself. Any other glued word closes like any character that cannot continue, so `[0x` (a hex number
being typed) closes its bracket before the `x`, and the error stays on its line.

Where a character has several meanings, the scanner reads the token itself, and only where the
parser expects it:

- the comma right after an AT&T `(` (`(,%rax,8)`)
- the colon of an ARM alignment or index range, and of an Intel segment (`fs:[0x28]`)
- the `[` after an Intel displacement (`sym[rip]`)
- the dash of a register range, the `!` of an ARM writeback and the `^` after a register list
- the `)` of a C macro call, and inside a call the colon of a label named by a call, a relocation
  name after `:` and the colon after it, a pseudo-prefix, a decorator, the `%` of a register built
  by a call (`%VMM(1)`) and the `@` of a probe argument

Before a `(` the scanner writes a zero-width marker of what the parentheses open
([grammar.md](grammar.md#c-macro-calls), [x86.md](x86.md#operand-forms)). At the start of an ARM
bracket element a colon begins an alignment when a digit follows (`[r0, :64]`) and a relocation
otherwise (`[x0, :lo12:sym]`). The first colon of `:lo12:` is the parser's own token, because a
label's colon is the same character (`\name\()_start:`).

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

Each language reads these tables:

| Language    | Tables                                       |
| ----------- | -------------------------------------------- |
| Assembly    | AArch64 GNU, AArch64 Apple, AArch32, x86 GAS |
| ARM         | AArch64 GNU, AArch32                         |
| ARM (Apple) | AArch64 Apple                                |
| x86 (GAS)   | x86 GAS                                      |
| x86 (NASM)  | x86 NASM                                     |

The GNU-syntax languages also read the `GNU` tables. `bun run build` merges the tables of each
language into one dictionary in `tree-sitter/common/words.h`, one section per language. Each word
appears once, with one role for every table that lists it, in the order `scanner.h` lists its
`ASM_*_KEYWORDS` settings (AArch64 GNU, AArch64 Apple, AArch32, x86 GAS, NASM). Lookups prefer the
earlier role, so a directive both AArch64 and x86 define reads as AArch64's in Assembly.

The dictionary is a minimal perfect hash. Two seeded 32-bit hashes of the word name two vertices of
a graph, and the values stored at the two add up to the word's index. A lookup costs one hash, two
reads and one string compare, and the compare also rejects a word that is no keyword. The build
tries seeds until the graph has no conflict, and checks that every word finds itself. `check:c`
builds `test/c/words.c` for each language and checks the same in C. Every word finds its own entry,
and the empty word and each word with a character no word holds find none.

### Sources

The tables follow the upstream heads, not the installed releases. The installed tools only
cross-check them. A table is a superset, so a word reads if any assembler of the dialect takes it.
Where sources disagree about a word, what one of them allows counts (a register that takes a suffix
in either). A restriction holds only if every source that lists the word imposes it (a word is
case-limited only if all of them limit it). Each reader tags what its source states, and
`scripts/lib/keywords/shapes.ts` merges the tags into scanner tokens and flags.

The strings `ASM_<scope>_SYMBOL_CHARACTERS` hold the symbol characters of GNU as's input scrubber
(`app.c`). `ASM_GNU_SYMBOL_CHARACTERS` is the symbol components of the `lex` table in `app.c`
(letters, digits, `_`, `.`, `$`). The bytes from 128 up are symbol characters too, and the reader
stops if `lex` changes that. A target's string is its `tc_symbol_chars` minus its comment, line
comment and line separator characters (`do_scrub_begin`), read from `tc-*.h` and `tc-*.c` through
GCC for an ELF Linux build (`OBJ_ELF`, `TE_LINUX`). The strings are `%(*-[` for x86, `[]{}` for
AArch32 and empty for AArch64. `words.h` holds the union of each language as two 64-bit ASCII masks,
`SYMBOL_CHARACTERS`.

nasm's token classes (registers, prefixes, operand words, decorators) come from nasm alone, so where
nasm and yasm read a word differently the grammar follows nasm. Statement words are the union with
yasm, because nasm rejects the yasm-only lines rather than reading them differently.

A reader checks the shape of the source it reads and stops the generator when the shape no longer
fits. That is a new handler, token type or operator it has no form for, or a guard it relies on that
is gone (a name compared in any case, a word that must follow another). A reader cannot detect a
word written in a form it has never met. A change of form usually removes what it matched, and then
it stops. `test/unit/keywords-*.test.ts` run each reader on small inline sources, without upstream
sources, and check its names, its tags and each of its stops.

These parts are hand-written, because upstream has no list of them:

- the token a word becomes, in the handler and word maps in `shapes.ts` and the instruction roles in
  `tree-sitter/common/roles.js`. Signatures that fit no role stop the generator.
- forms, which are small rules rather than word lists. Names and numbers are in
  `tree-sitter/common/lexical.js`. The scanner holds the AArch32 type suffixes (`.f32`, `.bf16`),
  the AArch64 arrangements and element sizes, the letters of `APSR_nzcvq` and the local label
  prefixes.

A word reads by its table even when a macro redefines it, because the definition may be in another
file. GNU as and clang let a macro take an instruction's name. clang, nasm and yasm also let it take
a directive's, and GNU as warns and ignores the macro. As a limit, `add 1, 2` after `.macro add a b`
reads as an instruction, and `add 1 2`, blank-separated, is an error on that line, though the
assemblers accept it.

### Regenerating

Keep clones named `binutils`, `llvm`, `nasm` and `yasm` in one directory and run:

```sh
scripts/dev --sources ../references bun run keywords
scripts/dev bun run generate
```

The first command builds `llvm-tblgen` once under `.build/tblgen`, which takes a few minutes, and
runs each project's own table generators. The second regenerates the parsers. `ASM_KEYWORD_SOURCES`
in `keywords.h` records the commit of each source, so a change of upstream shows in the diff of that
file.
