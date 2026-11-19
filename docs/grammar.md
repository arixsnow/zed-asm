# Grammar

The five languages ([languages.md](languages.md)) are built from one manifest and one set of grammar
modules. A rule is written once and reaches every language whose grammar includes its module. A new
architecture is a new module ([adding-an-architecture.md](adding-an-architecture.md)).

A construct parses in a language when at least one of the language's assemblers accepts it.

## Manifest

`languages.config.cjs` holds the registry metadata, the editor settings of each syntax, the block
kinds both syntaxes share and the five language entries. `scripts/lib/manifest.ts` validates it on
load and names the field of any error. `scripts/build.ts` generates these files from it:

- `extension.toml`
- `languages/<dir>/config.toml` and the composed query files next to it
- `tree-sitter/tree-sitter.json`
- `tree-sitter/<grammar>/grammar.js` and `tree-sitter/<grammar>/src/scanner.c`

`scripts/tree-sitter.ts generate` then runs `tree-sitter generate` with its built-in JavaScript
engine and writes each grammar's `src/parser.c`. The generated files are committed, because Zed
reads them from the repository. `bun run check:generated` regenerates everything into `.build/` and
fails on any difference.

## Modules

`tree-sitter/common/define-grammar.js` composes a grammar from the modules the manifest names, in
the order `core`, the syntax family (`gas` or `nasm`), then each architecture (`arm`, `x86`). A
module is a function of the language's syntax, architectures and dialect. It returns three fields:

| Field     | Holds                                                                                    |
| --------- | ---------------------------------------------------------------------------------------- |
| `rules`   | the rules the module owns. A name defined by two modules is an error                     |
| `choices` | alternatives for the shared choice points, merged across modules with duplicates dropped |
| `extras`  | tokens allowed anywhere, such as block comments                                          |

The shared choice points are `_item`, `_line_content`, `_statement`, `instruction`, `_mnemonic`,
`_local_label`, `_instruction_operand`, `_operand`, `_value`, `_expression`, `_symbol`,
`_defined_name`, `immediate` and `symbol_type`.

