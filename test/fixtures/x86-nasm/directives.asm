[bits 64]
default rel
cpu x64

section .data align=16
bytes:  db 1, 2, 'text', 0
words:  dw 0x1234, 'ab'
dwords: dd 1.5, -2, 0x10
qwords: dq 1.0e10, 7
tenth:  dt 1.5
blank:  times 4 db 0
length  equ $ - bytes
offset  equ bytes - $$

segment .rodata
message db 'hello', 10
        align 8
        dq message

[section .bss]
buffer: resb 64
        resw 2
        resd 1
        resq 1
        alignb 16
pad:    resb 1

section .text
global start:function
global helper
extern puts
common shared 8:4

start:
        times 3 nop
        align 16, nop
        call    helper
        ret

helper:
        ret
