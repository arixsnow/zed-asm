    .syntax unified
    .arm
    .text
    .globl  count
    .type   count, %function
count:
1$:
    subs    r0, r0, #1
    bne     1$
    bx      lr
