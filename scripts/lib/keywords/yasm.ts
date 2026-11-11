// SPDX-License-Identifier: MIT

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { runOrThrow } from '../grammars.ts';
import { bracedBody, initializerElements, withoutComments } from './c-source.ts';
import { parameterlessMacros } from './nasm.ts';
import { Keywords, type Project, readSource, workDirectory } from './source.ts';

export interface YasmParserTables {
    instructions: Keywords;
    prefixes: Keywords;
    directives: Keywords;
}

export interface YasmTables {
    nasm: YasmParserTables;
    gas: YasmParserTables;
    x86Registers: Keywords;
}

export function gperfRows(text: string, file: string): string[][] {
    const sections = text.split(/^%%$/m);
    if (sections.length < 2) {
        throw new Error(`${file} has no %% keyword section`);
    }
    return sections[1]
        .split('\n')
        .filter((line) => line.trim() !== '' && !line.startsWith('#'))
        .map((line) => line.split(',').map((field) => field.trim()));
}

function readGperf(file: string): Omit<YasmParserTables, 'directives'> {
    const tables = { instructions: new Keywords(), prefixes: new Keywords() };
    for (const fields of gperfRows(readFileSync(file, 'utf8'), file)) {
        if (fields.length < 2) {
            throw new Error(`${file}: unexpected keyword line "${fields.join(', ')}"`);
        }
        const name = fields[0].toLowerCase();
        if (fields[1] === 'NULL') {
            tables.prefixes.add(name);
        } else if (/^\w+_insn$/.test(fields[1])) {
            tables.instructions.add(name);
        } else {
            throw new Error(`${file}: unexpected keyword kind "${fields[1]}"`);
        }
    }
    return tables;
}

export function x86Registers(yasm: Project): Keywords {
    const file = 'modules/arch/x86/x86regtmod.gperf';
    const rows = gperfRows(readSource(yasm, file), file);
    const malformed = rows.find((fields) => fields.length !== 5);
    if (malformed !== undefined) {
        throw new Error(`${file}: unexpected register row "${malformed.join(', ')}"`);
    }
    const registers = new Keywords();
    for (const [name, type, , data] of rows) {
        if (type === 'REG' || type === 'SEGREG') {
            registers.add(name.toLowerCase());
        } else if (type === 'REGGROUP') {
            const members = rows.filter((row) => row[1] === 'REG' && row[2] === data).length;
            if (members === 0) {
                throw new Error(`${file}: the register group ${name} has no registers`);
            }
            registers.add(name.toLowerCase(), `index:${members}`);
        } else if (type !== 'TARGETMOD') {
            throw new Error(`${file}: unexpected register kind "${type}" of ${name}`);
        }
    }
    return registers;
}

function sourceFiles(yasm: Project, directory: string): string[] {
    return readdirSync(join(yasm.path, directory), { recursive: true, encoding: 'utf8' })
        .filter((name) => name.endsWith('.c'))
        .map((name) => join(directory, name))
        .sort();
}

function namesOf(text: string, pattern: RegExp, what: string): string[] {
    const names = [...text.matchAll(pattern)].map(([, name]) => name.toLowerCase());
    if (names.length === 0) {
        throw new Error(`${what}: no directive names`);
    }
    return names;
}

