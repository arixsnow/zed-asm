# Architecture

This repository builds a Zed extension with five assembly languages from one manifest and one set of
grammar modules. A rule is written once and reaches every language that includes its module; a new
architecture is a new module.

## Languages

| Language (Zed picker) | Grammar         | Modules             | Owns by default           | Modeline aliases                           | Toggle comment |
| --------------------- | --------------- | ------------------- | ------------------------- | ------------------------------------------ | -------------- |
| Assembly              | `asm_auto`      | core, gas, arm, x86 | `s` `S` `sx`              | `asm` `gas` `assembly`                     | `//`           |
| ARM Assembly          | `asm_arm`       | core, gas, arm      | none                      | `arm` `arm64` `aarch64` `aarch32` `thumb`  | `//`           |
| ARM Assembly (Apple)  | `asm_arm_apple` | core, gas, arm      | none                      | `arm64-apple` `apple-arm64` `darwin-arm64` | `//`           |
| x86 Assembly (GAS)    | `asm_x86_gas`   | core, gas, x86      | none                      | `x86` `x86_64` `x64` `amd64` `i386`        | `//`           |
| x86 Assembly (NASM)   | `asm_x86_nasm`  | core, nasm, x86     | `asm` `ASM` `nasm` `yasm` | `nasm` `yasm`                              | `;`            |

Toggling a comment inserts the prefix shown and one space. `sx` is GCC's suffix for assembly that
goes through the C preprocessor.

A `.s` file opens as Assembly unless a modeline or a project setting selects another language.
Assembly parses ARM and x86 together. The other GNU-syntax languages follow one dialect exactly;
select one per file with a modeline (`// vim: ft=arm`) or per project in `.zed/settings.json`:

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
module is a function that returns three tables:

- `rules`: rules it owns. A name defined by two modules is an error.
- `choices`: alternatives it adds to shared choice points (`_line_content`, `_statement`,
  `_operand`, `_expression`, `_symbol`, `immediate`, `symbol_type`). Alternatives from different
  modules are merged and duplicates dropped.
- `extras`: tokens allowed anywhere, such as block comments.

Composition decides what a dialect can contain. Symbol types written with `@` (`.type f, @function`)
come from the x86 module, so the ARM grammars have no such rule and read `@note` as a comment. Local
labels are their own node, `local_identifier`: names starting with `.L` in the GNU syntax, every dot
name in NASM. Other dot names such as `.text` stay ordinary identifiers.

The grammar is line oriented: a statement ends at a newline or at a statement separator. While a
line is being typed its last construct is often still open, and the scanner closes it with a
zero-width token so that error recovery never pulls in the next line. An operand missing after a
comma, an expression missing after an operator, `(`, `#` or `$`, and a parenthesis or GAS string
left open all close at the end of the line, before a separator, or before any character that cannot
continue them. `mov x0, , x1` keeps both operands, and in `ldr x0, [x1]` only the unsupported `[x1]`
is an error. NASM strings and GNU character constants end at the closing quote or at the end of the
line. A relocation may still lack its specifier and a register its name after `%`.

Three tests hold this. The first checks every prefix of every line of the fixtures and of all corpus
examples and requires every other line to parse exactly as before. The second types every printable
character right after each kind of open construct, in every grammar. The third reads each generated
`grammar.json`, works out which input can start an operand or an expression and which can continue a
parenthesized expression, and checks that the scanner closes exactly where the grammar allows
nothing else. Only an unclosed `/*` and a preprocessor line ending in a backslash reach further,
since both really span lines.

## Query and test sources

Query fragments live in `queries/<source>/` and corpus tests in `test/corpus/<source>/`. For each
language the sources run from general to specific: `core`, the syntax family, each architecture,
then `<arch>.<syntax>` for material that only holds for that pair (AT&T operands and `@` symbol
types live in `x86.gas`). Corpus tests also include a directory named after the grammar for
behaviour that belongs to one dialect.

Zed allows one file per query kind and paints a character with the last capture pushed for it, so
the build concatenates fragments from general to specific and later patterns override earlier ones.

## The external scanner

