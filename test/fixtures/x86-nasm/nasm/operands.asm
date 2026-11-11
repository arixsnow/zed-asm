bits 64
default rel

section .data
numbers:    dd 0o17, 0b1010, 0d99, 99d, 1_000, 0x_ff, $1a, 101y, 34t, 1010_0101x
floats:     dq 1e10, 0x1.8p1, __?Infinity?__, __?QNaN?__
octo:       do 1.5
split:      dd 7 ? 1 : 2, 3 <=> 4
lists:      db %(44, 55)
            dw byte (?, 44)
            dw 3 dup (0xcc, 4 dup byte ('PQR'), ?), 0xabcd
            dd 16 dup (?)
            dq ?

section .text
global apx

apx:
    mov     rax, fs:[0x28]
    vaddps  zmm0{k1}{z}, zmm1, zmm2
    vaddps  zmm0, zmm1, [rax]{1to16}
    vaddps  zmm0, zmm1, zmm2, {rn-sae}
    add     {nf} eax, [rdx], ecx
    add{evex} dword [rdx], 16
    ccmpl   {dfv=of,cf} rdx, r30
    ccmpl   ({dfv=of}|{dfv=cf}), rdx, r30
    bndstx  [rax+0x3, rbx], bnd0
    bndstx  [, rcx*1], bnd2
    mov     eax, [a32 ebx]
    mov     eax, __?utf16?__('a')
    mov     eax, __?ilog2e?__ 64
    mov     eax, &rbx
    ret
