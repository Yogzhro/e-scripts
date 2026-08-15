'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'HV Monster Manager.js'), 'utf8');

function extractFunction(name) {
  const markers = [`function ${name}(`, `async function ${name}(`];
  const start = markers.map(marker => source.indexOf(marker)).find(index => index >= 0);
  assert.notEqual(start, undefined, `missing production function: ${name}`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = brace; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (`'\"\``.includes(char)) quote = char;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unterminated production function: ${name}`);
}

function loadFunction(name, dependencies = {}) {
  return Function(...Object.keys(dependencies), `"use strict"; return (${extractFunction(name)});`)(...Object.values(dependencies));
}

assert.match(source, /\/\/ @version\s+0\.3\.5\.0/);
assert(source.includes("const ADDON_VERSION = '0.3.5.0'"));
assert(source.includes('const CHAOS_CONFIGS = ['));
for (const query of ['affect', 'health', 'damage', 'accur', 'cevbl', 'cpare', 'parry', 'resist', 'evade', 'phymit', 'magmit', 'atkspd']) {
  assert.match(source, new RegExp(`query:\\s*['\"]${query}['\"]`), `missing chaos query: ${query}`);
}
assert.match(source, /max:\s*20/);
assert(source.includes('const UPGRADE_CONFIGS ='));
assert(source.includes('runtime.drafts'));
assert(source.includes('runtime.chaosTokens'));
assert(source.includes('Math.min(5, items.length)') || source.includes('DRAFT_MAX_CONNECTIONS'));

const chaosTokenCost = loadFunction('chaosTokenCost');
assert.equal(chaosTokenCost(0, 0), 0);
assert.equal(chaosTokenCost(0, 10), 55);
assert.equal(chaosTokenCost(7, 10), 27);

const crystalKeys = ['STR', 'DEX'];
const chaosKeys = ['Scavenging'];
const classifyUpgradeDraft = loadFunction('classifyUpgradeDraft', {
  all: crystalKeys,
  chaosKeys,
  EPS: 1e-9,
  totalPL: levels => levels.STR + levels.DEX,
  t: key => key,
});
const baseDraft = {
  status: 'ready',
  current: { STR: 5, DEX: 5, Scavenging: 0 },
  target: { STR: 5, DEX: 5, Scavenging: 0 },
};
assert.equal(classifyUpgradeDraft(baseDraft, 20).status, 'none');
assert.equal(classifyUpgradeDraft({ ...baseDraft, target: { ...baseDraft.target, Scavenging: 2 } }, 20).status, 'chaos-only');
assert.equal(classifyUpgradeDraft({ ...baseDraft, target: { ...baseDraft.target, STR: 10 } }, 20).status, 'invalid');
assert.equal(classifyUpgradeDraft({ ...baseDraft, target: { ...baseDraft.target, STR: 10 } }, 15).status, 'pl');
assert.equal(classifyUpgradeDraft({ ...baseDraft, status: 'error' }, 10).status, 'invalid');

const buildNextDraftRequest = loadFunction('buildNextDraftRequest', {
  all: crystalKeys,
  chaosKeys,
  chaosByKey: { Scavenging: { query: 'affect' } },
  upgradeQueryByAttr: { STR: 'pa_str', DEX: 'pa_dex' },
  encodeURIComponent,
});
assert.deepEqual(buildNextDraftRequest({
  slot: '199',
  current: { STR: 5, DEX: 5, Scavenging: 0 },
  target: { STR: 20, DEX: 5, Scavenging: 12 },
}, 'crystal'), {
  resource: 'crystal', attr: 'STR', count: 10, slot: '199',
  url: '?s=Bazaar&ss=ml&slot=199', data: 'crystal_upgrade=pa_str&crystal_count=10',
});
assert.deepEqual(buildNextDraftRequest({
  slot: '200',
  current: { STR: 20, DEX: 5, Scavenging: 0 },
  target: { STR: 20, DEX: 5, Scavenging: 12 },
}, 'chaos'), {
  resource: 'chaos', attr: 'Scavenging', count: 10, slot: '200',
  url: '?s=Bazaar&ss=ml&slot=200', data: 'chaos_upgrade=affect&chaos_count=10',
});

for (const marker of [
  'function renderUpgradeEditor(',
  'function renderUpgradeResources(',
  'function confirmUpgradeDialog(',
  'function diagnoseAmbiguousPost(',
  "document.dispatchEvent(new CustomEvent('hvmm:languagechange'",
]) assert(source.includes(marker), `missing v0.3.5 behavior: ${marker}`);

assert.match(source, /#hvmepp-panel\{[^}]*overflow-x:hidden;overflow-y:auto/);
assert.match(source, /\.hvmepp-manager-workspace>\.hvmepp-section,\.hvmepp-upgrade-editor\{min-width:0/);
assert.match(source, /\.hvmepp-upgrade-matrix-wrap\{[^}]*width:100%;[^}]*overflow:auto/);

assert(!source.includes("headingUpgradePlan: ['Upgrade Plan'"), 'legacy fixed upgrade-plan translation remains');
assert(!source.includes("contentId: 'hvmepp-upgrade-result'"), 'legacy fixed upgrade-plan section remains');

console.log('HV Monster Manager 0.3.5.0 tests passed.');
