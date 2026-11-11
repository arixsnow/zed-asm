// SPDX-License-Identifier: MIT

function skipQuoted(text: string, start: number): number {
  const quote = text[start];
  let index = start + 1;
  while (index < text.length && text[index] !== quote) {
    index += text[index] === '\\' ? 2 : 1;
  }
  if (index >= text.length) {
    throw new Error(`unterminated ${quote} literal`);
  }
  return index + 1;
}

function skipComment(text: string, start: number): number {
  if (text.startsWith('//', start)) {
    const end = text.indexOf('\n', start);
    return end === -1 ? text.length : end;
  }
  const end = text.indexOf('*/', start + 2);
  if (end === -1) {
    throw new Error('unterminated comment');
  }
  return end + 2;
}

export function withoutComments(text: string): string {
  let output = '';
  let index = 0;
  while (index < text.length) {
    const character = text[index];
    if (character === '"' || character === "'") {
      const end = skipQuoted(text, index);
      output += text.slice(index, end);
      index = end;
    } else if (text.startsWith('//', index) || text.startsWith('/*', index)) {
      index = skipComment(text, index);
      output += ' ';
    } else {
      output += character;
      index++;
    }
  }
  return output;
}

export function bracedBody(text: string, from: number): string {
  const open = text.indexOf('{', from);
  if (open === -1) {
    throw new Error('no opening brace');
  }
  let depth = 0;
  let index = open;
  while (index < text.length) {
    const character = text[index];
    if (character === '"' || character === "'") {
      index = skipQuoted(text, index);
      continue;
    }
    if (character === '{') {
      depth++;
    } else if (character === '}') {
      depth--;
      if (depth === 0) {
        return text.slice(open + 1, index);
      }
    }
    index++;
  }
  throw new Error('unbalanced braces');
}

export function withoutPreprocessorLines(text: string): string {
  return text.replace(/^[ \t]*#(?:.*\\\n)*.*$/gm, '');
}

export function initializerElements(body: string): string[] {
  const elements: string[] = [];
  let depth = 0;
  let start = 0;
  let index = 0;
  while (index < body.length) {
    const character = body[index];
    if (character === '"' || character === "'") {
      index = skipQuoted(body, index);
      continue;
    }
    if ('({['.includes(character)) {
      depth++;
    } else if (')}]'.includes(character)) {
      depth--;
    } else if (character === ',' && depth === 0) {
      elements.push(body.slice(start, index).trim());
      start = index + 1;
    }
    index++;
  }
  const last = body.slice(start).trim();
  if (last !== '') {
    elements.push(last);
  }
  return elements.filter((element) => element !== '');
}

export function leadingString(element: string): string | undefined {
  const open = /^(?:[A-Za-z_]\w*\s*\(|\{)\s*/.exec(element);
  if (open === null) {
    return undefined;
  }
  let index = open[0].length;
  let value = '';
  let found = false;
  while (element[index] === '"') {
    const end = skipQuoted(element, index);
    value += element.slice(index + 1, end - 1);
    found = true;
    index = end;
    while (/\s/.test(element[index] ?? '')) {
      index++;
    }
  }
  return found ? value : undefined;
}
