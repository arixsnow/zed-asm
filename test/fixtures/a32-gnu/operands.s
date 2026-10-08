    .syntax unified
    .arm
    .fpu    neon-vfpv4
    .arch_extension virt
    .text
    .globl  operands
    .type   operands, %function
operands:
    ldr     r0, [r1]
    ldr     r0, [r1, 4]
    ldr     r0, [r1, #4]!
    ldr     r0, [r1], #-4
    ldr     r0, [r1, -r2]
    ldr     r0, [r1, +r2, lsl #2]!
    ldr     r0, [r1], -r2
    ldr     r0, [r1], r2, asr #3
    ldr     r0, [pc, #-8]
    vld1.8  {d0, d1}, [r0:128]
    vld1.8  {d0, d1}, [r0:128]!
    vld1.8  {d0, d1}, [r0 :128]
    vld1.8  {d0, d1}, [r0, :128]
    vld1.8  {d0}, [r0], r2
    vld1.32 {d0[], d1[]}, [r0]
    vld1.32 {d0[1]}, [r0]
    vmov.32 r0, d2[1]
    push    {r4-r7, lr}
    push    {r4 - r7}
    pop     {r4-r7, pc}
    ldm     r0!, {r1-r3}
    ldm     r0 !, {r1}
    ldm     r0, {r1-r3}^
    stmdb   sp!, {r4, lr}
    vpush   {d8-d15}
    vldm    r0!, {s0-s3}
    vtbl.8  d0, {d1-d2}, d3
    mov     r0, r1, lsl r2
    mov     r0, r1, rrx
    mov     r0, r1, asl #2
    add     r0, r1, r2, ror r3
    MOV     R1, PC
    mov     sb, sl
    mov     a1, a4
    mov     v1, v8
    msr     cpsr_fc, r0
    msr     APSR_nzcvq, r0
    mrs     r0, spsr
    mrs     r0, r8_usr
    msr     sp_svc, r0
    mrs     r0, elr_hyp
    vmrs    r0, fpscr
    vmsr    fpexc, r0
    mrc     p15, 0, r0, c1, c0, 0
    ldr     r0, =sym
    ldr     r0, =0x1234 + 4
    movw    r0, #:lower16:sym
    movt    r0, #:upper16:sym
    beq     1f
    bleq    1f
    ldreq   r0, 1f
    adr     r0, 1f
1:
    ldrd    r0, r1, [r2]
    bx      lr
    .size   operands, .-operands
