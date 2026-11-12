// SPDX-License-Identifier: MIT

import { createRequire } from 'node:module';

import type { Block, Language } from './manifest.ts';
import {
    definedFlag,
    dialectArchs,
    dialectDefines,
    type KeywordSources,
    tableEntries,
} from './tables.ts';

export type Semicolons = 'SEPARATES' | 'COMMENTS' | 'HEURISTIC';

export interface StatementLexing {
    gnuSyntax: boolean;
    backquoteStrings: boolean;
    percentMacros: boolean;
    commentJoins: boolean;
    spacedJoins: boolean;
    reservedNames: boolean;
    namedStatements: boolean;
    semicolons: Semicolons;
    hashImmediates: boolean;
    hashNeedsValue: boolean;
    atComments: boolean;
    atTypes: boolean;
}

export interface BlockWord {
    pattern: RegExp;
    startsLine: boolean;
}

export interface BlockKind {
    openers: BlockWord[];
    clauses: BlockWord[];
    closers: string[];
}

export interface BlockPatternSource {
    blocks: BlockKind[];
    nameCharacter: RegExp;
    labelName: string;
    lexing: StatementLexing;
}

export interface StatementWord {
    name: string;
    symbol: string;
    flags: string;
}

const BLANKS = ' \\t\\f\\v\\r';
const BLANK = `[${BLANKS}]`;
const VALUE_START = "A-Za-z0-9_.(\\-+~!'\\\\:";
const CHARACTER = "'(?:\\\\.?|[^\\\\])?'?";
const BLOCK_COMMENT = '/\\*(?:[^*]|\\*+[^*/])*\\*+/';
const OPEN_BLOCK_COMMENT = '/\\*(?:[^*]|\\*+[^*/])*\\**';
const LINE_COMMENT = '//.*';

const load = createRequire(import.meta.url);
const lexical = load('../../tree-sitter/common/lexical.js');
const { DOLLAR_LABELS } = load('../../tree-sitter/common/arch/arm.js');

function classBody(pattern: RegExp): string {
    const source = pattern.source;
    if (!/^\[[^\]^]+\]$/.test(source)) {
        throw new Error(`expected a positive character class, got /${source}/`);
    }
    return source.slice(1, -1);
}

function expandClass(body: string): string[] {
    const characters: string[] = [];
    for (let index = 0; index < body.length; index++) {
        if (body[index + 1] === '-' && index + 2 < body.length) {
            for (let code = body.charCodeAt(index); code <= body.charCodeAt(index + 2); code++) {
                characters.push(String.fromCharCode(code));
            }
            index += 2;
        } else {
            characters.push(body[index]);
        }
    }
    return characters;
}

function classMember(character: string): string {
    return /[\\\]^\-[]/.test(character) ? `\\${character}` : character;
}

function characterClass(characters: string[]): string {
    const codes = [...new Set(characters)].map((character) => character.charCodeAt(0)).sort((
        a,
        b,
    ) => a - b);
    const parts: string[] = [];
    for (let index = 0; index < codes.length;) {
        let end = index;
        while (end + 1 < codes.length && codes[end + 1] === codes[end] + 1) {
            end++;
        }
        const first = classMember(String.fromCharCode(codes[index]));
        const last = classMember(String.fromCharCode(codes[end]));
        parts.push(end - index >= 2 ? `${first}-${last}` : end > index ? `${first}${last}` : first);
        index = end + 1;
    }
    return `[${parts.join('')}]`;
}

function caseless(character: string): string {
    const lower = character.toLowerCase();
    const upper = character.toUpperCase();
    return lower === upper ? classMember(character) : `${lower}${upper}`;
}

function caselessWord(word: string): RegExp {
    return new RegExp([...word].map((character) => `[${caseless(character)}]`).join(''));
}

function literal(character: string): string {
    if (character.toLowerCase() !== character.toUpperCase()) {
        return `[${caseless(character)}]`;
    }
    return /[\\^$.*+?()[\]{}|]/.test(character) ? `\\${character}` : character;
}

function quoted(quote: string, escapes: boolean): string {
    return escapes
        ? `${quote}(?:[^${quote}\\\\]|\\\\.)*(?:${quote}|\\\\?$)`
        : `${quote}[^${quote}]*${quote}?`;
}

interface TrieNode {
    terminal: boolean;
    children: Map<string, TrieNode>;
}

