'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const scriptPath = path.resolve(__dirname, '..', 'HV Monster Manager.js');
const source = fs.readFileSync(scriptPath, 'utf8');

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Missing production function: ${name}`);

  const braceStart = source.indexOf('{', start);
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
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth++;
    if (char === '}' && --depth === 0) return source.slice(start, index + 1);
  }

  throw new Error(`Unterminated production function: ${name}`);
}

function loadFunction(name, dependencies) {
  const names = Object.keys(dependencies);
  const values = Object.values(dependencies);
  return Function(...names, `"use strict"; return (${extractFunction(name)});`)(...values);
}

const attributes = ['STR', 'DEX'];
const queryByAttribute = { STR: 'pa_str', DEX: 'pa_dex' };
const buildNextDraftRequest = loadFunction('buildNextDraftRequest', {
  all: attributes,
  chaosKeys: [],
  chaosByKey: {},
  upgradeQueryByAttr: queryByAttribute,
  encodeURIComponent,
});

const nextRequest = buildNextDraftRequest({
  slot: '139', current: { STR: 5, DEX: 5 }, target: { STR: 20, DEX: 7 },
}, 'crystal');
assert.deepEqual(nextRequest, {
  resource: 'crystal',
  attr: 'STR',
  count: 10,
  slot: '139',
  url: '?s=Bazaar&ss=ml&slot=139',
  data: 'crystal_upgrade=pa_str&crystal_count=10',
});

const rows = [
  {
    querySelector(selector) {
      if (selector === 'td:nth-child(2)') return { textContent: '+12' };
      if (selector === '[onmouseover]') {
        return { getAttribute: () => 'Upgrade With: Crystal of Vigor Cost: 10000 Stock: 12,345' };
      }
      return null;
    },
  },
  {
    querySelector(selector) {
      if (selector === 'td:nth-child(2)') return { textContent: '+13' };
      if (selector === '[onmouseover]') {
        return { getAttribute: () => 'Upgrade With: Crystal of Finesse Cost: 15551 Stock: 6,789' };
      }
      return null;
    },
  },
];
const parseMonsterUpgradeSnapshot = loadFunction('parseMonsterUpgradeSnapshot', {
  all: attributes,
  CHAOS_CONFIGS: [],
  chaosKeys: [],
  $all: (selector, doc) => selector === '#monsterstats_top tr' ? doc.rows : [],
  parseNum: (value) => Number(String(value).replace(/[,+]/g, '')),
});
const snapshot = parseMonsterUpgradeSnapshot({
  rows,
  body: { textContent: 'Insufficient crystals' },
});
assert.deepEqual(snapshot.levels, { STR: 12, DEX: 13 });
assert.deepEqual(snapshot.stocks, { STR: 12345, DEX: 6789 });
assert.equal(snapshot.inventoryComplete, true);
assert.equal(snapshot.insufficientCrystals, true);

const chaosCell = { textContent: 'Lvl 7', querySelector: () => null };
const chaosSnapshotParser = loadFunction('parseMonsterUpgradeSnapshot', {
  all: attributes,
  CHAOS_CONFIGS: [{ key: 'Scavenging', query: 'affect' }],
  chaosKeys: ['Scavenging'],
  $all: (selector, doc) => selector === '#monsterstats_top tr' ? doc.rows
    : selector === '.mcu2' ? [chaosCell] : [],
  parseNum: (value) => Number(String(value).replace(/[,+]/g, '')),
});
const chaosSnapshot = chaosSnapshotParser({
  rows,
  querySelector: () => null,
  body: { textContent: 'Upgrade Cost: 8 Chaos Tokens Stock: 1,234' },
});
assert.deepEqual(chaosSnapshot.chaos, { Scavenging: 7 });
assert.equal(chaosSnapshot.chaosTokens, 1234);

const liveChaosRow = { textContent: '', querySelectorAll: (selector) => selector === '.mcu1' ? Array(16).fill({}) : [] };
const liveChaosParser = loadFunction('parseMonsterUpgradeSnapshot', {
  all: attributes,
  CHAOS_CONFIGS: [{ key: 'Scavenging', query: 'affect' }],
  chaosKeys: ['Scavenging'],
  $all: (selector, doc) => selector === '#monsterstats_top tr' ? doc.rows
    : selector === '#chaosupg td:nth-child(2)' ? [liveChaosRow]
      : selector === '.mcu1' ? liveChaosRow.querySelectorAll(selector) : [],
  parseNum: (value) => Number(String(value).replace(/[,+]/g, '')),
});
const liveChaosSnapshot = liveChaosParser({ rows, body: { textContent: '' } });
assert.deepEqual(liveChaosSnapshot.chaos, { Scavenging: 16 });

const solveExactAboveTarget = loadFunction('solveExact', {
  EPS: 1e-9,
  totalPL: (levels) => levels.pl,
  t: (key, values) => `${key}:${values.current}>${values.target}`,
  formatPL: String,
});
assert.deepEqual(solveExactAboveTarget({ pl: 753 }, 750), {
  ok: false,
  currentPL: 753,
  targetPL: 750,
  message: 'errorTargetBelowCurrent:753>750',
});

const incompleteSnapshot = parseMonsterUpgradeSnapshot({
  rows: rows.slice(0, 1),
  body: { textContent: '' },
});
assert.equal(incompleteSnapshot.levels, null);
assert.equal(incompleteSnapshot.inventoryComplete, false);
assert.equal(incompleteSnapshot.insufficientCrystals, false);

console.log('HV Monster PL Planner live-target tests passed.');
