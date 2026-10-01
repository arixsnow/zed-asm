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

export type Step = { type: string } | { keys: string[] } | { pause: number };

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
  vim?: boolean;
  expect?: (result: string) => boolean;
}

const lines = (text: string) => text.split('\n');
const OPENERS = ['[', '(', '{', '"', "'", '/*'];
const AUTOCLOSE: Step[] = OPENERS.flatMap((opener, index) =>
  index === 0 ? [{ type: opener }] : [{ keys: ['End'] }, { type: ` ${opener}` }]
);
const FUNCTIONS = [
  'main:',
  '    mov x0, x1',
  '.Lloop:',
  '    subs x0, x0, #1',
  '    b.ne .Lloop',
  '    ret',
  'helper:',
  '    ret',
  '',
].join('\n');
const MACRO = '    .macro m a\n    nop\n    .endm\n    nop\n';

function pickInOutline(query: string): Step[] {
  return [
    { keys: ['ctrl+shift+o'] },
    { pause: 800 },
    { type: query },
    { pause: 500 },
    { keys: ['Return'] },
    { pause: 500 },
    { keys: ['Escape'] },
    { type: 'X' },
  ];
}

function typeLines(...typed: string[]): Step[] {
  return typed.flatMap((text, index) =>
    index === 0 ? [{ type: text }] : [{ keys: ['Return'] }, { type: text }]
  );
}

