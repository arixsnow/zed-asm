bits 64

%define XMMWORD
%define MMWORD qword
%define SIZE 16
%define wk(i) rbp - (i) * SIZE
%define GOTOFF(got, sym) (got) + (sym) - base
%define EXTN(name) name
%define DOUBLE(x) ((x) * 2)
%xdefine LATER SIZE
%idefine Ignored 1
%assign COUNT 3
%undef Ignored

%macro prologue 0
        push    rbp
        mov     rbp, rsp
%endmacro

%macro epilogue 0-1 0
        mov     rsp, rbp
        pop     rbp
%endmacro

%macro load 2+
        mov     %1, %2
%endmacro

%macro counted 1
%%again:
        dec     %1
        jnz     %%again
%endmacro

%macro labelled 1
%1:
        ret
%{1}_end:
        ret
%endmacro

%macro glued 1
        jmp     target_ %+ %1
target_ %+ %1:
%endmacro

%macro tokens 1
%define %%t %1
        mov     eax, %%t
%assign %%n %1 + 1
        mov     eax, %%n
%%label db 0
%endmacro

%macro both 2
        mov     %1, %2
%endmacro

section .text
global EXTN(jsimd_run)

EXTN(jsimd_run):
        prologue
        sub     rsp, 4 * SIZE
        movaps  XMMWORD [rsp], xmm6
        movdqa  xmm0, XMMWORD [wk(2)]
        movq    mm0, MMWORD [rsp]
        lea     rax, [GOTOFF(rbx, base)]
        mov     eax, DOUBLE(COUNT) + 1
        mov     eax, DOUBLE (LATER)
        times DOUBLE(1) nop
        load    eax, 1
        load    {ecx}, {2}
        both    {eax}, {COUNT}
        counted ecx
        glued   one
        tokens  5
%push loop
%assign %$depth 0
%rep COUNT
%assign %$depth %$depth + 1
        nop
%endrep
%pop
%if COUNT > 2
        mov     eax, COUNT
%elif COUNT = 2
        mov     eax, 2
%else
        xor     eax, eax
%endif
%ifdef SIZE
        mov     eax, SIZE
%endif
%ifndef MISSING
        nop
%endif
%ifidn XMMWORD, MMWORD
        nop
%endif
%strlen LEN 'four'
        mov     eax, LEN
%substr FIRST 'abc' 1
        mov     al, FIRST
        epilogue
        ret

        labelled helper
base:
