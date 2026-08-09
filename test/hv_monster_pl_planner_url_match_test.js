'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const scriptPath = path.resolve(__dirname, '..', 'HV Monster Manager.js');
const source = fs.readFileSync(scriptPath, 'utf8');
const exactUrls = [
  'https://hentaiverse.org/?s=Bazaar&ss=ml',
  'https://alt.hentaiverse.org/?s=Bazaar&ss=ml',
];

for (const url of exactUrls) {
  assert(
    source.includes(`// @include      ${url}`),
    `userscript metadata must include the exact Monster Lab URL: ${url}`
  );
}
assert(
  !source.includes('// @include      /^'),
  'userscript metadata must not use a broader regular-expression include'
);

assert(
  source.includes('if (!MONSTER_LAB_URLS.includes(location.href)) return;'),
  'the entry guard must use the complete-URL allowlist directly'
);
const isSupportedPage = (url) => exactUrls.includes(url.href);

const cases = [
  [exactUrls[0], true],
  [exactUrls[1], true],
  ['https://hentaiverse.org/?s=Bazaar&ss=ar', false],
  ['https://hentaiverse.org/?s=Bazaar&ss=ml&slot=139', false],
  ['https://hentaiverse.org/?ss=ml&s=Bazaar', false],
  ['https://alt.hentaiverse.org/?s=Bazaar&ss=ar', false],
  ['https://alt.hentaiverse.org/?s=Bazaar&ss=ml&slot=139', false],
  ['http://hentaiverse.org/?s=Bazaar&ss=ml', false],
  ['https://hentaiverse.org/?s=Bazaar&ss=ml#planner', false],
];

for (const [href, expected] of cases) {
  assert.strictEqual(
    isSupportedPage(new URL(href)),
    expected,
    `${href} should ${expected ? '' : 'not '}match`
  );
}

console.log('HV Monster PL Planner strict URL matching tests passed.');
