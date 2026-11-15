# Asm

A [Zed](https://zed.dev) extension for ARM and x86 assembly. Each grammar follows the dialect of
the assemblers it covers.

## Languages

| Language             | Covers                                                        | File types                       |
| -------------------- | ------------------------------------------------------------- | -------------------------------- |
| Assembly             | ARM and x86 in GNU syntax                                     | `.s` `.S` `.sx`                  |
| ARM Assembly         | AArch64 and AArch32 (A32 and Thumb), for GNU as and clang     | none; chosen per file or project |
| ARM Assembly (Apple) | Apple arm64, where `;` starts a comment                       | none; chosen per file or project |
| x86 Assembly (GAS)   | x86 in GNU syntax, AT&T or Intel flavor, for GNU as and clang | none; chosen per file or project |
| x86 Assembly (NASM)  | x86 in NASM syntax, for nasm and yasm                         | `.asm` `.ASM` `.nasm` `.yasm`    |

Assembly reads both architectures. Each other language reads one dialect exactly; the dialects
differ in a few characters, such as `;`, which starts a comment on Apple platforms and separates
statements in GNU as.

To set a language for a file type, add it to `settings.json`:

```json
{ "file_types": { "ARM Assembly": ["s", "S"] } }
```

To set it for one file, put a modeline on the first line: `// -*- mode: arm -*-`, or
`// vim: ft=arm`. The names each language accepts are listed under Languages in
[docs/architecture.md](docs/architecture.md#languages).

Uninstall the older `assembly` extension; it also claims `.s` files.

Syntax the grammars do not read parses as an error confined to its own line; the rest of the file
keeps its highlighting and outline.

## Roadmap

| Milestone       | Status        | Adds                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Foundation      | done          | five languages for ARM and x86; comments, `#` immediates and `@` relocations read per dialect; C preprocessor lines; highlighting; comment continuation; label indentation; typing never breaks later lines                                                                                                                                                                                      |
| Structure       | done          | outline and breadcrumbs of functions with their local labels, macros and named constants; vim text objects for functions, macros and comments; indentation of `.macro`, `.if` and `.rept` blocks as you type; numeric labels `1:` and `b 1b`; full GNU directive forms; C colors in `#if` conditions                                                                                             |
| ARM             | done          | registers of every family, SVE, SME and MVE included; memory operands like `[x1, #8]!`; register lists and lanes like `{v0.16b-v3.16b}` and `v1.s[2]`; `:lo12:` and `sym(GOT)` relocations; `=label` literals; condition codes; `.cfi_offset` and `.save` registers; `.req` aliases; Apple `L` labels in operands                                                                                |
| x86 GAS         | done          | registers of every family, read by the `.intel_syntax` and `.att_syntax` mode; AT&T memory like `8(%rsp,%rax,4)` and `*` indirect jumps; Intel `dword ptr [rbx]`, `offset sym` and `4 shl 2`; prefixes like `rep movsb` and `{vex}`; AVX-512 decorators like `{k1}{z}`; quoted names like `"a b"`; C macro calls like `PER_CPU_VAR(x)` and `L(loop):` in `.S` files                              |
| NASM            | this release  | directives such as `section`, `bits` and `times`; the `%` preprocessor with `%define` and `%assign`, and `%macro`, `%if` and `%rep` blocks; macro calls like `[GOTOFF(eax, PW_ONE)]`, local labels like `%%loop` and names glued with `%+`; `struc` and `istruc` blocks; memory like `[rbx+rcx*4+8]` and `wrt ..plt`; data lists like `db 2 dup (0)`; outline, breadcrumbs and block indentation |
| Hardening       | next          | Linux, glibc and FFmpeg sources parse without errors; benchmark budgets checked in CI                                                                                                                                                                                                                                                                                                            |
| Release         | planned       | the stable release: snippets, screenshots, a listing in the Zed extension registry                                                                                                                                                                                                                                                                                                               |
| RISC-V and MIPS | after release | a RISC-V and a MIPS language: registers like `x0`, `a0` and `$t0`, `%hi()` and `%lo()` relocations, memory operands like `8(sp)`; not part of Assembly, where `$t0` reads as an x86 immediate                                                                                                                                                                                                    |

## Development

All tools run in a Podman container built from `Containerfile`; the host needs `podman` and
`git`. The image pins tree-sitter 0.27.0, Bun 1.4.3, TypeScript 7.0.2, oxlint 1.88.0, and dprint
0.63.0 with its four plugins. The C toolchain, the assemblers, ShellCheck, valgrind, and the Perl,
Python, CMake and Ninja that regenerate the keyword tables come from Fedora 45's repositories at
build time. CI rebuilds the image when `Containerfile` changes and on its first run each week;
`scripts/dev` rebuilds it locally when `Containerfile` changes. The container has no network
access; only the image build and `scripts/fetch-sources` download.

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

Hand-written sources: `languages.config.cjs`, `queries/`, `tree-sitter/common/`, `scripts/` and
`test/`. Generated: `extension.toml`, `languages/`, `tree-sitter/tree-sitter.json`,
`tree-sitter/common/words.h`, and each grammar's `grammar.js` and `src/`; `bun run test` fails when
any of them is out of date. `tree-sitter/common/keywords.h` is generated from the upstream sources
(see Generated tables in [docs/architecture.md](docs/architecture.md)).

`.git-blame-ignore-revs` lists the commits that change only layout. GitHub's blame view reads it;
`git blame` reads it after this command, once per clone:

```sh
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

`scripts/fetch-sources` fetches the Linux, glibc and FFmpeg files pinned in
`test/real-code/sources.gitconfig`. It runs on the host:

```sh
scripts/fetch-sources ../references            # the pinned commits
scripts/fetch-sources --update ../references   # move each pin to its branch head, then fetch
```

`scripts/zed` runs the editor checks of [docs/qa.md](docs/qa.md) in Zed inside Podman, on the
uncommitted tree. To install a change in your own Zed: push it, run
`scripts/dev bun run set-grammar-rev <pushed commit>`, push again, then use **Extensions > Install
Dev Extension** on a local clone.

[docs/architecture.md](docs/architecture.md) describes how the grammars are built.

## License

MIT. See [LICENSE](LICENSE).