No grammar declares a word token. The scanner reads every listed word ([arm.md](arm.md#keywords)).

`_operand` is a directive argument. `_instruction_operand` is an instruction operand, which is any
`_operand` or an ARM form. ARM registers, memory operands and register lists are not directive
arguments, and `.quad x0` names a symbol.

The modules decide what each dialect contains. Symbol types written with `@` (`.type f, @function`)
come from the x86 module, and the ARM grammars read `@note` as a comment. A module may also depend
on the dialect. The ARM module adds dollar labels only for Assembly and ARM, and Apple's positional
macro arguments only for ARM (Apple). The scanner reads such a token wherever the grammar allows it,
so the grammar alone decides the dialect.

## Query and test sources

Query fragments are in `queries/<source>/`, and corpus tests in `test/corpus/<source>/`. Each
language takes its sources in order from general to specific. They are `core`, the syntax family,
each architecture, then `<arch>.<syntax>` for rules of one pairing (AT&T operands and `@` symbol
types are in `x86.gas`). Corpus tests also take the directory named after the grammar, for the
behavior of one dialect.

The build joins the fragments of each query kind into one file, from general to specific. Zed reads
one file per query kind and paints a character with the last capture that covers it, so a later
pattern overrides an earlier one.

## Line joins

A backslash followed by a newline joins two lines in every syntax. nasm and yasm join them, and in
GNU syntax the C preprocessor does. In GNU syntax blanks may stand between the backslash and the
newline, as the preprocessor allows. `lexical.js` holds this rule (`spacedJoins`), and a test checks
it against the scanner's `ASM_SPACED_JOINS`.

In a `.S` file every line that ends in a backslash continues on the next, and a join inside a word
splices it. GNU as and clang reject a backslash-newline in the code of a `.s` file, so the
GNU-syntax languages join code lines as the preprocessor does without misreading a valid `.s` file.

A join is a blank between tokens and a splice inside a name, a number or an operator. A string
continues past it. `.long A | \` followed by `B` on the next line is one directive. A backslash that
no newline follows keeps its GNU meaning, a macro argument (`\reg`) or `\()`.

`define-grammar.js` passes every rule through `tree-sitter/common/joins.js`, which lets a join stand
between any two characters of a terminal. A join may precede every character of a token but the
first, so no token starts or ends with a join. A string of several characters becomes a pattern
aliased to its own text, and `<<` keeps its node name. A join between tokens is an extra. Numbers
are scanner tokens, and the scanner steps over a join inside a number the same way
([scanner.md](scanner.md#numbers)).

The scanner steps over joins between tokens, in strings and in raw text. In NASM its word readers
and line comments also step over them (`ASM_WORD_JOINS`, `ASM_COMMENT_JOINS`). At a backslash that
is no join between two tokens, the scanner hands the rest of the scan a lexer that offers the
backslash again, and every token is decided as without joins.

Limits:

- In GNU syntax a word the scanner reads (a mnemonic, a directive, a register, a prefix or a
  statement's label) ends at a backslash. The scanner gets one token end and cannot read past the
  backslash and return, so `push\width` (a word and a macro argument) and `.lo\` followed by `ng`
  (one word) cannot be told apart.
- In GNU syntax a line comment ends at its line end. In a `.S` file the preprocessor continues a
  `// note` that ends in a backslash on the next line, and GNU as does not for a `.s` file. Both
  open as the same language.
- A comment opener split by a join (`/`, backslash, newline, `*`) is not joined.

## Statements

A statement ends at a newline, a statement separator or the end of the file. GNU as reads a missing
final newline as one (`end of file not at end of a line; newline inserted`). The scanner reads the
end of the file as a zero-width terminator, and as the closer of each block still open there.

The top level and every body are one list of statements and label blocks.

## Labels

Local labels are the node `local_identifier`. They are the names each assembler keeps out of the
symbol table:

| Dialect             | Local names                                                                |
| ------------------- | -------------------------------------------------------------------------- |
| ELF (GNU as, clang) | `.L` names                                                                 |
| ARM (Apple)         | `L` names (`Ltemp` never reaches the Mach-O object file, and `.Ldot` does) |
| NASM                | names that start with `.` or `$.`                                          |

Other names, such as `.text`, are identifiers. In ARM (Apple) an `L` name is also local in operands,
except the seven words that are also a register, a condition or a shift
([arm.md](arm.md#apple-l-names)).

A global label starts a `label_block`. The block holds everything up to the next global label or the
end of the file, the span `.size f, .-f` measures. Local labels, comments and preprocessor lines
inside the span belong to the block. So do the comment and definition lines after its last
instruction, up to the next global label:

```asm
main:
    ret
    // end of main
    .equ SIZE, 4
helper:
```

The comment and the `.equ` line are in the block of `main`. Lines before the first global label stay
at the top level.

A label block takes every statement after it (right precedence). No statement follows a label block
in the tree, and tree-sitter reuses a whole block after an edit ([performance.md](performance.md)).
A second global label on the same line, after another label or after `;`, starts its own block. A
global label in a body starts a block inside the body, and a block between two global labels belongs
to the label block before it.

A label after a statement on the same line (`nop main:`) is an error in GNU syntax, as for the
assemblers. nasm and yasm reject it too. The NASM grammar reads it as a segment with its operand
missing, the reading `es:` needs while it is typed.

Numeric labels are `numeric_label`, defined (`0:`, `1:`, `10:`) or referenced (`1b` backward, `1f`
forward). Only lower-case `b` and `f` count, so `0b101` and `0x1f` stay integers. `1B` and `1b:` are
errors. A blank may stand before a label's colon (`lbl :`, `.Lx :`, `1 :`). Dollar labels (`1$:`,
`1$`) parse in Assembly and ARM only. GNU as for AArch32 accepts them and forgets them at the next
non-local label.

A label whose name is a macro argument or a concatenation (`\name:`, `\n\()_end:`) starts no block,
because the name exists only after expansion.

## Blocks

Macros, conditionals and repeat blocks are blocks, and in NASM structures too
([nasm.md](nasm.md#structures)). Each has a header, a `body` of statements and label blocks, and a
closer:

| Node               | Header                                                                     | Clauses                                                     | Closer                 |
| ------------------ | -------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------- |
| `macro_definition` | `.macro`, the name and the parameters                                      | none                                                        | `.endm` or `.endmacro` |
| `conditional`      | an `.if` opener and its condition                                          | `elseif_clause`s, then an `else_clause`, each with its body | `.endif`               |
| `repeat_block`     | `.rept` and a count, or `.irp` and `.irpc` with a parameter and its values | none                                                        | `.endr`                |

The `.if` openers are `.if`, `.ifdef`, `.ifndef`, `.ifnotdef`, `.ifb`, `.ifnb`, `.ifc`, `.ifnc`,
`.ifeqs`, `.ifnes`, `.ifeq`, `.ifne`, `.ifge`, `.ifgt`, `.ifle` and `.iflt`, which every GNU
assembler accepts. Every branch of a conditional parses, `.if 0` included. `.irp` and `.irpc` values
are separated by commas or blanks (only commas in ARM (Apple)).

A body starts at the end of its header line, with the newline or `;` that ends the header, and runs
to the next clause or the closer. Zed indents from ranges that start on the line above, and every
block and clause indents alike ([editor.md](editor.md)).

The scanner reads block words as whole words in any case, as GNU as accepts them. `.macros` and
`.ifx` are ordinary directives ([arm.md](arm.md#keywords)). The header is a rule of its own. A name
the header requires closes like a missing operand when the line ends early, so a header being typed
never takes in the next line. A closer ends its block whatever follows it, and the rest of its line
must be empty. `.endif nop` closes and then reports `nop`, as GNU as does.

### Nesting

The assemblers read the body of a macro or repeat block as text up to its closer. `.endm` ends a
macro and `.endr` a repeat block, even while a block opened inside is still open. The scanner does
the same. At `.endm` it ends every conditional and repeat block still open inside, and at `.endr`
every conditional, each with the hidden closing token. Then it reads the closer. `.endif` never ends
a macro or a repeat block.

The scanner reads `.else` and `.elseif` like closers, to know where one fits. A second `.else` in a
conditional, or `.elseif` after `.else`, is a token no rule accepts and parses as an error. Both
assemblers reject them. A closer outside any block, or `.else` outside a conditional, parses as an
ordinary directive, because a macro can supply the other half.

As a limit, the scanner does not see whether a macro or repeat block encloses a line. A stray
`.endm` or `.endr` inside a conditional also ends that conditional, where GNU as ignores it.

### End of file

A block open at the end of the file ends there, with a hidden zero-width token from the scanner. The
tree shows a closer only where the text has one. The body of such a block is an `unclosed_body`, and
`body` is a body that a closer or clause follows. The assemblers also end every open block at the
end of the file, and report it. The grammar does not report it.

When the last line is broken and no newline follows it, the scanner still closes the innermost block
at the end of the file. Error recovery then keeps every block, and only the broken line is an error
node. A `.` typed for `.endm` on the last line of a new file leaves the macro, the color of its name
and its outline entry in place.

The tokens that close the input carry a one-byte scanner state that no other token has. In error
recovery tree-sitter ignores a zero-width token unless the scanner state changed, and the state
makes the first of them count. When the token before already closed the input, the scanner writes
nothing during recovery.

## Open constructs

While a line is typed its last construct is often open. The scanner closes it with a zero-width
token, so error recovery never pulls in the next line. These close at the line end, before a
separator, or before any character that cannot continue them:

- an operand missing after a comma
- an expression missing after an operator, `(`, `#` or `$`
- a parenthesis, bracket, register list or GNU-syntax string left open
- a relocation without its specifier, and a register without its name after `%`
- in ARM, a register range without its end, a `:lo12:` relocation without its name or second colon,
  and a `sym(GOT)` suffix without its name or `)`

Each missing piece and each open construct has its own closing token ([scanner.md](scanner.md)).
`mov x0, , x1` keeps both operands, and `ldr x0, [x1` closes its bracket at the line end. Character
constants and strings end at the closing quote or the line end, unless the line ends in a join,
which continues them.

Three tests cover this:

1. `test/grammar/typing.test.ts` types every prefix of every fixture line, with and without the
   final newline, and of every corpus example. Every other line must parse as before, except these:
   - the lines a typed line continues into through a join (any line but a GNU-syntax line comment)
   - the lines an unclosed `/*` reaches, up to its `*/` or the end of the file
   - the lines an unclosed C macro call takes, up to its `)`
   - for a typed line that holds a block's opener, clause or closer, also on a line it joins before
     or after the typing, the other such lines of that block and of the blocks around it

   A mode line (`.intel_syntax`, `.att_syntax`, `.altmacro`, `.noaltmacro`) is not checked, because
   its mode changes the lines after it.
2. The same file types every printable character after each kind of open construct, in every
   grammar. It types them before a next line and as the last line of a file without a final newline,
   inside a `.if` and a `.rept` (a label block in NASM) that the end of the file closes. The lines
   before must parse unchanged.
3. `test/grammar/closing.test.ts` checks the scanner against each generated `parser.c`. It parses a
   line that stops at an open construct, once for every grammar site that uses a closing token, and
   reads from tree-sitter's debug log the parse states before any error recovery. For every
   printable character followed by `a` or `=`, the scanner must close exactly when no token those
   states accept can start the text, and with the token that site uses.

## Assemblers

The tables in the following sections were measured with GNU as 2.46.1 (x86-64, AArch64) and 2.45
(AArch32) and clang 22.1 (x86-64, AArch64, AArch32, Apple arm64). These forms are accepted by all of
them:

- `.macro` with the parameters `a, b`, `a=1`, `a = 1`, `a:req` and `rest:vararg`, keyword calls such
  as `m b=2, a=1`, `.exitm` and `.purgem`
- in a macro body, `\name`, the counter `\@`, the separator `\()` and `\+`, each glued to other text
  (`no\s`, `\name\()_end`), as the mnemonic (`\op`) or as a label (`\name:`)
- the `.if` openers above, `.elseif`, `.else` and `.endif`
- `.rept N`, `.irp r, 1, 2` and `.irpc c, 123`, each closed by `.endr`
- numeric labels and a blank before a label's colon
- `.equ`, `.set` and `.equiv` with `NAME, expr` (the comma is required), `NAME = expr` and
  `. = expr`
- decimal floats in `.float`, `.single` and `.double` (`1.5`, `.5`, `1.`, `1e3`, `1E3`, `1.5e+3`,
  `-1.5`, `1` and `inf`)
- blank-separated arguments in `.loc 1 2 3 prologue_end is_stmt 0`, where commas are an error
- adjacent strings in `.ascii` (`.ascii "a" "b"` stores `ab`)
- empty arguments (`.p2align 4,,10`, `.balign 8,,4`)
- `.byte 1 -2` as one value, -1
- `.2byte`, `.4byte` and `.8byte`, which compilers write in debug information

`1.5f`, `.byte 1 2`, `.1byte`, `.3byte` and `.16byte` are errors to all of them.

The assemblers differ in these forms:

|                                                   | GNU as x86-64 | GNU as AArch64 | GNU as AArch32                                  | clang ELF                                                          | clang Apple arm64    |
| ------------------------------------------------- | ------------- | -------------- | ----------------------------------------------- | ------------------------------------------------------------------ | -------------------- |
| Directive names in upper case                     | accepted      | accepted       | accepted                                        | accepted, except `.text`, `.data`, `.section`, `.endm` and `.endr` | same as clang ELF    |
| `.endmacro`                                       | error         | error          | error                                           | closes a macro                                                     | closes a macro       |
| Blanks between macro parameters (`.macro m a b`)  | accepted      | accepted       | accepted                                        | accepted                                                           | error                |
| Blanks between `.irp` and `.irpc` values          | accepted      | accepted       | accepted                                        | error                                                              | error                |
| One-line blocks (`.rept 2; nop; .endr`)           | accepted      | accepted       | accepted                                        | accepted                                                           | `;` starts a comment |
| `$0` to `$9` and `$n` in a macro body             | error         | error          | error                                           | error                                                              | positional arguments |
| Dollar label `1$:`                                | error         | error          | accepted, forgotten at the next non-local label | error                                                              | error                |
| `.eqv NAME, expr`, `NAME == expr`                 | accepted      | accepted       | accepted                                        | error                                                              | error                |
| Prefixed floats `0f1.5`, `0d1.5`, `0f+1.5`, `0f1` | accepted      | accepted       | accepted                                        | error                                                              | error                |
| Hexadecimal float `0x1.8p0`                       | error         | error          | error                                           | accepted                                                           | accepted             |
| Integer suffixes `1u`, `1UL`, `1ll`, `0x10ull`    | ignored       | ignored        | ignored                                         | ignored                                                            | ignored              |
| Integer suffixes `1LU`, `1llu`                    | ignored       | ignored        | ignored                                         | error                                                              | error                |
| Macro call `m 1 2`                                | two arguments | two arguments  | two arguments                                   | two arguments                                                      | one argument `12`    |
| Macro call `m 1 -2`                               | two arguments | one argument   | one argument                                    | one argument                                                       | one argument         |
| Adjacent strings in `.asciz` and `.string`        | accepted      | accepted       | accepted                                        | error                                                              | error                |

GNU as takes any of `f`, `d`, `e`, `r`, `s`, `x`, `h`, `p` and `b`, in either case, as the letter of
a prefixed float. Inside a float directive it reads `0x10` as 10.0, the prefix followed by a decimal
number. clang reads `.MACRO` but ends a macro body only at a lower-case `.endm` or `.endmacro`, and
a repeat body only at a lower-case `.endr`.

## Macros

A macro definition takes the parameters `a`, `a=default`, `a:req` and `a:vararg`, separated by
commas or blanks (only commas in ARM (Apple)), and closes with `.endm` or `.endmacro`. A comma may
follow the name (`.macro loadsp, rb`), as in both assemblers.

`\name`, `\@` and `\+` are `macro_argument` nodes. Text glued to an argument forms a `concatenation`
(`no\s`, `\name\()_start`, `.Lx\@`). A concatenation may be a mnemonic, an operand, a label, or the
name of a macro (`.macro w_avg_\bd\()_2 tap`), an assignment (`\sym\()_x = 2`) or a register alias
(`\name .req \tgt`). An ARM register glued to an argument heads the concatenation as a `register`
(`v4\sz`). GNU as reads these glued forms:

| Form      | Reading                                      | Example     |
| --------- | -------------------------------------------- | ----------- |
| `\()`     | a separator between glued pieces             | `\a\()_x`   |
| `\(text)` | the literal text, an `identifier` piece      | `nop\(lit)` |
| `\name'`  | the argument, its closing apostrophe dropped | `\a'x`      |

The scanner reads glued pieces only where nothing separates them from the piece before, and never
during error recovery, so recovery cannot glue the next line onto a name.

A macro call takes keyword arguments (`m b=2, a=1`). A keyword is a word followed by `=` (not `==`),
with blanks allowed, so a register name may be one (`do_thumb_abort fsr=r1, pc=r4, psr = r5`). The
first argument may be empty (`diff_pixels , aligned=1`).

ARM (Apple) adds Apple's positional arguments `$0` to `$9` and `$n`, and requires commas between
parameters, as its assembler does. Apple's clang substitutes a positional argument whatever follows
it, so `$0.16b` and `$0abc` are the argument glued to text. These words are macro arguments in ARM
(Apple) before any other reading.

### Call arguments

A macro call has the form of an instruction, and its arguments may be separated by blanks. The
generated instruction and directive tables tell a call from an instruction
([scanner.md](scanner.md#generated-tables)), and only a call takes blank-separated arguments. nasm
and yasm pass `1 2` in `m 1 2` as one argument. The other assemblers are in the table above.

Instruction operands are separated by commas, as every assembler requires. `movl %eax %ebx`,
`add x0, x1 x2`, and NASM's `mov eax 1` and `push 1 2` are errors. In NASM a name or a macro token
before an operand may be a macro that expands first
([nasm.md](nasm.md#macro-calls-and-macro-words)). Directive arguments and `.if` conditions are
separated by commas. As a limit, a macro named like an instruction (`.macro mov a b`, then
`mov 1 2`) reads as the instruction.

A blank in a macro call, an `.irp` or `.irpc` value list or a macro parameter list follows GNU as.
After a symbol character or a string, a blank before a symbol character, a quote or a backslash
separates two items. Every other blank is dropped. The symbol characters are generated per target
([scanner.md](scanner.md#generated-tables)). ARM takes the AArch64 and AArch32 characters, x86 (GAS)
the x86 ones and Assembly both. `m a "b"` and `m a \b` separate everywhere, and `m 1 -2` and
`m foo (%rax)` separate in x86 (GAS) and Assembly.

| After a dropped blank      | Reads as                                 | Example                         |
| -------------------------- | ---------------------------------------- | ------------------------------- |
| an operator                | one expression                           | `m 1 -2` in ARM                 |
| `(` after a name           | a call or a relocation suffix            | `m F (1)`, `m sym (GOT)` in ARM |
| any other start of a value | one `argument` holding the joined values | `m x0 #1` in ARM, `m a ~b`      |

The separating and the joining blank are zero-width scanner tokens. Assembly writes neither before
`#`, which is x86's comment. clang ELF splits at every blank no operator follows, and reads x86
`m 1 -2` as one argument. ARM (Apple) follows Apple's clang, which never splits at a blank, and
joins every two blank-separated values.

Block headers follow the same rule. In ARM `.irp r x0 #1` has the one value `x0#1`,
`.macro m a, b=1 #1` the default `1#1` and `b=1 -2` the default `1-2`. In x86 (GAS) `#1` is a
comment and `b=1 -2` is an error, as in GNU as.

An ARM shift joins its amount (`lsl #2`), also across a kept blank in a macro list
(`add_sh r2, r2, r4, asr r3`). GNU as reads a `:vararg` parameter the same way. The shift words are
the ones the assemblers take with an amount (`lsl lsr asr ror asl msl` and the extends `uxtb` to
`sxtx`). Alone they are symbols.

Neither assembler splits an argument inside parentheses. Parentheses that hold no expression are an
`argument_list`, split at commas and at blanks before a character that starts an operand and cannot
continue the one before. C macro call arguments follow their own rules ([C macro
calls](#c-macro-calls)).

Limits:

- A kept blank separates after `)`, after `]` and `}` in x86 (GAS), and after a character constant.
  GNU as drops it there (`m 4(%rsp) 8(%rsp)` is one argument in GNU as).
- An operator is never an item of its own. `m 1 - 2` in x86 is three arguments in GNU as.
- A shift passed to a plain parameter is two arguments in GNU as (`asr`, `r3`).

### Alternate macro mode

`.altmacro` turns GNU as's alternate macro mode on and `.noaltmacro` turns it off. The words are
generated from GNU as's `s_altmacro` entries and clang's `DK_ALTMACRO` and `DK_NOALTMACRO`. The
scanner keeps the mode, in text order, in one bit of its state. Every GNU-syntax language reads it.
In the mode a macro call argument, a keyword argument's value and an `.irp` or `.irpc` value may
also be one of these items, as GNU as reads them:

| Item     | Node                                                    | Example                    |
| -------- | ------------------------------------------------------- | -------------------------- |
| `%expr`  | `unary_expression` with the operator `%`                | `put_pic %(.Lpic_idx - 1)` |
| `<text>` | `string`, nested pairs inside, `!` escaping a character | `m <q r>, <a!>b>`          |
| `'text'` | `string`, `''` for a quote                              | `m 'it''s'`                |

A `<` ends the argument before it, glued or after a blank (`m a<b c>` is `a` and `<b c>`). An
unclosed `<text` or `'text` ends at the line end. Outside the mode `%` and `<` are operators
(`m %function`, `m a<b`).

## Directives

`NAME = expr`, `NAME == expr` and `. = expr` are an `assignment`. `.equ`, `.set`, `.equiv` and
`.eqv` stay directives whose first argument is the name, and `.set noreorder` is a plain directive.

After `.loc` and `.file` the arguments are blank-separated integers, strings, names and negated
values (GCC writes `view -0`).

The string directives are `.ascii`, `.asciz` and `.string` to `.string64`, from GNU as's `stringer`
handler and clang's `DK_ASCII`, `DK_ASCIZ` and `DK_STRING`. Their arguments are separated by commas
or blanks. GNU as joins adjacent strings. A name or a C macro call stands for a macro that expands
to a string (`.ascii KERN_WARNING "..."`).

Every other directive separates its arguments with commas, and an argument may be empty.

## Numbers

An `integer` is decimal, octal, `0x` or `0b`, with the suffixes its assemblers ignore, `U` and then
`L` or `LL`, in any case. In ARM (Apple) GNU as's `U` after the `L`s (`1LU`) is not part of the
integer, because clang rejects it.

A `float` has the decimal, prefixed (`0f1.5`) or hexadecimal (`0x1.8p0`) form. A prefixed float with
`x` or `b` needs a point, so `0x10` and `0b11` stay integers.

## Expressions

GNU as and clang group operators by GNU's precedence, not C's, on every ELF target, x86 and ARM.
clang uses a third order on Apple targets, and nasm and yasm use C's. These are the levels from the
highest to the lowest, measured with fifteen `.if` probes per assembler (`2 + 3 << 1` is 8 in GNU's
order, 10 in Apple's and nasm's):

| Level | GNU syntax on ELF | Apple (clang) | NASM and yasm |
| ----- | ----------------- | ------------- | ------------- |
| 1     | `* / % << >>`     | `* / %`       | `* /`         |
| 2     | `\| & ^ !`        | `+ -`         | `+ -`         |
| 3     | `+ -`             | `<< >>`       | `<< >>`       |
| 4     | comparisons       | comparisons   | `&`           |
| 5     | `&&`              | `\| & ^`      | `^`           |
| 6     | `\|\|`            | `&& \|\|`     | `\|`          |
| 7     |                   |               | comparisons   |
| 8     |                   |               | `&&`          |
| 9     |                   |               | `\|\|`        |

Assembly, ARM and x86 (GAS) use the first column, ARM (Apple) the second and x86 (NASM) the third.
Operators of one level group from the left. Precedence shapes the tree only, never a color.

Assembly, ARM and x86 (GAS) read the binary `!` (or-not, `1 ! 2` is `1 | ~2`), which GNU as reads on
every target. clang takes it for x86 and AArch64 ELF and rejects it for AArch32 and Apple. `%` is
the remainder in every GNU-syntax language. In x86 code a `%` that starts a register name is a
register ([x86.md](x86.md)).

In Intel syntax GNU as keeps its own order. It reads `shl`, `shr` and `mod` at level 1, `and`, `or`
and `xor` at level 2, and `eq`, `ne`, `lt`, `le`, `gt` and `ge` with the comparisons. clang's Intel
mode uses C's order (`2 + 3 shl 1` is 8 in GNU as and 10 in clang). The grammar follows GNU as.

### Dollar names

In GNU syntax `$` starts a name (`$x:`, `.word $4`, `foo+$bar`). GNU as and clang read it as a name
character. Before an operand where an immediate fits and a register may stand, `$` is the immediate
prefix instead. That holds in instruction operands, macro arguments and the ARM directives with
register operands ([arm.md](arm.md#directives-with-register-operands)).

| Input                        | x86 (GAS)    | ARM and Assembly                | ARM (Apple)                     |
| ---------------------------- | ------------ | ------------------------------- | ------------------------------- |
| `mov $4, %eax`, `add r0, $4` | an immediate | an immediate, as `#4`           | the macro argument `$4`         |
| `add x0, x1, $foo`           | -            | an immediate                    | the name `$foo`                 |
| `.word $4`, `.long $foo + 4` | the names    | the names                       | `$4` an argument, `$foo` a name |
| `$x:`                        | a label      | a label                         | a label                         |
| `movw r0, $:lower16:x`       | -            | an error, as in both assemblers | an error                        |

As a limit, `.pad $4` reads `$4` as a name, while GNU as reads the immediate 4 there.

### Quoted names

A quoted name is a symbol where a symbol is needed. That is a label (`"a b":`), an operand, after
`$`, with `@PLT` or `:lo12:`, and in memory operands. GNU as and clang accept all of these on every
target, and GCC's Intel output quotes every symbol. A quoted operand alone stays a string, because
GNU macros take string arguments (`ALTERNATIVE "", "lfence", X86_FEATURE_LFENCE`).

### Symbol types

A `symbol_type` is `%` and a name or a number in every GNU dialect, and `@` and a name or an
`integer` in x86 (GAS) and Assembly (`.type f, %function`, `.type f, %STT_FUNC`, `.type f, %2`,
`.section .c,"a",@0x70000001`). Any name reads, because both assemblers parse one before they check
it. GNU as rejects `%Function` and warns on LLVM's `%llvm_lto`, and clang rejects GNU as's `%exidx`.
GNU as reads a number for both directives, and clang for a section type only (`%2` is an error to
clang). No list of ELF type names is kept.

Mach-O section types are names, so `regular`, `cstring_literals` and `symbol_stubs` are identifiers.
The types that start with a digit (`4byte_literals`, `8byte_literals`, `16byte_literals`) do not
match the identifier pattern of `lexical.js`. They are scanner words, from a table generated from
GNU as's `bfd_mach_o_section_type_name` and clang's `SectionTypeDescriptors`. Both assemblers
compare the type as written, so `4BYTE_LITERALS` is no type.

## C preprocessor lines

A line that starts with a C preprocessor directive, indented or not, is a `preproc_line`, or a
`preproc_define` for `#define`. After a label or a `;` a `#` follows the dialect's comment rules,
because the preprocessor recognizes directives only at the start of a line.

The directives are the generated table `ASM_GNU_CPP_DIRECTIVES`, read from the cases of clang's
`HandleDirective` (`clang/lib/Lex/PPDirectives.cpp`). The handler each word calls gives its form:

| Form                               | Words                                                                                                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Name, parameters and value         | `define`                                                                                                                                                                             |
| A C expression                     | `if`, `elif`                                                                                                                                                                         |
| A header name or string, then text | `include`, `include_next`, `import`, `embed`                                                                                                                                         |
| Text                               | `ifdef`, `ifndef`, `elifdef`, `elifndef`, `else`, `endif`, `undef`, `line`, `error`, `warning`, `pragma`, `ident`, `sccs`, `assert`, `unassert`, `__public_macro`, `__private_macro` |

GCC's directives are a subset of these (GCC 16.2). Two rows hold directives of one preprocessor
only. clang names `assert` and `unassert` but passes them to the assembler, and GCC implements them.
clang reads `__public_macro` and `__private_macro` when modules are on, and GCC passes them on.

clang's other words are left out, and those lines read as comments, as the assembler reads them.
`module` and `__preprocessed_module` are directives only after a C++ `module` keyword, never after
`#`. `__preprocessed_import` needs C++ modules. `__include_macros` is an error outside clang's own
buffers, and GCC does not know it. The generator stops if any of these facts changes, and on a
handler it has no form for.

Directive lines are preprocessor lines, comments are comments, and every other line parses as
assembly, in every branch of a conditional group. No condition is evaluated, `#if 0` included. C
text outside a comment is an error, such as C declarations in an `#ifdef` group.

The directive word is compared as written, so `#DEFINE` is a comment. It ends where a C identifier
ends. `.` and `$` are not identifier characters in assembler-with-cpp mode, so `#endif.x` is
`#endif` with the argument `.x`.

After the directive the scanner reads the rest of the line as the preprocessor does in
assembler-with-cpp mode (GCC 16.2 and clang 22.1, `-E -x assembler-with-cpp`):

- Only `//` and `/*` start comments. `#`, `@` and `;` are text, so `#define SEP ;` and
  `#define STR(x) #x` keep their arguments.
- `"` starts a literal that ends at the next unescaped `"` or at the line end. `'` starts one that
  ends at the next `'` or at the line end.
- After `#include`, `#include_next`, `#import` and `#embed`, `<...>` is one header name, and the
  `//` in `<a//b.h>` is no comment. An unclosed `<` is a header name being typed.
- A backslash before a newline joins the two lines everywhere, inside literals and `//` comments
  too, also with blanks between the backslash and the newline. Outside literals a backslash has no
  other effect.

A `preproc_define` has the macro's `name`, its `parameters` when `(` follows the name without a
blank, and its `value`, the rest of the line as above. The name takes the characters of a C
identifier. `#define a.b 1` defines `a` with the value `.b 1`, `#define a$b 1` defines `a` with the
value `$b 1`, and `#define P (x)`, with a blank before the parenthesis, defines `P` as `(x)`.
Parameters are names, `...`, or GNU's named variadic form `args...`. A `#define` without a name is
complete while it is typed. One whose name is not an identifier (`#define 1 2`, `#define $x 1`) is
an error, as for the preprocessor. The argument of `#if` and `#elif` is a `preproc_condition`, a C
expression.

Comments after the directive are `preproc_comment` children of the line, and trailing blanks belong
to the line. A cursor at the end of `#endif /* X */`, also after trailing blanks, is in the
`preproc` scope.

As a limit, a directive word split by a join and a comment between `#` and the word
(`# /* c */ define N`) make a directive to the preprocessor and a comment line here.

## C macro calls

In `.S` files the C preprocessor runs before the assembler, and the source holds C macro calls
(`PER_CPU_VAR(x)`, `USER(9f, ldr x0, [x1])`, `L(loop)`). The GNU-syntax languages read them by these
rules:

| Construct                                                        | Reading                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name(`                                                          | `macro_call` with the fields `function` and `arguments`, except AT&T memory, whose parentheses start with a register, or with a comma that an index or a scale follows (`sym(%rip)`, `t(,%rax,8)`, `4(,1)`). Otherwise `(,` opens a call whose first argument is empty (`F(, x y)`) |
| `name (`                                                         | a call (`.word F (1)`), inside a call argument too unless the parentheses hold an AT&T memory operand with a register (`END (SYM (a, b))`), and two arguments where GNU as keeps the blank in a macro list (`m F (1)` in x86 (GAS) and Assembly)                                    |
| statement `name(...)`                                            | a call statement when the parentheses end the statement at a line end, separator or comment, also after x86 decorators, which become `decorator` children (`_ASM_EXTABLE(1b, 3b)`, `ENTRY_P2ALIGN (STRCHR, 5)`, `CMP_R1_S2_VMM (%VMM(0), (%rsi), %VMM(1), %k1){%k2}`)               |
| statement `name(...)` and operands                               | an `instruction` whose `mnemonic` is the call, when `(` follows the name directly and a blank and an operand follow the parentheses (`__ASM_SIZE(push,) %__ASM_REG(dx)`)                                                                                                            |
| instruction name before `(`                                      | a call when `(` follows directly (`PLD( pld [r1] )`, `BX(ip)`), and the instruction when a blank separates them (`lgdt (%eax)`)                                                                                                                                                     |
| `name(...):`                                                     | a `label` whose `name` is the call (`L(loop):`)                                                                                                                                                                                                                                     |
| line end inside a call                                           | a blank, at any nesting depth inside the call                                                                                                                                                                                                                                       |
| argument                                                         | empty, one item, or a run of items                                                                                                                                                                                                                                                  |
| item                                                             | an instruction operand (an Intel operand in Intel mode), a pp-number or a probe argument                                                                                                                                                                                            |
| probe argument                                                   | `probe_argument` with the fields `size` and `operand`, a size (an integer, a negated integer or a name) glued to `@` and an operand (`4@%eax`, `-4@8(%esp)`, `LP_SIZE@%RDI_LP`, `8@x0`)                                                                                             |
| statement in an argument                                         | split at the dialect's separator ([scanner.md](scanner.md)), and may start with labels (`EXC(1: movw (%esi), %bx)`)                                                                                                                                                                 |
| blank, then `[`, `(`, or an operator directly before its operand | the next item (`pld [r1, #-4]`, `movw (%esi)`, `jmp *%\reg`)                                                                                                                                                                                                                        |
| operator with blanks on both sides                               | a binary operator (`i + 2`)                                                                                                                                                                                                                                                         |
| digit word                                                       | an assembler number when one matches the whole word (`1f`, `1.5`, `1e+5`), otherwise a pp-number                                                                                                                                                                                    |
| pp-number                                                        | one `identifier`, an assembler number token followed by the scanner's glued text (`128_more`, `28bytes`)                                                                                                                                                                            |
| call glued to a name                                             | a `concatenation` where a value stands (`.word F(x).y`)                                                                                                                                                                                                                             |

Arguments may span lines, and a blank may stand between the macro name and `(`. The rules for
instruction names and for blanks inside arguments choose by shape, because the reading of the
preprocessor depends on `#define`s the parser does not see. `.macro` arguments follow GNU as instead
([Call arguments](#call-arguments)).

A SystemTap probe in assembler code stores its arguments as a string in the note section
(`.ascii #x`). Each argument is `N@OP`, an optional size `[-]1`, `2`, `4` or `8` and an operand of
the architecture. In the source the size may be a macro name (`LP_SIZE`). The `@` belongs to a probe
argument when it is glued to the size and an operand starts right after it, and in ARM that comes
before the `@` comment. Where a relocation fits, after a name, a word after the `@` stays a
relocation specifier (`sym@PLT`).

The glued text of a pp-number takes the dialect's name characters, `$` included in GNU syntax. GCC
and clang in assembler mode end a pp-number at `$`. A sign ends the glued text, so `0x1e+2` is an
expression.

The scanner state holds the number of open calls. A call marker raises it. The call's `)`, read by
the scanner, and the call's zero-width closing token lower it. While the count is positive a line
end is a blank before the next item of a run, and otherwise a hidden extra token. Error recovery
writes no such token, and a statement start resets the count to zero. An unclosed call takes the
following lines as arguments up to the next `)`, as an unclosed `/*` takes them as a comment.

Limits:

- `push(%rax)` reads as a call, and `X(a -1)` as two items.
- `F(x)y` reads as one concatenation. cpp puts a blank before `y` when the expansion ends in a name.
