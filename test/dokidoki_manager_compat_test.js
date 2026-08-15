'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workspace = path.resolve(__dirname, '..');
const dokidoki = fs.readFileSync(path.join(workspace, 'dokidoki.js'), 'utf8');
const manager = fs.readFileSync(path.join(workspace, 'HV Monster Manager.js'), 'utf8');

assert.match(dokidoki, /\/\/ @version\s+0\.2\.1\.0/);
for (const id of ['dokidoki-shell', 'dokidoki-toolbar', 'dokidoki-list-view', 'dokidoki-addon-host']) {
  assert(dokidoki.includes(id), `missing shared dokidoki host: ${id}`);
}
assert(dokidoki.includes("const UI_VERSION = '0.2.1.0'"));
assert(dokidoki.includes("shell.dataset.dokidokiVersion = UI_VERSION"));
assert(dokidoki.includes("shell.dataset.dokidokiView = 'list'"));
assert(dokidoki.includes("new CustomEvent('dokidoki:ready')"));
assert(dokidoki.includes('function mountListUi('));
assert(dokidoki.includes('function restoreListUi('));
assert.match(dokidoki, /@media \(min-width:1180px\)/);
assert.match(dokidoki, /--dokidoki-list-portrait-w:48px/);
assert.match(dokidoki, /--dokidoki-list-portrait-h:72px/);

assert.match(manager, /\/\/ @version\s+0\.3\.6\.7/);
assert(manager.includes("const ADDON_VERSION = '0.3.6.7'"));
assert(manager.includes('function getDokidokiHost('));
assert(manager.includes('function setDokidokiView('));
assert(manager.includes('function syncDokidokiHost('));
assert(manager.includes("document.addEventListener('dokidoki:ready', syncDokidokiHost)"));
assert(manager.includes("document.removeEventListener('dokidoki:ready', syncDokidokiHost)"));
assert(manager.includes("shell.dataset.dokidokiView = visible ? 'addon' : 'list'"));
assert(manager.includes('getDokidokiHost()?.addonHost || host.mainpane'));
assert(manager.includes("document.addEventListener('click', (event) =>"));
assert(manager.includes('event.target.closest?.(`${HVUT.side} input[type="button"], ${HVUT.side} button`)'));
assert.match(manager, /#dokidoki-shell #hvmepp-panel\{/);
assert.match(manager, /#dokidoki-shell #hvmepp-panel\{[^}]*position:relative!important;inset:auto!important;z-index:auto!important/);
assert.match(manager, /\.hvmepp-draft-table\{[^}]*table-layout:fixed/);
assert.match(manager, /\.hvmepp-draft-table input\{[^}]*margin:0!important/);
assert.match(manager, /const EDITOR_TABLE_BANDS = \[\['primary', 'elemental'\], \['chaos'\]\]/);
assert(!manager.includes('hvmepp-upgrade-matrix-wrap'));
assert.match(manager, /dokidokiGroup:\s*'manager'/);
assert.match(manager, /--color-bg-default:var\(--dokidoki-surface\)/);
assert(!manager.includes('DOKIDOKI_STORE_KEY'));
assert(manager.includes("const STORE_KEY = 'hv_exact_pl_planner_v1'"));
assert(manager.includes("const CACHE_KEY = 'hv_monster_manager_cache_v1'"));

console.log('dokidoki and HV Monster Manager compatibility tests passed.');
