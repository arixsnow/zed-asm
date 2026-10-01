    .macro pair a, b=2
    .byte \a, \b
    .endm

    .macro load reg, value:req, rest:vararg
    mov \reg, #\value
    .byte \rest
    .endm

    .macro gen name
\name\()_start:
    ret
.Lskip\@:
    .exitm
    .endm

    .macro spaced a, b = 3
    .byte \a, \b
    .endm

    .macro blanks a b
    .byte \a, \b
    .endm

    .macro count
    .byte \+
    .endm

    .MACRO upper
    nop
    .endm

    .macro apply op, reg
    \op \reg, \reg, #1
    .endm

    .text
    .globl entry
entry:
    gen first
    load x0, 1, 2, 3
    upper
    apply add, x0
    .data
    pair b=5, a=4
    pair 7
    spaced 1
    blanks 1, 2
    count
    count
    .purgem pair
