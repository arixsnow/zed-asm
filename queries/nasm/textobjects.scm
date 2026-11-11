; SPDX-License-Identifier: MIT

(macro_definition
    body: (_
        .
        (_) @class.inside
        (_)? @class.inside
        .)) @class.around

(structure
    body: (_
        .
        (_) @class.inside
        (_)? @class.inside
        .)) @class.around

(structure_instance
    body: (_
        .
        (_) @class.inside
        (_)? @class.inside
        .)) @class.around
