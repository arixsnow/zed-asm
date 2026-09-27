# Checks in Zed

These checks cover what only the editor does: language choice, colors, Enter, toggle comment,
auto-close and word selection. `scripts/zed` runs them in the real Zed app inside Podman, on a
virtual display, with nothing installed on the host. It builds the extension, types each case,
saves the file and compares the text, then writes `.build/zed-qa/report.txt` and one screenshot per
check.

```sh
scripts/zed             # run every check
scripts/zed --refresh   # first update Zed to its latest release
```

Checks 1 to 4 end with `LOOK`: open their screenshot and confirm it. The others pass or fail on
their own. The exact languages are selected with a modeline such as `// vim: ft=arm`. Run the checks
before each release and note the Zed version from the report.

| #  | Do                                                                                 | Expect                                                |
| -- | ---------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 1  | Open a `.s` file                                                                   | The status bar shows Assembly                         |
| 2  | Open a `.asm` file                                                                 | The status bar shows x86 Assembly (NASM)              |
| 3  | Put `// vim: ft=arm` on the first line of a `.s` file and reopen it                | The status bar shows ARM Assembly                     |
| 4  | Type `add x0, x1, x2, lsl #32`                                                     | `#32` has the number color                            |
| 5  | Type `/*`, then Enter                                                              | `*/` is added and the new line starts with `*`        |
| 6  | Press Enter on a `* text` line inside that comment                                 | The next line starts with `*`                         |
| 7  | Press Enter after `// note`, `# note`, `@ note` in ARM, `; note` in Apple and NASM | The next line starts with the same marker and a space |
| 8  | Toggle comment on an instruction                                                   | `//` and a space; in NASM `;` and a space             |
| 9  | In a `.S` file, press Enter at the end of `#define X 1`                            | No `#` is inserted                                    |
| 10 | In the same file, press Enter at the end of `#endif /* X */`                       | No `#` is inserted                                    |
| 11 | Type `main:`, then Enter                                                           | The cursor lands one indent level in                  |
| 12 | On that indented line, type `loop:`                                                | The line moves back to column 0 when you type `:`     |
| 13 | Type `[`, `(`, `{`, `"`, `'` and `/*` in code, then in a comment                   | Brackets and `"` close in both; `'` and `/*` in code  |
| 14 | Type `(` right before `.Lend`                                                      | No `)` is added                                       |
| 15 | Press Enter between `{` and `}`                                                    | A plain new line, with no blank indented line         |
| 16 | Select `.Lloop_end`, and `%function` in ARM (double-click or Ctrl+D)               | The whole name is selected                            |
| 17 | Read the Zed log                                                                   | No errors about the asm grammars or queries           |

A Zed limitation: when nothing follows the cursor, at the very end of a file, Zed ignores
scope-based settings. There, Enter after `#define X 1` inserts `#` and a space in the GNU languages,
and `/*` closes inside a comment. Zed's own languages have the same limitation. Checks 9, 10 and 13
therefore run with a line after the cursor.
