    .text
    .globl  shift_add
    .type   shift_add, %function
    .p2align 2
shift_add:                          // x0 = x1 + (x2 << 32)
    add     x0, x1, x2, lsl #32     /* block comment after code */
    mov     x3, #1; mov x4, #2
    ret
    .size   shift_add, .-shift_add
