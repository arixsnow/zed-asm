    .arch   armv9.4-a+sve2+sme2
    .text
    .globl  operands
    .type   operands, %function
    .p2align 2
operands:
    ldr     x0, [x1]
    ldr     x0, [x1, #8]
    ldr     x0, [x1, 8]
    ldr     x0, [x1, #8]!
    ldr     x0, [x1, #8] !
    ldr     x0, [x1], #8
    ldur    x0, [x1, #-8]
    ldr     x0, [x1, x2, lsl #3]
    ldr     x0, [x1, x2, lsl 3]
    ldr     w0, [x1, w2, sxtw]
    ldr     w0, [x1, w2, UXTW #2]
    stp     x29, x30, [sp, #-16]!
    ldp     x29, x30, [sp], #16
    ldr     x0, [ x1 , #8 ]
    add     x0, x1, x2, lsl #3
    add     x0, x1, w2, uxtw #2
    movi    v0.4s, #1, msl #8
    movz    x0, #1, lsl #16
    ld1     {v0.16b}, [x0]
    ld1     {v0.16b, v1.16b}, [x0], #32
    ld1     {v0.16b-v3.16b}, [x0], x2
    ld1     {v31.16b-v2.16b}, [x0]
    ld1     { v0.16b - v1.16b }, [x0]
    ld2     {v0.s, v1.s}[1], [x0]
    ld1     {v0.s} [1], [x0]
    tbl     v0.16b, {v1.16b}, v2.16b
    mov     v0.s[1], w0
    mov     w0, v0.s [1]
    fmla    v0.4s, v1.4s, v2.s[3]
    ld1     {v0.1d}, [x0]
    ldr     x0, =sym
    ldr     x0, =0x1234 + 4
    csel    x0, x1, x2, lt
    csinc   x0, x1, x2, NE
    cset    x0, eq
    cinc    x0, x1, ls
    ccmp    x0, x1, #0, ne
    fcsel   d0, d1, d2, gt
    b.eq    1f
    beq     1f
    cbz     x0, 1f
    tbnz    w0, #3, 1f
1:
    adrp    x0, x1
    adrp    x0, lt
    b       eq
    adrp    x0, sym
    add     x0, x0, :lo12:sym
    adrp    x0, :got:sym
    ldr     x0, [x0, :got_lo12:sym]
    movz    x0, #:abs_g1:sym
    movk    x0, #:abs_g0_nc:sym
    MOV     X0, XZR
    mrs     x0, s3_0_c1_c0_0
    mrs     x0, nzcv
    sys     #0, c7, c5, #0
    add     z0.d, z1.d, z2.d
    ptrue   p0.s, vl8
    add     z0.d, p7/m, z0.d, z1.d
    ld1d    {z0.d}, p0/z, [x0, #1, mul vl]
    ld1d    {z0.d}, P0/Z, [x0, z1.d, lsl #3]
    ld1w    {z0.s}, p0/z, [z1.s, #8]
    cntd    x0, all, mul #4
    ld1d    {z0.d-z1.d}, pn8/z, [x0]
    mova    za0h.s[w12, 0], p0/m, z0.s
    zero    {za}
    ldr     zt0, [x0]
    ret
    .size   operands, .-operands
    .data
    .quad   x0, lr
