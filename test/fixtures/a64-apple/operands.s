    .arch   armv9-a+sve2+sme2
    .section __TEXT,__text,regular,pure_instructions
    .globl  _operands
    .p2align 2
_operands:
    STP     X29, X30, [SP, #-16]!
    LDR     X0, [X1, #8]
    LD1     {V0.16B}, [X0]
    ldr     x0, [x1, x2, lsl #3]
    ld1     {v0.16b-v3.16b}, [x0], #64
    ld1     {v0.s}[1], [x0]
    mov     v0.s[1], w0
    csel    x0, x1, x2, LT
    cset    w0, eq
    mov     x0, LR
    adrp    x0, Ltmp0@PAGE
    add     x0, x0, Ltmp0@PAGEOFF
    ldr     x0, [x0, Ltmp0@PAGEOFF]
    adrp    x0, _data@GOTPAGE
    ldr     x0, [x0, _data@GOTPAGEOFF]
    ldr     x0, =_data
    cbz     x0, LBB0_2
    b.ne    LBB0_2
    beq     LBB0_2
    ld1d    {z0.d}, p0/z, [x0, #1, mul vl]
    mova    za0h.s[w12, 0], p0/m, z0.s
LBB0_2:
    ldp     x29, x30, [sp], #16
    ret
Ltmp0:
    .quad   Ltmp0 - _operands
