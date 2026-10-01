// SPDX-License-Identifier: MIT

extern int step(int value);
extern void report(const char *text);

static int counter;
int table[4] = {1, 2, 3, 4};

static int twice(int value) {
  return step(value) * 2;
}

int pick(int value) {
  switch (value) {
    case 0:
      return step(10);
    case 1:
      return twice(11);
    case 2:
      report("two");
      return 2;
    case 3:
      return step(13) + 1;
    case 4:
      return twice(14) - 1;
    case 5:
      report("five");
      return 5;
    case 6:
      return step(16) * 3;
    default:
      return 0;
  }
}

int walk(int count) {
  int sum = 0;
  int index;

  for (index = 0; index < count; index++) {
    if (table[index & 3] > counter) {
      sum += step(index);
    } else {
      report("skip");
    }
  }
  counter = sum;
  return sum;
}
