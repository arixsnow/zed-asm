    .intel_syntax noprefix
    .text
    mov     eax, 1 eq 1
    mov     eax, OFFSET FLAT:sym
    jmp     short target
    call    near ptr target
    {load} {disp32} mov rax, [rbx]
    .intel_syntax prefix
    mov     %rax, [%rbx+8]
target:
    ret
