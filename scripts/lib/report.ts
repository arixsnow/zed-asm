// SPDX-License-Identifier: MIT

export class Report {
  #failures = 0;

  record(label: string, passed: boolean, output = ''): void {
    if (passed) {
      console.log(`ok   ${label}`);
      return;
    }
    this.#failures += 1;
    const details = output.trim();
    console.error(`FAIL ${label}${details === '' ? '' : `\n${details}`}\n`);
  }

  finish(success: string, checks: string): number {
    if (this.#failures > 0) {
      console.error(`${this.#failures} ${checks} failed`);
      return 1;
    }
    console.log(`ok   ${success}`);
    return 0;
  }
}

export function usage(script: string, args: string[]): number | undefined {
  if (args.length === 0) {
    return undefined;
  }
  console.error(`usage: ${script}`);
  return 2;
}
