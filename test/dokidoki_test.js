'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const scriptPath = path.resolve(__dirname, '..', 'dokidoki.js');
assert(fs.existsSync(scriptPath), 'missing dokidoki.js');
const source = fs.readFileSync(scriptPath, 'utf8');
const {
  RACES,
  pageType,
  raceKey,
  syncList,
  syncDetail,
  makeCss,
  assetUrl,
} = require(scriptPath);

assert.match(source, /\/\/ @name\s+dokidoki/);
assert.match(source, /\/\/ @version\s+0\.1\.0\.0/);
assert.match(source, /\/\/ @author\s+Reina/);
assert.match(source, /\/\/ @match\s+https:\/\/hentaiverse\.org\/\*/);
assert.match(source, /\/\/ @match\s+https:\/\/alt\.hentaiverse\.org\/\*/);
assert.match(source, /\/\/ @grant\s+none/);
assert.equal((source.match(/new MutationObserver/g) || []).length, 1);
assert(!/\b(?:fetch|XMLHttpRequest|GM_xmlhttpRequest)\s*\(/.test(source));
assert(!source.includes('D:\\trans\\scripts'));
assert(!source.includes('data:image/'));
assert(!/HV Monster Portraits|hvmp-v0\.0\.1\.0|HV%20Monster%20Portraits/.test(source));
assert(source.includes('e-scripts@dokidoki-v0.1.0.0/resource/dokidoki/dist'));

const acceptedUrls = [
  ['https://hentaiverse.org/?s=Bazaar&ss=ml', 'list'],
  ['https://alt.hentaiverse.org/?ss=ml&s=Bazaar', 'list'],
  ['https://hentaiverse.org/?s=Bazaar&ss=ml&slot=1', 'detail'],
  ['https://alt.hentaiverse.org/?pane=skills&slot=200&s=Bazaar&ss=ml', 'detail'],
];
for (const [url, expected] of acceptedUrls) assert.equal(pageType(url), expected, url);
for (const url of [
  'http://hentaiverse.org/?s=Bazaar&ss=ml',
  'https://hentaiverse.org/?s=Bazaar&ss=ar',
  'https://hentaiverse.org/?s=Bazaar&ss=ml&create=new',
  'https://hentaiverse.org/?s=Bazaar&ss=ml&slot=0',
  'https://hentaiverse.org/?s=Bazaar&ss=ml&slot=-1',
  'https://hentaiverse.org/?s=Bazaar&ss=ml&slot=x',
  'https://hentaiverse.org/?s=Bazaar&ss=ml&slot=1&pane=stats',
  'https://hentaiverse.org/?s=Bazaar&ss=ml&slot=1&x=1',
  'https://example.com/?s=Bazaar&ss=ml',
]) assert.equal(pageType(url), '', url);

const expectedRaces = [
  ['arthropod', 'Arthropod', '节肢动物'],
  ['avion', 'Avion', '鸟类'],
  ['beast', 'Beast', '野兽'],
  ['celestial', 'Celestial', '天人'],
  ['daimon', 'Daimon', '魔灵'],
  ['dragonkin', 'Dragonkin', '龙类'],
  ['elemental', 'Elemental', '元素生物'],
  ['giant', 'Giant', '巨人'],
  ['humanoid', 'Humanoid', '类人'],
  ['mechanoid', 'Mechanoid', '机械体'],
  ['reptilian', 'Reptilian', '爬行类'],
  ['sprite', 'Sprite', '妖精'],
  ['undead', 'Undead', '亡灵'],
];
assert.deepEqual(RACES, expectedRaces);
for (const [key, english, chinese] of expectedRaces) {
  assert.equal(raceKey(english), key);
  assert.equal(raceKey(english.toUpperCase()), key);
  assert.equal(raceKey(chinese), key);
  assert.match(assetUrl(key), new RegExp(`/detail/${key}\\.webp$`));
}
assert.equal(raceKey('Unknown'), '');
assert.equal(raceKey('Dragonkin Princess'), 'dragonkin');

function row(race, extraCells = 2) {
  const children = [
    { textContent: '#1', dataset: {} },
    { textContent: 'Monster' },
    { textContent: '750' },
    { textContent: race },
    ...Array.from({ length: extraCells }, () => ({ textContent: '' })),
  ];
  return { children };
}

const nativeRow = row('Dragonkin');
const hvUtilsRow = row('机械体', 5);
const unknownRow = row('Unknown');
const listRoot = {
  querySelectorAll(selector) {
    assert.equal(selector, '#slot_pane > div');
    return [nativeRow, hvUtilsRow, unknownRow];
  },
};
const counts = [nativeRow, hvUtilsRow, unknownRow].map(item => item.children.length);
const warnings = [];
const originalWarn = console.warn;
console.warn = (...parts) => warnings.push(parts.join(' '));
try {
  syncList(listRoot);
  assert.equal(nativeRow.children[0].dataset.dokidokiRace, 'dragonkin');
  assert.equal(hvUtilsRow.children[0].dataset.dokidokiRace, 'mechanoid');
  assert.equal('dokidokiRace' in unknownRow.children[0].dataset, false);
  assert.deepEqual([nativeRow, hvUtilsRow, unknownRow].map(item => item.children.length), counts);
  syncList(listRoot);
  assert.deepEqual([nativeRow, hvUtilsRow, unknownRow].map(item => item.children.length), counts);
  nativeRow.children[3].textContent = '龙类';
  syncList(listRoot);
  assert.equal(nativeRow.children[0].dataset.dokidokiRace, 'dragonkin');
} finally {
  console.warn = originalWarn;
}
assert.equal(warnings.length, 1, 'the same unknown race should warn only once');

function element(tagName) {
  return {
    tagName,
    className: '',
    dataset: {},
    children: [],
    attributes: {},
    appendChild(child) { this.children.push(child); child.parentElement = this; return child; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    querySelector(selector) {
      if (selector === '.dokidoki-detail') return this.children.find(child => child.className === 'dokidoki-detail') || null;
      if (selector === 'img') return this.children.find(child => child.tagName === 'img') || null;
      return null;
    },
    remove() {
      if (!this.parentElement) return;
      this.parentElement.children = this.parentElement.children.filter(child => child !== this);
    },
  };
}

const outer = element('div');
const head = element('div');
head.children = [{ textContent: '1' }, { textContent: 'Monster' }, { textContent: '等级 750' }, { textContent: '龙类' }];
head.textContent = '1 Monster 等级 750 龙类';
const detailRoot = {
  createElement: element,
  querySelector(selector) {
    if (selector === '#monster_outer') return outer;
    if (selector === '#monster_head') return head;
    return null;
  },
};
syncDetail(detailRoot);
assert.equal(outer.children.length, 1);
assert.equal(outer.children[0].dataset.dokidokiRace, 'dragonkin');
assert.match(outer.children[0].querySelector('img').src, /detail\/dragonkin\.webp$/);
syncDetail(detailRoot);
assert.equal(outer.children.length, 1, 'detail sync must be idempotent');
head.children[3].textContent = 'Humanoid';
head.textContent = '1 Monster Level 750 Humanoid';
syncDetail(detailRoot);
assert.equal(outer.children[0].dataset.dokidokiRace, 'humanoid');
const detailImage = outer.children[0].querySelector('img');
assert.match(detailImage.src, /detail\/humanoid\.webp$/);

const detailWarnings = [];
console.warn = (...parts) => detailWarnings.push(parts.join(' '));
try {
  detailImage.onerror();
  detailImage.onerror();
  assert.equal(outer.children[0].dataset.dokidokiError, '1');
  head.children[3].textContent = 'Unknown Detail Race';
  head.textContent = '1 Monster Level 750 Unknown Detail Race';
  syncDetail(detailRoot);
  syncDetail(detailRoot);
} finally {
  console.warn = originalWarn;
}
assert.equal(outer.children.length, 0, 'unknown detail race must not retain a stale portrait');
assert.equal(detailWarnings.length, 2, 'detail asset failure and unknown race should each warn only once');

const css = makeCss();
assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
assert.match(css, /width:84px;height:126px/);
assert.match(css, /background-size:1092px 126px/);
assert.match(css, /@media \(min-width:1480px\)/);
assert.match(css, /width:300px;height:450px/);
assert.match(css, /@media \(max-width:1479px\)/);
assert.match(css, /width:260px;height:390px/);
assert.equal((css.match(/data-dokidoki-race=/g) || []).length, 13);

console.log('dokidoki tests passed.');
