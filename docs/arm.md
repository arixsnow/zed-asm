# ARM operands

This page covers the ARM forms of Assembly, ARM and ARM (Apple). The tables were measured with GNU
as 2.46.1 for AArch64 (`-march=armv9.6-a+sve2+sme2+cmpbr`) and 2.45 for AArch32 (ARMv7-A with NEON,
Thumb, and Armv8.1-M with MVE), and with clang 22.1 for the same targets and for Apple arm64. Every
one of them turns on SVE, SME and MVE inside a file with an `.arch` or `.arch_extension` line, so
one grammar reads all of it.

## Registers

The register names are generated from `reg_names` in GNU as's `tc-aarch64.c` and `tc-arm.c`, and
from LLVM's register matchers with the aliases its parsers add. ARM takes the GNU as and LLVM names,
ARM (Apple) LLVM's AArch64 names, and Assembly both. The scanner reads a register as one whole word,
suffix included, and looks it up. A register word glued to `(` is a name (`R8(x)` is a call),
because no assembler takes a register there.

| Family          | Names                                                                                                                            | Suffix                                                                                                                |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| AArch64 general | `x0`-`x30`, `w0`-`w30`, `xzr`, `wzr`, `sp`, `wsp`, `lr`, `fp`, and `x31` and `w31` (clang), `ip0` and `ip1` (GNU as)             | -                                                                                                                     |
| FP and SIMD     | `b`, `h`, `s`, `d`, `q` 0-31 and `v0`-`v31`                                                                                      | for `v` an arrangement `.8b .16b .4h .8h .2s .4s .1d .2d .1q .2b .4b .2h` or an element `.b .h .s .d`                 |
| SVE             | `z0`-`z31`, `p0`-`p15`, `pn0`-`pn15`                                                                                             | an element `.b .h .s .d .q`                                                                                           |
| SME             | `za`, the tiles `za0`-`za15` with `h` or `v` for a slice (`za3h`), `zt0`                                                         | an element for `za`, and for a tile an element its number fits (`.b` tile 0, `.h` 0-1, `.s` 0-3, `.d` 0-7, `.q` 0-15) |
| clang only      | `nzcv`, `fpcr`, `fpsr`, `fpmr`, `vg`, `ffr`, and the register halves of its register allocator such as `w0_hi`                   | -                                                                                                                     |
| AArch32 general | `r0`-`r15`, `sb`, `sl`, `fp`, `ip`, `sp`, `lr`, `pc`, `wr`, `a1`-`a4`, `v1`-`v8`, Armv8.1-M `zr`                                 | a NEON type (GNU as)                                                                                                  |
| AArch32 vector  | `s0`-`s31`, `d0`-`d31`, `q0`-`q15`, the VFP and MVE specials `fpscr` to `vpr`, iWMMXt and XScale names, `ra_auth_code`           | a NEON type (GNU as)                                                                                                  |
| AArch32 other   | coprocessors `p0`-`p15`, `c0`-`c15`, `cr0`-`cr15`, banked `r8_usr` to `elr_hyp`, and clang's `apsr`, `cpsr`, `spsr`, `apsr_nzcv` | a NEON type on its own names (GNU as)                                                                                 |

GNU as reads a register in lower case or all upper case (`X0`, not `Xzr`), and clang in any case.
The grammar takes any case, because one assembler of each language does. ARM (Apple) leaves out the
AArch32 registers and `ip0` and `ip1`, which Apple's clang rejects.

An arrangement is a count of 1, 2, 4, 8 or 16 lanes whose size in bits is 64 or 128, `.1q`, or a
dot-product shape `.2b`, `.4b` or `.2h`. Both assemblers accept the same set, and GNU as also takes
leading zeros in the count (`v0.016b`). A NEON type is `.8`, `.16`, `.32` or `.64`, optionally after
`i`, `s`, `u`, `p` or `f`, or `.f` (32 bits), `.d` (64 bits) or `.bf16`, in any case. GNU as takes
it on every register of its table (`r0.i32`, `fpscr.f32`, `p15.f32`), and rejects it on a memory
base, in a core register list and when the mnemonic also gives the type (`vadd.i32 q0.i32, q1, q2`).
The grammar reads it wherever a register goes. A suffix no rule takes leaves the whole word a symbol
(`d0.x32`, `v0.q`, `za1.b`).

## System registers

