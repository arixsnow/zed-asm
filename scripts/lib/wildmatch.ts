// SPDX-License-Identifier: MIT

const CLASSES: Record<string, string> = {
    alnum: '0-9A-Za-z',
    alpha: 'A-Za-z',
    blank: '\\x09\\x20',
    cntrl: '\\x00-\\x1f\\x7f',
    digit: '0-9',
    graph: '\\x21-\\x7e',
    lower: 'a-z',
    print: '\\x20-\\x7e',
    punct: '\\x21-\\x2f\\x3a-\\x40\\x5b-\\x60\\x7b-\\x7e',
    space: '\\x09\\x0a\\x0d\\x20',
    upper: 'A-Z',
    xdigit: '0-9A-Fa-f',
};

function bytes(text: string): string {
    return Buffer.from(text, 'utf8').toString('latin1');
}

function hex(code: number): string {
    return `\\x${code.toString(16).padStart(2, '0')}`;
}

function bracket(glob: string, open: number): [string, number] {
    let index = open + 1;
    const negated = glob[index] === '!' || glob[index] === '^';
    if (negated) {
        index += 1;
    }
    let members = '';
    let previous: number | undefined;
    for (let first = true; first || glob[index] !== ']'; first = false) {
        if (index >= glob.length) {
            throw new Error(`"${glob}" opens a [ it never closes`);
        }
        const code = glob.charCodeAt(index);
        const next = glob[index + 1];
        if (glob[index] === '-' && previous !== undefined && next !== undefined && next !== ']') {
            const last = glob.charCodeAt(index + 1);
            if (previous <= last) {
                members += `${hex(previous)}-${hex(last)}`;
            }
            previous = undefined;
            index += 2;
            continue;
        }
        if (glob[index] === '[' && next === ':') {
            const close = glob.indexOf(']', index + 2);
            if (close === -1) {
                throw new Error(`"${glob}" opens a [ it never closes`);
            }
            const name = glob.slice(index + 2, close);
            if (name.endsWith(':')) {
                const className = name.slice(0, -1);
                if (!Object.hasOwn(CLASSES, className)) {
                    throw new Error(`"${glob}" names the unknown class [:${className}:]`);
                }
                members += CLASSES[className];
                previous = undefined;
                index = close + 1;
                continue;
            }
        }
        members += hex(code);
        previous = code;
        index += 1;
    }
    return [negated ? `[^/${members}]` : `(?!/)[${members}]`, index + 1];
}

export function wildmatch(glob: string): RegExp {
    const text = bytes(glob);
    let source = '';
    let index = 0;
    while (index < text.length) {
        const character = text[index];
        if (character === '*') {
            let end = index;
            while (text[end] === '*') {
                end += 1;
            }
            const starts = index === 0 || text[index - 1] === '/';
            const ends = end === text.length || text[end] === '/';
            if (end - index >= 2 && starts && ends) {
                if (end === text.length) {
                    source += '.*';
                } else {
                    source += '(?:.*/)?';
                    end += 1;
                }
            } else {
                source += '[^/]*';
            }
            index = end;
        } else if (character === '?') {
            source += '[^/]';
            index += 1;
        } else if (character === '[') {
            const [members, next] = bracket(text, index);
            source += members;
            index = next;
        } else {
            source += hex(text.charCodeAt(index));
            index += 1;
        }
    }
    return new RegExp(`^${source}$`);
}

export function matchesPath(patterns: readonly RegExp[], path: string): boolean {
    const text = bytes(path);
    for (let end = text.indexOf('/');; end = text.indexOf('/', end + 1)) {
        const prefix = end === -1 ? text : text.slice(0, end);
        if (patterns.some((pattern) => pattern.test(prefix))) {
            return true;
        }
        if (end === -1) {
            return false;
        }
    }
}
