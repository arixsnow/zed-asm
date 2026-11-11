// SPDX-License-Identifier: MIT

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { runOrThrow } from '../grammars.ts';
import { withoutComments } from './c-source.ts';
import { Keywords, type Project, readSource, section, workDirectory } from './source.ts';

export interface NasmTables {
    instructions: Keywords;
    flagsInstructions: Keywords;
    defaultFlags: Keywords;
    pseudoInstructions: Keywords;
    directives: Keywords;
    preprocessor: PreprocessorStructure;
    registers: Keywords;
    prefixes: Keywords;
    pseudoPrefixes: Keywords;
    operandWords: Keywords;
    decorators: Keywords;
    listWords: Keywords;
}

const TOKEN_READERS = new Set(['TOKEN_PREFIX', 'TOKEN_TIMES', 'TOKEN_DECORATOR', 'TOKEN_BRCCONST']);

export interface PreprocessorStructure {
    conditions: Map<string, { stem: string; tail: string }>;
    casePairs: Map<string, string>;
}

export function directiveSections(text: string): Map<string, string[]> {
    const sections = new Map<string, string[]>();
    let current = '';
    for (const raw of text.split('\n')) {
        const line = raw.replace(/;.*/, '').trim();
        if (line === '') {
            continue;
        }
        const special = /^#special\s+(\w+)/.exec(line);
        if (special !== null) {
            current = special[1];
            continue;
        }
        if (line.startsWith('#')) {
            continue;
        }
        sections.set(current, [...(sections.get(current) ?? []), line.toLowerCase()]);
    }
    return sections;
}

interface Generated {
    names: string[];
    flags: string[];
}

function generated(nasm: Project): Generated {
    const work = workDirectory('nasm');
    const expanded = join(work, 'insns.xda');
    const names = join(work, 'insnsn.c');
    const templates = join(work, 'insnsa.c');
    const perl = ['-I.', '-Iperllib'];
    runOrThrow('perl', [...perl, 'x86/preinsns.pl', 'x86/insns.dat', expanded], { cwd: nasm.path });
    runOrThrow('perl', [...perl, 'x86/insns.pl', '-n', expanded, names], { cwd: nasm.path });
    runOrThrow('perl', [...perl, 'x86/insns.pl', '-a', expanded, templates], { cwd: nasm.path });
    const body = section(
        readFileSync(names, 'utf8'),
        /nasm_insn_names\[\] = \{/,
        /^\};/m,
        'nasm_insn_names in insnsn.c',
    );
    const flags = [
        ...readFileSync(templates, 'utf8').matchAll(
            /^static const struct itemplate instrux_(\w+)\[\d+\] = \{\n([\s\S]*?)^\};/gm,
        ),
    ]
        .filter(([, , block]) => /:[^*\n]*\bDFV\b/.test(block))
        .map(([, name]) => name.toLowerCase());
    if (flags.length === 0) {
        throw new Error('insnsa.c: no template carries the DFV flag');
    }
    return { names: [...body.matchAll(/^\s*"([^"]+)",$/gm)].map(([, name]) => name), flags };
}

function preprocessorDirectives(nasm: Project): string[] {
    const output = join(workDirectory('nasm'), 'pptok.c');
    runOrThrow('perl', ['-I.', '-Iperllib', 'asm/pptok.pl', 'c', 'asm/pptok.dat', output], {
        cwd: nasm.path,
    });
    const body = section(
        readFileSync(output, 'utf8'),
        /pp_directives\[\d+\] = \{/,
        /^\};/m,
        'pp_directives in pptok.c',
    );
    const names = [...body.matchAll(/"(%[^"]+)"/g)].map(([, name]) => name.toLowerCase());
    if (names.length === 0) {
        throw new Error('pptok.c: pp_directives is empty');
    }
    return names;
}

export function bracedRegisters(nasm: Project): string[] {
    const names: string[] = [];
    for (const line of readSource(nasm, 'x86/regs.dat').split('\n')) {
        const row = /^([?@a-z0-9_-]+)\s*\S+\s*\S+\s*[0-9]+\s*(?:&\s*[0-9]+\s*)?(\S*)/.exec(line);
        if (row === null || !row[2].split('|').includes('TFLAG_BRC_OPT')) {
            continue;
        }
        const range = /^(.*[^0-9])([0-9]+)-([0-9]+)(|[^0-9].*)$/.exec(row[1]);
        if (range === null) {
            names.push(row[1]);
            continue;
        }
        for (let number = Number(range[2]); number <= Number(range[3]); number++) {
            names.push(`${range[1]}${number}${range[4]}`);
        }
    }
    if (names.length === 0) {
        throw new Error('x86/regs.dat: no register may stand in braces');
    }
    return names;
}

function registers(nasm: Project): Keywords {
    const output = join(workDirectory('nasm'), 'regs.c');
    writeFileSync(
        output,
        runOrThrow('perl', ['-I.', '-Iperllib', 'x86/regs.pl', 'c', 'x86/regs.dat'], {
            cwd: nasm.path,
        }),
    );
    const body = section(
        readFileSync(output, 'utf8'),
        /nasm_reg_names\[\] = /,
        /^\};/m,
        'nasm_reg_names in regs.c',
    );
    const table = new Keywords();
    for (const [, name] of body.matchAll(/"([^"]+)"/g)) {
        table.add(name.toLowerCase());
    }
    if (table.size === 0) {
        throw new Error('regs.c: nasm_reg_names is empty');
    }
    for (const name of bracedRegisters(nasm)) {
        if (!table.has(name)) {
            throw new Error(`x86/regs.dat: the braced register ${name} is not in nasm_reg_names`);
        }
        table.add(name, 'nasm:TFLAG_BRC_OPT');
    }
    return table;
}