export const CHECKS: Check[] = [
  {
    id: '1',
    row: 1,
    title: 'Opening a .s file',
    file: 'c01.s',
    text: '    mov x0, x1\n',
    steps: [],
    look: 'the status bar shows Assembly',
  },
  {
    id: '2',
    row: 2,
    title: 'Opening a .asm file',
    file: 'c02.asm',
    text: '    mov eax, 1\n',
    steps: [],
    look: 'the status bar shows x86 Assembly (NASM)',
  },
  {
    id: '3',
    row: 3,
    title: 'Opening a .s file with an ARM modeline',
    file: 'c03.s',
    text: '// vim: ft=arm\n    mov x0, x1\n',
    steps: [],
    look: 'the status bar shows ARM Assembly',
  },
  {
    id: '4',
    row: 4,
    title: 'Typing lsl #32 before a // comment',
    file: 'c04.s',
    text: '',
    steps: [{ type: '    add x0, x1, x2, lsl #32 // comment' }],
    look: '#32 has the number color; only // comment has the comment color',
  },
  {
    id: '5',
    row: 5,
    title: 'Enter after /*',
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
    title: 'Enter after ; note in x86 (NASM)',
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
    title: 'Toggling a comment',
    file: 'c08.s',
    text: 'mov x0, x1',
    steps: [{ keys: ['ctrl+slash'] }],
    wants: '"// " is added',
    expect: (text) => text === '// mov x0, x1',
  },
  {
    id: '8b',
    row: 8,
    title: 'Toggling a comment in x86 (NASM)',
    file: 'c08.asm',
    text: 'mov eax, 1',
    steps: [{ keys: ['ctrl+slash'] }],
    wants: '"; " is added',
    expect: (text) => text === '; mov eax, 1',
  },
  {
    id: '8c',
    row: 8,
    title: 'Toggling a comment in x86 (GAS)',
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
    title: 'Typing loop: on an indented line',
    file: 'c12.s',
    text: '',
    steps: [{ type: 'main:' }, { keys: ['Return'] }, { type: 'loop:' }],
    wants: 'the label moves back to column 0',
    expect: (text) => text === 'main:\nloop:',
  },
  {
    id: '13a',
    row: 13,
    title: 'Typing brackets, quotes and /* in code',
    file: 'c13.s',
    text: '',
    steps: AUTOCLOSE,
    wants: 'all of them close',
    expect: (text) => text === '[] () {} "" \'\' /* */',
  },
  {
    id: '13b',
    row: 13,
    title: 'Typing brackets, quotes and /* in a comment',
    file: 'c13b.s',
    text: '// \nnop\n',
    steps: [{ keys: ['ctrl+Home', 'End'] }, ...AUTOCLOSE],
    wants: 'brackets and " close, \' and /* do not',
    expect: (text) => text === '// [] () {} "" \' /*\nnop\n',
  },
  {
    id: '14',
    row: 14,
    title: 'Typing ( before .Lend',
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
  {
    id: '17a',
    row: 17,
    title: 'Picking a global label in the outline',
    file: 'c17a.s',
    text: FUNCTIONS,
    steps: pickInOutline('helper'),
    wants: 'the cursor jumps to helper:',
    expect: (text) => lines(text)[6] === 'Xhelper:',
  },
  {
    id: '17b',
    row: 17,
    title: 'Picking a nested local label in the outline',
    file: 'c17b.s',
    text: FUNCTIONS,
    steps: pickInOutline('Lloop'),
    wants: 'the cursor jumps to .Lloop:',
    expect: (text) => lines(text)[2] === 'X.Lloop:',
  },
  {
    id: '18',
    row: 18,
    title: 'Looking for a section in the outline',
    file: 'c18.s',
    text: '    .text\n    .globl main\nmain:\n    ret\n    .data\nvalue:\n    .byte 1\n',
    steps: [{ keys: ['ctrl+End'] }, ...pickInOutline('text')],
    wants: 'no entry matches text, so the cursor stays at the end',
    expect: (text) =>
      text === '    .text\n    .globl main\nmain:\n    ret\n    .data\nvalue:\n    .byte 1\nX',
  },
  {
    id: '19',
    row: 19,
    title: 'Putting the cursor on a nested local label',
    file: 'c19.s',
    text: FUNCTIONS,
    steps: [{ keys: ['ctrl+Home', 'Down', 'Down'] }],
    look: 'the breadcrumbs show main and .Lloop',
  },
  {
    id: '20a',
    row: 20,
    title: 'Typing a macro',
    file: 'c20a.s',
    text: '',
    steps: typeLines('.macro m', 'nop', '.endm'),
    wants: 'the body is indented and .endm lines up with .macro',
    expect: (text) => text === '.macro m\n    nop\n.endm',
  },
  {
    id: '20b',
    row: 20,
    title: 'Typing nested conditionals',
    file: 'c20b.s',
    text: '',
    steps: typeLines('.if A', '.if B', 'nop', '.endif', '.else', 'nop', '.endif'),
    wants: 'each body is indented and each clause and closer lines up with its .if',
    expect: (text) => text === '.if A\n    .if B\n        nop\n    .endif\n.else\n    nop\n.endif',
  },
  {
    id: '20c',
    row: 20,
    title: 'Typing a repeat block',
    file: 'c20c.s',
    text: '',
    steps: typeLines('.rept 3', 'nop', '.endr'),
    wants: 'the body is indented and .endr lines up with .rept',
    expect: (text) => text === '.rept 3\n    nop\n.endr',
  },
  {
    id: '21',
    row: 21,
    title: 'Typing .text on an indented line',
    file: 'c21.s',
    text: '',
    steps: typeLines('main:', '.text'),
    wants: '.text stays where it was typed',
    expect: (text) => text === 'main:\n    .text',
  },
  {
    id: '22',
    row: 22,
    title: 'Opening an #if condition in a .S file',
    file: 'c22.S',
    text: '#if defined(SAVE) && LEVEL > 1\n    nop\n#endif\n',
    steps: [],
    look: 'defined, && and > 1 in the condition have the C colors',
  },
  {
    id: '23',
    row: 23,
    title: 'Typing . as the last line of an open macro, with no newline after it',
    file: 'c23.s',
    text: '.macro m\n    nop\n',
    steps: [{ keys: ['ctrl+End'] }, { type: '.' }, ...pickInOutline('m')],
    wants: 'the outline still lists m and the cursor jumps to it',
    expect: (text) => text.startsWith('X.macro m\n'),
  },
  {
    id: '24a',
    row: 24,
    title: 'Yanking vaf in vim mode',
    file: 'c24a.s',
    text: FUNCTIONS,
    steps: [{ keys: ['ctrl+Home', 'Down', 'Down', 'Down'] }, { type: 'vafy' }],
    clipboard: true,
    vim: true,
    wants: 'the whole function, from main: to its ret',
    expect: (text) => text === FUNCTIONS.split('helper:')[0],
  },
  {
    id: '24b',
    row: 24,
    title: 'Yanking vif in vim mode',
    file: 'c24b.s',
    text: FUNCTIONS,
    steps: [{ keys: ['ctrl+Home', 'Down', 'Down', 'Down'] }, { type: 'vify' }],
    clipboard: true,
    vim: true,
    wants: 'the body without the label',
    expect: (text) => text === 'mov x0, x1\n.Lloop:\n    subs x0, x0, #1\n    b.ne .Lloop\n    ret',
  },
  {
    id: '24c',
    row: 24,
    title: 'Yanking vac in vim mode',
    file: 'c24c.s',
    text: MACRO,
    steps: [{ keys: ['ctrl+Home', 'Down'] }, { type: 'vacy' }],
    clipboard: true,
    vim: true,
    wants: 'the whole macro, from .macro to .endm',
    expect: (text) => text === '    .macro m a\n    nop\n    .endm\n',
  },
];

export const LOG_ROW = 25;
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

async function perform(step: Step) {
  if ('pause' in step) {
    await sleep(step.pause);
  } else if ('type' in step) {
    runOrThrow('xdotool', ['type', '--delay', '60', '--clearmodifiers', '--', step.type]);
  } else {
    runOrThrow('xdotool', ['key', '--delay', '120', '--clearmodifiers', ...step.keys]);
  }
}

function clipboard(): string | undefined {
  const { ok, output } = run('xclip', ['-o', '-selection', 'clipboard']);
  return ok ? output : undefined;
}

async function changedClipboard(before: string | undefined): Promise<string | undefined> {
  const deadline = Date.now() + TIMEOUT;
  let current = clipboard();
  while (current === before && Date.now() < deadline) {
    await sleep(100);
    current = clipboard();
  }
  return current;
}

function writeSettings(settings: Record<string, unknown>) {
  Deno.writeTextFileSync(
    join(HOME, '.config', 'zed', 'settings.json'),
    `${JSON.stringify(settings, null, 2)}\n`,
  );
}

async function runCheck(check: Check): Promise<Result> {
  const file = join(WORK, check.file);
  Deno.writeTextFileSync(file, check.text);
  runOrThrow('zed', [file]);
  await sleep(OPEN_DELAY);
  focusZed();
  const before = check.clipboard ? clipboard() : undefined;
  for (const step of check.steps) {
    await perform(step);
  }
  await sleep(800);
  let result: string | undefined;
  if (check.clipboard) {
    result = await changedClipboard(before);
  } else if (check.expect !== undefined) {
    perform({ keys: ['ctrl+s'] });
    result = await waitFor(`${check.file} to be saved`, () => {
      const text = Deno.readTextFileSync(file);
      return text === check.text ? undefined : text;
    });
  }
  const shot = await savePng(check.id.padStart(3, '0'));
  if (check.expect !== undefined && result === undefined) {
    return { id: check.id, title: check.title, status: 'FAIL', detail: `no result (${shot})` };
  }
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
  writeSettings(SETTINGS);
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
    let vim = false;
    for (const check of CHECKS) {
      if (check.vim === true && !vim) {
        writeSettings({ ...SETTINGS, vim_mode: true });
        await sleep(OPEN_DELAY);
        vim = true;
      }
      results.push(await runCheck(check));
    }
    const errors = logErrors(Deno.readTextFileSync(LOG));
    results.push({
      id: String(LOG_ROW),
      title: 'Reading the Zed log',
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
