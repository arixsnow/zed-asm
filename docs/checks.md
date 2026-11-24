# Checks

The tooling is TypeScript run by Bun, and the scripts in `package.json` are its commands.

## Environment

Every command runs in a container that `scripts/dev` and `scripts/zed` start with `--network=none`,
so no check, test or script reaches the network. Only the image build and `scripts/fetch-sources`,
which run on the host, download anything. The image pins Bun, its npm tools and dprint with its
plugins, and `bunfig.toml` turns off Bun's automatic package installs, so importing a package the
image lacks fails at once.

`scripts/dev --sources DIR` also mounts DIR read-only at `/sources`, for the commands that read
upstream sources and the examples. Podman relabels a tree mounted with `z` for SELinux, rewriting
the label of every file in it on each run, so that container runs with
`--security-opt label=disable` instead and DIR stays untouched. `test/unit/commands.test.ts`
requires a row in the command table for every script, `--network=none` as the only network option of
both launchers, and a read-only `/sources` mount that is never relabeled.

## Style

All hand-written code and configuration, and what the generators write, is indented with four
spaces. Only test data keeps hard tabs, and `.editorconfig` tells editors the same.

| Tool         | Checks                                                                                                                                                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| dprint       | TypeScript, JavaScript, JSON, Markdown and YAML at 100 columns, with single quotes and braces on every block                                                                                                                     |
| clang-format | the C by `.clang-format`, with 100 columns, a function's brace on its own line, a line break before a binary operator, one `&&` or `\|\|` operand per line once a condition breaks, and aligned macros                           |
| oxlint       | every correctness rule of its eslint, typescript, unicorn, oxc and import plugins, and the further rules in `.oxlintrc.json`, among them `curly`, `eqeqeq` and `import/extensions` (the file extension in every relative import) |
| `tsc`        | every TypeScript file in `scripts/` and `test/` with `strict`, the unused-name, switch-fallthrough and `override` checks, and the type packages (`skipLibCheck` off)                                                             |

