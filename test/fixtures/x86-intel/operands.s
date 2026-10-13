    .intel_syntax noprefix
    .text
    .globl  intel_operands
intel_operands:
    mov     rax, QWORD PTR [rbx+rcx*4+8]
    mov     eax, DWORD PTR [rbp-4]
    mov     rax, [rip + sym]
    lea     rax, sym[rip]
    mov     eax, DWORD PTR sym[rip]
    mov     rax, QWORD PTR fs:40
    movzx   eax, BYTE PTR [rbx]
    mov     rax, offset sym
    mov     eax, 4 shl 2
    mov     eax, 6 and 3
    mov     eax, not 0
    vaddps  zmm3{k1}{z}, zmm2, zmm1
    vaddps  zmm3, zmm2, DWORD PTR [rax]{1to16}
    vaddps  zmm3, zmm2, zmm1, {rn-sae}
    call    rax
    rep stos BYTE PTR [rdi], al
    lock inc DWORD PTR [rdi]
    call    "quoted name"@PLT
    ret