`tree-sitter/common/scanner.h` makes every lexing decision that depends on the dialect or on what
the parser expects next. It keeps no state, so incremental reparsing can reuse any subtree. Each
grammar's generated `src/scanner.c` defines `ASM_GRAMMAR_NAME` and one `ASM_DIALECT_*` macro and
includes it; defining none or two is a compile error.

What the assemblers do, measured with GNU as 2.46 (x86, AArch64) and 2.45 (ARM EABI), clang 22, nasm
3.02 and yasm 1.3:

|                    | GNU x86                   | GNU A64          | GNU A32          | clang ELF         | clang Apple arm64    | NASM / YASM |
| ------------------ | ------------------------- | ---------------- | ---------------- | ----------------- | -------------------- | ----------- |
| `;`                | separator                 | separator        | separator        | separator         | comment              | comment     |
| `//` at line start | comment                   | comment          | comment          | comment           | comment              | error       |
| `//` after code    | error                     | comment          | comment          | comment           | comment              | error       |
| `#` at line start  | comment                   | comment          | comment          | comment           | comment              | error       |
| `#` after code     | comment                   | immediate prefix | immediate prefix | depends on target | immediate prefix     | error       |
| `@`                | symbol type (`@function`) | error            | comment          | depends on target | relocation (`@PAGE`) | -           |
| `'a` / `'a'`       | both accepted             | both accepted    | both accepted    | only `'a'`        | only `'a'`           | `'a` warns  |

What the scanner decides:

|                                         | Assembly                                                  | ARM        | ARM (Apple) | x86 (GAS)   | x86 (NASM) |
| --------------------------------------- | --------------------------------------------------------- | ---------- | ----------- | ----------- | ---------- |
| text inside `"..."`                     | string                                                    | string     | string      | string      | string     |
| `//`                                    | comment                                                   | comment    | comment     | comment     | -          |
| `#` where an immediate fits             | immediate if a value can start after it, else comment     | immediate  | immediate   | -           | -          |
| other `#`                               | C preprocessor directive at statement start, else comment | same       | same        | same        | -          |
| `@` glued to a symbol                   | relocation                                                | relocation | relocation  | relocation  | -          |
| `@` plus a letter where an operand fits | symbol type                                               | comment    | -           | symbol type | -          |
| other `@`                               | comment                                                   | comment    | -           | -           | -          |
| `;`                                     | separator before a directive, else comment                | separator  | comment     | separator   | comment    |

A value can start with a letter, a digit or one of `_ . ( - + ~ ! ' :`. In Assembly `svc #0` has an
immediate, while `nop # note` and `nop #*** banner ***` are comments.

String text is read before any comment rule, so `.asciz "# of args"` stays a string in every
dialect. In ARM (Apple) an `@` that is not a relocation is an error, as it is for Apple's assembler.
`;` alone and `nop;;nop` are empty statements in the dialects where `;` separates.

Assembly has to guess between ARM and x86, which costs three cases: `mov rax, rdi #copy` reads
`#copy` as an immediate, `nop @note` reads `@note` as a symbol type, and a `%word` being typed reads
as a register until it names a symbol type such as `%function`. A bare `#` at the end of a line is a
comment there, since no value follows it. The exact languages read all of these correctly.

To close an open construct the scanner knows which characters can start an operand or an expression
in each syntax and which continue a parenthesized expression. Comments are read first, so the
decision is made on the next real character. `==` and `!=` need a second character, and so does a
NASM `.`, which only starts a local label.

The scanner is strict ISO C11. Dialect settings are 0/1 macros used in ordinary `if` statements, so
every branch compiles and type-checks in all five dialects.

## C preprocessor lines

A line that starts with a C preprocessor directive (`#define`, `#if`, `#endif` and the others in
`scanner.h`), indented or not, is a `preproc_line`. After a label or a `;`, a `#` follows the
dialect's comment rules, because the preprocessor recognizes directives only at the start of a line.
After the directive the scanner reads the rest of the line the way the preprocessor does in
assembler-with-cpp mode, measured with GCC 16 and clang 22 (`-E -x assembler-with-cpp`):

- Only `//` and `/*` start comments. `#`, `@` and `;` are ordinary text, so `#define SEP ;` and
  `#define STR(x) #x` keep their arguments.
- `"` starts a literal that ends at the next unescaped `"` or at the end of the line. `'` starts one
  that ends at the next `'` or at the end of the line.
