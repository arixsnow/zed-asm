// SPDX-License-Identifier: MIT

const ROLES = [
  { name: 'first_label', labels: [1] },
  { name: 'first_two_labels', labels: [1, 2] },
  { name: 'second_label', labels: [2] },
  { name: 'label_after_optional_first', labels: [2], optional: 1 },
  { name: 'third_label', labels: [3] },
  { name: 'label_after_optional_second', labels: [3], optional: 2 },
  { name: 'labels_then_condition', labels: [1, 2, 3], conditions: [4] },
  { name: 'first_condition', conditions: [1] },
  { name: 'second_condition', conditions: [2] },
  { name: 'third_condition', conditions: [3] },
  { name: 'fourth_condition', conditions: [4] },
  { name: 'first_system', systems: [1] },
  { name: 'second_system', systems: [2] },
  { name: 'third_system', systems: [3] },
  { name: 'second_and_third_system', systems: [2, 3] },
  { name: 'third_and_fourth_system', systems: [3, 4] },
  { name: 'second_to_fourth_system', systems: [2, 3, 4] },
  { name: 'third_to_fifth_system', systems: [3, 4, 5] },
];

const INSTRUCTION_TOKENS = [
  '_instruction_name',
  '_flags_instruction',
  ...ROLES.map(({ name }) => `_${name}_instruction`),
];

module.exports = { ROLES, INSTRUCTION_TOKENS };
