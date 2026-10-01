// SPDX-License-Identifier: MIT

export interface Capture {
  name: string;
  inclusive: boolean;
  start: number;
  end: number;
}

export const CURSOR = '<|>';

export function highlightAt(captures: Capture[], offset: number): string | null {
  return captures.findLast((capture) => capture.start <= offset && offset < capture.end)?.name ??
    null;
}

export function scopeAt(captures: Capture[], offset: number): string | null {
  let smallest: Capture | undefined;
  for (const capture of captures) {
    const contains = capture.inclusive
      ? capture.start <= offset && offset <= capture.end
      : capture.start < offset && offset < capture.end;
    const length = capture.end - capture.start;
    if (contains && (smallest === undefined || length < smallest.end - smallest.start)) {
      smallest = capture;
    }
  }
  return smallest?.name ?? null;
}

export function placeCursors(marked: string): { source: string; cursors: number[] } {
  const parts = marked.split(CURSOR);
  const cursors: number[] = [];
  let length = 0;
  for (const part of parts.slice(0, -1)) {
    length += part.length;
    cursors.push(length);
  }
  return { source: parts.join(''), cursors };
}

export interface Point {
  row: number;
  column: number;
}

export interface ByteRange {
  start: number;
  end: number;
}

export interface NodeRange {
  start: Point;
  end: Point;
}

export interface MatchCapture extends NodeRange {
  name: string;
}

export interface ByteCapture extends ByteRange {
  name: string;
}

export interface Syntax {
  root: ByteRange;
  errors: NodeRange[];
  overrides: ByteCapture[][];
  indents(range: ByteRange, window: ByteRange): MatchCapture[][];
}

export type SyntaxProvider = (text: string) => Syntax;

export interface CommentBlock {
  start: string;
  prefix: string;
  end: string;
  tab_size: number;
}

export interface BracketPair {
  start: string;
  end: string;
  close: boolean;
  newline: boolean;
  not_in?: string[];
}

export interface LanguageConfig {
  line_comments?: string[];
  block_comment?: CommentBlock;
  documentation_comment?: CommentBlock;
  autoclose_before?: string;
  brackets?: BracketPair[];
  word_characters?: string[];
  increase_indent_pattern?: string;
  decrease_indent_pattern?: string;
  overrides?: Record<string, { line_comments?: string[] }>;
}

export interface LanguageQueries {
  overrides: string;
  indents: string;
  brackets: string;
}

export interface IndentSize {
  kind: ' ' | '\t';
  length: number;
}

export interface IndentSuggestion {
  basisRow: number;
  delta: -1 | 0 | 1;
  withinError: boolean;
}

interface Scope {
  name: string | null;
  lineComments: string[];
  disabledBrackets: Set<number>;
}

interface Edit {
  start: number;
  end: number;
  text: string;
}

interface AutocloseRegion {
  start: number;
  end: number;
  pair: BracketPair;
}

const MAX_BYTES_TO_QUERY = 16 * 1024;
const MODELED_KEYS = new Set([
  'line_comments',
  'block_comment',
  'documentation_comment',
  'autoclose_before',
  'brackets',
  'word_characters',
  'increase_indent_pattern',
  'decrease_indent_pattern',
  'overrides',
]);
const INERT_KEYS = new Set(['name', 'grammar', 'path_suffixes', 'modeline_aliases', 'debuggers']);
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const WHITESPACE = /^\p{White_Space}$/u;
const ALPHANUMERIC = /^[\p{Alphabetic}\p{N}]$/u;

function utf8Length(text: string): number {
  return encoder.encode(text).length;
}

function isWhitespace(character: string): boolean {
  return WHITESPACE.test(character);
}

function leadingWhitespace(line: string): number {
  let count = 0;
  for (const character of line) {
    if (!isWhitespace(character)) {
      break;
    }
    count++;
  }
  return count;
}

function trimStart(text: string): string {
  return [...text].slice(leadingWhitespace(text)).join('');
}

function trimEnd(text: string): string {
  const characters = [...text];
  while (characters.length > 0 && isWhitespace(characters[characters.length - 1])) {
    characters.pop();
  }
  return characters.join('');
}

function comparePoints(a: Point, b: Point): number {
  return a.row - b.row || a.column - b.column;
}

function captureNames(query: string): string[] {
  return [...new Set([...query.matchAll(/@([\w.]+)/g)].map(([, name]) => name))];
}

