'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const port = Number(process.argv[2] || 18766);
const devPath = path.resolve(__dirname, '..', 'resource', 'HV Monster Portraits', '.dev', 'HV Monster Portraits.dev.user.js');
const devSource = fs.readFileSync(devPath, 'utf8');
const fixtureSource = devSource.replace('  else init();', '  else window.__HVMP__ = api;');
if (fixtureSource === devSource) throw new Error('fixture export replacement is stale');

const races = [
  ['Arthropod', '节肢动物'], ['Avion', '鸟类'], ['Beast', '野兽'], ['Celestial', '天人'],
  ['Daimon', '魔灵'], ['Dragonkin', '龙类'], ['Elemental', '元素生物'], ['Giant', '巨人'],
  ['Humanoid', '类人'], ['Mechanoid', '机械体'], ['Reptilian', '爬行类'], ['Sprite', '妖精'],
  ['Undead', '亡灵'],
];

function listRows(chinese, hvutils) {
  return races.map(([english, translated], index) => {
    const base = [`${index + 1}`, `Fixture ${index + 1}`, `PL ${index * 60}`, chinese ? translated : english, 'Status', 'Food'];
    if (hvutils) base.push('Morale', 'Gifts', 'Last gift');
    return `<div class="msl">${base.map((value, cell) => cell === 3
      ? `<div data-en="${english}" data-zh="${translated}">${value}</div>`
      : `<div>${value}</div>`).join('')}</div>`;
  }).join('');
}

function html(url) {
  const type = url.searchParams.get('type') === 'detail' ? 'detail' : 'list';
  const chinese = url.searchParams.get('lang') === 'zh';
  const hvutils = url.searchParams.get('hvutils') === '1';
  const detailRace = chinese ? '龙类' : 'Dragonkin';
  const content = type === 'list'
    ? `<div id="fixture-controls"><button id="toggle-language">Toggle translation</button><button id="reverse-order">Reverse order</button></div><div class="hvut-ml-sort"><span>Slot</span><span>Name</span><span>PL</span><span>Race</span></div><div id="slot_pane">${listRows(chinese, hvutils)}</div>`
    : `<div id="fixture-controls"><button id="toggle-language">Toggle translation</button></div><div id="monster_head"><span>6</span><span>Fixture Dragon</span><span>Level 750</span><span data-en="Dragonkin" data-zh="龙类">${detailRace}</span></div><section class="monster-data"><h1>Monster attributes</h1><p>Read-only responsive portrait fixture.</p></section>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>HV Monster Portraits Fixture</title>
<style>
:root{--color-border-default:#5c0d11}*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#edeadf;color:#5c0d11;font:14px Arial,sans-serif}body{overflow-x:auto}#mainpane{position:relative;width:1180px;min-height:960px;margin:0 auto;padding:24px 0}#monster_outer{position:relative;width:880px;margin-left:30px}#fixture-controls{display:flex;gap:8px;margin-bottom:8px}.hvut-ml-sort{display:flex;height:32px;align-items:center;font-weight:bold;border-bottom:1px solid #9b4e03}.hvut-ml-sort>span{margin-left:10px}.hvut-ml-sort>span:nth-child(2){width:220px}.hvut-ml-sort>span:nth-child(3){width:80px}.hvut-ml-sort>span:nth-child(4){width:110px}#slot_pane>div{display:flex;border-bottom:1px solid #9b4e0338}#slot_pane>div>div{display:flex;align-items:center;margin-left:10px}#slot_pane>div>div:nth-child(2){width:220px}#slot_pane>div>div:nth-child(3){width:80px}#slot_pane>div>div:nth-child(4){width:110px}#slot_pane>div>div:nth-child(n+5){width:84px}.monster-data{width:820px;min-height:650px;padding:22px;border:1px solid #9b4e03;background:#f7f4e8}#monster_head{display:flex;gap:18px;align-items:center;height:40px;font-weight:bold}@media(max-width:1479px){#mainpane{width:min(100%,1180px)}#monster_outer{width:min(calc(100% - 40px),880px);margin:0 auto}body{overflow-x:hidden}}
</style></head><body><div id="mainpane"><main id="monster_outer">${content}</main></div>
<script src="/script.js"></script><script>
const fixtureType=${JSON.stringify(type)};
const style=document.createElement('style');style.id='hvmp-style';style.textContent=__HVMP__.makeCss();document.head.appendChild(style);
const sync=()=>fixtureType==='list'?__HVMP__.syncList(document):__HVMP__.syncDetail(document);
sync();let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;sync();window.__fixtureMutationSynced=true})}).observe(document.querySelector('#monster_outer'),{childList:true,subtree:true,characterData:true});
document.querySelector('#toggle-language').addEventListener('click',()=>{document.querySelectorAll('[data-en][data-zh]').forEach(cell=>{cell.textContent=cell.textContent===cell.dataset.en?cell.dataset.zh:cell.dataset.en})});
document.querySelector('#reverse-order')?.addEventListener('click',()=>{const pane=document.querySelector('#slot_pane');[...pane.children].reverse().forEach(row=>pane.appendChild(row))});
window.__fixtureReady=true;
</script></body></html>`;
}

http.createServer((request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  if (url.pathname === '/script.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(fixtureSource);
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(html(url));
}).listen(port, '127.0.0.1', () => {
  console.log(`portrait fixture listening on http://127.0.0.1:${port}/`);
});
