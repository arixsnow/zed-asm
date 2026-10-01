// SPDX-License-Identifier: MIT

import { ensureDirSync } from '@std/fs';
import { join } from '@std/path';
import { parse } from '@std/toml';

import { readTextIfExists, ROOT } from '../../scripts/lib/files.ts';
import { languageArgs, run } from '../../scripts/lib/grammars.ts';
import type { Language } from '../../scripts/lib/manifest.ts';
import {
  type ByteCapture,
  type ByteRange,
  type LanguageConfig,
  type MatchCapture,
  type NodeRange,
  type Point,
  type Syntax,
  type SyntaxProvider,
  ZedLanguage,
} from './zed.ts';

const NODE = /\((\w+) \[(\d+), (\d+)\] - \[(\d+), (\d+)\]/g;
const CAPTURE = /^ +capture: (?:\d+ - )?([\w.]+), start: \((\d+), (\d+)\), end: \((\d+), (\d+)\)/;
const encoder = new TextEncoder();

function point(row: string, column: string): Point {
  return { row: Number(row), column: Number(column) };
}

function queryMatches(output: string): MatchCapture[][] {
  const matches: MatchCapture[][] = [];
  for (const line of output.split('\n')) {
    if (/^ +pattern: \d+$/.test(line)) {
      matches.push([]);
      continue;
    }
    const capture = CAPTURE.exec(line);
    if (capture !== null) {
      const [, name, startRow, startColumn, endRow, endColumn] = capture;
      matches.at(-1)?.push({
        name,
        start: point(startRow, startColumn),
        end: point(endRow, endColumn),
      });
    }
  }
  return matches;
}

function query(args: string[]): string {
  const { ok, output } = run('tree-sitter', ['query', ...args]);
  if (!ok) {
    throw new Error(`tree-sitter query ${args.join(' ')} failed:\n${output}`);
  }
  return output;
}

function queryText(language: Language, kind: string): string {
  return readTextIfExists(join(ROOT, 'languages', language.dir, `${kind}.scm`)) ?? '';
}

export function zedLanguage(language: Language): ZedLanguage {
  const config = parse(
    Deno.readTextFileSync(join(ROOT, 'languages', language.dir, 'config.toml')),
  ) as LanguageConfig;
  return new ZedLanguage(config, {
    overrides: queryText(language, 'overrides'),
    indents: queryText(language, 'indents'),
    brackets: queryText(language, 'brackets'),
  });
}

export function cliSyntax(language: Language, scratch: string): SyntaxProvider {
  const directory = join(ROOT, '.build', scratch, language.grammar);
  ensureDirSync(directory);
  const args = languageArgs(language.grammar);
  const queryFile = (kind: string) =>
    queryText(language, kind) === '' ? null : join(ROOT, 'languages', language.dir, `${kind}.scm`);
  const overrideQuery = queryFile('overrides');
  const indentQuery = queryFile('indents');
  const cache = new Map<string, Syntax>();

  return (text: string): Syntax => {
    const cached = cache.get(text);
    if (cached !== undefined) {
      return cached;
    }
    const file = join(directory, `${cache.size}.s`);
    Deno.writeTextFileSync(file, text);
    const starts = [0];
    for (const [index, byte] of encoder.encode(text).entries()) {
      if (byte === 0x0a) {
        starts.push(index + 1);
      }
    }
    const offset = (at: Point) => starts[at.row] + at.column;
    const tree = run('tree-sitter', ['parse', ...args, file]).output;
    const nodes = [...tree.matchAll(NODE)].map((
      [, type, startRow, startColumn, endRow, endColumn],
    ) => ({
      type,
      start: point(startRow, startColumn),
      end: point(endRow, endColumn),
    }));
    if (nodes.length === 0) {
      throw new Error(`tree-sitter printed no tree for ${file}:\n${tree}`);
    }
    const errors: NodeRange[] = nodes.filter((node) => node.type === 'ERROR');
    let overrides: ByteCapture[][] | undefined;
    const indents = new Map<string, MatchCapture[][]>();
    const syntax: Syntax = {
      root: { start: offset(nodes[0].start), end: offset(nodes[0].end) },
      errors,
      get overrides() {
        overrides ??= overrideQuery === null ? [] : queryMatches(
          query([...args, overrideQuery, file]),
        ).map((match) =>
          match.map((capture) => ({
            name: capture.name,
            start: offset(capture.start),
            end: offset(capture.end),
          }))
        );
        return overrides;
      },
      indents(range: ByteRange, window: ByteRange): MatchCapture[][] {
        if (indentQuery === null) {
          return [];
        }
        const key = `${range.start}:${range.end} ${window.start}:${window.end}`;
        let found = indents.get(key);
        if (found === undefined) {
          found = queryMatches(query([
            ...args,
            '--byte-range',
            `${range.start}:${range.end}`,
            '--containing-byte-range',
            `${window.start}:${window.end}`,
            indentQuery,
            file,
          ]));
          indents.set(key, found);
        }
        return found;
      },
    };
    cache.set(text, syntax);
    return syntax;
  };
}

export function queryMatchesFor(
  language: Language,
  kind: string,
  text: string,
  scratch: string,
): MatchCapture[][] {
  const path = join(ROOT, 'languages', language.dir, `${kind}.scm`);
  if (readTextIfExists(path) === undefined) {
    return [];
  }
  const directory = join(ROOT, '.build', scratch, language.grammar);
  ensureDirSync(directory);
  const file = join(directory, `${kind}.s`);
  Deno.writeTextFileSync(file, text);
  return queryMatches(query([...languageArgs(language.grammar), path, file]));
}
