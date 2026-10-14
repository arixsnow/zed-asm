// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';

import { manifest } from '../../scripts/lib/manifest.ts';
import { parseFiles, treeText } from '../lib/parse.ts';

type Family = 'gnu' | 'darwin' | 'c';

const FAMILIES: Record<string, Family> = {
  asm_auto: 'gnu',
  asm_arm: 'gnu',
  asm_arm_apple: 'darwin',
  asm_x86_gas: 'gnu',
  asm_x86_nasm: 'c',
};

const PROBES: [string, Record<Family, string>][] = [
  ['2 + 3 << 1', { gnu: '2 + (3 << 1)', darwin: '(2 + 3) << 1', c: '(2 + 3) << 1' }],
  ['6 & 3 + 1', { gnu: '(6 & 3) + 1', darwin: '6 & (3 + 1)', c: '6 & (3 + 1)' }],
  ['1 | 2 ^ 3', { gnu: '(1 | 2) ^ 3', darwin: '(1 | 2) ^ 3', c: '1 | (2 ^ 3)' }],
  ['1 | 2 & 0', { gnu: '(1 | 2) & 0', darwin: '(1 | 2) & 0', c: '1 | (2 & 0)' }],
  ['2 == 1 + 1', { gnu: '2 == (1 + 1)', darwin: '2 == (1 + 1)', c: '2 == (1 + 1)' }],
  ['1 || 1 && 0', { gnu: '1 || (1 && 0)', darwin: '(1 || 1) && 0', c: '1 || (1 && 0)' }],
  ['1 & 2 == 2', { gnu: '(1 & 2) == 2', darwin: '1 & (2 == 2)', c: '(1 & 2) == 2' }],
  ['4 >> 1 - 1', { gnu: '(4 >> 1) - 1', darwin: '4 >> (1 - 1)', c: '4 >> (1 - 1)' }],
  ['3 ^ 1 + 1', { gnu: '(3 ^ 1) + 1', darwin: '3 ^ (1 + 1)', c: '3 ^ (1 + 1)' }],
  ['7 % 4 * 2', { gnu: '(7 % 4) * 2', darwin: '(7 % 4) * 2', c: '(7 % 4) * 2' }],
  ['2 * 3 | 1', { gnu: '(2 * 3) | 1', darwin: '(2 * 3) | 1', c: '(2 * 3) | 1' }],
  ['2 << 1 * 3', { gnu: '(2 << 1) * 3', darwin: '2 << (1 * 3)', c: '2 << (1 * 3)' }],
  [
    '1 + 1 == 2 & 3',
    { gnu: '(1 + 1) == (2 & 3)', darwin: '((1 + 1) == 2) & 3', c: '(1 + 1) == (2 & 3)' },
  ],
];

const GNU_ONLY: [string, string][] = [['1 ! 2 + 3', '(1 ! 2) + 3']];

interface Node {
  type: string;
  field: string;
  start: number;
  end: number;
  children: Node[];
}

const HEADER = /^( *)(?:(\w+): )?\((\w+) \[0, (\d+)\] - \[0, (\d+)\]/;

function readTree(tree: string): Node {
  const root: Node = { type: 'root', field: '', start: 0, end: 0, children: [] };
  const stack: [number, Node][] = [[-1, root]];
  for (const line of tree.split('\n')) {
    const header = HEADER.exec(line);
    if (header === null) {
      continue;
    }
    const depth = header[1].length;
    const node: Node = {
      type: header[3],
      field: header[2] ?? '',
      start: Number(header[4]),
      end: Number(header[5]),
      children: [],
    };
    while (stack[stack.length - 1][0] >= depth) {
      stack.pop();
    }
    stack[stack.length - 1][1].children.push(node);
    stack.push([depth, node]);
  }
  return root;
}

function grouping(node: Node, source: string, top = true): string {
  if (node.type !== 'binary_expression') {
    return source.slice(node.start, node.end);
  }
  const left = node.children.find((child) => child.field === 'left') as Node;
  const right = node.children.find((child) => child.field === 'right') as Node;
  const operator = source.slice(left.end, right.start).trim();
  const text = `${grouping(left, source, false)} ${operator} ${grouping(right, source, false)}`;
  return top ? text : `(${text})`;
}

function findBinary(node: Node): Node | undefined {
  if (node.type === 'binary_expression') {
    return node;
  }
  for (const child of node.children) {
    const found = findBinary(child);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

test("operators group as each language's assemblers group them", () => {
  const failures: string[] = [];
  for (const { grammar, syntax } of manifest.languages) {
    const family = FAMILIES[grammar];
    const directive = syntax === 'nasm' ? 'dd' : '.long';
    const probes: [string, string][] = [
      ...PROBES.map(([probe, expected]): [string, string] => [probe, expected[family]]),
      ...(family === 'gnu' ? GNU_ONLY : []),
    ];
    const sources = probes.map(([probe]) => `${directive} ${probe}\n`);
    const trees = treeText(parseFiles(grammar, 'precedence', sources).output)
      .split(/^(?=\(source_file )/m).filter((tree) => tree.startsWith('(source_file '));
    assert.deepStrictEqual(trees.length, probes.length, `${grammar}: one tree per probe`);
    for (const [index, [probe, expected]] of probes.entries()) {
      const binary = findBinary(readTree(trees[index]));
      const found = binary === undefined ? 'no expression' : grouping(binary, sources[index]);
      if (found !== expected) {
        failures.push(`${grammar}: ${probe} groups as ${found}, not ${expected}`);
      }
    }
  }
  assert.deepStrictEqual(failures, []);
});
