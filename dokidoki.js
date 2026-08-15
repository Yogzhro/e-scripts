// ==UserScript==
// @name         dokidoki
// @namespace    https://hentaiverse.org/
// @version      0.2.1.0
// @description  Rebuilds the HentaiVerse Monster Lab as a compact parchment workbench.
// @author       Reina
// @match        https://hentaiverse.org/*
// @match        https://alt.hentaiverse.org/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const UI_VERSION = '0.2.1.0';
  const RACES = [
    ['arthropod', 'Arthropod', '节肢动物'], ['avion', 'Avion', '鸟类'],
    ['beast', 'Beast', '野兽'], ['celestial', 'Celestial', '天人'],
    ['daimon', 'Daimon', '魔灵'], ['dragonkin', 'Dragonkin', '龙类'],
    ['elemental', 'Elemental', '元素生物'], ['giant', 'Giant', '巨人'],
    ['humanoid', 'Humanoid', '类人'], ['mechanoid', 'Mechanoid', '机械体'],
    ['reptilian', 'Reptilian', '爬行类'], ['sprite', 'Sprite', '妖精'],
    ['undead', 'Undead', '亡灵'],
  ];
  const ASSET_BASE = 'https://cdn.jsdelivr.net/gh/Yogzhro/e-scripts@dokidoki-v0.2.0.0/resource/dokidoki/dist';
  const PREVIEW_ASSET_BASE = './resource/dokidoki/dist';
  const DEV_ASSETS = null;
  const TOOL_RULES = [
    ['manager', /PL\s*(?:Planner|计划器)|Monster\s*Rename|怪物重命名/i],
    ['monster', /Monster\s*Upgrader|Power\s*Level|怪物升级|PL\s*计算/i],
    ['data', /Item\s*Prices|Update\s*Wins\/Kills|物品价格|更新.*(?:胜场|击杀)/i],
  ];
  const DETAIL_GROUPS = [
    ['care', 'Care & Management', '照料与管理', /Monster Chow|Happy Pills?|Feed|Morale|Rename|Release Monster|饲料|快乐药丸|喂养|安抚|重命名|释放怪物/i],
    ['chaos', 'Chaos Upgrades', '混沌升级', /Chaos Tokens?|Scavenging|Fortitude|Brutality|Precision|Overpower|Interception|Dissipation|Evasion|Defense|Warding|Swiftness|混沌令牌|寻宝|刚毅|蛮横|精密|压制|拦截|弥散|闪避|防御|魔防|迅捷/i],
    ['combat', 'Combat Attributes', '战斗属性', /Primary attributes|Elemental mitigation|Other stats|Battles Won|Killing Blows|Attack|Defense|Mitigation|主属性|元素减伤|其他属性|战斗胜利|击杀|攻击|防御|减伤/i],
  ];
  const mountedLists = new WeakMap();
  const mountedDetails = new WeakMap();
  const skillLoads = new WeakMap();
  const refreshJobs = new WeakMap();
  const warned = new Set();

  function pageType(href) {
    let url;
    try { url = new URL(href); } catch { return ''; }
    if (url.protocol !== 'https:' || url.port || url.pathname !== '/'
      || !['hentaiverse.org', 'alt.hentaiverse.org'].includes(url.hostname)) return '';
    const params = url.searchParams;
    const keys = [...params.keys()];
    if (keys.length !== new Set(keys).size || params.get('s') !== 'Bazaar' || params.get('ss') !== 'ml') return '';
    if (!params.has('slot')) {
      return keys.length === 2 && (!url.hash || /^#planner\/[1-9]\d*$/.test(url.hash)) ? 'list' : '';
    }
    const allowed = new Set(['s', 'ss', 'slot', 'pane']);
    if (!/^[1-9]\d*$/.test(params.get('slot') || '') || !keys.every(key => allowed.has(key))
      || keys.length !== (params.has('pane') ? 4 : 3)) return '';
    if (params.has('pane')) {
      if (params.get('pane') !== 'skills') return '';
      return !url.hash ? 'skill-redirect' : url.hash === '#dokidoki-native' ? 'detail' : '';
    }
    return !url.hash || url.hash === '#skills' ? 'detail' : '';
  }

  function isPreviewPage(href, root) {
    try {
      return new URL(href).protocol === 'file:' && root?.documentElement?.dataset?.dokidokiPreview === '1';
    } catch { return false; }
  }

  const IS_PREVIEW = typeof location !== 'undefined' && typeof document !== 'undefined'
    && isPreviewPage(location.href, document);

  function raceKey(text) {
    const value = String(text || '').trim();
    for (const [key, english, chinese] of RACES) {
      if (value.includes(chinese) || new RegExp(`(?:^|[^a-z])${english}(?=$|[^a-z])`, 'i').test(value)) return key;
    }
    return '';
  }

  function warnOnce(key, message) {
    if (warned.has(key)) return;
    warned.add(key);
    console.warn(`[dokidoki] ${message}`);
  }

  function assetUrl(key, preview = IS_PREVIEW) {
    return DEV_ASSETS?.[key] || `${preview ? PREVIEW_ASSET_BASE : ASSET_BASE}/detail/${key}.webp`;
  }

  function listAssetUrl(preview = IS_PREVIEW) {
    return DEV_ASSETS?.list || `${preview ? PREVIEW_ASSET_BASE : ASSET_BASE}/list-sprite.webp`;
  }

  function language(root) {
    const selected = root.documentElement?.dataset?.hvmmLanguage;
    if (selected === 'zh' || selected === 'en') return selected;
    return /[\u3400-\u9fff]/.test(root.body?.textContent || '') ? 'zh' : 'en';
  }

  function syncToolGroups(root) {
    const controls = root.querySelectorAll('.hvut-ml-side input, .hvut-ml-side button');
    for (const control of controls) {
      const label = String(control.value || control.textContent || '').trim();
      control.dataset.dokidokiGroup = control.classList.contains('hvmepp-entry')
        ? 'manager'
        : (TOOL_RULES.find(([, pattern]) => pattern.test(label)) || ['utility'])[0];
      if (!control.dataset.dokidokiLabel) control.dataset.dokidokiLabel = label;
      control.title = control.dataset.dokidokiLabel;
      control.setAttribute?.('aria-label', control.dataset.dokidokiLabel);
    }
    const side = root.querySelector?.('.hvut-ml-side');
    side?.style?.setProperty('--dokidoki-tool-count', Math.max(1, controls.length));
    side?.style?.setProperty('--dokidoki-tool-columns', Math.min(9, Math.max(1, controls.length)));
  }

  function listRows(root) {
    return [...root.querySelectorAll(IS_PREVIEW ? '#slot_pane .msl' : '#slot_pane > .msl, #slot_pane > div')]
      .filter((row, index, rows) => row.classList?.contains?.('msl') && rows.indexOf(row) === index);
  }

  function syncList(root) {
    const zh = language(root) === 'zh';
    const labels = [null, null, 'PL', null, zh ? '饥饿' : 'Hunger', zh ? '情绪' : 'Morale', zh ? '胜/杀' : 'W/K', zh ? '新礼' : 'New', zh ? '总礼' : 'Total'];
    for (const row of listRows(root)) {
      const cells = row.children;
      const number = cells[0];
      const key = raceKey(cells[3]?.textContent);
      if (key) number.dataset.dokidokiRace = key;
      else {
        delete number.dataset.dokidokiRace;
        const unknown = String(cells[3]?.textContent || '').trim();
        if (unknown) warnOnce(`race:${unknown}`, `Unknown race: ${unknown}`);
      }
      row.dataset.dokidokiSearch = [...cells].slice(0, 4).map(cell => cell.textContent || '').join(' ').toLowerCase();
      row.dataset.dokidokiSlot = String(number.textContent || '').match(/\d+/)?.[0] || '';
      row.tabIndex = 0;
      row.setAttribute?.('role', 'link');
      labels.forEach((label, index) => {
        if (label && cells[index]?.dataset) cells[index].dataset.dokidokiLabel = label;
      });
      if (number.querySelector && !number.querySelector('[data-dokidoki-profile]')) {
        const button = root.createElement('button');
        button.type = 'button';
        button.dataset.dokidokiProfile = '';
        button.setAttribute('aria-label', zh ? '档案' : 'Profile');
        button.title = zh ? '打开怪物档案' : 'Open monster profile';
        number.appendChild(button);
      }
    }
  }

  function splitRosterRows(items) {
    const cut = Math.ceil(items.length / 2);
    return items.map((item, index) => ({
      item, column: index < cut ? 1 : 2, row: index < cut ? index + 1 : index - cut + 1,
    }));
  }

  function syncRoster(root) {
    const shell = root.querySelector?.('#dokidoki-shell');
    const pane = root.querySelector?.('#slot_pane');
    if (!shell || !pane) return;
    const query = String(shell.querySelector('[data-dokidoki-filter="search"]')?.value || '').trim().toLowerCase();
    const race = shell.querySelector('[data-dokidoki-filter="race"]')?.value || '';
    const rows = listRows(root);
    const visible = rows.filter(row => {
      const show = (!query || row.dataset.dokidokiSearch.includes(query))
        && (!race || row.children[0]?.dataset?.dokidokiRace === race);
      row.hidden = !show;
      return show;
    });
    for (const row of rows) {
      row.style.removeProperty('--dokidoki-column');
      row.style.removeProperty('--dokidoki-row');
    }
    for (const entry of splitRosterRows(visible)) {
      entry.item.style.setProperty('--dokidoki-column', entry.column);
      entry.item.style.setProperty('--dokidoki-row', entry.row);
    }
    pane.style.setProperty('--dokidoki-half-rows', Math.ceil(visible.length / 2));
    shell.dataset.dokidokiVisible = String(visible.length);
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
    const summary = root.querySelector('.hvut-ml-summary');
    if (!outer || !monsterList || !actions) return null;

    const shell = root.createElement('section');
    const toolbar = root.createElement('nav');
    const drawer = root.createElement('details');
    const drawerLabel = root.createElement('summary');
    const workspace = root.createElement('div');
    const labNav = root.createElement('aside');
    const listView = root.createElement('div');
    const addonHost = root.createElement('section');
    const zh = language(root) === 'zh';
    shell.id = 'dokidoki-shell';
    shell.dataset.dokidokiVersion = UI_VERSION;
    shell.dataset.dokidokiView = 'list';
    toolbar.id = 'dokidoki-toolbar';
    toolbar.setAttribute('aria-label', zh ? '怪物实验室工具' : 'Monster Lab tools');
    drawer.id = 'dokidoki-tool-drawer';
    drawer.open = true;
    drawerLabel.textContent = zh ? '实验室工具' : 'Lab tools';
    workspace.id = 'dokidoki-workspace';
    labNav.id = 'dokidoki-lab-nav';
    labNav.innerHTML = `<label><span>${zh ? '搜索' : 'Search'}</span><input data-dokidoki-filter="search" type="search" autocomplete="off"></label><label><span>${zh ? '种族' : 'Race'}</span><select data-dokidoki-filter="race"><option value="">${zh ? '全部种族' : 'All races'}</option>${RACES.map(([key, en, cn]) => `<option value="${key}">${zh ? cn : en}</option>`).join('')}</select></label>`;
    listView.id = 'dokidoki-list-view';
    addonHost.id = 'dokidoki-addon-host';
    addonHost.setAttribute('aria-live', 'polite');
    const nodes = [monsterList, actions, side, summary].filter(Boolean);
    const anchors = nodes.map(node => {
      const anchor = root.createComment(`dokidoki:${node.id || node.className}`);
      node.parentNode.insertBefore(anchor, node);
      return [node, anchor];
    });
    try {
      drawer.appendChild(drawerLabel);
      if (side) drawer.appendChild(side);
      toolbar.appendChild(drawer);
      if (summary) listView.appendChild(summary);
      listView.append(monsterList, actions);
      workspace.append(labNav, listView, addonHost);
      shell.append(toolbar, workspace);
      outer.appendChild(shell);
      root.documentElement?.classList.add('dokidoki-active');
      const refresh = () => scheduleRefresh(root);
      shell.addEventListener('input', refresh);
      shell.addEventListener('change', refresh);
      shell.addEventListener('click', event => {
        const row = event.target.closest?.('#slot_pane > .msl');
        if (!row) return;
        row.focus();
        if (event.target.closest('[data-dokidoki-profile]')) openProfile(row);
      });
      shell.addEventListener('dblclick', event => {
        const row = event.target.closest?.('#slot_pane > .msl');
        if (row) openProfile(row);
      });
      shell.addEventListener('keydown', event => {
        const row = event.target.closest?.('#slot_pane > .msl');
        if (row && event.key === 'Enter') {
          event.preventDefault();
          openProfile(row);
        }
      });
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

  function openProfile(row) {
    const slot = row?.dataset?.dokidokiSlot;
    if (!slot || typeof location === 'undefined') return;
    const url = new URL(location.href);
    url.hash = '';
    url.searchParams.set('slot', slot);
    location.assign(url.href);
  }

  function scheduleRefresh(root) {
    if (refreshJobs.has(root)) return;
    const run = () => {
      refreshJobs.delete(root);
      syncToolGroups(root);
      syncListExtras(root);
      syncList(root);
      syncRoster(root);
      syncAddonPanels(root);
    };
    const frame = root.defaultView?.requestAnimationFrame;
    refreshJobs.set(root, frame ? frame.call(root.defaultView, run) : queueMicrotask(run));
  }

  function syncListExtras(root) {
    const listView = root.querySelector('#dokidoki-list-view');
    const mounted = mountedLists.get(root);
    if (!listView || !mounted) return;
    for (const summary of root.querySelectorAll('.hvut-ml-summary')) {
      if (summary.parentNode === listView) continue;
      const anchor = root.createComment('dokidoki:hvut-ml-summary');
      summary.parentNode.insertBefore(anchor, summary);
      mounted.anchors.push([summary, anchor]);
      listView.prepend(summary);
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
    for (const panel of root.querySelectorAll('.hvut-ml-up, .hvut-ml-plc, #hvmepp-panel')) {
      if (panel.parentNode !== addonHost) addonHost.appendChild(panel);
    }
    shell.dataset.dokidokiView = [...addonHost.children]
      .some(panel => !panel.hidden && !panel.classList.contains('hvut-none')) ? 'addon' : 'list';
  }

  function detailGroupKey(node) {
    if (node?.matches?.('#upgrade_text') || node?.querySelector?.('#upgrade_text')) return 'chaos';
    const text = String(node?.textContent || '').trim();
    return (DETAIL_GROUPS.find(([, , , pattern]) => pattern.test(text)) || DETAIL_GROUPS[2])[0];
  }

  function markDangerZone(node) {
    const descendants = node.querySelectorAll ? [...node.querySelectorAll('button,input,a,p,span,div')].reverse() : [];
    const target = descendants.find(item => /Release Monster|释放怪物/i.test(`${item.value || ''} ${item.textContent || ''}`));
    (target?.closest?.('form,p,div') || target || node).classList?.add('dokidoki-danger-zone');
  }

  function groupDetailNodes(root, content, nodes) {
    const buckets = new Map(DETAIL_GROUPS.map(([key]) => [key, []]));
    for (const node of nodes) buckets.get(detailGroupKey(node)).push(node);
    for (const [key, english, chinese] of DETAIL_GROUPS) {
      const items = buckets.get(key);
      if (!items.length) continue;
      const group = root.createElement('section');
      const title = root.createElement('h2');
      const body = root.createElement('div');
      group.className = 'dokidoki-detail-group';
      group.dataset.dokidokiGroup = key;
      title.dataset.dokidokiTitleEn = english;
      title.dataset.dokidokiTitleZh = chinese;
      body.className = 'dokidoki-detail-group-body';
      for (const node of items) {
        if (key === 'care' && /Release Monster|释放怪物/i.test(node.textContent || '')) markDangerZone(node);
        body.appendChild(node);
      }
      group.append(title, body);
      content.appendChild(group);
    }
  }

  function syncDetailLanguage(root, content) {
    const zh = language(root) === 'zh';
    for (const title of content.querySelectorAll('[data-dokidoki-title-en]')) {
      title.textContent = zh ? title.dataset.dokidokiTitleZh : title.dataset.dokidokiTitleEn;
    }
    const planner = content.parentElement?.querySelector('.dokidoki-planner-link');
    if (planner) planner.textContent = zh ? '在 PL 计划器中升级' : 'Upgrade in PL Planner';
    const summary = content.querySelector('#dokidoki-skills>summary');
    if (summary) summary.textContent = zh ? '技能编辑' : 'Skill editor';
  }

  function syncDetail(root) {
    const outer = root.querySelector('#monster_outer');
    const head = root.querySelector('#monster_head');
    if (!outer || !head) return;
    outer.dataset.dokidokiDetail = '1';
    root.documentElement?.classList.add('dokidoki-detail-active');
    const text = String(head.textContent || '').trim();
    const key = [...head.children].reverse().map(node => raceKey(node.textContent)).find(Boolean) || raceKey(text);
    let portrait = outer.querySelector('.dokidoki-detail');
    if (!key) {
      outer.dataset.dokidokiNoPortrait = '1';
      portrait?.remove();
      if (text) warnOnce(`detail-race:${text}`, `Unknown race in monster header: ${text}`);
      return;
    }
    delete outer.dataset.dokidokiNoPortrait;
    if (!portrait) {
      portrait = root.createElement('aside');
      portrait.className = 'dokidoki-detail';
      const image = root.createElement('img');
      image.alt = '';
      image.loading = 'eager';
      image.decoding = 'async';
      image.onload = () => delete portrait.dataset.dokidokiError;
      image.onerror = () => {
        portrait.dataset.dokidokiError = '1';
        warnOnce(`asset:${portrait.dataset.dokidokiRace}`, `Portrait failed to load: ${portrait.dataset.dokidokiRace}`);
      };
      portrait.appendChild(image);
      outer.appendChild(portrait);
    }
    portrait.dataset.dokidokiRace = key;
    delete portrait.dataset.dokidokiError;
    const image = portrait.querySelector('img');
    const next = assetUrl(key);
    if (image.src !== next) image.src = next;
    const mounted = mountedDetails.get(root);
    if (mounted) { syncDetailLanguage(root, mounted.content); return; }
    if (!root.defaultView) return;
    const url = new URL(root.defaultView.location.href);
    const nativeSkills = url.searchParams.get('pane') === 'skills';
    const slot = url.searchParams.get('slot');
    const planner = root.createElement('a');
    planner.className = 'dokidoki-planner-link';
    planner.href = `?s=Bazaar&ss=ml#planner/${slot}`;
    portrait.appendChild(planner);
    const content = root.createElement('main');
    content.id = 'dokidoki-detail-content';
    const original = [...outer.children].filter(node => node !== portrait);
    const skillForm = nativeSkills ? root.querySelector('#skillform') : null;
    const skillOwner = skillForm && original.find(node => node === skillForm || node.contains?.(skillForm));
    if (head.parentElement === outer) content.appendChild(head);
    groupDetailNodes(root, content, original.filter(node => node !== head && node !== skillOwner));
    if (skillOwner) {
      skillOwner.classList?.add('dokidoki-native-skills');
      content.appendChild(skillOwner);
    }
    outer.appendChild(content);
    let skills = skillForm;
    if (!nativeSkills) {
      skills = root.createElement('details');
      skills.id = 'dokidoki-skills';
      skills.innerHTML = `<summary>${language(root) === 'zh' ? '技能编辑' : 'Skill editor'}</summary><div class="dokidoki-skills-body"></div>`;
      skills.addEventListener('toggle', () => skills.open && loadSkills(root, skills));
      content.appendChild(skills);
      if (url.hash === '#skills') {
        skills.open = true;
        loadSkills(root, skills);
      }
    }
    mountedDetails.set(root, { portrait, content, skills });
    syncDetailLanguage(root, content);
  }

  async function loadSkills(root, details, force = false) {
    if (!details || (!force && skillLoads.has(details))) return skillLoads.get(details);
    const body = details.querySelector('.dokidoki-skills-body');
    if (!body) return null;
    body.dataset.state = 'loading';
    body.textContent = language(root) === 'zh' ? '正在载入技能……' : 'Loading skills…';
    const task = (async () => {
      const url = new URL(root.defaultView.location.href);
      url.hash = '';
      url.searchParams.set('pane', 'skills');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await root.defaultView.fetch(url, { credentials: 'same-origin', signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const parsed = new root.defaultView.DOMParser().parseFromString(await response.text(), 'text/html');
        const form = parsed.querySelector('#skillform');
        if (!form) throw new Error('skillform missing');
        form.querySelectorAll('script').forEach(node => node.remove());
        form.action = url.href;
        body.replaceChildren(root.importNode(form, true));
        body.dataset.state = 'ready';
      } catch (error) {
        body.dataset.state = 'error';
        body.innerHTML = `<p>${language(root) === 'zh' ? '技能载入失败。' : 'Skills could not be loaded.'}</p><button type="button" data-dokidoki-retry>${language(root) === 'zh' ? '重试' : 'Retry'}</button> <a href="${url.href}#dokidoki-native">${language(root) === 'zh' ? '打开原生技能页' : 'Open native skill page'}</a>`;
        body.querySelector('[data-dokidoki-retry]')?.addEventListener('click', () => loadSkills(root, details, true), { once: true });
        warnOnce(`skills:${url.searchParams.get('slot')}`, `Skill form failed: ${error.message}`);
      } finally { clearTimeout(timeout); }
    })();
    skillLoads.set(details, task);
    return task;
  }

  function makeCss() {
    const positions = RACES.map(([key], index) => `#slot_pane>.msl>div:first-child[data-dokidoki-race="${key}"]{--dokidoki-x:-${index * 48}px}`).join('');
    return `
:root{--dokidoki-page:#E3E0D1;--dokidoki-surface:#F7F2E4;--dokidoki-surface-2:#EEE5D1;--dokidoki-surface-strong:#FFF9EC;--dokidoki-ink:#3F302B;--dokidoki-muted:#74665D;--dokidoki-line:#B9A78A;--dokidoki-amber:#9B6A24;--dokidoki-brass:#B27A28;--dokidoki-success:#2F6A3B;--dokidoki-danger:#8E2636;--dokidoki-wine:#5C0D11;--dokidoki-shadow:rgba(63,48,43,.16);--dokidoki-list-portrait-w:48px;--dokidoki-list-portrait-h:72px;--dokidoki-detail-portrait-w:280px;--dokidoki-detail-portrait-h:420px;--dokidoki-bg:var(--dokidoki-page);--dokidoki-text:var(--dokidoki-ink)}
.dokidoki-active body,.dokidoki-detail-active body{background:radial-gradient(circle at 80% 0,rgba(178,122,40,.09),transparent 35%),var(--dokidoki-page)!important;color:var(--dokidoki-ink)!important}
.dokidoki-active #mainpane,.dokidoki-detail-active #mainpane{box-sizing:border-box!important;width:min(1480px,calc(100vw - 20px))!important;max-width:none!important;margin-inline:auto!important;overflow:visible!important}
.dokidoki-active #monster_outer{position:relative!important;width:100%!important;height:auto!important;margin:0!important}
#dokidoki-shell{box-sizing:border-box;width:100%;padding:8px;border:1px solid var(--dokidoki-line);border-radius:8px;background:var(--dokidoki-surface);box-shadow:0 8px 24px var(--dokidoki-shadow);color:var(--dokidoki-ink);font:12px/1.4 Verdana,sans-serif;text-align:left}
#dokidoki-toolbar{container-type:inline-size;margin-bottom:8px;padding:6px;border:1px solid var(--dokidoki-line);border-radius:6px;background:var(--dokidoki-surface-2)}
#dokidoki-tool-drawer{display:contents}#dokidoki-tool-drawer>summary{display:none}
#dokidoki-toolbar .hvut-ml-side{position:static!important;inset:auto!important;display:grid!important;grid-template-columns:repeat(var(--dokidoki-tool-columns),minmax(0,1fr));gap:5px;width:100%!important;height:auto!important;margin:0!important;padding:0!important;background:none!important;border:0!important}
#dokidoki-toolbar .hvut-ml-side input,#dokidoki-toolbar .hvut-ml-side button{box-sizing:border-box;width:100%!important;min-width:0;min-height:40px!important;margin:0!important;padding:6px 7px!important;overflow:hidden;border:1px solid var(--dokidoki-line)!important;border-radius:4px;background:var(--dokidoki-surface-strong)!important;color:var(--dokidoki-ink)!important;font:600 11px/1.15 Verdana,sans-serif!important;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}
#dokidoki-toolbar [data-dokidoki-group="data"]{border-left:3px solid var(--dokidoki-muted)!important}#dokidoki-toolbar [data-dokidoki-group="monster"]{border-color:var(--dokidoki-amber)!important}#dokidoki-toolbar [data-dokidoki-group="manager"]{border:2px solid var(--dokidoki-brass)!important;background:#F1DEB7!important}
#dokidoki-toolbar :is(input,button):hover{background:#FFF4D9!important}#dokidoki-toolbar :is(input,button):focus-visible,#dokidoki-shell :is(input,select,button,.msl):focus-visible{outline:3px solid rgba(155,106,36,.42);outline-offset:2px}
#dokidoki-workspace{display:grid;grid-template-columns:210px minmax(0,1fr);align-items:start;gap:8px;min-width:0}
#dokidoki-lab-nav{display:grid;gap:10px;padding:10px;border:1px solid var(--dokidoki-line);border-radius:6px;background:var(--dokidoki-surface-2)}#dokidoki-lab-nav label{display:grid;gap:4px;font-weight:700}#dokidoki-lab-nav :is(input,select){box-sizing:border-box;width:100%;min-height:40px;padding:6px;border:1px solid var(--dokidoki-line);border-radius:4px;background:var(--dokidoki-surface-strong);color:var(--dokidoki-ink)}
#dokidoki-list-view,#dokidoki-addon-host{min-width:0}#dokidoki-shell[data-dokidoki-view="addon"] #dokidoki-list-view,#dokidoki-shell[data-dokidoki-view="list"] #dokidoki-addon-host{display:none}#dokidoki-shell[data-dokidoki-view="addon"] #dokidoki-lab-nav{display:none}#dokidoki-shell[data-dokidoki-view="addon"] #dokidoki-workspace{grid-template-columns:minmax(0,1fr)}
#dokidoki-addon-host{min-height:560px;overflow:hidden;border:1px solid var(--dokidoki-line);border-radius:6px;background:var(--dokidoki-surface)}
#dokidoki-list-view>.hvut-ml-summary{position:relative!important;inset:auto!important;box-sizing:border-box;width:100%!important;max-height:150px;margin:0 0 7px!important;padding:8px!important;overflow:auto;border:1px solid var(--dokidoki-line);border-radius:6px;background:var(--dokidoki-surface-2);color:var(--dokidoki-ink)}
#monster_list{position:relative!important;inset:auto!important;width:100%!important;height:auto!important;margin:0!important}.hvut-ml-sort{position:relative!important;inset:auto!important;display:flex!important;flex-wrap:wrap;gap:4px;box-sizing:border-box;width:100%!important;height:auto!important;min-height:38px;margin:0 0 6px!important;padding:5px!important;border:1px solid var(--dokidoki-line)!important;border-radius:6px;background:var(--dokidoki-surface-2)!important}.hvut-ml-sort>span{position:static!important;box-sizing:border-box!important;width:auto!important;min-width:48px!important;height:auto!important;margin:0!important;padding:5px 8px!important;border:1px solid transparent;border-radius:999px;text-align:center}.hvut-ml-sort>.hvut-ml-sort-current{border-color:var(--dokidoki-brass);background:#F1DEB7}
#slot_pane{display:grid!important;grid-template-columns:minmax(0,1fr);gap:6px;width:100%!important;height:auto!important;max-height:calc(100vh - 210px);min-height:420px;padding:2px 5px 8px 2px!important;overflow-x:hidden!important;overflow-y:auto!important;scrollbar-color:var(--dokidoki-amber) var(--dokidoki-surface-2)}
#slot_pane>.msl{position:relative!important;display:grid!important;grid-template-columns:56px minmax(100px,1.3fr) 68px minmax(76px,.8fr);grid-template-rows:repeat(3,minmax(20px,1fr));grid-template-areas:"portrait name pl race" "portrait record new total" "portrait morale hunger hunger";gap:2px 7px;align-items:center;box-sizing:border-box!important;width:100%!important;max-width:100%!important;min-width:0!important;height:86px!important;margin:0!important;padding:6px 8px!important;overflow:hidden;border:1px solid var(--dokidoki-line)!important;border-radius:6px;background:var(--dokidoki-surface-strong)!important;box-shadow:0 2px 7px var(--dokidoki-shadow);color:var(--dokidoki-ink)!important;line-height:1.2!important;transition:border-color .16s ease,box-shadow .16s ease,transform .16s ease}
#slot_pane>.msl[hidden]{display:none!important}#slot_pane>.msl:hover{border-color:var(--dokidoki-brass)!important;box-shadow:0 4px 12px var(--dokidoki-shadow),inset 3px 0 0 var(--dokidoki-amber);transform:translateY(-1px)}#slot_pane>.msl>div{position:relative!important;inset:auto!important;box-sizing:border-box!important;min-width:0!important;width:auto!important;height:auto!important;margin:0!important;overflow:hidden;color:inherit!important;text-overflow:ellipsis;white-space:nowrap}
#slot_pane>.msl>div:nth-child(1){grid-area:portrait;display:flex!important;align-items:flex-start;justify-content:center;align-self:stretch;padding-top:2px;color:#FFF9EC!important;font-weight:700;z-index:1}#slot_pane>.msl>div:nth-child(1)::before{content:"";position:absolute;inset:0;border-radius:4px;background:var(--dokidoki-ink);z-index:-1}#slot_pane>.msl>div:nth-child(1)[data-dokidoki-race]::after{content:"";position:absolute;left:4px;bottom:1px;width:var(--dokidoki-list-portrait-w);height:var(--dokidoki-list-portrait-h);background-image:url("${listAssetUrl()}");background-position:var(--dokidoki-x) 0;background-repeat:no-repeat;background-size:624px 72px;pointer-events:none}
#slot_pane>.msl>div:nth-child(2){grid-area:name;font:700 14px/1.2 Georgia,serif}#slot_pane>.msl>div:nth-child(3){grid-area:pl;color:var(--dokidoki-amber)!important;font-weight:700}#slot_pane>.msl>div:nth-child(4){grid-area:race;color:var(--dokidoki-muted)!important;font-weight:700}#slot_pane>.msl>div:nth-child(5){grid-area:hunger}#slot_pane>.msl>div:nth-child(6){grid-area:morale}#slot_pane>.msl>div:nth-child(7){grid-area:record}#slot_pane>.msl>div:nth-child(8){grid-area:new}#slot_pane>.msl>div:nth-child(9){grid-area:total}#slot_pane>.msl>div[data-dokidoki-label]::before{content:attr(data-dokidoki-label) " ";color:var(--dokidoki-muted);font-size:10px;font-weight:400}
[data-dokidoki-profile]{display:none;position:absolute;right:2px;bottom:2px;z-index:2;min-width:40px;min-height:40px;border:1px solid var(--dokidoki-brass);border-radius:4px;background:#F1DEB7;color:var(--dokidoki-ink)}[data-dokidoki-profile]::after{content:attr(aria-label)}
#monster_actions{position:relative!important;inset:auto!important;display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;width:100%!important;height:auto!important;margin:8px 0 0!important}#monster_actions>div{box-sizing:border-box!important;width:auto!important;min-height:76px;height:auto!important;margin:0!important;padding:9px!important;border:1px solid var(--dokidoki-line);border-radius:6px;background:var(--dokidoki-surface-2);color:var(--dokidoki-ink)!important}
${positions}
.dokidoki-detail-active #monster_outer[data-dokidoki-detail="1"]{position:relative!important;display:grid!important;grid-template-columns:var(--dokidoki-detail-portrait-w) minmax(0,1fr);align-items:start;gap:10px;box-sizing:border-box;width:min(1240px,100%)!important;height:auto!important;margin:0 auto!important;padding:10px!important;border:1px solid var(--dokidoki-line);border-radius:8px;background:var(--dokidoki-surface);box-shadow:0 8px 24px var(--dokidoki-shadow);color:var(--dokidoki-ink)!important;font:12px/1.4 Verdana,sans-serif;text-align:left}
.dokidoki-detail{position:sticky;top:8px;display:grid;grid-template-rows:var(--dokidoki-detail-portrait-h) auto;overflow:hidden;box-sizing:border-box;width:var(--dokidoki-detail-portrait-w);border:1px solid var(--dokidoki-line);border-radius:7px;background:var(--dokidoki-surface-2)}.dokidoki-detail>img{display:block;width:100%;height:var(--dokidoki-detail-portrait-h);object-fit:cover}.dokidoki-detail[data-dokidoki-error="1"]>img{visibility:hidden}.dokidoki-planner-link{display:flex;align-items:center;justify-content:center;min-height:44px;padding:6px;color:var(--dokidoki-ink);font-weight:700;text-align:center;text-decoration:none;background:#F1DEB7;border-top:1px solid var(--dokidoki-brass)}
#dokidoki-detail-content{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;min-width:0}#dokidoki-detail-content>*{position:relative!important;inset:auto!important;box-sizing:border-box!important;min-width:0!important;max-width:100%!important;width:auto!important;height:auto!important;margin:0!important;padding:8px!important;border:1px solid var(--dokidoki-line)!important;border-radius:6px;background:var(--dokidoki-surface-strong)!important;color:var(--dokidoki-ink)!important}#dokidoki-detail-content :is(#monster_head,#dokidoki-skills,.dokidoki-native-skills,[data-dokidoki-group="combat"],[data-dokidoki-group="chaos"]){grid-column:1/-1}#dokidoki-detail-content #monster_head{border-left:4px solid var(--dokidoki-brass)!important;font:700 16px/1.3 Georgia,serif}.dokidoki-detail-group>h2{margin:0 0 7px;padding-bottom:5px;border-bottom:1px solid var(--dokidoki-brass);font:700 15px/1.25 Georgia,serif}.dokidoki-detail-group-body{display:grid;gap:7px;min-width:0}.dokidoki-detail-group-body>*{position:relative!important;inset:auto!important;box-sizing:border-box!important;max-width:100%!important;width:100%!important;height:auto!important;margin:0!important}.dokidoki-danger-zone{padding:7px!important;border:1px solid var(--dokidoki-danger)!important;border-radius:4px;color:var(--dokidoki-danger)!important}#dokidoki-detail-content :is(input,select,button,textarea){box-sizing:border-box;min-height:36px;border:1px solid var(--dokidoki-line)!important;background:var(--dokidoki-surface)!important;color:var(--dokidoki-ink)!important}#dokidoki-skills>summary{min-height:36px;padding:6px;font-weight:700;cursor:pointer}.dokidoki-skills-body[data-state="loading"]{padding:12px;color:var(--dokidoki-muted)}.dokidoki-skills-body #skillform{position:relative!important;inset:auto!important;width:100%!important;height:auto!important;margin:0!important}
html[data-dokidoki-preview="1"]{min-width:0;background:var(--dokidoki-page)}
@media (min-width:1180px){#slot_pane{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(var(--dokidoki-half-rows),86px)}#slot_pane>.msl{grid-column:var(--dokidoki-column);grid-row:var(--dokidoki-row)}}
@media (max-width:1179px){#dokidoki-workspace{grid-template-columns:190px minmax(0,1fr)}#slot_pane>.msl{grid-column:1;grid-row:auto!important}}
@container (min-width:640px) and (max-width:1019px){#dokidoki-toolbar .hvut-ml-side{grid-template-columns:repeat(5,minmax(0,1fr))}}
@media (max-width:900px){.dokidoki-active #mainpane,.dokidoki-detail-active #mainpane{width:calc(100vw - 8px)!important}.dokidoki-active #csp{box-sizing:border-box!important;width:100%!important;min-width:0!important;overflow-x:hidden!important}#dokidoki-workspace{grid-template-columns:1fr}#dokidoki-lab-nav{grid-template-columns:repeat(2,minmax(0,1fr))}#monster_actions{grid-template-columns:1fr}.dokidoki-detail-active #monster_outer[data-dokidoki-detail="1"]{grid-template-columns:1fr}.dokidoki-detail{position:relative;top:auto;justify-self:center;--dokidoki-detail-portrait-w:240px;--dokidoki-detail-portrait-h:360px}#dokidoki-detail-content{grid-template-columns:1fr}#dokidoki-detail-content>*{grid-column:1!important}}
@container (max-width:639px){#dokidoki-tool-drawer{display:block}#dokidoki-tool-drawer>summary{display:flex;align-items:center;min-height:44px;padding:0 8px;border:1px solid var(--dokidoki-brass);border-radius:4px;background:#F1DEB7;font-weight:700;cursor:pointer}#dokidoki-tool-drawer[open]>summary{margin-bottom:5px}#dokidoki-toolbar .hvut-ml-side{grid-template-columns:repeat(2,minmax(0,1fr))}#dokidoki-toolbar .hvut-ml-side :is(input,button){min-height:44px!important}}
@media (max-width:639px){#dokidoki-lab-nav{grid-template-columns:1fr}#slot_pane{max-height:none;min-height:0}#slot_pane>.msl{grid-template-columns:56px minmax(0,1fr) 62px;grid-template-rows:repeat(4,minmax(18px,1fr));grid-template-areas:"portrait name pl" "portrait race record" "portrait new total" "portrait morale hunger";height:96px!important;padding-right:5px!important}}
@media (hover:none),(pointer:coarse){[data-dokidoki-profile]{display:block}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
`;
  }

  function apply(root, href) {
    const type = IS_PREVIEW ? 'preview' : pageType(href);
    if (type === 'preview') {
      syncToolGroups(root);
      syncList(root);
      return;
    }
    if (type === 'list') {
      if (mountListUi(root)) scheduleRefresh(root);
    } else if (type === 'detail') syncDetail(root);
  }

  function init() {
    const type = IS_PREVIEW ? 'preview' : pageType(location.href);
    if (!type) return;
    if (type === 'skill-redirect') {
      const url = new URL(location.href);
      url.searchParams.delete('pane');
      url.hash = 'skills';
      location.replace(url.href);
      return;
    }
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
    if (type === 'list' && document.querySelector('#dokidoki-shell')) document.dispatchEvent(new CustomEvent('dokidoki:ready'));
    const target = document.querySelector('#mainpane') || document.querySelector('#monster_outer');
    if (!target) return;
    new MutationObserver(() => {
      try {
        if (type === 'list') scheduleRefresh(document);
        else apply(document, location.href);
      } catch (error) {
        warnOnce('refresh', `UI refresh failed: ${error.message}`);
        if (type === 'list') restoreListUi(document);
      }
    }).observe(target, { childList: true, subtree: true, characterData: true });
    document.addEventListener('hvmm:languagechange', () => type === 'list' ? scheduleRefresh(document) : syncDetail(document));
  }

  const api = {
    UI_VERSION, RACES, DETAIL_GROUPS, pageType, isPreviewPage, raceKey, detailGroupKey, syncList, syncToolGroups,
    splitRosterRows, syncRoster, scheduleRefresh, mountListUi, restoreListUi,
    syncListExtras, syncAddonPanels, syncDetail, loadSkills, makeCss, assetUrl, listAssetUrl,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else init();
})();
