    .section __TEXT,__text,regular,pure_instructions
    .globl  _answer
    .p2align 2
_answer:                            ; x0 = address of _msg
    adrp    x0, _msg@PAGE
    add     x0, x0, _msg@PAGEOFF
    mov     w1, #0                  ; =0x0
    ret

    .section __TEXT,__cstring,cstring_literals
_msg:
    .asciz  "hi\n"
