section .text
global count

count:
    mov     rcx, rdi                ; rcx = steps
.loop:
    dec     rcx
    jnz     .loop
..@helper:
.done:
    jmp     count.exit
.exit:
    ret

other:
.loop:
    ret
.1:
    jmp     .1
.$x:
    jmp     .$x
$.y:
    jmp     $.y

$eax:
    jmp     $eax
?q:
    jmp     ?q