function trieOf(words: string[]): TrieNode {
    const root: TrieNode = { terminal: false, children: new Map() };
    for (const word of words) {
        let node = root;
        for (const character of word.toLowerCase()) {
            let child = node.children.get(character);
            if (child === undefined) {
                child = { terminal: false, children: new Map() };
                node.children.set(character, child);
            }
            node = child;
        }
        node.terminal = true;
    }
    return root;
}

function notWords(node: TrieNode, alphabet: string[], word: string): string {
    const alternatives: string[] = [];
    if (!node.terminal) {
        alternatives.push('');
    }
    const taken = new Set([...node.children.keys()].flatMap((character) => [
        character.toLowerCase(),
        character.toUpperCase(),
    ]));
    const others = alphabet.filter((character) => !taken.has(character));
    if (others.length > 0) {
        alternatives.push(`${characterClass(others)}${word}*`);
    }
    for (const [character, child] of node.children) {
        alternatives.push(`[${caseless(character)}]${notWords(child, alphabet, word)}`);
    }
    return `(?:${alternatives.join('|')})`;
}

export function blockOpenerPattern(source: BlockPatternSource): string {
    const { lexing } = source;
    const name = classBody(source.nameCharacter);
    const alphabet = [...expandClass(name), ...(lexing.gnuSyntax ? ['\\'] : [])];
    const wordClass = lexing.gnuSyntax ? `${name}\\\\` : name;
    const word = `[${wordClass}]`;
    const hashComments = lexing.gnuSyntax && !lexing.hashImmediates;
    const hashValues = lexing.gnuSyntax && lexing.hashImmediates && lexing.hashNeedsValue;
    const quotes = ['"', "'", ...(lexing.backquoteStrings ? ['`'] : [])];
    const specials = `${quotes.join('')};${hashComments || hashValues ? '#' : ''}${
        lexing.atComments ? '@' : ''
    }`;
    const tokens = [
        ...quotes.map((quote) =>
            lexing.gnuSyntax && quote === "'"
                ? CHARACTER
                : quoted(quote, !lexing.backquoteStrings || quote === '`')
        ),
        ...(lexing.gnuSyntax ? [BLOCK_COMMENT] : []),
    ];
    if (hashValues) {
        tokens.push(`#(?:[${VALUE_START.replace("'", '')}]|${CHARACTER})`);
    }
    if (lexing.atComments && lexing.atTypes) {
        tokens.push('@[A-Za-z_]');
    }
    const glued = lexing.atComments ? [`${word}@[${name}]*`] : [];
    const glue = lexing.atComments ? `(?:@[${name}]*)*` : '';
    const either = (...alternatives: string[]) => `(?:${alternatives.join('|')})`;
    const code = `${either(...tokens, ...glued, `[^${specials}]`)}*`;
    const after = `(?:${either(...tokens, `[^${wordClass}${specials}]`)}${code})?`;

    const tails = lexing.gnuSyntax ? [LINE_COMMENT, `${OPEN_BLOCK_COMMENT}$`] : [];
    if (hashComments) {
        tails.push('#.*');
    } else if (hashValues) {
        tails.push(`#(?:[^${VALUE_START}].*)?$`);
    }
    if (lexing.semicolons === 'COMMENTS') {
        tails.push(';.*');
    }
    if (lexing.atComments) {
        tails.push(lexing.atTypes ? `${BLANK}@(?:[^A-Za-z_].*)?$` : `${BLANK}@.*`);
    }
    const startTails = lexing.gnuSyntax ? [lexing.atComments ? '[#@].*' : '#.*'] : [];
    const tail = `(?:${tails.join('|')})?`;
    const semicolonComment = `;${BLANK}*(?:[^${BLANKS}.;][^;]*|\\.(?:[^A-Za-z_;][^;]*)?)?`;
    const comments = `(?:${semicolonComment})*`;

    const label = `(?:(?:${source.labelName})${BLANK}*:${BLANK}*)`;
    const dotLabel = `(?:\\.[A-Za-z_]${word}*${BLANK}*:${BLANK}*)`;
    const dotStatement = `\\.[A-Za-z_]${code}`;
    const visibleNonColon = either(...tokens, `[^${wordClass}${specials}${BLANKS}:]`);
    const nextNonColon = either(...tokens, ...glued, `[^${specials}${BLANKS}:]`);
    const afterWord = `(?:(?:${visibleNonColon}|${BLANK}+${nextNonColon})${code}|${BLANK}+)?`;
    const kindPatterns = (kind: BlockKind) => {
        const leads = [...new Set(kind.closers.map((closer) => closer[0].toLowerCase()))];
        const notCloser = (lead: string) =>
            notWords(
                trieOf(
                    kind.closers.filter((closer) => closer[0].toLowerCase() === lead).map((
                        closer,
                    ) => closer.slice(1)),
                ),
                alphabet,
                word,
            );
        const otherWord = `${
            characterClass(alphabet.filter((character) => !leads.includes(character.toLowerCase())))
        }${word}*${glue}`;
        const firstWord = `(?:${visibleNonColon}${code}|(?:${
            [otherWord, ...leads.map((lead) => `${literal(lead)}${notCloser(lead)}`)].join('|')
        })${afterWord}${startTails.map((startTail) => `|${startTail}`).join('')})`;
        let rest = '';
        let clausePrefix = '';
        if (lexing.semicolons === 'SEPARATES') {
            rest = `(?:;${BLANK}*${label}*${firstWord}?)*`;
            clausePrefix = `(?:${label}*${firstWord}?;${BLANK}*)*${label}*`;
        } else if (lexing.semicolons === 'HEURISTIC') {
            const directive = `\\.${notCloser('.')}${afterWord}`;
            rest = `(?:${comments};${BLANK}*(?:${dotLabel}${label}*${firstWord}?|${directive}))*`;
            clausePrefix =
                `(?:${label}*${firstWord}?${comments};${BLANK}*(?:${directive}${comments};${BLANK}*)*(?:${dotLabel}${label}*)?)?`;
        }
        const block = (words: BlockWord[]) =>
            `(?:${words.map((entry) => entry.pattern.source).join('|')})${after}${rest}`;
        return (startsLine: boolean) => {
            const openers = kind.openers.filter((entry) => entry.startsLine === startsLine);
            const clauses = kind.clauses.filter((entry) => entry.startsLine === startsLine);
            return {
                opener: openers.length === 0 ? [] : [block(openers)],
                clause: clauses.length === 0
                    ? []
                    : [`${startsLine ? '' : clausePrefix}${block(clauses)}`],
            };
        };
    };

    let prefix = '';
    if (lexing.semicolons === 'SEPARATES') {
        prefix = `(?:${code};${BLANK}*)*${label}*`;
    } else if (lexing.semicolons === 'HEURISTIC') {
        prefix =
            `(?:${code}${comments};${BLANK}*(?:${dotStatement}${comments};${BLANK}*)*(?:${dotLabel}${label}*)?)?`;
    }
    const kinds = source.blocks.map(kindPatterns);
    const alternatives = (startsLine: boolean, openerPrefix: string) => {
        const placed = kinds.map((kind) => kind(startsLine));
        const openers = placed.flatMap(({ opener }) => opener);
        return [
            ...(openers.length === 0 ? [] : [`${openerPrefix}(?:${openers.join('|')})`]),
            ...placed.flatMap(({ clause }) => clause),
        ];
    };
    const anywhere = alternatives(false, prefix);
    const lineStart = alternatives(true, '');
    const groups = [
        ...(anywhere.length === 0 ? [] : [`${label}*(?:${anywhere.join('|')})`]),
        ...(lineStart.length === 0 ? [] : [`(?:${lineStart.join('|')})`]),
    ];
    const body = groups.length === 1 ? groups[0] : `(?:${groups.join('|')})`;
    const ending = lexing.semicolons === 'HEURISTIC'
        ? `(?:(?:${semicolonComment})+|${tail})`
        : tail;
    return `^${BLANK}*${body}${ending}$`;
}

