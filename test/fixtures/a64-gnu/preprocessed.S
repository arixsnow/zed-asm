#define RESULT x0
#define ADD(a, b) ((a) + (b))
#if 0
    .error "not taken"
#elif defined(RESULT)
    .text
    .globl  answer
answer:
    mov     RESULT, #42
    ret
#endif
#define WRAP(insn...) insn
#define prfm(x) prfm pldl1keep, x
    .text
wrapped:
    WRAP(1:	ldr x0, [x1, #8]!)
    WRAP(nop; nop)
    WRAP(prfm pldl1keep, [x1])  // note
    prfm([x2])
    WRAP(add x0,
        x1, #1)
    ret