- After `#include`, `#include_next` and `#import`, `<...>` is one header name, so the `//` in
  `<a//b.h>` is not a comment. An unclosed `<` is read as a header name being typed.
- A backslash before a newline joins the two lines everywhere, including inside literals and `//`
  comments, also with blanks between the backslash and the newline. Outside literals a backslash
  does nothing else.

Comments after the directive become `preproc_comment` children of the line, and trailing blanks
belong to the line too. The comments keep their color, and a cursor at the end of `#endif /* X */`,
even after trailing blanks, stays in the `preproc` scope.

Two cases are not modeled. A comment opener split by a backslash-newline (`/`, backslash, newline,
`*`) is joined by the preprocessor but not by the scanner; no real code writes it. A `// note`
ending in a backslash on a code line swallows the next line in a `.S` file, which goes through the
preprocessor, but not in a `.s` file, which GNU as reads directly. Both open as the same language,
so the grammar ends that comment at the end of its line.

## Editor behaviour

Every language lists as comment markers exactly the characters its assemblers accept at the start of
a line: `//`, `#` and `@` in ARM, `//`, `#` and `;` in ARM (Apple), `//` and `#` in x86 (GAS), all
four in Assembly, and `;` in NASM. Enter after a full-line comment starts the next line with the
same marker; a comment after code does not continue. Toggle comment inserts `//`, which every GNU
and LLVM assembler accepts at the start of a line, and `;` in NASM.

A `#` line that is a C preprocessor directive is not a comment, so the `preproc` scope limits the
markers to `//` there: Enter after `#define X 1` or `#endif /* X */` inserts nothing. Zed has one
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
level, so labels stay at column 0 and code sits one level in. Zed matches these patterns against the
line text only, so a prose line such as `Returns: x0` inside a multi-line block comment also moves
back when you type the colon. Tab size and hard tabs come from the user's Zed settings.

The debuggers are CodeLLDB, then GDB. CodeLLDB runs on Linux and macOS; GDB does not run on Apple
silicon.

## Highlighting

| Element                          | Capture                                                       |
| -------------------------------- | ------------------------------------------------------------- |
| Instruction                      | `@keyword`                                                    |
| Global label definition          | `@function.definition`                                        |
| Local label, defined or used     | `@label`                                                      |
| Other symbol                     | `@constant`                                                   |
| Number, `#` and `$` sigils       | `@number`, `@punctuation.special`                             |
| Register (AT&T)                  | `@variable.special`                                           |
| String, escape, character        | `@string`, `@string.escape`, `@string`                        |
| Directive                        | `@keyword.directive @preproc`                                 |
| C preprocessor directive         | `@keyword.preproc @preproc`                                   |
| Symbol type                      | `@type.builtin`                                               |
| Relocation specifier             | `@attribute`                                                  |
| Shift operator                   | `@keyword.operator`                                           |
| Location counter `.`             | `@constant.builtin`                                           |
| Operators, brackets, delimiters  | `@operator`, `@punctuation.bracket`, `@punctuation.delimiter` |
| Comments, including on `#` lines | `@comment`                                                    |

Planned: control-flow instructions as `@keyword.control`, branch targets as `@function`, ARM and
Intel registers, macros, sections and data labels.

## Checks

The tooling is TypeScript on Deno. Every task in `deno.json` passes explicit `--allow-*` flags. The
build may write generated files but never `tree-sitter/common` or the manifest; the checks write
only `.build/`; the `corpus` task composes `tree-sitter/<grammar>/test/`; the Zed checks also write
their container's home. No command may start `deno` itself, and only the sanitizer run may start
arbitrary programs. `test/unit/permissions.test.ts` enforces this.