export function indentSizeForText(text: string): IndentSize {
  const indent = /^[ \t]*/.exec(text)?.[0] ?? '';
  return { kind: indent.startsWith('\t') ? '\t' : ' ', length: indent.length };
}

function sameSize(a: IndentSize, b: IndentSize): boolean {
  return a.kind === b.kind && a.length === b.length;
}

function withDelta(size: IndentSize, delta: -1 | 0 | 1, unit: IndentSize): IndentSize {
  if (delta < 0 && size.kind === unit.kind && size.length >= unit.length) {
    return { kind: size.kind, length: size.length - unit.length };
  }
  if (delta > 0 && size.length === 0) {
    return unit;
  }
  if (delta > 0 && size.kind === unit.kind) {
    return { kind: size.kind, length: size.length + unit.length };
  }
  return size;
}

function moveOffset(offset: number, edit: Edit, after: boolean): number {
  if (offset < edit.start) {
    return offset;
  }
  if (offset > edit.end) {
    return offset + utf8Length(edit.text) - (edit.end - edit.start);
  }
  return after ? edit.start + utf8Length(edit.text) : edit.start;
}

export class ZedLanguage {
  readonly increase: RegExp | null;
  readonly decrease: RegExp | null;
  private readonly scopes = new Map<string, Scope>();

  constructor(readonly config: LanguageConfig, queries: LanguageQueries) {
    for (const key of Object.keys(config)) {
      if (!MODELED_KEYS.has(key) && !INERT_KEYS.has(key)) {
        throw new Error(`the Zed model does not cover the language setting ${key}`);
      }
    }
    for (const [name, entry] of Object.entries(config.overrides ?? {})) {
      for (const key of Object.keys(entry)) {
        if (key !== 'line_comments') {
          throw new Error(`the Zed model does not cover ${key} in the ${name} scope`);
        }
      }
    }
    if ((config.brackets ?? []).some((pair) => pair.newline)) {
      throw new Error('the Zed model does not cover brackets with newline = true');
    }
    const unmodeled = captureNames(queries.indents).filter((name) =>
      name !== 'indent' && !name.startsWith('_')
    );
    if (unmodeled.length > 0) {
      throw new Error(`the Zed model does not cover @${unmodeled.join(', @')} in indents.scm`);
    }
    if (queries.brackets.includes('#set!')) {
      throw new Error('the Zed model does not cover bracket query properties');
    }
    this.increase = config.increase_indent_pattern === undefined
      ? null
      : new RegExp(config.increase_indent_pattern, 'u');
    this.decrease = config.decrease_indent_pattern === undefined
      ? null
      : new RegExp(config.decrease_indent_pattern, 'u');
    const names = captureNames(queries.overrides).filter((name) => !name.startsWith('_')).map((
      name,
    ) => name.replace(/\.inclusive$/, ''));
    const referenced = [
      ...Object.keys(config.overrides ?? {}),
      ...(config.brackets ?? []).flatMap((pair) => pair.not_in ?? []),
    ];
    for (const name of referenced.filter((candidate) => !names.includes(candidate))) {
      throw new Error(`the settings name the scope ${name}, which overrides.scm does not capture`);
    }
    for (const name of names) {
      this.scopes.set(name, {
        name,
        lineComments: config.overrides?.[name]?.line_comments ?? config.line_comments ?? [],
        disabledBrackets: new Set(
          (config.brackets ?? []).flatMap((pair, index) =>
            (pair.not_in ?? []).includes(name) ? [index] : []
          ),
        ),
      });
    }
  }

  get baseScope(): Scope {
    return {
      name: null,
      lineComments: this.config.line_comments ?? [],
      disabledBrackets: new Set(),
    };
  }

  scope(name: string): Scope {
    return this.scopes.get(name) ?? this.baseScope;
  }

  brackets(scope: Scope): { pair: BracketPair; enabled: boolean }[] {
    return (this.config.brackets ?? []).map((pair, index) => ({
      pair,
      enabled: !scope.disabledBrackets.has(index),
    }));
  }

  closesBefore(character: string | undefined): boolean {
    return character === undefined || isWhitespace(character) ||
      (this.config.autoclose_before ?? '').includes(character);
  }

  isWord(character: string): boolean {
    return ALPHANUMERIC.test(character) || character === '_' ||
      (this.config.word_characters ?? []).includes(character);
  }
}

