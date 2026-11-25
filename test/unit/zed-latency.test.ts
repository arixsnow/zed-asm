// SPDX-License-Identifier: MIT

import { test } from 'bun:test';
import assert from 'node:assert/strict';

import {
    formatTable,
    parseReport,
    PERCENTILES,
    scenarios,
    sized,
    statements,
} from '../../scripts/zed-latency.ts';

const REPORT = [
    'Input Latency Histogram',
    '=======================',
    'Timestamp: 2026-11-25 10:00:00 UTC',
    'Samples: 120',
    '',
    'Percentiles:',
    '  min  :     2.10ms  (  476.2 Hz)',
    '  p50  :     6.40ms  (  156.2 Hz)',
    '  p75  :     7.00ms  (  142.9 Hz)',
    '  p90  :     8.20ms  (  122.0 Hz)',
    '  p95  :     9.10ms  (  109.9 Hz)',
    '  p99  :    12.50ms  (   80.0 Hz)',
    '  p99.9:    14.00ms  (   71.4 Hz)',
    '  max  :    15.30ms  (   65.4 Hz)',
    '',
    'Distribution:',
    '  0-4ms (excellent):     10 (  8.3%)',
    '',
].join('\n');

const SOURCE = [
    '    .text',
    'f:',
    '    movl $1, %eax',
    '    addl %ebx, %eax',
    '    ret',
    '',
].join('\n');

test('a Zed input latency report yields its sample count and percentiles', () => {
    const { samples, percentiles } = parseReport(REPORT);
    assert.deepStrictEqual(samples, 120);
    assert.deepStrictEqual(
        PERCENTILES.map((label) => percentiles[label]),
        [6.4, 9.1, 12.5, 15.3],
    );
});

test('a report without samples is refused', () => {
    assert.throws(
        () => parseReport('No input latency samples recorded yet.'),
        /no samples or percentiles/,
    );
});

test('a sized text ends at a line end, fits its size and starts with its modeline', () => {
    const text = sized('// vim: ft=arm\n', SOURCE, 100);
    assert.ok(text.length <= 100);
    assert.ok(text.startsWith('// vim: ft=arm\n    .text\n'));
    assert.ok(text.endsWith('\n'));
});

test('typed statements are distinct instructions, not directives or labels', () => {
    assert.deepStrictEqual(statements(SOURCE), ['movl $1, %eax', 'addl %ebx, %eax', 'ret']);
});

test('each scenario places the cursor in a statement after the middle of the text', () => {
    const text = sized('', SOURCE, 400);
    const rows = text.split('\n');
    for (const { kind, row, column } of scenarios(text, statements(SOURCE))) {
        const line = rows[row - 1];
        assert.ok(/^\s+[A-Za-z_]/.test(line), `${kind} row ${row}`);
        assert.ok(row - 1 >= Math.floor(rows.length / 2), `${kind} row ${row}`);
        assert.deepStrictEqual(
            column,
            kind === 'lines' ? line.length + 1 : /^\s+\S+\s?/.exec(line)![0].length + 1,
        );
    }
});

test('the table lists one row per measurement under the Zed version', () => {
    const table = formatTable('Zed 1.29.2', [
        { subject: 'C', kind: 'lines', size: 8192, measurement: parseReport(REPORT) },
    ]);
    const [title, header, row] = table.split('\n');
    assert.ok(title.startsWith('Zed 1.29.2'));
    assert.ok(header.includes('p99'));
    assert.ok(row.startsWith('lines  8 KB   C'));
    assert.ok(row.includes('12.50'));
});
