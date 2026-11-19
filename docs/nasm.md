# NASM

x86 (NASM) reads what nasm 3.02 and yasm 1.3.0 accept, measured with `-f elf64`, `-f elf32` and
`-f bin`, and for format-specific directives with `-f obj`, `-f win32`, `-f win64` and `-f macho64`.
The grammar accepts what either assembler accepts, and the tables say which one does. Where the two
read the same text differently, the grammar follows nasm, the maintained assembler. So `rip` is a
symbol, the AVX-512, AMX and MPX registers are registers, `bnd` is a prefix, braces are decorators
and pseudo-prefixes, and `!` is logical not. The output format is not in the text, so every format's
directives are directives in every file.

## Names

A name is an optional `$`, which turns a reserved word into a name (`$eax` is a symbol, not the
register), then a letter, `_`, `?`, `@` or `.`, then letters, digits and `_ $ # @ ~ . ?`. Both
assemblers take `@` first (`@x:`, `@:`, `mov eax, @x`). After the escaping `$` any name character
may follow, `$` included, so `$$foo` is the name `$foo`, and `$$` alone is the start of the section.
A `$` starts a name only before a letter, `_`, `?`, `@`, `.` or another `$`. A `$` alone is the
current position, so an operand may start at any `$`.

A name that starts with `.` or `$.` is local. Labels read as follows:

| Label                                          | nasm | yasm |
| ---------------------------------------------- | ---- | ---- |
| `.1:`, `.$x:`, `.#x:`, `.@x:`, `$.y:`, `$eax:` | yes  | yes  |
| `.:`                                           | yes  | no   |
| `..x:`, `....:`                                | no   | yes  |

The grammar reads all of them, as labels and in operands.

## Registers

The register names are nasm's, generated from `x86/regs.dat` by nasm's own `regs.pl`. The registers
yasm reads and nasm does not, its `rip` and its register groups (`st(1)`, `xmm(3)`), are symbols to
nasm and so symbols here.

| Family              | Names                                                                                             | nasm                          | yasm                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------- |
| general             | `rax`-`r15`, `eax`-`r15d`, `ax`-`r15w`, `al`-`r15b`, `ah` `bh` `ch` `dh`, `sil` `dil` `bpl` `spl` | yes                           | yes                                                                    |
| APX general         | `r16`-`r31` and their `d`, `w`, `b` forms                                                         | yes                           | no (symbols)                                                           |
| segment             | `cs` `ds` `es` `fs` `gs` `ss`, and `segr6` `segr7` in nasm                                        | yes                           | yes, without `segr6` `segr7`                                           |
| control, debug      | `cr0`-`cr31`, `dr0`-`dr31`                                                                        | yes                           | `cr0` `cr2` `cr3` `cr4` `cr8` and `dr0`-`dr7` (the others are symbols) |
| test                | `tr0`-`tr7`                                                                                       | yes, with an obsolete warning | reserved, but rejects the instruction                                  |
| x87                 | `st0`-`st7`                                                                                       | yes                           | yes                                                                    |
| MMX, SSE, AVX       | `mm0`-`mm7`, `xmm0`-`xmm15`, `ymm0`-`ymm15`                                                       | yes                           | yes                                                                    |
| AVX-512             | `xmm16`-`xmm31`, `ymm16`-`ymm31`, `zmm0`-`zmm31`, `k0`-`k7`                                       | yes                           | no (symbols)                                                           |
| AMX, MPX            | `tmm0`-`tmm7`, `bnd0`-`bnd3`                                                                      | yes                           | no (symbols)                                                           |
| instruction pointer | `rip`                                                                                             | no (a symbol)                 | yes, in `[rip+8]`                                                      |

Names are case-insensitive. A register name cannot be a label (both reject `eax:`), and `$` escapes
it (`$eax:`). `st(0)`, a bare `st`, `r8l`, `db0`, `eiz`, `riz`, `ip` and `eip` are not nasm
registers.

