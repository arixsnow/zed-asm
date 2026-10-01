    .syntax unified
    .arm
    .text
    .globl  pick
    .type   pick, %function
pick:                               @ r0 = pick(r0)
    .ifdef  SIZE
    mov     r0, #1
    .else
    mov     r0, #2                  @ SIZE is not defined
    .endif
    .rept   2
    nop
    .endr
.Lloop:
    subs    r0, r0, #1
    bne     .Lloop
    b       1f
1:
    bx      lr
    .size   pick, .-pick

    .macro  twice reg
    add     \reg, \reg, \reg
    .endm

    .globl  double_it
    .type   double_it, %function
double_it:
    twice   r0
    bx      lr
    .size   double_it, .-double_it
    .section .rodata,"a",%progbits
    .word   1, 2
