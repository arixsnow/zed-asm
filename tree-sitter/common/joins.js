// SPDX-License-Identifier: MIT

const JOIN = '(?:\\\\\\r?\\n)*';
const SPECIAL = /[\\^$.*+?()[\]{}|]/;
const LONG_ESCAPE = /[xuUpPck0-9]/;

function parseRegex(source) {
  let index = 0;

  function counted() {
    if (source[index] !== '{') {
      return '';
    }
    const end = source.indexOf('}', index);
    const body = source.slice(index + 1, end);
    if (end === -1 || !/^\d+(,\d*)?$/.test(body)) {
      return '';
    }
    index = end + 1;
    return `{${body}}`;
  }

  function quantifier() {
    const next = source[index];
    let text = '';
    if (next === '*' || next === '+' || next === '?') {
      index++;
      text = next;
    } else {
      text = counted();
    }
    if (text !== '' && (source[index] === '?' || source[index] === '+')) {
      throw new Error(`unsupported quantifier ${text}${source[index]} in /${source}/`);
    }
    return text;
  }

  function atom() {
    const start = index;
    const next = source[index];
    if (next === '\\' && (index + 1 >= source.length || LONG_ESCAPE.test(source[index + 1]))) {
      throw new Error(`unsupported escape ${source.slice(index, index + 2)} in /${source}/`);
    }
    if (next === '(') {
      index++;
      if (source.startsWith('?:', index)) {
        index += 2;
      } else if (source[index] === '?') {
        throw new Error(`unsupported group (${source.slice(index, index + 2)} in /${source}/`);
      }
      const content = alternation();
      if (source[index] !== ')') {
        throw new Error(`unclosed group in /${source}/`);
      }
      index++;
      return { kind: 'group', content };
    }
    if (next === '[') {
      index++;
      if (source[index] === '^') {
        index++;
      }
      if (source[index] === ']') {
        index++;
      }
      while (source[index] !== ']') {
        if (index >= source.length) {
          throw new Error(`unclosed class in /${source}/`);
        }
        index += source[index] === '\\' ? 2 : 1;
      }
      index++;
      return { kind: 'unit', text: source.slice(start, index) };
    }
    index += next === '\\' ? 2 : 1;
    return { kind: 'unit', text: source.slice(start, index) };
  }

  function sequence() {
    const items = [];
    while (index < source.length && source[index] !== '|' && source[index] !== ')') {
      const item = atom();
      items.push({ item, quantifier: quantifier() });
    }
    return items;
  }

  function alternation() {
    const branches = [sequence()];
    while (source[index] === '|') {
      index++;
      branches.push(sequence());
    }
    return branches;
  }

  const result = alternation();
  if (index !== source.length) {
    throw new Error(`unexpected ${source[index]} in /${source}/`);
  }
  return result;
}

function bounds(quantifier) {
  if (quantifier === '?') {
    return { low: 0, high: 1 };
  }
  if (quantifier === '*') {
    return { low: 0, high: null };
  }
  if (quantifier === '+') {
    return { low: 1, high: null };
  }
  const counted = /^\{(\d+)(,(\d*))?\}$/.exec(quantifier);
  const low = Number(counted[1]);
  return {
    low,
    high: counted[2] === undefined ? low : counted[3] === '' ? null : Number(counted[3]),
  };
}

function nullableAtom(atom) {
  return atom.kind === 'group' && atom.content.some(nullableSequence);
}

function nullableItem({ item, quantifier }) {
  return (quantifier !== '' && bounds(quantifier).low === 0) || nullableAtom(item);
}

function nullableSequence(items) {
  return items.every(nullableItem);
}

function joinedAtom(atom) {
  if (atom.kind === 'unit') {
    return `${JOIN}${atom.text}`;
  }
  return `(?:${atom.content.map(joinedSequence).join('|')})`;
}

function joinedItem({ item, quantifier }) {
  const base = joinedAtom(item);
  return quantifier === '' ? base : `(?:${base})${quantifier}`;
}

function joinedSequence(items) {
  return items.map(joinedItem).join('');
}

function choiceOf(alternatives) {
  const present = alternatives.filter((alternative) => alternative !== null);
  if (present.length === 0) {
    return null;
  }
  return present.length === 1 ? present[0] : `(?:${present.join('|')})`;
}

function nonEmptyAtom(atom) {
  if (atom.kind === 'unit') {
    return atom.text;
  }
  return choiceOf(atom.content.map(nonEmptySequence));
}

