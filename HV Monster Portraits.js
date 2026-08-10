// ==UserScript==
// @name         HV Monster Portraits
// @namespace    https://hentaiverse.org/
// @version      0.0.1.0
// @description  Adds race-based portraits to the HentaiVerse Monster Lab.
// @author       Reina
// @match        https://hentaiverse.org/*
// @match        https://alt.hentaiverse.org/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const RACES = [
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
  const ASSET_BASE = 'https://cdn.jsdelivr.net/gh/Yogzhro/e-scripts@hvmp-v0.0.1.0/resource/HV%20Monster%20Portraits/dist';
  const DEV_ASSETS = null;
  const warned = new Set();

  function pageType(href) {
    let url;
    try {
      url = new URL(href);
    } catch {
      return '';
    }
    if (url.protocol !== 'https:' || url.port || url.pathname !== '/' || url.hash
      || !['hentaiverse.org', 'alt.hentaiverse.org'].includes(url.hostname)) return '';
    const params = url.searchParams;
    const keys = [...params.keys()];
    if (keys.length !== new Set(keys).size || params.get('s') !== 'Bazaar' || params.get('ss') !== 'ml') return '';
    if (!params.has('slot')) return keys.length === 2 ? 'list' : '';
    if (!/^[1-9]\d*$/.test(params.get('slot') || '') || (params.has('pane') && params.get('pane') !== 'skills')) return '';
    const allowed = new Set(['s', 'ss', 'slot', 'pane']);
    return keys.every(key => allowed.has(key)) && keys.length === (params.has('pane') ? 4 : 3) ? 'detail' : '';
  }

  function raceKey(text) {
    const value = String(text || '').trim();
    const lower = value.toLowerCase();
    for (const [key, english, chinese] of RACES) {
      if (value.includes(chinese) || new RegExp(`(?:^|[^a-z])${english}(?=$|[^a-z])`, 'i').test(lower)) return key;
    }
    return '';
  }

  function warnOnce(key, message) {
    if (warned.has(key)) return;
    warned.add(key);
    console.warn(`[HV Monster Portraits] ${message}`);
  }

  function assetUrl(key) {
    return DEV_ASSETS?.[key] || `${ASSET_BASE}/detail/${key}.webp`;
  }

  function listAssetUrl() {
    return DEV_ASSETS?.list || `${ASSET_BASE}/list-sprite.webp`;
  }

  function syncList(root) {
    for (const row of root.querySelectorAll('#slot_pane > div')) {
      const numberCell = row.children[0];
      const raceCell = row.children[3];
      if (!numberCell?.dataset || !raceCell) continue;
      const key = raceKey(raceCell.textContent);
      if (key) numberCell.dataset.hvmpRace = key;
      else {
        delete numberCell.dataset.hvmpRace;
        const label = String(raceCell.textContent || '').trim();
        if (label) warnOnce(`race:${label}`, `Unknown race: ${label}`);
      }
    }
  }

  function syncDetail(root) {
    const outer = root.querySelector('#monster_outer');
    const head = root.querySelector('#monster_head');
    if (!outer || !head) return;
    const headText = String(head.textContent || '').trim();
    const key = [...head.children].reverse().map(node => raceKey(node.textContent)).find(Boolean)
      || raceKey(headText);
    let panel = outer.querySelector('.hvmp-detail');
    if (!key) {
      panel?.remove();
      if (headText) warnOnce(`detail-race:${headText}`, `Unknown race in monster header: ${headText}`);
      return;
    }
    if (!panel) {
      panel = root.createElement('aside');
      panel.className = 'hvmp-detail';
      panel.setAttribute('aria-hidden', 'true');
      const image = root.createElement('img');
      image.alt = '';
      image.loading = 'eager';
      image.decoding = 'async';
      image.onload = () => delete panel.dataset.hvmpError;
      image.onerror = () => {
        panel.dataset.hvmpError = '1';
        warnOnce(`asset:${panel.dataset.hvmpRace}`, `Portrait failed to load: ${panel.dataset.hvmpRace}`);
      };
      panel.appendChild(image);
      outer.appendChild(panel);
    }
    panel.dataset.hvmpRace = key;
    delete panel.dataset.hvmpError;
    const image = panel.querySelector('img');
    const nextUrl = assetUrl(key);
    if (image.src !== nextUrl) image.src = nextUrl;
  }

  function makeCss() {
    const positions = RACES.map(([key], index) =>
      `#slot_pane>div>div:first-child[data-hvmp-race="${key}"]::after{background-position:-${index * 52}px 0}`
    ).join('');
    return `
#slot_pane>div{height:80px!important;line-height:normal!important;align-items:center}
#slot_pane>div>div{box-sizing:border-box}
#slot_pane>div>div:first-child{display:flex!important;align-items:center;gap:4px;width:76px!important;min-width:76px;height:80px;margin-left:4px!important;white-space:nowrap}
#slot_pane>div>div:first-child[data-hvmp-race]::after{content:"";display:block;flex:0 0 52px;width:52px;height:72px;background-image:url("${listAssetUrl()}");background-repeat:no-repeat;background-size:676px 72px;pointer-events:none}
.hvut-ml-sort>span:first-child{width:86px!important;flex:0 0 86px}
#slot_pane .hvut-ml-feed{top:34px!important}
${positions}
#monster_outer{position:relative}
.hvmp-detail{overflow:hidden;box-sizing:border-box;border:1px solid var(--color-border-default,#5f5145);background:#171418;box-shadow:0 3px 14px #0008;z-index:2}
.hvmp-detail>img{display:block;width:100%;height:100%;object-fit:cover}
.hvmp-detail[data-hvmp-error="1"]>img{visibility:hidden}
@media (min-width:1480px){#mainpane{overflow:visible!important}.hvmp-detail{position:absolute;top:48px;left:calc(100% + 16px);width:300px;height:450px}}
@media (max-width:1479px){#monster_outer{height:auto!important}.hvmp-detail{position:relative;clear:both;width:260px;height:390px;margin:20px auto 0}}
`;
  }

  function apply(root, href) {
    const type = pageType(href);
    if (type === 'list') syncList(root);
    else if (type === 'detail') syncDetail(root);
  }

  function init() {
    if (!pageType(location.href)) return;
    if (!document.getElementById('hvmp-style')) {
      const style = document.createElement('style');
      style.id = 'hvmp-style';
      style.textContent = makeCss();
      document.head.appendChild(style);
    }
    const sprite = new Image();
    sprite.onerror = () => warnOnce('asset:list', 'Portrait sprite failed to load');
    sprite.src = listAssetUrl();
    apply(document, location.href);
    const target = document.querySelector('#monster_outer');
    if (!target) return;
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        apply(document, location.href);
      });
    }).observe(target, { childList: true, subtree: true, characterData: true });
  }

  const api = { RACES, pageType, raceKey, syncList, syncDetail, makeCss, assetUrl };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else init();
})();
