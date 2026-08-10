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

assert(source.includes('// @version      0.3.3.0'));
assert(source.includes('HV Utils 4.2.4 add-on'));
assert(source.includes("const ADDON_VERSION = '0.3.3.0'"));
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

const estimateLiveRequests = loadFunction('estimateLiveRequests', {
  all: ['STR', 'DEX'],
});
assert.deepEqual(estimateLiveRequests({
  results: [{ agg: { STR: { k: 15 }, DEX: { k: 2 } } }],
}), { requests: 3, levels: 17 });

const parseHvutUpgradeRow = loadFunction('parseHvutUpgradeRow', {
  all: ['STR', 'DEX', 'AGI', 'END', 'INT', 'WIS', 'FIRE', 'COLD', 'ELEC', 'WIND', 'HOLY', 'DARK'],
  parseNum: (value) => Number(String(value).replace(/[^\d.-]/g, '')),
  normalizeMonsterLevels: (levels) => levels,
});

function cell(text, changed = false) {
  return {
    textContent: String(text),
    classList: { contains: (name) => name === 'hvut-ml-up-change' && changed },
  };
}

const cells = Array.from({ length: 35 }, () => cell(''));
cells[0] = cell('199');
cells[1] = cell('Test Monster');
cells[2] = cell('Arthropod');
cells[3] = cell('PL 741');
[10, 11, 12, 13, 14, 15].forEach((value, index) => { cells[8 + index] = cell(value); });
[20, 21, 22, 23, 24, 25].forEach((value, index) => { cells[16 + index] = cell(value); });
assert.deepEqual(parseHvutUpgradeRow({ cells }), {
  slot: '199',
  name: 'Test Monster',
  className: 'Arthropod',
  pl: 741,
  levels: {
    STR: 10, DEX: 11, AGI: 12, END: 13, INT: 14, WIS: 15,
    FIRE: 20, COLD: 21, ELEC: 22, WIND: 23, HOLY: 24, DARK: 25,
  },
});

cells[8] = cell(12, true);
assert.equal(parseHvutUpgradeRow({ cells }), null, 'saved HV Utils targets must not be mistaken for live levels');

const parseHvutCrystalStock = loadFunction('parseHvutCrystalStock', {
  all: ['STR', 'DEX', 'AGI', 'END', 'INT', 'WIS', 'FIRE', 'COLD', 'ELEC', 'WIND', 'HOLY', 'DARK'],
  HVUT: { crystalRows: '.hvut-ml-up-crystal li' },
  $all: (_selector, doc) => doc.rows,
  parseNum: (value) => Number(String(value).replace(/[^\d.-]/g, '')),
});
const stockRows = Array.from({ length: 12 }, (_, index) => ({
  querySelectorAll: () => [
    { textContent: `Crystal ${index}` },
    { textContent: '0' },
    { textContent: '+0' },
    { textContent: `(${(index + 1) * 1000})` },
  ],
}));
assert.deepEqual(parseHvutCrystalStock({ rows: stockRows }), {
  STR: 1000, DEX: 2000, AGI: 3000, END: 4000, INT: 5000, WIS: 6000,
  FIRE: 7000, COLD: 8000, ELEC: 9000, WIND: 10000, HOLY: 11000, DARK: 12000,
});
assert.equal(parseHvutCrystalStock({ rows: stockRows.slice(0, 11) }), null);

const refreshMarketSnapshotSource = extractFunction('refreshMarketSnapshot');
assert(refreshMarketSnapshotSource.includes("localStorage.setItem('hvut_prices'"));
assert(!refreshMarketSnapshotSource.includes('GM_setValue'));

const loadSelectedMonstersSource = extractFunction('loadSelectedMonsters');
assert(loadSelectedMonstersSource.includes('readHvutUpgradeSnapshot'));
assert(loadSelectedMonstersSource.includes('fetchMonsterLevels'));
assert(source.includes('function markHvutStateStale()'));
assert(extractFunction('executeBatchUpgradePlan').includes('markHvutStateStale()'));
assert(extractFunction('requestMonsterRename').includes('markHvutStateStale()'));

console.log('HV Monster Manager HV Utils add-on architecture tests passed.');
