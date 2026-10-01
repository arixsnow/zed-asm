    .macro twice a
    .byte \a, \a
    .endmacro
    .data
    twice 1
    .double 0x1.8p0, 0x1p-2