## Prefixes and decorators

The prefix words come from nasm. They are the `TOKEN_PREFIX` sections of `asm/tokens.dat` (those
marked `TFLAG_BRC` only in braces), plus the segment registers and `strict`, which `add_prefix` in
`asm/parser.c` also takes. yasm's prefixes are all nasm prefixes too.

| Words                                                                                     | nasm                | yasm                |
| ----------------------------------------------------------------------------------------- | ------------------- | ------------------- |
| `rep` `repe` `repz` `repne` `repnz` `lock` `xacquire` `xrelease`                          | yes                 | yes                 |
| `o16` `o32` `o64` `a16` `a32` `a64`                                                       | yes                 | yes                 |
| `bnd`                                                                                     | yes                 | no (a label)        |
| `asp` `osp` `nobnd`                                                                       | yes                 | no (a label)        |
| `wait`                                                                                    | yes                 | no (an instruction) |
| `cs` `ds` `es` `fs` `gs` `ss` before an instruction                                       | yes                 | yes                 |
| `segr6` `segr7` before an instruction                                                     | parsed, not encoded | no (a label)        |
| `strict` before an instruction                                                            | yes                 | no (an error)       |
| `{vex}` `{vex2}` `{vex3}` `{evex}` `{rex}` `{rex2}` `{nf}` `{zu}` `{pt}` `{pn}`, any case | yes                 | no (yasm skips `{`) |

Prefix words are reserved in any case, except the words nasm takes only in braces, so `rex nop` is a
colonless label `rex` and `nop`. `notrack`, `data16` and `addr32` are not NASM prefixes, and
`notrack jmp rax` assembles as a colonless label and `jmp rax`. GNU's `{load}`, `{store}`, `{disp8}`
and `{disp32}` are not valid brace tokens in nasm, and neither are `{nd}`, `{cf}` or `{nooc}`.

A braced prefix may follow the mnemonic (`add {nf} eax, ecx`, `add{evex} dword [rdx], 16`).

The decorators are generated from the same file, from its decorator rows (`{1to2}` to `{1to32}`,
`{rn-sae}` to `{rz-sae}`, `{sae}`, `{z}`) and its `dfv=` constants (`{dfv=of,cf}`, also none). The
masks are the registers `regs.dat` lets stand in braces, `k1` to `k7`, because nasm rejects `{k0}`
as a brace token. All of them take any case (`{K1}{Z}`, `{RN-SAE}`, `{DFV=}`), with no blanks inside
the word (`{rn - sae}` is an error). A brace constant (`{dfv=of,cf}`) is a value in any expression.
At the start of an operand it is the whole operand, so `ccmpl {dfv=of} rdx, r30` needs no comma.

## Size words and operand keywords

The words are generated from nasm's `asm/tokens.dat`, with the kind taken from each token type and,
for the special words, from their value, and from the `%idefalias` lines of `macros/standard.mac`
that name a token, which spell the function words without `?` (`__utf16__`):

| Words                                                 | Where                                                          | nasm  | yasm                |
| ----------------------------------------------------- | -------------------------------------------------------------- | ----- | ------------------- |
| `byte` `word` `dword` `qword` `tword` `oword` `yword` | before an operand, and first inside a bracket (`[dword ebx]`)  | yes   | yes                 |
| `zword`                                               | the same                                                       | yes   | no (a symbol)       |
| `long`                                                | the same, 32 bits                                              | yes   | yes                 |
| `strict`                                              | before a size word or an operand                               | yes   | yes                 |
| `short` `near` `far`                                  | before a jump or call target                                   | yes   | yes                 |
| `rel` `abs` `nosplit`                                 | first inside a bracket, and in `default rel` and `default abs` | yes   | yes                 |
| `seg`                                                 | unary operator                                                 | yes   | yes                 |
| `wrt`                                                 | after an operand, before a special symbol or a segment         | yes   | also `rip`, chained |
| `to`                                                  | x87 `fadd to st1`                                              | yes   | yes                 |
| `__?masm_ptr?__`                                      | opens a memory operand without brackets                        | yes   | undefined symbol    |
| `__?masm_flat?__`                                     | the flat segment before `:`                                    | yes   | undefined symbol    |
| `ptr`                                                 | a symbol, not a keyword                                        | warns | undefined symbol    |

