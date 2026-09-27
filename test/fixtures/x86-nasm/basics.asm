section .text
global add_three

add_three:
    mov     rax, rdi                ; rax = rdi
    add     rax, 3
    ret
