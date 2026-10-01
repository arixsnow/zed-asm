# Asm

A [Zed](https://zed.dev) extension for ARM and x86 assembly, with grammars that know each
assembler's dialect.

## Languages

| Language             | Covers                                    | Used for                      |
| -------------------- | ----------------------------------------- | ----------------------------- |
| Assembly             | ARM and x86 in GNU as or LLVM syntax      | `.s` `.S` `.sx`               |
| ARM Assembly         | AArch64 and AArch32/Thumb, GNU as or LLVM | chosen per file or project    |
| ARM Assembly (Apple) | Apple arm64, where `;` starts a comment   | chosen per file or project    |
| x86 Assembly (GAS)   | AT&T and Intel syntax, GNU as or LLVM     | chosen per file or project    |
| x86 Assembly (NASM)  | NASM and YASM                             | `.asm` `.ASM` `.nasm` `.yasm` |

Assembly handles both architectures without any setup. The other languages follow one dialect
exactly, which matters for the few characters the dialects disagree on. On Apple platforms `;`
starts a comment; with GNU as it separates two statements.

To use one for a whole project, add this to `.zed/settings.json`:

```json
{ "file_types": { "ARM Assembly": ["s", "S"] } }
```

For a single file, put a modeline at the top, such as `// vim: ft=arm` or `; vim: ft=nasm`.

If the older `assembly` extension is installed, uninstall it so the two do not both claim `.s`
files.

This is an early release. Syntax that is not parsed yet, such as memory operands and NASM
directives, shows up as an error, but an error never spreads past its own line, so the rest of the
file keeps its colors and its outline. The roadmap lists what comes next.

## Roadmap

| Milestone       | Status       | What it adds                                                                                                                                                                                                                                                                                         |
| --------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foundation      | done         | five languages; comments, `#` immediates and `@` relocations read per dialect; C preprocessor lines; highlighting; comment continuation; label indentation; typing never breaks later lines                                                                                                          |
| Structure       | this release | outline and breadcrumbs of functions with their local labels, macros and named constants; vim text objects for functions, macros and comments; indentation of `.macro`, `.if` and `.rept` blocks as you type; numeric labels `1:` and `b 1b`; full GNU directive forms; C colors in `#if` conditions |
| ARM             | next         | registers, memory operands like `[x1, #8]!`, `:lo12:` relocations, `=label` literals, register lists, vector arrangements like `v0.16b`, condition codes, Apple `L` labels in operands                                                                                                               |
| x86 GAS         | planned      | AT&T memory like `8(%rsp,%rax,4)`, `*` indirect jumps, Intel `dword ptr [rbx]`, `.intel_syntax` switching, AVX-512 masks like `{k1}{z}`, prefixes like `rep movsb`, C macro calls like `FOO(1)` in `.S` operands                                                                                     |
| RISC-V and MIPS | planned      | a RISC-V and a MIPS language: registers like `x0`, `a0` and `$t0`, `%hi()` and `%lo()` relocations, memory operands like `8(sp)`; not part of Assembly, where `$t0` would read as an x86 immediate                                                                                                   |
| NASM            | planned      | directives such as `section`, `bits` and `times`, the `%` preprocessor, `%macro`, `%if`, `%rep`, `struc` and `istruc` blocks, `$` and `$$`                                                                                                                                                           |
| Hardening       | planned      | Linux, glibc and FFmpeg sources parse without errors; benchmark budgets checked in CI                                                                                                                                                                                                                |
| Release         | planned      | snippets, screenshots, a listing in the Zed extension registry                                                                                                                                                                                                                                       |

## Development

Everything runs in a Podman container built from `Containerfile`, so your machine only needs
`podman` and `git`. The container pins tree-sitter 0.27.0 and Deno 2.9.7 exactly. The C toolchain
and the assemblers come from Fedora 44's repositories as they are when the image is built: CI builds
it fresh on every run, and `scripts/dev` rebuilds it locally whenever the Containerfile changes.

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