A system register is a `register` only in the operand slots that take one, the system roles in the
role table below. Elsewhere it is a symbol, as both assemblers read it (`b tpidr_el0` branches to a
symbol). The names are generated:

- AArch64, from GNU as's `aarch64-sys-regs.def` and PSTATE fields and LLVM's system register, PSTATE
  and SVCR tables
- AArch32, from GNU as's `cpsr` and `spsr` fields (`cpsr_fc`) and M-profile names (`primask`,
  `basepri_max`) and LLVM's M-profile and banked register tables

Rules add the forms no table lists:

- AArch64 generic encodings `s<op0>_<op1>_c<n>_c<m>_<op2>`, `op0` 0-3, `op1` and `op2` 0-7, `n` and
  `m` 0-15 (`s3_0_c1_c0_0`). clang reads each field in decimal without leading zeros, and GNU as
  with them too (`s3_0_c01_c0_0`).
- The control registers of `sys`, `sysl` and `sysp`, which are `c` and a number from 0 to 15. clang
  reads decimal digits (`c7`, `c07`). GNU as reads an expression there, of which the grammar takes
  one integer in any GNU form (`c0x7`, `c016`, `c7u`). An expression such as `c(3+4)` is no
  register.
- AArch32 APSR bits after `apsr`, `iapsr`, `eapsr`, `psr` and `xpsr`, with `n`, `z`, `c`, `v` and
  `q` all or none, and `g`, in any order (`apsr_nzcvq`, `apsr_gnzcvq`, `xpsr_g`).
- `APSR_` with `nzcv` in any order, which GNU as reads in `vmrs` and the CDE instructions.

A `cpsr` or `spsr` field takes lower case only (`CPSR_fc`, not `CPSR_FC`), as both assemblers
require, and so do the `APSR_` flags in an order other than clang's `nzcv`.

Every system slot of a language reads every form, so a name valid in one system slot is a register
in all of them. `mrs x0, c7` reads `c7` as a register, though no assembler takes it there. The
assemblers check after parsing which names a slot takes (readable registers for `mrs`, writable ones
for `msr`, 128-bit ones for `mrrs` and `msrr`, PSR masks per instruction).

## Where a word is a register

The assemblers decide by instruction whether a word is a register, a condition or a symbol:

| Input                         | Reading                                      |
| ----------------------------- | -------------------------------------------- |
| `adrp x0, x1`, `adrp x0, lt`  | references to globals named `x1` and `lt`    |
| `bl sp`, `b x0`, `ldr x0, x1` | branches and loads to symbols (GNU as)       |
| `b eq`                        | a branch to the symbol `eq`                  |
| `csel x0, x1, x2, lt`         | a condition, even when a symbol `lt` exists  |
| `mov x0, x1`                  | the register, even when a symbol `x1` exists |
| `b LT` in ARM (Apple)         | a branch to a local label                    |

The grammar models this with roles. `tree-sitter/common/roles.js` lists the positions where an
instruction takes a label, a condition or a system register, and each generated instruction carries
the role its operand types fit. Every word may take any case.