function nonEmptyItem({ item, quantifier }) {
  const first = nonEmptyAtom(item);
  if (first === null || quantifier === '' || quantifier === '?') {
    return first;
  }
  const { low, high } = bounds(quantifier);
  if (high === 0) {
    return null;
  }
  const rest = `(?:${joinedAtom(item)})`;
  let more = `{${Math.max(low - 1, 0)},${high === null ? '' : high - 1}}`;
  if (high === null && low <= 1) {
    more = '*';
  }
  return `(?:${first})${rest}${more}`;
}

function nonEmptySequence(items) {
  if (items.length === 0) {
    return null;
  }
  const [first, ...rest] = items;
  const head = nonEmptyItem(first);
  const withHead = head === null ? null : `${head}${joinedSequence(rest)}`;
  return nullableItem(first) ? choiceOf([withHead, nonEmptySequence(rest)]) : withHead;
}

function nonEmptyRegex(source) {
  return choiceOf(parseRegex(source).map(nonEmptySequence));
}

function joinedRegex(source) {
  return parseRegex(source).map(joinedSequence).join('|');
}

function literal(text) {
  return [...text].map((character) => SPECIAL.test(character) ? `\\${character}` : character)
    .join('');
}

function normalize(node) {
  if (typeof node === 'string') {
    return { type: 'STRING', value: node };
  }
  if (node instanceof RegExp) {
    return { type: 'PATTERN', value: node.source };
  }
  return node;
}

function nullable(node) {
  switch (node.type) {
    case 'STRING':
      return node.value === '';
    case 'PATTERN':
      return parseRegex(node.value).some(nullableSequence);
    case 'SEQ':
      return node.members.map(normalize).every(nullable);
    case 'CHOICE':
      return node.members.map(normalize).some(nullable);
    case 'REPEAT':
    case 'BLANK':
      return true;
    default:
      return nullable(normalize(node.content));
  }
}

function joined(node) {
  switch (node.type) {
    case 'STRING':
      return { type: 'PATTERN', value: joinedRegex(literal(node.value)) };
    case 'PATTERN':
      return { ...node, value: joinedRegex(node.value) };
    case 'SEQ':
    case 'CHOICE':
      return { ...node, members: node.members.map((member) => joined(normalize(member))) };
    case 'BLANK':
      return node;
    default:
      return { ...node, content: joined(normalize(node.content)) };
  }
}

function nonEmptyChoice(members) {
  const present = members.filter((member) => member !== null);
  if (present.length === 0) {
    return null;
  }
  return present.length === 1 ? present[0] : { type: 'CHOICE', members: present };
}

function nonEmptySeq(members) {
  if (members.length === 0) {
    return null;
  }
  const [first, ...rest] = members;
  const head = nonEmpty(first);
  const withHead = head === null ? null : { type: 'SEQ', members: [head, ...rest.map(joined)] };
  return nullable(first) ? nonEmptyChoice([withHead, nonEmptySeq(rest)]) : withHead;
}

function nonEmpty(node) {
  switch (node.type) {
    case 'STRING':
      if (node.value.length <= 1) {
        return node.value === '' ? null : node;
      }
      return { type: 'PATTERN', value: nonEmptyRegex(literal(node.value)) };
    case 'PATTERN': {
      const value = nonEmptyRegex(node.value);
      return value === null ? null : { ...node, value };
    }
    case 'SEQ':
      return nonEmptySeq(node.members.map(normalize));
    case 'CHOICE':
      return nonEmptyChoice(node.members.map((member) => nonEmpty(normalize(member))));
    case 'REPEAT':
    case 'REPEAT1': {
      const content = normalize(node.content);
      const head = nonEmpty(content);
      return head === null
        ? null
        : { type: 'SEQ', members: [head, { type: 'REPEAT', content: joined(content) }] };
    }
    case 'BLANK':
      return null;
    default: {
      const content = nonEmpty(normalize(node.content));
      return content === null ? null : { ...node, content };
    }
  }
}

function full(node) {
  const content = nonEmpty(node);
  if (!nullable(node)) {
    return content;
  }
  return content === null
    ? { type: 'BLANK' }
    : { type: 'CHOICE', members: [content, { type: 'BLANK' }] };
}

function joinTolerant(rule) {
  const node = normalize(rule);
  switch (node.type) {
    case 'STRING':
      return node.value.length > 1
        ? { type: 'ALIAS', content: nonEmpty(node), named: false, value: node.value }
        : node;
    case 'PATTERN':
      return full(node);
    case 'TOKEN':
    case 'IMMEDIATE_TOKEN':
      return { ...node, content: full(normalize(node.content)) };
    case 'ALIAS':
      return { ...node, content: joinTolerant(node.content) };
    default:
      if ('members' in node) {
        return { ...node, members: node.members.map(joinTolerant) };
      }
      if ('content' in node) {
        return { ...node, content: joinTolerant(node.content) };
      }
      return node;
  }
}

module.exports = { joinTolerant, nonEmptyRegex };