All of these are reserved in any case. A memory operand is `[` expression `]` with the base, index,
scale and displacement in any order (`[rcx*4+rbx]`, `[-8+rbp]`), blanks anywhere, and a segment
inside (`[fs:0x28]`, both) or before it (`fs:[0x28]`, nasm only). Both reject nested brackets. Far
pointers are `0x10:0x1000`. nasm also takes the MPX split form, a base, a comma and an index
(`[rax+3, rbx]`, `[, rcx*1]`), read with the index in an `index` field, and an address-size prefix
first inside a bracket (`[a32 foo]`). `abs` also stands before an operand (`jmp abs x`), the only
one of the three nasm takes there. With no operand after it, as in `default abs`, it is a plain
argument.

nasm also opens a memory operand at `&` or `__?masm_ptr?__`, with no closing bracket. `&x + 4`,
`dword &x`, `&rel x` and `dword __?masm_ptr?__ x` load from memory as `[x + 4]` and the others do,
and the reference runs to the end of the operand. It is the same `memory_operand`, with the same
modifiers. `%use masm` defines `ptr` and `flat` as these two tokens. The grammar does not expand
macros, so `dword ptr foo` reads `ptr` as a word before an operand ([Macro calls and macro
words](#macro-calls-and-macro-words)). `__?masm_flat?__` reads as the segment `register`, as `FLAT:`
does in x86 (GAS). yasm takes neither.

Special symbols start with `..`. They are `..plt`, `..got`, `..gotpcrel`, `..sym`, `..gottpoff`,
`..tlsie`, `..gotoff` and `..gotpc` for ELF, `..start` for obj and `..imagebase` for win64, each
valid in its own output format. `..@` names are the labels nasm generates for macro locals. Any
other `..name` is an error in nasm and an ordinary label in yasm.

## Directives

| Directive                                                                                                | nasm                             | yasm                                                    |
| -------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------- |
| `bits` `use16` `use32` `use64` `default` `section` `segment` `absolute` `extern` `global` `common` `cpu` | yes                              | yes                                                     |
| `default bnd`, `default nobnd`                                                                           | yes                              | no                                                      |
| `static` `required` `float` `sectalign`                                                                  | yes                              | no                                                      |
| `align` `alignb`                                                                                         | yes                              | yes                                                     |
| `struc` `endstruc` `istruc` `at` `iend`                                                                  | yes                              | yes                                                     |
| `db` `dw` `dd` `dq` `dt`, `resb` `resw` `resd` `resq` `rest` `reso` `resy`                               | yes                              | yes                                                     |
| `do`                                                                                                     | floats, strings, `?`             | integers, strings, `?`                                  |
| `dy`                                                                                                     | strings, `?`                     | integers, strings, `?`                                  |
| `dz`, `resz`                                                                                             | yes (`dz` takes strings and `?`) | no                                                      |
| `equ`, `times` (nested `times 2 times 3` in nasm only), `incbin`                                         | yes                              | yes                                                     |
| `[warning ...]`, `[list ...]`, `[dollarhex ...]`, `[debug ...]` (bracket form only)                      | yes                              | `[warning]` ignored with a warning, the others rejected |
| `org`, `[map ...]`                                                                                       | `-f bin`                         | `-f bin`                                                |
| `group` `uppercase` `import` `export`, `..start`                                                         | `-f obj`                         | no                                                      |
| `safeseh`                                                                                                | `-f win32`                       | `-f win32`                                              |
| `osabi`                                                                                                  | ELF                              | no                                                      |
| `subsections_via_symbols` `no_dead_strip`                                                                | `-f macho64`                     | `-f macho64`                                            |

Directive words are case-insensitive and take the bracket form (`[bits 64]`, `[section .text]`). At
the start of a statement they are always directives. `bits:`, `global:`, `extern:`, `common:`,
`cpu:`, `absolute:`, `align:`, `alignb:`, `struc:`, `at:`, `incbin:` and `times:` are rejected, and
`section:` declares a section named `:`. nasm reads `db:`, `dd:`, `resb:`, `equ:` and `istruc:` as
labels (yasm rejects the data words), and a format directive followed by a colon is a label in every
other output format. In an expression `section`, `db`, `align` and `global` are symbols to nasm.

A word with no colon is a label when a data, reserve, `times`, `equ` or `incbin` word follows it
(`x db 1`). nasm also reads `start nop` as a label and an instruction, because it knows `nop`.

Data lists take `%(...)`, a size before parentheses (`dw byte (?, 44)`), and `dup` with an optional
size before its list. A list may hold lists, but not as its last item. `db 2 dup (2 dup (0), 1)`
assembles and `db 2 dup (1, 2 dup (0))` is an error in both assemblers. A list still open at the end
of its line may end with anything, so typing a nested list never changes the lines around it.

## Preprocessor

| Directives                                                                                                     | Argument                                                                  | yasm |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---- |
| `%define` `%xdefine` `%idefine` `%ixdefine`                                                                    | name, optional `(params)`, raw value                                      | yes  |
| `%undef`                                                                                                       | name                                                                      | yes  |
| `%assign` `%iassign`                                                                                           | name, expression                                                          | yes  |
| `%defstr` `%idefstr` `%deftok` `%ideftok` `%defalias` `%idefalias` `%undefalias` `%strcat` `%strlen` `%substr` | name, raw                                                                 | no   |
| `%macro` `%imacro`                                                                                             | name, parameter count (`1`, `1-3`, `0-*`, `1+`, `1.nolist`), raw defaults | yes  |
| `%rmacro` `%irmacro`                                                                                           | read as `%macro` with a "reserved directive" warning                      | no   |
| `%endmacro` (a name after it is accepted)                                                                      | -                                                                         | yes  |
| `%unmacro` `%unimacro`, `%exitmacro`                                                                           | name and count, none for `%exitmacro`                                     | no   |
| `%rotate`                                                                                                      | expression                                                                | yes  |
| `%if` `%elif`                                                                                                  | expression                                                                | yes  |
| `%ifn` `%elifn`                                                                                                | expression                                                                | no   |
| `%ifdef` `%ifndef` `%elifdef` `%elifndef`, `%ifctx` `%ifnctx`                                                  | one or more names                                                         | yes  |
| `%ifmacro` `%ifnmacro`                                                                                         | name and parameter count                                                  | yes  |
| `%ifidn` `%ifidni` `%ifnidn`                                                                                   | raw tokens, two comma-separated lists                                     | yes  |
| `%ifid` `%ifnum` `%ifstr` `%iftoken` `%ifempty` `%ifdirective` `%ifdifi`                                       | raw tokens                                                                | no   |
| `%ifenv` `%ifnenv`                                                                                             | one or more names, strings or `%!NAME`                                    | no   |
| `%ifdefalias` `%ifndefalias`                                                                                   | one or more names                                                         | no   |
| `%iffile`, `%ifusing`, `%ifusable`, and their `n` forms                                                        | a file or package name                                                    | no   |
| `%else` `%endif`                                                                                               | text after them is ignored with a warning                                 | yes  |
| `%rep`                                                                                                         | optional `.nolist`, then an expression, required                          | yes  |
| `%endrep` `%exitrep`                                                                                           | -                                                                         | yes  |
| `%include`                                                                                                     | string                                                                    | yes  |
| `%pathsearch` `%depend` `%use`                                                                                 | name and string (`%pathsearch`), string (`%depend`), name (`%use`)        | no   |
| `%push` `%pop` `%repl`                                                                                         | context name                                                              | yes  |
| `%arg` `%local` `%stacksize`                                                                                   | raw                                                                       | no   |
| `%error` `%warning` `%fatal`                                                                                   | raw message                                                               | yes  |
| `%line` `%clear`                                                                                               | raw                                                                       | yes  |
| `%pragma` `%null`                                                                                              | raw                                                                       | no   |

Every `%if` form above also has an `%elif` form and a negated `n` form, read from `asm/pptok.dat`.

`.nolist` takes any case. In a macro count it must touch the count, because `%macro m 1 .nolist`,
with a blank, makes it a default value, which nasm warns about. Before a `%rep` count only that
exact word counts, so `%rep .nolistx` repeats by the symbol `.nolistx`.

Preprocessor words are case-insensitive, and `%` must touch the word (`% define` is rejected). A
directive counts only as the first token of its line, after blanks. Both assemblers reject
`f: %macro m 0` and `%%l: %rep 2`, and the grammar reports them.

A raw value ends at a `;` outside quotes, so `%define A 1 ; comment` defines `1` and `%define A ';'`
defines `';'`. `//` and `/*` start no comment, so `%define D 10 // 3` keeps the signed division in
its value. Text after a closer or `%else`, and after a complete condition, `%rep` count or macro
reference with its parameter count, is ignored by both assemblers with a warning. The grammar reads
it as raw text (`%endif done`, `%rep 3 junk`, `%ifmacro m 1 x`). GNU as and clang reject such text,
so GNU syntax keeps the error.

### Line joins

A line that ends with a backslash continues on the next line, in both assemblers and everywhere. The
backslash and the newline are deleted with no space left, in operands, in `%define` values, in
strings and inside `;` comments, so `; note \` comments out the line after it. A blank after the
backslash, or the end of the file, prevents the join, and a CRLF line end joins.

The grammar reads a join as a blank between tokens ([grammar.md](grammar.md#line-joins)). Comments,
strings and raw text continue past it, and a join inside a token splices it (`d\` and then `b 4` is
`db 4`). A word that ends right before a join, with a character that cannot continue it on the next
line, keeps the join inside its node. A directive after a line that holds only a backslash still
starts its line, and one after `nop \` does not.

### Macro tokens

| Token              | Meaning                                                                                                     | yasm |
| ------------------ | ----------------------------------------------------------------------------------------------------------- | ---- |
| `%1`, `%2`, ...    | macro parameter (`%` and a digit is always one, so `7%2` is an error outside a macro and `7 % 2` is modulo) | yes  |
| `%0`               | parameter count                                                                                             | yes  |
| `%00`              | the label before the macro call                                                                             | yes  |
| `%-1`, `%+1`       | a condition-code parameter, inverted or not                                                                 | yes  |
| `%{1:3}`, `%{-1}`  | parameter ranges                                                                                            | yes  |
| `%%x`              | macro-local label (`%%%x` is an error)                                                                      | yes  |
| `%$x`, `%$$x`      | context-local label, in the current or the enclosing context                                                | yes  |
| `%[expr]`          | indirection                                                                                                 | no   |
| `%?`, `%??`, `%*?` | the macro name as called, as defined                                                                        | yes  |
| `%+`               | joins the tokens on both sides                                                                              | yes  |
| `%!NAME`           | environment variable                                                                                        | yes  |

Single-line macro parameters take nasm's modifiers `=x` (evaluate, with a radix such as `=x/x`),
`&x` and `&&x` (quote), `!x` (keep blanks), `x+` (greedy), and empty parameters (`(a, =b, )`).

## Macro calls and macro words

nasm expands single-line macros anywhere on a line, and the parser does not see their definitions,
so it reads the shapes a macro can take:

| Form                                       | Example                                        | Node                                |
| ------------------------------------------ | ---------------------------------------------- | ----------------------------------- |
| a function-like call in any expression     | `[GOTOFF(eax, PW_ONE)]`, `f (1)`               | `macro_call`                        |
| a call statement, parentheses end the line | `g(1, 2)`, `ERR(rdpid ax)`                     | `macro_call`                        |
| a preprocessor function                    | `%chr(40, 41)`, `%str(%1)`                     | `macro_call`                        |
| a `%map` macro with subparameters          | `%map(alpha:("!"):2, foo)`                     | `macro_reference`                   |
| braces protect commas                      | `m {1, 2}, 3`, `struc {s}`, `align {4}`        | `argument_list`                     |
| parentheses holding a comma, in a call     | `g((1, 2))`                                    | `argument_list`                     |
| a call names a label or an `equ`           | `EXTN(f):`, `f(y) nop`, `f(y) equ 2`           | `label`, `assignment`               |
| a word or macro token before an operand    | `XMMWORD [rsp]`, `kmov %3 %1, %1`              | `typed_operand`, the word as `type` |
| a macro token as a name                    | `%define %$x 1`, `%1:`, `%%a nop`, `%00 equ 3` | the token                           |
| a glued name, with or without blanks       | `%%top_%$x:`, `_t_ %+ %1:`                     | `concatenation`                     |
| a call glued to a name                     | `jmp mangle(x).main`, `[m(x).pass2]`           | `concatenation`                     |
| a number token with letters, an argument   | `INV_TXFM_FN %1, 16x16`, `AVX_INSTR p, 3dnow`  | `identifier`                        |
| a bare `%word` where an operand fits       | `dir %iffile`, `dir [%iffile]`                 | `macro_expansion`                   |

A word followed by `(` has no other meaning in an expression, so a call needs no blank rule. At the
start of a statement the parentheses make a call only when they end the line. Otherwise they open
the first of a multi-line macro's arguments (`m (1) + 2, 3`). Any `%word(` is a function, so a new
nasm function reads without a table. A bare `%word` is valid only as a macro argument and never
starts a statement, so `f: %define X 1` stays an error.

A name or a macro token followed by an operand is a macro the assembler expands first, such as a
size (`%define XMMWORD`), an operator, or `ptr` under `%use masm`. Both assemblers reject the same
text when the word is no macro. The parser does not see the definition, so it reads the word as the
`type` of a `typed_operand`, like `dword`. A register or a number before an operand is never a
macro, so `mov eax 1` and `push 1 2` stay errors. `x[ebx]` and `8 [ebx]` stay displacements. With a
blank, `x [ebx]` reads `x` as a type, the form of a macro-defined size.

A macro token names whatever a symbol names, such as defines, assignments, labels with or without a
colon, macros, structures, declared symbols and `equ`. A dot name or a `$` name alone on its line is
a label (`.end`), as nasm reads it, and a plain word alone stays a macro call. A word followed by a
data word or a mnemonic and then a comma is a macro call with that word as its first argument
(`SBUTTERFLY dq, %2`, `AVX_INSTR pfadd, mmx`). Both assemblers reject a label there. A name escaped
with `$` keeps any name characters after it, `$` included (`$$foo`, `$$$foo`), and `$3` names a
symbol where only a name can stand, for `[dollarhex off]`.

## Structures

`struc`, `endstruc`, `istruc`, `at` and `iend` are standard macros in both assemblers, not syntax.
The generated table reads them from `macros/standard.mac` and its yasm counterpart, and they take
any case.

| Node                 | Form                                  | Fields                   |
| -------------------- | ------------------------------------- | ------------------------ |
| `structure`          | `struc name[, offset]` ... `endstruc` | `name`, `offset`, `body` |
| `structure_instance` | `istruc name` ... `iend`              | `name`, `body`           |
| `field_initializer`  | `at field[, data]`                    | `field`, `statement`     |

A name is a symbol, a `.name` or a macro token (`%1`, `%%a`, `%$a`, `%1_b`). The offset and the
field are expressions, and a comma with nothing after it is accepted. The body of a `structure` is a
`structure_body`, in which `.x: resd 1` and `mt_long: resd 1` are both a `label` and a `directive`.
A label there opens no block, because a field does not own the lines after it.

The data of an `at` line is a line of its own, because the macro expands it as `%2` on its own line.
It may be an instruction, a data directive, another directive, a macro call, `times`, `equ`, a
structure or an instance, with a label in front (`at s.x, l: dd 1`). It sits in a `statement` field,
as in `times` and `align`. More data may follow on the next lines, as siblings of the `at` line.

As macros, the blocks need not balance where they are written. Both assemblers accept each of these
cases, and the grammar reads them:

- An `at` line reads anywhere, not only in an instance, because a macro or a `%if` may hold it.
- A closer with no open block of its kind is a plain `directive`. `%macro f 0` with `endstruc` in
  its body is valid, and so is `endstruc` in both branches of a `%if`.
- `%endmacro`, `%endrep`, `%endif`, `%else` and `%elif` end a structure or instance opened inside
  their block, so `%if 1`, `struc a`, `%endif`, `endstruc` reads with no error.
- A block with no closer is accepted, and its body is an `unclosed_body`, as for the other blocks.

A label may stand before each of the five words, with or without a colon. `iend`, `endstruc`,
`use16` and the other standard macros that take no parameters may also name a label (`iend: nop`),
which both assemblers accept with a warning. The table reads that from the macro's parameter count.
Every other standard macro is reserved, because `at: nop` would be a call of `at`.

## Numbers and operators

| Form                                                                                                                                              | nasm              | yasm            |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------- |
| `0x1f` `0X1F` `1fh` `17o` `17q` `101b`                                                                                                            | yes               | yes             |
| `$1f`                                                                                                                                             | deprecated, warns | yes             |
| `0h1f` `0o17` `0q17` `0b101` `0y101` `101y` `0d99` `99d` `0t99` `99t`, `1fx`, and `0x` and `0h` as zero                                           | yes               | no              |
| `_` between digits (`1_000`, `0x_ff`)                                                                                                             | yes               | in `0x_ff` only |
| `1.5` `1.` `1.e10`                                                                                                                                | yes               | yes             |
| `1e10` `1E+5`, `0x1.8p0` `0x1p3` `0b1.1` `0o1.1`, `1_000.5`                                                                                       | yes               | no              |
| `__?Infinity?__` `__?QNaN?__` `__?SNaN?__`, `__Infinity__`-style spellings                                                                        | yes               | no              |
| `__?float32?__(1.5)` and the other float functions (`float8`, `float16`, `bfloat16`, `float64`, `float80m`, `float80e`, `float128l`, `float128h`) | yes               | no              |
| `__?utf16?__ 'ab'`, `__?utf16?__('ab')` and the other string functions (`utf16le`, `utf16be`, `utf32`, `utf32le`, `utf32be`)                      | yes               | no              |
| `__?ilog2e?__ 64`, `__?ilog2e?__(64)` and the other integer functions (`ilog2w`, `ilog2f`, `ilog2c`)                                              | yes               | no              |
| `'a'` `"ab"`                                                                                                                                      | yes               | yes             |
| `` `c` `` with C-style escapes (`\n`, `\x41`, `\u263a`, `\e`) and control escapes (`\^@`, `` \^` ``)                                              | yes               | no              |
| `?` (uninitialized)                                                                                                                               | yes               | one per line    |

nasm reads the float, string and integer functions as prefix operators, so each is the
`operator_word` of a `unary_expression`, as `seg` is. A float function needs its parentheses
(`__?float32?__ 1.5` is an error), and the others take any operand, parenthesized or not. Each also
has a spelling without `?` (`__float32__`, `__utf16__`, `__ilog2e__`) from `standard.mac`.
`bfloat16` has none, so `__bfloat16__` is a symbol.

`.5` is a local label, not a float, and `$af` is the symbol `af`, not a number, because `$` makes a
number only before a digit. `$` alone is the current position and `$$` the start of the section.
`?x` is a name, so `1 ?x : 3` is an error, and the conditional needs a blank after `?`. Floats are
accepted in data directives. nasm rejects them as instruction operands, and yasm does not.

Operators bind as in C, measured with `dd` values (`2 + 3 << 1` is 10, `1 | 2 ^ 3` is 1,
`3 & 1 == 1` is 1, `1 ? 0 ? 5 : 6 : 7` is 6). The levels from the loosest to the tightest are:

| Level | Operators                                                   |
| ----- | ----------------------------------------------------------- |
| 1     | `?:` (nasm only, right-associative)                         |
| 2     | `\|\|`                                                      |
| 3     | `^^`                                                        |
| 4     | `&&` (nasm only)                                            |
| 5     | `=` `==` `!=` `<>` `<` `<=` `>` `>=`, and `<=>` (nasm only) |
| 6     | `\|`                                                        |
| 7     | `^`                                                         |
| 8     | `&`                                                         |
| 9     | `<<` `>>` `<<<` `>>>`                                       |
| 10    | `+` `-`                                                     |
| 11    | `*` `/` `//` `%` `%%`                                       |
| 12    | unary `-` `+` `~` `!`, `seg` and the special operators      |

nasm accepts every operator in instruction operands and `%if` alike. yasm skips `!` and misreads
`>>>`. Division with `/` and `%` is unsigned (`-7 / 2` is -4 in 32 bits in nasm), and `//` and `%%`
are signed.

## Blocks

| Case                                                                     | nasm                      | yasm     |
| ------------------------------------------------------------------------ | ------------------------- | -------- |
| `%if`, `%macro` or `%rep` open at the end of the file                    | error                     | error    |
| `struc` or `istruc` open at the end of the file                          | accepted                  | accepted |
| `%endif`, `%endmacro`, `%endrep` with nothing open                       | error                     | error    |
| a second `%else`, or `%elif` after `%else`                               | warns, ignores the branch | accepted |
| `at .x` with the short field name                                        | accepted                  | error    |
| `at field` with no data, `at field, times 4 db 0`                        | accepted                  | accepted |
| blocks nested in any order, `struc` inside `%if`, `%macro` inside `%rep` | accepted                  | accepted |

The grammar closes every open block at the end of the file, as for GNU syntax, so typing an opener
never breaks the lines below it.

## Limits

The parser reads the text as written and expands no macro, so some valid files read with errors:

- A macro named like an instruction or directive reads as that instruction or directive. After
  `%macro mov 1`, both assemblers accept `mov 1 2` as a call with the one argument `1 2`, and here
  it is a `mov` with a missing comma. The definition may be in another file, which the parser cannot
  open.
- Both branches of a `%if` parse. `mov eax 1` inside `%if 0` is an error here, and both assemblers
  skip it.
- A macro body parses where it is written, not as it expands. `mov eax, 1 %1` in a body is an error
  here, and `m +2` makes it `mov eax, 1 +2` for both assemblers.
- A `%define` value is raw text, because it may hold any tokens, and its uses parse where they
  appear.
- With a blank, `x [ebx]` reads `x` as a size, where nasm reads a symbol as a displacement.

In structures:

- A body takes any statement. `mov eax, 1` in a `struc` body parses, though both assemblers reject
  code in an absolute section.
- A stray `endstruc`, or `endstruc` closing an `istruc`, is no error here, though both assemblers
  reject it outside a macro. The grammar cannot tell it from the valid forms above.
- A `%` directive as the data of an `at` line (`at s.x, %define y 1`) is an error here, though both
  assemblers accept it, because a directive counts only as the first token of its line.
- `iend nop` reads as a directive with an argument, and `istruc: nop` as an error. Both assemblers
  read the first as a label before `nop` and the second as an instance named `: nop`.
