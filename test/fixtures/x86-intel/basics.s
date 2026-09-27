    .intel_syntax noprefix
    .text
    .globl  add_two
add_two:
    mov     rax, rdi                # rax = rdi
    add     rax, 2
    ret