class Snapshot {
  readonly text: string;
  private readonly lineStarts: number[] = [];
  private parsed: Syntax | undefined;

  constructor(
    readonly lines: string[],
    private readonly language: ZedLanguage,
    private readonly provider: SyntaxProvider,
  ) {
    this.text = lines.join('\n');
    let offset = 0;
    for (const line of lines) {
      this.lineStarts.push(offset);
      offset += utf8Length(line) + 1;
    }
  }

  get syntax(): Syntax {
    this.parsed ??= this.provider(this.text);
    return this.parsed;
  }

  offset(point: Point): number {
    if (point.row >= this.lines.length) {
      return utf8Length(this.text);
    }
    return this.lineStarts[point.row] + Math.min(point.column, utf8Length(this.lines[point.row]));
  }

  point(offset: number): Point {
    const row = Math.max(0, this.lineStarts.findLastIndex((start) => start <= offset));
    return { row, column: offset - this.lineStarts[row] };
  }

  after(offset: number): string {
    return decoder.decode(encoder.encode(this.text).slice(offset));
  }

  before(offset: number): string {
    return decoder.decode(encoder.encode(this.text).slice(0, offset));
  }

  indentSize(row: number): IndentSize {
    return indentSizeForText(this.lines[row]);
  }

  isBlank(row: number): boolean {
    return leadingWhitespace(this.lines[row]) === [...this.lines[row]].length;
  }

