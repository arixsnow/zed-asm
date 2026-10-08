    .syntax unified
    .thumb
    .arch   armv8.1-m.main
    .arch_extension mve.fp
    .text
    .globl  vectors
    .type   vectors, %function
    .thumb_func
vectors:
    vldrw.u32 q0, [r0, #4]!
    vldrb.u8 q0, [r0, q1]
    vldrw.u32 q0, [q1, #4]
    vldrw.u32 q0, [r0, q1, uxtw #2]
    vld20.32 {q0, q1}, [r0]
    vpt.s32 ge, q0, q1
    vaddt.i32 q0, q1, q2
    vptte.s32 lt, q0, q1
    vaddt.i32 q0, q1, q2
    vaddt.i32 q0, q1, q2
    vadde.i32 q0, q1, q2
    bfcsel  3f, 4f, 5f, eq
    nop
3:
    nop
4:
    nop
5:
    vcmp.s32 lt, q0, q1
    vmsr    vpr, r0
    csel    r0, r1, r2, le
    wls     lr, r0, 2f
1:
    nop
    le      lr, 1b
2:
    bx      lr
    .size   vectors, .-vectors
