    .macro pair a, b=2
    .byte \a, \b
    .endm

    .macro load reg, value:req, rest:vararg
    mov \reg, #\value
    .byte \rest
    .endm

    .macro emit
    .byte $0, $1, $n
    .endm

    .macro gen name
\name\()_start:
    ret
Lskip\@:
    .exitm
    .endm

    .macro spaced a, b = 3
    .byte \a, \b
    .endmacro

    .macro count
    .byte \+
    .endm

    .MACRO upper
    nop
    .endm

    .macro apply op, reg
    \op \reg, \reg, #1
    .endm

    .section __TEXT,__text,regular,pure_instructions
    .globl _entry
_entry:
    gen first
    load x0, 1, 2, 3
    upper
    apply add, x0
    ret
    .data
    pair b=5, a=4
    pair 7
    emit 1, 2
    spaced 1
    count
    count
    .purgem pair
