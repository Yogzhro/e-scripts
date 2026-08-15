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

assert.match(source, /\/\/ @version\s+0\.3\.6\.7/);
assert(source.includes("const ADDON_VERSION = '0.3.6.7'"));
assert(source.includes('const CHAOS_CONFIGS = ['));
for (const [key, zh] of [
  ['Scavenging', '寻宝'], ['Fortitude', '刚毅'], ['Brutality', '蛮横'], ['Accuracy', '命中'],
  ['Precision', '精密'], ['Overpower', '压制'], ['Interception', '拦截'], ['Dissipation', '弥散'],
  ['Evasion', '闪避'], ['Defense', '防御'], ['Warding', '魔防'], ['Swiftness', '迅捷'],
]) assert(source.includes(`{ key: '${key}', zh: '${zh}'`), `incorrect chaos translation: ${key}`);
for (const [key, zh] of [
  ['STR', '力量'], ['DEX', '灵巧'], ['AGI', '敏捷'], ['END', '体质'], ['INT', '智力'], ['WIS', '智慧'],
  ['FIRE', '火焰'], ['COLD', '冰冷'], ['ELEC', '闪电'], ['WIND', '疾风'], ['HOLY', '神圣'], ['DARK', '黑暗'],
]) assert(source.includes(`['${key}', '${zh}'`), `incorrect attribute translation: ${key}`);
for (const query of ['affect', 'health', 'damage', 'accur', 'cevbl', 'cpare', 'parry', 'resist', 'evade', 'phymit', 'magmit', 'atkspd']) {
  assert.match(source, new RegExp(`query:\\s*['\"]${query}['\"]`), `missing chaos query: ${query}`);
}
assert.match(source, /max:\s*20/);
assert(source.includes('const UPGRADE_CONFIGS ='));
assert(source.includes("buttonRefreshData: [\"Refresh Data\", \"刷新数据\"]"));
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
assert.match(source, /const EDITOR_GROUP_CONFIGS = \[/);
assert.match(source, /key: 'chaos', group: 'chaos', label: 'Chaos Upgrades', zh: '混沌升级'/);
assert(!source.includes("key: 'chaos-1'"), 'Chaos I remains separate');
assert(!source.includes("key: 'chaos-2'"), 'Chaos II remains separate');
assert(!source.includes("editorView: 'primary'"), 'legacy single-group editor state remains');
assert(!source.includes('hvmepp-editor-view-tabs'), 'legacy group tabs remain');
assert.match(source, /hvmepp-editor-group-actions/);
assert.match(source, /hvmepp-draft-card/);
assert.match(source, /function renderDraftTable\(/);
assert.match(source, /const EDITOR_TABLE_BANDS = \[\['primary', 'elemental'\], \['chaos'\]\]/);
assert.match(source, /class: 'hvmepp-draft-band'/);
assert.match(source, /dataset: \{ band: groupKeys\.join\('-'\) \}/);
assert.match(source, /elt\('details', \{ class: 'hvmepp-draft-card'/);
assert.match(source, /runtime\.openDraftSlots\.(?:add|delete)/);
assert.match(source, /state\.language === 'zh-CN' && config\.zh \? config\.zh : config\.label/);
assert(source.includes("renderButton('hvmepp-refresh-data', 'buttonRefreshData')"));
assert(!source.includes("class: 'hvmepp-resource-actions'"), 'purchase buttons remain detached from the primary actions');
assert(!source.includes('hvmepp-upgrade-matrix-wrap'), 'legacy scrolling matrix remains');
assert(!source.includes('hvmepp-draft-groups'), 'legacy three-grid monster editor remains');
assert.match(source, /elt\('th', \{\s*colspan: configs\.length/);
assert.match(source, /\.hvmepp-draft-table\{[^}]*table-layout:fixed;[^}]*border-spacing:0 2px/);
assert.match(source, /\.hvmepp-draft-table-wrap\{[^}]*overflow-x:auto/);
assert.match(source, /\.hvmepp-draft-table input\{[^}]*width:30px;[^}]*margin:0!important/);
assert.match(source, /\.hvmepp-draft-table\{[^}]*min-width:480px/);
assert.match(source, /\.hvmepp-draft-band\+\.hvmepp-draft-band/);
assert.match(source, /\.hvmepp-draft-header::before\{content:'▶'/);
assert.match(source, /\.hvmepp-draft-card\[open\] > \.hvmepp-draft-header::before\{content:'▼'/);
assert(!source.includes('colspan: 29'), 'legacy 24-column matrix loading row remains');
assert.match(source, /actions\.append\(actionButtons\.calculate, actionButtons\.refresh, actionButtons\.upgrade, actionButtons\.direct, actionButtons\.order\)/);
assert.match(source, /\.hvmepp-top-actions\{[^}]*grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
assert.match(source, /hvmepp-resource-table/);
assert.match(source, /function sumCrystalBuyCost\(rows\)/);
assert.match(source, /class: `hvmepp-token-summary\$\{tokenShortage > 0 \? ' hvmepp-shortage hvut-warn' : ''\}`/);
assert.match(source, /renderLogSummary\(plan = runtime\.lastPlan\)/);
assert.match(source, /t\('totalCostUnavailable'\)/);
assert.match(source, /if \(zero\.length\) \{/);
assert.match(source, /box\.replaceChildren\(\.\.\.children\)/);
assert.match(source, /box\.addEventListener\('change'/);
assert.match(source, /applyOrderPricesFromCache\(\);\s*renderLogSummary\(\);/);
assert(!source.includes("if (plan.chaosTokens === 0) zero.push"), 'Chaos Tokens remain hidden in the zero-resource foldout');
assert(!source.includes("if (plan.chaosTokens > 0) table.appendChild"), 'Chaos Tokens remain mixed into the crystal table');
assert(!source.includes("class: 'hvmepp-execution-actions'"), 'detached execute action remains');

assert(!source.includes("headingUpgradePlan: ['Upgrade Plan'"), 'legacy fixed upgrade-plan translation remains');
assert(!source.includes("contentId: 'hvmepp-upgrade-result'"), 'legacy fixed upgrade-plan section remains');

console.log('HV Monster Manager 0.3.6.7 tests passed.');
