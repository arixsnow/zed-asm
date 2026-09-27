// SPDX-License-Identifier: MIT

import { copySync, emptyDirSync, ensureDirSync } from '@std/fs';
import { join } from '@std/path';

import { ROOT } from './lib/files.ts';
import { run, runOrThrow } from './lib/grammars.ts';
import { manifest } from './lib/manifest.ts';

export const HOME = '/home/qa';
const DISPLAY = ':99';
const SCREEN = '1400x900x24';
const OUT = join(ROOT, '.build', 'zed-qa');
const WORK = join(HOME, 'work');
const ZED_DATA = join(HOME, '.local', 'share', 'zed');
const EXTENSION = join(ZED_DATA, 'extensions', 'installed', 'asm');
const LOG = join(ZED_DATA, 'logs', 'Zed.log');
const SYSROOT = '/usr/wasm32-wasi';
const OPEN_DELAY = 2500;
const TIMEOUT = 15000;

export const SETTINGS = {
  telemetry: { diagnostics: false, metrics: false },
  auto_update: false,
  auto_install_extensions: { html: false },
  session: { trust_all_worktrees: true },
  theme: 'One Dark',
  buffer_font_size: 16,
  remove_trailing_whitespace_on_save: false,
  ensure_final_newline_on_save: false,
};

export type Step = { type: string } | { keys: string[] };

export interface Check {
  id: string;
  row: number;
  title: string;
  file: string;
  text: string;
  steps: Step[];
  look?: string;
  wants?: string;
  clipboard?: boolean;
  expect?: (result: string) => boolean;
}

const lines = (text: string) => text.split('\n');
const OPENERS = ['[', '(', '{', '"', "'", '/*'];
const AUTOCLOSE: Step[] = OPENERS.flatMap((opener, index) =>
  index === 0 ? [{ type: opener }] : [{ keys: ['End'] }, { type: ` ${opener}` }]
);

