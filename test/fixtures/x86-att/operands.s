    .text
    .globl  operands
operands:
    movq    8(%rax,%rbx,4), %rcx
    movq    8( %rax , %rbx , 2 ), %rcx
    movq    (%rax), %rdx
    movq    -8(%rbp), %rax
    movq    (,%rcx,8), %rax
    movq    table(,%rcx,8), %rax
    movq    sym(%rip), %rax
    movq    sym@GOTPCREL(%rip), %rax
    movq    %fs:0x28, %rax
    movl    %es:(%rdi), %eax
    movl    $7%3, %eax
    movl    $(1 << 4) | 3, %eax
    movq    $sym, %rax
    call    *%rax
    jmp     *(%rax)
    jmp     *8(,%rax,8)
    call    *sym@GOTPCREL(%rip)
    lock incl (%rdi)
    rep movsb
    rep; movsb
    vaddps  %zmm1, %zmm2, %zmm3{%k1}{z}
    vaddps  (%rax){1to16}, %zmm2, %zmm3
    vaddps  {rn-sae}, %zmm1, %zmm2, %zmm3
    {vex} vpdpbusd %xmm1, %xmm2, %xmm3
    {evex} vaddps %xmm1, %xmm2, %xmm3
    fld     %st(1)
    kmovw   %k1, %k2
    movq    %cr0, %rax
    call    "quoted name"@PLT
    movq    "quoted name"(%rip), %rax
    ret
    .code32
    movl    8(%esp), %eax
    pushl   %ebp
    .code64
    .data
"quoted name":
    .quad   0
