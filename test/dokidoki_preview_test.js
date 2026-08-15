'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const workspace = path.resolve(__dirname, '..');
const previewPath = path.join(workspace, 'dokidoki-preview.html');
const builderPath = path.join(workspace, 'resource', 'dokidoki', 'build-assets.js');
const scriptPath = path.join(workspace, 'dokidoki.js');

assert(fs.existsSync(previewPath), 'missing dokidoki-preview.html');
const preview = fs.readFileSync(previewPath, 'utf8');
const script = fs.readFileSync(scriptPath, 'utf8');
const { isPreviewPage, assetUrl, listAssetUrl } = require(scriptPath);
const { buildPreviewPackage } = require(builderPath);

assert.match(preview, /<html[^>]+data-dokidoki-preview="1"/i);
assert.match(preview, /<html[^>]+data-dokidoki-layout="workbench"/i);
assert.match(preview, /<script\s+src="\.\/dokidoki\.js"><\/script>/i);
assert.match(preview, /data-en="Offline preview"[^>]+data-zh="离线预览"/i);
for (const view of ['list', 'monster', 'planner', 'rename']) {
  assert(preview.includes(`data-preview-view="${view}"`), `missing preview view: ${view}`);
}
assert(!preview.includes('data-preview-view="detail"'), 'legacy detail view remains');
assert(!preview.includes('data-preview-view="skills"'), 'legacy skills view remains');
for (const id of [
  'dokidoki-preview-skip', 'dokidoki-preview-command-bar', 'dokidoki-preview-main',
  'dokidoki-preview-lab-nav', 'dokidoki-preview-filter-toggle', 'dokidoki-preview-filter-search',
  'dokidoki-preview-filter-race', 'dokidoki-preview-roster-left', 'dokidoki-preview-roster-right',
  'dokidoki-preview-roster-left-scroll', 'dokidoki-preview-roster-right-scroll', 'dokidoki-preview-profile-layout',
  'dokidoki-preview-skill-matrix', 'dokidoki-preview-manager-layout',
]) assert(preview.includes(`id="${id}"`), `missing workbench landmark: ${id}`);
assert(!preview.includes('id="dokidoki-preview-workspace-header"'), 'obsolete roster overview remains');
assert(!preview.includes('class="preview-brand"'), 'obsolete preview brand column remains');
assert(!preview.includes('紧凑怪物实验室工作台'));
assert(!preview.includes('名册与状态总览'));
assert(!preview.includes('dokidoki · Monster Lab'));
assert(!preview.includes('id="dokidoki-preview-inspector"'), 'list view still contains the full portrait inspector');
assert.match(preview, /Array\.from\(\{\s*length:\s*200\s*\}/);
for (const width of ['1536', '1280', '1024', '900', '640', '375']) assert(preview.includes(`data-preview-width="${width}"`));
for (const width of ['1536', '1280', '1024', '900', '640', '375']) {
  assert.match(preview, new RegExp(`#dokidoki-preview-stage\\[data-preview-width="${width}"\\]\\s*\\{[^}]*max-width:\\s*${width}px`, 'i'), `preview width ${width} does not constrain the stage`);
}
assert.match(preview, /setPreviewWidth\('1536'\)/);
assert.match(preview, /aria-pressed/);
assert.match(preview, /role="listbox"/);
assert.match(preview, /role',\s*'option'|role\s*=\s*'option'/);
assert.match(preview, /prefers-reduced-motion:\s*reduce/);
assert.match(preview, /--preview-touch:\s*44px/);
assert.match(preview, /--preview-wine:\s*#5c0d11/i);
assert.match(preview, /--preview-ink:\s*#3f302b/i);
assert.match(preview, /--preview-line:\s*#b9a78a/i);
assert.match(preview, /--preview-amber:\s*#9b6a24/i);
assert.doesNotMatch(preview, /linear-gradient\([^;}]*(?:#5c0d11|#6d171d|#4e090d)/i, 'large wine gradient remains');
assert.match(preview, /#dokidoki-preview-command-bar[^}]+background:\s*var\(--preview-ink\)/i);
assert.match(preview, /html\[data-dokidoki-preview="1"\]\[data-dokidoki-layout="workbench"\]\s+body[^}]+color:\s*var\(--preview-ink\)/i, 'production preview body can reintroduce wine-colored text');
assert.match(preview, /#dokidoki-preview-command-bar\s+#dokidoki-preview-nav[^}]+background:\s*transparent/i, 'production preview navigation can override the compact command bar');
assert.match(preview, /#dokidoki-preview-command-bar\s+#dokidoki-preview-controls\s+button[^}]+min-height:\s*var\(--preview-touch\)/i, 'production preview controls can shrink below 44px');
assert.match(preview, /#dokidoki-toolbar[^}]+container-type:\s*inline-size/i);
assert.match(preview, /grid-template-columns:\s*repeat\(9,\s*minmax\(0,\s*1fr\)\)/i, 'wide toolbar is not a single row');
assert.match(preview, /grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/i, 'medium toolbar is not a 5+4 grid');
assert.match(preview, /id="dokidoki-preview-tool-drawer"/i);
assert.match(preview, /data-short-en="PL Calculator"[^>]+data-short-zh="PL计算器"/i);
assert.match(preview, /const previewToolbarMode\s*=\s*width\s*=>\s*width\s*>=\s*1020\s*\?\s*'single'\s*:\s*width\s*>=\s*640\s*\?\s*'double'\s*:\s*'drawer'/);
assert.match(preview, /data-preview-filter-collapsed/);
assert.match(preview, /toggleFilterRail/);
assert.match(preview, /filterRoster/);
assert.match(preview, /48px\s*!important;\s*height:\s*72px\s*!important/i);
assert.match(preview, /min-height:\s*86px\s*!important/i);
assert.match(preview, /#dokidoki-list-view[^}]+grid-template-rows/i);
assert.match(preview, /#slot_pane[^}]+grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/i);
assert.match(preview, /\.preview-roster-scroll[^}]+overflow-y:\s*auto/i);
assert.match(preview, /data-preview-roster-mode="single"/i);
assert.match(preview, /const splitRosterItems\s*=/);
assert.match(preview, /requestedWidth\s*>=\s*1180\s*&&\s*stage\.getBoundingClientRect\(\)\.width\s*>=\s*1180/);
assert.match(preview, /rosterPanes\[0\]\.replaceChildren\(\.\.\.leftRows/);
assert.match(preview, /rosterPanes\[1\]\.replaceChildren\(\.\.\.rightRows\)/);
assert.match(preview, /const filterRoster\s*=\s*\(\)\s*=>\s*renderRoster\(true\)/);
assert.match(preview, /new ResizeObserver\(/);
assert.match(preview, /addEventListener\('dblclick'/);
assert.match(preview, /#monster\/\$\{row\.dataset\.slot\}/);
assert.match(preview, /\^monster\\\/\(\\d\+\)\$/);
for (const key of ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Enter', ' ']) assert(preview.includes(`'${key}'`), `missing roster key: ${key || 'Space'}`);
for (const field of ['name', 'slot', 'race', 'pl', 'wins', 'gifts', 'morale', 'hunger']) assert(preview.includes(`data-profile-${field}`), `missing dynamic profile field: ${field}`);
assert.match(preview, /name:\s*names\[offset\s*%\s*names\.length\]/);
assert.doesNotMatch(preview, /name:\s*`\$\{names\[[^`]+padStart/, 'synthetic name still repeats the slot number');
for (const [en, zh] of [['Wins', '胜'], ['Kills', '杀'], ['New gifts', '新礼'], ['Total gifts', '总礼'], ['Morale', '情绪'], ['Hunger', '饥饿']]) {
  assert.match(preview, new RegExp(`makeCardMetric\\('${en}',\\s*'${zh}'`, 'i'), `missing roster label: ${en}`);
}
for (const id of ['dokidoki-preview-care-management', 'dokidoki-preview-combat-attributes', 'dokidoki-preview-chaos-upgrades']) {
  assert(preview.includes(`id="${id}"`), `missing merged profile section: ${id}`);
}
assert.match(preview, /const setupProfileUpgradeLinks\s*=/, 'dossier upgrade links are missing');
assert.match(preview, /\['dokidoki-preview-combat-attributes',\s*'dokidoki-preview-chaos-upgrades'\]/);
assert.match(preview, /#planner\/\$\{row\.dataset\.slot\}/);
assert.doesNotMatch(preview, /class="preview-surface preview-danger-zone/, 'danger actions remain a separate profile card');
assert.match(preview, /data-preview-stat-group="primary"/);
assert.match(preview, /data-preview-stat-group="elemental"/);
assert.match(preview, /data-preview-stat-group="other"/);
for (const stat of ['STR', 'DEX', 'AGI', 'END', 'INT', 'WIS', 'FIRE', 'COLD', 'ELEC', 'WIND', 'HOLY', 'DARK']) {
  assert.match(preview, new RegExp(`>${stat}<`), `missing combat stat: ${stat}`);
}
for (const upgrade of ['Scavenging', 'Fortitude', 'Brutality', 'Accuracy', 'Precision', 'Overpower', 'Interception', 'Dissipation', 'Evasion', 'Defense', 'Warding', 'Swiftness']) {
  assert.equal((preview.match(new RegExp(`>${upgrade}<`, 'g')) || []).length, 1, `chaos upgrade should appear once: ${upgrade}`);
}
assert.match(preview, /\.preview-combat-layout[^}]+grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(260px,\s*\.8fr\)/i);
assert.match(preview, /\.preview-chaos-grid[^}]+grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\)/i);
for (const width of ['1024', '900']) assert.match(preview, new RegExp(`#dokidoki-preview-stage\\[data-preview-width="${width}"\\] \\.preview-chaos-grid[^}]+repeat\\(4`, 'i'));
for (const width of ['640', '375']) assert.match(preview, new RegExp(`#dokidoki-preview-stage\\[data-preview-width="${width}"\\] \\.preview-chaos-grid[^}]+repeat\\(2`, 'i'));
assert.match(preview, /\.preview-danger-actions[^}]+border-top[^}]+var\(--preview-danger\)/i);
assert.match(preview, /data-preview-hvmm-section="selection"/);
assert.match(preview, /data-preview-hvmm-section="workspace"/);
assert.match(preview, /grid-template-columns:\s*280px\s+minmax\(0,\s*1fr\)/i);
assert.match(preview, /\.hvmepp-monster-list/);
assert.match(preview, /\.hvmepp-monster-option/);
for (const id of [
  'dokidoki-preview-planner-controls', 'dokidoki-preview-upgrade-editor',
  'dokidoki-preview-editor-group-actions', 'dokidoki-preview-draft-cards',
  'dokidoki-preview-resource-section', 'dokidoki-preview-log-section',
  'dokidoki-preview-draft-status', 'dokidoki-preview-recalculate-warning',
  'dokidoki-preview-calculate', 'dokidoki-preview-reset-draft', 'dokidoki-preview-run-upgrade',
  'dokidoki-preview-review-confirmation', 'dokidoki-preview-confirm-dialog',
]) assert(preview.includes(`id="${id}"`), `missing integrated planner landmark: ${id}`);
for (const group of ['primary', 'elemental', 'chaos']) assert(preview.includes(`key: '${group}'`), `missing editor group: ${group}`);
assert.doesNotMatch(preview, /key: 'chaos-[12]'/, 'Chaos groups remain split');
for (const upgrade of ['STR', 'DEX', 'AGI', 'END', 'INT', 'WIS', 'FIRE', 'COLD', 'ELEC', 'WIND', 'HOLY', 'DARK', 'Scavenging', 'Fortitude', 'Brutality', 'Accuracy', 'Precision', 'Overpower', 'Interception', 'Dissipation', 'Evasion', 'Defense', 'Warding', 'Swiftness']) {
  assert.match(preview, new RegExp(`(?:key|label):\\s*['"]${upgrade}['"]`), `planner config is missing: ${upgrade}`);
}
assert.match(preview, /data-preview-draft-mode="current"/);
assert.match(preview, /data-preview-local-action/);
assert.match(preview, /applyExactPlan/);
assert.match(preview, /markDraftCustom/);
assert.match(preview, /renderUpgradeEditor/);
assert.match(preview, /renderResourceSummary/);
assert.match(preview, /const plannerOpenCards = new Set\(\)/, 'monster card disclosure state is not preserved');
assert.match(preview, /document\.createElement\('details'\)/, 'monster cards are not collapsible');
assert.match(preview, /selected\.some\(isMonsterDirty\) && !force[\s\S]+recalculate-warning/, 'recalculation can overwrite a modified draft without confirmation');
assert.match(preview, /if \(shortage\) details\.open = true/, 'resource shortage does not reveal its details');
assert.match(preview, /if \(plannerLog\?\.error\)[^{;]*document\.getElementById\('dokidoki-preview-log-section'\)\.open = true/, 'errors do not reveal the log');
assert.match(preview, /data-en="Chaos Tokens"[^>]+data-zh="混沌令牌"/i);
assert.match(preview, /data-en="Projected PL"[^>]+data-zh="投影PL"/i);
assert.match(preview, /data-en="Custom PL"[^>]+data-zh="自定义PL"/i);
assert.match(preview, /data-en="Exact plan"[^>]+data-zh="精确方案"/i);
assert.match(preview, /data-en="Chaos only"[^>]+data-zh="仅混沌"/i);
assert.match(preview, /data-en="Mixed batch"[^>]+data-zh="混合批次"/i);
assert.match(preview, /max:\s*20/g);
assert.match(preview, /monster\.raw\[item\.key\]\s*=\s*raw/);
assert.match(preview, /Number\.isInteger\(value\)[\s\S]+monster\.invalid\[item\.key\]\s*=\s*true/);
assert.doesNotMatch(preview, /Math\.trunc\(Number\(input\.value\)/, 'invalid level input is still auto-corrected');
assert.match(preview, /className = 'preview-all-resources'/);
assert.match(preview, /Show all 13 resources/);
assert.match(preview, /queueMicrotask\(\(\) => document\.getElementById\('dokidoki-preview-confirm-cancel'\)\.focus\(\)\)/);
assert.match(preview, /\.preview-draft-groups[^}]+grid-template-columns:\s*repeat\(2,\s*minmax\(260px,\s*1fr\)\)/i);
assert.match(preview, /\.preview-upgrade-card-grid[^}]+grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/i);
assert.match(preview, /\.preview-upgrade-card-group\[data-group="chaos"\][^}]+grid-column:\s*1\s*\/\s*-1/i);
assert.doesNotMatch(preview, /preview-upgrade-matrix|preview-editor-view-tabs|activePlannerView/, 'legacy focused matrix remains');
assert.match(preview, /const upgradeLabel = item => isChinese && item\.zh \? item\.zh : item\.key/);
const refreshIndex = preview.indexOf('id="dokidoki-preview-refresh-data"');
const runIndex = preview.indexOf('id="dokidoki-preview-run-upgrade"');
assert(refreshIndex >= 0 && runIndex > refreshIndex, 'upgrade button must follow refresh data');
assert.doesNotMatch(preview, /preview-pagination|data-preview-page=/i, 'planner must not paginate monsters');
const plannerControlsIndex = preview.indexOf('id="dokidoki-preview-planner-controls"');
const editorIndex = preview.indexOf('id="dokidoki-preview-upgrade-editor"');
const resourcesIndex = preview.indexOf('id="dokidoki-preview-resource-section"');
const logIndex = preview.indexOf('id="dokidoki-preview-log-section"');
assert(plannerControlsIndex < editorIndex && editorIndex < resourcesIndex && resourcesIndex < logIndex, 'planner sections are out of order');
assert.match(preview, /id="dokidoki-preview-resource-section"[^>]*>\s*<summary/i);
assert.match(preview, /id="dokidoki-preview-log-section"[^>]*>\s*<summary/i);
assert.match(preview, /id="dokidoki-preview-run-upgrade"[^>]+disabled/i);
assert.match(preview, /id="dokidoki-preview-direct-buy"[^>]+disabled/i);
assert.match(preview, /id="dokidoki-preview-place-orders"[^>]+disabled/i);
assert(preview.includes('plannerMatch = /^planner\\/(\\d+)$/'), 'missing planner deep-link route');
assert.match(preview, /disabled[^>]*data-preview-action|data-preview-action[^>]*disabled/);
assert.match(preview, /\.\/resource\/dokidoki\/dist\/detail\//);
assert(!/\b(?:fetch|XMLHttpRequest|GM_xmlhttpRequest)\s*\(/.test(preview));
assert(!/serviceWorker|indexedDB|localStorage|sessionStorage/i.test(preview));
assert(!/<form\b/i.test(preview));
assert(!/<script[^>]+type=["']module["']/i.test(preview));
assert(!/<link[^>]+href=["']https?:/i.test(preview), 'offline preview imports a remote stylesheet');
assert.equal((preview.match(/var\(--preview-wine\)/g) || []).length, 1, 'wine color is used outside the tiny offline marker');
assert(!/calc\(var\(--dokidoki-x-small\)\s*\*/.test(preview), 'sprite offset uses unsupported CSS multiplication');
for (const [, source] of preview.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
  if (source.trim()) assert.doesNotThrow(() => new Function(source), 'preview inline script has invalid syntax');
}

const splitSource = preview.match(/const splitRosterItems\s*=\s*([^;]+);/);
assert(splitSource, 'missing pure roster split helper');
const splitRosterItems = Function(`return (${splitSource[1]})`)();
const twoHundred = Array.from({ length: 200 }, (_, index) => index + 1);
assert.deepEqual(splitRosterItems(twoHundred, true).map(items => items.length), [100, 100]);
assert.deepEqual(splitRosterItems(twoHundred.slice(0, 25), true).map(items => items.length), [13, 12]);
assert.deepEqual(splitRosterItems(twoHundred.slice(0, 25), false).map(items => items.length), [25, 0]);

const toolbarModeSource = preview.match(/const previewToolbarMode\s*=\s*([^;]+);/);
assert(toolbarModeSource, 'missing pure toolbar mode helper');
const previewToolbarMode = Function(`return (${toolbarModeSource[1]})`)();
assert.equal(previewToolbarMode(1020), 'single');
assert.equal(previewToolbarMode(1019), 'double');
assert.equal(previewToolbarMode(640), 'double');
assert.equal(previewToolbarMode(639), 'drawer');

const previewRoot = { documentElement: { dataset: { dokidokiPreview: '1' } } };
assert.equal(isPreviewPage('file:///D:/dokidoki-preview.html', previewRoot), true);
assert.equal(isPreviewPage('https://hentaiverse.org/?s=Bazaar&ss=ml', previewRoot), false);
assert.equal(isPreviewPage('file:///D:/dokidoki-preview.html', { documentElement: { dataset: {} } }), false);
assert.equal(assetUrl('dragonkin', true), './resource/dokidoki/dist/detail/dragonkin.webp');
assert.equal(listAssetUrl(true), './resource/dokidoki/dist/list-sprite.webp');
assert.match(assetUrl('dragonkin'), /dokidoki-v0\.2\.0\.0\/resource\/dokidoki\/dist\/detail\/dragonkin\.webp$/);

assert.match(script, /--dokidoki-list-portrait-w:48px/);
assert.match(script, /--dokidoki-list-portrait-h:72px/);
assert.match(script, /--dokidoki-detail-portrait-w:280px/);
assert.match(script, /--dokidoki-detail-portrait-h:420px/);
assert.match(script, /@media \(min-width:1180px\)\{#slot_pane\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
assert.match(script, /#slot_pane>\.msl\{[^}]*height:86px!important/);
assert.match(script, /data-dokidoki-group/);
assert(!/#0e0b12|#18121d|#211724|#09070b/i.test(script), 'legacy near-black theme remains');

(async () => {
  const output = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dokidoki-preview-')), 'preview.zip');
  const result = await buildPreviewPackage(workspace, output);
  assert.equal(result.output, output);
  assert(fs.existsSync(output));
  const zip = fs.readFileSync(output);
  assert.equal(zip.readUInt32LE(0), 0x04034b50, 'preview package is not a ZIP');
  for (const entry of [
    'dokidoki-preview.html',
    'dokidoki.js',
    'resource/dokidoki/dist/list-sprite.webp',
    'resource/dokidoki/dist/detail/dragonkin.webp',
  ]) assert(zip.includes(Buffer.from(entry)), `preview ZIP is missing ${entry}`);
  assert.equal(result.files.length, 16);
  console.log('dokidoki offline preview tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
