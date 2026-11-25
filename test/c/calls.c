// SPDX-License-Identifier: MIT

#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

#include "../../tree-sitter/common/scanner.h"

#define LANGUAGE ASM_CONCAT(tree_sitter_, ASM_GRAMMAR_NAME)

const TSLanguage *LANGUAGE(void);

enum Crossing {
    CROSS_OPENER,
    CROSS_ALL_BUT_CLOSER,
};

struct Walk {
    const TSLanguage *language;
    TSSymbol openers[3];
    TSSymbol closers[2];
    bool *inside;
    TSStateId *queue;
    uint32_t head;
    uint32_t tail;
};

static bool member(TSSymbol symbol, const TSSymbol *symbols, size_t count)
{
    size_t index = 0;

    while (index < count) {
        if (symbols[index] == symbol) {
            return true;
        }
        index++;
    }
    return false;
}

static bool crosses(const struct Walk *walk, TSSymbol symbol, enum Crossing crossing)
{
    if (crossing == CROSS_OPENER) {
        return member(symbol, walk->openers, sizeof(walk->openers) / sizeof(walk->openers[0]));
    }
    return !member(symbol, walk->closers, sizeof(walk->closers) / sizeof(walk->closers[0]));
}

static void reach(struct Walk *walk, TSStateId state)
{
    if (state == 0 || walk->inside[state]) {
        return;
    }
    walk->inside[state] = true;
    walk->queue[walk->tail] = state;
    walk->tail++;
}

static void take(struct Walk *walk, TSSymbol symbol, uint16_t value)
{
    const TSParseActionEntry *entry = &walk->language->parse_actions[value];
    uint8_t index = 0;

    if (symbol >= walk->language->token_count) {
        reach(walk, value);
        return;
    }
    while (index < entry->entry.count) {
        index++;
        if (entry[index].action.type == TSParseActionTypeShift
            && !entry[index].action.shift.extra) {
            reach(walk, entry[index].action.shift.state);
        }
    }
}

static void follow(struct Walk *walk, TSStateId state, enum Crossing crossing)
{
    const TSLanguage *language = walk->language;
    const uint16_t *data = NULL;
    TSSymbol symbol = 0;
    uint16_t groups = 0;
    uint16_t count = 0;
    uint16_t value = 0;

    if (state < language->large_state_count) {
        for (symbol = 0; symbol < language->symbol_count; symbol++) {
            value = language->parse_table[(size_t)state * language->symbol_count + symbol];
            if (value != 0 && crosses(walk, symbol, crossing)) {
                take(walk, symbol, value);
            }
        }
        return;
    }
    data = &language->small_parse_table[language
            ->small_parse_table_map[state - language->large_state_count]];
    groups = *data++;
    while (groups > 0) {
        value = *data++;
        count = *data++;
        while (count > 0) {
            symbol = *data++;
            if (crosses(walk, symbol, crossing)) {
                take(walk, symbol, value);
            }
            count--;
        }
        groups--;
    }
}

static int resets_inside(const struct Walk *walk)
{
    const TSLanguage *language = walk->language;
    const bool *valid = NULL;
    uint32_t index = 0;
    uint32_t token = 0;
    int status = EXIT_SUCCESS;

    while (index < walk->tail) {
        valid = &language->external_scanner
                     .states[(size_t)language->lex_modes[walk->queue[index]].external_lex_state
                         * language->external_token_count];
        for (token = 0; token < language->external_token_count; token++) {
            if (valid[token] && top_level_token((TSSymbol)token)) {
                printf("parse state %u inside a call accepts %s\n", (unsigned)walk->queue[index],
                    language->symbol_names[language->external_scanner.symbol_map[token]]);
                status = EXIT_FAILURE;
            }
        }
        index++;
    }
    return status;
}

int main(void)
{
    const TSLanguage *language = LANGUAGE();
    const TSSymbol *map = language->external_scanner.symbol_map;
    struct Walk walk = {
        .language = language,
        .openers = {map[CALL_ARGUMENTS], map[STATEMENT_CALL], map[CALL_MNEMONIC]},
        .closers = {map[CALL_CLOSE], map[UNCLOSED_CALL]},
        .inside = calloc(language->state_count, sizeof(*walk.inside)),
        .queue = calloc(language->state_count, sizeof(*walk.queue)),
    };
    TSStateId state = 0;
    int status = EXIT_FAILURE;

    if (walk.inside == NULL || walk.queue == NULL) {
        fputs("out of memory\n", stderr);
    } else {
        for (state = 1; state < language->state_count; state++) {
            follow(&walk, state, CROSS_OPENER);
        }
        if (walk.tail == 0) {
            fputs("no parse state opens a call\n", stderr);
        } else {
            while (walk.head < walk.tail) {
                follow(&walk, walk.queue[walk.head], CROSS_ALL_BUT_CLOSER);
                walk.head++;
            }
            status = resets_inside(&walk);
        }
    }
    free(walk.inside);
    free(walk.queue);
    return status;
}
