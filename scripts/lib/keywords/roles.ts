// SPDX-License-Identifier: MIT

import { createRequire } from 'node:module';

interface RoleShape {
    name: string;
    labels?: number[];
    conditions?: number[];
    systems?: number[];
    optional?: number;
}

const { ROLES } = createRequire(import.meta.url)('../../../tree-sitter/common/roles.js') as {
    ROLES: RoleShape[];
};

export const GENERIC_ROLE = 'INSTRUCTION_NAME';
export const FLAGS_ROLE = 'FLAGS_INSTRUCTION';

export class Signatures {
    readonly #signatures = new Map<string, Set<string>>();

    add(name: string, signature: string): void {
        if (!/^[LCSOlcso]*$/.test(signature)) {
            throw new Error(
                `operand signature "${signature}" of "${name}" is not made of L, C, S and O`,
            );
        }
        if (!/[LCSlcs]/.test(signature)) {
            return;
        }
        const head = name.split('.')[0];
        const known = this.#signatures.get(head) ?? new Set<string>();
        known.add(signature);
        this.#signatures.set(head, known);
    }

    addAll(other: Signatures): void {
        for (const [name, signatures] of other.entries()) {
            for (const signature of signatures) {
                this.add(name, signature);
            }
        }
    }

    get(name: string): Set<string> | undefined {
        return this.#signatures.get(name.split('.')[0]);
    }

    entries(): [string, Set<string>][] {
        return [...this.#signatures];
    }
}

function same(left: number[], right: number[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

function shapeOf(signatures: Set<string>): Required<Omit<RoleShape, 'name' | 'optional'>> & {
    optional?: number;
} {
    const slots = { L: new Set<number>(), C: new Set<number>(), S: new Set<number>() };
    let optional: number | undefined;
    for (const signature of signatures) {
        const kinds = [...signature].map((slot) => slot.toUpperCase());
        const firstLabel = kinds.indexOf('L');
        kinds.forEach((kind, index) => {
            if (kind === 'L' || kind === 'C' || kind === 'S') {
                slots[kind].add(index + 1);
            }
        });
        const before = [...signature].findIndex((slot, index) =>
            slot === 'o' && index < firstLabel
        );
        if (firstLabel !== -1 && before !== -1) {
            optional = Math.min(optional ?? before + 1, before + 1);
        }
    }
    const sorted = (set: Set<number>) => [...set].sort((a, b) => a - b);
    return {
        labels: sorted(slots.L),
        conditions: sorted(slots.C),
        systems: sorted(slots.S),
        optional,
    };
}

export function armRole(name: string, signatures: Set<string> | undefined): string {
    if (signatures === undefined) {
        return GENERIC_ROLE;
    }
    const shape = shapeOf(signatures);
    const role = ROLES.find((candidate) =>
        same(candidate.labels ?? [], shape.labels) &&
        same(candidate.conditions ?? [], shape.conditions) &&
        same(candidate.systems ?? [], shape.systems) &&
        candidate.optional === shape.optional
    );
    if (role === undefined) {
        throw new Error(
            `"${name}" has operand signatures ${
                [...signatures].join(', ')
            }, which fit no role in roles.js`,
        );
    }
    return `${role.name.toUpperCase()}_INSTRUCTION`;
}
