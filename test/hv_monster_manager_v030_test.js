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

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

assert(source.includes('// @version      0.3.3.0'));

assert(!source.includes('LANGUAGE_STORE_KEY'));
assert(!source.includes('function languageFromChoice('));
assert(!source.includes('function readSavedLanguage('));
assert(source.includes('language: normalizeLanguage(storedState.language)'));

assert(source.includes('labelPriceSource: ["Crystal Market Price", "水晶市场价"]'));
assert(source.includes('labelOrderPriceSource: ["Crystal Buy Price", "水晶收购价"]'));
assert(source.includes('custom: ["Custom", "自定义"]'));
assert(source.includes("const orderPriceSourceValues = [...priceSourceValues, 'custom']"));

assert(source.includes("openWhenCustom: true"));
const plannerControlsSource = extractFunction('renderPlannerControls');
assert(plannerControlsSource.includes("renderPriceSourceSelect('hvmepp-order-source', state.orderPriceSource, orderPriceSourceValues)"));
assert(source.includes("['upgrade', 'hvmepp-run-upgrade', 'buttonRunUpgrade'"));
assert(plannerControlsSource.includes('PLANNER_ACTION_CONFIGS.map'));
assert(plannerControlsSource.includes("document.querySelector('#hvmepp-crystal-section').open = true"));
assert(plannerControlsSource.includes("class: 'hvmepp-top-actions'"));

const renderPlanSource = extractFunction('renderPlan');
assert(!renderPlanSource.includes("renderButton('hvmepp-run-upgrade'"));

const renamePanelSource = extractFunction('renderPanel');
assert(
  renamePanelSource.indexOf('renderMonsterSelection(runtime.monsterList)')
    < renamePanelSource.indexOf('renderMonsterRename(runtime.monsterList)'),
  'monster selection must appear above rename controls'
);
assert(source.includes('headingMonsterRename: ["Rename", "重命名"]'));

assert.match(source, /\.hvmepp-top-actions\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/s);

const customState = { orderPriceSource: 'custom', orderUnitPrices: { STR: 1.23 } };
let customSaved = 0;
let customStatus = '';
const applyOrderPricesFromCache = Function(
  'state',
  'saveState',
  'setStatus',
  't',
  `"use strict"; return (${extractFunction('applyOrderPricesFromCache')});`
)(customState, () => { customSaved++; }, (message) => { customStatus = message; }, (key) => key);
assert.deepEqual(applyOrderPricesFromCache(), { updated: 0, failed: [] });
assert.equal(customState.orderUnitPrices.STR, 1.23, 'custom prices must not be overwritten');
assert.equal(customSaved, 1);
assert.equal(customStatus, 'statusCustomOrderPrices');

assert(!source.includes('for ${available}/${needed} visible batch(es)'));
assert(source.includes('Full spend unavailable'));
assert(source.includes('无法估算完整消耗'));
assert(source.includes('tableEstimatedCost: ["Full Spend Estimate", "完整预估消耗"]'));

const planAskSweep = Function(
  'positiveNumber',
  `"use strict"; return (${extractFunction('planAskSweep')});`
)(positiveNumber);
const partial = planAskSweep(20, 100, [
  { crystals: 1200, batchPrice: 100 },
  { crystals: 300, batchPrice: 150 },
]);
assert.equal(partial.coveredBatches, 15);
assert.equal(partial.remainingBatches, 5);
assert.equal(partial.estimatedCost, 1650);

console.log('HV Monster Manager 0.3.3.0 tests passed.');
