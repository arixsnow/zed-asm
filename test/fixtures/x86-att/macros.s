    .macro pair a, b=2
    .byte \a, \b
    .endm

    .macro save reg, width, tag:req, rest:vararg
    push\width \reg
    .byte \tag, \rest
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
    \op \reg
    .endm

    .text
    .globl entry
entry:
    gen first
    save %rax, q, 1, 2, 3
    upper
    apply inc, %rax
    .data
    pair b=5, a=4
    pair 7
    spaced 1
    blanks 1, 2
    count
    count
    .purgem pair