| Role                             | Words                                                                                                                                                                                                                                        | Position |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| label                            | `b`, `bl`, `b.<cond>`, `bc.<cond>`, `b<cond>`, and in AArch32 `bl<cond>`, `b<cond>.w`, `b<cond>.n`, `pld`, `pli`, `bfx`, `bflx`                                                                                                              | 1        |
| two labels                       | AArch32 `bf`, `bfl`                                                                                                                                                                                                                          | 1 and 2  |
| label                            | `cbz`, `cbnz`, `adr`, `adrp`, `ldr`, `ldrsw`, `prfm`, `movz`, `movk`, `movn`, and in AArch32 `cbz.n`, `cbnz.n`, `adr`, `ldr`, `ldrb`, `ldrh`, `ldrsb`, `ldrsh` and `vldr` with a condition and a width, `adrl`, divided `ldr<cond>b`, `letp` | 2        |
| label                            | `tbz`, `tbnz`, `cb<cc>`, `cbb<cc>`, `cbh<cc>`, and in AArch32 `wls`, `wlstp.<size>`                                                                                                                                                          | 3        |
| label after an optional register | AArch32 `le` (`le lr, label` or `le label`), `ldrd` (`ldrd r0, r1, label` or `ldrd r0, label`)                                                                                                                                               | last     |
| three labels, then a condition   | AArch32 `bfcsel` (clang reads only numeric labels there, GNU as also `r1`)                                                                                                                                                                   | 1-3, 4   |
| condition                        | AArch32 `it` to `itttt`, `vpt` to `vptttt`, `vcmp`                                                                                                                                                                                           | 1        |
| condition                        | `cset`, `csetm`                                                                                                                                                                                                                              | 2        |
| condition                        | `cinc`, `cinv`, `cneg`                                                                                                                                                                                                                       | 3        |
| condition                        | `csel`, `csinc`, `csinv`, `csneg`, `ccmp`, `ccmn`, `fcsel`, `fccmp`, `fccmpe`                                                                                                                                                                | 4        |
| system register                  | `msr`, `msrr`, and in AArch32 `vmrs`                                                                                                                                                                                                         | 1        |
| system register                  | `mrs`, and in AArch32 `cx1`, `cx1a`                                                                                                                                                                                                          | 2        |
| system register                  | `mrrs`, and in AArch32 `mrc`, `cx1d`, `cx1da`                                                                                                                                                                                                | 3        |
| system register                  | `sys`, `sysp`, and in AArch32 `cx2`, `cx2a`                                                                                                                                                                                                  | 2 and 3  |
| system register                  | `sysl`, and in AArch32 `cx2d`, `cx2da`                                                                                                                                                                                                       | 3 and 4  |
| system register                  | AArch32 `cx3`, `cx3a`                                                                                                                                                                                                                        | 2-4      |
| system register                  | AArch32 `cx3d`, `cx3da`                                                                                                                                                                                                                      | 3-5      |

The roles come from the operand types upstream gives each instruction. These are GNU as's AArch64
operand kinds and AArch32 operand codes, and the operand classes of LLVM's AArch64 matcher, in which
a register pair (`x0, x1`) counts as two operands. Each slot reads as follows:

| Slot      | Reads                                                                                                      |
| --------- | ---------------------------------------------------------------------------------------------------------- |
| label     | a bare word as a symbol, whatever it is named. Brackets, `#`, `=`, relocations and expressions as anywhere |
| system    | system registers as `register`, and anything else as anywhere                                              |
| condition | condition words as `condition`                                                                             |
| any other | register words as registers, and system register and condition words as symbols                            |

Operands before and after the slot read normally, and a slot may stay empty while a line is typed.
At a position with an optional register the grammar reads the register when another operand follows
and the label otherwise, as GNU as does. `le r1` and `ldrd r0, r2` branch to and load from labels
named `r1` and `r2`, and `le lr` branches to a label named `lr`. `blx`, which takes a register or a
label, has no role. A role mnemonic glued to a macro argument (`b\cond`, `ldr\size`) is one
`concatenation`, as at the start of any statement. The instruction it becomes is unknown, so its
operands read normally.

