'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'dokidoki.js'), 'utf8');

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing production function: ${name}`);
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

const pageType = Function(`return (${extractFunction('pageType')});`)();
assert.equal(pageType('https://hentaiverse.org/?s=Bazaar&ss=ml'), 'list');
assert.equal(pageType('https://alt.hentaiverse.org/?s=Bazaar&ss=ml#planner/199'), 'list');
assert.equal(pageType('https://hentaiverse.org/?s=Bazaar&ss=ml#planner/nope'), '');
assert.equal(pageType('https://hentaiverse.org/?s=Bazaar&ss=ml&slot=199#skills'), 'detail');
assert.equal(pageType('https://hentaiverse.org/?s=Bazaar&ss=ml&slot=199&pane=skills'), 'skill-redirect');
assert.equal(pageType('https://hentaiverse.org/?s=Bazaar&ss=ml&slot=199&pane=skills#dokidoki-native'), 'detail');
assert.equal(pageType('https://hentaiverse.org/?s=Bazaar&ss=ar'), '');

const splitRosterRows = Function(`return (${extractFunction('splitRosterRows')});`)();
assert.deepEqual(splitRosterRows([1, 2, 3, 4]), [
  { item: 1, column: 1, row: 1 }, { item: 2, column: 1, row: 2 },
  { item: 3, column: 2, row: 1 }, { item: 4, column: 2, row: 2 },
]);
assert.deepEqual(splitRosterRows([1, 2, 3]).map(item => [item.column, item.row]), [[1, 1], [1, 2], [2, 1]]);

assert.match(source, /\/\/ @version\s+0\.2\.1\.0/);
assert(source.includes("const UI_VERSION = '0.2.1.0'"));
for (const id of ['dokidoki-shell', 'dokidoki-toolbar', 'dokidoki-list-view', 'dokidoki-addon-host', 'dokidoki-lab-nav', 'dokidoki-workspace']) {
  assert(source.includes(id), `missing production UI landmark: ${id}`);
}
for (const marker of [
  'function scheduleRefresh(', 'function syncRoster(', 'function loadSkills(',
  'function groupDetailNodes(', 'Care & Management', 'Combat Attributes', 'Chaos Upgrades',
  'dokidoki-skills', 'dokidoki-tool-drawer', 'hvmm:languagechange',
]) assert(source.includes(marker), `missing dokidoki 0.2.1 behavior: ${marker}`);

const css = extractFunction('makeCss');
assert.match(css, /--dokidoki-list-portrait-w:48px/);
assert.match(css, /--dokidoki-list-portrait-h:72px/);
assert.match(css, /@media \(min-width:1180px\)/);
assert.match(css, /grid-column:var\(--dokidoki-column\)/);
assert.match(css, /#slot_pane[^}]*overflow-y:auto/);
assert.match(css, /grid-template-rows:repeat\(var\(--dokidoki-half-rows\),86px\)/, 'continuous split must use explicit shared rows');
assert.match(source, /--dokidoki-tool-columns/);
assert.match(css, /@container \(min-width:640px\) and \(max-width:1019px\)/);
assert.match(css, /@container \(max-width:639px\)/);
assert.match(css, /--dokidoki-page:#E3E0D1/i);
assert.match(css, /--dokidoki-surface:#F7F2E4/i);

console.log('dokidoki 0.2.1.0 production UI tests passed.');
