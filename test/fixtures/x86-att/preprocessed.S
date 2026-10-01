#define RESULT %rax
#define SCALE(x) ((x) * 8)
#define PAIR(a, b) \
    .byte a, b
#ifndef RESULT
    .error "RESULT is not defined"
#elif SCALE(1) == 8 && defined(RESULT)
    .text
    .globl  answer
answer:
    movq    $42, RESULT
    ret
#else
    .error "not taken"
#endif
#undef RESULT
