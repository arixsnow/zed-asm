# Editor behavior

This page covers comments, brackets, word selection, indentation, the outline, text objects and
highlighting in Zed. [qa.md](qa.md) checks them in the real editor.

## Comments

Each language's comment markers are the characters its assemblers accept at the start of a line:

| Language    | Markers          | Toggle comment |
| ----------- | ---------------- | -------------- |
| Assembly    | `//` `#` `@` `;` | `//`           |
| ARM         | `//` `#` `@`     | `//`           |
| ARM (Apple) | `//` `#` `;`     | `//`           |
| x86 (GAS)   | `//` `#`         | `//`           |
| x86 (NASM)  | `;`              | `;`            |

Enter after a full-line comment starts the next line with the same marker, and a comment after code
does not continue. Toggle comment inserts its marker and a space. GNU as and clang accept `//` at
the start of a line on every target.

A `#` line that is a C preprocessor directive is not a comment. There the `preproc` scope limits the
markers to `//`, and Enter after `#define X 1` or `#endif /* X */` inserts nothing.

GNU as and clang accept `/* */` block comments. `/*` followed by Enter adds the closing `*/` and
starts the new line with a space, `*` and a space. NASM has no block comments.

As a limit, at the end of a file, with nothing after the cursor, Zed ignores scopes and uses the
base markers. Enter after `#define X 1` then inserts `#` and a space, and `/*` closes inside a
comment.

## Brackets and quotes

| Pair              | Closes                       |
| ----------------- | ---------------------------- |
| `[` `(` `{`       | everywhere                   |
| `"`               | outside strings              |
| `'`               | outside strings and comments |
| `/*` (GNU syntax) | outside strings and comments |
| NASM backquote    | outside strings              |

A pair closes only when a space, the end of the line or one of `,` `;` `)` `]` `}` follows, the
characters that can come after a closing bracket in assembly. Typing `(` before `.Lend` inserts no
`)`. Enter between a pair gives a plain new line.

In the ARM languages `[ ]` and `{ }` are bracket pairs, so Zed highlights the partner and Move to
Enclosing Bracket jumps between them. In NASM `[ ]`, the `{ }` of a brace argument and the `%(` of a
data list with its `)` are bracket pairs.

## Word selection

Double-click selects what the grammar reads as one name. `.` joins `.Lloop` and `b.eq`, `$` joins
`foo$1`, and `%` joins `%rax` and `%function`. NASM adds `?`, `@` and `#`, which its names may
contain.

## Indentation

Enter after a label indents one level, and typing `name:` on an indented line moves it back one
level. Labels stay at the level of the block around them, and code sits one level in. Only what the
parser reads as a label counts, so a reserved word (`eax:` in NASM), a `name:` inside a comment and
a macro-call label nested to any depth (`L(a(b(x))):`) behave as the parser reads them. Tab size and
hard tabs come from the user's Zed settings.

A label in a NASM `struc` is a field and stays where it is typed. A new line follows the field above
it, so a structure keeps its layout. A field typed on its own line (`.x:`) indents the next line
through the indent pattern, and a field typed there stays at that level.

Enter after a line that opens a block indents one level. The openers are `.macro`, any `.if` opener,
`.elseif`, `.else`, `.rept`, `.irp` and `.irpc`, and in NASM `%macro`, `%imacro`, any `%if` or
`%elif` opener, `%else`, `%rep`, `struc` and `istruc`. A NASM block word counts only at the start of
its line, as nasm reads it, so no label comes before it. Typing a clause or a closer aligns it with
the line that opened its block, whatever the indentation of the body, and a body may also stay flush
with its opener. A block opened and closed on one line (`.rept 2; nop; .endr`) does not indent the
next line, except in ARM (Apple) and NASM, where `;` starts a comment.

Section directives such as `.text` keep the indentation they are typed with, so both styles stay.
`#if` and `#ifdef` bodies get no indentation and no structure, because `.S` files keep them at the
indentation of the code around them.

### Indent query

`indents.scm` in `queries/core` gives every block body an indent range (`body`, and `unclosed_body`
for a block that the end of the file closes). Every label gets a range from its end (`@start`) to
the end of the node that holds it. Every label is also an `@outdent`, which cuts the innermost range
holding it, so a label moves back to the opener of that range and ends the range of the label before
it. A `structure_body` has an indent range too, and its labels have neither capture.

A clause or a real closer always ends a `body`. Zed aligns a line with the start row of a range that
ends at the start of that line, so each clause and closer goes to its own opener, also after a
closed inner block at the same column. The extension sets no `decrease_indent_patterns`.

