# Asm

A [Zed](https://zed.dev) extension for ARM and x86 assembly, with grammars that know each
assembler's dialect.

## Languages

The extension covers two architectures, ARM and x86, in the syntax of the assemblers that read
them. Zed lists them as five languages:

| Language             | Covers                                                        | Used for                      |
| -------------------- | ------------------------------------------------------------- | ----------------------------- |
| Assembly             | ARM and x86 in GNU syntax                                     | `.s` `.S` `.sx`               |
| ARM Assembly         | AArch64 and AArch32 (A32 and Thumb), for GNU as and clang     | chosen per file or project    |
| ARM Assembly (Apple) | Apple arm64, where `;` starts a comment                       | chosen per file or project    |
| x86 Assembly (GAS)   | x86 in GNU syntax, AT&T or Intel flavor, for GNU as and clang | chosen per file or project    |
| x86 Assembly (NASM)  | x86 in NASM syntax, for nasm and yasm                         | `.asm` `.ASM` `.nasm` `.yasm` |

Assembly handles both architectures without any setup. The other languages follow one dialect
exactly, which matters for the few characters the dialects disagree on. On Apple platforms `;`
starts a comment; with GNU as it separates two statements.

To use one by default, add this to `settings.json`:

```json
{ "file_types": { "ARM Assembly": ["s", "S"] } }
```

For a single file, put a modeline on its first line: `// -*- mode: arm -*-`, or the Vim form
`// vim: ft=arm`. The names each language answers to are listed under Languages in
[docs/architecture.md](docs/architecture.md#languages).

If the older `assembly` extension is installed, uninstall it so the two do not both claim `.s`
files.

This is an early release. Syntax that is not parsed yet, such as x86 memory operands and NASM
directives, shows up as an error, but an error never spreads past its own line, so the rest of the
file keeps its colors and its outline. The roadmap lists what comes next.

## Roadmap

| Milestone       | Status       | What it adds                                                                                                                                                                                                                                                                                                      |
| --------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foundation      | done         | five languages for ARM and x86; comments, `#` immediates and `@` relocations read per dialect; C preprocessor lines; highlighting; comment continuation; label indentation; typing never breaks later lines                                                                                                       |
| Structure       | done         | outline and breadcrumbs of functions with their local labels, macros and named constants; vim text objects for functions, macros and comments; indentation of `.macro`, `.if` and `.rept` blocks as you type; numeric labels `1:` and `b 1b`; full GNU directive forms; C colors in `#if` conditions              |
| ARM             | this release | registers of every family, SVE, SME and MVE included; memory operands like `[x1, #8]!`; register lists and lanes like `{v0.16b-v3.16b}` and `v1.s[2]`; `:lo12:` and `sym(GOT)` relocations; `=label` literals; condition codes; `.cfi_offset` and `.save` registers; `.req` aliases; Apple `L` labels in operands |
| x86 GAS         | next         | AT&T memory like `8(%rsp,%rax,4)`, `*` indirect jumps, Intel `dword ptr [rbx]`, `.intel_syntax` switching, AVX-512 masks like `{k1}{z}`, prefixes like `rep movsb`, C macro calls like `FOO(1)` in `.S` operands                                                                                                  |
| RISC-V and MIPS | planned      | a RISC-V and a MIPS language: registers like `x0`, `a0` and `$t0`, `%hi()` and `%lo()` relocations, memory operands like `8(sp)`; not part of Assembly, where `$t0` would read as an x86 immediate                                                                                                                |
| NASM            | planned      | directives such as `section`, `bits` and `times`, the `%` preprocessor, `%macro`, `%if`, `%rep`, `struc` and `istruc` blocks, `$` and `$$`                                                                                                                                                                        |
| Hardening       | planned      | Linux, glibc and FFmpeg sources parse without errors; benchmark budgets checked in CI                                                                                                                                                                                                                             |
| Release         | planned      | snippets, screenshots, a listing in the Zed extension registry                                                                                                                                                                                                                                                    |

## Development

Everything runs in a Podman container built from `Containerfile`, so your machine only needs
`podman` and `git`. The container pins tree-sitter 0.27.0 and Deno 2.9.7 exactly. The C toolchain,
the assemblers and ShellCheck come from Fedora 44's repositories as they are when the image is
built. CI builds it fresh whenever the Containerfile changes and in the first run of each week,
and reuses that image for the rest of the week; `scripts/dev` rebuilds it locally whenever the
Containerfile changes.

```sh
scripts/dev deno task test       # every check except the sanitizers
scripts/dev deno task sanitize   # corpus tests and fuzzing under ASan and UBSan
scripts/dev deno task generate   # rebuild languages/, extension.toml and the parsers
scripts/dev deno task bench      # parse, edit and query timings for every grammar
scripts/dev deno task fmt        # deno fmt and clang-format
scripts/dev deno task            # list every task
scripts/dev                      # a shell inside the toolchain
scripts/zed                      # the docs/qa.md checks in Zed, inside Podman
```

The hand-written sources are `languages.config.cjs`, `queries/`, `tree-sitter/common/`, `scripts/`
and `test/`. `extension.toml`, `languages/`, `tree-sitter/tree-sitter.json` and each grammar's
`grammar.js` and `src/` are generated, and `deno task test` fails when any of them is out of date.

`scripts/zed` runs the editor checks from [docs/qa.md](docs/qa.md) in Zed inside Podman, on your
uncommitted tree. To install a change in your own Zed, push it, run
`scripts/dev deno task set-grammar-rev <pushed commit>`, push again, then use **Extensions > Install
Dev Extension** on a local clone.

See [docs/architecture.md](docs/architecture.md) for how the grammars fit together.

## License

MIT. See [LICENSE](LICENSE).
