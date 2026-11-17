#define UNWIND(x...) x
#define PROBE(name, n, ...) .pushsection .note.probe, "a"; .ascii #__VA_ARGS__; .popsection
    .syntax unified
    .text
    .globl  unwind
unwind:
    push    {r4, UNWIND(r5,) r6}
    pop     {r4, UNWIND(r5,) r6}
    PROBE(read, 2, 4@r0, -4@[sp, #4])
    bx      lr
#define KERN_WARNING "\0014"
    .data
warning:
    .ascii  KERN_WARNING "not implemented\0"