Directive arguments are symbols, so `.quad x0, lr` stores two addresses. The exceptions are the
[directives with register operands](#directives-with-register-operands).

## Operand forms

| Node               | Form                                                                                                                                                                | Fields                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `register`         | a register with its arrangement (`v0.16b`, `z0.d`, `p0.s`), type (`d0.f32`) or field (`cpsr_fc`)                                                                    | -                               |
| `predicate`        | `p0/z`, `p0/m`, `pn8/z`                                                                                                                                             | `register`, `qualifier`         |
| `indexed_register` | a register or name glued to `[...]` or after a blank (`v1.s[2]`, `d0[]`, `za0h.s[w12, 0:1, vgx2]`)                                                                  | `register`, `index`             |
| `index_range`      | `0:1` in an index                                                                                                                                                   | `start`, `end`                  |
| `memory_operand`   | `[` elements `]` with an optional `!`, also after a blank                                                                                                           | `operand`, `alignment`          |
| `alignment`        | `:128` after the base (`[r0:128]`, `[r0 :128]`, `[r0, :128]`)                                                                                                       | `value`                         |
| `signed_register`  | `-r2`, `+r2`                                                                                                                                                        | `sign`, `register`              |
| `writeback`        | `r0!`                                                                                                                                                               | `register`                      |
| `register_list`    | `{` elements `}` with an optional lane `[1]` (also after a blank) and `^`, a C macro call also an element with no comma needed after it (`{r4, UNWIND(fpreg,) pc}`) | `element`, `index`              |
| `register_range`   | `r4-r7`, `v0.16b - v3.16b`, `{v31.16b-v2.16b}`, and two registers in a macro or C call argument (`neon_load_multi d0-d3, src`)                                      | `start`, `end`                  |
| `literal_pool`     | `=expr`, in any operand (`ldr x0, =sym`, and `ldr q0, =sym` in clang)                                                                                               | `value`                         |
| `shift`            | a shift with an immediate or register amount (`lsl #3`, `lsl 3`, `lsl r2`), an extend with an optional amount (`sxtw`, `uxtw #2`), `rrx`, SVE `mul vl` and `mul #4` | `operator`, `amount`            |
| `condition`        | a condition word in a condition slot                                                                                                                                | -                               |
| `relocation`       | `:lo12:sym`, `#:lower16:sym`, `sym(GOT)`, `sym@PAGE`                                                                                                                | `specifier`, `value`, `symbol`  |
| `register_alias`   | `name .req x0`, `name .dn d0`, `name .qn q0`                                                                                                                        | `name`, `directive`, `register` |

After `[` or `{` an element is required. `[]` holds a missing element, `{}` a missing register and
`d0[]` a missing expression, the hidden tokens that close constructs being typed. `d0[]`, a valid
lane, parses the same way. The scanner closes `[` and `{` at the end of a line, before a separator
and before any character that cannot continue them ([scanner.md](scanner.md#closing-tokens)).

A C macro call in an operand list or a register list of ARM, ARM (Apple) and Assembly needs no comma
before or after it. cpp expands it to operands with their commas, or to nothing.

| Place                              | Example                                 |
| ---------------------------------- | --------------------------------------- |
| after an operand                   | `orreq ip, ip, r6 ARM_BE8(, lsl #24)`   |
| before an operand                  | `add r0, F(x) r1`                       |
| between register list elements     | `push {r4 UNWIND(fpreg,) lr}`           |
| in an instruction with typed slots | `b.eq F(x) label`, `ldr x0, label F(x)` |

An operator after the call continues an expression (`add r0, F(x) - r1`). The operands after a call
in an instruction with typed slots are untyped. In Assembly a call after an x86 register or an AT&T
memory operand is a decorator (`%k0 COND_MASK(k2)`, `(%rax) M(k1)`), and a name before a call is a
typed operand (`mov r0, sym F(x)`).

## Relocations

A `:name:` relocation reads in Assembly and ARM. Apple's clang cannot encode it for Mach-O, so ARM
(Apple) reads `@PAGE` and `@PAGEOFF` only. The names are generated from GNU as's `reloc_table` in
`tc-aarch64.c`, `group_reloc_table` and the words `parse_half` reads in `tc-arm.c`, and from clang's
`parseSymbolicImmVal` (AArch64) and `parsePrefix` (AArch32).

| Names                                                                                                                                                                                                                                                   | GNU as | clang |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----- |
| `lo12`, `abs_g0`-`abs_g3` with `_s` and `_nc`, `prel_g0`-`prel_g3` with `_nc`, `got`, `got_lo12`, `gotpage_lo15`, `pg_hi21_nc`, `tlsdesc`, `tlsdesc_lo12`, `dtprel_*`, `gottprel`, `gottprel_lo12`, `gottprel_g1`, `gottprel_g0_nc`, `tprel`, `tprel_*` | yes    | yes   |
| `pg_hi21`, `gotpage_lo14`, `gotoff_lo15`, `gotoff_g0_nc`, `gotoff_g1`, `tlsgd`, `tlsgd_lo12`, `tlsgd_g0_nc`, `tlsgd_g1`, `tlsldm`, `tlsldm_lo12_nc`, `tlsdesc_off_g0_nc`, `tlsdesc_off_g1`                                                              | yes    | no    |
| `dtprel`, `secrel_lo12`, `secrel_hi12`, `got_auth`, `got_auth_lo12`, `tlsdesc_auth`, `tlsdesc_auth_lo12`                                                                                                                                                | no     | yes   |
| AArch32 `lower16`, `upper16`, `lower0_7`, `lower8_15`, `upper0_7`, `upper8_15`                                                                                                                                                                          | yes    | yes   |
| AArch32 group relocations `pc_g0`, `pc_g0_nc`, `pc_g1`, `pc_g1_nc`, `pc_g2`, `sb_g0`, `sb_g0_nc`, `sb_g1`, `sb_g1_nc`, `sb_g2`                                                                                                                          | yes    | no    |

Both assemblers accept a name with blanks around it (`: lo12 :`), and both reject an unknown name
(`:foo:`). GNU as takes every name in any case, and so does clang for AArch64. clang's AArch32 names
are lower case only. The value after the second colon is any expression. The clang column follows
LLVM's current source, and clang 22.1 does not read `dtprel` and `tprel`.

AArch32 code also writes a relocation after its operand, in parentheses (`.word sym(GOT)`,
`bl sym(PLT)`). This form reads in Assembly and ARM. The names are generated from GNU as's
`reloc_names` in `tc-arm.c` and clang's `AtSpecifierDefs` in `ARMMCAsmInfo.cpp`:

| Names                                                                                                                                                                                                                            | Assemblers |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `got`, `gotoff`, `got_prel`, `target1`, `target2`, `sbrel`, `tlsgd`, `tlsldm`, `tlsldo`, `gottpoff`, `tpoff`, `tlscall`, `tlsdesc`, `funcdesc`, `gotfuncdesc`, `gotofffuncdesc`, `tlsgd_fdpic`, `tlsldm_fdpic`, `gottpoff_fdpic` | both       |
| `plt` in data, `tlsdescseq`                                                                                                                                                                                                      | GNU as     |
| `prel31`, `none`, `imgrel`, `secrel32`                                                                                                                                                                                           | clang      |

clang takes any case. GNU as takes only the lower and upper case spellings its table lists
(`sym(Got)` is an error), and its table spells the upper case of `gottpoff_fdpic` as
`GOTTPOFF_FDIC`, which the grammar reads too. Both take a blank before `(` and an addend after it
(`sym(GOT)+4`). GNU as also applies the name to the whole expression before it (`sym+4(GOT)`), and
the grammar reads it the same way. The scanner reads the names. After `(` it reads the name as a
whole word, and it does not split a blank-separated operand before `(` and a name, so `bl sym (PLT)`
is one operand, as both assemblers read it. In a blank-separated `.irp` list `a (b)` is the call
`a(b)` in ARM and the two values `a` and `(b)` in Assembly.

## Directives with register operands

In these directives register words are registers:

- the CFI directives `.cfi_def_cfa`, `.cfi_def_cfa_register`, `.cfi_llvm_def_aspace_cfa`,
  `.cfi_offset`, `.cfi_val_offset`, `.cfi_rel_offset`, `.cfi_register`, `.cfi_restore`,
  `.cfi_undefined`, `.cfi_same_value`, `.cfi_return_column` and `.cfi_val_encoded_addr`, in every
  ARM language. Both assemblers read a register or a number there, and clang also takes a symbol.
- the AArch32 unwinding directives `.save {r4-r7, lr}`, `.vsave {d8-d15}`, `.setfp fp, sp, #8` and
  `.movsp ip`
- the Windows on ARM64 directives `.seh_save_reg`, `.seh_save_regp`, `.seh_save_fregp` and the other
  twelve `.seh_save_*` directives that name a register, which clang reads for `aarch64-windows`

The unwinding and Windows directives read in Assembly and ARM. ARM (Apple) adds `.loh`, the linker
optimization hint clang writes. `.loh AdrpAdd Lloh0, Lloh1` is a kind (a name or a number), a blank,
then labels separated by commas.

`name .req reg` gives a register a second name. GNU as and clang accept it on every ARM target,
clang in any case and GNU as in lower case, and the grammar reads it in any case in every ARM
language. `.dn` and `.qn` do the same for `d` and `q` registers, with a type or a lane
(`sum .dn d4.f32`, `lane .dn d5.f32[1]`). Only GNU as for AArch32 accepts them, and only in lower
case, so they read in Assembly and ARM and nowhere in upper case. Elsewhere `sum .dn d0` is an
instruction named `sum`.

Both assemblers accept an alias wherever a register goes, also in register lists, ranges, writeback,
lanes and before an arrangement (`src.16b`). The same positions take a macro argument
(`{\r0\().16b, \r1\().16b}`, `\v\().s[1]`, `ldm \base!, {\a}`), and in ARM (Apple) a positional
argument (`{$0.16b}`). The grammar reads `.req`, `.dn` and `.qn` lines as a `register_alias`. A name
or macro argument in a register list, a range, a writeback or before a lane is an `identifier`, a
`macro_argument` or a `concatenation`, so a register name being typed (`{d8-d`) does not break the
line. A concatenation there starts with a register, a name or a macro argument, never a dot name.
GNU as and clang read `.foo .req r1` as an unknown directive and reject `{.foo}`, so a register list
closes before `.foo` and the error stays on its line. x86 register positions use the same rule with
their own heads, a register or a `%` name (`%xmm\i`).

## Keywords

Every listed word is a scanner word. The scanner reads it whole and looks it up in its generated
table, only where the parser expects that kind of word. This holds for instructions, directives,
registers, relocation names, conditions, shift and extend words and the predicate qualifier.

No grammar declares a word token. A word token in tree-sitter splits a longer word at a shorter
keyword of higher precedence (`lsls` as `lsl` and `s`, `.macros` as `.macro` and `s`).
`test/grammar/keywords.test.ts` checks that no grammar has a word token or a case-insensitive token.

The words come from upstream:

| Words                      | GNU as                                                              | clang                                                                              |
| -------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| AArch64 conditions         | `aarch64_conds`, with the SVE aliases and `ul`                      | `parseCondCodeString`, with the SVE aliases                                        |
| AArch32 conditions         | `conds`                                                             | `ARMCondCodeFromString`                                                            |
| AArch64 shifts and extends | `aarch64_operand_modifiers`, extends by `aarch64_extend_operator_p` | `tryParseOptionalShiftExtend`, extends by the words that need no amount, and `mul` |
| AArch32 shifts             | `shift_names`, where `rrx` takes no amount                          | `tryParseShiftToken`, `parseMemRegOffsetShift`                                     |
| SVE predicate qualifier    | `parse_predication_for_operand` (`z`, `m`)                          | the predication check of the SVE predicate parser                                  |

A condition reads as one only in a condition slot ([Where a word is a
register](#where-a-word-is-a-register)). A shift word reads as one only before its amount (`lsl #2`,
`lsl r1`), which both assemblers require, so `mov x0, lsl` loads the symbol `lsl`. An extend word
reads with or without its amount (`uxtw`, `uxtw #2`). A word that is an extend in one architecture
of a language and a shift in another (`uxtw` in AArch64 and AArch32) reads as an extend.

Case follows the assemblers. GNU as reads its conditions and modifiers in lower and upper case and
lists its AArch32 shifts in both, and clang takes any case for these. A word clang knows takes any
case, and GNU as's `ul` takes lower or upper case only (`Ul` is a symbol). clang's AArch32 `uxtw`
comes from `parseMemRegOffsetShift`, which lists `uxtw` and `UXTW` only.

The scanner reads the relocation specifier after `@`, and accepts it only right after the `@`. The
relocation names of `:lo12:` and `sym(GOT)` are scanner words too, because the scanner closes `:lo`
and `sym(G` while they are typed.

Words that start with `.` cannot be identifiers, so the scanner reads them whole as well. These are
the block openers, `.loc` and `.file`, the register directives above and the alias words `.req`,
`.dn` and `.qn`, the last two in lower case only.

## Apple `L` names

In ARM (Apple) an `L` name is a `local_identifier` in operands too (`adrp x0, Ltmp0@PAGE`,
`b LBB0_2`, `.quad Ltmp0 - Lfunc_begin0`), also glued to a macro argument (`Lskip\@:`) and as an
assigned name. At the start of a statement it may also be a mnemonic, so `LDP x0, x1, [sp]` and a
macro named `Lmacro` read as instructions. The scanner reads register, condition and shift words
before the grammar's `L` pattern applies, so such a word reads as one where the parser expects it
and as a local name elsewhere:

| Input                          | Reading                                    |
| ------------------------------ | ------------------------------------------ |
| `mov x0, LR`                   | a register                                 |
| `b LR`, `.quad LR`             | the local symbol `LR`                      |
| `b LDR`                        | the local symbol `LDR`                     |
| `csel x0, x1, x2, LT`          | a condition                                |
| `add x0, x1, x2, LSL #2`       | a shift                                    |
| `b LT`, `b LSL`, `mov x0, LSL` | local symbols, as Apple's clang reads them |

## Limits

- SVE patterns (`vl8`, `all`, `pow2`), prefetch operations (`pldl1keep`), barrier options (`ish`),
  the AT, DC, IC and TLBI operations (`vae1`, `civac`) and SME's `vgx2` are symbols.
- An alias name is an identifier where it is used, and only its `.req` line shows that it names a
  register.
- A predicate takes a register only, because `pg/z` with a name is also a division.
- The grammar reads operand shapes, not instructions, so `zero {za0.s-za3.s}` parses, though the
  assemblers reject that list for `zero`.