| Command                    | What it checks                                                                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deno task test`           | formatting, lint, types, generated files and parsers up to date, unit, highlight, tree, typing and performance tests, C checks, corpus tests, query compilation, fixtures |
| `deno task check:c`        | clang-format, GCC and Clang with strict warnings as errors, both static analyzers, clang-tidy, and that `scanner.h` rejects zero or two dialect macros                    |
| `deno task test:corpus`    | the corpus tests of all five grammars                                                                                                                                     |
| `deno task sanitize`       | corpus and fuzzing against parsers built with AddressSanitizer and UndefinedBehaviorSanitizer                                                                             |
| `deno task check:fixtures` | every fixture, and a CRLF and a no-final-newline copy of it, assembles with the real toolchains; every fixture parses without errors                                      |
| `deno task bench`          | not a check: prints parse, edit and query times, states and parser size for every grammar                                                                                 |
| `scripts/zed`              | the `docs/qa.md` checks in the real Zed app, in Podman on a virtual display                                                                                               |

`scripts/zed` builds the `zed` stage of the Containerfile: Xvfb, xdotool, Mesa's software Vulkan,
and Zed from its official install script, always the latest release. It compiles each grammar to
wasm with the flags the tree-sitter CLI uses, installs the result as an ordinary extension folder
and drives Zed with keystrokes. The network is off, each run starts from an empty Zed profile, and
the files Zed opens live in the container's home, outside the repository, so Zed never reads the
repository's git data.

The highlight tests run `tree-sitter query --captures` and apply Zed's two rules: a character takes
the last capture that covers it, and the scope at a cursor comes from the smallest capture that
contains it (edges count only for `.inclusive` captures). Offsets are compared in bytes, as
tree-sitter reports them. tree-sitter's own highlight tests use a different rule and would report
the wrong result.

The tree tests compare parse trees. UTF-8 text must parse exactly like ASCII text of the same kind,
and every fixture must parse the same with CRLF line endings and without its final newline. A parse
counts as clean only if tree-sitter never entered error recovery, which its debug log shows even
when the recovery left no visible node.

The typing and closing tests are described under grammar modules. The performance tests compare
timings taken on the same machine, so they hold on any computer: 14 hostile inputs (garbage, one
very long line, deep or unclosed parentheses, an unclosed `/*`, unterminated strings, binary bytes,
joined preprocessor lines and more) may at most triple their parse time when their size doubles, and
a one-character edit in a large file may cost at most half a full parse.

The unit tests also enforce the repository rules: ASCII only, LF line endings, a final newline and
an SPDX license line in every hand-written source file.

CI runs `deno task test` and `deno task sanitize` in the same container for every push and for pull
requests from forks.

## Performance

Measured with `deno task bench` on 600 KB inputs (tree-sitter 0.27, median of seven runs):

| Grammar       | Parse   | One-character edit | Highlight query | States | parser.c |
| ------------- | ------- | ------------------ | --------------- | ------ | -------- |
| asm_auto      | 57.4 ms | 14.3 ms            | 35.5 ms         | 137    | 161 KB   |
| asm_arm       | 49.9 ms | 9.9 ms             | 30.3 ms         | 135    | 157 KB   |
| asm_arm_apple | 51.4 ms | 11.0 ms            | 30.7 ms         | 135    | 157 KB   |
| asm_x86_gas   | 59.5 ms | 14.7 ms            | 35.8 ms         | 135    | 159 KB   |
| asm_x86_nasm  | 53.5 ms | 17.3 ms            | 30.7 ms         | 87     | 85 KB    |

What keeps it there:

- The grammar declares no `word` token. tree-sitter reuses a `word` token only in the exact parse
  state it was built in, so with one declared almost every line after an edit was lexed again; an
  edit cost 56 to 105% of a full parse, now 20 to 33%.
- Hidden helper rules are inlined (`_line_content`, `_statement`, `_operand`, `_symbol`,
  `_statement_group`), which saved 6 to 16% of parse time for 7% more parser. Inlining `_expression`
  or `_statements` too would be faster but grows the parse tables by more than a fifth.
- Local labels are a node rather than a regular-expression predicate in the queries, which saved 10%
  of highlight time on label-dense code such as compiler output.
- A missing expression is one more alternative of `_expression`, so every operator, `(`, `#` and `$`
  share one parse state for it. Writing it into each of those rules cost 17% more states and 10%
  more parser for the same trees.
- The scanner keeps no state, allocates nothing, never asks for the column and reads at most to the
  end of the line. It accounts for about 3% of parse time.

Error recovery is slower than parsing valid code (0.4 to 2 MB/s on garbage against about 10 MB/s)
but stays linear. It is slowest in NASM, whose identifiers may start with `?` and contain `#`, `@`,
`~` and `$`, so recovery keeps finding plausible statement starts inside garbage.

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
