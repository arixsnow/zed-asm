    .intel_syntax noprefix
    .text
    .macro  zero reg
    xor     \reg, \reg
    .endm
    .globl  count
count:
    zero    eax
.Lloop:
    dec     rcx
    jnz     .Lloop
    .rept   2
    nop
    .endr
    jmp     1f
1:
    ret
