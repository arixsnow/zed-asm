// SPDX-License-Identifier: MIT

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { runOrThrow } from '../grammars.ts';
import {
    bracedBody,
    initializerElements,
    leadingString,
    withoutComments,
    withoutPreprocessorLines,
} from './c-source.ts';
import { Signatures } from './roles.ts';
import {
    Keywords,
    type Project,
    readSource,
    section,
    workDirectory,
    writtenCases,
    writtenNames,
} from './source.ts';

export interface BinutilsTables {
    x86Instructions: Keywords;
    x86FlagsInstructions: Keywords;
    x86DefaultFlags: Keywords;
    x86EncodingSuffixes: Keywords;
    x86SyntaxWords: Keywords;
    aarch64Signatures: Signatures;
    armSignatures: Signatures;
    x86Prefixes: Keywords;
    x86PseudoPrefixes: Keywords;
    x86IntelWords: Keywords;
    x86Decorators: Keywords;
    aarch64Relocations: Keywords;
    armRelocations: Keywords;
    armSuffixRelocations: Keywords;
    aarch64Shifts: Keywords;
    armShifts: Keywords;
    aarch64PredicateQualifiers: Keywords;
    machoSectionTypes: Keywords;
    aarch64Instructions: Keywords;
    aarch64Conditions: Keywords;
    armInstructions: Keywords;
    armConditions: Keywords;
    armVectorConditions: Keywords;
    armTypeElements: number;
    x86Directives: Keywords;
    aarch64Directives: Keywords;
    armDirectives: Keywords;
    x86Registers: Keywords;
    aarch64Registers: Keywords;
    armRegisters: Keywords;
    aarch64SystemRegisters: Keywords;
    armSystemRegisters: Keywords;
}

const ARM_SUFFIX_TAGS = new Set([
    'OT_csuffix',
    'OT_csuffixF',
    'OT_csuf_or_in3',
    'OT_cinfix3',
    'OT_cinfix3_deprecated',
    'OT_odd_infix_unc',
]);

const AARCH64_LABEL_OPERAND = /^AARCH64_OPND_(ADDR_PCREL\d+|ADDR_ADRP|HALF)$/;
const AARCH64_CONDITION_OPERAND = /^AARCH64_OPND_COND1?$/;
const AARCH64_SYSTEM_OPERAND = /^AARCH64_OPND_(SYSREG|SYSREG128|PSTATEFIELD|CRn|CRm)$/;
const ARM_LABEL_OPERAND = /\bOP_(EXP|EXPr|EXPs|ADDR|ADDRGLDR|ADDRGLDRS|ADDRGLDC|ADDRMVE)\b/;
const ARM_CONDITION_OPERAND = /\bOP_(COND|RVSD_COND)\b/;
const ARM_SYSTEM_OPERAND = /\bOP_(wPSR|rPSR|APSR_RR)\b/;
const ARM_OPTIONAL_OPERAND = /^\(?OP_o/;

const BINUTILS_LOWER_CASE = ['binutils:no-upper-case', 'binutils:no-mixed-case'];
const AARCH64_GAS = 'gas/config/tc-aarch64.c';
const ARM_GAS = 'gas/config/tc-arm.c';

const ARM_INFIX_TAGS = new Set([
    'OT_cinfix3',
    'OT_cinfix3_deprecated',
    'OT_csuf_or_in3',
    'OT_cinfix3_legacy',
]);

export function unescapeC(literal: string): string {
    return literal.replace(/\\([0-7]{1,3}|.)/g, (_, escape: string) => {
        if (/^[0-7]+$/.test(escape)) {
            return String.fromCharCode(Number.parseInt(escape, 8));
        }
        const named: Record<string, string> = { n: '\n', t: '\t', '"': '"', '\\': '\\', "'": "'" };
        const value = named[escape];
        if (value === undefined) {
            throw new Error(`unexpected escape \\${escape} in a mnemonic table`);
        }
        return value;
    });
}

function x86Mnemonics(binutils: Project): Map<string, string> {
    const table = section(
        readSource(binutils, 'opcodes/i386-tbl.h'),
        /static const char i386_mnemonics\[\] =/,
        /;\s*$/m,
        'i386_mnemonics in i386-tbl.h',
    );
    const bytes = [...table.matchAll(/"((?:[^"\\]|\\.)*)"/g)]
        .map(([, literal]) => unescapeC(literal))
        .join('');
    const offsets = new Map<string, number>();
    const pending = new Map<string, [string, number]>();
    for (
        const [, name, value] of readSource(binutils, 'opcodes/i386-mnem.h').matchAll(
            /^#define MN_(\w+) (.+)$/gm,
        )
    ) {
        const absolute = /^0x[0-9a-f]+$/.exec(value);
        const relative = /^\(MN_(\w+) \+ (\d+)\)$/.exec(value);
        if (absolute !== null) {
            offsets.set(name, Number.parseInt(value, 16));
        } else if (relative !== null) {
            pending.set(name, [relative[1], Number(relative[2])]);
        } else {
            throw new Error(`i386-mnem.h: unexpected value "${value}" for MN_${name}`);
        }
    }
    const resolve = (name: string, seen: Set<string>): number => {
        const known = offsets.get(name);
        if (known !== undefined) {
            return known;
        }
        const reference = pending.get(name);
        if (reference === undefined || seen.has(name)) {
            throw new Error(`i386-mnem.h: MN_${name} cannot be resolved`);
        }
        const offset = resolve(reference[0], new Set([...seen, name])) + reference[1];
        offsets.set(name, offset);
        return offset;
    };
    for (const name of pending.keys()) {
        resolve(name, new Set());
    }
    return new Map(
        [...offsets].map(([identifier, offset]) => {
            const end = bytes.indexOf('\0', offset);
            const name = bytes.slice(offset, end === -1 ? undefined : end);
            if (name.replace(/[^a-z0-9]/g, '_') !== identifier) {
                throw new Error(`i386-mnem.h: MN_${identifier} resolves to "${name}"`);
            }
            return [identifier, name];
        }),
    );
}

function intelFloatOperand(mnemonic: string): number {
    const at = (index: number) => mnemonic[index] ?? '';
    if (at(0) !== 'f') {
        return 0;
    }
    switch (at(1)) {
        case 'i':
            return 2;
        case 'l':
            return at(2) === 'd' && (at(3) === 'c' || at(3) === 'e') ? 3 : 1;
        case 'n':
            return at(2) !== 'o' ? 3 : 1;
        case 'r':
            return at(2) === 's' ? 3 : 1;
        case 's':
            if (at(2) === 'a') {
                return 3;
            }
            return at(2) === 't' && ['c', 'd', 'e', 's'].includes(at(3)) ? 3 : 1;
        case 'x':
            return at(2) === 'r' || at(2) === 's' ? 0 : 1;
        default:
            return 1;
    }
}

