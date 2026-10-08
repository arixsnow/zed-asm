    .syntax unified
    .thumb
    .text
    .globl  operands
    .type   operands, %function
    .thumb_func
operands:
    ldr.w   r0, [r1, #4]
    ldr     r0, [r1, #4]!
    tbb     [r0, r1]
    tbh     [r0, r1, lsl #1]
    push    {r4-r7, lr}
    pop     {r4-r7, pc}
    ldm     r0!, {r1-r3}
    it      le
    movle   r0, #1
    ite     eq
    moveq   r0, #1
    movne   r0, #2
    IT      NE
    movne   r1, #1
    cbz     r0, 1f
    cbnz    r0, 1f
    beq.n   1f
    bne.w   1f
    ldr     r0, =sym
    movw    r0, #:lower16:sym
    movt    r0, #:upper16:sym
1:
    bx      lr
    .size   operands, .-operands