export const CHECKS: Check[] = [
  {
    id: '1',
    row: 1,
    title: 'A .s file opens as Assembly',
    file: 'c01.s',
    text: '    mov x0, x1\n',
    steps: [],
    look: 'the status bar shows Assembly',
  },
  {
    id: '2',
    row: 2,
    title: 'A .asm file opens as x86 Assembly (NASM)',
    file: 'c02.asm',
    text: '    mov eax, 1\n',
    steps: [],
    look: 'the status bar shows x86 Assembly (NASM)',
  },
  {
    id: '3',
    row: 3,
    title: 'A modeline selects ARM Assembly',
    file: 'c03.s',
    text: '// vim: ft=arm\n    mov x0, x1\n',
    steps: [],
    look: 'the status bar shows ARM Assembly',
  },
  {
    id: '4',
    row: 4,
    title: 'lsl #32 is not a comment',
    file: 'c04.s',
    text: '',
    steps: [{ type: '    add x0, x1, x2, lsl #32 // comment' }],
    look: '#32 has the number color; only // comment has the comment color',
  },
  {
    id: '5',
    row: 5,
    title: '/* then Enter',
    file: 'c05.s',
    text: '',
    steps: [{ type: '/*' }, { keys: ['Return'] }],
    wants: '*/ is added and the new line starts with *',
    expect: (text) => {
      const [first, second, ...rest] = lines(text);
      return first === '/*' && /^\s*\* ?$/.test(second ?? '') && rest.at(-1)?.trim() === '*/';
    },
  },
  {
    id: '6',
    row: 6,
    title: 'Enter on a * line',
    file: 'c06.s',
    text: '/*\n * text\n */',
    steps: [{ keys: ['ctrl+End', 'Up', 'End', 'Return'] }],
    wants: 'the next line starts with *',
    expect: (text) => lines(text)[1] === ' * text' && /^\s*\* ?$/.test(lines(text)[2] ?? ''),
  },
  {
    id: '7a',
    row: 7,
    title: 'Enter after // note',
    file: 'c07.s',
    text: '// note',
    steps: [{ keys: ['ctrl+End', 'Return'] }],
    wants: 'the next line starts with "// "',
    expect: (text) => text === '// note\n// ',
  },
  {
    id: '7b',
    row: 7,
    title: 'Enter after ; note in NASM',
    file: 'c07.asm',
    text: '; note',
    steps: [{ keys: ['ctrl+End', 'Return'] }],
    wants: 'the next line starts with "; "',
    expect: (text) => text === '; note\n; ',
  },
  {
    id: '7c',
    row: 7,
    title: 'Enter after # note',
    file: 'c07c.s',
    text: '# note\nnop\n',
    steps: [{ keys: ['ctrl+Home', 'End', 'Return'] }],
    wants: 'the next line starts with "# "',
    expect: (text) => text === '# note\n# \nnop\n',
  },
  {
    id: '7d',
    row: 7,
    title: 'Enter after @ note in ARM',
    file: 'c07d.s',
    text: '// vim: ft=arm\n@ note\nnop\n',
    steps: [{ keys: ['ctrl+Home', 'Down', 'End', 'Return'] }],
    wants: 'the next line starts with "@ "',
    expect: (text) => text === '// vim: ft=arm\n@ note\n@ \nnop\n',
  },
  {
    id: '7e',
    row: 7,
    title: 'Enter after # note in ARM',
    file: 'c07e.s',
    text: '// vim: ft=arm\n# note\nnop\n',
    steps: [{ keys: ['ctrl+Home', 'Down', 'End', 'Return'] }],
    wants: 'the next line starts with "# "',
    expect: (text) => text === '// vim: ft=arm\n# note\n# \nnop\n',
  },
  {
    id: '7f',
    row: 7,
    title: 'Enter after ; note in ARM (Apple)',
    file: 'c07f.s',
    text: '// vim: ft=arm64-apple\n; note\nnop\n',
    steps: [{ keys: ['ctrl+Home', 'Down', 'End', 'Return'] }],
    wants: 'the next line starts with "; "',
    expect: (text) => text === '// vim: ft=arm64-apple\n; note\n; \nnop\n',
  },
  {
    id: '8a',
    row: 8,
    title: 'Toggle comment',
    file: 'c08.s',
    text: 'mov x0, x1',
    steps: [{ keys: ['ctrl+slash'] }],
    wants: '"// " is added',
    expect: (text) => text === '// mov x0, x1',
  },
  {
    id: '8b',
    row: 8,
    title: 'Toggle comment in NASM',
    file: 'c08.asm',
    text: 'mov eax, 1',
    steps: [{ keys: ['ctrl+slash'] }],
    wants: '"; " is added',
    expect: (text) => text === '; mov eax, 1',
  },
  {
    id: '8c',
    row: 8,
    title: 'Toggle comment in x86 GAS',
    file: 'c08c.s',
    text: '// vim: ft=x86\nmovq %rax, %rbx\n',
    steps: [{ keys: ['ctrl+Home', 'Down', 'ctrl+slash'] }],
    wants: '"// " is added',
    expect: (text) => text === '// vim: ft=x86\n// movq %rax, %rbx\n',
  },
  {
    id: '9',
    row: 9,
    title: 'Enter after #define X 1',
    file: 'c09.S',
    text: '#define X 1\nnop\n',
    steps: [{ keys: ['ctrl+Home', 'End', 'Return'] }],
    wants: 'no # is inserted',
    expect: (text) => text === '#define X 1\n\nnop\n',
  },
  {
    id: '10',
    row: 10,
    title: 'Enter after #endif /* X */',
    file: 'c10.S',
    text: '#endif /* X */\nnop\n',
    steps: [{ keys: ['ctrl+Home', 'End', 'Return'] }],
    wants: 'no # is inserted',
    expect: (text) => text === '#endif /* X */\n\nnop\n',
  },
  {
    id: '11',
    row: 11,
    title: 'Enter after main:',
    file: 'c11.s',
    text: '',
    steps: [{ type: 'main:' }, { keys: ['Return'] }, { type: 'x' }],
    wants: 'the next line is indented one level',
    expect: (text) => text === 'main:\n    x',
  },
  {
    id: '12',
    row: 12,
    title: 'loop: on an indented line',
    file: 'c12.s',
    text: '',
    steps: [{ type: 'main:' }, { keys: ['Return'] }, { type: 'loop:' }],
    wants: 'the label moves back to column 0',
    expect: (text) => text === 'main:\nloop:',
  },
  {
    id: '13a',
    row: 13,
    title: 'Brackets, quotes and /* in code',
    file: 'c13.s',
    text: '',
    steps: AUTOCLOSE,
    wants: 'all of them close',
    expect: (text) => text === '[] () {} "" \'\' /* */',
  },
  {
    id: '13b',
    row: 13,
    title: 'Brackets, quotes and /* in a comment',
    file: 'c13b.s',
    text: '// \nnop\n',
    steps: [{ keys: ['ctrl+Home', 'End'] }, ...AUTOCLOSE],
    wants: 'brackets and " close, \' and /* do not',
    expect: (text) => text === '// [] () {} "" \' /*\nnop\n',
  },
  {
    id: '14',
    row: 14,
    title: '( typed before .Lend',
    file: 'c14.s',
    text: 'mov x0, .Lend - .Lstart\n',
    steps: [{ keys: ['ctrl+Home', ...Array(8).fill('Right')] }, { type: '(' }],
    wants: 'no ) is added',
    expect: (text) => text === 'mov x0, (.Lend - .Lstart\n',
  },
  {
    id: '15',
    row: 15,
    title: 'Enter between {}',
    file: 'c15.s',
    text: '',
    steps: [{ type: 'push {' }, { keys: ['Return'] }],
    wants: 'a plain new line, no block',
    expect: (text) => text === 'push {\n}',
  },
  {
    id: '16a',
    row: 16,
    title: 'Selecting the word .Lloop_end',
    file: 'c16a.s',
    text: '    b .Lloop_end',
    steps: [{ keys: ['ctrl+End', 'Left', 'ctrl+d', 'ctrl+c'] }],
    clipboard: true,
    wants: 'the whole name is selected',
    expect: (text) => text === '.Lloop_end',
  },
  {
    id: '16b',
    row: 16,
    title: 'Selecting the word %function in ARM',
    file: 'c16b.s',
    text: '// vim: ft=arm\n.type f, %function\n',
    steps: [{ keys: ['ctrl+Home', 'Down', 'End', 'Left', 'ctrl+d', 'ctrl+c'] }],
    clipboard: true,
    wants: 'the whole name is selected',
    expect: (text) => text === '%function',
  },
];

