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
const buildNextUpgradeRequest = loadFunction('buildNextUpgradeRequest', {
  all: attributes,
  upgradeQueryByAttr: queryByAttribute,
  encodeURIComponent,
});

const nextRequest = buildNextUpgradeRequest({
  agg: {
    STR: { k: 15 },
    DEX: { k: 2 },
  },
}, '139');
assert.deepEqual(nextRequest, {
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

const getLiveTargetState = loadFunction('getLiveTargetState', {
  EPS: 1e-9,
  totalPL: (levels) => levels.pl,
  solveExact: (levels, target) => levels.unreachable
    ? { ok: false, message: 'unreachable' }
    : {
        ok: true,
        agg: { STR: { k: target - levels.pl }, DEX: { k: 0 } },
      },
  buildNextUpgradeRequest,
});

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

assert.equal(getLiveTargetState({ pl: 750 }, 750, '139').status, 'reached');
assert.equal(getLiveTargetState({ pl: 753 }, 750, '139').status, 'above');
assert.equal(getLiveTargetState({ pl: 749, unreachable: true }, 750, '139').status, 'unreachable');
assert.deepEqual(getLiveTargetState({ pl: 735 }, 750, '139'), {
  status: 'ready',
  currentPL: 735,
  plan: {
    ok: true,
    agg: { STR: { k: 15 }, DEX: { k: 0 } },
  },
  request: {
    attr: 'STR',
    count: 10,
    slot: '139',
    url: '?s=Bazaar&ss=ml&slot=139',
    data: 'crystal_upgrade=pa_str&crystal_count=10',
  },
});

const afterFirstResponse = getLiveTargetState({ pl: 745 }, 750, '139');
assert.equal(afterFirstResponse.status, 'ready');
assert.equal(afterFirstResponse.request.count, 5);
assert.equal(getLiveTargetState({ pl: 750 }, 750, '139').status, 'reached');
assert.equal(getLiveTargetState({ pl: 753 }, 750, '139').status, 'above');

const incompleteSnapshot = parseMonsterUpgradeSnapshot({
  rows: rows.slice(0, 1),
  body: { textContent: '' },
});
assert.equal(incompleteSnapshot.levels, null);
assert.equal(incompleteSnapshot.inventoryComplete, false);
assert.equal(incompleteSnapshot.insufficientCrystals, false);

console.log('HV Monster PL Planner live-target tests passed.');
