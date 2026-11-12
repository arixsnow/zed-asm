#define FLAGS (1 | \
               2)
    .text
    .globl  joined
joined:
    mov     x0, \
            x1
    ldr     x2, [x1, \
            #8]
    add     x0, x0, #(FLAGS | \
            4)
    ret
    .data
words:
    .quad   1 + \
            2, \
            3
