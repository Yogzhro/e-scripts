'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'HV Monster Manager.js'), 'utf8');

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

const getCrystalPlanIssue = Function(
  'getUnknownCrystalRows', 'getCrystalShortages', 'joinList',
  `"use strict"; return (${extractFunction('getCrystalPlanIssue')});`
)(
  (rows) => rows.filter((row) => row.unknown),
  (rows) => rows.filter((row) => row.shortage > 0),
  (values) => values.join(', ')
);
assert.deepEqual(getCrystalPlanIssue([{ label: 'A', unknown: true }]), {
  key: 'statusInventoryPartial', params: { failed: 'A' },
});
assert.deepEqual(getCrystalPlanIssue([{ label: 'B', shortage: 12 }]), {
  key: 'statusCrystalShortage', params: { failed: 'B 12' },
});
assert.equal(getCrystalPlanIssue([{ label: 'C', shortage: 0 }]), null);

const getUpgradeResponseIssue = Function(
  'EPS', 'crystalLabel', 'attrLabel', 'getTargetFailureIssue',
  `"use strict"; return (${extractFunction('getUpgradeResponseIssue')});`
)(
  1e-9,
  (value) => `crystal:${value}`,
  (value) => `attr:${value}`,
  (status, slot, current, target) => ({
    key: status === 'above' ? 'statusUpgradeAboveTarget' : 'statusUpgradeUnreachable',
    params: { slot, current, target },
  })
);
const baseUpgrade = {
  snapshot: { insufficientCrystals: false }, previousPL: 10, updatedPL: 11,
  target: 20, planOk: true, inventoryIssue: null, slot: '199',
  request: { attr: 'STR', count: 1 },
};
assert.equal(getUpgradeResponseIssue(baseUpgrade), null);
assert.equal(getUpgradeResponseIssue({
  ...baseUpgrade, snapshot: { insufficientCrystals: true },
}).key, 'statusCrystalResponseShortage');
assert.equal(getUpgradeResponseIssue({ ...baseUpgrade, updatedPL: 10 }).key, 'statusUpgradeNoProgress');
assert.equal(getUpgradeResponseIssue({ ...baseUpgrade, updatedPL: 21 }).key, 'statusUpgradeAboveTarget');
assert.equal(getUpgradeResponseIssue({ ...baseUpgrade, planOk: false }).key, 'statusUpgradeUnreachable');
assert.deepEqual(getUpgradeResponseIssue({
  ...baseUpgrade, inventoryIssue: { key: 'statusInventoryPartial', params: { failed: 'A' } },
}), { key: 'statusInventoryPartial', params: { failed: 'A' } });

const verifyCrystalOrderResponse = Function(
  `"use strict"; return (${extractFunction('verifyCrystalOrderResponse')});`
)();
const row = { label: 'Crystal A', crystal: 'A', batchSize: 100 };
const before = { inventoryStock: 1000 };
const validOrder = verifyCrystalOrderResponse(
  before,
  { inventoryStock: 1200, currentOrder: { count: 3, price: 50 } },
  row,
  { mode: 'order', submittedBatches: 5, submittedPrice: 50 }
);
assert.deepEqual(validOrder, { matchedBatches: 2, remainingBatches: 3, remainingPrice: 50 });
assert.equal(verifyCrystalOrderResponse(
  before,
  { inventoryStock: 1000, currentOrder: { count: 0, price: 0 } },
  row,
  { mode: 'direct', submittedBatches: 2, submittedPrice: 50 }
).error.code, 'ORDER_NOT_APPLIED');
assert.equal(verifyCrystalOrderResponse(
  before,
  { inventoryStock: 1150, currentOrder: { count: 0, price: 0 } },
  row,
  { mode: 'direct', submittedBatches: 2, submittedPrice: 50 }
).error.key, 'errorOrderResultMismatch');
assert.equal(verifyCrystalOrderResponse(
  before,
  { inventoryStock: 1100, currentOrder: { count: 2, price: 60 } },
  row,
  { mode: 'order', submittedBatches: 3, submittedPrice: 50 }
).error.key, 'errorBuyOrderVerification');

for (const constant of ['PLANNER_ACTION_CONFIGS', 'PLANNER_SECTION_CONFIGS', 'TABLE_HEADER_KEYS']) {
  assert(source.includes(`const ${constant} =`), `missing compact config: ${constant}`);
}
for (const removed of [
  'function parseMonsterLevelsFromDoc(',
  'function parseMonsterList(',
  'function getSelectedLoadedMonsters(',
  'function refreshRuntimeMonsterList(',
  'function refreshMonsterSelectionElements(',
  'function orderNotAppliedError(',
  'function renderCrystalSection(',
  'function renderUpgradeSection(',
  'function renderLogSection(',
]) assert(!source.includes(removed), `thin/redundant function remains: ${removed}`);

assert(source.includes('function syncMonsterSelection('));
assert(source.includes('// @version      0.3.2.0'));
assert(source.split(/\r?\n/).length < 4100, 'production source should be materially compacted');
const css = source.slice(source.indexOf('GM_addStyle(`'), source.indexOf('`);', source.indexOf('GM_addStyle(`')));
assert(css.split(/\r?\n/).length < 170, 'CSS should use compact one-rule formatting');

console.log('HV Monster Manager compaction tests passed.');
