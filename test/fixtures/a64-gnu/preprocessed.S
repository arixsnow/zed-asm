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
