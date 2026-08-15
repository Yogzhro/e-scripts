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

function fakeElt(tag, attrs = {}, children = []) {
  const node = {
    tag,
    attrs,
    children: Array.isArray(children) ? [...children] : [children],
    appendChild(child) {
      this.children.push(child);
    },
  };
  return node;
}

assert(source.includes('// @name         HV Monster Manager'));
assert(source.includes('// @version      0.3.6.7'));
for (const pair of [
  ['plannerTitle', 'PL Planner', 'PL计划器'],
  ['renameTitle', 'Monster Rename', '怪物重命名'],
  ['headingMonsterRename', 'Rename', '重命名'],
  ['headingMonsterSelection', 'Select Monsters', '选择怪物'],
  ['headingUpgradeEditor', 'Upgrade Editor', '升级编辑器'],
  ['headingUpgradeResources', 'Upgrade Resources, Inventory and Shortage', '升级资源需求、库存与缺口'],
  ['headingLog', 'Log', '日志'],
  ['buttonCalculatePlan', 'Calculate Exact Plan', '计算精确方案'],
  ['buttonDirectBuy', 'Direct Buy Crystals', '直接买入水晶'],
  ['buttonRunUpgrade', 'Upgrade Selected Monsters', '升级选中怪物'],
  ['buttonExportNames', 'Export All Monster Names', '导出全部怪物名字'],
]) {
  assert(source.includes(`${pair[0]}: ["${pair[1]}", "${pair[2]}"]`));
}

assert.match(
  source,
  /function renderCollapsibleSection\(id, headingKey, \{ open = false, className = '' \} = \{\}\)/
);

const renderCollapsibleSection = Function(
  'elt',
  't',
  `"use strict"; return (${extractFunction('renderCollapsibleSection')});`
)(fakeElt, (key) => key);
const collapsedSection = renderCollapsibleSection('section-id', 'headingKey');
assert.equal(collapsedSection.section.tag, 'details');
assert.equal(collapsedSection.section.attrs.open, false);
assert.equal(collapsedSection.section.children[0].tag, 'summary');
assert.equal(collapsedSection.section.children[0].children[0].attrs.text, 'headingKey');
assert.equal(collapsedSection.body.attrs.class, 'hvmepp-section-body');
const expandedSection = renderCollapsibleSection('log-id', 'headingLog', { open: true });
assert.equal(expandedSection.section.attrs.open, true);

