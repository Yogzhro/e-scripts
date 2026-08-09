'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const scriptPath = path.resolve(__dirname, '..', 'HV Monster Manager.js');
const source = fs.readFileSync(scriptPath, 'utf8');

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing production function: ${name}`);
  const braceStart = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = braceStart; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') quote = char;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unterminated production function: ${name}`);
}

const resolveMonsterSelection = Function(
  `"use strict"; return (${extractFunction('resolveMonsterSelection')});`
)();
const filterRenameMappingsBySelection = Function(
  `"use strict"; return (${extractFunction('filterRenameMappingsBySelection')});`
)();
const order = ['50', '12', '100', '75'];

assert.deepEqual(
  resolveMonsterSelection(order, ['50', '75'], '50', { type: 'item', slot: '12' }),
  { selectedSlots: ['12'], anchorSlot: '12' },
  'plain click must replace the selection'
);
assert.deepEqual(
  resolveMonsterSelection(order, ['12'], '12', { type: 'item', slot: '100', ctrlKey: true }),
  { selectedSlots: ['12', '100'], anchorSlot: '100' },
  'Ctrl+click must add an unselected item'
);
assert.deepEqual(
  resolveMonsterSelection(order, ['12', '100'], '100', { type: 'item', slot: '12', ctrlKey: true }),
  { selectedSlots: ['100'], anchorSlot: '12' },
  'Ctrl+click must remove a selected item'
);
assert.deepEqual(
  resolveMonsterSelection(order, ['75'], '50', { type: 'item', slot: '100', shiftKey: true }),
  { selectedSlots: ['50', '12', '100'], anchorSlot: '50' },
  'Shift range must replace the selection and follow visible order inclusively'
);
assert.deepEqual(
  resolveMonsterSelection(order, ['75'], '50', {
    type: 'item', slot: '100', ctrlKey: true, shiftKey: true,
  }),
  { selectedSlots: ['50', '12', '100', '75'], anchorSlot: '50' },
  'Ctrl+Shift range must add to the selection'
);
assert.deepEqual(
  resolveMonsterSelection(order, ['50'], '', { type: 'item', slot: '100', shiftKey: true }),
  { selectedSlots: ['100'], anchorSlot: '100' },
  'Shift without an anchor must start a new single selection'
);
assert.deepEqual(
  resolveMonsterSelection(order, ['12'], '12', { type: 'all' }),
  { selectedSlots: order, anchorSlot: '12' },
  'Ctrl+A action must select every visible item'
);
assert.deepEqual(
  resolveMonsterSelection(order, order, '12', { type: 'clear' }),
  { selectedSlots: [], anchorSlot: '' },
  'blank-space action must clear selection and anchor'
);
assert.deepEqual(
  filterRenameMappingsBySelection([
    { slot: '50', targetName: 'A' },
    { slot: '12', targetName: 'B' },
    { slot: '100', targetName: 'C' },
  ], ['100', '50']),
  [
    { slot: '50', targetName: 'A' },
    { slot: '100', targetName: 'C' },
  ],
  'text mappings must be limited to selected monsters'
);

const renderSource = extractFunction('renderMonsterSelection');
assert(renderSource.includes("role: 'listbox'"));
assert(renderSource.includes("role: 'option'"));
assert(renderSource.includes("'aria-multiselectable': 'true'"));
assert(renderSource.includes("i18nAriaLabel: 'headingMonsterSelection'"));
assert(renderSource.includes("event.ctrlKey && event.key.toLowerCase() === 'a'"));
assert(renderSource.includes("event.target === list"));
assert(!renderSource.includes('addEventListener(\'change\''));
assert(!source.includes('hvmepp-monster-check'));
assert(!source.includes('hvmepp-select-all-monsters'));
assert(!source.includes('hvmepp-clear-monsters'));
assert(!source.includes('buttonSelectAll'));
assert(!source.includes('buttonClearSelection'));
assert(extractFunction('refreshLocalizedText').includes("[data-i18n-aria-label]"));
assert(extractFunction('buildRenamePlan').includes('filterRenameMappingsBySelection'));
assert(extractFunction('getRenamePreviewData').includes('filterRenameMappingsBySelection'));

console.log('HV Monster Manager file-manager selection tests passed.');