export function statementLexing(scanner: string): Record<string, Omit<StatementLexing, 'atTypes'>> {
    const lexing: Record<string, Omit<StatementLexing, 'atTypes'>> = {};
    for (const [dialect, values] of dialectDefines(scanner)) {
        const flag = (key: string) => definedFlag(values, dialect, key);
        const semicolons = values.get('ASM_SEMICOLONS')?.replace(/^SEMICOLON_/, '');
        if (semicolons !== 'SEPARATES' && semicolons !== 'COMMENTS' && semicolons !== 'HEURISTIC') {
            throw new Error(
                `scanner.h: ASM_SEMICOLONS for ASM_DIALECT_${dialect} is not a known mode`,
            );
        }
        lexing[dialect] = {
            gnuSyntax: flag('ASM_GNU_SYNTAX'),
            backquoteStrings: flag('ASM_BACKQUOTE_STRINGS'),
            percentMacros: flag('ASM_PERCENT_MACROS'),
            commentJoins: flag('ASM_COMMENT_JOINS'),
            spacedJoins: flag('ASM_SPACED_JOINS'),
            reservedNames: flag('ASM_RESERVED_NAMES'),
            namedStatements: flag('ASM_NAMED_STATEMENTS'),
            semicolons,
            hashImmediates: flag('ASM_HASH_IMMEDIATES'),
            hashNeedsValue: flag('ASM_HASH_NEEDS_VALUE'),
            atComments: flag('ASM_AT_COMMENTS'),
        };
    }
    return lexing;
}

