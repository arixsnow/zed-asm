    .syntax unified
    .arm
    .text
    adrl    r0, r1
    ldrd    r0, r2
    .fpu    neon
    vadd    d0.f32, d1.F32, d2.f32
    vmov    r0, d0.u32[1]
    vld1    {d0.u8-d1.u8}, [r0]
    mov     r1.i32, r2
sum .dn d4.f32
pair .qn q2.s16
lane .dn d5.f32[1]
    vadd    sum, sum, sum
    .macro  jump cond
    b\cond   r1
    ldr\cond r0, r2
    .endm
    jump    eq
    .syntax divided
    ldreqb  r0, r1
r2:
r1:
    nop
