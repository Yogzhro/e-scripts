// ==UserScript==
// @name         dokidoki
// @namespace    https://hentaiverse.org/
// @version      0.1.1.0
// @description  Rebuilds the HentaiVerse Monster Lab as a portrait-focused gothic interface.
// @author       Reina
// @match        https://hentaiverse.org/*
// @match        https://alt.hentaiverse.org/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const UI_VERSION = '0.1.1.0';
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
  const ASSET_BASE = 'https://cdn.jsdelivr.net/gh/Yogzhro/e-scripts@dokidoki-v0.1.1.0/resource/dokidoki/dist';
  const DEV_ASSETS = null;
  const mountedLists = new WeakMap();
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
    console.warn(`[dokidoki] ${message}`);
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
      if (key) numberCell.dataset.dokidokiRace = key;
      else {
        delete numberCell.dataset.dokidokiRace;
        const label = String(raceCell.textContent || '').trim();
        if (label) warnOnce(`race:${label}`, `Unknown race: ${label}`);
      }
    }
  }

  function mountListUi(root) {
    const existing = root.querySelector('#dokidoki-shell');
    if (existing) {
      existing.dataset.dokidokiVersion = UI_VERSION;
      return existing;
    }
    const outer = root.querySelector('#monster_outer');
    const monsterList = root.querySelector('#monster_list');
    const actions = root.querySelector('#monster_actions');
    const side = root.querySelector('.hvut-ml-side');
    if (!outer || !monsterList || !actions) return null;

    const shell = root.createElement('section');
    const toolbar = root.createElement('nav');
    const listView = root.createElement('div');
    const addonHost = root.createElement('section');
    shell.id = 'dokidoki-shell';
    shell.dataset.dokidokiVersion = UI_VERSION;
    shell.dataset.dokidokiView = 'list';
    toolbar.id = 'dokidoki-toolbar';
    toolbar.setAttribute('aria-label', 'Monster Lab tools');
    listView.id = 'dokidoki-list-view';
    addonHost.id = 'dokidoki-addon-host';
    addonHost.setAttribute('aria-live', 'polite');

    const nodes = [monsterList, actions, side].filter(Boolean);
    const anchors = nodes.map((node) => {
      const anchor = root.createComment(`dokidoki:${node.id || node.className}`);
      node.parentNode.insertBefore(anchor, node);
      return [node, anchor];
    });
    try {
      if (side) toolbar.appendChild(side);
      listView.append(monsterList, actions);
      shell.append(toolbar, listView, addonHost);
      outer.appendChild(shell);
      root.documentElement?.classList.add('dokidoki-active');
      mountedLists.set(root, { shell, anchors });
      return shell;
    } catch (error) {
      for (const [node, anchor] of anchors) {
        if (anchor.parentNode) anchor.parentNode.insertBefore(node, anchor);
        anchor.remove();
      }
      shell.remove();
      throw error;
    }
  }

  function restoreListUi(root) {
    const mounted = mountedLists.get(root);
    if (!mounted) return false;
    for (const [node, anchor] of mounted.anchors) {
      if (anchor.parentNode) anchor.parentNode.insertBefore(node, anchor);
      anchor.remove();
    }
    mounted.shell.remove();
    root.documentElement?.classList.remove('dokidoki-active');
    mountedLists.delete(root);
    return true;
  }

  function syncAddonPanels(root) {
    const shell = root.querySelector('#dokidoki-shell');
    const addonHost = root.querySelector('#dokidoki-addon-host');
    if (!shell || !addonHost) return;
    for (const panel of root.querySelectorAll('.hvut-ml-up, .hvut-ml-plc')) {
      if (panel.parentNode !== addonHost) addonHost.appendChild(panel);
    }
    const hasVisiblePanel = [...addonHost.children]
      .some(panel => !panel.hidden && !panel.classList.contains('hvut-none'));
    shell.dataset.dokidokiView = hasVisiblePanel ? 'addon' : 'list';
  }

  function syncDetail(root) {
    const outer = root.querySelector('#monster_outer');
    const head = root.querySelector('#monster_head');
    if (!outer || !head) return;
    outer.dataset.dokidokiDetail = '1';
    root.documentElement?.classList.add('dokidoki-detail-active');
    const headText = String(head.textContent || '').trim();
    const key = [...head.children].reverse().map(node => raceKey(node.textContent)).find(Boolean)
      || raceKey(headText);
    let panel = outer.querySelector('.dokidoki-detail');
    if (!key) {
      outer.dataset.dokidokiNoPortrait = '1';
      panel?.remove();
      if (headText) warnOnce(`detail-race:${headText}`, `Unknown race in monster header: ${headText}`);
      return;
    }
    delete outer.dataset.dokidokiNoPortrait;
    if (!panel) {
      panel = root.createElement('aside');
      panel.className = 'dokidoki-detail';
      panel.setAttribute('aria-hidden', 'true');
      const image = root.createElement('img');
      image.alt = '';
      image.loading = 'eager';
      image.decoding = 'async';
      image.onload = () => delete panel.dataset.dokidokiError;
      image.onerror = () => {
        panel.dataset.dokidokiError = '1';
        warnOnce(`asset:${panel.dataset.dokidokiRace}`, `Portrait failed to load: ${panel.dataset.dokidokiRace}`);
      };
      panel.appendChild(image);
      outer.appendChild(panel);
    }
    panel.dataset.dokidokiRace = key;
    delete panel.dataset.dokidokiError;
    const image = panel.querySelector('img');
    const nextUrl = assetUrl(key);
    if (image.src !== nextUrl) image.src = nextUrl;
  }

  function makeCss() {
    const positions = RACES.map(([key], index) =>
      `#slot_pane>div>div:first-child[data-dokidoki-race="${key}"]{--dokidoki-x:-${index * 84}px;--dokidoki-x-small:-${index * 64}px}`
    ).join('');
    return `
:root{--dokidoki-bg:#0e0b12;--dokidoki-surface:#18121d;--dokidoki-surface-2:#211724;--dokidoki-border:#704052;--dokidoki-gold:#d3b273;--dokidoki-text:#eee6d8;--dokidoki-muted:#bdaeb5;--dokidoki-wine:#7c2745;--dokidoki-danger:#b94958}
.dokidoki-active body{background:radial-gradient(circle at 70% 0,#2b1726 0,#0e0b12 48%,#09070b 100%) fixed!important;color:var(--dokidoki-text)!important}
.dokidoki-active #mainpane{width:min(1440px,calc(100vw - 24px))!important;max-width:none!important;margin-inline:auto!important;overflow:visible!important}
.dokidoki-active #monster_outer{position:relative!important;width:100%!important;height:auto!important;margin:0!important;color:var(--dokidoki-text)}
#dokidoki-shell{box-sizing:border-box;width:100%;padding:12px;border:1px solid var(--dokidoki-border);border-radius:12px;background:#0e0b12e8;box-shadow:0 18px 55px #0009;font:12px/1.35 Arial,sans-serif;text-align:left}
#dokidoki-toolbar{position:sticky;top:4px;z-index:8;margin-bottom:10px;padding:8px;border:1px solid var(--dokidoki-border);border-radius:9px;background:#18121df2;backdrop-filter:blur(8px)}
#dokidoki-toolbar:empty{display:none}
#dokidoki-toolbar .hvut-ml-side{position:static!important;inset:auto!important;display:flex!important;flex-direction:row!important;flex-wrap:wrap;align-items:stretch;gap:6px;width:100%!important;height:auto!important;margin:0!important;padding:0!important;background:none!important;border:0!important}
#dokidoki-toolbar .hvut-ml-side input,#dokidoki-toolbar .hvut-ml-side button{box-sizing:border-box;flex:1 1 140px;width:auto!important;max-width:220px;min-height:34px!important;margin:0!important;padding:5px 10px!important;border:1px solid var(--dokidoki-border)!important;border-radius:6px;background:linear-gradient(#312131,#1c141f)!important;color:var(--dokidoki-text)!important;font:600 11px/1.15 Arial,sans-serif!important;white-space:normal;cursor:pointer}
#dokidoki-toolbar .hvut-ml-side input:hover,#dokidoki-toolbar .hvut-ml-side button:hover,#dokidoki-toolbar .hvut-ml-side input:focus-visible,#dokidoki-toolbar .hvut-ml-side button:focus-visible{border-color:var(--dokidoki-gold)!important;outline:2px solid #d3b27355;outline-offset:1px}
#dokidoki-shell[data-dokidoki-view="addon"] #dokidoki-list-view,#dokidoki-shell[data-dokidoki-view="list"] #dokidoki-addon-host{display:none}
#dokidoki-addon-host{min-height:560px;border-radius:8px;background:var(--dokidoki-surface);overflow:hidden}
#monster_list{position:relative!important;left:auto!important;top:auto!important;width:100%!important;height:auto!important;margin:0!important}
#slot_pane{display:grid!important;grid-template-columns:1fr;gap:9px;width:100%!important;height:auto!important;max-height:calc(100vh - 235px);min-height:420px;padding:3px 5px 10px 3px!important;overflow-x:hidden!important;overflow-y:auto!important;scrollbar-color:var(--dokidoki-wine) #120e15}
.hvut-ml-sort{position:sticky!important;top:61px;z-index:6;display:flex!important;flex-wrap:wrap;gap:5px;width:100%!important;height:auto!important;min-height:36px;margin:0 0 8px!important;padding:6px!important;border:1px solid var(--dokidoki-border)!important;border-radius:8px;background:#18121df2!important;box-sizing:border-box}
.hvut-ml-sort>span{flex:0 1 auto!important;width:auto!important;min-width:48px!important;margin:0!important;padding:4px 8px!important;border:1px solid #553244;border-radius:999px;background:#261925;color:var(--dokidoki-muted);text-align:center;cursor:pointer}
.hvut-ml-sort>span:hover,.hvut-ml-sort>.hvut-ml-sort-current{border-color:var(--dokidoki-gold);color:var(--dokidoki-gold)}
#slot_pane>div.msl{position:relative!important;display:grid!important;grid-template-columns:96px minmax(130px,1.4fr) minmax(80px,.7fr) minmax(105px,1fr);grid-template-rows:repeat(4,minmax(24px,auto));grid-template-areas:"portrait name pl race" "portrait stats gains gifts" "portrait morale morale morale" "portrait hunger hunger hunger";gap:3px 8px;align-items:center;box-sizing:border-box!important;min-width:0!important;min-height:146px!important;height:auto!important;margin:0!important;padding:7px 10px!important;overflow:hidden;border:1px solid #553244!important;border-radius:10px;background:linear-gradient(135deg,#211724 0,#151017 58%,#23121c 100%)!important;box-shadow:0 5px 16px #0007;color:var(--dokidoki-text)!important;line-height:1.25!important}
#slot_pane>div.msl:hover{border-color:var(--dokidoki-gold)!important;box-shadow:0 7px 22px #000b,0 0 0 1px #d3b27333}
#slot_pane>div.msl>div{position:relative!important;inset:auto!important;box-sizing:border-box!important;min-width:0!important;width:auto!important;height:auto!important;margin:0!important;color:inherit!important;overflow:hidden;text-overflow:ellipsis}
#slot_pane>div.msl>div:nth-child(1){grid-area:portrait;align-self:stretch;display:flex!important;flex-direction:column;align-items:center;justify-content:space-between;gap:2px;color:var(--dokidoki-gold)!important;font-weight:700;text-align:center;white-space:nowrap}
#slot_pane>div.msl>div:nth-child(1)[data-dokidoki-race]::after{content:"";display:block;flex:0 0 126px;width:84px;height:126px;background-image:url("${listAssetUrl()}");background-position:var(--dokidoki-x) 0;background-repeat:no-repeat;background-size:1092px 126px;border-radius:7px;box-shadow:inset 0 0 0 1px #d3b27355,0 3px 10px #0009;pointer-events:none}
#slot_pane>div.msl>div:nth-child(2){grid-area:name;color:var(--dokidoki-text)!important;font-size:14px;font-weight:700;white-space:nowrap}
#slot_pane>div.msl>div:nth-child(3){grid-area:pl;color:var(--dokidoki-gold)!important;font-weight:700}
#slot_pane>div.msl>div:nth-child(4){grid-area:race;color:#d8b7c8!important;font-weight:600}
#slot_pane>div.msl>div:nth-child(5){grid-area:hunger}
#slot_pane>div.msl>div:nth-child(6){grid-area:morale}
#slot_pane>div.msl>div:nth-child(7){grid-area:stats}
#slot_pane>div.msl>div:nth-child(8){grid-area:gains}
#slot_pane>div.msl>div:nth-child(9){grid-area:gifts}
#slot_pane>div.msl .msn{border-color:#6f5363!important;background:#0e0b12!important;color:var(--dokidoki-text)!important}
#slot_pane .hvut-ml-feed{top:auto!important}
#monster_actions{position:relative!important;left:auto!important;top:auto!important;display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;width:100%!important;height:auto!important;margin:12px 0 0!important}
#monster_actions>div{box-sizing:border-box!important;width:auto!important;min-height:86px;height:auto!important;margin:0!important;padding:12px!important;border:1px solid var(--dokidoki-border);border-radius:9px;background:linear-gradient(#211724,#151017);color:var(--dokidoki-text)!important}
${positions}
.dokidoki-detail-active body{background:radial-gradient(circle at 72% 0,#2b1726 0,#0e0b12 48%,#09070b 100%) fixed!important;color:var(--dokidoki-text)!important}
.dokidoki-detail-active #mainpane{width:min(1440px,calc(100vw - 24px))!important;max-width:none!important;margin-inline:auto!important;overflow:visible!important}
#monster_outer[data-dokidoki-detail="1"]{position:relative!important;display:grid!important;gap:14px;width:100%!important;height:auto!important;margin:0!important;padding:14px!important;border:1px solid var(--dokidoki-border);border-radius:12px;background:#0e0b12e8;box-shadow:0 18px 55px #0009;color:var(--dokidoki-text)!important;font:12px/1.35 Arial,sans-serif;text-align:left;box-sizing:border-box}
#monster_outer[data-dokidoki-detail="1"]>:not(.dokidoki-detail){grid-column:1;min-width:0;box-sizing:border-box}
#monster_outer[data-dokidoki-detail="1"]>:not(.dokidoki-detail):not(#monster_head){background-color:var(--dokidoki-surface)!important;color:var(--dokidoki-text)!important}
#monster_outer[data-dokidoki-detail="1"] #monster_head{box-sizing:border-box!important;width:100%!important;height:auto!important;min-height:52px;margin:0!important;padding:10px 14px!important;border:1px solid var(--dokidoki-border);border-radius:9px;background:linear-gradient(110deg,#382335,#19131d);color:var(--dokidoki-text)!important;font-size:14px;font-weight:700}
#monster_outer[data-dokidoki-detail="1"] h1,#monster_outer[data-dokidoki-detail="1"] h2,#monster_outer[data-dokidoki-detail="1"] h3,#monster_outer[data-dokidoki-detail="1"] p,#monster_outer[data-dokidoki-detail="1"] label{color:inherit!important}
#monster_outer[data-dokidoki-detail="1"] input,#monster_outer[data-dokidoki-detail="1"] select,#monster_outer[data-dokidoki-detail="1"] button,#monster_outer[data-dokidoki-detail="1"] textarea{border-color:var(--dokidoki-border)!important;background:#120e15!important;color:var(--dokidoki-text)!important}
#monster_outer[data-dokidoki-detail="1"] input:focus-visible,#monster_outer[data-dokidoki-detail="1"] select:focus-visible,#monster_outer[data-dokidoki-detail="1"] button:focus-visible,#monster_outer[data-dokidoki-detail="1"] textarea:focus-visible{outline:2px solid #d3b27388;outline-offset:1px}
#monster_outer[data-dokidoki-detail="1"] table,#monster_outer[data-dokidoki-detail="1"]>div:not(#monster_head),#monster_outer[data-dokidoki-detail="1"]>form{max-width:100%;border-color:var(--dokidoki-border)!important;background-color:var(--dokidoki-surface)!important;color:var(--dokidoki-text)!important}
.dokidoki-detail{overflow:hidden;box-sizing:border-box;border:1px solid var(--dokidoki-gold);border-radius:12px;background:radial-gradient(circle at 50% 18%,#6e315055,#171018 58%,#09070b);box-shadow:0 14px 38px #000b,inset 0 0 0 1px #d3b27344;z-index:2}
.dokidoki-detail>img{display:block;width:100%;height:100%;object-fit:cover}
.dokidoki-detail[data-dokidoki-error="1"]>img{visibility:hidden}
@media (min-width:1320px){#slot_pane{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:1319px){#slot_pane>div.msl{grid-template-columns:76px minmax(120px,1.4fr) minmax(70px,.6fr) minmax(90px,.9fr);min-height:112px!important;padding:6px 9px!important}#slot_pane>div.msl>div:nth-child(1)[data-dokidoki-race]::after{flex-basis:96px;width:64px;height:96px;background-position:var(--dokidoki-x-small) 0;background-size:832px 96px}}
@media (max-width:899px){.dokidoki-active #mainpane{width:calc(100vw - 10px)!important}#dokidoki-shell{padding:7px;border-radius:8px}#dokidoki-toolbar{position:relative;top:auto;padding:6px}.hvut-ml-sort{top:0}#slot_pane{max-height:none;min-height:0;padding-inline:0!important}#slot_pane>div.msl{grid-template-columns:72px minmax(0,1fr) 68px;grid-template-rows:repeat(5,minmax(22px,auto));grid-template-areas:"portrait name pl" "portrait race stats" "portrait gains gifts" "portrait morale morale" "portrait hunger hunger";gap:2px 6px}#monster_actions{grid-template-columns:1fr}}
@media (min-width:1320px){#monster_outer[data-dokidoki-detail="1"]{grid-template-columns:minmax(0,1fr) 360px;align-items:start}#monster_outer[data-dokidoki-no-portrait="1"]{grid-template-columns:1fr}.dokidoki-detail{position:sticky;top:12px;grid-column:2;grid-row:1/span 999;align-self:start;width:360px;height:540px}}
@media (max-width:1319px){#monster_outer[data-dokidoki-detail="1"]{grid-template-columns:minmax(0,1fr);padding:9px}.dokidoki-detail{position:relative;grid-column:1;grid-row:auto;justify-self:center;order:999;width:280px;height:420px;margin:6px auto}}
`;
  }

  function apply(root, href) {
    const type = pageType(href);
    if (type === 'list') {
      const shell = mountListUi(root);
      if (shell) {
        syncList(root);
        syncAddonPanels(root);
      }
    } else if (type === 'detail') syncDetail(root);
  }

  function init() {
    const type = pageType(location.href);
    if (!type) return;
    if (!document.getElementById('dokidoki-style')) {
      const style = document.createElement('style');
      style.id = 'dokidoki-style';
      style.textContent = makeCss();
      document.head.appendChild(style);
    }
    if (type === 'list') {
      const sprite = new Image();
      sprite.onerror = () => warnOnce('asset:list', 'Portrait sprite failed to load');
      sprite.src = listAssetUrl();
    }
    apply(document, location.href);
    if (type === 'list' && document.querySelector('#dokidoki-shell')) {
      document.dispatchEvent(new CustomEvent('dokidoki:ready'));
    }
    const target = document.querySelector('#mainpane') || document.querySelector('#monster_outer');
    if (!target) return;
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        try {
          apply(document, location.href);
        } catch (error) {
          warnOnce('refresh', `UI refresh failed: ${error.message}`);
          if (type === 'list') restoreListUi(document);
        }
      });
    }).observe(target, { childList: true, subtree: true, characterData: true });
  }

  const api = {
    UI_VERSION, RACES, pageType, raceKey, syncList, mountListUi, restoreListUi,
    syncAddonPanels, syncDetail, makeCss, assetUrl,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else init();
})();