const expectedSections = [
  ['hvmepp-selection-section', 'headingMonsterSelection'],
];
for (const [id, headingKey] of expectedSections) {
  assert(
    source.includes(`renderCollapsibleSection('${id}', '${headingKey}'`),
    `${id} must use the shared collapsed-by-default section renderer`
  );
}
assert(
  /renderCollapsibleSection\('hvmepp-rename-section', 'headingMonsterRename', \{\s*open: true,/.test(source),
  'the dedicated rename section must be expanded by default'
);
assert(
  source.includes("id: 'hvmepp-crystal-section', headingKey: 'headingUpgradeResources'")
    && source.includes('openWhenCustom: true'),
  'crystal requirements must be collapsed unless custom buy prices are active'
);
assert(
  source.includes("id: 'hvmepp-log-section', headingKey: 'headingLog'")
    && source.includes('open: true'),
  'the unified log section must be expanded by default'
);

assert(source.includes("contentId: 'hvmepp-crystal-result'"));
assert(source.includes("contentClass: 'hvmepp-upgrade-editor'"));
assert(!source.includes("contentId: 'hvmepp-upgrade-result'"));
assert(source.includes("contentId: 'hvmepp-log-output'"));
assert(source.includes("childIds: ['hvmepp-log-summary', 'hvmepp-log-message']"));
assert(!source.includes("id: 'hvmepp-live'"));
assert(!source.includes("id: 'hvmepp-status'"));
assert(!source.includes("id: 'hvmepp-result'"));

const plannerPanelSource = extractFunction('renderPanel');
assert(plannerPanelSource.includes('renderMonsterSelection(runtime.monsterList)'));
assert(plannerPanelSource.includes('PLANNER_SECTION_CONFIGS.map(renderConfiguredSection)'));
assert(plannerPanelSource.includes('renderMonsterRename(runtime.monsterList)'));
assert(plannerPanelSource.indexOf('renderMonsterSelection(runtime.monsterList)')
  < plannerPanelSource.indexOf('renderMonsterRename(runtime.monsterList)'));
assert(source.includes('id="hvmepp-rename-status"'));

const plannerControlsSource = extractFunction('renderPlannerControls');
for (const id of [
  'hvmepp-target',
  'hvmepp-source',
  'hvmepp-order-source',
  'hvmepp-calculate-plan',
  'hvmepp-direct-buy',
  'hvmepp-place-buy-orders',
  'hvmepp-run-upgrade',
]) {
  assert(source.includes(id), `${id} must be in the planner top controls/configuration`);
}
assert(plannerControlsSource.includes('PLANNER_ACTION_CONFIGS.map'));
assert(source.includes('function calculateExactPlan()'));
const crystalPlanSource = extractFunction('renderUpgradeResources');
assert(!crystalPlanSource.includes('hvmepp-load-stock'));
assert(!crystalPlanSource.includes('hvmepp-direct-buy'));
assert(!crystalPlanSource.includes('hvmepp-place-buy-orders'));
assert(!crystalPlanSource.includes('hvmepp-order-source'));

assert(source.includes("'hvmepp-planner-entry'"));
assert(source.includes("'hvmepp-rename-entry'"));
assert(!source.includes("id: 'hvmepp-entry'"));
assert(source.includes("btn.addEventListener('click', () => renderPanel(mode))"));

assert(!source.includes('LANGUAGE_STORE_KEY'));
assert(!source.includes('function readSavedLanguage('));
assert(!source.includes('function languageFromChoice('));
assert(!source.includes('window.prompt('));
assert(source.includes('function renderLanguageSwitcher()'));
assert(source.includes("class: 'hvmepp-lang-switch'"));
assert(source.includes('function setLanguage(language)'));
assert(source.includes('function refreshLanguageButtons()'));
assert(source.includes('panel.appendChild(renderLanguageSwitcher())'));
assert(
  extractFunction('refreshLocalizedText').includes('syncMonsterSelection()'),
  'language changes must relocalize the dynamic selected/loaded monster summary'
);
assert(source.includes('state.language = normalizeLanguage(language)'));
assert(source.includes('language: normalizeLanguage(storedState.language)'));
assert(source.includes('id="hvmepp-choose-rename-file"'));
assert(source.includes('id="hvmepp-rename-file-name"'));
assert(source.includes('buttonChooseFile: ["Choose File", "选择文件"]'));
assert(source.includes('renameFileNone: ["No file selected", "未选择文件"]'));
assert.match(source, /\.hvmepp-file-input\s*\{[^}]*display:\s*none;/s);
assert(source.includes("const languageIndex = { en: 0, 'zh-CN': 1 }"));
assert(!source.includes('    en: {'));
assert(!source.includes("    'zh-CN': {"));
const translationStart = source.indexOf('  const translations = {');
const translationsEnd = source.indexOf('\n  };', translationStart);
const translationBlock = source.slice(translationStart, translationsEnd);
const translationKeys = [...translationBlock.matchAll(/^    ([A-Za-z][A-Za-z0-9]*):\s*(?:\[|\{)/gm)]
  .map((match) => match[1]);
const referencedTranslationKeys = new Set([
  ...[...source.matchAll(/\bt\('([A-Za-z][A-Za-z0-9]*)'/g)].map((match) => match[1]),
  ...[...source.matchAll(/renderButton\([^,]+,\s*'([A-Za-z][A-Za-z0-9]*)'/g)].map((match) => match[1]),
  ...[...source.matchAll(/renderCollapsibleSection\([^,]+,\s*'([A-Za-z][A-Za-z0-9]*)'/g)]
    .map((match) => match[1]),
]);
referencedTranslationKeys.forEach((key) => {
  assert(translationKeys.includes(key), `missing paired translation key: ${key}`);
});

assert(source.includes('width:var(--hvmm-panel-width,100%);'));
assert(source.includes("class: 'hvut-ml-up hvmepp-panel'"));
assert(!source.includes("id: 'hvmepp-overlay'"));
const mobileCss = source.slice(source.indexOf('@media(max-width:900px)'));
assert(!mobileCss.includes('width:calc(100vw - 10px);'));

assert(!source.includes('headingBatchRename'));
assert(!source.includes('Batch rename complete'));
assert(!source.includes('批量重命名完成'));

console.log('HV Monster Manager layout tests passed.');
