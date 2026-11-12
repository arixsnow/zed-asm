#define FLAGS (1 | \
               2)
    .text
    .globl  joined
joined:
    movl    $(FLAGS | \
              4), %eax
    movl    8(%rsp, \
              %rax, 4), %ecx
    addl    %eax, \
            %ecx
    ret
    .data
words:
    .long   1 + \
            2, \
            3