### Indent pattern

Zed indents from a tree range only when the range ends after the start of the new line. No range
does that on the last line of a file, where a block or label being typed ends. Enter after an opener
or a label there uses `increase_indent_pattern`, which `scripts/lib/indent.ts` generates.

The label part takes the label forms in `lexical.js`. In GNU syntax these are plain and dot names,
digits (`1$` too in ARM and Assembly), quoted names, names built from macro arguments
(`\name\()_end:`) and macro calls (`L(loop):`). In NASM they are names with `$`, `?`, `@` or `.`,
`%%x` and `%$x`. A blank may come before the colon. NASM's reserved names, read from the scanner's
tables, are left out as a trie complement.

The label part leaves out a label followed by a word that ends the label's range on its own line,
read from the generated tables as a word complement. In every syntax that is a block closer or
clause (`a: .endm`, `b: .else`). The closer ends the body that holds the label, and a clause still
indents through the block part. In NASM it is also a word that names its statement (the data and
reserve words, `times`, `at`, the structure words, and `equ`, after which the parser reads an
assignment and no label), as in `.x: resd 1`, `.a: times 4 resd 1` and `n: equ 3`. A pattern match
outranks nearly every tree range and does not see the enclosing structure. At the end of a file
Enter after `buf: resb 4` keeps the level, and elsewhere the label's tree range indents the next
line.

The block part takes the block kinds of the language's syntax (a kind names its syntax in
`languages.config.cjs`, or belongs to all) and, from `scanner.h`, each syntax's block words and each
dialect's strings, comments and reading of `;`, `#` and `@`. A kind with no opener word in a dialect
of its syntax stops the build. The block part matches a line that holds an opener with no closer of
the same kind in a later statement of the line. It reads strings, character constants and comments
as the scanner does.

A test parses every label form with each grammar, followed by nothing, by code and by each of these
words. It checks that the label part matches a line exactly when the parser reads a label at its
start whose range goes on past the line.

### Indentation limits

The pattern differs from the parser in five cases, each beyond a regular expression. Each changes
only whether the next line starts indented:

- the same block kind opened twice and closed once on one line (`.if A; .if B; .endif`)
- in ARM, a `#` comment on an opener line that contains `; .endr`. The scanner reads `#` as an
  immediate or a comment by whether an operand fits there.
- a label built from a macro argument before a closer on the same line
- a macro-call label nested deeper than eight parentheses, on the last line of a file. Enter after
  it does not indent there. Elsewhere the tree indents under it.
- a clause after `.endr` or `.endm` on its line. The pattern reads it as the end of the clause's
  conditional, while the closer may instead close a repeat block or macro inside that conditional.

Zed looks for indentation ranges within 16 KB around the edited line, so a closer typed more than
about 8 KB below its opener is not re-aligned. At the end of a file a line typed after a blank line
starts at column 0, because Zed applies the pattern only to the line right after the one it matches.
The line takes the indentation of its label or block from the tree as soon as its first character is
typed. The languages keep Zed's default `auto_indent_using_last_non_empty_line`.

While `.elseif` is typed, the line passes through `.else`. It moves out, back in at `.elsei`, and
out again at `.elseif`. `.endm` to `.endmacro` does the same.

## Outline and breadcrumbs

The outline lists:

- every global label, with its local labels nested under it (`.L` names in the ELF dialects, `L`
  names in ARM (Apple), dot names in NASM)
- macros (`.macro m`)
- `#define` names, `#define F( )` for function-like ones
- assigned names (`NAME = expr`, and `.equ`, `.set`, `.equiv` and `.eqv` with a name and a value).
  `.set noreorder` stays out.
- in NASM, `%macro m`, the `%define` family (`%define N`, `%define F( )`, `%assign K`), the name of
  `x equ 1`, and structures (`struc point`) with their fields

Numeric labels stay out, because one name is reused many times. Sections stay out, because compilers
switch sections inside a function (`-ffunction-sections`, jump tables in `.rodata`). Breadcrumbs
show the label block around the cursor. The comments right above an item are its annotation.

## Text objects

In vim mode `af` selects a label block, from its label to the next global label, and `if` the
statements after the label. `ac` and `ic` select a macro and its body, and in NASM also a structure
or an instance. `gc` selects a comment, with consecutive line comments as one.

## Injections

The condition of `#if` and `#elif` is injected as C, so Zed's C grammar colors it. `#define` values
stay plain, because in `.S` files they are often assembly (`#define SAVE push %rbp`).

## Debuggers

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
macro call (`L(loop):`) takes the call's capture, because its uses look like any other call.