clang-format 23 is the first to read the per-operator `BreakBinaryOperations` setting. In oxlint a
disable comment that hides nothing is an error. dprint keeps Markdown line breaks as written, and a
unit test enforces the width ([Repository rules](#repository-rules)).

## Commands

| Command                   | What it does                                                                                                                                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bun run test`            | every check except the sanitizers (formatting, lint, types, generated files and parsers up to date, unit and performance tests, C checks, shell checks, corpus tests, queries, fixtures)                                                                                                         |
| `bun run build`           | writes the files generated from `languages.config.cjs`, `queries/`, `keywords.h` and `lexical.js`                                                                                                                                                                                                |
| `bun run generate`        | runs `build`, then regenerates all five parsers                                                                                                                                                                                                                                                  |
| `bun run set-grammar-rev` | pins the commit Zed fetches the grammars from (`bun run set-grammar-rev <sha>`) and runs `build`                                                                                                                                                                                                 |
| `bun run keywords`        | regenerates `tree-sitter/common/keywords.h` from the upstream sources at `/sources` (`scripts/dev --sources DIR`, see [scanner.md](scanner.md#generated-tables)), not a check                                                                                                                    |
| `bun run fmt`             | formats with dprint, and the C scanner with clang-format                                                                                                                                                                                                                                         |
| `bun run lint`            | oxlint                                                                                                                                                                                                                                                                                           |
| `bun run check:types`     | `tsc` on every TypeScript file                                                                                                                                                                                                                                                                   |
| `bun run check:generated` | fails if a generated file or parser differs from what the build and `tree-sitter generate` write                                                                                                                                                                                                 |
| `bun run check:c`         | clang-format, GCC and clang with strict warnings as errors, both static analyzers, clang-tidy, that `scanner.h` rejects zero or two dialect macros, that each dictionary finds every word and no other (`test/c/words.c`), and that each grammar built to wasm imports only what Zed supplies    |
| `bun run check:shell`     | shellcheck, with every optional check, on every script with a shell shebang                                                                                                                                                                                                                      |
| `bun run check:queries`   | compiles every generated query against its grammar                                                                                                                                                                                                                                               |
| `bun run check:fixtures`  | every fixture, and a CRLF and a no-final-newline copy of it, assembles with the real toolchains, and every fixture parses without errors                                                                                                                                                         |
| `bun run check:examples`  | every file of every file set in `test/examples/sources.gitconfig` parses without an error in each of its languages outside the never-taken branches of a `[group]` guard, from the clones at `/sources` (`scripts/dev --sources DIR`), and `--summary` counts every error line by its first word |
| `bun run test:unit`       | the unit, highlight, tree, typing and structure tests in parallel, then the performance tests alone                                                                                                                                                                                              |
| `bun run corpus`          | composes each grammar's corpus tests from `test/corpus/`                                                                                                                                                                                                                                         |
| `bun run test:corpus`     | runs `corpus`, then the corpus tests of all five grammars                                                                                                                                                                                                                                        |
| `bun run sanitize`        | corpus and fuzzing against parsers built with AddressSanitizer and UndefinedBehaviorSanitizer                                                                                                                                                                                                    |
| `bun run budgets`         | measures each grammar's parse cost with callgrind and writes it to `test/budgets.json` with the states and parser size, not a check                                                                                                                                                              |
| `bun run check:budgets`   | measures the baseline tree at DIR and this tree in the same image and fails on any cost change `test/budgets.json` does not declare (`bun run check:budgets DIR`)                                                                                                                                |
| `bun run bench`           | prints parse, edit and query times, states and parser size for every grammar, not a check                                                                                                                                                                                                        |
| `bun run zed:qa`          | the `docs/qa.md` checks, which `scripts/zed` runs in the container that holds Zed and a display                                                                                                                                                                                                  |
| `scripts/zed`             | the `docs/qa.md` checks in the real Zed app, in Podman on a virtual display                                                                                                                                                                                                                      |
| `scripts/fetch-sources`   | fetches the examples pinned in `test/examples/sources.gitconfig` into a directory, on the host (`--update DIR` first moves each pin to its branch head), not a check                                                                                                                             |

## Zed

`scripts/zed` builds the `zed` stage of the Containerfile, with Xvfb, xdotool, Mesa's software
Vulkan, and Zed from its official install script, always the latest release. It compiles each
grammar to wasm with the flags the tree-sitter CLI uses, installs the result as an ordinary
extension folder and drives Zed with keystrokes. Each check compares the saved file, or what a step
copied, read with xclip. The vim checks run last, after vim mode is turned on in the settings. The
network is off, and each run starts from an empty Zed profile. The files Zed opens live in the
container's home, outside the repository, so Zed never reads the repository's git data. The run
prints each result as it finishes, records a check that throws as failed and continues, and keeps
the Zed log either way.

Zed loads every grammar as wasm through tree-sitter's wasm runtime. The runtime supplies 25 C
library functions only (`malloc`, `memcmp`, `strlen`, `towlower` and the like, listed in
`lib/src/wasm-stdlib/imports.txt` at the tree-sitter revision Zed pins). A grammar that calls any
other, such as `strchr`, fails to load, and Zed opens its files with no language.
`scripts/lib/wasm.ts` reads the import section of each built module and holds that list, and
`check:c` and `scripts/zed` both refuse a module that imports anything else.

## Examples

`test/examples/sources.gitconfig` pins the examples. For each source it holds a URL, branch and
commit, and for each file set a source, `include` and `exclude` globs and the languages that parse
it. `scripts/lib/examples.ts` parses the pin file and rejects what git would read differently
(quotes, escapes, `#` or `;` in a value, upper-case names, repeated sections).

`scripts/fetch-sources DIR` runs on the host with `sh` and `git`. Per source it fetches the pinned
commit into `DIR/<source>` with `--depth 1 --filter=blob:none` and a non-cone sparse checkout of the
`include` globs, 22 MB for all three. With nothing changed it does nothing, and `--update` first
moves each pin to its branch head. It checks the whole pin file before writing anything, and refuses
a `DIR/<source>` that is not a sparse checkout of the pinned URL. Sparse patterns are
last-match-wins across file sets, so `bun run check:examples` applies the excludes.

`bun run check:examples` first checks each clone against the pins. Its HEAD is the pinned commit,
its sparse patterns are the includes, every checked-out file matches an include and every include
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
close runs to the line end, as in clang's assembler mode. A branch whose condition tests only a
listed guard's definition (`#ifdef`, `#elifdef`, `#if defined(G)`) is never taken, and so are the
branches after one that tests its absence (`#ifndef`, `#if !defined G`). Error lines inside a
never-taken branch are expected, and the report counts them. Every other error line still fails its
file.

| Section                        | Guard              | Text                                          |
| ------------------------------ | ------------------ | --------------------------------------------- |
| `[group "glibc SVML layouts"]` | `__svml_*_typedef` | the C layouts of glibc's x86 SVML data tables |

The check stops when `verified` is not the pinned commit, when a checked-out file defines a guard
(`#define`, `#undef` or a `-D` flag), and when the guards guard no group. After `--update` moves a
pin, the guards are searched in the whole tree at the new commit, a full clone at that revision
(`git clone --depth 1 --revision=COMMIT URL DIR`), before `verified` is set to it.

## Budgets

`bun run budgets` measures each grammar's parse of its two bench inputs, `basics` and the fixtures
joined, under callgrind's cache simulation. It writes the cost to `test/budgets.json` with the
states, the parser.c size and a hash of each input. The cost is estimated cycles, L1 hits plus 5
times LL hits plus 35 times RAM accesses. Callgrind collects inside `ts_parser_parse` only, with a
fixed cache model (32 KiB 8-way L1 caches, a 16 MiB 16-way LL, 64 B lines) and `LD_BIND_NOW=1`,
which keeps dynamic linking outside. Each library and input is copied to one fixed path first,
because a longer path moves the buffers and with them the cache misses. The same parser on the same
input then repeats its count exactly.

The count still moves with the image's compilers and glibc, which CI rebuilds weekly, so the check
compares within one image. `bun run check:budgets DIR` measures the baseline tree at DIR and this
one. Each change in cost must match the change `test/budgets.json` declares between the two, within
1 point plus a tenth of the declared change. An undeclared speedup fails as a slowdown does, so the
declared costs stay exact. An input the baseline declares no cost for, or measured with other text,
has no baseline and passes. The states, parser.c size and input hashes are the same anywhere, and a
unit test requires them to match the tree. Another fails when a `parser.c` is compiled with
optimization off ([performance.md](performance.md#rules)). CI exports the push's previous head, or
a pull request's base, with `git archive`. Locally,
`git archive HEAD | tar -x -C .build/budgets-baseline` gives the last commit.

## Fixtures

The fixtures live in `test/fixtures/<dialect>/`, and every assembler of the dialect must accept each
file there. Forms that only one assembler accepts, such as `.eqv` and `0f1.5` in GNU as or
`.endmacro` and `0x1.8p0` in clang, go in a subdirectory named after that assembler (`gas/`,
`clang/`, `nasm/`, `yasm/`), and only that assembler runs on them. `.S` files go through clang
alone, which runs the C preprocessor.

The x86-64 AT&T, AArch64 and Apple arm64 fixtures hold every form the grammar reads, each in every
dialect whose assemblers accept it. The Intel and NASM fixtures add labels and blocks in their own
notation. Each ARM dialect has an `operands.s` with its operand forms, role-table collisions,
relocations and register directives, and `.arch` lines turn on SVE and SME in the AArch64 files.
`t32-gnu/mve.s` covers MVE.

## Grammar tests

The highlight tests run `tree-sitter query --captures` and apply Zed's two rules. A character takes
the last capture that covers it, and the scope at a cursor comes from the smallest capture that
contains it (edges count only for `.inclusive` captures). Offsets are compared in bytes, as
tree-sitter reports them. tree-sitter's own highlight tests use another rule.

The tree tests compare parse trees. UTF-8 text must parse exactly like ASCII text of the same kind,
and every fixture must parse the same with CRLF line endings and without its final newline. A parse
counts as clean only if tree-sitter never entered error recovery, which its debug log shows even
when the recovery left no visible node.

The rejection test is the converse. Syntax that every assembler of a language rejects, such as
`.loc 1, 2, 3`, `1B`, `nop main:` or `.word sym(FOO)`, must parse in that language with an error on
exactly the offending lines. The test reads each file's parse status as well as its tree, because
tree-sitter does not always mark a missing node in the printed tree. Operands that parse with
errors, such as `:lo12:.LC0` in ARM (Apple) or `qword ptr fs:[0x28]` in AT&T mode, must leave the
function around them one label block.

`test/grammar/numbers.test.ts` reads every number form of each syntax in a data directive, with
joins inside the number, and requires one `integer`, `float` or `numeric_label`, or an error.
`test/unit/numbers.test.ts` checks the number table of each token against JavaScript's `RegExp` on
the same form, and that the build refuses a form outside the subset it reads.

`test/grammar/keywords.test.ts` checks that no grammar has a word token or a case-insensitive token
([arm.md](arm.md#keywords)). The typing and closing tests are in
[grammar.md](grammar.md#open-constructs).

## Structure tests

The structure tests replay typing in `test/lib/zed.ts`, a model of what Zed's editor does with this
extension's settings and queries. It covers autoindent for the one row that Enter or a keystroke
re-indents (after Zed's `suggest_autoindents` and `compute_autoindents`), Enter with comment
continuation, the `/*` prefix and the closing indent of a block comment, and bracket auto-close. The
model knows the Zed features the generated configs and queries use, and refuses a config or query
that uses any other. Zed finds the closing indent of a block comment through the node around its
`*/`. In these grammars that node is always the comment token the overrides query captures, and the
model takes that capture. It reads scopes from the assembly layer only, because the C layer inside
`#if` conditions needs tree-sitter-c, which the toolchain does not include. Each case types code key
by key and compares the text Zed would show.

Two more tests hold the indent pattern. One parses the generated opener lines in each language, and
requires the pattern to agree with the parser on each. The cases that parse with an error are not
compared, and their number per grammar is fixed. The other runs the patterns through tree-sitter,
whose `#match?` uses the regex engine Zed uses, and requires the same answers.

The same model builds the outline (items, their text and nesting, and the comment annotation Zed
attaches), the breadcrumbs at a cursor and the vim text objects `af`, `if`, `ac`, `ic` and `gc`,
after Zed's `outline_items_containing`, `symbols_containing` and vim's `text_object`. Cases cover
every language.

A compiler-output test compiles `test/structure/sample.c` at test time with GCC and clang for x86-64
(AT&T and `-masm=intel`), i386, AArch64, ARM and Thumb, and with clang for Apple x86-64 and Apple
arm64, at `-O0`, `-O2` and `-O2 -g`. It parses each result in every language that reads it, and
derives the expected outline from the assembly text with the assemblers' rules. Every symbol owns
the lines up to the next one, and a temporary label (`.L` in ELF, `L` in Apple arm64) or an assigned
name belongs to the symbol above it. Apple x86-64's `L` labels are ordinary labels, as the x86
languages read them ([x86.md](x86.md#limits)). The outline must match exactly. Jump tables that GCC
puts in `.rodata` in the middle of a function must stay inside it. A second test parses the same
output in every language that reads it and requires no error.

The sample adds a thread-local variable, a conditional select and a loop that vectorizes, so the
output holds TLS relocations, `sym(TPOFF)`, `.save`, `.cfi_offset`, `.loh` and vector register
lists. Both Apple targets name macOS 11 (`-apple-macos11`), because clang refuses thread-local
storage without a version. The dev image carries GCC for AArch64 (`gcc-aarch64-linux-gnu`) and for
bare-metal ARM (`arm-none-eabi-gcc-cs`) for this test.

## Performance tests

The performance tests compare timings taken on the same machine, so they hold on any computer. When
its size doubles, an input may at most triple its time. That covers these inputs:

- garbage, one very long line, deep or unclosed parentheses, an unclosed `/*`, unterminated strings
  and binary bytes
- joined preprocessor lines, nested, unclosed and broken blocks, thousands of clauses, glued macro
  arguments, long parameter and `.irp` lists and stray labels
- in NASM, unclosed `%if` lines, a long `%define` value, macro-local labels, `%+` glues with and
  without blanks, a long call statement, nested argument groups and braces, and words before an
  operand
- every query of every language on one function, macro, `.if` or `.rept` body
- a line of any printable character repeated, alone, before a blank or before a letter, in every
  grammar. A character whose time grows more than 2.5 times when its line doubles is measured again
  before it fails.

A one-character edit may cost at most half a full parse, in the middle of a large file, inside one
large block, and typed at the end of a file inside an open block. An edit in the middle of a file
must also lex the same number of tokens when the file holds twice as many functions, at the top
level and inside a block.

## Repository rules

The unit tests enforce these rules on every repository file:

- ASCII only, LF line endings and a final newline
- hard tabs only in test data
- prose lines of at most 100 columns in Markdown, tables and fenced code blocks excepted
- an SPDX license line in the first two lines of every hand-written C, JavaScript, TypeScript, query
  and shell file. Config and data files carry none.

## CI

CI runs `bun run test`, `bun run sanitize`, `bun run check:budgets` and `bun run check:examples`
in that order, in one container, for every push and for pull requests from forks. Building the
3.0 GB image compiles tree-sitter and dprint from source, so CI saves it in the Actions cache under
the image tag and the ISO week (`scripts/dev --image` prints the tag, a hash of the Containerfile).
CI loads it instead of building until the Containerfile changes or the week ends, so Fedora's
package updates reach CI within a week. The example clones are cached under a hash of the pin file
and `scripts/fetch-sources`. When no entry matches, CI fetches them with `scripts/fetch-sources` and
saves them before the check runs.

The unit tests run their files in parallel, except the performance tests, which run alone
afterwards, because they compare timings. Compiled parsers are cached in `.build/lib` of their tree
under a hash of their sources and the tree-sitter version, so the test, query and fixture checks
build each grammar once.
