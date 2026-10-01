    .file "directives.c"
    .file 1 "directives.c"
    .section __TEXT,__text,regular,pure_instructions
    .p2align 2
    .globl _count
_count:
    .loc 1 3 0 prologue_end
1:
    subs x0, x0, #1
    b.ne 1b
    cbz x0, 2f
2 :
    b 10f
10:
    b 0f
0:
    b Lout
Lout :
    ret
    .globl _spaced
_spaced :
    .loc 1 4 0 is_stmt 0
    ret
    SIZE = 16
    .equ QUARTER, SIZE / 4
    .set BASE, 8
    .equiv LIMIT, BASE * 2
    .section __TEXT,__const
    .float 1.5, .5, 1., 1e3, -2.5E-1
    .single 1E3, 1.5e+3, -1.5, 1, inf
    .double 2.5e-3, 0x1.8p0
    .pushsection __DATA,__data
    .2byte 1
    .4byte 2
    .8byte 3
    .byte 1 -2
    .popsection
    .data
    .balign 8,,4
    . = . + 4
    .subsections_via_symbols
