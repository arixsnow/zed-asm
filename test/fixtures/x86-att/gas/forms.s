    .eqv SIZE, 4
    DOUBLE == SIZE * 2
    .data
    .float 0f1.5, 0d1.5, 0f+1.5, 0f1, 0x1.5
    .double 0e2.5, 0r-1.25, 0b1.5
    .irp v 1 2 3
    .byte \v
    .endr
