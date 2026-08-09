'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const scriptPath = path.resolve(__dirname, '..', 'HV Monster Manager.js');
const source = fs.readFileSync(scriptPath, 'utf8');
const attrs = ['STR', 'DEX', 'AGI', 'END', 'INT', 'WIS', 'FIRE', 'COLD', 'ELEC', 'WIND', 'HOLY', 'DARK'];
const crystals = attrs.map((attr) => `Crystal ${attr}`);

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

assert(source.includes("const CACHE_KEY = 'hv_monster_manager_cache_v1'"));
assert(source.includes('// @version      0.3.2.0'));
assert(source.includes("const ADDON_VERSION = '0.3.2.0'"));

const normalizeMonsterLevels = (levels) => {
  if (!levels || typeof levels !== 'object' || attrs.some((attr) => !Number.isFinite(Number(levels[attr])))) return null;
  return Object.fromEntries(attrs.map((attr) => [attr, Number(levels[attr])]));
};
const totalPL = (levels) => attrs.reduce((sum, attr) => sum + levels[attr], 0);
const restoreMonsterCache = loadFunction('restoreMonsterCache', {
  CACHE_VERSION: 1,
  all: attrs,
  EPS: 1e-9,
  isPlainObject: (value) => value && typeof value === 'object' && !Array.isArray(value),
  normalizeMonsterLevels,
  totalPL,
});
const validLevels = Array.from({ length: attrs.length }, (_, index) => index + 1);
const validPL = validLevels.reduce((sum, level) => sum + level, 0);
const cache = {
  version: 1,
  monsters: {
    199: { name: 'Old Name', pl: validPL, updatedAt: 1234, levels: validLevels },
    200: { name: 'Mismatch', pl: validPL, updatedAt: 1235, levels: validLevels },
    201: { name: 'Removed', pl: validPL, updatedAt: 1236, levels: validLevels },
  },
};
const restoredMonsters = restoreMonsterCache(cache, [
  { index: '199', name: 'Current Name', pl: validPL },
  { index: '200', name: 'Changed PL', pl: validPL + 1 },
]);
assert.deepEqual([...restoredMonsters.keys()], ['199'], 'only visible monsters with unchanged PL may be restored');
assert.deepEqual(restoredMonsters.get('199'), {
  slot: '199',
  name: 'Current Name',
  pl: validPL,
  updatedAt: 1234,
  levels: Object.fromEntries(attrs.map((attr, index) => [attr, index + 1])),
}, 'the live list name must replace a stale cached name');
assert.equal(restoreMonsterCache({ version: 2, monsters: cache.monsters }, [
  { index: '199', name: 'Current Name', pl: validPL },
]).size, 0, 'unknown cache versions must fail closed');

const restoreMarketCache = loadFunction('restoreMarketCache', {
  CACHE_VERSION: 1,
  crystalNames: crystals,
  marketPriceSources: ['ask', 'bid', 'day', 'week', 'month', 'year'],
  isPlainObject: (value) => value && typeof value === 'object' && !Array.isArray(value),
  positiveNumber: (value) => Number(value) > 0 ? Number(value) : 0,
});
const marketCache = {
  version: 1,
  market: {
    updatedAt: 5678,
    inventoryLoaded: true,
    orderBooksLoaded: true,
    crystals: Object.fromEntries(crystals.map((crystal, index) => [crystal, {
      itemid: String(index + 10),
      stock: index * 100,
      batchSize: 1000,
      prices: [1, 2, 3, 4, 5, 6, 7],
      currentOrder: [index, 9000],
      asks: [[1000, 10000]],
      bids: [[2000, 9000]],
    }])),
  },
};
const restoredMarket = restoreMarketCache(marketCache, {});
assert.equal(restoredMarket.updatedAt, 5678);
assert.equal(restoredMarket.inventoryLoaded, true);
assert.equal(restoredMarket.orderBooksLoaded, true);
assert.deepEqual(restoredMarket.marketData[crystals[0]], {
  itemid: '10', stock: 0, batchSize: 1000,
  ask: 1, bid: 2, day: 3, week: 4, month: 5, year: 6, hvut: 7,
  unitAsk: 1, unitBid: 2, batchAsk: 1000, batchBid: 2000,
  currentOrder: { count: 0, price: 9000 },
  askOrders: [{ crystals: 1000, batchPrice: 10000 }],
  bidOrders: [{ crystals: 2000, batchPrice: 9000 }],
});
const incompleteMarket = structuredClone(marketCache);
delete incompleteMarket.market.crystals[crystals[1]].stock;
delete incompleteMarket.market.crystals[crystals[2]].asks;
const restoredIncomplete = restoreMarketCache(incompleteMarket, {});
assert.equal(restoredIncomplete.inventoryLoaded, false, 'an incomplete inventory must not be marked loaded');
assert.equal(restoredIncomplete.orderBooksLoaded, false, 'incomplete order books must not be marked loaded');

const buildDataCache = loadFunction('buildDataCache', {
  CACHE_VERSION: 1,
  all: attrs,
  crystalNames: crystals,
  marketPriceSources: ['ask', 'bid', 'day', 'week', 'month', 'year'],
  normalizeMonsterLevels,
  totalPL,
  positiveNumber: (value) => Number(value) > 0 ? Number(value) : 0,
});
const rebuiltCache = buildDataCache(new Map([['199', restoredMonsters.get('199')]]),
  restoredMarket.marketData, true, true, 5678);
assert.deepEqual(rebuiltCache.monsters['199'], {
  name: 'Current Name', pl: validPL, updatedAt: 1234, levels: validLevels,
});
assert.deepEqual(rebuiltCache.market.crystals[crystals[0]], marketCache.market.crystals[crystals[0]]);

const monsterOptionText = loadFunction('monsterOptionText');
const displayMonster = { index: '199', name: 'Current Name', pl: 750 };
assert.equal(monsterOptionText(displayMonster, 'planner'), '#199 Current Name / PL 750');
assert.equal(monsterOptionText(displayMonster, 'rename'), '#199 Current Name');

const saveCacheSource = extractFunction('saveCache');
assert(saveCacheSource.includes('GM_setValue(CACHE_KEY, storedCache)'), 'cache must be saved as a structured GM value');
assert(!saveCacheSource.includes('JSON.stringify'), 'the shared cache must not be stringified');
assert(extractFunction('renderPanel').includes('hydrateMonsterCache(runtime.monsterList)'));
assert(extractFunction('loadSelectedMonsters').includes('saveCache()'));
assert(extractFunction('refreshMarketSnapshot').includes('saveCache()'));
assert(extractFunction('applyMonsterRename').includes('saveCache()'));
assert(extractFunction('executeBatchUpgradePlan').includes('saveCache()'));

console.log('HV Monster Manager persistent shared-cache tests passed.');
