    .syntax unified
    .thumb
    .text
    .globl  double_it
    .type   double_it, %function
    .thumb_func
double_it:
    lsls    r0, r0, #1          @ r0 *= 2
    bx      lr