export function statementWords(sources: KeywordSources, dialect: string): StatementWord[] {
    const words = new Map<string, StatementWord>();
    for (const arch of dialectArchs(sources.scanner, dialect)) {
        for (const [name, symbol, flags] of tableEntries(sources, `ASM_${arch}_DIRECTIVES`)) {
            if (!words.has(name)) {
                words.set(name, { name, symbol, flags });
            }
        }
    }
    return [...words.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

export function implicitEnds(scanner: string): { closer: string; ends: string }[] {
    const table = /IMPLICIT_ENDS\[\] = \{([^;]*)\};/.exec(scanner);
    if (table === null) {
        throw new Error('scanner.h: IMPLICIT_ENDS table not found');
    }
    return [...table[1].matchAll(/\{\s*([A-Z_]+),\s*([A-Z_]+)\s*\}/g)].map(([, closer, ends]) => ({
        closer,
        ends,
    }));
}

export function tokenNames(scanner: string): string[] {
    const body = /enum TokenType \{([^}]*)\};/.exec(scanner);
    if (body === null) {
        throw new Error('scanner.h: enum TokenType not found');
    }
    return [...body[1].matchAll(/([A-Z_]+),/g)].map(([, name]) => name);
}

export function reservedNames(
    sources: KeywordSources,
    language: Pick<Language, 'syntax' | 'dialect'>,
    lexing: Pick<StatementLexing, 'reservedNames'>,
): string[] {
    const archs = dialectArchs(sources.scanner, language.dialect);
    const names = statementWords(sources, language.dialect)
        .filter(({ flags }) => flags.includes('WORD_RESERVED'))
        .map(({ name }) => name);
    for (const arch of archs) {
        if (sources.tables.has(`ASM_${arch}_OPERAND_WORDS`)) {
            names.push(
                ...tableEntries(sources, `ASM_${arch}_OPERAND_WORDS`)
                    .filter((entry) => entry[2]?.includes('WORD_RESERVED'))
                    .map(([word]) => word),
            );
        }
    }
    if (lexing.reservedNames) {
        for (const arch of archs) {
            names.push(...tableEntries(sources, `ASM_${arch}_REGISTERS`).map(([word]) => word));
            if (sources.tables.has(`ASM_${arch}_PREFIXES`)) {
                names.push(
                    ...tableEntries(sources, `ASM_${arch}_PREFIXES`)
                        .filter(([, flags]) => flags.includes('PREFIX_PLAIN'))
                        .map(([word]) => word),
                );
            }
        }
    }
    return [...new Set(names)];
}

function unreservedName(reserved: string[], first: string[], character: RegExp): string {
    const alphabet = expandClass(classBody(character));
    const word = `[${classBody(character)}]`;
    const outside = reserved.filter((name) => !first.includes(name[0]));
    if (outside.length > 0) {
        throw new Error(
            `words outside the start ${characterClass(first)}: ${outside.join(', ')}`,
        );
    }
    const root = trieOf(reserved);
    const taken = new Set([...root.children.keys()].flatMap((character) => [
        character.toLowerCase(),
        character.toUpperCase(),
    ]));
    const others = first.filter((character) => !taken.has(character));
    const alternatives = others.length === 0 ? [] : [`${characterClass(others)}${word}*`];
    for (const [character, child] of root.children) {
        alternatives.push(`[${caseless(character)}]${notWords(child, alphabet, word)}`);
    }
    return `(?:${alternatives.join('|')})`;
}

function dialectLexing(scanner: string, language: Language): Omit<StatementLexing, 'atTypes'> {
    const lexing = statementLexing(scanner)[language.dialect];
    if (lexing === undefined) {
        throw new Error(`scanner.h has no settings for ASM_DIALECT_${language.dialect}`);
    }
    return lexing;
}

function syntaxBlocks(blocks: Block[], language: Language): Block[] {
    return blocks.filter((block) => block.syntax === undefined || block.syntax === language.syntax);
}

function startsLine(lexing: Pick<StatementLexing, 'percentMacros'>, name: string): boolean {
    return lexing.percentMacros && name.startsWith('%');
}

export function labelName(language: Language, sources: KeywordSources): string {
    const syntax = lexical[language.syntax];
    const reserved = reservedNames(sources, language, dialectLexing(sources.scanner, language));
    return syntax.labelName({
        dollarLabels: language.archs.includes('arm') && DOLLAR_LABELS.includes(language.dialect),
        name: reserved.length === 0 ? undefined : unreservedName(
            reserved,
            expandClass(classBody(syntax.nameStart)),
            syntax.nameCharacter,
        ),
    }).source;
}

export function labelEndingWords(
    language: Language,
    blocks: Block[],
    sources: KeywordSources,
): string[] {
    const lexing = dialectLexing(sources.scanner, language);
    const ending = new Set(
        syntaxBlocks(blocks, language).flatMap(({ closer, clauses }) => [closer, ...clauses]),
    );
    return statementWords(sources, language.dialect)
        .filter(({ name, symbol, flags }) =>
            (ending.has(symbol) && !startsLine(lexing, name)) ||
            (lexing.namedStatements &&
                (flags.includes('WORD_NAMES_LABEL') || flags.includes('WORD_NAMES_ASSIGNMENT')))
        )
        .map(({ name }) => name);
}

export function labelIndentPattern(
    language: Language,
    blocks: Block[],
    sources: KeywordSources,
): string {
    const syntax = lexical[language.syntax];
    const ending = labelEndingWords(language, blocks, sources);
    const start = `^${BLANK}*(?:${labelName(language, sources)})${BLANK}*:`;
    if (ending.length === 0) {
        return start;
    }
    const first = [
        ...new Set([...expandClass(classBody(syntax.nameStart)), ...ending.map((word) => word[0])]),
    ];
    const otherWord = unreservedName(ending, first, syntax.nameCharacter);
    const notName = `[^${classBody(syntax.nameCharacter)}]`;
    const notStart = `[^${characterClass(first).slice(1, -1)}${BLANKS}]`;
    return `${start}${BLANK}*(?:$|${notStart}|${otherWord}(?:${notName}|$))`;
}

export function blockIndentPattern(
    language: Language,
    blocks: Block[],
    sources: KeywordSources,
): string | null {
    const scanner = sources.scanner;
    const lexing = dialectLexing(scanner, language);
    const tokens = tokenNames(scanner);
    const words = statementWords(sources, language.dialect);
    const ends = implicitEnds(scanner);
    const patterns = (kind: string, symbols: string[]) =>
        symbols.flatMap((symbol) => {
            if (!tokens.includes(symbol)) {
                throw new Error(`scanner.h has no block ${kind} for ${symbol}`);
            }
            return words.filter((word) => word.symbol === symbol).map(({ name }) => ({
                pattern: caselessWord(name),
                startsLine: startsLine(lexing, name),
            }));
        });
    const kinds = syntaxBlocks(blocks, language).map((block) => {
        if (!tokens.includes(block.closer)) {
            throw new Error(`scanner.h has no block closer for ${block.closer}`);
        }
        const openers = patterns('opener', block.openers);
        if (openers.length === 0) {
            throw new Error(
                `keywords.h has no ${
                    block.openers.join(', ')
                } word for ASM_DIALECT_${language.dialect}`,
            );
        }
        const symbols = [
            block.closer,
            ...ends.filter((end) => end.ends === block.closer).map((end) => end.closer),
        ];
        return {
            openers,
            clauses: patterns('clause', block.clauses),
            closers: words.filter((word) => symbols.includes(word.symbol)).map(({ name }) => name),
        };
    });
    if (kinds.length === 0) {
        return null;
    }
    return blockOpenerPattern({
        blocks: kinds,
        nameCharacter: lexical[language.syntax].nameCharacter,
        labelName: labelName(language, sources),
        lexing: { ...lexing, atTypes: language.archs.includes('x86') },
    });
}

export function increaseIndentPattern(
    language: Language,
    blocks: Block[],
    sources: KeywordSources,
): string {
    const labels = labelIndentPattern(language, blocks, sources);
    const opened = blockIndentPattern(language, blocks, sources);
    return opened === null ? labels : `${labels}|${opened}`;
}
