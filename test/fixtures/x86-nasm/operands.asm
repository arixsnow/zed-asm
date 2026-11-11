bits 64
default rel

section .data
value:  dd 1
table:  dq 0, 0
mask:   dd 0FFh, 0x1f, 017q, 1010b

section .text
global operands

operands:
    mov     eax, 1
    mov     rax, [rbx+rcx*4+8]
    mov     rax, [rcx*4+rbx]
    mov     rax, [-8+rbp]
    mov     eax, dword [rbx]
    mov     eax, [dword rbx]
    mov     eax, [rel value]
    mov     eax, [abs 0x1000]
    lea     rax, [rel table]
    mov     byte [rax], 0
    movzx   eax, byte [rbx+1]
    mov     rax, qword [fs:0x28]
    mov     rax, [gs:rbx]
    push    qword [rsp+8]
    mov     eax, value - $$
    mov     eax, 0x1f + (2 * 3)
    mov     eax, ~1 & 0xff
    mov     eax, -(1 + 2)
    mov     eax, 7 % 3
    mov     eax, 7 / 2
    mov     eax, 1 << 4
    mov     eax, 16 >> 2
    mov     eax, 6 | 1 ^ 2
    mov     eax, 'ab'
    jmp     short .done
    jmp     near .done
    call    operands
    movaps  xmm0, [rax]
    vaddps  ymm0, ymm1, [rax]
    lock    add dword [rax], 1
    rep     movsb
    fadd    st0, st1
    mov     rax, strict qword 1
    push    strict dword 1
.done:
    ret
