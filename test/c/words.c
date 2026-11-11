// SPDX-License-Identifier: MIT

#include <stddef.h>
#include <stdio.h>
#include <string.h>

#include "../../tree-sitter/common/scanner.h"
#include "../../tree-sitter/common/words.h"

enum {
  LOOKUP_FAILED = 1,
  REPORT_FAILED = 2,
};

static int failed(const char *word, const char *problem) {
  return fputs(word, stderr) < 0 || fputs(problem, stderr) < 0 ? REPORT_FAILED : LOOKUP_FAILED;
}

int main(void) {
  char probe[STATEMENT_WORD_CAPACITY + 1] = {0};
  const char *name = NULL;
  size_t index = 0;
  size_t length = 0;
  int status = 0;

  if (word_entry("") != NULL) {
    status = failed("the empty word", " has an entry\n");
  }
  while (index < WORD_COUNT) {
    name = WORDS[index].name;
    if (word_entry(name) != &WORDS[index]) {
      status = failed(name, " is not found at its own entry\n");
    }
    length = strlen(name);
    copy_leading(probe, name, length);
    probe[length] = '\x7f';
    probe[length + 1] = '\0';
    if (word_entry(probe) != NULL) {
      status = failed(name, " followed by a character no word holds has an entry\n");
    }
    index++;
  }
  return status;
}
