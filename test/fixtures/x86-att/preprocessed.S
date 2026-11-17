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
#define WRAP(insn...) insn
#define pause() rep; nop
    .text
wrapped:
    WRAP(1:	movw (%rsi), %bx)
    WRAP(lfence; jmp *%rax; int3)
    WRAP(movb -32(%rdx), %bl)  # note
    pause()
    WRAP(movq %rax,
        %rbx)
    ret
#define STATEP %rdi
#define INDEX %rcx
#define SRC %rsi
#define DEST %zmm1
#define VMM(i) zmm##i
#define VMM_lo(i) xmm##i
#define VRCX ecx
#define rRIP (%rip)
#define __percpu %gs:
#define SIZED(insn) insn##q
#define REG(x) r##x
#define CMP_MASK(a, b, d) vpcmpeqb b, a, d
#define SYM(a, b) a##_##b
#define LABEL(name) name:
#define COND_MASK(k) {%k}
#define PROBE(name, n, ...) .pushsection .note.probe, "a"; .ascii #__VA_ARGS__; .popsection
    .text
names:
    movdqu  %xmm0, 0x00(STATEP)
    mov     (SRC, INDEX), %rax
    addl    (%rbx,INDEX,4), %ebx
    vmovdqu64 (SRC), %VMM(1)
    vpmovmskb %VMM_lo(4), %VRCX
    vmovdqu8 (SRC), DEST{%k1}{z}
    vmovdqu8 %zmm0, buffer{%k1}
    CMP_MASK (%VMM(0), (%rsi), %k1){%k2}
    vmovdqa .Lmask rRIP, %xmm0
    cmpl    __percpu 4(%rsi), %edx
    SIZED(push) %REG(dx)
    LABEL (SYM (alpha, beta))
    vptestmb %zmm2, %zmm2, %k0 COND_MASK(k2)
    PROBE(longjmp, 3, 4@%eax, -4@8(%esp), 8@%rdi)
    ret
    .section .rodata
.Lmask:
    .zero   16
    .data
buffer:
    .zero   64