type SuffixSize = 'b' | 'w' | 'l' | 's' | 'q';

interface X86Templates {
    suffixes: Map<string, Set<SuffixSize>>;
    flags: Set<string>;
}

function x86Templates(binutils: Project, names: Map<string, string>): X86Templates {
    const header = readSource(binutils, 'opcodes/i386-opc.h');
    const struct = section(
        header,
        /typedef struct i386_opcode_modifier\s*\{/,
        /^\}/m,
        'i386_opcode_modifier in i386-opc.h',
    );
    const fields = [...withoutComments(struct).matchAll(/unsigned int (\w+):\d+;/g)].map(
        ([, field]) => field,
    );
    const position = (field: string) => {
        const index = fields.indexOf(field);
        if (index === -1) {
            throw new Error(`i386-opc.h: i386_opcode_modifier has no ${field}`);
        }
        return index;
    };
    const scc = /^#define SCC (\d+)\b/m.exec(header);
    if (scc === null) {
        throw new Error('i386-opc.h: no SCC operand constraint');
    }
    const sizes: SuffixSize[] = ['b', 'w', 'l', 's', 'q'];
    const optab = section(
        readSource(binutils, 'opcodes/i386-tbl.h'),
        /static const insn_template i386_optab\[\] =\s*\{/,
        /^\};/m,
        'i386_optab in i386-tbl.h',
    );
    const allowed = new Map<string, Set<SuffixSize>>();
    const flags = new Set<string>();
    for (const [, identifier, modifier] of optab.matchAll(/\{ MN_(\w+),[^{]*\{([^}]*)\}/g)) {
        const name = names.get(identifier);
        const bits = modifier.split(',').map((bit) => bit.trim()).filter((bit) => bit !== '');
        if (name === undefined || bits.length !== fields.length) {
            throw new Error(`i386-tbl.h: unexpected template for MN_${identifier}`);
        }
        const set = allowed.get(name) ?? new Set<SuffixSize>();
        for (const size of sizes) {
            if (bits[position(`no_${size}suf`)] === '0') {
                set.add(size);
            }
        }
        if (!allowed.has(name) && bits[position('operandconstraint')] === scc[1]) {
            flags.add(name);
        }
        allowed.set(name, set);
    }
    return { suffixes: allowed, flags };
}

function solarisForms(name: string): string[] {
    const forms: string[] = [];
    if (name.startsWith('fcmov') && name.length > 5) {
        forms.push(`fcmov.${name.slice(5)}`);
    } else if (name.startsWith('cmov') && name.length > 4) {
        forms.push(`cmov.${name.slice(4)}`);
        const size = name.at(-1) ?? '';
        if ('lqw'.includes(size) && name.length > 5) {
            forms.push(`cmov${size}.${name.slice(4, -1)}`);
        }
    }
    return forms;
}

function x86SuffixedForms(base: string, sizes: Set<SuffixSize>): string[] {
    const forms: string[] = [];
    if (sizes.has('b')) {
        forms.push(`${base}b`);
    }
    if (sizes.has('w') || ((intelFloatOperand(`${base}w`) & 2) !== 0 && sizes.has('s'))) {
        forms.push(`${base}w`);
    }
    if (sizes.has('l')) {
        forms.push(`${base}l`);
    }
    if (sizes.has('s')) {
        forms.push(`${base}s`);
    }
    if (sizes.has('q')) {
        forms.push(`${base}q`);
    }
    if (sizes.has(intelFloatOperand(`${base}d`) === 1 ? 's' : 'l')) {
        forms.push(`${base}d`);
    }
    return forms;
}

export function x86PrefixNames(binutils: Project): { literal: Set<string>; pseudo: boolean } {
    const literal = new Set<string>();
    let pseudo = false;
    for (const line of readSource(binutils, 'opcodes/i386-opc.tbl').split('\n')) {
        if (!/\bIsPrefix\b/.test(line)) {
            continue;
        }
        const name = line.split(',')[0].trim();
        if (/^\{<\w+>\}$/.test(name)) {
            pseudo = true;
        } else if (/^[a-z0-9.]+$/.test(name)) {
            literal.add(name);
        } else {
            throw new Error(`i386-opc.tbl: unexpected prefix entry "${name}"`);
        }
    }
    return { literal, pseudo };
}

export function x86DefaultFlags(binutils: Project): Keywords {
    const check = section(
        readSource(binutils, 'gas/config/tc-i386.c'),
        /^check_Scc_OszcOperations \(const char \*l\)\s*\{/m,
        /^\}/m,
        'check_Scc_OszcOperations',
    );
    const flags = new Keywords();
    for (const [, flag] of check.matchAll(/strncasecmp \(suffix_string, "(\w+)", 2\)/g)) {
        flags.add(flag.toLowerCase());
    }
    if (flags.size === 0) {
        throw new Error('tc-i386.c: check_Scc_OszcOperations names no flag');
    }
    return flags;
}

export function x86EncodingSuffixes(binutils: Project): Keywords {
    const file = 'gas/config/tc-i386.c';
    const branches = [
        ...withoutComments(readSource(binutils, file)).matchAll(
            /\bmnem_p - (\d) == dot_p\s*((?:&& dot_p\[\d\] == '\w'\s*)+)\)/g,
        ),
    ];
    if (branches.length === 0) {
        throw new Error(`${file}: parse_insn reads no suffix after a dot`);
    }
    const suffixes = new Keywords();
    for (const [, length, tests] of branches) {
        const letters = [...tests.matchAll(/'(\w)'/g)].map(([, letter]) => letter).join('');
        if (letters.length + 1 !== Number(length)) {
            throw new Error(`${file}: the suffix .${letters} does not take ${length} characters`);
        }
        suffixes.add(`.${letters}`);
    }
    return suffixes;
}

export function x86SyntaxWords(binutils: Project): Keywords {
    const file = 'gas/config/tc-i386.c';
    const rows = [
        ...section(
            withoutComments(readSource(binutils, file)),
            /^set_intel_syntax \(int syntax_flag\)\s*\{/m,
            /^\}/m,
            'set_intel_syntax',
        ).matchAll(/\bstrcmp \(string, "(\w+)"\) == 0\)\s*ask_naked_reg = (-?\d);/g),
    ];
    if (rows.length === 0) {
        throw new Error(`${file}: set_intel_syntax no longer compares a word as written`);
    }
    const words = new Keywords();
    for (const [, name, naked] of rows) {
        words.add(name, `binutils:naked:${naked}`, ...BINUTILS_LOWER_CASE);
    }
    return words;
}

