bits 64

%define tonum(=x) x
%define what(&x) x
%define greedy(a, b+) a + 66 %, b
%define alpha(&x) x
%define mixed(a, =b, ) (a + b)
%define %[built] 2

%macro context 1
%push frame
%define %$name %1
%xdefine %$sign 0x80
%defstr %$text %1
%strcat %$joined 'a', 'b'
%%top_%$name:
        db %$sign
%pop
%endmacro

%macro dir 1
%endmacro

section .data
        db %chr(40, 41)
        db %str(1 + 2)
        dd tonum(1 + 3)
        db what(foo)
        db greedy(1, 2, 3)
        db mixed(1, 2, 3)
        db %map(alpha, foo, bar)
        dd built

section .text
        context start
        dir     %iffile
        dir     [%iffile]
        ret
