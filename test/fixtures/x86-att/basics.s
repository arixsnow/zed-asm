    .text
    .globl  add_one
    .type   add_one, @function
add_one:
    movq    %rdi, %rax              # rax = rdi
    addq    $1, %rax
    nop; nop
    call    puts@PLT
    ret
    .size   add_one, .-add_one
