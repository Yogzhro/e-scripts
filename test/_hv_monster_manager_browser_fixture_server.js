'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const port = Number(process.argv[2] || 18765);
const sourcePath = path.resolve(__dirname, '..', 'HV Monster Manager.js');
const productionSource = fs.readFileSync(sourcePath, 'utf8');
const dokidokiPath = path.resolve(__dirname, '..', 'dokidoki.js');
const dokidokiProduction = fs.readFileSync(dokidokiPath, 'utf8');
const dokidokiSource = dokidokiProduction.replace('  else init();', '  else window.__DOKIDOKI__ = api;');
if (dokidokiSource === dokidokiProduction) throw new Error('dokidoki fixture export replacement is stale');
const urlGuard = String.raw`  const currentUrl = new URL(location.href);
  const validBase = MONSTER_LAB_URLS.some((href) => new URL(href).origin === currentUrl.origin)
    && currentUrl.pathname === '/'
    && [...currentUrl.searchParams.keys()].length === 2
    && currentUrl.searchParams.get('s') === 'Bazaar'
    && currentUrl.searchParams.get('ss') === 'ml';
  if (!validBase
    || (currentUrl.hash && !/^#planner\/[1-9]\d*$/.test(currentUrl.hash))) return;`;
const fixtureSource = productionSource.replace(
  urlGuard,
  '  // Browser fixture: the production URL allowlist is covered by its dedicated unit test.'
);
if (fixtureSource === productionSource) throw new Error('fixture URL guard replacement is stale');

const levels = {
  STR: 0, DEX: 0, AGI: 0, END: 0, INT: 0, WIS: 0,
  FIRE: 0, COLD: 0, ELEC: 0, WIND: 0, HOLY: 0, DARK: 0,
};
const savedState = {
  language: 'en',
  targetPL: 25,
  priceSource: 'hvut',
  orderPriceSource: 'custom',
  selectedMonsterSlots: ['199'],
};
const savedCache = {
  version: 1,
  monsters: {
    199: { name: 'Old Fixture Alpha', pl: 0, updatedAt: 1234, levels: Object.values(levels) },
  },
  market: {},
};

function html(url) {
  const withDokidoki = url.searchParams.get('dokidoki') === '1';
  const dokidokiBoot = withDokidoki ? `<script src="/dokidoki.js"></script><script>
  const dokidokiStyle=document.createElement('style');dokidokiStyle.id='dokidoki-style';dokidokiStyle.textContent=__DOKIDOKI__.makeCss();document.head.appendChild(dokidokiStyle);
  __DOKIDOKI__.mountListUi(document);__DOKIDOKI__.scheduleRefresh(document);document.dispatchEvent(new CustomEvent('dokidoki:ready'));
  </script>` : '';
  const managerScript = '<script src="/script.js"></script>';
  const scripts = url.searchParams.get('order') === 'manager-first'
    ? `${managerScript}${dokidokiBoot}` : `${dokidokiBoot}${managerScript}`;
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>HV Monster Manager Fixture</title>
<style>
:root{--color-font-default:#5C0D11;--color-font-light:#9B4E03;--color-font-invalid:#666;--color-font-warn:#e00;--color-font-bonus:#03c;--color-border-default:#5C0D11;--color-border-light:#9B4E03;--color-border-alpha:#5C0D1136;--color-bg-default:#EDEBDF;--color-bg-light:#fff;--color-bg-alpha:#fff9;--color-bg-h1:#edb;--color-warn-bg:#fd9;--color-warn-alpha:#fd9c}
body{margin:0;background:#EDEBDF;color:var(--color-font-default);font:10pt Arial}#mainpane{position:relative;width:1236px;height:702px;margin:auto;border:1px solid var(--color-border-default)}#monster_outer{position:relative;margin-left:130px}.hvut-side{position:absolute;z-index:10;width:100px;left:-110px;top:38px;display:flex;flex-direction:column}.hvut-side input{margin:3px 0;padding:1px;white-space:normal}.hvut-none{display:none!important}.hvut-warn{color:var(--color-font-warn)!important}.hvut-bonus{color:var(--color-font-bonus)!important}.hvut-ml-up{position:absolute;top:27px;left:0;width:100%;height:675px;z-index:9;background:var(--color-bg-default);font-size:10pt;text-align:left}#slot_pane{padding-top:35px}#slot_pane>div{display:flex;height:26px;line-height:26px}#slot_pane>div>div{margin-left:10px}#slot_pane>div>div:nth-child(1){width:30px}#slot_pane>div>div:nth-child(2){width:210px}#slot_pane>div>div:nth-child(3){width:60px}#slot_pane>div>div:nth-child(4){width:100px}
</style></head><body><div id="csp"><div id="mainpane"><div id="monster_outer">
<div class="hvut-side hvut-ml-side"><input type="button" value="Gift Summary"><input id="hvut-ml-up-button" type="button" value="Monster Upgrader"><input type="button" value="Power Level Calculator"><input type="button" value="Battle Stats"><input type="button" value="Gift History"><input type="button" value="Export Data"><input type="button" value="Feed All"></div>
<div id="monster_list"><div id="slot_pane">
<div class="msl"><div>199</div><div>Fixture Alpha</div><div>PL 0</div><div>Arthropod</div><div>12</div><div>2</div><div>3</div><div>35</div><div>22400 / 19800</div></div>
<div class="msl"><div>200</div><div>Fixture Beta</div><div>PL 0</div><div>Dragonkin</div><div>8</div><div>1</div><div>0</div><div>19</div><div>21000 / 17600</div></div>
</div><div id="monster_actions"></div></div></div></div></div>
<script>
const fixtureStore=${JSON.stringify(savedState)};
window.fixtureCache=${JSON.stringify(savedCache)};
window.GM_getValue=(key,fallback)=>key==='hv_exact_pl_planner_v1'?JSON.stringify(fixtureStore):key==='hv_monster_manager_cache_v1'?fixtureCache:fallback;
window.GM_setValue=(key,value)=>{ if(key==='hv_exact_pl_planner_v1') Object.assign(fixtureStore,JSON.parse(value)); else if(key==='hv_monster_manager_cache_v1') fixtureCache=value; };
window.GM_addStyle=(css)=>{ const style=document.createElement('style'); style.textContent=css; document.head.appendChild(style); };
localStorage.setItem('hvut_prices',JSON.stringify({'Crystal of Vigor':3,'Crystal of Finesse':3}));
</script>${scripts}</body></html>`;
}

http.createServer((request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  if (url.pathname === '/script.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(fixtureSource);
    return;
  }
  if (url.pathname === '/dokidoki.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(dokidokiSource);
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(html(url));
}).listen(port, '127.0.0.1', () => {
  console.log(`fixture listening on http://127.0.0.1:${port}/`);
});
