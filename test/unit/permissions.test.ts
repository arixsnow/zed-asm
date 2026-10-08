// SPDX-License-Identifier: MIT

import { assert, assertEquals } from '@std/assert';
import { join } from '@std/path';

import { ROOT } from '../../scripts/lib/files.ts';
import { manifest } from '../../scripts/lib/manifest.ts';

interface Task {
  description: string;
  command: string;
}

interface Invocation {
  task: string;
  command: string;
  script: string;
  flags: Map<string, string[] | true>;
}

const tasks: Record<string, Task> =
  JSON.parse(Deno.readTextFileSync(join(ROOT, 'deno.json'))).tasks;
const grammars = manifest.languages.map(({ grammar }) => `tree-sitter/${grammar}`);
const generated = ['extension.toml', 'languages', 'tree-sitter/tree-sitter.json', ...grammars];

function invocations(): Invocation[] {
  const found: Invocation[] = [];
  for (const [task, { command }] of Object.entries(tasks)) {
    for (const segment of command.split('&&').map((part) => part.trim())) {
      const [tool, subcommand, ...rest] = segment.split(/\s+/);
      if (tool !== 'deno' || (subcommand !== 'run' && subcommand !== 'test')) {
        continue;
      }
      const flags = new Map<string, string[] | true>();
      const words: string[] = [];
      for (const word of rest) {
        const flag = /^(-[\w-]+)(?:=(.*))?$/.exec(word);
        if (flag === null) {
          words.push(word);
        } else {
          flags.set(flag[1], flag[2] === undefined ? true : flag[2].split(','));
        }
      }
      found.push({ task, command: segment, script: [subcommand, ...words].join(' '), flags });
    }
  }
  return found;
}

function writesOf(script: string): (string[] | true | undefined)[] {
  const matching = invocations().filter((invocation) => invocation.script === script);
  assert(matching.length > 0, `no task runs ${script}`);
  return matching.map((invocation) => invocation.flags.get('--allow-write'));
}

Deno.test('every task describes itself', () => {
  for (const [name, task] of Object.entries(tasks)) {
    assert(task.description.trim() !== '', `task ${name} needs a description`);
  }
});

Deno.test('every deno command grants only scoped read, write and run permissions', () => {
  for (const { command, script, flags } of invocations()) {
    for (const [flag, value] of flags) {
      if (script.split(' ')[0] === 'test' && ['--parallel', '--ignore'].includes(flag)) {
        continue;
      }
      assert(
        ['--allow-read', '--allow-write', '--allow-run'].includes(flag),
        `${command} uses ${flag}`,
      );
      const sanitizerRun = flag === '--allow-run' && script === 'run scripts/sanitize.ts';
      assert(value !== true || sanitizerRun, `${command} grants unscoped ${flag}`);
    }
  }
});

Deno.test('no command may start deno, whose children escape the sandbox', () => {
  for (const { command, flags } of invocations()) {
    const run = flags.get('--allow-run');
    assert(!(Array.isArray(run) && run.includes('deno')), `${command} may run deno`);
  }
});

Deno.test('generator commands may write exactly the paths they generate', () => {
  for (const write of writesOf('run scripts/build.ts write')) {
    assertEquals(write, generated);
  }
  for (const write of writesOf('run scripts/build.ts set-grammar-rev')) {
    assertEquals(write, [...generated, 'languages.config.cjs']);
  }
  for (const write of writesOf('run scripts/build.ts corpus')) {
    assertEquals(write, grammars.map((grammar) => `${grammar}/test`));
  }
});

Deno.test('checking and running commands write nothing, or only the scratch directory', () => {
  for (
    const script of [
      'build.ts check',
      'tree-sitter.ts generate',
      'tree-sitter.ts test',
      'check-c.ts',
      'check-shell.ts',
    ]
  ) {
    for (const write of writesOf(`run scripts/${script}`)) {
      assertEquals(write, undefined, script);
    }
  }
  for (
    const script of [
      'run scripts/tree-sitter.ts check',
      'run scripts/check-queries.ts',
      'run scripts/verify-fixtures.ts',
      'run scripts/sanitize.ts',
      'run scripts/bench.ts',
      'test',
      'test test/performance',
    ]
  ) {
    for (const write of writesOf(script)) {
      assertEquals(write, ['.build'], script);
    }
  }
});

Deno.test('the Zed checks write only the scratch directory and the container home', () => {
  for (const write of writesOf('run scripts/zed-qa.ts')) {
    assertEquals(write, ['.build', '/home/qa']);
  }
});

Deno.test('only the sanitizer may run any program', () => {
  const unrestricted = invocations()
    .filter(({ flags }) => flags.get('--allow-run') === true)
    .map(({ script }) => script);
  assertEquals(unrestricted, ['run scripts/sanitize.ts']);
});