export function x86IntelWords(binutils: Project): Keywords {
    const file = 'gas/config/tc-i386-intel.c';
    const source = withoutPreprocessorLines(withoutComments(readSource(binutils, file)));
    const words = new Keywords();
    const operators = section(source, /\bi386_operators\[\] =\s*\{/, /^\s*\};/m, 'i386_operators');
    for (
        const [, name, code, operands] of operators.matchAll(
            /\{\s*"(\w+)",\s*(O_\w+),\s*(\d)\s*\}/g,
        )
    ) {
        words.add(name, `binutils:operator:${code}:${operands}`);
    }
    const types = section(source, /\bi386_types\[\] =\s*\{/, /^\s*\};/m, 'i386_types');
    for (const pattern of [/\bI386_TYPE\((\w+),/g, /\{\s*"(\w+)",\s*O_\w+_ptr\b/g]) {
        for (const [, name] of types.matchAll(pattern)) {
            words.add(name, 'binutils:type');
        }
    }
    const operator = section(
        source,
        /^operatorT i386_operator \(const char \*name, unsigned int operands, char \*pc\)\s*\{/m,
        /^\}/m,
        'i386_operator',
    );
    const after = [...operator.matchAll(/\bstrcasecmp \(pname, "(\w+)"\) == 0/g)].map(([, name]) =>
        name
    );
    if (after.length === 0) {
        throw new Error(`${file}: i386_operator reads no word after a size`);
    }
    for (const name of after) {
        words.add(name, 'binutils:ptr');
    }
    for (const tag of ['binutils:operator:', 'binutils:type']) {
        if (!words.entries().some(([, tags]) => tags.some((known) => known.startsWith(tag)))) {
            throw new Error(`${file}: no ${tag} word`);
        }
    }
    return words;
}

export function x86Decorators(binutils: Project): Keywords {
    const file = 'gas/config/tc-i386.c';
    const source = withoutComments(readSource(binutils, file));
    const decorators = new Keywords();
    const rounding = [
        ...section(source, /\bRC_NamesTable\[\] =\s*\{/, /^\};/m, 'RC_NamesTable').matchAll(
            /STRING_COMMA_LEN \("([\w-]+)"\)/g,
        ),
    ];
    if (rounding.length === 0) {
        throw new Error(`${file}: RC_NamesTable is empty`);
    }
    for (const [, name] of rounding) {
        decorators.add(name, ...BINUTILS_LOWER_CASE);
    }
    const operations = section(
        source,
        /^check_VecOperations \(char \*op_string\)\s*\{/m,
        /^\}/m,
        'check_VecOperations',
    );
    const start = /if \(startswith \(op_string, "(\w+)"\)\)\s*\{\s*unsigned int bcst_type;/.exec(
        operations,
    );
    if (start === null) {
        throw new Error(`${file}: check_VecOperations reads no broadcast`);
    }
    const broadcast = section(
        operations.slice(start.index),
        /unsigned int bcst_type;/,
        /as_bad \(_\("Unsupported broadcast/,
        'the broadcast chain of check_VecOperations',
    );
    const counts = [...broadcast.matchAll(/\bbcst_type = (\d+);/g)];
    if (counts.length === 0) {
        throw new Error(`${file}: the broadcast chain of check_VecOperations sets no count`);
    }
    for (const [, count] of counts) {
        decorators.add(`${start[1]}${count}`, ...BINUTILS_LOWER_CASE);
    }
    const zeroing = /else if \(\*op_string == '(\w)'\)\s*\{\s*if \(!i\.mask\.reg\)/.exec(
        operations,
    );
    if (zeroing === null) {
        throw new Error(`${file}: check_VecOperations reads no zeroing-masking letter`);
    }
    decorators.add(zeroing[1], ...BINUTILS_LOWER_CASE);
    const check = section(
        source,
        /^check_Scc_OszcOperations \(const char \*l\)\s*\{/m,
        /^\}/m,
        'check_Scc_OszcOperations',
    );
    const insn = /\bif \(dot_insn \(\)\)\s*\{/.exec(check);
    if (insn === null) {
        throw new Error(`${file}: check_Scc_OszcOperations has no .insn branch`);
    }
    const open = insn.index + insn[0].length - 1;
    const plain = check.slice(0, insn.index) +
        check.slice(open + bracedBody(check, open).length + 2);
    const words = [...plain.matchAll(/\bstrncasecmp \(suffix_string, "(\w+)", \d+\) == 0/g)];
    const assigned = words.filter((word, index) =>
        plain.slice(word.index, words[index + 1]?.index ?? plain.length).includes(
            "*suffix_string == '='",
        )
    );
    if (assigned.length !== 1) {
        throw new Error(
            `${file}: check_Scc_OszcOperations reads ${assigned.length} words before '='`,
        );
    }
    decorators.add(assigned[0][1].toLowerCase(), 'binutils:flags');
    return decorators;
}

function readX86(binutils: Project): Pick<
    BinutilsTables,
    | 'x86Instructions'
    | 'x86FlagsInstructions'
    | 'x86DefaultFlags'
    | 'x86Prefixes'
    | 'x86PseudoPrefixes'
> {
    const prefixes = x86PrefixNames(binutils);
    const tables = {
        x86Instructions: new Keywords(),
        x86FlagsInstructions: new Keywords(),
        x86DefaultFlags: x86DefaultFlags(binutils),
        x86Prefixes: new Keywords(),
        x86PseudoPrefixes: new Keywords(),
    };
    const names = x86Mnemonics(binutils);
    const templates = x86Templates(binutils, names);
    const suffixes = templates.suffixes;
    for (const name of names.values()) {
        if (name.startsWith('.')) {
            continue;
        }
        if (name.startsWith('{')) {
            const braced = /^\{(\w+)\}$/.exec(name);
            if (!prefixes.pseudo || braced === null) {
                throw new Error(
                    `i386 mnemonic "${name}" has no pseudo-prefix entry in i386-opc.tbl`,
                );
            }
            tables.x86PseudoPrefixes.add(braced[1]);
        } else if (prefixes.literal.has(name)) {
            tables.x86Prefixes.add(name);
        } else {
            const forms = [name, ...x86SuffixedForms(name, suffixes.get(name) ?? new Set())];
            for (const form of forms) {
                tables.x86Instructions.add(form);
                if (templates.flags.has(name)) {
                    tables.x86FlagsInstructions.add(form);
                }
            }
        }
    }
    for (const name of prefixes.literal) {
        if (!tables.x86Prefixes.has(name)) {
            throw new Error(`i386-opc.tbl prefix "${name}" is missing from i386-mnem.h`);
        }
    }
    for (const [name] of tables.x86Instructions.entries()) {
        for (const form of solarisForms(name)) {
            tables.x86Instructions.add(form);
        }
    }
    return tables;
}

export function x86Registers(binutils: Project): Keywords {
    const file = 'opcodes/i386-reg.tbl';
    const rows = readSource(binutils, file)
        .split('\n')
        .filter((line) => line.trim() !== '' && !line.startsWith('//'))
        .map((line) => line.split(',').map((field) => field.trim()));
    const malformed = rows.find((fields) => fields.length !== 6);
    if (malformed !== undefined) {
        throw new Error(`${file}: unexpected register row "${malformed.join(', ')}"`);
    }
    const stack = rows.filter(([, type]) => /\bClass=RegFP\b/.test(type));
    const top = stack.filter(([, type]) => /\bInstance=Accum\b/.test(type));
    if (top.length !== 1) {
        throw new Error(`${file}: ${top.length} stack top registers instead of one`);
    }
    const registers = new Keywords();
    registers.add(top[0][0], `index:${stack.length}`);
    for (const [name, type, , number] of rows) {
        if (!/\bClass=RegFP\b/.test(type)) {
            registers.add(
                name,
                ...(number === 'RegFlat' ? ['binutils:RegFlat'] : []),
                ...(/\bClass=RegMask\b/.test(type) ? ['binutils:RegMask'] : []),
            );
        }
    }
    return registers;
}

function tableElements(text: string, start: RegExp, what: string): string[] {
    return initializerElements(withoutComments(section(text, start, /^\};/m, what)));
}

function conditionNames(text: string, start: RegExp, what: string): string[] {
    const body = withoutComments(section(text, start, /^\};/m, what));
    return [...body.matchAll(/"([a-z]+)"/g)].map(([, name]) => name);
}

function macroDefinition(source: string, name: string, file: string): string {
    const definition = new RegExp(`^#define ${name}\\b(?:.*\\\\\\n)*.*$`, 'm').exec(source);
    if (definition === null) {
        throw new Error(`${file}: no macro ${name}`);
    }
    return definition[0];
}

function preprocessed(
    binutils: Project,
    file: string,
    start: string,
    table: RegExp,
    macros: string[] = [],
): string {
    const source = readSource(binutils, file);
    const from = source.indexOf(start);
    const found = table.exec(source);
    if (from === -1 || found === null || found.index < from) {
        throw new Error(`${file}: cannot find the table and the macros before it`);
    }
    const prelude = macros.map((macro) => macroDefinition(source, macro, file)).join('\n');
    const work = workDirectory('binutils');
    const name = file.replace(/\W/g, '-');
    const input = join(work, `${name}.c`);
    const output = join(work, `${name}.i`);
    writeFileSync(input, `${prelude}\n${source.slice(from, found.index + found[0].length)}`);
    runOrThrow('gcc', ['-E', '-P', '-x', 'c', input, '-o', output]);
    return readFileSync(output, 'utf8');
}

const AARCH64_ELEMENT_BITS = new Map([
    ['b', 8],
    ['h', 16],
    ['s', 32],
    ['d', 64],
    ['q', 128],
]);

const AARCH64_TILE_TYPES = new Set(['ZAT', 'ZATH', 'ZATV']);

function registerRows(
    binutils: Project,
    file: string,
    table: RegExp,
    start: RegExp,
): { name: string; number: string; type: string }[] {
    const elements = tableElements(
        preprocessed(binutils, file, '#define REGDEF(s,n,t)', table),
        start,
        `reg_names in ${file}`,
    );
    return elements.map((element) => {
        const row = /^\{\s*"([^"]+)"\s*,\s*([^,]+?)\s*,\s*REG_TYPE_(\w+)\s*,/.exec(element);
        if (row === null) {
            throw new Error(`${file}: unexpected reg_names entry "${element}"`);
        }
        return { name: row[1].toLowerCase(), number: row[2], type: row[3] };
    });
}

function aarch64Registers(binutils: Project): Keywords {
    const registers = new Keywords();
    const rows = registerRows(
        binutils,
        'gas/config/tc-aarch64.c',
        /^static const reg_entry reg_names\[\] = \{[\s\S]*?^\};/m,
        /static const reg_entry reg_names\[\] = \{/,
    );
    for (const { name, number, type } of rows) {
        registers.add(name, `binutils:REG_TYPE_${type}`);
        if (AARCH64_TILE_TYPES.has(type)) {
            for (const [element, bits] of AARCH64_ELEMENT_BITS) {
                if (Number(number) * 8 < bits) {
                    registers.add(`${name}.${element}`);
                }
            }
        }
    }
    return registers;
}

function armRegisters(binutils: Project): Keywords {
    const registers = new Keywords();
    const rows = registerRows(
        binutils,
        'gas/config/tc-arm.c',
        /^static const struct reg_entry reg_names\[\] =\s*\{[\s\S]*?^\};/m,
        /static const struct reg_entry reg_names\[\] =\s*\{/,
    );
    for (const { name } of rows) {
        registers.add(name, 'binutils:arm_typed_reg_parse');
    }
    return registers;
}

function quotedNames(text: string, what: string): string[] {
    const names = [...text.matchAll(/\{\s*"([^"]+)"/g)].map(([, name]) => name.toLowerCase());
    if (names.length === 0) {
        throw new Error(`${what}: no names`);
    }
    return names;
}

function aarch64SystemRegisters(binutils: Project): Keywords {
    const registers = new Keywords();
    const file = 'opcodes/aarch64-sys-regs.def';
    const names = [
        ...withoutComments(readSource(binutils, file)).matchAll(/^\s*SYSREG\s*\(\s*"([^"]+)"/gm),
    ].map(([, name]) => name.toLowerCase());
    if (names.length === 0) {
        throw new Error(`${file}: no SYSREG entries`);
    }
    const pstate = quotedNames(
        withoutComments(
            section(
                readSource(binutils, 'opcodes/aarch64-opc.c'),
                /const aarch64_sys_reg aarch64_pstatefields \[\] =\s*\{/,
                /^\};/m,
                'aarch64_pstatefields',
            ),
        ),
        'aarch64_pstatefields',
    );
    for (const name of [...names, ...pstate]) {
        registers.add(name);
    }
    return registers;
}

function armSystemRegisters(binutils: Project): Keywords {
    const file = 'gas/config/tc-arm.c';
    const source = withoutComments(readSource(binutils, file));
    const registers = new Keywords();
    const fields = quotedNames(
        section(source, /static const struct asm_psr psrs\[\] =\s*\{/, /^\};/m, 'psrs'),
        'psrs',
    );
    const parse = section(
        source,
        /^parse_psr \(char \*\*str, bool lhs\)\s*\{/m,
        /^\}/m,
        'parse_psr',
    );
    const prefixes = [...parse.matchAll(/strncasecmp \(p, "(\w+)", 4\) == 0\)\s*\{([^}]*)\}/g)];
    if (prefixes.length === 0) {
        throw new Error(`${file}: parse_psr compares no PSR names`);
    }
    for (const [, prefix, branch] of prefixes) {
        const name = prefix.toLowerCase();
        if (/\bis_apsr = true;/.test(branch)) {
            registers.add(name, 'binutils:apsr_bits');
        } else {
            registers.add(name);
            for (const field of fields) {
                registers.add(`${name}_${field}`, 'binutils:psr_field');
            }
        }
    }
    const profile = /\bpsr->field <= (\d+)\)/.exec(parse);
    if (profile === null) {
        throw new Error(`${file}: parse_psr has no APSR field limit for M-profile names`);
    }
    const v7m = section(
        source,
        /static const struct asm_psr v7m_psrs\[\] =\s*\{/,
        /^\};/m,
        'v7m_psrs',
    );
    for (const [, name, field] of v7m.matchAll(/\{\s*"([^"]+)"\s*,\s*(\w+)\s*\}/g)) {
        registers.add(
            name.toLowerCase(),
            ...(Number(field) <= Number(profile[1]) ? ['binutils:apsr_bits'] : []),
        );
    }
    if (!/case OP_APSR_RR:[\s\S]*?strncasecmp \(str, "APSR_", 5\)/.test(source)) {
        throw new Error(`${file}: OP_APSR_RR no longer reads APSR_ flags`);
    }
    registers.add('apsr', 'binutils:apsr_flags');
    return registers;
}

function quotedTableNames(source: string, start: RegExp, what: string): string[] {
    const open = start.exec(source);
    if (open === null) {
        throw new Error(`no ${what}`);
    }
    const names = [
        ...bracedBody(source, open.index + open[0].length - 1).matchAll(/\{\s*"([\w-]+)",/g),
    ].map(([, name]) => name);
    if (names.length === 0) {
        throw new Error(`${what} is empty`);
    }
    return names;
}

export function aarch64Relocations(binutils: Project): Keywords {
    const file = 'gas/config/tc-aarch64.c';
    const source = withoutComments(readSource(binutils, file));
    if (!/\bstrncasecmp \(reloc_table\[i\]\.name, \*str, length\) == 0/.test(source)) {
        throw new Error(`${file}: find_reloc_table_entry no longer reads a name in any case`);
    }
    const relocations = new Keywords();
    for (const name of quotedTableNames(source, /\breloc_table\[\] =\s*\{/, 'reloc_table')) {
        relocations.add(name);
    }
    return relocations;
}

export function armRelocations(binutils: Project): Keywords {
    const file = 'gas/config/tc-arm.c';
    const source = withoutComments(readSource(binutils, file));
    if (!/\bstrncasecmp \(group_reloc_table\[i\]\.name, \*str, length\) == 0/.test(source)) {
        throw new Error(`${file}: find_group_reloc_table_entry no longer reads a name in any case`);
    }
    const relocations = new Keywords();
    for (
        const name of quotedTableNames(
            source,
            /\bgroup_reloc_table\[\] =\s*\{/,
            'group_reloc_table',
        )
    ) {
        relocations.add(name);
    }
    const half = [
        ...section(source, /^parse_half \(char \*\*str\)\s*\{/m, /^\}/m, 'parse_half').matchAll(
            /\bstrncasecmp \(p, ":(\w+):", \d+\) == 0/g,
        ),
    ];
    if (half.length === 0) {
        throw new Error(`${file}: parse_half reads no relocation`);
    }
    for (const [, name] of half) {
        relocations.add(name);
    }
    return relocations;
}

export function armSuffixRelocations(binutils: Project): Keywords {
    const source = withoutComments(readSource(binutils, ARM_GAS));
    if (!/\bstr_hash_find_n \(arm_reloc_hsh, p, q - p\)/.test(source)) {
        throw new Error(`${ARM_GAS}: parse_reloc no longer looks a name up as written`);
    }
    return writtenNames(
        quotedTableNames(source, /\breloc_names\[\] =\s*\{/, 'reloc_names'),
        'binutils',
        `${ARM_GAS} reloc_names`,
    );
}

function functionBody(source: string, name: string, what: string): string {
    return section(source, new RegExp(`^${name} \\([^)]*\\)\\s*\\{`, 'm'), /^\}/m, what);
}

export function machoSectionTypes(binutils: Project): Keywords {
    const file = 'bfd/mach-o.c';
    const source = withoutComments(readSource(binutils, file));
    if (
        !/\bif \(strcmp \(x->name, name\) == 0\)/.test(
            functionBody(source, 'bfd_mach_o_get_section_type_from_name', 'lookup'),
        )
    ) {
        throw new Error(`${file}: section types are no longer looked up as written`);
    }
    return writtenNames(
        quotedTableNames(source, /\bbfd_mach_o_section_type_name\[\] =\s*\{/, 'section types'),
        'binutils',
        `${file} section types`,
    );
}

export function aarch64Shifts(binutils: Project): Keywords {
    const header = 'include/opcode/aarch64.h';
    const kinds = [
        ...section(
            withoutComments(readSource(binutils, header)),
            /^enum aarch64_modifier_kind\s*\{/m,
            /^\};/m,
            'aarch64_modifier_kind',
        ).matchAll(/\b(AARCH64_MOD_\w+)\b/g),
    ].map(([, kind]) => kind);
    const opc = withoutComments(readSource(binutils, 'opcodes/aarch64-opc.c'));
    const names = [
        ...section(opc, /\baarch64_operand_modifiers \[\] =\s*\{/, /^\};/m, 'modifiers').matchAll(
            /\{"([^"]+)",/g,
        ),
    ].map(([, name]) => name);
    if (kinds.length === 0 || names.length !== kinds.length || kinds[0] !== 'AARCH64_MOD_NONE') {
        throw new Error(`${header}: the modifier kinds no longer index aarch64_operand_modifiers`);
    }
    const extend = /\breturn kind > (AARCH64_MOD_\w+) && kind <= (AARCH64_MOD_\w+);/.exec(
        section(
            opc,
            /^aarch64_extend_operator_p \(enum aarch64_modifier_kind kind\)\s*\{/m,
            /^\}/m,
            'p',
        ),
    );
    if (extend === null) {
        throw new Error(
            'opcodes/aarch64-opc.c: aarch64_extend_operator_p is no longer a kind range',
        );
    }
    if (
        !/\bchecked_hash_insert \(aarch64_shift_hsh, get_upper_str \(name\),/.test(
            withoutComments(readSource(binutils, AARCH64_GAS)),
        )
    ) {
        throw new Error(`${AARCH64_GAS}: modifiers are no longer hashed in lower and upper case`);
    }
    const shifts = new Keywords();
    for (const [index, name] of names.entries()) {
        if (index === 0 || name.includes(' ')) {
            continue;
        }
        const extending = index > kinds.indexOf(extend[1]) && index <= kinds.indexOf(extend[2]);
        shifts.add(
            name,
            extending ? 'binutils:extend' : 'binutils:shift',
            'binutils:no-mixed-case',
        );
    }
    return shifts;
}

export function armShifts(binutils: Project): Keywords {
    const source = withoutComments(readSource(binutils, ARM_GAS));
    const parse = section(
        source,
        /^parse_shift \(char \*\*str, int i, enum parse_shift_mode mode\)\s*\{/m,
        /^\}/m,
        'parse_shift',
    );
    const bare = /\bif \(shift != (SHIFT_\w+)\)\s*\{\s*skip_whitespace \(p\);/.exec(parse);
    if (bare === null || !/\bstr_hash_find_n \(arm_shift_hsh, \*str, p - \*str\)/.test(parse)) {
        throw new Error(`${ARM_GAS}: parse_shift no longer reads a written shift and its amount`);
    }
    const rows = [
        ...section(source, /\bshift_names \[\] =\s*\{/, /^\};/m, 'shift_names').matchAll(
            /\{\s*"(\w+)",\s*(SHIFT_\w+)\s*\}/g,
        ),
    ];
    if (rows.length === 0) {
        throw new Error(`${ARM_GAS}: shift_names is empty`);
    }
    const kinds = new Map(rows.map(([, name, kind]) => [name.toLowerCase(), kind]));
    const shifts = new Keywords();
    for (
        const [name, tags] of writtenCases(
            rows.map(([, name]) => name),
            'binutils',
            `${ARM_GAS} shift_names`,
        )
    ) {
        shifts.add(
            name,
            kinds.get(name) === bare[1] ? 'binutils:extend' : 'binutils:shift',
            ...tags,
        );
    }
    return shifts;
}

export function aarch64PredicateQualifiers(binutils: Project): Keywords {
    const body = section(
        withoutComments(readSource(binutils, AARCH64_GAS)),
        /^parse_predication_for_operand \(struct vector_type_el \*parsed_type, char \*\*str\)\s*\{/m,
        /^\}/m,
        'parse_predication_for_operand',
    );
    const letters = [...body.matchAll(/\bcase '(\w)':/g)].map(([, letter]) => letter);
    if (!/\bswitch \(TOLOWER \(\*ptr\)\)/.test(body) || letters.length === 0) {
        throw new Error(
            `${AARCH64_GAS}: parse_predication_for_operand reads no letter in any case`,
        );
    }
    const qualifiers = new Keywords();
    for (const letter of letters) {
        qualifiers.add(letter);
    }
    return qualifiers;
}

export function aarch64Signature(element: string): string {
    return [...element.matchAll(/AARCH64_OPND_\w+/g)]
        .map(([operand]) => operand)
        .filter((operand) =>
            operand !== 'AARCH64_OPND_NIL' && !operand.startsWith('AARCH64_OPND_QLF_')
        )
        .map((operand) =>
            AARCH64_LABEL_OPERAND.test(operand)
                ? 'L'
                : AARCH64_CONDITION_OPERAND.test(operand)
                ? 'C'
                : AARCH64_SYSTEM_OPERAND.test(operand)
                ? 'S'
                : 'O'
        )
        .join('');
}

export function armSignature(operands: string): string {
    return initializerElements(operands.replace(/^\{|\}$/g, ''))
        .filter((operand) => operand !== 'OP_stop')
        .map((operand) => {
            const kind = ARM_LABEL_OPERAND.test(operand)
                ? 'L'
                : ARM_CONDITION_OPERAND.test(operand)
                ? 'C'
                : ARM_SYSTEM_OPERAND.test(operand)
                ? 'S'
                : 'O';
            return ARM_OPTIONAL_OPERAND.test(operand) ? kind.toLowerCase() : kind;
        })
        .join('');
}

function readAarch64(binutils: Project): Pick<
    BinutilsTables,
    'aarch64Instructions' | 'aarch64Conditions' | 'aarch64Signatures'
> {
    const instructions = new Keywords();
    const signatures = new Signatures();
    const table = /^const struct aarch64_opcode aarch64_opcode_table\[\] =\s*\{[\s\S]*?^\};/m;
    const elements = tableElements(
        preprocessed(binutils, 'opcodes/aarch64-tbl.h', '#define OPND(x)', table),
        /const struct aarch64_opcode aarch64_opcode_table\[\] =\s*\{/,
        'aarch64_opcode_table',
    );
    const aarch64Conditions = new Keywords();
    const gas = withoutComments(readSource(binutils, AARCH64_GAS));
    if (!/\bchecked_hash_insert \(aarch64_cond_hsh, get_upper_str \(name\),/.test(gas)) {
        throw new Error(`${AARCH64_GAS}: conditions are no longer hashed in lower and upper case`);
    }
    for (
        const name of conditionNames(
            readSource(binutils, 'opcodes/aarch64-opc.c'),
            /const aarch64_cond aarch64_conds\[\d*\] =\s*\{/,
            'aarch64_conds',
        )
    ) {
        aarch64Conditions.add(name, 'binutils:no-mixed-case');
    }
    for (const element of elements) {
        const name = leadingString(element);
        if (name === undefined) {
            if (/^\{\s*(0|NULL)\s*,/.test(element)) {
                continue;
            }
            throw new Error(`aarch64-tbl.h: entry without a name: ${element.slice(0, 80)}`);
        }
        signatures.add(name, aarch64Signature(element));
        const conditional = /^([a-z0-9]+)\.c$/.exec(name);
        if (conditional !== null) {
            for (const [condition] of aarch64Conditions.entries()) {
                instructions.add(`${conditional[1]}.${condition}`);
            }
        } else if (name.includes('.')) {
            throw new Error(`aarch64-tbl.h: unexpected dotted name "${name}"`);
        } else {
            instructions.add(name);
        }
    }
    return { aarch64Instructions: instructions, aarch64Conditions, aarch64Signatures: signatures };
}

function readArm(binutils: Project): Pick<
    BinutilsTables,
    | 'armInstructions'
    | 'armConditions'
    | 'armVectorConditions'
    | 'armTypeElements'
    | 'armSignatures'
> {
    const instructions = new Keywords();
    const signatures = new Signatures();
    const table = /^static const struct asm_opcode insns\[\] =\s*\{[\s\S]*?^\};/m;
    const elements = tableElements(
        preprocessed(binutils, 'gas/config/tc-arm.c', '#define OPS0()', table, [
            'MIX_ARM_THUMB_OPERANDS',
        ]),
        /static const struct asm_opcode insns\[\] =\s*\{/,
        'insns in tc-arm.c',
    );
    for (const element of elements) {
        const name = leadingString(element);
        const tag = /\bOT_\w+/.exec(element)?.[0];
        if (name === undefined || tag === undefined) {
            throw new Error(`tc-arm.c: unexpected insns[] entry: ${element.slice(0, 80)}`);
        }
        const fields = initializerElements(element.slice(1, -1));
        const flags = [
            ...(ARM_SUFFIX_TAGS.has(tag) ? ['ARM_CONDITION'] : []),
            ...(ARM_INFIX_TAGS.has(tag) ? ['ARM_CONDITION_INFIX'] : []),
            ...(fields.at(-1) === '1' ? ['ARM_VECTOR_CONDITION'] : []),
        ];
        instructions.add(name.split('.')[0], ...flags);
        signatures.add(name, armSignature(fields[1] ?? ''));
    }
    const source = readSource(binutils, 'gas/config/tc-arm.c');
    const armConditions = new Keywords();
    for (
        const name of conditionNames(
            source,
            /static const struct asm_cond conds\[\] =\s*\{/,
            'conds',
        )
    ) {
        armConditions.add(name);
    }
    const armVectorConditions = new Keywords();
    for (
        const name of conditionNames(
            source,
            /static const struct asm_cond vconds\[\] =\s*\{/,
            'vconds',
        )
    ) {
        armVectorConditions.add(name);
    }
    const typeElements = /^#define NEON_MAX_TYPE_ELS (\d+)$/m.exec(source);
    if (typeElements === null) {
        throw new Error('tc-arm.c: no NEON_MAX_TYPE_ELS');
    }
    return {
        armInstructions: instructions,
        armConditions,
        armVectorConditions,
        armTypeElements: Number(typeElements[1]),
        armSignatures: signatures,
    };
}

interface ShellArm {
    patterns: string[];
    body: string;
}

export function shellCaseArms(text: string, what: string): ShellArm[] {
    const arms: ShellArm[] = [];
    let index = 0;
    for (let close = text.indexOf(')', index); close !== -1; close = text.indexOf(')', index)) {
        const tokens = /;;|\bcase\b|\besac\b/g;
        tokens.lastIndex = close + 1;
        let depth = 0;
        let end = -1;
        for (let token = tokens.exec(text); token !== null; token = tokens.exec(text)) {
            if (token[0] === 'case') {
                depth++;
            } else if (token[0] === 'esac') {
                depth--;
            } else if (depth === 0) {
                end = token.index;
                break;
            }
        }
        if (end === -1) {
            throw new Error(`${what}: an arm does not end`);
        }
        const patterns = text.slice(index, close).split('|').map((pattern) =>
            pattern.replace(/\\\s*\n/g, '').trim()
        );
        if (patterns.some((pattern) => !/^[\w*?[\]!.-]+$/.test(pattern))) {
            throw new Error(`${what}: unexpected arm pattern "${text.slice(index, close).trim()}"`);
        }
        arms.push({ patterns, body: text.slice(close + 1, end) });
        index = end + 2;
    }
    if (text.slice(index).trim() !== '') {
        throw new Error(`${what}: text after the last arm`);
    }
    return arms;
}

export function globMatches(glob: string, word: string): boolean {
    const pattern = glob
        .replace(/[.+^${}()|\\]/g, '\\$&')
        .replace(/\[!/g, '[^')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
    return new RegExp(`^${pattern}$`).test(word);
}

export function objectFormats(binutils: Project, cpuType: string): Set<string> {
    const what = 'the generic_target case in gas/configure.tgt';
    const text = readSource(binutils, 'gas/configure.tgt').replace(/^[ \t]*#.*$/gm, '');
    const formats = new Set<string>();
    for (
        const arm of shellCaseArms(
            section(text, /^case \$\{generic_target\} in$/m, /^esac$/m, what),
            what,
        )
    ) {
        const cpus = arm.patterns.map((pattern) => pattern.split('-')[0]);
        if (cpus.some((cpu) => cpu !== '*' && globMatches(cpu, cpuType))) {
            for (const [, format] of arm.body.matchAll(/\bfmt=(\w+)/g)) {
                formats.add(format);
            }
        }
    }
    if (formats.size === 0) {
        throw new Error(`${what}: no object format for ${cpuType}`);
    }
    if (formats.has('ecoff') || formats.has('multi')) {
        throw new Error(
            `${what}: ${cpuType} builds ECOFF, which inserts the ECOFF debugging pseudo-ops`,
        );
    }
    return formats;
}

function formatTables(binutils: Project, format: string): string[] {
    const text = ['c', 'h']
        .map((extension) =>
            withoutComments(readSource(binutils, `gas/config/obj-${format}.${extension}`))
        )
        .join('\n');
    const tables = [...text.matchAll(/(if \(ECOFF_DEBUGGING\)\s*)?\bpop_insert \((\w+)\)/g)]
        .filter(([, guarded]) => guarded === undefined)
        .map(([, , table]) => table);
    if (tables.length === 0) {
        throw new Error(`gas/config/obj-${format}: no pseudo-op table is inserted`);
    }
    return tables;
}

function definedMacros(text: string): Set<string> {
    return new Set([...text.matchAll(/^[ \t]*#[ \t]*define[ \t]+(\w+)/gm)].map(([, name]) => name));
}

function macroBody(binutils: Project, file: string, name: string): string {
    const definition = macroDefinition(withoutComments(readSource(binutils, file)), name, file);
    return definition.replace(/\\\n/g, ' ').replace(new RegExp(`^#define ${name}`), '');
}

function coffMacros(binutils: Project, cpuType: string): Map<string, string> {
    const target = /^#define (TC_\w+) 1$/m.exec(readSource(binutils, `gas/config/tc-${cpuType}.h`));
    if (target === null) {
        throw new Error(`gas/config/tc-${cpuType}.h: no TC_ macro`);
    }
    const coffHeader = new RegExp(`^#ifdef ${target[1]}\\s*\\n#include "(coff/[\\w-]+\\.h)"`, 'm')
        .exec(readSource(binutils, 'gas/config/obj-coff.h'));
    if (coffHeader === null) {
        throw new Error(`gas/config/obj-coff.h: no COFF header for ${target[1]}`);
    }
    const coffDefines = definedMacros(readSource(binutils, `include/${coffHeader[1]}`));
    const choice =
        /^#if defined \((\w+)\)\s*\n#include "([\w-]+)\.c"\s*\n#else\s*\n#include "([\w-]+)\.c"/m
            .exec(readSource(binutils, 'gas/config/obj-coff.c'));
    if (choice === null) {
        throw new Error('gas/config/obj-coff.c: no SEH source choice');
    }
    const seh = coffDefines.has(choice[1]) ? choice[2] : choice[3];
    return new Map([['SEH_CMDS', macroBody(binutils, `gas/config/${seh}.h`, 'SEH_CMDS')]]);
}

interface PseudoOp {
    name: string;
    handler: string;
    argument: string;
}

export function pseudoOps(
    binutils: Project,
    file: string,
    table: string,
    macros = new Map<string, string>(),
): PseudoOp[] {
    const source = withoutComments(readSource(binutils, file));
    const starts = [
        ...source.matchAll(new RegExp(`pseudo_typeS\\s+${table}\\s*\\[\\s*\\]\\s*=`, 'g')),
    ];
    if (starts.length === 0) {
        throw new Error(`${file}: no ${table}`);
    }
    const entries: PseudoOp[] = [];
    for (const start of starts) {
        let body = withoutPreprocessorLines(bracedBody(source, start.index + start[0].length));
        for (const [name, expansion] of macros) {
            body = body.replace(new RegExp(`\\b${name}\\b`, 'g'), expansion);
        }
        for (const element of initializerElements(body)) {
            if (/^\{\s*(?:NULL|0)\s*,/.test(element)) {
                continue;
            }
            const name = leadingString(element);
            const fields = initializerElements(element.slice(1, -1));
            if (name === undefined || fields.length !== 3) {
                throw new Error(
                    `${file}: ${table} entry "${element}" is not a name, a handler and an argument`,
                );
            }
            entries.push({ name, handler: fields[1], argument: fields[2] });
        }
    }
    return entries;
}

function functionsCalling(source: string, callee: string): string[] {
    const text = withoutComments(source);
    const call = new RegExp(`\\b${callee}\\s*\\(`);
    return [...text.matchAll(/^(?:[A-Za-z_][\w \t*]*[ \t*])?(\w+)[ \t]*\([^;{}]*\)\s*\{/gm)]
        .filter((definition) =>
            call.test(bracedBody(text, definition.index + definition[0].length - 1))
        )
        .map(([, name]) => name);
}

interface PseudoTable {
    file: string;
    table: string;
    macros?: Map<string, string>;
}

function readDirectives(binutils: Project, cpuType: string): Keywords {
    const header = readSource(binutils, `gas/config/tc-${cpuType}.h`);
    const defines = (macro: string) => new RegExp(`^#define ${macro}\\b`, 'm').test(header);
    if (defines('TC_CASE_SENSITIVE')) {
        throw new Error(
            `gas/config/tc-${cpuType}.h: case-sensitive pseudo-ops need case-preserving tables`,
        );
    }
    const tables: PseudoTable[] = [
        { file: 'gas/read.c', table: 'potable' },
        { file: `gas/config/tc-${cpuType}.c`, table: 'md_pseudo_table' },
    ];
    if (defines('TARGET_USE_CFIPOP')) {
        tables.push({ file: 'gas/dw2gencfi.c', table: 'cfi_pseudo_table' });
    }
    if (defines('TARGET_USE_SCFI')) {
        tables.push({ file: 'gas/scfidw2gen.c', table: 'scfi_pseudo_table' });
    }
    for (const format of objectFormats(binutils, cpuType)) {
        const macros = format === 'coff' ? coffMacros(binutils, cpuType) : undefined;
        for (const table of formatTables(binutils, format)) {
            tables.push({ file: `gas/config/obj-${format}.c`, table, macros });
        }
    }
    const readers = functionsCalling(readSource(binutils, 'gas/read.c'), 'parse_one_float');
    if (readers.length === 0) {
        throw new Error('gas/read.c: no function calls parse_one_float');
    }
    const target = readSource(binutils, `gas/config/tc-${cpuType}.c`);
    const calls = new Map<string, string[]>();
    for (const reader of readers) {
        for (const wrapper of functionsCalling(target, reader)) {
            calls.set(wrapper, [...(calls.get(wrapper) ?? []), reader]);
        }
    }
    const directives = new Keywords();
    for (const { file, table, macros } of tables) {
        for (const { name, handler, argument } of pseudoOps(binutils, file, table, macros)) {
            if (name === name.toLowerCase()) {
                directives.add(
                    `.${name}`,
                    `binutils:${handler}`,
                    `binutils:${handler}:${argument}`,
                    ...(calls.get(handler) ?? []).map((reader) => `binutils:${reader}`),
                );
            }
        }
    }
    return directives;
}

export function readBinutils(binutils: Project): BinutilsTables {
    return {
        ...readX86(binutils),
        ...readAarch64(binutils),
        ...readArm(binutils),
        x86Directives: readDirectives(binutils, 'i386'),
        aarch64Directives: readDirectives(binutils, 'aarch64'),
        armDirectives: readDirectives(binutils, 'arm'),
        x86Registers: x86Registers(binutils),
        x86EncodingSuffixes: x86EncodingSuffixes(binutils),
        x86SyntaxWords: x86SyntaxWords(binutils),
        x86IntelWords: x86IntelWords(binutils),
        x86Decorators: x86Decorators(binutils),
        aarch64Relocations: aarch64Relocations(binutils),
        armRelocations: armRelocations(binutils),
        armSuffixRelocations: armSuffixRelocations(binutils),
        aarch64Shifts: aarch64Shifts(binutils),
        armShifts: armShifts(binutils),
        aarch64PredicateQualifiers: aarch64PredicateQualifiers(binutils),
        machoSectionTypes: machoSectionTypes(binutils),
        aarch64Registers: aarch64Registers(binutils),
        armRegisters: armRegisters(binutils),
        aarch64SystemRegisters: aarch64SystemRegisters(binutils),
        armSystemRegisters: armSystemRegisters(binutils),
    };
}
