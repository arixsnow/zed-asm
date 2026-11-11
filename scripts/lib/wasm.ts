// SPDX-License-Identifier: MIT

import { join } from 'node:path';

const SYSROOT = '/usr/wasm32-wasi';

export function wasmArgs(grammar: string, output: string): string[] {
    const src = `tree-sitter/${grammar}/src`;
    return [
        '--target=wasm32-wasip1',
        `--sysroot=${SYSROOT}`,
        '-isystem',
        join(SYSROOT, 'include', 'wasm32-wasi'),
        '-o',
        output,
        '-fPIC',
        '-shared',
        '-Os',
        `-Wl,--export=tree_sitter_${grammar}`,
        '-Wl,--allow-undefined',
        '-Wl,--no-entry',
        '-nostdlib',
        '-fno-exceptions',
        '-fvisibility=hidden',
        '-I',
        src,
        `${src}/parser.c`,
        `${src}/scanner.c`,
    ];
}

export const TREE_SITTER_WASM_FUNCTIONS = new Set([
    'calloc',
    'free',
    'iswalnum',
    'iswalpha',
    'iswblank',
    'iswdigit',
    'iswlower',
    'iswpunct',
    'iswspace',
    'iswupper',
    'iswxdigit',
    'malloc',
    'memchr',
    'memcmp',
    'memcpy',
    'memmove',
    'memset',
    'realloc',
    'strcmp',
    'strlen',
    'strncat',
    'strncmp',
    'strncpy',
    'towlower',
    'towupper',
]);

const MAGIC = [0x00, 0x61, 0x73, 0x6d];
const IMPORT_SECTION = 2;
const FUNCTION_IMPORT = 0;
const TABLE_IMPORT = 1;
const MEMORY_IMPORT = 2;
const GLOBAL_IMPORT = 3;
const TAG_IMPORT = 4;

class Reader {
    offset = 0;

    constructor(private readonly bytes: Uint8Array) {}

    byte(): number {
        if (this.offset >= this.bytes.length) {
            throw new Error('wasm module ends early');
        }
        return this.bytes[this.offset++];
    }

    unsigned(): number {
        let result = 0;
        let shift = 0;
        for (;;) {
            const byte = this.byte();
            result += (byte & 0x7f) * 2 ** shift;
            if ((byte & 0x80) === 0) {
                return result;
            }
            shift += 7;
        }
    }

    name(): string {
        const length = this.unsigned();
        const start = this.offset;
        this.offset += length;
        if (this.offset > this.bytes.length) {
            throw new Error('wasm module ends inside a name');
        }
        return new TextDecoder().decode(this.bytes.subarray(start, this.offset));
    }

    limits() {
        const flags = this.byte();
        this.unsigned();
        if ((flags & 1) !== 0) {
            this.unsigned();
        }
    }
}

export interface WasmImport {
    module: string;
    name: string;
    kind: number;
}

export function wasmImports(bytes: Uint8Array): WasmImport[] {
    if (MAGIC.some((byte, index) => bytes[index] !== byte)) {
        throw new Error('not a wasm module');
    }
    const reader = new Reader(bytes);
    reader.offset = 8;
    while (reader.offset < bytes.length) {
        const id = reader.byte();
        const size = reader.unsigned();
        const end = reader.offset + size;
        if (id !== IMPORT_SECTION) {
            reader.offset = end;
            continue;
        }
        const imports: WasmImport[] = [];
        for (let count = reader.unsigned(); count > 0; count--) {
            const module = reader.name();
            const name = reader.name();
            const kind = reader.byte();
            if (kind === FUNCTION_IMPORT) {
                reader.unsigned();
            } else if (kind === TABLE_IMPORT) {
                reader.byte();
                reader.limits();
            } else if (kind === MEMORY_IMPORT) {
                reader.limits();
            } else if (kind === GLOBAL_IMPORT) {
                reader.byte();
                reader.byte();
            } else if (kind === TAG_IMPORT) {
                reader.byte();
                reader.unsigned();
            } else {
                throw new Error(`unknown wasm import kind ${kind}`);
            }
            imports.push({ module, name, kind });
        }
        return imports;
    }
    return [];
}

export function foreignFunctions(bytes: Uint8Array): string[] {
    return wasmImports(bytes)
        .filter(({ kind, name }) =>
            kind === FUNCTION_IMPORT && !TREE_SITTER_WASM_FUNCTIONS.has(name)
        )
        .map(({ name }) => name);
}