export function tokenType(pattern: string, name: string): string {
    return pattern.replace(/\{([^*}]*)\*([^}]*)\}|\*/g, (all, prefix: string, suffix: string) => {
        if (all === '*') {
            return name.toUpperCase();
        }
        if (!name.startsWith(prefix) || !name.endsWith(suffix)) {
            throw new Error(`asm/tokens.dat: "${name}" does not fit the pattern ${pattern}`);
        }
        return name.slice(prefix.length, name.length - suffix.length).toUpperCase();
    });
}

export interface TokenRow {
    name: string;
    type: string;
    flags: string[];
    value: string;
}

export function tokenRows(nasm: Project): TokenRow[] {
    const rows: TokenRow[] = [];
    let header: string[] | undefined;
    for (const raw of readSource(nasm, 'asm/tokens.dat').split('\n')) {
        const line = raw.trim();
        const fields = /^%\s+(.*)$/.exec(line);
        if (line === '' || line.startsWith('#')) {
            continue;
        }
        if (fields !== null) {
            header = fields[1].split(',').map((field) => field.trim());
            if (header.length !== 4) {
                throw new Error(`asm/tokens.dat: unexpected token header "${line}"`);
            }
        } else if (header === undefined) {
            throw new Error(`asm/tokens.dat: "${line}" comes before any token header`);
        } else {
            rows.push({
                name: line.toLowerCase(),
                type: tokenType(header[0], line),
                flags: header[2].split('|').map((flag) => flag.trim()),
                value: tokenType(header[3], line),
            });
        }
    }
    return rows;
}

function tokenNames(rows: TokenRow[], type: string): string[] {
    const names = rows.filter((row) => row.type === type).map(({ name }) => name);
    if (names.length === 0) {
        throw new Error(`asm/tokens.dat: no ${type} token`);
    }
    return names;
}

function disassemblerClass(nasm: Project, name: string): string[] {
    const output = join(workDirectory('nasm'), 'regdis.c');
    writeFileSync(
        output,
        runOrThrow('perl', ['-I.', '-Iperllib', 'x86/regs.pl', 'dc', 'x86/regs.dat'], {
            cwd: nasm.path,
        }),
    );
    const table = section(
        readFileSync(output, 'utf8'),
        new RegExp(`nasm_rd_${name}\\[DISREGTBLSZ\\] = \\{`),
        /\};/,
        `nasm_rd_${name} in regdis.c`,
    );
    const names = [...new Set([...table.matchAll(/\bR_(\w+)/g)].map(([, register]) => register))];
    if (names.length === 0) {
        throw new Error(`regdis.c: nasm_rd_${name} is empty`);
    }
    return names.map((register) => register.toLowerCase());
}