export const LOG_ROW = 17;
export const LOG_PATTERN = /\basm\b|asm_(?:auto|arm|x86)|Assembly|grammar|quer(?:y|ies)/i;

export interface Result {
  id: string;
  title: string;
  status: 'PASS' | 'FAIL' | 'LOOK';
  detail: string;
}

export function formatReport(version: string, results: Result[]): string {
  const width = Math.max(...results.map(({ id }) => id.length));
  const body = results.map(({ id, title, status, detail }) =>
    `${status}  ${id.padEnd(width)}  ${title}: ${detail}`
  );
  return `${version}\n${body.join('\n')}\n`;
}

export function logErrors(log: string): string[] {
  return log.split('\n').filter((line) => /\b(ERROR|WARN)\b/.test(line) && LOG_PATTERN.test(line));
}

export function wasmArgs(grammar: string, output: string): string[] {
  const src = `tree-sitter/${grammar}/src`;
  return [
    '--target=wasm32-wasip1',
    `--sysroot=${SYSROOT}`,
    '-isystem',
    join(SYSROOT, 'include', 'wasm32-wasi'),
    '-o',
    output,
    '-fPIC',
    '-shared',
    '-Os',
    `-Wl,--export=tree_sitter_${grammar}`,
    '-Wl,--allow-undefined',
    '-Wl,--no-entry',
    '-nostdlib',
    '-fno-exceptions',
    '-fvisibility=hidden',
    '-I',
    src,
    `${src}/parser.c`,
    `${src}/scanner.c`,
  ];
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitFor<T>(what: string, probe: () => T | undefined): Promise<T> {
  const deadline = Date.now() + TIMEOUT;
  while (Date.now() < deadline) {
    const value = probe();
    if (value !== undefined) {
      return value;
    }
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${what}`);
}

function background(command: string, args: string[]): Deno.ChildProcess {
  return new Deno.Command(command, { args, stdin: 'null', stdout: 'null', stderr: 'null' })
    .spawn();
}

function installExtension() {
  ensureDirSync(join(EXTENSION, 'grammars'));
  for (const { grammar } of manifest.languages) {
    runOrThrow('clang', wasmArgs(grammar, join(EXTENSION, 'grammars', `${grammar}.wasm`)));
  }
  copySync(join(ROOT, 'extension.toml'), join(EXTENSION, 'extension.toml'), { overwrite: true });
  copySync(join(ROOT, 'languages'), join(EXTENSION, 'languages'), { overwrite: true });
}

async function savePng(name: string): Promise<string> {
  const raw = join(OUT, `${name}.xwd`);
  runOrThrow('xwd', ['-root', '-display', DISPLAY, '-out', raw]);
  const pnm = new Deno.Command('xwdtopnm', { args: [raw], stderr: 'null' }).outputSync();
  if (!pnm.success) {
    throw new Error(`xwdtopnm failed for ${raw}`);
  }
  const child = new Deno.Command('pnmtopng', { stdin: 'piped', stdout: 'piped', stderr: 'null' })
    .spawn();
  const writer = child.stdin.getWriter();
  await writer.write(pnm.stdout);
  await writer.close();
  const { success, stdout } = await child.output();
  if (!success) {
    throw new Error(`pnmtopng failed for ${raw}`);
  }
  Deno.removeSync(raw);
  Deno.writeFileSync(join(OUT, `${name}.png`), stdout);
  return `${name}.png`;
}

function focusZed() {
  const windows = runOrThrow('xdotool', ['search', '--onlyvisible', '--class', 'zed']).trim().split(
    '\n',
  );
  runOrThrow('xdotool', ['windowfocus', '--sync', windows[0]]);
}

function perform(step: Step) {
  if ('type' in step) {
    runOrThrow('xdotool', ['type', '--delay', '60', '--clearmodifiers', '--', step.type]);
  } else {
    runOrThrow('xdotool', ['key', '--delay', '120', '--clearmodifiers', ...step.keys]);
  }
}

async function runCheck(check: Check): Promise<Result> {
  const file = join(WORK, check.file);
  Deno.writeTextFileSync(file, check.text);
  runOrThrow('zed', [file]);
  await sleep(OPEN_DELAY);
  focusZed();
  for (const step of check.steps) {
    perform(step);
  }
  await sleep(800);
  let result: string | undefined;
  if (check.clipboard) {
    result = await waitFor('the clipboard', () => {
      const { ok, output } = run('xclip', ['-o', '-selection', 'clipboard']);
      return ok ? output : undefined;
    });
  } else if (check.expect !== undefined) {
    perform({ keys: ['ctrl+s'] });
    result = await waitFor(`${check.file} to be saved`, () => {
      const text = Deno.readTextFileSync(file);
      return text === check.text ? undefined : text;
    });
  }
  const shot = await savePng(check.id.padStart(3, '0'));
  if (check.expect === undefined || result === undefined) {
    return { id: check.id, title: check.title, status: 'LOOK', detail: `${check.look} (${shot})` };
  }
  const passed = check.expect(result);
  return {
    id: check.id,
    title: check.title,
    status: passed ? 'PASS' : 'FAIL',
    detail: passed ? `${check.wants} (${shot})` : `got ${JSON.stringify(result)} (${shot})`,
  };
}

async function main() {
  emptyDirSync(OUT);
  ensureDirSync(WORK);
  ensureDirSync(join(HOME, '.config', 'zed'));
  Deno.writeTextFileSync(
    join(HOME, '.config', 'zed', 'settings.json'),
    `${JSON.stringify(SETTINGS, null, 2)}\n`,
  );
  installExtension();
  const version = runOrThrow('zed', ['--version']).split(/\s+/).slice(0, 2).join(' ');

  const display = background('Xvfb', [DISPLAY, '-screen', '0', SCREEN, '-nolisten', 'tcp']);
  await waitFor('the display', () => run('xdotool', ['getdisplaygeometry']).ok || undefined);
  const zed = background('dbus-run-session', ['--', 'zed', '--foreground', WORK]);
  const results: Result[] = [];
  try {
    await waitFor(
      'the Zed window',
      () => run('xdotool', ['search', '--onlyvisible', '--class', 'zed']).ok || undefined,
    );
    await sleep(OPEN_DELAY);
    for (const check of CHECKS) {
      results.push(await runCheck(check));
    }
    const errors = logErrors(Deno.readTextFileSync(LOG));
    results.push({
      id: String(LOG_ROW),
      title: 'Zed log',
      status: errors.length === 0 ? 'PASS' : 'FAIL',
      detail: errors.length === 0
        ? 'no errors about the asm grammars or queries'
        : errors.join(' | '),
    });
    copySync(LOG, join(OUT, 'Zed.log'), { overwrite: true });
  } finally {
    zed.kill('SIGTERM');
    await zed.status;
    display.kill('SIGTERM');
    await display.status;
  }

  const report = formatReport(version, results);
  Deno.writeTextFileSync(join(OUT, 'report.txt'), report);
  console.log(report);
  if (results.some(({ status }) => status === 'FAIL')) {
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
