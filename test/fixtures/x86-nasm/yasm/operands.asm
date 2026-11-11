bits 64

section .data
value:  dd 1
[align 4]
second: dd 2

section .text
global access

access:
    mov     eax, [value wrt rip]
    lea     rdx, [second wrt rip]
    movzx   rax, byte [value wrt rip]
    ret