function prefixes(
    nasm: Project,
    rows: TokenRow[],
): Pick<NasmTables, 'prefixes' | 'pseudoPrefixes'> {
    const tables = { prefixes: new Keywords(), pseudoPrefixes: new Keywords() };
    for (const { name, flags } of rows.filter((row) => row.type === 'TOKEN_PREFIX')) {
        if (!flags.includes('TFLAG_BRC')) {
            tables.prefixes.add(name);
        }
        if (flags.includes('TFLAG_BRC') || flags.includes('TFLAG_BRC_OPT')) {
            tables.pseudoPrefixes.add(name);
        }
    }
    const file = 'asm/parser.c';
    const add = section(
        withoutComments(readSource(nasm, file)),
        /^static bool add_prefix\(insn \*result\)\s*\{/m,
        /^\}$/m,
        'add_prefix',
    );
    const special = /case TOKEN_SPECIAL:[\s\S]*?\b(S_\w+)\b/.exec(add);
    if (
        special === null || !/case TOKEN_PREFIX:/.test(add) ||
        !/case TOKEN_REG:[\s\S]*?\bIS_SREG\(/.test(add)
    ) {
        throw new Error(
            `${file}: add_prefix no longer takes prefixes, a special word and segment registers`,
        );
    }
    for (
        const { name } of rows.filter((row) =>
            row.type === 'TOKEN_SPECIAL' && row.value === special[1]
        )
    ) {
        tables.prefixes.add(name);
    }
    for (const name of disassemblerClass(nasm, 'sreg')) {
        tables.prefixes.add(name);
    }
    return tables;
}

export function operandWords(nasm: Project, rows: TokenRow[]): Keywords {
    const words = new Keywords();
    const tagged = new Map<string, string[]>();
    for (const { name, type, flags, value } of rows) {
        if (!/[a-z]/.test(name) || TOKEN_READERS.has(type)) {
            continue;
        }
        const tags = [
            `nasm:token:${type}`,
            `nasm:value:${value}`,
            ...flags.filter((flag) => flag !== '0').map((flag) => `nasm:flag:${flag}`),
        ];
        words.add(name, ...tags);
        tagged.set(name, tags);
    }
    const file = 'macros/standard.mac';
    for (
        const [, keyword, alias, target] of readSource(nasm, file).matchAll(
            /^%(i?defalias)\s+(\S+)\s+(\S+)/gm,
        )
    ) {
        const tags = tagged.get(target.toLowerCase());
        if (tags !== undefined && keyword !== 'idefalias') {
            throw new Error(`${file}: ${alias} names the token ${target} in one case only`);
        }
        if (tags !== undefined) {
            words.add(alias.toLowerCase(), ...tags);
        }
    }
    return words;
}

export function decorators(rows: TokenRow[]): Pick<NasmTables, 'decorators' | 'defaultFlags'> {
    const tables = { decorators: new Keywords(), defaultFlags: new Keywords() };
    for (const { name, type } of rows) {
        if (type === 'TOKEN_DECORATOR') {
            tables.decorators.add(name);
        } else if (type === 'TOKEN_BRCCONST') {
            const constant = /^(\w+)=(\w*)$/.exec(name);
            if (constant === null) {
                throw new Error(`asm/tokens.dat: the braced constant "${name}" has no '='`);
            }
            tables.decorators.add(constant[1], 'nasm:flags');
            if (constant[2] !== '') {
                tables.defaultFlags.add(constant[2]);
            }
        }
    }
    if (tables.decorators.size === 0 || tables.defaultFlags.size === 0) {
        throw new Error('asm/tokens.dat lists no decorator or no dfv= flag');
    }
    return tables;
}

export function listWords(nasm: Project): Keywords {
    const file = 'asm/preproc.c';
    const source = withoutComments(readSource(nasm, file));
    const counted =
        /\btline->next->len == \d+ &&\s*!nasm_stricmp\(tline->next->text\.a, "(\.\w+)"\)/
            .exec(source);
    const repeated =
        /\bcase PP_REP:[\s\S]*?\btline->len == \d+ &&\s*!nasm_memicmp\(tline->text\.a, "(\.\w+)", \d+\)/
            .exec(source);
    if (counted === null || repeated === null) {
        throw new Error(`${file}: a macro count or %rep no longer takes a list word in any case`);
    }
    const words = new Keywords();
    words.add(counted[1]);
    words.add(repeated[1]);
    return words;
}

export function standardMacros(text: string, file: string): string[] {
    const names = [...text.matchAll(/^%imacro\s+(\S+)/gm)].map(([, name]) => name.toLowerCase());
    if (names.length === 0) {
        throw new Error(`${file}: no %imacro definitions`);
    }
    return names;
}

export function parameterlessMacros(text: string): string[] {
    return [...text.matchAll(/^%imacro\s+(\S+)\s+0(?:\.nolist)?\s*$/gim)].map(([, name]) =>
        name.toLowerCase()
    );
}

export function preprocessorStructure(nasm: Project): PreprocessorStructure {
    const stems: string[] = [];
    const tails: string[] = [];
    const casePairs = new Map<string, string>();
    for (const raw of readSource(nasm, 'asm/pptok.dat').split('\n')) {
        const line = raw.trim().replace(/\s*#.*$/, '');
        const stem = /^%(.*)\*$/.exec(line);
        const pair = /^%(.*!.*)$/.exec(line);
        const tail = /^\*(.*)$/.exec(line);
        if (stem !== null) {
            stems.push(stem[1]);
        } else if (pair !== null) {
            casePairs.set(`%${pair[1].replace('!', 'i')}`, `%${pair[1].replace('!', '')}`);
        } else if (tail !== null && !/[A-Z]/.test(tail[1])) {
            tails.push(tail[1]);
        }
    }
    if (stems.length === 0 || tails.length === 0 || casePairs.size === 0) {
        throw new Error('asm/pptok.dat: no condition stems, tails or case pairs');
    }
    const conditions = new Map<string, { stem: string; tail: string }>();
    for (const stem of stems) {
        for (const tail of tails) {
            conditions.set(`%${stem}${tail}`, { stem, tail });
            conditions.set(`%${stem}n${tail}`, { stem, tail });
        }
    }
    return { conditions, casePairs };
}

function readDirectives(
    nasm: Project,
    sections: Map<string, string[]>,
    rows: TokenRow[],
): Keywords {
    const directives = new Keywords();
    const add = (names: string[], tag: string) => {
        for (const name of names) {
            directives.add(name, tag);
        }
    };
    for (const [section, names] of sections) {
        if (section !== 'pragma_tokens') {
            add(names, `nasm:section:${section === '' ? 'directives' : section}`);
        }
    }
    add(preprocessorDirectives(nasm), 'nasm:preprocessor');
    add(tokenNames(rows, 'TOKEN_TIMES'), 'nasm:token:TOKEN_TIMES');
    const standard = readSource(nasm, 'macros/standard.mac');
    add(standardMacros(standard, 'macros/standard.mac'), 'nasm:standard-macro');
    add(parameterlessMacros(standard), 'nasm:no-parameters');
    for (
        const name of readdirSync(join(nasm.path, 'output')).filter((file) => file.endsWith('.mac'))
            .sort()
    ) {
        const text = readSource(nasm, `output/${name}`);
        if (/^%imacro\s/m.test(text)) {
            add(standardMacros(text, `output/${name}`), 'nasm:output-macro');
        }
    }
    return directives;
}

export function readNasm(nasm: Project): NasmTables {
    const directives = directiveSections(readSource(nasm, 'asm/directiv.dat'));
    const pseudo = directives.get('pseudo_ops');
    if (pseudo === undefined) {
        throw new Error('asm/directiv.dat has no pseudo_ops section');
    }
    const pseudoInstructions = new Keywords();
    for (const name of pseudo) {
        pseudoInstructions.add(name);
    }
    const instructions = new Keywords();
    const flagsInstructions = new Keywords();
    const { names, flags } = generated(nasm);
    for (const name of names) {
        if (!pseudoInstructions.has(name)) {
            instructions.add(name);
        }
    }
    for (const name of flags) {
        if (instructions.has(name)) {
            flagsInstructions.add(name);
        }
    }
    const rows = tokenRows(nasm);
    return {
        instructions,
        flagsInstructions,
        pseudoInstructions,
        directives: readDirectives(nasm, directives, rows),
        preprocessor: preprocessorStructure(nasm),
        registers: registers(nasm),
        ...prefixes(nasm, rows),
        operandWords: operandWords(nasm, rows),
        ...decorators(rows),
        listWords: listWords(nasm),
    };
}