  previousNonBlankRow(row: number): number | null {
    for (let candidate = row - 1; candidate >= 0; candidate--) {
      if (!this.isBlank(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  overrideAt(offset: number): ByteCapture | null {
    const { root } = this.syntax;
    if (offset < root.start || offset >= root.end) {
      return null;
    }
    const window = {
      start: Math.max(0, offset - MAX_BYTES_TO_QUERY / 2),
      end: offset + MAX_BYTES_TO_QUERY / 2,
    };
    let smallest: ByteCapture | null = null;
    for (const match of this.syntax.overrides) {
      if (match.some((capture) => capture.start < window.start || capture.end > window.end)) {
        continue;
      }
      for (const capture of match.filter((candidate) => !candidate.name.startsWith('_'))) {
        const inside = capture.name.endsWith('.inclusive')
          ? capture.start <= offset && offset <= capture.end
          : capture.start < offset && offset < capture.end;
        if (
          inside &&
          (smallest === null || capture.end - capture.start < smallest.end - smallest.start)
        ) {
          smallest = capture;
        }
      }
    }
    return smallest;
  }

  scopeAt(offset: number): Scope {
    const capture = this.overrideAt(offset);
    return capture === null
      ? this.language.baseScope
      : this.language.scope(capture.name.replace(/\.inclusive$/, ''));
  }

  blockCommentClosingIndent(position: Point): IndentSize | null {
    const indentLength = this.indentSize(position.row).length;
    const rest = this.lines[position.row].slice(indentLength);
    const delimiter = [
      this.language.config.documentation_comment,
      this.language.config.block_comment,
    ]
      .map((config) => trimStart(config?.end ?? ''))
      .find((end) => end !== '' && rest.startsWith(end) && trimEnd(rest.slice(end.length)) === '');
    if (delimiter === undefined || position.column < indentLength + utf8Length(delimiter)) {
      return null;
    }
    const start = this.offset({ row: position.row, column: indentLength });
    const comment = this.overrideAt(start);
    const scope = comment?.name.replace(/\.inclusive$/, '');
    if (comment === null || (scope !== 'comment' && scope !== 'string')) {
      return null;
    }
    const openingRow = this.point(comment.start).row;
    if (comment.end !== start + utf8Length(delimiter) || openingRow >= position.row) {
      return null;
    }
    return this.indentSize(openingRow);
  }

  logicalIndent(row: number): IndentSize {
    return this.blockCommentClosingIndent({ row, column: utf8Length(this.lines[row]) }) ??
      this.indentSize(row);
  }

  suggestion(row: number): IndentSuggestion {
    const previousNonBlank = this.previousNonBlankRow(row);
    const firstRow = previousNonBlank ?? row;
    const range = {
      start: this.offset({ row: firstRow, column: 0 }),
      end: this.offset({ row: row + 1, column: 0 }),
    };
    const middle = Math.floor((range.start + range.end) / 2);
    const windowStart = Math.max(0, middle - MAX_BYTES_TO_QUERY / 2);
    const ranges: NodeRange[] = [];
    for (
      const match of this.syntax.indents(range, {
        start: windowStart,
        end: windowStart + MAX_BYTES_TO_QUERY,
      })
    ) {
      const indent = match.find((capture) => capture.name === 'indent');
      if (indent === undefined || indent.start.row === indent.end.row) {
        continue;
      }
      const same = ranges.find((candidate) => comparePoints(candidate.start, indent.start) === 0);
      if (same === undefined) {
        ranges.push({ start: indent.start, end: indent.end });
      } else if (comparePoints(indent.end, same.end) > 0) {
        same.end = indent.end;
      }
    }

    const previousRow = previousNonBlank ?? 0;
    const previousStart = { row: previousRow, column: this.indentSize(previousRow).length };
    const rowStart = { row, column: this.indentSize(row).length };
    const increased = firstRow < row && this.language.increase?.test(this.lines[row - 1]) === true;
    const decreased = this.language.decrease?.test(this.lines[row]) === true;
    let indentFromPrevious = increased;
    let outdentTo = Infinity;
    for (const candidate of ranges.filter((entry) => entry.start.row < row)) {
      if (candidate.start.row === previousRow && comparePoints(candidate.end, rowStart) > 0) {
        indentFromPrevious = true;
      }
      if (
        comparePoints(candidate.end, previousStart) > 0 &&
        comparePoints(candidate.end, rowStart) <= 0
      ) {
        outdentTo = Math.min(outdentTo, candidate.start.row);
      }
    }
    const withinError = !increased && !decreased &&
      this.syntax.errors.some((error) =>
        error.start.row < row && comparePoints(error.end, rowStart) > 0
      );

    if (outdentTo === previousRow || (decreased && indentFromPrevious)) {
      return { basisRow: previousRow, delta: 0, withinError };
    }
    if (indentFromPrevious) {
      return { basisRow: previousRow, delta: 1, withinError };
    }
    if (outdentTo < previousRow) {
      return { basisRow: outdentTo, delta: 0, withinError };
    }
    if (decreased) {
      return { basisRow: previousRow, delta: -1, withinError };
    }
    return { basisRow: previousRow, delta: 0, withinError };
  }
}

export class ZedEditor {
  private lines: string[];
  private cursorOffset: number;
  private regions: AutocloseRegion[] = [];
  private readonly unit: IndentSize;

  constructor(
    text: string,
    cursor: Point,
    private readonly language: ZedLanguage,
    private readonly provider: SyntaxProvider,
    tabSize = 4,
  ) {
    this.lines = text.split('\n');
    this.cursorOffset = this.snapshot().offset(cursor);
    this.unit = { kind: ' ', length: tabSize };
  }

  get text(): string {
    return this.lines.join('\n');
  }

  newline(): void {
    const snapshot = this.snapshot();
    const cursor = snapshot.point(this.cursorOffset);
    const indent = snapshot.indentSize(cursor.row);
    let existing = { kind: indent.kind, length: Math.min(indent.length, cursor.column) };
    existing = snapshot.blockCommentClosingIndent(cursor) ?? existing;
    let text = `\n${existing.kind.repeat(existing.length)}`;
    let extraLine = false;
    let autoindent = true;
    const comment = this.lineCommentContinuation(snapshot, cursor);
    if (comment !== null) {
      text += comment;
    } else {
      const documentation = this.documentationContinuation(snapshot, cursor);
      if (documentation !== null) {
        text += `${' '.repeat(documentation.indent)}${documentation.prefix}`;
        if (documentation.extraLine !== null) {
          text += `\n${existing.kind.repeat(existing.length)}${
            ' '.repeat(documentation.extraLine)
          }`;
          extraLine = true;
        }
        autoindent = false;
      }
    }
    const start = indent.length > 0 && cursor.column === indent.length
      ? snapshot.offset({ row: cursor.row, column: 0 })
      : this.cursorOffset;
    this.edit({ start, end: this.cursorOffset, text }, true);
    if (autoindent) {
      this.reindent(snapshot, cursor.row + 1, null);
    }
    if (extraLine) {
      const after = this.snapshot();
      const row = after.point(this.cursorOffset).row - 1;
      this.cursorOffset = after.offset({ row, column: utf8Length(this.lines[row]) });
    }
    this.dropRegionsAwayFromCursor();
  }

  input(character: string): void {
    const snapshot = this.snapshot();
    const cursor = snapshot.point(this.cursorOffset);
    const closing = (this.language.config.brackets ?? []).some((pair) => pair.end === character);
    const starting = (this.language.config.brackets ?? []).some((pair) =>
      pair.start.endsWith(character)
    );
    const scope = closing || starting
      ? snapshot.scopeAt(this.cursorOffset)
      : this.language.baseScope;
    const opening = this.language.brackets(scope).find(({ pair, enabled }) => {
      if (!enabled || !pair.start.endsWith(character)) {
        return false;
      }
      const prefix = pair.start.slice(0, pair.start.length - character.length);
      return prefix === '' || snapshot.before(this.cursorOffset).endsWith(prefix);
    })?.pair;
    if (opening !== undefined && opening.close && this.autocloses(snapshot, cursor, opening)) {
      this.edit({
        start: this.cursorOffset,
        end: this.cursorOffset,
        text: `${character}${opening.end}`,
      }, false);
      this.reindent(snapshot, cursor.row, cursor.row);
      this.cursorOffset += utf8Length(character);
      this.regions.push({ start: this.cursorOffset, end: this.cursorOffset, pair: opening });
      this.regions.sort((a, b) => a.start - b.start || b.end - a.end);
      return;
    }
    const region = this.regions.findLast((candidate) =>
      candidate.start <= this.cursorOffset && this.cursorOffset <= candidate.end
    );
    if (
      (opening !== undefined || closing) && region !== undefined &&
      this.cursorOffset === region.end && character === region.pair.end &&
      snapshot.after(region.end).startsWith(character)
    ) {
      this.cursorOffset += utf8Length(character);
      this.dropRegionsAwayFromCursor();
      return;
    }
    this.edit({ start: this.cursorOffset, end: this.cursorOffset, text: character }, true);
    this.reindent(snapshot, cursor.row, cursor.row);
    this.dropRegionsAwayFromCursor();
  }

  private snapshot(): Snapshot {
    return new Snapshot(this.lines, this.language, this.provider);
  }

  private edit(edit: Edit, cursorAfter: boolean): void {
    const bytes = encoder.encode(this.text);
    const text = decoder.decode(bytes.slice(0, edit.start)) + edit.text +
      decoder.decode(bytes.slice(edit.end));
    this.lines = text.split('\n');
    this.cursorOffset = moveOffset(this.cursorOffset, edit, cursorAfter);
    this.regions = this.regions.map((region) => ({
      start: moveOffset(region.start, edit, false),
      end: moveOffset(region.end, edit, true),
      pair: region.pair,
    }));
  }

  private reindent(before: Snapshot, row: number, oldRow: number | null): void {
    const after = this.snapshot();
    const suggestion = after.suggestion(row);
    const size = withDelta(after.logicalIndent(suggestion.basisRow), suggestion.delta, this.unit);
    if (oldRow !== null) {
      const old = before.suggestion(oldRow);
      const oldSize = withDelta(before.logicalIndent(old.basisRow), old.delta, this.unit);
      if (sameSize(size, oldSize) || (suggestion.withinError && !old.withinError)) {
        return;
      }
    }
    const current = indentSizeForText(this.lines[row]);
    const start = after.offset({ row, column: 0 });
    const replaced = size.kind === current.kind
      ? Math.max(0, current.length - size.length)
      : current.length;
    const inserted = size.kind === current.kind
      ? Math.max(0, size.length - current.length)
      : size.length;
    if (replaced > 0 || inserted > 0) {
      this.edit({ start, end: start + replaced, text: size.kind.repeat(inserted) }, true);
    }
  }

  private autocloses(snapshot: Snapshot, cursor: Point, pair: BracketPair): boolean {
    if (!this.language.closesBefore([...snapshot.after(this.cursorOffset)][0])) {
      return false;
    }
    const line = [...snapshot.before(this.cursorOffset).split('\n').at(-1) ?? ''];
    const previous = line.at(-1);
    if (
      cursor.column > 0 && previous !== undefined && pair.start === pair.end &&
      this.language.isWord(previous)
    ) {
      return false;
    }
    if (pair.start !== pair.end || utf8Length(pair.start) !== 1) {
      return true;
    }
    let column = cursor.column;
    let quotes = 0;
    for (const character of line.toReversed()) {
      column -= utf8Length(character);
      if (character !== pair.start) {
        continue;
      }
      const enabled = (at: number) =>
        this.language.brackets(snapshot.scopeAt(snapshot.offset({ row: cursor.row, column: at })))
          .find((entry) => entry.pair.start === pair.start)?.enabled;
      if ((enabled(column) ?? true) && enabled(column + 1) !== false) {
        quotes++;
      }
    }
    return quotes % 2 === 0;
  }

  private dropRegionsAwayFromCursor(): void {
    this.regions = this.regions.filter((region) =>
      region.start <= this.cursorOffset && this.cursorOffset <= region.end
    );
  }

  private lineCommentContinuation(snapshot: Snapshot, cursor: Point): string | null {
    const scope = snapshot.scopeAt(this.cursorOffset);
    const characters = [...this.lines[cursor.row]];
    const blanks = leadingWhitespace(this.lines[cursor.row]);
    const longest = Math.max(0, ...scope.lineComments.map(utf8Length));
    const candidate = characters.slice(blanks, blanks + longest + 2).join('');
    const marker = scope.lineComments.filter((prefix) => candidate.startsWith(trimEnd(prefix)))
      .reduce<string | null>(
        (best, prefix) =>
          best === null || trimEnd(prefix).length >= trimEnd(best).length ? prefix : best,
        null,
      );
    if (marker === null || blanks + utf8Length(trimEnd(marker)) > cursor.column) {
      return null;
    }
    const block = trimEnd(this.language.config.block_comment?.start ?? '');
    if (block !== '' && block.startsWith(trimEnd(marker)) && candidate.startsWith(block)) {
      return null;
    }
    return marker;
  }

  private documentationContinuation(
    snapshot: Snapshot,
    cursor: Point,
  ): { prefix: string; indent: number; extraLine: number | null } | null {
    const config = this.language.config.documentation_comment;
    if (config === undefined || snapshot.scopeAt(this.cursorOffset).name !== 'comment') {
      return null;
    }
    const line = this.lines[cursor.row];
    const content = [...line].slice(leadingWhitespace(line)).join('');
    const blanks = leadingWhitespace(line);
    const afterStart = content.startsWith(config.start) &&
      blanks + utf8Length(config.start) <= cursor.column;
    const prefix = trimEnd(config.prefix);
    const afterPrefix = content.startsWith(prefix) && blanks + utf8Length(prefix) <= cursor.column;
    const endIndex = line.indexOf(config.end);
    const endColumn = endIndex === -1 ? null : [...line.slice(0, endIndex)].length;
    if (!(afterStart || afterPrefix) || (endColumn !== null && cursor.column > endColumn)) {
      return null;
    }
    const extraLine = afterStart && endColumn !== null
      ? (cursor.column === endColumn ? config.tab_size : 0)
      : null;
    return { prefix: config.prefix, indent: afterStart ? config.tab_size : 0, extraLine };
  }
}

export function suggestIndent(
  text: string,
  language: ZedLanguage,
  provider: SyntaxProvider,
  row: number,
): IndentSuggestion {
  return new Snapshot(text.split('\n'), language, provider).suggestion(row);
}

export interface OutlineItem {
  depth: number;
  text: string;
  range: ByteRange;
  annotation: { start: number; end: number } | null;
}

export type TextObject =
  | 'function.around'
  | 'function.inside'
  | 'class.around'
  | 'class.inside'
  | 'comment.around'
  | 'comment.inside';

function lineOffsets(text: string): number[] {
  const offsets = [0];
  for (const [index, byte] of encoder.encode(text).entries()) {
    if (byte === 0x0a) {
      offsets.push(index + 1);
    }
  }
  return offsets;
}

function toBytes(offsets: number[], at: Point): number {
  return offsets[at.row] + at.column;
}

export function outlineItems(
  text: string,
  matches: MatchCapture[][],
  range: ByteRange = { start: 0, end: utf8Length(text) },
): OutlineItem[] {
  const offsets = lineOffsets(text);
  const lineLength = (row: number) => (offsets[row + 1] ?? utf8Length(text) + 1) - offsets[row] - 1;
  const items: { item: ByteRange; startRow: number; text: string }[] = [];
  const annotations: { start: number; end: number }[] = [];
  for (const match of matches) {
    const item = match.find((capture) => capture.name === 'item');
    if (item === undefined) {
      const annotation = match.find((capture) => capture.name === 'annotation');
      if (annotation !== undefined) {
        const rows = {
          start: annotation.start.row,
          end: annotation.end.row > annotation.start.row && annotation.end.column === 0
            ? annotation.end.row - 1
            : annotation.end.row,
        };
        const last = annotations.at(-1);
        if (last !== undefined && last.end >= rows.start - 1) {
          last.end = rows.end;
        } else {
          annotations.push(rows);
        }
      }
      continue;
    }
    const itemRange = { start: toBytes(offsets, item.start), end: toBytes(offsets, item.end) };
    if (itemRange.end < range.start || itemRange.start > range.end) {
      continue;
    }
    const pieces = match.filter((capture) => capture.name === 'name' || capture.name === 'context')
      .map((capture) => {
        const start = toBytes(offsets, capture.start);
        const end = capture.end.row > capture.start.row
          ? start + lineLength(capture.start.row) - capture.start.column
          : toBytes(offsets, capture.end);
        return { start, end, name: capture.name === 'name' };
      })
      .filter((piece) => piece.end > piece.start);
    if (!pieces.some((piece) => piece.name)) {
      continue;
    }
    let label = '';
    let lastEnd = 0;
    for (const piece of pieces) {
      if (label !== '' && piece.start > lastEnd) {
        label += ' ';
      }
      label += decoder.decode(encoder.encode(text).slice(piece.start, piece.end));
      lastEnd = piece.end;
    }
    items.push({ item: itemRange, startRow: item.start.row, text: label });
  }
  items.sort((a, b) => a.item.start - b.item.start || b.item.end - a.item.end);
  const ends: number[] = [];
  let next = 0;
  return items.map(({ item, startRow, text: label }) => {
    while (ends.length > 0 && ends[ends.length - 1] < item.end) {
      ends.pop();
    }
    while (next < annotations.length && annotations[next].end < startRow - 1) {
      next++;
    }
    let annotation: { start: number; end: number } | null = null;
    if (next < annotations.length && annotations[next].end === startRow - 1) {
      annotation = annotations[next++];
    }
    const entry = { depth: ends.length, text: label, range: item, annotation };
    ends.push(item.end);
    return entry;
  });
}

export function breadcrumbs(text: string, matches: MatchCapture[][], offset: number): string[] {
  const length = utf8Length(text);
  const items = outlineItems(text, matches, {
    start: Math.max(0, offset - 1),
    end: Math.min(length, offset + 1),
  });
  let depth = -1;
  return items.filter((item) => {
    const deeper = item.depth > depth;
    depth = item.depth;
    return deeper;
  }).map((item) => item.text);
}

export function textObject(
  text: string,
  matches: MatchCapture[][],
  offset: number,
  target: TextObject,
): ByteRange | null {
  const offsets = lineOffsets(text);
  const objects = matches.flatMap((match) => {
    const merged = new Map<string, ByteRange>();
    for (const capture of match) {
      const start = toBytes(offsets, capture.start);
      const end = toBytes(offsets, capture.end);
      const existing = merged.get(capture.name);
      merged.set(
        capture.name,
        existing === undefined
          ? { start, end }
          : { start: Math.min(existing.start, start), end: Math.max(existing.end, end) },
      );
    }
    return [...merged].map(([name, range]) => ({ name, range }));
  });
  const around = (range: ByteRange) =>
    objects.filter((object) => object.range.start < range.end && range.start < object.range.end);
  const cursor = { start: Math.max(0, offset - 1), end: Math.min(utf8Length(text), offset + 1) };
  const size = (range: ByteRange) => range.end - range.start;
  const inside = around(cursor).filter((object) => object.name === target)
    .sort((a, b) => size(a.range) - size(b.range));
  if (inside.length > 0) {
    return inside[0].range;
  }
  if (!target.endsWith('.inside')) {
    return null;
  }
  const outer =
    around(cursor).filter((object) => object.name === target.replace(/\.inside$/, '.around')).sort((
      a,
      b,
    ) => size(a.range) - size(b.range))[0];
  if (outer === undefined) {
    return null;
  }
  const first = around(outer.range).filter((object) => object.name === target)
    .sort((a, b) => a.range.start - b.range.start)[0];
  return first !== undefined && size(first.range) > 0 ? first.range : outer.range;
}
