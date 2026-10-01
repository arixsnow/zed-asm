    .syntax unified
    .thumb
    .text
    .globl  count
    .type   count, %function
    .thumb_func
count:                              @ r0 = steps down to zero
    movs    r1, #0
.Lloop:
    cbz     r0, 1f
    subs    r0, r0, #1
    adds    r1, r1, #1
    b       .Lloop
1:
    mov     r0, r1
    .rept   2
    nop
    .endr
    bx      lr
    .size   count, .-count
