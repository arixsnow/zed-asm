# Checks in Zed

These checks cover what only the editor does: language choice, colors, Enter, toggle comment,
auto-close, word selection, the outline, breadcrumbs, block indentation and vim text objects.
`scripts/zed` runs them in the real Zed app inside Podman, on a virtual display, with nothing
installed on the host. It builds the extension and types each case. Then it saves the file and
compares the text, or reads what a step copied. An outline check picks an entry and types `X` where
the cursor lands, so the saved text shows where the jump went. The vim checks run last, after vim
mode is turned on in the settings. Before Zed starts, each grammar is built to wasm and checked to
import only the C functions tree-sitter's wasm runtime supplies, which Zed loads grammars through.
The run prints each result as it finishes, writes `.build/zed-qa/report.txt` with the Zed log and
one screenshot per check, and keeps going when a check fails.

```sh
scripts/zed             # run every check
scripts/zed --refresh   # first update Zed to its latest release
```

Checks 1 to 4, 19, 22, 24, 26, 27 and 30 end with `LOOK`: open their screenshot and confirm it. The
others pass or fail on their own. The exact languages are selected with a modeline such as
`// vim: ft=arm`. Run the checks before each release and note the Zed version from the report.

| #  | Do                                                                                              | Expect                                                |
| -- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 1  | Open a `.s` file                                                                                | The status bar shows Assembly                         |
| 2  | Open a `.asm` file                                                                              | The status bar shows x86 Assembly (NASM)              |
| 3  | Put `// vim: ft=arm` on the first line of a `.s` file and reopen it                             | The status bar shows ARM Assembly                     |
| 4  | Type `add x0, x1, x2, lsl #32`                                                                  | `#32` has the number color                            |
| 5  | Type `/*`, then Enter                                                                           | `*/` is added and the new line starts with `*`        |
| 6  | Press Enter on a `* text` line inside that comment                                              | The next line starts with `*`                         |
| 7  | Press Enter after `// note`, `# note`, `@ note` in ARM, `; note` in ARM (Apple) and x86 (NASM)  | The next line starts with the same marker and a space |
| 8  | Toggle comment on an instruction                                                                | `//` and a space; in NASM `;` and a space             |
| 9  | In a `.S` file, press Enter at the end of `#define X 1`                                         | No `#` is inserted                                    |
| 10 | In the same file, press Enter at the end of `#endif /* X */`                                    | No `#` is inserted                                    |
| 11 | Type `main:`, then Enter                                                                        | The cursor lands one indent level in                  |
| 12 | On that indented line, type `loop:`                                                             | The line moves back to column 0 when you type `:`     |
| 13 | Type `[`, `(`, `{`, `"`, `'` and `/*` in code, then in a comment                                | Brackets and `"` close in both; `'` and `/*` in code  |
| 14 | Type `(` right before `.Lend`                                                                   | No `)` is added                                       |
| 15 | Press Enter between `{` and `}`                                                                 | A plain new line, with no blank indented line         |
| 16 | Select `.Lloop_end`, and `%function` in ARM (double-click or Ctrl+D)                            | The whole name is selected                            |
| 17 | Pick `helper`, then the nested `.Lloop`, in the outline (Ctrl+Shift+O)                          | The cursor jumps to that label                        |
| 18 | Type `text` in the outline of a file with `.text` and `.data`                                   | No entry matches: sections are not listed             |
| 19 | Put the cursor on the `.Lloop:` line inside `main`                                              | The breadcrumbs show `main` and `.Lloop`              |
| 20 | Type `.macro m`, `nop`, `.endm`; nested `.if`/`.else`/`.endif`; `.rept`/`.endr`                 | Bodies indent; closers and clauses align with opener  |
| 21 | After `main:` and Enter, type `.text`                                                           | `.text` stays indented where it was typed             |
| 22 | In a `.S` file, look at `#if defined(SAVE) && LEVEL > 1`                                        | The condition has the C colors                        |
| 23 | Below `.macro m` and `nop`, type `.` as the last line, with no newline after it                 | The outline still lists `m`                           |
| 24 | Open ARM code with registers, `[ ]`, `{ }`, a condition and `:lo12:`                            | Registers, conditions and relocations have own colors |
| 25 | In ARM, put the cursor after `{` or `[` and run Move to Enclosing Bracket (Ctrl+M)              | The cursor jumps to the matching `}` or `]`           |
| 26 | Open x86 code with AT&T memory, `*`, `lock`, `{vex}`, a decorator and `%`                       | Registers, prefixes and decorators have own colors    |
| 27 | Open x86 code after `.intel_syntax noprefix` with `DWORD PTR [rbx+8]`, `shl`, `OFFSET FLAT:`    | Size words, operator words and registers have colors  |
| 28 | In x86 Intel code, put the cursor after `[` and run Move to Enclosing Bracket (Ctrl+M)          | The cursor jumps to the matching `]`                  |
| 29 | In vim mode, `vaf`, `vif` and `vac`, then `y`                                                   | Each copies the function, its body or the macro       |
| 30 | Open x86 (NASM) code with directives, a macro, a `struc`, registers and memory operands         | Directives, macros, registers, sizes have own colors  |
| 31 | In NASM, type `%macro m 1`, `nop`, `%endmacro`; nested `%if`/`%else`/`%endif`; `%rep`/`%endrep` | Bodies indent; closers and clauses align with opener  |
| 32 | Type `struc point`, `.x: resd 1`, `.y: resd 1`, `endstruc`                                      | Fields stay at the body level; `endstruc` aligns      |
| 33 | Pick a macro, a `%define`, a structure, a field and a label in a NASM outline                   | The cursor jumps to each                              |
| 34 | In NASM, run Move to Enclosing Bracket after `{` in `m {1, 2}` and after `%(` in `db %(1, 2)`   | The cursor jumps to the matching `}` or `)`           |
| 35 | Read the Zed log                                                                                | No errors about the asm grammars or queries           |

A Zed limitation: when nothing follows the cursor, at the very end of a file, Zed ignores
scope-based settings. There, Enter after `#define X 1` inserts `#` and a space in the GNU-syntax
languages, and `/*` closes inside a comment. Zed's own languages have the same limitation. Checks 9,
10 and 13 therefore run with a line after the cursor.
