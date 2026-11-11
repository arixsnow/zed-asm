bits 64

struc point
    .x: resd 1
    .y: resd 1
endstruc

struc header, 8
.tag:       resd 1
endstruc

struc rect
.origin:    resb point_size
.size       resb point_size
            alignb 4
.flags:     resw 1
endstruc

%macro field 1
    %1: resq 1
%endmacro

struc record
    field .first
    field .second
endstruc

section .data
origin:
    istruc point
        at point.x, dd 10
        at point.y, dd 20
    iend

box:
istruc rect
at rect.origin, dd 1, 2
at rect.size
at rect.flags, dw 0x5
iend

section .text
global area

area:
    mov     eax, [rdi + point.x]
    imul    eax, [rdi + point.y]
    mov     ecx, rect_size
    lea     rax, [rel box + rect.flags]
    ret
