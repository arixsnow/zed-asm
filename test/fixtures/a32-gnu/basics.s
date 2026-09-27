    .syntax unified
    .arm
    .text
    .globl  add3
    .type   add3, %function
add3:                           @ r0 = r0 + r1 + r2
    add     r0, r0, r1
    add     r0, r0, r2, lsl #1
    bx      lr
