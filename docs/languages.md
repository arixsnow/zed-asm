# Languages

This repository builds a Zed extension for ARM and x86 assembly. It has five languages, built from
one manifest and one set of grammar modules ([grammar.md](grammar.md)).

| Language (Zed picker) | Grammar         | Modules             | Suffixes                  | Modeline aliases                           | Comment prefix |
| --------------------- | --------------- | ------------------- | ------------------------- | ------------------------------------------ | -------------- |
| Assembly              | `asm_auto`      | core, gas, arm, x86 | `s` `S` `sx`              | `asm` `gas` `assembly`                     | `//`           |
| ARM Assembly          | `asm_arm`       | core, gas, arm      | none                      | `arm` `arm64` `aarch64` `aarch32` `thumb`  | `//`           |
| ARM Assembly (Apple)  | `asm_arm_apple` | core, gas, arm      | none                      | `arm64-apple` `apple-arm64` `darwin-arm64` | `//`           |
| x86 Assembly (GAS)    | `asm_x86_gas`   | core, gas, x86      | none                      | `x86` `x86_64` `x64` `amd64` `i386`        | `//`           |
| x86 Assembly (NASM)   | `asm_x86_nasm`  | core, nasm, x86     | `asm` `ASM` `nasm` `yasm` | `nasm` `yasm`                              | `;`            |

Assembly reads ARM and x86 code in GNU syntax and needs no selection. The other four languages are
exact. Each one follows the assemblers of one architecture and one dialect:

| Language    | Reads                                                         |
| ----------- | ------------------------------------------------------------- |
| ARM         | AArch64 and AArch32 for GNU as and clang on ELF               |
| ARM (Apple) | arm64 for Apple's clang, where `;` starts a comment           |
| x86 (GAS)   | x86 in GNU syntax, AT&T or Intel flavor, for GNU as and clang |
| x86 (NASM)  | x86 in NASM syntax, for nasm and yasm                         |

Toggle comment inserts the comment prefix and a space.

## Terms

The other pages use these terms:

| Term                                              | Meaning                                                                                                    |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| architecture                                      | ARM (AArch64, and AArch32 with its A32 and Thumb instruction sets) or x86 (x86-64 and i386)                |
| GNU syntax                                        | the syntax GNU as and clang read, for x86 in its AT&T or Intel flavor                                      |
| NASM syntax                                       | the syntax nasm and yasm read                                                                              |
| dialect                                           | the rules one group of assemblers adds to a syntax (GNU as and clang on ELF, Apple's clang, nasm and yasm) |
| GNU as, clang, nasm, yasm                         | the assemblers, by program name (GCC is the compiler)                                                      |
| Assembly, ARM, ARM (Apple), x86 (GAS), x86 (NASM) | the five languages, short for their names in Zed's picker                                                  |
| exact languages                                   | every language except Assembly                                                                             |
| GNU-syntax languages                              | Assembly, ARM, ARM (Apple) and x86 (GAS)                                                                   |

## Selecting a language

Zed picks the language by file suffix. A `.s`, `.S` or `.sx` file opens as Assembly, and a `.asm`,
`.ASM`, `.nasm` or `.yasm` file opens as x86 (NASM). `.sx` is GCC's suffix for assembly that the C
preprocessor reads first. `.inc` is not claimed, because PHP, Pascal and BitBake use it too.

A modeline on the first line selects the language of one file. It takes the aliases in the table
above:

```text
// -*- mode: arm -*-
// vim: ft=arm
```

A `file_types` entry in `settings.json` selects a language for a suffix:

```json
{ "file_types": { "ARM Assembly": ["s", "S"] } }
```
