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
