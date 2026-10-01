    SIZE = 4
    .text
    .globl pick
pick:
    .if SIZE > 4
    movq $1, %rax
    .elseif SIZE == 4
    movq $2, %rax
    .else
    movq $3, %rax
    .endif
    .ifdef SIZE
    nop
    .endif
    .ifndef MISSING
    nop
    .endif
    .ifnotdef MISSING
    nop
    .endif
    .ifc x,x
    nop
    .endif
    .ifnc x,y
    nop
    .endif
    .ifeqs "a","a"
    nop
    .endif
    .ifnes "a","b"
    nop
    .endif
    .ifeq SIZE - 4
    nop
    .endif
    .ifne SIZE
    nop
    .endif
    .ifge SIZE
    nop
    .endif
    .ifgt SIZE
    nop
    .endif
    .ifle -SIZE
    nop
    .endif
    .iflt -SIZE
    nop
    .endif
    .IFDEF SIZE
    nop
    .ENDIF
    .rept 2
    nop
    .endr
    .irp reg, %rax, %rbx
    push \reg
    .endr
    .irpc n, 12
    .byte \n
    .endr
    .rept 2; nop; .endr
    .if SIZE; nop; .else; hlt; .endif
    .macro check a
    .ifb \a
    nop
    .else
    .byte \a
    .endif
    .endm
    check
    check 7
    ret
    .if SIZE
    .globl inner
inner:
    .rept 2
    .ifnb SIZE
    nop
    .endif
    .endr
    ret
    .endif
