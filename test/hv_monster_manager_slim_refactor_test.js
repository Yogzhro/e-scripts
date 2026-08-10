'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'HV Monster Manager.js'), 'utf8');
const lines = source.split(/\r?\n/).length;

function extractBlock(startText, endText) {
  const start = source.indexOf(startText);
  assert.notEqual(start, -1, `missing block start: ${startText}`);
  const end = source.indexOf(endText, start);
  assert.notEqual(end, -1, `missing block end: ${endText}`);
  return source.slice(start, end);
}

assert(source.includes('// @version      0.3.3.0'));
assert(source.includes("const ADDON_VERSION = '0.3.3.0'"));
assert(lines <= 3700, `production script should stay <= 3700 lines with the shared cache, got ${lines}`);

const stateBlock = extractBlock('  const state = {', '\n  };');
for (const staleKey of ['monsterCache', 'lastMonsterSlot', 'priceCache', 'prices']) {
  assert(!stateBlock.includes(staleKey), `${staleKey} must not be persisted`);
}
assert(!source.includes('storedPriceCache'));
assert(!source.includes('normalizedMonsterCache'));
assert(!source.includes('runtime.currentLevels'));
assert(!source.includes('runtime.calculationPending'));

assert(source.includes('const translations = {'));
assert(source.includes('const languageIndex ='));
assert(!source.includes('    en: {'));
assert(!source.includes("    'zh-CN': {"));

for (const removedFunction of [
  'gmGet',
  'gmSet',
  'readTranslation',
  'clearCurrentPlan',
  'invalidateCurrentPlan',
  'clearScheduledCalculation',
  'setLevels',
  'updateCurrentPL',
  'rebuildLastPlan',
  'persistMarketPriceCache',
  'refreshPriceSourceOptions',
  'renderSingleMonsterResult',
  'replacePlanContent',
  'waitForHvutHost',
  'waitForHvutElement',
  'requiredTradeBatches',
  'estimateOrderBookPurchase',
  'downloadTextFile',
  'findPowerLevelCalculatorButton',
  'renderPlannerPanel',
  'renderRenamePanel',
  'writeHvutPrices',
  'applyMonsterSelection',
  'refreshMonsterSelectionSummary',
]) {
  assert(!source.includes(`function ${removedFunction}(`), `${removedFunction} should be removed or inlined`);
}

// Core safety and user-visible features must survive the refactor.
for (const required of [
  'function solveExact(',
  'function getUpgradeResponseIssue(',
  'async function executeBatchUpgradePlan(',
  'async function executeCrystalPurchase(',
  'async function executeBatchRename(',
  'if (text === \'state lock limiter in effect\')',
  'Math.min(10,',
  'parseMonsterUpgradeSnapshot(htmlToDoc(html))',
  'buildBatchPlan(currentRecords, target)',
  "['direct', 'hvmepp-direct-buy'",
  "['order', 'hvmepp-place-buy-orders'",
]) {
  assert(source.includes(required), `missing retained behavior/safety marker: ${required}`);
}
assert(source.includes('const HVUT_REQUEST_INTERVAL_MS = 300'));
assert(source.includes('const HVUT_MAX_CONNECTIONS = 4'));

console.log('HV Monster Manager slim refactor tests passed.');