function parserDirectives(yasm: Project): Record<'gas' | 'nasm', string[]> {
    const found: Record<'gas' | 'nasm', string[]> = { gas: [], nasm: [] };
    const files = [...sourceFiles(yasm, 'libyasm'), ...sourceFiles(yasm, 'modules')];
    for (const file of files) {
        const source = withoutComments(readSource(yasm, file));
        for (const table of source.matchAll(/\byasm_directive\s+\w+\[\]\s*=/g)) {
            const body = bracedBody(source, table.index + table[0].length);
            for (const element of initializerElements(body)) {
                if (/^\{\s*NULL\s*,/.test(element)) {
                    continue;
                }
                const entry = /^\{\s*"([^"]+)"\s*,\s*"([^"]+)"/.exec(element);
                if (entry === null || (entry[2] !== 'gas' && entry[2] !== 'nasm')) {
                    throw new Error(`${file}: unexpected yasm_directive entry "${element}"`);
                }
                found[entry[2]].push(entry[1].toLowerCase());
            }
        }
    }
    if (found.gas.length === 0 || found.nasm.length === 0) {
        throw new Error('yasm: no yasm_directive tables for both parsers');
    }
    return found;
}

function gasDirectives(yasm: Project, tables: string[]): Keywords {
    const parser = 'modules/parsers/gas/gas-parse.c';
    const source = withoutComments(readSource(yasm, parser));
    const lookup = /\bdir_lookup\s+dirs_static\[\]\s*=/.exec(source);
    if (lookup === null) {
        throw new Error(`${parser}: no dirs_static`);
    }
    const preprocessor = 'modules/preprocs/gas/gas-preproc.c';
    const directives = new Keywords();
    for (
        const name of [
            ...tables,
            ...namesOf(
                bracedBody(source, lookup.index + lookup[0].length),
                /\{\s*"(\.[^"]+)"/g,
                parser,
            ),
            ...namesOf(
                withoutComments(readSource(yasm, preprocessor)),
                /"(\.[a-z_]+)"/g,
                preprocessor,
            ),
        ]
    ) {
        directives.add(name);
    }
    return directives;
}

function nasmDirectives(yasm: Project, tables: string[]): Keywords {
    const parser = 'modules/parsers/nasm/nasm-parse.c';
    const preprocessor = 'modules/preprocs/nasm/nasm-pp.c';
    const standard = 'modules/parsers/nasm/nasm-std.mac';
    const ppSource = withoutComments(readSource(yasm, preprocessor));
    const ppTable = /\bstatic const char \*directives\[\]\s*=/.exec(ppSource);
    if (ppTable === null) {
        throw new Error(`${preprocessor}: no directives table`);
    }
    const objectMacros = sourceFiles(yasm, 'modules/objfmts').flatMap((file) =>
        [...readSource(yasm, file).matchAll(/"%imacro\s+([^\s"]+)/g)].map(([, name]) =>
            name.toLowerCase()
        )
    );
    const directives = new Keywords();
    const add = (names: string[], tag: string) => {
        for (const name of names) {
            directives.add(name, tag);
        }
    };
    add(tables, 'yasm:directive');
    add(
        namesOf(
            withoutComments(readSource(yasm, parser)),
            /\byasm__strcasecmp\((?:name|dirname), "(\w+)"\)/g,
            parser,
        ),
        'yasm:directive',
    );
    const standardText = readSource(yasm, standard);
    add(namesOf(standardText, /^%imacro\s+(\S+)/gm, standard), 'yasm:standard-macro');
    add(parameterlessMacros(standardText), 'yasm:no-parameters');
    add(objectMacros, 'yasm:output-macro');
    add(
        namesOf(
            bracedBody(ppSource, ppTable.index + ppTable[0].length),
            /"(%[^"]+)"/g,
            preprocessor,
        ),
        'yasm:preprocessor',
    );
    return directives;
}

export function readYasm(yasm: Project): YasmTables {
    const work = workDirectory('yasm');
    runOrThrow('python3', ['-I', join(yasm.path, 'modules', 'arch', 'x86', 'gen_x86_insn.py')], {
        cwd: work,
    });
    const tables = parserDirectives(yasm);
    return {
        nasm: {
            ...readGperf(join(work, 'x86insn_nasm.gperf')),
            directives: nasmDirectives(yasm, tables.nasm),
        },
        gas: {
            ...readGperf(join(work, 'x86insn_gas.gperf')),
            directives: gasDirectives(yasm, tables.gas),
        },
        x86Registers: x86Registers(yasm),
    };
}
