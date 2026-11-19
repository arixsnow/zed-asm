# Asm

A [Zed](https://zed.dev) extension for ARM and x86 assembly. Each grammar follows the dialect of the
assemblers it covers.

## Languages

| Language             | Covers                                                        | File types                    |
| -------------------- | ------------------------------------------------------------- | ----------------------------- |
| Assembly             | ARM and x86 in GNU syntax                                     | `.s` `.S` `.sx`               |
| ARM Assembly         | AArch64 and AArch32 (A32 and Thumb), for GNU as and clang     | set per file or project       |
| ARM Assembly (Apple) | Apple arm64, where `;` starts a comment                       | set per file or project       |
| x86 Assembly (GAS)   | x86 in GNU syntax, AT&T or Intel flavor, for GNU as and clang | set per file or project       |
| x86 Assembly (NASM)  | x86 in NASM syntax, for nasm and yasm                         | `.asm` `.ASM` `.nasm` `.yasm` |

Assembly reads both architectures. Each other language reads one dialect exactly. The dialects
differ in a few characters, such as `;`, which starts a comment on Apple platforms and separates
statements in GNU as.

To set a language for a file type, add it to `settings.json`:

```json
{ "file_types": { "ARM Assembly": ["s", "S"] } }
```

A modeline on the first line, `// -*- mode: arm -*-` or `// vim: ft=arm`, sets it for one file. The
names each language accepts are listed in [docs/languages.md](docs/languages.md).

Uninstall the older `assembly` extension. It also claims `.s` files.

Syntax the grammars do not read parses as an error confined to its own line. The rest of the file
keeps its highlighting and outline.

## Roadmap

| Milestone       | Status        | Adds                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foundation      | done          | Five languages for ARM and x86. Comments, `#` immediates and `@` relocations read per dialect. C preprocessor lines, highlighting, comment continuation and label indentation. Typing never breaks later lines.                                                                                                                                                                                   |
| Structure       | done          | Outline and breadcrumbs of functions with their local labels, macros and named constants. Vim text objects for functions, macros and comments. Indentation of `.macro`, `.if` and `.rept` blocks as you type. Numeric labels `1:` and `b 1b`. Full GNU directive forms. C colors in `#if` conditions.                                                                                             |
| ARM             | done          | Registers of every family, SVE, SME and MVE included. Memory operands like `[x1, #8]!`. Register lists and lanes like `{v0.16b-v3.16b}` and `v1.s[2]`. `:lo12:` and `sym(GOT)` relocations, `=label` literals and condition codes. `.cfi_offset` and `.save` registers and `.req` aliases. Apple `L` labels in operands.                                                                          |
| x86 GAS         | done          | Registers of every family, read by the `.intel_syntax` and `.att_syntax` mode. AT&T memory like `8(%rsp,%rax,4)` and `*` indirect jumps. Intel `dword ptr [rbx]`, `offset sym` and `4 shl 2`. Prefixes like `rep movsb` and `{vex}`. AVX-512 decorators like `{k1}{z}`. Quoted names like `"a b"`. C macro calls like `PER_CPU_VAR(x)` and `L(loop):` in `.S` files.                              |
| NASM            | done          | Directives such as `section`, `bits` and `times`. The `%` preprocessor with `%define` and `%assign`, and `%macro`, `%if` and `%rep` blocks. Macro calls like `[GOTOFF(eax, PW_ONE)]`, local labels like `%%loop` and names glued with `%+`. `struc` and `istruc` blocks. Memory like `[rbx+rcx*4+8]` and `wrt ..plt`. Data lists like `db 2 dup (0)`. Outline, breadcrumbs and block indentation. |
| Hardening       | this release  | The pinned Linux, glibc and FFmpeg sources parse without errors. CI checks them and the parse-cost budgets on every push.                                                                                                                                                                                                                                                                         |
| Release         | next          | The stable release with snippets, screenshots and a listing in the Zed extension registry.                                                                                                                                                                                                                                                                                                        |
| RISC-V and MIPS | after release | A RISC-V and a MIPS language with registers like `x0`, `a0` and `$t0`, `%hi()` and `%lo()` relocations and memory operands like `8(sp)`. Not part of Assembly, where `$t0` reads as an x86 immediate.                                                                                                                                                                                             |

## Development

All tools run in a Podman container built from `Containerfile`. The host needs `podman` and `git`.
The image pins tree-sitter 0.27.0, Bun 1.4.3, TypeScript 7.0.2, oxlint 1.88.0, and dprint 0.63.0
with its four plugins. The C toolchain, the assemblers, ShellCheck, valgrind, and the Perl, Python,
CMake and Ninja that regenerate the keyword tables come from Fedora 45's repositories at build time.
CI rebuilds the image when `Containerfile` changes and on its first run each week, and `scripts/dev`
rebuilds it locally when `Containerfile` changes. The container has no network access. Only the
image build and `scripts/fetch-sources` download.

```sh
scripts/dev bun run test       # every check except the sanitizers
scripts/dev bun run sanitize   # corpus tests and fuzzing under ASan and UBSan
scripts/dev bun run generate   # rebuild languages/, extension.toml and the parsers
scripts/dev bun run bench      # parse, edit and query timings for every grammar
scripts/dev bun run budgets    # record each grammar's parse cost in test/budgets.json
scripts/dev bun run fmt        # dprint and clang-format
scripts/dev bun run            # list every script
scripts/dev                    # a shell inside the toolchain
scripts/zed                    # the docs/qa.md checks in Zed, inside Podman
```

The hand-written sources are `languages.config.cjs`, `queries/`, `tree-sitter/common/`, `scripts/`
and `test/`. `extension.toml`, `languages/`, `tree-sitter/tree-sitter.json`,
`tree-sitter/common/words.h`, `tree-sitter/common/numbers.h` and each grammar's `grammar.js` and
`src/` are generated, and `bun run test` fails when any of them is out of date.
`tree-sitter/common/keywords.h` is generated from the upstream sources
([docs/scanner.md](docs/scanner.md#generated-tables)).

`.git-blame-ignore-revs` lists the commits that change only layout. GitHub's blame view reads it,
and `git blame` reads it with this setting:

```sh
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

`scripts/fetch-sources` fetches the Linux, glibc and FFmpeg files pinned in
`test/examples/sources.gitconfig`. It runs on the host, and `check:examples` parses them.

```sh
scripts/fetch-sources ../references                          # the pinned commits
scripts/fetch-sources --update ../references                 # re-pin to the branch heads
scripts/dev --sources ../references bun run check:examples   # parse them in every language
```

`scripts/zed` runs the editor checks of [docs/qa.md](docs/qa.md) in Zed inside Podman, on the
uncommitted tree. To install a change in your own Zed, push it, run
`scripts/dev bun run set-grammar-rev <pushed commit>`, push again, then use **Extensions > Install
Dev Extension** on a local clone.

[docs/README.md](docs/README.md) lists the pages on the grammars, the scanner, the editor behavior
and the checks.

## License

MIT. See [LICENSE](LICENSE).
