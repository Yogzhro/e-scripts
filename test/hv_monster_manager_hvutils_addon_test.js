'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const scriptPath = path.resolve(__dirname, '..', 'HV Monster Manager.js');
const source = fs.readFileSync(scriptPath, 'utf8');

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing production function: ${name}`);
  const parenStart = source.indexOf('(', start);
  let parenDepth = 0;
  let parenEnd = -1;
  for (let index = parenStart; index < source.length; index++) {
    if (source[index] === '(') parenDepth++;
    else if (source[index] === ')' && --parenDepth === 0) {
      parenEnd = index;
      break;
    }
  }
  assert.notEqual(parenEnd, -1, `unterminated production signature: ${name}`);
  const braceStart = source.indexOf('{', parenEnd);
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

function loadFunction(name, dependencies = {}) {
  return Function(
    ...Object.keys(dependencies),
    `"use strict"; return (${extractFunction(name)});`
  )(...Object.values(dependencies));
}

assert(source.includes('// @version      0.3.5.0'));
assert(source.includes('HV Utils 4.2.4 add-on'));
assert(source.includes("const ADDON_VERSION = '0.3.5.0'"));
assert(source.includes("const HVUT_REQUIRED_VERSION = '4.2.4'"));
assert(source.includes('const HVUT_REQUEST_INTERVAL_MS = 300'));
assert(source.includes('const HVUT_MAX_CONNECTIONS = 4'));
assert(extractFunction('fetchText').includes('hvutNextRequestAt'));
assert(source.includes("side: '.hvut-ml-side'"));
assert(source.includes("upgraderButton: '#hvut-ml-up-button'"));
assert(source.includes("upgraderTable: '.hvut-ml-up-table'"));
assert(source.includes("mainpane: '#mainpane'"));

assert(!source.includes('hvmepp-side-fallback'));
assert(!source.includes('getOrCreateEntrySide'));
assert(!source.includes('clampFallbackSide'));
assert(!source.includes("id: 'hvmepp-overlay'"));
assert(source.includes("class: 'hvut-ml-up hvmepp-panel'"));
assert(!source.includes('function buildUpgradeRequests('));
assert(source.includes('function waitForDom('));
assert(source.includes("t('errorHvutRequired'"));

const parseHvutMonsterList = loadFunction('parseHvutMonsterList', {
  HVUT: { slotRows: '#slot_pane > div.msl' },
  $all: (_selector, doc) => doc.rows,
  parseNum: (value) => Number(String(value).replace(/[^\d.-]/g, '')),
  t: (_key, { slot }) => `Monster ${slot}`,
});
const listRows = [{
  children: [
    { textContent: '199' },
    { textContent: 'Test Monster' },
    { textContent: '741' },
    { textContent: 'Arthropod' },
  ],
}];
assert.deepEqual(parseHvutMonsterList({ rows: listRows }).map(({ row, ...record }) => record), [{
  index: '199',
  name: 'Test Monster',
  pl: 741,
  className: 'Arthropod',
}]);
assert(source.includes('runtime.monsterList = parseHvutMonsterList()'));

assert(source.includes('const DRAFT_MAX_CONNECTIONS = 5'));
const loadSelectedDraftsSource = extractFunction('loadSelectedDrafts');
assert(loadSelectedDraftsSource.includes('fetchMonsterSnapshot'));
assert(loadSelectedDraftsSource.includes('DRAFT_MAX_CONNECTIONS'));
assert(!source.includes('function readHvutUpgradeSnapshot('));

const refreshMarketSnapshotSource = extractFunction('refreshMarketSnapshot');
assert(refreshMarketSnapshotSource.includes("localStorage.setItem('hvut_prices'"));
assert(!refreshMarketSnapshotSource.includes('GM_setValue'));

assert(source.includes('function markHvutStateStale()'));
assert(extractFunction('executeBatchUpgradePlan').includes('markHvutStateStale()'));
assert(extractFunction('requestMonsterRename').includes('markHvutStateStale()'));

console.log('HV Monster Manager HV Utils add-on architecture tests passed.');
