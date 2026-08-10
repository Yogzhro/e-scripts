// ==UserScript==
// @name         HV Monster Manager
// @namespace    https://hentaiverse.org/
// @version      0.3.3.0
// @description  HV Utils 4.2.4 add-on for exact-target PL planning, crystal orders and monster renaming.
// @author       KirisameReiko
// @include      https://hentaiverse.org/?s=Bazaar&ss=ml
// @include      https://alt.hentaiverse.org/?s=Bazaar&ss=ml
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  const MONSTER_LAB_URLS = [
    'https://hentaiverse.org/?s=Bazaar&ss=ml',
    'https://alt.hentaiverse.org/?s=Bazaar&ss=ml',
  ];

  if (!MONSTER_LAB_URLS.includes(location.href)) return;

  const HVUT_REQUIRED_VERSION = '4.2.4';
  const ADDON_VERSION = '0.3.3.0';
  const HVUT = Object.freeze({
    side: '.hvut-ml-side',
    upgraderButton: '#hvut-ml-up-button',
    upgraderPanel: '.hvut-ml-up',
    upgraderTable: '.hvut-ml-up-table',
    crystalRows: '.hvut-ml-up-crystal li',
    mainpane: '#mainpane',
    slotRows: '#slot_pane > div.msl',
  });
  const DOKIDOKI = Object.freeze({ shell: '#dokidoki-shell', addonHost: '#dokidoki-addon-host' });
  const STORE_KEY = 'hv_exact_pl_planner_v1';
  const CACHE_KEY = 'hv_monster_manager_cache_v1';
  const CACHE_VERSION = 1;
  const LOG_PREFIX = '[HV Monster Manager]';
  const EPS = 1e-9;
  const PL_SCALE = 2;
  const PRIMARY_COST_BASE = 50;
  const PRIMARY_COST_RATE = 1.555079154;
  const ELEMENTAL_COST_BASE = 10;
  const ELEMENTAL_COST_RATE = 1.26485522;
  const HVUT_REQUEST_INTERVAL_MS = 300;
  const HVUT_MAX_CONNECTIONS = 4;
  const DIRECT_BUY_RETRY_DELAY_MS = 5000;
  const DIRECT_BUY_MAX_RETRIES = 3;
  const RANDOM_RENAME_DIGITS = 6;
  const RANDOM_RENAME_MAX_ATTEMPTS = 8;
  const RANDOM_RENAME_CANDIDATE_ATTEMPTS = 100;

  const ATTRIBUTE_CONFIGS = [
    ['STR', '力量', 'Crystal of Vigor', '力量水晶', 'pa_str', 1],
    ['DEX', '灵巧', 'Crystal of Finesse', '灵巧水晶', 'pa_dex', 1],
    ['AGI', '敏捷', 'Crystal of Swiftness', '敏捷水晶', 'pa_agi', 1],
    ['END', '体质', 'Crystal of Fortitude', '体质水晶', 'pa_end', 1],
    ['INT', '智力', 'Crystal of Cunning', '智力水晶', 'pa_int', 1],
    ['WIS', '智慧', 'Crystal of Knowledge', '智慧水晶', 'pa_wis', 1],
    ['FIRE', '火', 'Crystal of Flames', '火焰水晶', 'er_fire', 0],
    ['COLD', '冰', 'Crystal of Frost', '冰冻水晶', 'er_cold', 0],
    ['ELEC', '雷', 'Crystal of Lightning', '闪电水晶', 'er_elec', 0],
    ['WIND', '风', 'Crystal of Tempest', '疾风水晶', 'er_wind', 0],
    ['HOLY', '圣', 'Crystal of Devotion', '神圣水晶', 'er_holy', 0],
    ['DARK', '暗', 'Crystal of Corruption', '暗黑水晶', 'er_dark', 0],
  ];
  const primary = ATTRIBUTE_CONFIGS.filter((row) => row[5]).map((row) => row[0]);
  const elemental = ATTRIBUTE_CONFIGS.filter((row) => !row[5]).map((row) => row[0]);
  const all = [...primary, ...elemental];
  const displayElemental = ['WIND', 'ELEC', 'FIRE', 'COLD', 'DARK', 'HOLY'];
  const displayAll = [...primary, ...displayElemental];
  const primarySet = new Set(primary);
  // Add new Easter eggs here, one string per line.
  const easterEggMessages = [
    'Isekaijoucho',
    '🍜',
    '⑨',
    'Dokidoki Wakuwaku',
    'wawawaa',
    '( ・_ゝ・)',
    'Rina Hidaka',
    'How high can borrowed wings really fly?',
    'Aizawa Nachu',
    'Soyokaze Ame',
    'Otherside Picnic',
  ];
  const crystalByAttr = Object.fromEntries(ATTRIBUTE_CONFIGS.map((row) => [row[0], row[2]]));
  const upgradeQueryByAttr = Object.fromEntries(ATTRIBUTE_CONFIGS.map((row) => [row[0], row[4]]));

  const crystalNames = all.map((a) => crystalByAttr[a]);
  const attrByCrystal = Object.fromEntries(all.map((attr) => [crystalByAttr[attr], attr]));
  const priceSourceValues = ['ask', 'bid', 'day', 'week', 'month', 'year', 'hvut'];
  const orderPriceSourceValues = [...priceSourceValues, 'custom'];
  const marketPriceSources = ['ask', 'bid', 'day', 'week', 'month', 'year'];
  const languageOptions = [['en', 'English'], ['zh-CN', '简体中文']];
  const TABLE_HEADER_KEYS = {
    upgrade: ['tableAttr', 'tableCurrentLevel', 'tableTargetLevel', 'tableIncrease', 'tableCost'],
    crystal: ['tableCrystal', 'tableRequired', 'tableStock', 'tableShortage', 'tableEstimatedCost', 'tableOrderPrice'],
  };
  const PLANNER_ACTION_CONFIGS = [
    ['refresh', 'hvmepp-refresh-data', 'buttonRefreshData', 'statusRefreshDataFailed'],
    ['direct', 'hvmepp-direct-buy', 'buttonDirectBuy', 'statusPurchaseFailed'],
    ['order', 'hvmepp-place-buy-orders', 'buttonPlaceBuyOrders', 'statusPurchaseFailed'],
    ['upgrade', 'hvmepp-run-upgrade', 'buttonRunUpgrade', 'statusUpgradeFailed'],
  ];
  const PLANNER_SECTION_CONFIGS = [
    { id: 'hvmepp-crystal-section', headingKey: 'headingCrystalNeeds', className: 'hvmepp-crystal-card', contentId: 'hvmepp-crystal-result', openWhenCustom: true },
    { id: 'hvmepp-upgrade-section', headingKey: 'headingUpgradePlan', className: 'hvmepp-upgrade-card', contentId: 'hvmepp-upgrade-result', collapsible: false },
    { id: 'hvmepp-log-section', headingKey: 'headingLog', className: 'hvmepp-log-card', contentId: 'hvmepp-log-output', contentClass: 'hvmepp-log-output', childIds: ['hvmepp-log-summary', 'hvmepp-log-message'], open: true },
  ];

  const languageIndex = { en: 0, 'zh-CN': 1 };
  const translations = {
    plannerTitle: ["PL Planner", "PL计划器"],
    renameTitle: ["Monster Rename", "怪物重命名"],
    attr: Object.fromEntries(ATTRIBUTE_CONFIGS.map(([attr, label]) => [attr, [attr, label]])),
    crystal: Object.fromEntries(ATTRIBUTE_CONFIGS.map(([attr, , crystal, label]) => [attr, [crystal, label]])),
    labelCurrentPL: ["Current PL", "当前 PL"],
    labelTargetPL: ["Target PL", "目标 PL"],
    labelNeedPL: ["Needed", "还需"],
    labelMaxPL: ["Max", "最大"],
    labelTargetInput: ["Target PL", "目标 PL"],
    labelPriceSource: ["Crystal Market Price", "水晶市场价"],
    labelOrderPriceSource: ["Crystal Buy Price", "水晶收购价"],
    labelSelectedMonsters: ["Selected Monsters", "已选怪物"],
    labelLoadedCount: ["Cached", "已缓存"],
    headingMonsterSelection: ["Select Monsters", "选择怪物"],
    monsterSelectionHelp: ["Click: select one · Ctrl+click: toggle · Shift+click: range · Ctrl+A: select all · Click blank space: clear", "单击：单选 · Ctrl+单击：切换 · Shift+单击：连续选择 · Ctrl+A：全选 · 单击空白处：清空"],
    headingCrystalNeeds: ["Crystal Requirements and Inventory", "水晶需求、库存与缺口"],
    headingMonsterRename: ["Rename", "重命名"],
    headingUpgradePlan: ["Upgrade Plan", "升级方案"],
    headingLog: ["Log", "日志"],
    labelRenameMode: ["Rename Mode", "重命名模式"],
    labelRenameMappingFile: ["TXT Mapping File", "TXT 映射文件"],
    buttonChooseFile: ["Choose File", "选择文件"],
    renameFileNone: ["No file selected", "未选择文件"],
    labelRenameMappingText: ["Number,Current Name,New Name", "编号,当前名称,目标名称"],
    labelRenamePrefix: ["Name Prefix", "名字前缀"],
    renameModeText: ["TXT current-name mapping", "TXT 当前名称映射"],
    renameModeRandom: ["Prefix + 6 random digits", "前缀 + 6 位随机数字"],
    renameMappingHelp: ["One row per monster: number,current name,new name. Export all names to create an editable template.", "每只怪物一行：编号,当前名称,目标名称；可先导出全部名字作为编辑模板。"],
    renameMappingPlaceholder: ["Number,Current Monster Name,New Monster Name", "编号,当前怪物名,新怪物名"],
    renamePrefixPlaceholder: ["Monster", "Monster"],
    renamePreviewSummary: [({ targets, issues }) => `${targets} rename target(s), ${issues} skipped or invalid mapping(s).`, ({ targets, issues }) => `可重命名 ${targets} 个，跳过或无效映射 ${issues} 个。`],
    renamePreviewRandom: [({ prefix }) => `${prefix}###### (a new suffix is generated if the name is occupied)`, ({ prefix }) => `${prefix}######（占用时自动换一个随机后缀）`],
    renameIssueFormat: [({ line }) => `Line ${line}: expected number,current name,new name with exactly two commas.`, ({ line }) => `第 ${line} 行：格式必须是“编号,当前名称,目标名称”，且只能有两个英文逗号。`],
    renameIssueInvalidSlot: [({ line }) => `Line ${line}: monster number must be a positive integer.`, ({ line }) => `第 ${line} 行：怪物编号必须是正整数。`],
    renameIssueDuplicateSlot: [({ line, slot }) => `Line ${line}: duplicate monster number #${slot}.`, ({ line, slot }) => `第 ${line} 行：怪物编号 #${slot} 重复。`],
    renameIssueEmptyName: [({ line }) => `Line ${line}: both names are required.`, ({ line }) => `第 ${line} 行：当前名称和目标名称都不能为空。`],
    renameIssueDuplicateSource: [({ line, name }) => `Line ${line}: duplicate current name "${name}".`, ({ line, name }) => `第 ${line} 行：当前名称“${name}”重复。`],
    renameIssueDuplicateTarget: [({ line, name }) => `Line ${line}: duplicate target name "${name}".`, ({ line, name }) => `第 ${line} 行：目标名称“${name}”重复。`],
    renameIssueSlotNotFound: [({ line, slot }) => `Line ${line}: monster #${slot} was not found.`, ({ line, slot }) => `第 ${line} 行：未找到怪物 #${slot}。`],
    renameIssueSourceMismatch: [({ line, slot, name, actual }) => `Line ${line}: monster #${slot} is currently "${actual}", not "${name}". Export a fresh template before renaming.`, ({ line, slot, name, actual }) => `第 ${line} 行：怪物 #${slot} 当前名称是“${actual}”，不是“${name}”；请重新导出最新模板后再改名。`],
    renameIssueAlreadyNamed: [({ line, name }) => `Line ${line}: "${name}" already has the requested name.`, ({ line, name }) => `第 ${line} 行：“${name}”已经是目标名称。`],
    crystalPlanUnavailable: ["Crystal actions are unavailable until every selected monster has a valid plan. Review the monster errors below.", "全部选中怪物都得到有效方案后才能使用水晶功能"],
    buttonRefreshData: ["Refresh Data", "刷新数据"],
    buttonReloadPage: ["Reload Page", "重新加载页面"],
    buttonDirectBuy: ["Direct Buy Crystals", "直接买入水晶"],
    buttonPlaceBuyOrders: ["Place Crystal Buy Orders", "挂水晶买单"],
    buttonRunUpgrade: ["Upgrade Selected Monsters", "升级选中怪物"],
    buttonRunRename: ["Rename Monsters", "执行怪物重命名"],
    buttonExportNames: ["Export All Monster Names", "导出全部怪物名字"],
    buttonRunningUpgrade: [({ current, total }) => `Upgrading ${current}/${total}`, ({ current, total }) => `升级中 ${current}/${total}`],
    buttonRunningRename: [({ current, total }) => `Renaming ${current}/${total}`, ({ current, total }) => `重命名中 ${current}/${total}`],
    buttonBuying: [({ current, total }) => `Buying ${current}/${total}`, ({ current, total }) => `买入中 ${current}/${total}`],
    buttonPlacingOrders: [({ current, total }) => `Placing orders ${current}/${total}`, ({ current, total }) => `挂单中 ${current}/${total}`],
    totalCost: ["Total Cost:", "总成本："],
    totalMonsters: ["Monsters:", "怪物数："],
    noUpgradeNeeded: ["No upgrade needed", "无需升级"],
    tableAttr: ["Attribute", "属性"],
    tableCurrentLevel: ["Current Level", "当前等级"],
    tableTargetLevel: ["Upgrade To", "需要提升到"],
    tableIncrease: ["Increase", "提升"],
    tableCost: ["Cost", "成本"],
    tableCrystal: ["Crystal", "水晶"],
    tableRequired: ["Required", "需要"],
    tableStock: ["Stock", "库存"],
    tableShortage: ["Shortage", "缺口"],
    tableEstimatedCost: ["Full Spend Estimate", "完整预估消耗"],
    tableOrderPrice: ["Buy Price / Batch", "收购价 / 每批"],
    stockUnknown: ["Not loaded", "未读取"],
    estimateUnavailable: ["Read order books first", "请先读取订单簿"],
    estimateNoSellOrders: ["No visible sell orders", "当前没有可用卖单"],
    estimatePartial: [({ available, needed }) => `Only ${available}/${needed} required batches are visible. Full spend unavailable.`, ({ available, needed }) => `仅显示所需 ${available}/${needed} 批卖单，无法估算完整消耗。`],
    estimateSummary: [({ cost }) => `Order-book estimated spend: ${cost}. The direct-buy order uses the marginal ask needed to cover each crystal, while matches are charged at their actual ask prices.`, ({ cost }) => `订单簿预估消耗：${cost}，直接买入按覆盖每种水晶所需的边际卖价下单，实际成交仍按各档真实卖价扣款。`],
    estimatePartialSummary: [({ available, needed }) => `Visible sell orders cover ${available}/${needed} required batches. Full spend unavailable; direct buy will refresh the order book before continuing.`, ({ available, needed }) => `当前卖单仅覆盖所需 ${available}/${needed} 批，无法估算完整消耗；直接买入会在继续前刷新订单簿。`],
    listSeparator: [", ", "，"],
    priceSource: {
      ask: ["Ask", "卖价"],
      bid: ["Bid", "买价"],
      day: ["Daily Avg", "日均价"],
      week: ["Weekly Avg", "周均价"],
      month: ["Monthly Avg", "月均价"],
      year: ["Yearly Avg", "年均价"],
      hvut: ["HV Utils Saved", "HV Utils 保存价"],
      custom: ["Custom", "自定义"],
    },
    errorTargetOverMax: [({ max }) => `Target exceeds max reachable PL: ${max}.`, ({ max }) => `目标超过最大可达 PL：${max}。`],
    errorTargetBelowCurrent: [({ current, target }) => `Current PL ${current} is already above target PL ${target}. Deselect this monster or raise the target before upgrading.`, ({ current, target }) => `当前 PL ${current} 已高于目标 PL ${target}，请取消选择该怪物或提高目标后再执行。`],
    errorTargetUnit: ["Cannot upgrade exactly to the target PL: the minimum PL unit is 0.5. Set the target PL to a multiple of 0.5.", "无法精确升级到指定 PL：PL 最小单位是 0.5，请把目标 PL 设为 0.5 的倍数。"],
    errorTargetUnreachable: ["Cannot upgrade exactly to the target PL: this target is unreachable with the current levels and level caps.", "无法精确升级到指定 PL：该目标在当前等级与等级上限下不可达。"],
    errorCalculationPath: ["Calculation path error.", "计算路径异常。"],
    errorParseMonster: ["Could not parse attribute levels from the monster details page. Please confirm the page structure has not changed.", "未能从怪物详情页解析属性等级，请确认怪物详情页结构未变化。"],
    errorParseMonsterInventory: ["Could not confirm all 12 live crystal stocks from the monster response.", "未能从怪物响应页确认全部 12 种水晶的实时库存。"],
    errorHttpRequest: [({ method, status, statusText, path }) => `${method} ${path} returned HTTP ${status}${statusText ? ` (${statusText})` : ''}. The current operation was stopped.`, ({ method, status, statusText, path }) => `${method} ${path} 返回 HTTP ${status}${statusText ? `（${statusText}）` : ''}，当前操作已停止。`],
    errorStateLock: ["HentaiVerse temporarily rejected the request because its state-lock limiter is active. Wait a moment, then retry; the script did not treat the request as successful.", "HentaiVerse 的状态锁限流器暂时拒绝了请求，请稍后重试"],
    errorNoMonsterSelection: ["Select at least one monster first.", "请先至少选择一个怪物。"],
    errorNoRenameMappings: ["Load or enter at least one valid number,current-name,new-name mapping.", "请读取或输入至少一组有效的“编号,当前名称,目标名称”映射。"],
    errorRenameMappingInvalid: [({ details }) => `The TXT mapping contains errors: ${details}`, ({ details }) => `TXT 映射存在错误：${details}`],
    errorNoRenameTargets: ["No monsters matched the rename input.", "没有怪物与重命名输入匹配。"],
    errorRenamePrefix: ["Enter a non-empty name prefix before using random-suffix mode.", "使用随机后缀模式前，请输入非空名字前缀。"],
    errorRenameResponse: [({ slot }) => `Could not parse monster #${slot}'s name from the rename response. Monster rename stopped.`, ({ slot }) => `无法从怪物 #${slot} 的重命名响应解析名称，怪物重命名已停止。`],
    errorRenameUnexpected: [({ slot, expected, actual }) => `Monster #${slot} returned the unexpected name "${actual}" instead of "${expected}". Another tab may have renamed it; monster rename stopped.`, ({ slot, expected, actual }) => `怪物 #${slot} 返回了意外名称“${actual}”，而非“${expected}”；可能有其他标签页同时改名，怪物重命名已停止。`],
    errorRenameCandidate: [({ slot }) => `Could not generate a unique random candidate for monster #${slot}.`, ({ slot }) => `无法为怪物 #${slot} 生成未重复的随机名称。`],
    errorHvutRequired: [({ version }) => `HV Utils ${version} with "Advanced MonsterLab features" enabled is required. The add-on did not start because its Monster Lab host was not found.`, ({ version }) => `需要启用 HV Utils ${version} 的“Advanced MonsterLab features”。未找到其 Monster Lab 宿主，因此附属脚本没有启动。`],
    errorMonstersNotLoaded: ["Some selected monsters have no live levels in this session. Refresh data first.", "本次会话中尚未读取部分选中怪物的实时等级，请先刷新数据。"],
    errorNoValidPlan: ["Calculate a valid multi-monster plan first.", "请先计算出有效的多怪物升级方案。"],
    errorMarketItemForm: [({ crystal }) => `Could not parse the buy order form for ${crystal}. The market page structure may have changed. No order was submitted.`, ({ crystal }) => `无法解析 ${crystal} 的买单表单，市场页面结构可能已变化`],
    errorCrystalBatch: [({ crystal }) => `Could not determine the live market batch size for ${crystal}. No order was submitted.`, ({ crystal }) => `无法从市场详情页确认 ${crystal} 的实际每批数量`],
    errorCrystalBatchChanged: [({ crystal, expected, actual }) => `${crystal}'s market batch size changed from ${expected} to ${actual}. Recalculate before ordering.`, ({ crystal, expected, actual }) => `${crystal} 的市场批量已从 ${expected} 变为 ${actual}，请重新计算后再下单。`],
    errorExistingBuyOrder: [({ crystals }) => `Direct buy stopped before submitting the affected crystal: an existing buy order was found for ${crystals}. Delete it manually or use buy-order mode.`, ({ crystals }) => `直接买入在提交对应水晶前停止：${crystals} 已有买单，请手动删除，或改用“挂水晶买单”模式。`],
    errorDirectRemainder: [({ crystal, batches }) => `Direct buy stopped after the market left ${batches} unmatched ${crystal} batch(es): the response did not provide a usable delete control, so the script could not safely remove the remainder. Check My Buy Orders immediately. Earlier completed matches are not reversed.`, ({ crystal, batches }) => `市场为 ${crystal} 留下了 ${batches} 批未成交余单，但响应页没有可用的撤单控件，脚本无法安全清除余单，因此直接买入已停止，请立即检查“我的买单”`],
    errorOrderNotApplied: [({ crystal }) => `${crystal}'s response showed neither an inventory increase nor a remaining buy order. The result cannot be verified, so processing stopped to avoid submitting a duplicate order.`, ({ crystal }) => `${crystal} 的响应既没有显示库存增加，也没有显示剩余买单，无法确认本次结果，脚本已停止后续处理。`],
    errorOrderResultMismatch: [({ crystal, submitted, matched, remaining }) => `${crystal}'s response could not be reconciled with the submitted order: submitted ${submitted} batch(es), inventory increased by ${matched}, and ${remaining} remained. Processing stopped to prevent duplicate or oversized orders.`, ({ crystal, submitted, matched, remaining }) => `${crystal} 的响应无法与本次订单核对：提交 ${submitted} 批，库存增加 ${matched} 批，响应仍剩 ${remaining} 批，脚本已停止。`],
    errorNoSellOrders: [({ crystal, attempts }) => `Direct buy stopped for ${crystal}: no complete market batch was available after ${attempts} order-book refresh(es). The shop supply price was not used; any earlier completed matches remain completed.`, ({ crystal, attempts }) => `${crystal} 的订单簿刷新 ${attempts} 次后仍没有完整交易批量可买，直接买入已停止，此前已成交的部分保持成交。`],
    errorDirectBalance: [({ crystal, required, balance, batches, price }) => `${crystal}'s next order needs at least ${required} C of available Market Balance: ${batches} batch(es) @ the current marginal ask of ${price} C. Matches are charged at their actual ask prices, so the final spend may be lower. Current balance: ${balance} C. No order was submitted.`, ({ crystal, required, balance, batches, price }) => `${crystal} 的下一笔订单需要至少 ${required} C 市场余额：${batches} 批 × 当前覆盖范围的边际卖价 ${price} C，实际按各档真实卖价成交，最终花费可能更低，当前余额为 ${balance} C，本次没有提交订单。`],
    errorInvalidOrderPrice: [({ crystals }) => `Buy-order submission stopped: no valid per-batch price is available for ${crystals}. Read market data or enter a positive price first.`, ({ crystals }) => `挂买单已停止：${crystals} 没有有效的每批价格，请先读取市场数据，或手动填写正数价格。`],
    errorBuyOrderVerification: [({ crystal, submitted, remaining, expectedPrice, actualPrice }) => `${crystal}'s returned buy order does not match the request: submitted ${submitted} batch(es) @ ${expectedPrice} C, but the response shows ${remaining} batch(es) @ ${actualPrice} C. Processing stopped for review.`, ({ crystal, submitted, remaining, expectedPrice, actualPrice }) => `${crystal} 返回的买单与请求不一致：提交 ${submitted} 批、价格 ${expectedPrice} C/批，但响应显示 ${remaining} 批、价格 ${actualPrice} C/批，脚本已停止。`],
    statusLoadingMonsters: [({ done, total }) => `Refreshing monster levels... ${done}/${total}`, ({ done, total }) => `正在刷新怪物等级... ${done}/${total}`],
    statusReadingHvut: ["Reading current monster levels and crystal inventory from the HV Utils Monster Upgrader...", "正在从 HV Utils 的 Monster Upgrader 读取当前怪物等级和水晶库存……"],
    statusHvutFallback: [({ slots }) => `HV Utils has saved target levels for monster(s) ${slots}; their current levels will be verified from Hentaiverse instead of treating the saved targets as live state.`, ({ slots }) => `HV Utils 为怪物 ${slots} 保存了目标等级；将改从 Hentaiverse 校验当前等级，避免把旧目标当成实时状态。`],
    statusHvutStale: ["Monster or inventory data changed. Reload the page before using HV Utils Monster Upgrader again.", "怪物或库存数据已经变化；再次使用 HV Utils Monster Upgrader 前请重新加载页面。"],
    statusLoadedMonsters: [({ total }) => `Refreshed ${total} selected monster(s) for this session.`, ({ total }) => `本次会话已刷新 ${total} 个选中怪物的等级。`],
    statusRenameFileLoaded: [({ file, mappings, errors }) => `Loaded ${file}: ${mappings} valid mapping(s), ${errors} error(s).`, ({ file, mappings, errors }) => `已读取 ${file}：有效映射 ${mappings} 条，错误 ${errors} 条。`],
    statusRenameFileReadFailed: [({ message }) => `Could not read the TXT mapping file: ${message}`, ({ message }) => `读取 TXT 映射文件失败：${message}`],
    statusRenameExported: [({ total }) => `Exported ${total} monster name(s) as an editable numbered template.`, ({ total }) => `已导出 ${total} 个怪物名字，文件可直接作为带编号的改名模板。`],
    statusRenameExportFailed: [({ message }) => `Could not export monster names: ${message}`, ({ message }) => `导出怪物名字失败：${message}`],
    statusRenaming: [({ current, total, slot, name }) => `Renaming ${current}/${total}: monster #${slot} → ${name}`, ({ current, total, slot, name }) => `重命名 ${current}/${total}：怪物 #${slot} → ${name}`],
    statusRenameComplete: [({ renamed, occupied, skipped }) => `Monster rename complete: ${renamed} renamed, ${occupied} occupied/rejected, ${skipped} skipped.`, ({ renamed, occupied, skipped }) => `怪物重命名完成：成功 ${renamed} 个，占用或被拒绝 ${occupied} 个，跳过 ${skipped} 个。`],
    statusRenameCancelled: ["Monster rename was cancelled before any rename request was sent.", "已取消怪物重命名，未发送任何改名请求。"],
    statusLanguageChanged: ["Language changed to English.", "语言已切换为简体中文。"],
    statusReadingMarket: [({ done = 0, total = 12 }) => done
        ? `Reading crystal details (inventory, batch size, orders, and price history)... ${done}/${total}`
        : 'Reading crystal index and details...', ({ done = 0, total = 12 }) => done
        ? `读取水晶详情（库存、批量、订单和历史价格）... ${done}/${total}`
        : '正在读取水晶列表与详情...'],
    statusInventoryPartial: [({ failed }) => `The current operation stopped because inventory or live batch data could not be confirmed for: ${failed}.`, ({ failed }) => `无法确认以下所需水晶的库存或实时交易批量，本次操作已停止：${failed}。`],
    statusMarketPartial: [({ complete, failed }) => `Market data was only partially refreshed. Complete current price sets are available for ${complete}/12 crystals; incomplete live data: ${failed}. Existing session or HV Utils values were retained where possible.`, ({ complete, failed }) => `市场数据仅部分刷新成功，当前有完整价格数据的水晶为 ${complete}/12，实时数据不完整：${failed}；可用时保留本次会话或 HV Utils 的现有值。`],
    statusMarketComplete: [({ source }) => `Inventory, batch sizes, order books, and price histories were refreshed for all 12 crystals. Calculation price source: ${source}.`, ({ source }) => `12 种水晶的库存、交易批量、订单簿和历史价格均已刷新；当前计算价格来源：${source}。`],
    statusRefreshDataComplete: [({ monsters }) => `Refresh complete: ${monsters} selected monster level set(s) and all crystal inventory, orders, and prices are current.`, ({ monsters }) => `刷新完成：已更新 ${monsters} 个选中怪物的等级，以及全部水晶库存、订单和价格。`],
    statusRefreshDataPartial: [({ monsters, failed }) => `Refreshed ${monsters} selected monster level set(s), but crystal data is incomplete for: ${failed}.`, ({ monsters, failed }) => `已更新 ${monsters} 个选中怪物的等级，但以下水晶数据不完整：${failed}。`],
    statusNoUpgrade: ["No upgrade is needed.", "无需执行升级。"],
    statusNoShortage: ["The loaded inventory covers this plan; no crystals need to be bought.", "当前库存足够执行方案，无需买入水晶。"],
    statusCrystalShortage: [({ failed }) => `Upgrade stopped because crystal inventory is short: ${failed}.`, ({ failed }) => `已停止升级，水晶库存仍有缺口：${failed}。`],
    statusOrderPricesComplete: [({ source }) => `Buy order source changed to ${source} and current prices were applied; every row remains manually editable.`, ({ source }) => `收购价来源已改为 ${source}，并自动应用当前价格；每种水晶仍可手动调整。`],
    statusOrderPricesPartial: [({ source, updated, failed }) => `Buy order source changed to ${source}; applied ${updated}/12 current prices. Missing: ${failed}. Existing values were kept.`, ({ source, updated, failed }) => `收购价来源已改为 ${source}，已应用 ${updated}/12 项当前价格；缺少：${failed}，这些项目保留原值。`],
    statusCustomOrderPrices: ["Custom crystal buy prices enabled. Enter a price per batch in the expanded crystal section.", "已启用自定义水晶收购价，请在自动展开的水晶栏目中输入每批价格。"],
    statusCheckingMonsters: [({ done, total }) => `Checking selected monsters... ${done}/${total}`, ({ done, total }) => `校验选中怪物... ${done}/${total}`],
    statusLiveReplanning: [({ request, slot, current, target }) => `Live target request ${request}: monster #${slot}, PL ${current} → ${target}. Recalculating from the latest response after every request.`, ({ request, slot, current, target }) => `实时目标请求 ${request}：怪物 #${slot}，PL ${current} → ${target}；每次响应后都会按实际等级重算。`],
    statusExecutingUpgrade: [({ request, slot, attr, count }) => `Executing live target request ${request}: monster #${slot}, ${attr} +${count}`, ({ request, slot, attr, count }) => `执行实时目标请求 ${request}：怪物 #${slot}，${attr} +${count}`],
    statusMonsterTargetReached: [({ slot, target }) => `Monster #${slot} reached target PL ${target}.`, ({ slot, target }) => `怪物 #${slot} 已达到目标 PL ${target}。`],
    statusUpgradeComplete: [({ total, target, requests }) => `Batch upgrade complete: ${total} monster(s) reached target PL ${target} in ${requests} live request(s).`, ({ total, target, requests }) => `批量升级完成：${total} 个怪物均达到目标 PL ${target}，共执行 ${requests} 个实时请求。`],
    statusUpgradeAboveTarget: [({ slot, current, target }) => `Batch stopped: monster #${slot} is at PL ${current}, above target PL ${target}. No further upgrade requests were sent.`, ({ slot, current, target }) => `批量已停止：怪物 #${slot} 当前 PL ${current}，高于目标 PL ${target}，未再发送后续升级请求。`],
    statusUpgradeNoProgress: [({ slot, attr, count }) => `Batch stopped: monster #${slot} did not gain levels after ${attr} +${count}. No further upgrade requests were sent.`, ({ slot, attr, count }) => `批量已停止：怪物 #${slot} 执行 ${attr} +${count} 后等级没有增加，未再发送后续升级请求。`],
    statusUpgradeUnreachable: [({ slot, current, target }) => `Batch stopped: monster #${slot} at PL ${current} can no longer reach target PL ${target} exactly.`, ({ slot, current, target }) => `批量已停止：怪物 #${slot} 当前 PL ${current} 已无法精确达到目标 PL ${target}。`],
    statusCrystalResponseShortage: [({ slot, crystal }) => `Batch stopped: HentaiVerse reported insufficient ${crystal} for monster #${slot}. Live inventory and remaining requirements were refreshed.`, ({ slot, crystal }) => `批量已停止：HentaiVerse 返回怪物 #${slot} 的 ${crystal} 库存不足，已刷新实时库存与剩余需求。`],
    statusCheckingPurchase: ["Refreshing live inventory, batch sizes, sell orders, and existing buy orders before recalculating the crystal shortage...", "正在重新读取实时库存、交易批量、卖单和已有买单，并按最新库存重算水晶缺口..."],
    statusSubmittingDirectOrder: [({ current, total, crystal, batches, crystals, price }) => `Direct buy ${current}/${total}: submitting one ${crystal} order for ${batches} batch(es) (${crystals} crystals) @ the marginal visible ask of ${price} C per batch.`, ({ current, total, crystal, batches, crystals, price }) => `直接买入 ${current}/${total}：${crystal} 本轮只提交一笔订单，买入 ${batches} 批（${crystals} 个），报价为覆盖当前卖单所需的边际价 ${price} C/批。`],
    statusSubmittingBuyOrder: [({ current, total, crystal, batches, crystals, price }) => `Buy order ${current}/${total}: submitting ${batches} ${crystal} batch(es) (${crystals} crystals) @ the selected price of ${price} C per batch.`, ({ current, total, crystal, batches, crystals, price }) => `挂买单 ${current}/${total}：${crystal} 提交 ${batches} 批（${crystals} 个），使用选定价格 ${price} C/批。`],
    statusDirectSweepProgress: [({ crystal, matched, remaining }) => `${crystal}: the latest order matched ${matched} batch(es); ${remaining} batch(es) are still required. Reading the refreshed sell book before the next single order...`, ({ crystal, matched, remaining }) => `${crystal} 本轮成交 ${matched} 批，仍需 ${remaining} 批；正在重新读取卖单，再决定下一笔单一订单。`],
    statusRetryingPurchase: [({ crystal, attempt }) => `${crystal}'s response did not confirm either a match or a remaining order. Waiting before a verification retry (${attempt}/${DIRECT_BUY_MAX_RETRIES})...`, ({ crystal, attempt }) => `${crystal} 的响应没有确认成交，也没有显示剩余买单，等待后重新校验（${attempt}/${DIRECT_BUY_MAX_RETRIES}）...`],
    statusRefreshingSellOrders: [({ crystal, attempt }) => `No complete sell batch is currently visible for ${crystal}. Refreshing the order book (${attempt}/${DIRECT_BUY_MAX_RETRIES})...`, ({ crystal, attempt }) => `${crystal} 当前没有完整交易批量的卖单，正在刷新订单簿（${attempt}/${DIRECT_BUY_MAX_RETRIES}）...`],
    statusDirectBuyComplete: [({ types, batches, crystals }) => `Direct buy completed: ${batches} batch(es) (${crystals} crystals) matched across ${types} crystal type(s). Inventory and order books were refreshed.`, ({ types, batches, crystals }) => `直接买入完成：共为 ${types} 种水晶成交 ${batches} 批（${crystals} 个），库存与订单簿已重新读取。`],
    statusBuyOrdersComplete: [({ types, matched, pending }) => `Buy-order submission completed for ${types} crystal type(s): ${matched} had immediate matches and ${pending} still have a posted remainder.`, ({ types, matched, pending }) => `${types} 种水晶的买单已提交：${matched} 种发生即时成交，${pending} 种仍有挂单余量。`],
    statusSavedPriceSource: [({ source }) => `Using current ${source} prices for calculation.`, ({ source }) => `计算已改用当前 ${source} 价格。`],
    statusSavedPriceSourcePartial: [({ source, updated, failed }) => `Using current ${source} prices for calculation: ${updated}/12 applied. Missing: ${failed}. Existing calculation prices were kept for those items.`, ({ source, updated, failed }) => `计算已改用当前 ${source} 价格：已应用 ${updated}/12 项；缺少 ${failed}，这些项目保留原计算价格。`],
    statusRefreshDataFailed: [({ message }) => `Data refresh stopped: ${message}`, ({ message }) => `刷新数据已停止：${message}`],
    statusUpgradeFailed: [({ message }) => `Upgrade failed: ${message}`, ({ message }) => `执行升级失败：${message}`],
    statusRenameFailed: [({ message }) => `Monster rename stopped: ${message}`, ({ message }) => `怪物重命名已停止：${message}`],
    statusPurchaseFailed: [({ message }) => `Crystal order processing stopped: ${message}`, ({ message }) => `水晶订单处理已停止：${message}`],
    confirmUpgrade: [({ monsters, requests, levels, target }) => `The refreshed plan estimates ${requests} request(s) and ${levels} attribute level(s) for ${monsters} monster(s). Execution will recalculate after every response and stop unless every monster can reach target PL ${target} exactly. Continue?`, ({ monsters, requests, levels, target }) => `刷新后的方案预计对 ${monsters} 个怪物执行 ${requests} 个请求、提升 ${levels} 个属性等级。执行中每次响应后都会实时重算，任一怪物无法精确达到目标 PL ${target} 时立即停止。是否继续？`],
    confirmRename: [({ targets, issues, mode }) => `Rename ${targets} monster(s) using ${mode}. ${issues} mapping(s) will be skipped. Occupied TXT names are reported without changing them; occupied random names use a new suffix, up to ${RANDOM_RENAME_MAX_ATTEMPTS} attempts. Continue?`, ({ targets, issues, mode }) => `将使用“${mode}”重命名 ${targets} 个怪物，另有 ${issues} 条映射会跳过。TXT 目标被占用时只记录失败；随机名称被占用时会换后缀，最多尝试 ${RANDOM_RENAME_MAX_ATTEMPTS} 次。是否继续？`],
    monsterFallback: [({ slot }) => `Monster ${slot}`, ({ slot }) => `怪物 ${slot}`],
  };

  const crystalNameAliases = new Map();
  all.forEach((attr) => {
    const canonical = crystalByAttr[attr];
    [canonical, ...translations.crystal[attr]]
      .forEach((name) => crystalNameAliases.set(name, canonical));
  });

  const defaultPrice = {
    STR: 2.18,
    DEX: 1.52,
    AGI: 1.23,
    END: 1.95,
    INT: 1.25,
    WIS: 1.23,

    FIRE: 1.11,
    COLD: 1.09,
    ELEC: 1.11,
    WIND: 1.11,
    HOLY: 1.09,
    DARK: 1.10,
  };

  function $(q, d = document) {
    return d.querySelector(q);
  }

  function $all(q, d = document) {
    return Array.from(d.querySelectorAll(q));
  }

  function randomEasterEgg(current = '') {
    const candidates = easterEggMessages.filter((message) => message !== current);
    const pool = candidates.length ? candidates : easterEggMessages;
    return pool[Math.floor(Math.random() * pool.length)] || '';
  }

  function htmlToDoc(html) {
    const doc = document.implementation.createHTMLDocument('');
    doc.documentElement.innerHTML = html;
    return doc;
  }

  function elt(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);

    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v === undefined || v === null) return;

      if (k === 'class') {
        e.className = v;
      } else if (k === 'style') {
        e.style.cssText = v;
      } else if (k === 'dataset') {
        Object.assign(e.dataset, v);
      } else if (k === 'text') {
        e.textContent = v;
      } else if (k in e) {
        e[k] = v;
      } else {
        e.setAttribute(k, v);
      }
    });

    if (!Array.isArray(children)) children = [children];

    children.forEach((c) => {
      if (c === null || c === undefined) return;
      e.appendChild(
        typeof c === 'string' || typeof c === 'number'
          ? document.createTextNode(String(c))
          : c
      );
    });

    return e;
  }

  function parseNum(text) {
    const m = String(text || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : NaN;
  }

  function getHvutHost(doc = document) {
    const side = doc.querySelector(HVUT.side);
    const upgraderButton = doc.querySelector(HVUT.upgraderButton);
    const mainpane = doc.querySelector(HVUT.mainpane);
    return side && upgraderButton && mainpane
      ? { side, upgraderButton, mainpane }
      : null;
  }

  function getDokidokiHost(doc = document) { const shell = doc.querySelector(DOKIDOKI.shell), addonHost = doc.querySelector(DOKIDOKI.addonHost); return shell && addonHost ? { shell, addonHost } : null; }
  function setDokidokiView(visible, doc = document) { const shell = getDokidokiHost(doc)?.shell; if (shell) shell.dataset.dokidokiView = visible ? 'addon' : 'list'; }

  function waitForDom(read, timeoutMs, errorMessage) {
    const ready = read();
    if (ready) return Promise.resolve(ready);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        observer.disconnect();
        reject(new Error(errorMessage));
      }, timeoutMs);
      const observer = new MutationObserver(() => {
        const node = read();
        if (!node) return;
        clearTimeout(timeout);
        observer.disconnect();
        resolve(node);
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  function parseHvutMonsterList(doc = document) {
    return $all(HVUT.slotRows, doc).map((row) => {
      const cells = row.children;
      const slot = String(parseNum(cells[0]?.textContent));
      if (!/^\d+$/.test(slot)) return null;
      return {
        index: slot,
        name: String(cells[1]?.textContent || '').trim() || t('monsterFallback', { slot }),
        pl: parseNum(cells[2]?.textContent),
        className: String(cells[3]?.textContent || '').trim(),
        row,
      };
    }).filter(Boolean);
  }

  function parseHvutUpgradeRow(row) {
    const cells = Array.from(row?.cells || []);
    const levelIndexes = [8, 9, 10, 11, 12, 13, 16, 17, 18, 19, 20, 21];
    if (cells.length < 22) return null;
    if ([3, ...levelIndexes].some((index) => cells[index]?.classList?.contains('hvut-ml-up-change'))) {
      return null;
    }

    const levels = normalizeMonsterLevels(Object.fromEntries(
      all.map((attr, index) => [attr, parseNum(cells[levelIndexes[index]]?.textContent)])
    ));
    const slot = String(parseNum(cells[0]?.textContent));
    if (!/^\d+$/.test(slot) || !levels) return null;

    return {
      slot,
      name: String(cells[1]?.textContent || '').trim() || t('monsterFallback', { slot }),
      className: String(cells[2]?.textContent || '').trim(),
      pl: parseNum(cells[3]?.textContent),
      levels,
    };
  }

  function parseHvutCrystalStock(doc = document) {
    const rows = $all(HVUT.crystalRows, doc);
    if (rows.length !== all.length) return null;
    const stocks = {};
    rows.forEach((row, index) => {
      const spans = Array.from(row.querySelectorAll('span'));
      stocks[all[index]] = parseNum(spans.at(-1)?.textContent);
    });
    return all.every((attr) => Number.isFinite(stocks[attr]) && stocks[attr] >= 0)
      ? stocks
      : null;
  }

  async function readHvutUpgradeSnapshot(slots = []) {
    const host = getHvutHost();
    if (!host) throw new Error(t('errorHvutRequired', { version: HVUT_REQUIRED_VERSION }));
    if (runtime.hvutStale) throw new Error(t('statusHvutStale'));

    setStatus(t('statusReadingHvut'));
    const addonPanel = $('#hvmepp-panel');
    const restoreAddonPanel = Boolean(addonPanel && !addonPanel.classList.contains('hvut-none'));
    if (restoreAddonPanel) addonPanel.classList.add('hvut-none');
    let panel = document.querySelector(`${HVUT.upgraderPanel}:not(#hvmepp-panel)`);
    const openedForRead = !panel || panel.classList.contains('hvut-none');
    if (openedForRead) host.upgraderButton.click();

    try {
      const table = await waitForDom(
        () => document.querySelector(HVUT.upgraderTable),
        45000,
        `HV Utils did not create ${HVUT.upgraderTable} within 45000ms.`
      );
      panel = table.closest(HVUT.upgraderPanel) || document.querySelector(`${HVUT.upgraderPanel}:not(#hvmepp-panel)`);
      const wanted = new Set(slots.map(String));
      const monsters = new Map();
      const plannedSlots = [];

      $all('tr', table).slice(1).forEach((row) => {
        const slot = String(parseNum(row.cells[0]?.textContent));
        if (wanted.size && !wanted.has(slot)) return;
        const record = parseHvutUpgradeRow(row);
        if (record) monsters.set(slot, record);
        else if (/^\d+$/.test(slot)) plannedSlots.push(slot);
      });

      const stocks = parseHvutCrystalStock(panel || document);
      if (stocks) applyMonsterStockSnapshot(stocks);
      return { monsters, stocks, plannedSlots };
    } finally {
      panel = document.querySelector(`${HVUT.upgraderPanel}:not(#hvmepp-panel)`);
      if (openedForRead && panel && !panel.classList.contains('hvut-none')) {
        host.upgraderButton.click();
      }
      if (restoreAddonPanel) addonPanel.classList.remove('hvut-none');
    }
  }

  function markHvutStateStale() {
    if (runtime.hvutStale) return;
    runtime.hvutStale = true;
    const upgraderButton = $(HVUT.upgraderButton);
    if (upgraderButton) {
      upgraderButton.disabled = true;
      upgraderButton.title = t('statusHvutStale');
    }

    const panel = $('#hvmepp-panel');
    if (!panel || $('#hvmepp-hvut-stale')) return;
    const reload = renderButton('hvmepp-reload-page', 'buttonReloadPage');
    reload.addEventListener('click', () => location.reload());
    const banner = elt('div', { id: 'hvmepp-hvut-stale', class: 'hvmepp-alert hvut-warn' }, [
      elt('span', { text: t('statusHvutStale'), dataset: { i18n: 'statusHvutStale' } }),
      reload,
    ]);
    const title = panel.querySelector('.hvmepp-title');
    if (title) title.after(banner);
    else panel.prepend(banner);
  }

  function canonicalMonsterName(value) {
    return String(value || '').trim().toLowerCase();
  }

  function parseRenameMappings(text) {
    const entries = [];
    const errors = [];
    const slots = new Set();
    const sourceNames = new Set();
    const targetNames = new Set();
    const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/);

    lines.forEach((rawLine, index) => {
      const value = rawLine.trim();
      if (!value) return;

      const line = index + 1;
      const parts = value.split(',');
      if (parts.length !== 3) {
        errors.push({ line, code: 'format' });
        return;
      }

      const rawSlot = parts[0].trim();
      if (!/^[1-9]\d*$/.test(rawSlot)) {
        errors.push({ line, code: 'invalid-slot' });
        return;
      }
      const slot = String(parseInt(rawSlot, 10));
      const sourceName = parts[1].trim();
      const targetName = parts[2].trim();
      if (!sourceName || !targetName) {
        errors.push({ line, code: 'empty-name' });
        return;
      }

      const sourceKey = canonicalMonsterName(sourceName);
      const targetKey = canonicalMonsterName(targetName);
      if (slots.has(slot)) {
        errors.push({ line, code: 'duplicate-slot', slot });
        return;
      }
      if (sourceNames.has(sourceKey)) {
        errors.push({ line, code: 'duplicate-source', name: sourceName });
        return;
      }
      if (targetNames.has(targetKey)) {
        errors.push({ line, code: 'duplicate-target', name: targetName });
        return;
      }

      slots.add(slot);
      sourceNames.add(sourceKey);
      targetNames.add(targetKey);
      entries.push({ line, slot, sourceName, targetName });
    });

    return { entries, errors };
  }

  function serializeRenameMappings(monsters) {
    const rows = Array.from(monsters || [])
      .map((monster) => ({
        slot: String(monster.index || monster.slot || ''),
        name: String(monster.name || '').trim(),
      }))
      .filter((monster) => /^\d+$/.test(monster.slot) && monster.name)
      .sort((left, right) => Number(left.slot) - Number(right.slot));
    return rows.map((monster) => `${monster.slot},${monster.name},`).join('\n')
      + (rows.length ? '\n' : '');
  }

  function buildTextRenameTargets(monsters, mappings) {
    const monstersBySlot = new Map(monsters.map((monster) => [String(monster.index), monster]));
    const targets = [];
    const issues = [];

    mappings.forEach((mapping) => {
      const monster = monstersBySlot.get(String(mapping.slot));
      if (!monster) {
        issues.push(Object.assign({ code: 'slot-not-found' }, mapping));
        return;
      }
      const actualName = String(monster.name).trim();
      if (canonicalMonsterName(actualName) !== canonicalMonsterName(mapping.sourceName)) {
        issues.push(Object.assign({ code: 'source-mismatch', actualName }, mapping));
        return;
      }
      if (actualName === mapping.targetName) {
        issues.push(Object.assign({ code: 'already-named' }, mapping));
        return;
      }
      targets.push({
        slot: String(monster.index),
        currentName: actualName,
        targetName: mapping.targetName,
        mode: 'text',
      });
    });

    return { targets, issues };
  }

  function filterRenameMappingsBySelection(mappings, selectedSlots) {
    const selected = new Set(selectedSlots.map(String));
    return mappings.filter((mapping) => selected.has(String(mapping.slot)));
  }

  function createRandomRenameCandidate(prefix, usedNames, random = Math.random) {
    const cleanPrefix = String(prefix || '').trim();
    if (!cleanPrefix) return '';

    for (let attempt = 0; attempt < RANDOM_RENAME_CANDIDATE_ATTEMPTS; attempt++) {
      const value = Math.floor(Math.max(0, Math.min(0.999999999, Number(random()) || 0))
        * (10 ** RANDOM_RENAME_DIGITS));
      const suffix = String(value).padStart(RANDOM_RENAME_DIGITS, '0');
      const candidate = `${cleanPrefix}${suffix}`;
      if (!usedNames.has(canonicalMonsterName(candidate))) return candidate;
    }

    return '';
  }

  function parseMonsterRenameResult(doc, previousName, requestedName) {
    const actualName = String(
      doc.querySelector('#monster_head .msl > div:nth-child(2), .msl > div:nth-child(2)')
        ?.textContent || ''
    ).trim();
    if (!actualName) return { status: 'invalid', actualName: '' };
    if (actualName === String(requestedName || '').trim()) {
      return { status: 'success', actualName };
    }
    if (actualName === String(previousName || '').trim()) {
      return { status: 'occupied', actualName };
    }
    return { status: 'unexpected', actualName };
  }

  function renameWithCollisionHandling(target, usedNames, requestRename, random = Math.random) {
    return (async () => {
      const maxAttempts = target.mode === 'random' ? RANDOM_RENAME_MAX_ATTEMPTS : 1;
      let lastResult = { status: 'invalid', actualName: target.currentName };
      let requestedName = String(target.targetName || '').trim();

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (target.mode === 'random') {
          requestedName = createRandomRenameCandidate(target.prefix, usedNames, random);
          if (!requestedName) {
            return {
              status: 'invalid',
              actualName: target.currentName,
              requestedName: '',
              attempts: attempt - 1,
            };
          }
          usedNames.add(canonicalMonsterName(requestedName));
        }

        lastResult = await requestRename(target.slot, target.currentName, requestedName);
        if (lastResult.status !== 'occupied') {
          return Object.assign({}, lastResult, { requestedName, attempts: attempt });
        }
      }

      return Object.assign({}, lastResult, { requestedName, attempts: maxAttempts });
    })();
  }

  function positiveNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function logWarning(event, message, details = {}, error = null) {
    const entry = Object.assign({ event }, details);
    if (error !== null && error !== undefined) {
      entry.reason = error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);
    }
    console.warn(`${LOG_PREFIX} ${message}`, entry);
  }

  function parseStoredJson(value, fallback = null) {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch (e) {
        return fallback;
      }
    }
    return value;
  }

  function isPlainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
  }

  function normalizeLanguage(language) {
    return language === 'zh-CN' ? 'zh-CN' : 'en';
  }

  function t(path, params = {}) {
    const value = path.split('.').reduce((node, key) => node?.[key], translations)
      ?.[languageIndex[state.language] ?? 0];
    return typeof value === 'function' ? value(params) : value ?? path;
  }

  function attrLabel(attr) {
    return t(`attr.${attr}`);
  }

  function crystalLabel(crystalOrAttr) {
    const attr = crystalByAttr[crystalOrAttr] ? crystalOrAttr : attrByCrystal[crystalOrAttr];
    return attr ? t(`crystal.${attr}`) : String(crystalOrAttr || '');
  }

  function canonicalCrystalName(name) {
    return crystalNameAliases.get(String(name || '').trim()) || '';
  }

  function priceSourceLabel(value) {
    return t(`priceSource.${value}`);
  }

  function joinList(values) {
    return values.join(t('listSeparator'));
  }

  function readHvutPriceStore() {
    try {
      const prices = parseStoredJson(localStorage.getItem('hvut_prices'));
      if (isPlainObject(prices)) return prices;
    } catch (e) {
      logWarning(
        'hvutils.price_read.local_failed',
        'HV Utils prices could not be read from the shared localStorage cache.',
        { storage: 'localStorage', key: 'hvut_prices' },
        e
      );
    }

    return {};
  }

  let hvutNextRequestAt = 0;

  async function fetchText(url, data = null) {
    const now = Date.now();
    const wait = Math.max(0, hvutNextRequestAt - now);
    hvutNextRequestAt = Math.max(now, hvutNextRequestAt) + HVUT_REQUEST_INTERVAL_MS;
    if (wait) await sleep(wait);
    const full = new URL(url, location.origin).href;
    const method = data ? 'POST' : 'GET';
    const response = await fetch(full, {
      method,
      body: data || undefined,
      credentials: 'same-origin',
      headers: data ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined,
      redirect: 'follow', cache: 'no-store',
    });
    const text = await response.text();
    if (!response.ok) {
      const parsedUrl = new URL(full);
      throw new Error(t('errorHttpRequest', {
        method,
        status: response.status,
        statusText: response.statusText,
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
      }));
    }
    if (text === 'state lock limiter in effect') throw new Error(t('errorStateLock'));
    return text;
  }

  function normalizeMonsterLevels(levels) {
    if (!isPlainObject(levels) || all.some((a) => !Number.isFinite(Number(levels[a])))) return null;
    return Object.fromEntries(all.map((a) => {
      const value = parseInt(levels[a], 10);
      return [a, Math.max(0, Math.min(maxLevel(a), Number.isFinite(value) ? value : 0))];
    }));
  }

  function restoreMonsterCache(cache, monsterList) {
    if (cache?.version !== CACHE_VERSION || !isPlainObject(cache.monsters)) return new Map();
    const visible = new Map(monsterList.map((monster) => [String(monster.index), monster]));
    const restored = new Map();

    Object.entries(cache.monsters).forEach(([slot, saved]) => {
      const current = visible.get(slot);
      const rawLevels = Array.isArray(saved?.levels)
        ? Object.fromEntries(all.map((attr, index) => [attr, saved.levels[index]]))
        : saved?.levels;
      const levels = normalizeMonsterLevels(rawLevels);
      const cachedPL = Number(saved?.pl);
      if (
        !current || !levels || !Number.isFinite(cachedPL) || !Number.isFinite(Number(current.pl))
        || Math.abs(cachedPL - Number(current.pl)) > EPS
        || Math.abs(totalPL(levels) - cachedPL) > EPS
      ) return;
      restored.set(slot, {
        slot,
        name: String(current.name),
        pl: cachedPL,
        updatedAt: Math.max(0, Math.floor(Number(saved.updatedAt) || 0)),
        levels,
      });
    });
    return restored;
  }

  function restoreMarketCache(cache, hvutPrices) {
    const savedMarket = cache?.version === CACHE_VERSION && isPlainObject(cache.market)
      ? cache.market
      : {};
    const savedCrystals = isPlainObject(savedMarket.crystals) ? savedMarket.crystals : {};
    const restoreOrders = (rows) => Array.isArray(rows) ? rows.map((row) => ({
      crystals: Math.max(0, Math.floor(Number(row?.[0]) || 0)),
      batchPrice: Math.max(0, Math.round(Number(row?.[1]) || 0)),
    })).filter((row) => row.crystals && row.batchPrice) : [];
    const marketData = Object.fromEntries(crystalNames.map((name) => {
      const saved = isPlainObject(savedCrystals[name]) ? savedCrystals[name] : {};
      const prices = Array.isArray(saved.prices) ? saved.prices : [];
      const batchSize = Math.floor(positiveNumber(saved.batchSize));
      const ask = positiveNumber(prices[0]) || undefined;
      const bid = positiveNumber(prices[1]) || undefined;
      const stock = saved.stock === null || saved.stock === undefined ? NaN : Number(saved.stock);
      return [name, {
        itemid: /^\d+$/.test(String(saved.itemid || '')) ? String(saved.itemid) : '',
        stock: Number.isFinite(stock) ? Math.max(0, Math.floor(stock)) : undefined,
        batchSize,
        ask, bid,
        day: positiveNumber(prices[2]) || undefined,
        week: positiveNumber(prices[3]) || undefined,
        month: positiveNumber(prices[4]) || undefined,
        year: positiveNumber(prices[5]) || undefined,
        hvut: positiveNumber(prices[6]) || positiveNumber(hvutPrices[name]) || undefined,
        unitAsk: ask,
        unitBid: bid,
        batchAsk: batchSize && ask ? Math.max(1, Math.round(ask * batchSize)) : 0,
        batchBid: batchSize && bid ? Math.max(1, Math.round(bid * batchSize)) : 0,
        currentOrder: {
          count: Math.max(0, Math.floor(Number(saved.currentOrder?.[0]) || 0)),
          price: Math.max(0, Math.round(Number(saved.currentOrder?.[1]) || 0)),
        },
        askOrders: restoreOrders(saved.asks),
        bidOrders: restoreOrders(saved.bids),
      }];
    }));
    return {
      marketData,
      inventoryLoaded: savedMarket.inventoryLoaded === true
        && crystalNames.every((name) =>
          savedCrystals[name]?.stock !== null && Number.isFinite(Number(savedCrystals[name]?.stock))
        ),
      orderBooksLoaded: savedMarket.orderBooksLoaded === true
        && crystalNames.every((name) =>
          Array.isArray(savedCrystals[name]?.asks) && Array.isArray(savedCrystals[name]?.bids)
        ),
      updatedAt: Math.max(0, Math.floor(Number(savedMarket.updatedAt) || 0)),
    };
  }

  function buildDataCache(monsters, marketData, inventoryLoaded, orderBooksLoaded, marketUpdatedAt) {
    const monsterEntries = [];
    const saveOrders = (rows) => Array.isArray(rows)
      ? rows.map((order) => [Number(order.crystals) || 0, Number(order.batchPrice) || 0])
      : [];
    monsters.forEach((record, slot) => {
      const levels = normalizeMonsterLevels(record?.levels);
      if (!/^\d+$/.test(String(slot)) || !levels) return;
      monsterEntries.push([String(slot), {
        name: String(record.name || ''),
        pl: totalPL(levels),
        updatedAt: Math.max(0, Math.floor(Number(record.updatedAt) || Date.now())),
        levels: all.map((attr) => levels[attr]),
      }]);
    });
    return {
      version: CACHE_VERSION,
      monsters: Object.fromEntries(monsterEntries),
      market: {
        updatedAt: Math.max(0, Math.floor(Number(marketUpdatedAt) || 0)),
        inventoryLoaded: Boolean(inventoryLoaded),
        orderBooksLoaded: Boolean(orderBooksLoaded),
        crystals: Object.fromEntries(crystalNames.map((name) => {
          const row = marketData[name] || {};
          return [name, {
            itemid: String(row.itemid || ''),
            stock: Number.isFinite(Number(row.stock)) ? Math.max(0, Math.floor(Number(row.stock))) : null,
            batchSize: Math.floor(positiveNumber(row.batchSize)),
            prices: marketPriceSources.map((source) => positiveNumber(row[source]) || 0)
              .concat(positiveNumber(row.hvut) || 0),
            currentOrder: [
              Math.max(0, Math.floor(Number(row.currentOrder?.count) || 0)),
              Math.max(0, Math.round(Number(row.currentOrder?.price) || 0)),
            ],
            asks: saveOrders(row.askOrders),
            bids: saveOrders(row.bidOrders),
          }];
        })),
      },
    };
  }

  let storedState = {};
  try {
    const saved = parseStoredJson(GM_getValue(STORE_KEY, '{}'), {});
    if (isPlainObject(saved)) storedState = saved;
  } catch (error) {
    logWarning('storage.settings.read_failed', 'Saved settings could not be read; defaults will be used.', {}, error);
  }
  const state = {
    language: normalizeLanguage(storedState.language),
    targetPL: storedState.targetPL ?? 750,
    priceSource: storedState.priceSource ?? 'ask',
    orderPriceSource: storedState.orderPriceSource ?? 'bid',
    orderUnitPrices: Object.fromEntries(all.map((attr) => [
      attr,
      positiveNumber(storedState.orderUnitPrices?.[attr]) || defaultPrice[attr],
    ])),
    selectedMonsterSlots: Array.isArray(storedState.selectedMonsterSlots)
      ? [...new Set(storedState.selectedMonsterSlots.map(String).filter((slot) => /^\d+$/.test(slot)))]
      : [],
    renameMode: storedState.renameMode ?? 'text',
    renamePrefix: String(storedState.renamePrefix || '').trim(),
  };
  if (!priceSourceValues.includes(state.priceSource)) state.priceSource = 'ask';
  if (!orderPriceSourceValues.includes(state.orderPriceSource)) state.orderPriceSource = 'bid';
  if (!['text', 'random'].includes(state.renameMode)) state.renameMode = 'text';

  const hvutSavedPrices = readHvutPriceStore();
  let storedCache = { version: CACHE_VERSION, monsters: {}, market: {} };
  try {
    const saved = parseStoredJson(GM_getValue(CACHE_KEY, storedCache), storedCache);
    if (isPlainObject(saved)) storedCache = saved;
  } catch (error) {
    logWarning('storage.cache.read_failed', 'Cached Monster Manager data could not be read.', {}, error);
  }
  const restoredMarket = restoreMarketCache(storedCache, hvutSavedPrices);
  const runtime = {
    monsterList: [],
    monsters: new Map(),
    prices: Object.fromEntries(all.map((attr) => [
      attr,
      positiveNumber(restoredMarket.marketData[crystalByAttr[attr]]?.[state.priceSource])
        || defaultPrice[attr],
    ])),
    marketData: restoredMarket.marketData,
    inventoryLoaded: restoredMarket.inventoryLoaded,
    orderBooksLoaded: restoredMarket.orderBooksLoaded,
    marketUpdatedAt: restoredMarket.updatedAt,
    marketRefreshFailures: [],
    hvutStale: false,
    lastPlan: null,
    panelMode: '',
    panelElement: null,
    busy: false,
    selectionAnchorSlot: '',
    calculationTimer: null,
    renameMappingText: '',
    renameMappingFileName: '',
  };

  function syncDokidokiHost() {
    const panel = $('#hvmepp-panel') || runtime.panelElement, dokidoki = getDokidokiHost();
    if (dokidoki) { if (panel && panel.parentNode !== dokidoki.addonHost) dokidoki.addonHost.appendChild(panel); setDokidokiView(Boolean(panel && !panel.classList.contains('hvut-none'))); return; }
    const mainpane = $(HVUT.mainpane);
    if (panel && mainpane && panel.parentElement?.id === 'dokidoki-addon-host') mainpane.appendChild(panel);
  }

  function setupDokidokiCompatibility() {
    let queued = false;
    const observer = new MutationObserver(() => { if (!queued) { queued = true; queueMicrotask(() => { queued = false; syncDokidokiHost(); }); } });
    document.addEventListener('dokidoki:ready', syncDokidokiHost);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('pagehide', () => {
      document.removeEventListener('dokidoki:ready', syncDokidokiHost); observer.disconnect();
    }, { once: true });
  }

  function saveState() {
    try {
      GM_setValue(STORE_KEY, JSON.stringify(state));
    } catch (error) {
      logWarning('storage.settings.write_failed', 'Settings could not be saved.', {}, error);
    }
  }

  function saveCache() {
    try {
      storedCache = buildDataCache(
        runtime.monsters,
        runtime.marketData,
        runtime.inventoryLoaded,
        runtime.orderBooksLoaded,
        runtime.marketUpdatedAt
      );
      GM_setValue(CACHE_KEY, storedCache);
    } catch (error) {
      logWarning('storage.cache.write_failed', 'Cached Monster Manager data could not be saved.', {}, error);
    }
  }

  function hydrateMonsterCache(monsterList) {
    const savedMonsters = isPlainObject(storedCache.monsters) ? storedCache.monsters : {};
    runtime.monsters = restoreMonsterCache(storedCache, monsterList);
    if (
      runtime.monsters.size !== Object.keys(savedMonsters).length
      || [...runtime.monsters].some(([slot, record]) => record.name !== String(savedMonsters[slot]?.name || ''))
    ) saveCache();
    return runtime.monsters;
  }

  function isPrimary(a) {
    return primarySet.has(a);
  }

  function maxLevel(a) {
    return isPrimary(a) ? 25 : 50;
  }

  function primaryTotalPL(n) {
    return n * (6 + (n - 1) * 0.5) / 2;
  }

  function elementalTotalPL(n) {
    const t = Math.floor(n / 10);
    const r = n % 10;
    return (t + 1) * (t * 5 + r);
  }

  function deltaPL(a, n) {
    return isPrimary(a) ? 3 + n * 0.5 : Math.floor(1 + n * 0.1);
  }

  function crystalCost(a, n) {
    const primaryAttr = isPrimary(a);
    const base = primaryAttr ? PRIMARY_COST_BASE : ELEMENTAL_COST_BASE;
    const rate = primaryAttr ? PRIMARY_COST_RATE : ELEMENTAL_COST_RATE;
    return Math.round(base * Math.pow(rate, n));
  }

  function totalPL(levels) {
    let pl = 0;

    primary.forEach((a) => {
      pl += primaryTotalPL(levels[a] || 0);
    });

    elemental.forEach((a) => {
      pl += elementalTotalPL(levels[a] || 0);
    });

    return pl;
  }

  const maxPL = primary.length * primaryTotalPL(25) + elemental.length * elementalTotalPL(50);

  function formatPL(v) {
    return Math.abs(v - Math.round(v)) < EPS
      ? String(Math.round(v))
      : v.toFixed(2).replace(/\.?0+$/, '');
  }

  function formatMoney(v) {
    if (!Number.isFinite(v)) return '-';
    if (v >= 1000000) return (v / 1000000).toFixed(3) + ' MC';
    if (v >= 1000) return (v / 1000).toFixed(3) + ' KC';
    return v.toFixed(2) + ' C';
  }

  function buildOptions(attr, startLevel, targetW) {
    const opts = [{
      k: 0,
      w: 0,
      cost: 0,
    }];

    let accW = 0;
    let accCrystals = 0;
    let accCost = 0;

    for (let n = startLevel; n < maxLevel(attr); n++) {
      const dpl = deltaPL(attr, n);
      const w = Math.round(dpl * PL_SCALE);
      const crystals = crystalCost(attr, n);
      const c = crystals * Number(runtime.prices[attr] || defaultPrice[attr]);

      accW += w;
      accCrystals += crystals;
      accCost += c;

      if (accW > targetW) break;

      opts.push({
        attr,
        k: n - startLevel + 1,
        w: accW,
        crystals: accCrystals,
        cost: accCost,
      });
    }

    return opts;
  }

  function solveExact(startLevels, target) {
    const currentPL = totalPL(startLevels);
    const effectiveTarget = Number(target);

    if (currentPL > effectiveTarget + EPS) {
      return {
        ok: false,
        currentPL,
        targetPL: effectiveTarget,
        message: t('errorTargetBelowCurrent', {
          current: formatPL(currentPL),
          target: formatPL(effectiveTarget),
        }),
      };
    }

    if (effectiveTarget > maxPL + EPS) {
      return {
        ok: false,
        message: t('errorTargetOverMax', { max: formatPL(maxPL) }),
      };
    }

    const need = effectiveTarget - currentPL;
    const needWFloat = need * PL_SCALE;
    const needW = Math.round(needWFloat);

    if (Math.abs(needWFloat - needW) > 1e-7) {
      return {
        ok: false,
        message: t('errorTargetUnit'),
      };
    }

    let dp = new Array(needW + 1).fill(Infinity);
    dp[0] = 0;

    const parents = [];

    for (let gi = 0; gi < all.length; gi++) {
      const attr = all[gi];
      const opts = buildOptions(attr, startLevels[attr], needW);

      const ndp = new Array(needW + 1).fill(Infinity);
      const parent = new Array(needW + 1).fill(null);

      for (let j = 0; j <= needW; j++) {
        if (!Number.isFinite(dp[j])) continue;

        for (const opt of opts) {
          const nj = j + opt.w;
          if (nj > needW) continue;

          const candidate = dp[j] + opt.cost;

          if (candidate + EPS < ndp[nj]) {
            ndp[nj] = candidate;
            parent[nj] = { prev: j, opt };
          }
        }
      }

      dp = ndp;
      parents.push(parent);
    }

    if (!Number.isFinite(dp[needW])) {
      return {
        ok: false,
        message: t('errorTargetUnreachable'),
      };
    }

    const chosen = [];
    let cur = needW;

    for (let gi = all.length - 1; gi >= 0; gi--) {
      const p = parents[gi][cur];

      if (!p) {
        return {
          ok: false,
          message: t('errorCalculationPath'),
        };
      }

      if (p.opt.k > 0) chosen.push(p.opt);
      cur = p.prev;
    }

    const finalLevels = Object.assign({}, startLevels);
    const agg = Object.fromEntries(all.map((attr) => [attr, {
      from: startLevels[attr],
      to: startLevels[attr],
      k: 0,
      crystals: 0,
      cost: 0,
    }]));
    let totalCost = 0;

    chosen.forEach((opt) => {
      finalLevels[opt.attr] += opt.k;
      const item = agg[opt.attr];
      item.to += opt.k;
      item.k += opt.k;
      item.crystals += opt.crystals;
      item.cost += opt.cost;
      totalCost += opt.cost;
    });

    return {
      ok: true,
      currentPL,
      targetPL: effectiveTarget,
      finalLevels,
      agg,
      totalCost,
    };
  }

  function readInputs({ save = true } = {}) {
    all.forEach((a) => {
      const orderPrice = $(`#hvmepp-order-price-${a}`);

      if (orderPrice) {
        const crystal = crystalByAttr[a];
        const batchSize = Math.floor(positiveNumber(runtime.marketData[crystal]?.batchSize));
        const batchPrice = Math.max(1, Math.round(positiveNumber(orderPrice.value)));
        if (batchSize && batchPrice) {
          state.orderUnitPrices[a] = batchPrice / batchSize;
          orderPrice.value = batchPrice;
        }
      }
    });

    const target = $('#hvmepp-target');
    if (target) state.targetPL = parseFloat(target.value) || 0;

    const source = $('#hvmepp-source');
    if (source) state.priceSource = source.value;

    const orderSource = $('#hvmepp-order-source');
    if (orderSource) state.orderPriceSource = orderSource.value;

    if (save) saveState();
  }

  function parseMonsterUpgradeSnapshot(doc) {
    const rows = $all('#monsterstats_top tr', doc).slice(0, all.length);
    const levels = {};
    const stocks = {};

    rows.forEach((row, index) => {
      const attr = all[index];
      const level = parseInt(row.querySelector('td:nth-child(2)')?.textContent, 10);
      if (attr && Number.isFinite(level)) levels[attr] = level;

      const hoverText = row.querySelector('[onmouseover]')?.getAttribute('onmouseover') || '';
      const stockMatch = /Stock:\s*([\d,]+)/i.exec(hoverText);
      const stock = stockMatch ? parseNum(stockMatch[1]) : NaN;
      if (attr && Number.isFinite(stock)) stocks[attr] = Math.max(0, Math.floor(stock));
    });

    const levelsComplete = all.every((attr) => Number.isFinite(levels[attr]));
    const inventoryComplete = all.every((attr) => Number.isFinite(stocks[attr]));
    return {
      levels: levelsComplete ? levels : null,
      stocks,
      inventoryComplete,
      insufficientCrystals: /Insufficient crystals/i.test(doc.body?.textContent || ''),
    };
  }

  async function fetchMonsterLevels(slot) {
    const html = await fetchText(`?s=Bazaar&ss=ml&slot=${encodeURIComponent(slot)}`);
    const levels = parseMonsterUpgradeSnapshot(htmlToDoc(html)).levels;

    if (!levels) {
      throw new Error(t('errorParseMonster'));
    }

    return levels;
  }

  function getMonsterMeta(slot) {
    const key = String(slot);
    return runtime.monsterList.find((monster) => String(monster.index) === key) || {
      name: t('monsterFallback', { slot: key }),
    };
  }

  function cacheMonsterRecord(record) {
    const slot = String(record?.slot || '');
    const levels = normalizeMonsterLevels(record?.levels);
    if (!/^\d+$/.test(slot) || !levels) return null;

    const meta = getMonsterMeta(slot);
    const cached = {
      slot,
      name: String(record.name || meta.name || t('monsterFallback', { slot })),
      pl: totalPL(levels),
      updatedAt: Date.now(),
      levels,
    };
    runtime.monsters.set(slot, cached);
    return cached;
  }

  function resolveMonsterSelection(orderedSlots, selectedSlots, anchorSlot, action = {}) {
    const order = orderedSlots.map(String);
    const validSlots = new Set(order);
    const selected = new Set(selectedSlots.map(String).filter((slot) => validSlots.has(slot)));
    const anchor = validSlots.has(String(anchorSlot)) ? String(anchorSlot) : '';
    const finish = (nextSelected, nextAnchor) => ({
      selectedSlots: order.filter((slot) => nextSelected.has(slot)),
      anchorSlot: nextAnchor,
    });

    if (action.type === 'all') return finish(new Set(order), anchor);
    if (action.type === 'clear') return finish(new Set(), '');

    const slot = String(action.slot ?? '');
    if (action.type !== 'item' || !validSlots.has(slot)) return finish(selected, anchor);
    if (action.shiftKey && anchor) {
      const start = order.indexOf(anchor);
      const end = order.indexOf(slot);
      const range = order.slice(Math.min(start, end), Math.max(start, end) + 1);
      return finish(new Set(action.ctrlKey ? [...selected, ...range] : range), anchor);
    }
    if (action.shiftKey) return finish(new Set(action.ctrlKey ? [...selected, slot] : [slot]), slot);
    if (action.ctrlKey) {
      if (selected.has(slot)) selected.delete(slot);
      else selected.add(slot);
      return finish(selected, slot);
    }
    return finish(new Set([slot]), slot);
  }

  function syncMonsterSelection(action = null, commit = Boolean(action)) {
    const orderedSlots = runtime.monsterList.map((monster) => String(monster.index));
    const result = resolveMonsterSelection(
      orderedSlots,
      state.selectedMonsterSlots,
      runtime.selectionAnchorSlot,
      action || {}
    );
    state.selectedMonsterSlots = result.selectedSlots;
    runtime.selectionAnchorSlot = result.anchorSlot;
    const selected = new Set(state.selectedMonsterSlots.map(String));
    $all('.hvmepp-monster-option').forEach((option) => {
      const isSelected = selected.has(String(option.dataset.slot));
      option.setAttribute('aria-selected', String(isSelected));
      option.classList.toggle('hvmepp-selected', isSelected);
    });
    const summary = $('#hvmepp-selection-summary');
    if (summary) {
      const slots = state.selectedMonsterSlots;
      const loaded = slots.filter((slot) => runtime.monsters.has(String(slot))).length;
      summary.textContent = `${t('labelSelectedMonsters')}: ${slots.length}${runtime.panelMode === 'planner'
        ? ` (${t('labelLoadedCount')}: ${loaded}/${slots.length})`
        : ''}`;
    }
    refreshRenamePreview();
    if (!commit) return;
    if (runtime.panelMode !== 'planner') {
      clearTimeout(runtime.calculationTimer);
      runtime.calculationTimer = null;
      saveState();
      return;
    }
    if (state.selectedMonsterSlots.length) scheduleCalculation();
    else calculate();
  }

  function scheduleCalculation(delay = 0) {
    clearTimeout(runtime.calculationTimer);
    runtime.lastPlan = null;
    ['#hvmepp-crystal-result', '#hvmepp-upgrade-result'].forEach((selector) => {
      const box = $(selector);
      if (box) box.setAttribute('aria-busy', 'true');
    });
    runtime.calculationTimer = setTimeout(() => {
      runtime.calculationTimer = null;
      if (runtime.panelMode !== 'planner') return;
      if (runtime.busy) scheduleCalculation(100);
      else calculate();
    }, Math.max(0, Number(delay) || 0));
  }

  async function mapLimit(values, limit, worker) {
    const items = Array.from(values);
    const results = new Array(items.length);
    let nextIndex = 0;

    async function run() {
      while (nextIndex < items.length) {
        const index = nextIndex++;
        results[index] = await worker(items[index], index);
      }
    }

    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
    return results;
  }

  async function loadSelectedMonsters() {
    const slots = state.selectedMonsterSlots.slice();
    if (!slots.length) throw new Error(t('errorNoMonsterSelection'));

    state.selectedMonsterSlots = slots;
    let hvutSnapshot = { monsters: new Map(), stocks: null, plannedSlots: [] };
    try {
      hvutSnapshot = await readHvutUpgradeSnapshot(slots);
    } catch (error) {
      logWarning(
        'hvutils.upgrader.read_failed',
        'HV Utils Monster Upgrader data could not be read; selected monsters will be verified directly.',
        { slots },
        error
      );
    }
    if (hvutSnapshot.plannedSlots.length) {
      setStatus(t('statusHvutFallback', { slots: joinList(hvutSnapshot.plannedSlots.map((slot) => `#${slot}`)) }));
    }

    let done = 0;
    const records = await mapLimit(slots, HVUT_MAX_CONNECTIONS, async (slot) => {
      const hvutRecord = hvutSnapshot.monsters.get(String(slot));
      const levels = hvutRecord?.levels || await fetchMonsterLevels(slot);
      const meta = getMonsterMeta(slot);
      const record = cacheMonsterRecord({
        slot: String(slot),
        name: hvutRecord?.name || meta.name,
        levels,
      });
      done++;
      setStatus(t('statusLoadingMonsters', { done, total: slots.length }));
      syncMonsterSelection();
      return record;
    });

    saveCache();
    calculate();
    setStatus(t('statusLoadedMonsters', { total: records.length }));
    return records;
  }

  function parseMarketRows(doc, result) {
    const table = $('#market_itemlist table', doc);
    if (!table) return;

    const headers = Array.from(table.rows[0]?.cells || [])
      .map((cell) => cell.textContent.trim().replace(/\s+/g, ' '));
    const findCol = (...names) => headers.findIndex((header) => names.includes(header));
    const nameCol = Math.max(0, findCol('Item', '物品'));
    const stockCol = findCol('Your Stock', '你的库存');
    const bidCol = findCol('Market Bid', '市场买价');
    const askCol = findCol('Market Ask', '市场卖价');

    Array.from(table.rows).forEach((tr, i) => {
      if (i === 0 || !tr.cells || tr.cells.length < 2) return;

      const name = canonicalCrystalName(tr.cells[nameCol]?.textContent);
      if (!name) return;

      const onclick = tr.getAttribute('onclick') || '';
      const href = tr.querySelector('a[href*="itemid="]')?.getAttribute('href') || '';
      const itemid = (onclick + ' ' + href).match(/itemid=(\d+)/)?.[1];
      const stock = stockCol < 0 ? NaN : parseNum(tr.cells[stockCol]?.textContent);
      const bid = bidCol < 0 ? NaN : parseNum(tr.cells[bidCol]?.textContent);
      const ask = askCol < 0 ? NaN : parseNum(tr.cells[askCol]?.textContent);

      result[name] = Object.assign(result[name] || {}, {
        itemid,
        stock,
        bid,
        ask,
        unitBid: bid,
        unitAsk: ask,
      });
    });
  }

  async function fetchMarketCrystalIndex() {
    const result = {};

    const urls = [
      '?s=Bazaar&ss=mk&filter=mo&screen=browseitems',
      '?s=Bazaar&ss=mk&filter=ma&screen=browseitems',
      '?s=Bazaar&ss=mk&screen=browseitems',
    ];

    for (const url of urls) {
      try {
        const html = await fetchText(url);
        parseMarketRows(htmlToDoc(html), result);

        if (
          crystalNames.every((n) =>
            result[n]?.itemid ||
            Number.isFinite(result[n]?.ask) ||
            Number.isFinite(result[n]?.bid)
          )
        ) {
          break;
        }
      } catch (e) {
        logWarning(
          'market.index.read_failed',
          'A crystal-index route could not be read; the next supported route will be tried.',
          { route: url },
          e
        );
      }
    }

    return result;
  }

  function parseMarketBatchSize(doc) {
    const infoText = `${$('#market_iteminfo', doc)?.textContent || ''} ${$('.market_placeorder', doc)?.textContent || ''}`;
    const explicitBatch = infoText.match(/batches?\s+of\s+([\d,]+)/i)?.[1];
    const localizedBatch = infoText.match(/每(?:组|組)\s*([\d,]+)\s*(?:件|個|个)/i)?.[1];
    const xBatch = infoText.match(/[x×]\s*([\d,]+)/i)?.[1];
    const batchSize = Math.floor(parseNum(explicitBatch || localizedBatch || xBatch));
    return Number.isFinite(batchSize) && batchSize > 0 ? batchSize : 0;
  }

  function parseMarketBalance(doc) {
    const candidates = [
      ...$all('.credit_balance', doc),
      $('#market_xfer', doc),
      doc.body,
    ].filter(Boolean);

    for (const node of candidates) {
      const match = (node.textContent || '').match(/Market Balance[\s\S]*?([\d,]+)\s*C/i);
      const balance = parseNum(match?.[1]);
      if (Number.isFinite(balance)) return Math.max(0, Math.floor(balance));
    }
    return null;
  }

  function parseOrderBook(doc, selector) {
    return $all(`${selector} .market_itemorders table tr`, doc).slice(1).map((row) => ({
      crystals: Math.max(0, Math.floor(parseNum(row.cells?.[0]?.textContent) || 0)),
      batchPrice: Math.max(0, Math.round(parseNum(row.cells?.[1]?.textContent) || 0)),
    })).filter((order) => order.crystals > 0 && order.batchPrice > 0);
  }

  async function fetchMarketDetailData(itemid) {
    const html = await fetchText(`?s=Bazaar&ss=mk&screen=browseitems&filter=mo&itemid=${encodeURIComponent(itemid)}`);
    const doc = htmlToDoc(html);

    const name = canonicalCrystalName($('#market_itemheader', doc)?.children?.[1]?.textContent);
    const batchSize = parseMarketBatchSize(doc);
    const count = $('#buyorder_batchcount, input[name="buyorder_batchcount"]', doc);
    const rows = $('#market_price', doc)?.rows;

    if (!name) return null;

    const result = {
      batchSize,
      askOrders: parseOrderBook(doc, '#market_itemsell'),
      bidOrders: parseOrderBook(doc, '#market_itembuy'),
      currentOrder: {
        count: Math.max(0, Math.floor(parseNum(count?.value) || 0)),
      },
    };

    if (!batchSize || !rows || rows.length < 5) return result;

    function avg(rowIndex) {
      const text = rows[rowIndex]?.cells?.[3]?.textContent || '';
      const v = parseNum(text);
      return v ? v / batchSize : 0;
    }

    return Object.assign(result, {
      day: avg(1),
      week: avg(2),
      month: avg(3),
      year: avg(4),
    });
  }

  async function enrichCrystalMarketData(data) {
    const targets = crystalNames.filter((name) => data[name]?.itemid);
    let done = 0;

    await mapLimit(targets, HVUT_MAX_CONNECTIONS, async (name) => {
      let detail = null;
      try {
        detail = await fetchMarketDetailData(data[name].itemid);
      } catch (e) {
        logWarning(
          'market.crystal_detail.read_failed',
          'A crystal detail page could not be read; cached values for this crystal were retained.',
          { crystal: name },
          e
        );
      }
      done++;
      setStatus(t('statusReadingMarket', { done, total: targets.length }));

      if (detail) {
        const row = Object.assign(data[name], detail);
        const batchSize = positiveNumber(row.batchSize);
        row.batchBid = batchSize && positiveNumber(row.unitBid) ? Math.max(1, Math.round(row.unitBid * batchSize)) : 0;
        row.batchAsk = batchSize && positiveNumber(row.unitAsk) ? Math.max(1, Math.round(row.unitAsk * batchSize)) : 0;
      }
    });

  }

  async function fetchCrystalMarketData() {
    const data = await fetchMarketCrystalIndex();
    await enrichCrystalMarketData(data);

    Object.entries(data).forEach(([crystal, current]) => {
      runtime.marketData[crystal] = { ...runtime.marketData[crystal], ...current };
    });
    return data;
  }

  function getCrystalPricesForSource(source, data = runtime.marketData) {
    const prices = {};
    all.forEach((attr) => {
      const crystal = crystalByAttr[attr];
      const value = positiveNumber(data[crystal]?.[source]);
      if (value) prices[crystal] = value;
    });
    return prices;
  }

  function applyPricesByCrystal(priceByCrystal) {
    let updated = 0;
    const failed = [];

    displayAll.forEach((a) => {
      const crystal = crystalByAttr[a];
      const v = positiveNumber(priceByCrystal[crystal]);

      if (v) {
        runtime.prices[a] = v;
        updated++;
      } else {
        failed.push(crystalLabel(crystal));
      }
    });

    return { updated, failed };
  }

  function applyOrderPricesFromCache({ save = true, notify = true } = {}) {
    const source = state.orderPriceSource || 'bid';
    if (source === 'custom') {
      if (save) saveState();
      if (notify) setStatus(t('statusCustomOrderPrices'));
      return { updated: 0, failed: [] };
    }
    const prices = getCrystalPricesForSource(source);
    let updated = 0;
    const failed = [];
    all.forEach((attr) => {
      const unitPrice = positiveNumber(prices[crystalByAttr[attr]]);
      if (!unitPrice) {
        failed.push(crystalLabel(attr));
        return;
      }
      state.orderUnitPrices[attr] = unitPrice;
      const batchSize = Math.floor(positiveNumber(runtime.marketData[crystalByAttr[attr]]?.batchSize));
      const input = $(`#hvmepp-order-price-${attr}`);
      if (input && batchSize) {
        input.value = Math.max(1, Math.round(unitPrice * batchSize));
        input.disabled = false;
      }
      updated++;
    });

    if (save) saveState();
    if (notify) {
      setStatus(failed.length
        ? t('statusOrderPricesPartial', {
          source: priceSourceLabel(source),
          updated,
          failed: joinList(failed),
        })
        : t('statusOrderPricesComplete', { source: priceSourceLabel(source) }));
    }
    return { updated, failed };
  }

  async function refreshMarketSnapshot({ silent = false, rerender = true, applySavedSources = true } = {}) {
    readInputs({ save: false });
    if (!silent) setStatus(t('statusReadingMarket'));
    const data = await fetchCrystalMarketData();

    if (applySavedSources) {
      applyPricesByCrystal(getCrystalPricesForSource(state.priceSource));
      applyOrderPricesFromCache({ save: false, notify: false });
      const selectedPrices = getCrystalPricesForSource(state.priceSource);
      if (Object.keys(selectedPrices).length) {
        try {
          localStorage.setItem('hvut_prices', JSON.stringify({
            ...readHvutPriceStore(),
            ...selectedPrices,
          }));
        } catch (error) {
          logWarning('hvutils.price_sync.local_failed', 'HV Utils price synchronization through localStorage failed.', {
            storage: 'localStorage', key: 'hvut_prices',
          }, error);
        }
        Object.entries(selectedPrices).forEach(([crystal, value]) => {
          runtime.marketData[crystal].hvut = value;
        });
      }
      if (runtime.lastPlan?.results?.length) {
        runtime.lastPlan = buildBatchPlan(runtime.lastPlan.results.map((result) => ({
          slot: result.monsterSlot,
          name: result.monsterName,
          levels: result.startLevels,
        })), Number(state.targetPL));
      }
    }
    const snapshotMissing = crystalNames.filter((name) =>
      !Number.isFinite(data[name]?.stock)
      || !positiveNumber(data[name]?.batchSize)
      || !Array.isArray(data[name]?.askOrders)
      || !Array.isArray(data[name]?.bidOrders)
    );
    const priceMissing = crystalNames.filter((name) =>
      marketPriceSources.some((source) => !positiveNumber(data[name]?.[source]))
    );
    runtime.inventoryLoaded = crystalNames.every((name) => Number.isFinite(data[name]?.stock));
    runtime.orderBooksLoaded = crystalNames.every((name) =>
      Array.isArray(data[name]?.askOrders) && Array.isArray(data[name]?.bidOrders)
    );
    runtime.marketUpdatedAt = Date.now();
    saveState();
    saveCache();

    if (rerender && runtime.lastPlan) renderPlan(runtime.lastPlan);

    const failed = Array.from(new Set([...priceMissing, ...snapshotMissing].map(crystalLabel)));
    runtime.marketRefreshFailures = failed;
    if (!silent) {
      setStatus(failed.length
        ? t('statusMarketPartial', { complete: 12 - priceMissing.length, failed: joinList(failed) })
        : t('statusMarketComplete', { source: priceSourceLabel(state.priceSource) }));
    }
    return runtime.marketData;
  }

  async function refreshAllData() {
    const selected = state.selectedMonsterSlots;
    const refreshedMonsters = selected.length
      ? (await loadSelectedMonsters()).length
      : 0;

    await refreshMarketSnapshot({ silent: true });
    setStatus(runtime.marketRefreshFailures.length
      ? t('statusRefreshDataPartial', {
        monsters: refreshedMonsters,
        failed: joinList(runtime.marketRefreshFailures),
      })
      : t('statusRefreshDataComplete', { monsters: refreshedMonsters }));
  }

  function buildBatchPlan(monsters, target) {
    const results = monsters.map((monster) => {
      const levels = Object.assign({}, monster.levels);
      const result = solveExact(levels, target);
      return Object.assign(result, {
        startLevels: levels,
        monsterSlot: String(monster.slot),
        monsterName: monster.name || t('monsterFallback', { slot: monster.slot }),
      });
    });

    const requirements = Object.fromEntries(all.map((attr) => [attr, 0]));
    let totalCost = 0;
    results.forEach((result) => {
      if (!result.ok) return;
      totalCost += result.totalCost;
      all.forEach((attr) => {
        requirements[attr] += Number(result.agg[attr].crystals) || 0;
      });
    });

    return {
      ok: results.length > 0 && results.every((result) => result.ok),
      targetPL: target,
      results,
      requirements,
      totalCost,
      monsterCount: results.length,
    };
  }

  function estimateLiveRequests(plan) {
    let requests = 0;
    let levels = 0;
    plan.results.forEach((result) => {
      all.forEach((attr) => {
        const count = Math.max(0, Math.floor(Number(result.agg[attr].k) || 0));
        levels += count;
        requests += Math.ceil(count / 10);
      });
    });
    return { requests, levels };
  }

  function buildNextUpgradeRequest(result, slot) {
    for (const attr of all) {
      const count = Math.max(0, Math.floor(Number(result?.agg?.[attr]?.k) || 0));
      if (!count) continue;

      const step = Math.min(10, count);
      return {
        attr,
        count: step,
        slot: String(slot),
        url: `?s=Bazaar&ss=ml&slot=${encodeURIComponent(slot)}`,
        data: `crystal_upgrade=${encodeURIComponent(upgradeQueryByAttr[attr])}&crystal_count=${step}`,
      };
    }
    return null;
  }

  function getLiveTargetState(levels, target, slot) {
    const currentPL = totalPL(levels);
    if (currentPL > target + EPS) return { status: 'above', currentPL };
    if (Math.abs(currentPL - target) <= EPS) return { status: 'reached', currentPL };

    const plan = solveExact(levels, target);
    if (!plan.ok) return { status: 'unreachable', currentPL, plan };

    const request = buildNextUpgradeRequest(plan, slot);
    if (!request) return { status: 'unreachable', currentPL, plan };
    return { status: 'ready', currentPL, plan, request };
  }

  function applyMonsterStockSnapshot(stocks) {
    all.forEach((attr) => {
      const stock = Number(stocks?.[attr]);
      if (!Number.isFinite(stock)) return;
      const crystal = crystalByAttr[attr];
      runtime.marketData[crystal] ||= {};
      runtime.marketData[crystal].stock = Math.max(0, Math.floor(stock));
    });
    runtime.inventoryLoaded = hasCompleteCrystalStock();
    if (runtime.inventoryLoaded) runtime.marketUpdatedAt = Date.now();
    return runtime.inventoryLoaded;
  }

  function hasCompleteCrystalStock() {
    return all.every((attr) =>
      Number.isFinite(Number(runtime.marketData[crystalByAttr[attr]]?.stock))
    );
  }

  function clearCrystalStockSnapshot() {
    all.forEach((attr) => {
      const market = runtime.marketData[crystalByAttr[attr]];
      if (market) delete market.stock;
    });
    runtime.inventoryLoaded = false;
  }

  function planAskSweep(requestedBatches, batchSize, askOrders) {
    const size = Math.floor(positiveNumber(batchSize));
    const totalBatches = Math.floor(positiveNumber(requestedBatches));
    if (!size || !totalBatches || !Array.isArray(askOrders)) return null;

    let remainingBatches = totalBatches;
    let estimatedCost = 0;
    let lowestBatchPrice = 0;
    let highestBatchPrice = 0;
    const sortedAsks = askOrders.slice().sort((a, b) => a.batchPrice - b.batchPrice);

    sortedAsks.forEach((order) => {
      if (!remainingBatches) return;
      const availableBatches = Math.floor(positiveNumber(order.crystals) / size);
      const batchPrice = Math.round(positiveNumber(order.batchPrice));
      if (!availableBatches || !batchPrice) return;
      const matched = Math.min(remainingBatches, availableBatches);
      estimatedCost += matched * batchPrice;
      remainingBatches -= matched;
      if (!lowestBatchPrice) lowestBatchPrice = batchPrice;
      highestBatchPrice = batchPrice;
    });

    const coveredBatches = totalBatches - remainingBatches;
    if (!coveredBatches) return null;

    return {
      coveredBatches,
      remainingBatches,
      submittedBatches: coveredBatches,
      submittedPrice: highestBatchPrice,
      estimatedCost,
      lowestBatchPrice,
      highestBatchPrice,
    };
  }

  function getPurchaseEstimateSummary(rows) {
    let estimatedCost = 0;
    let coveredBatches = 0;
    let totalBatches = 0;
    const shortages = rows.filter((row) => row.shortage > 0 && row.batches > 0);
    if (!shortages.length || shortages.some((row) => !row.orderBookLoaded)) return null;

    shortages.forEach((row) => {
      estimatedCost += row.orderBookEstimate?.estimatedCost || 0;
      coveredBatches += row.orderBookEstimate?.coveredBatches || 0;
      totalBatches += row.batches;
    });
    return { estimatedCost, coveredBatches, totalBatches, complete: coveredBatches === totalBatches };
  }

  function getCrystalPlanRows(plan) {
    return displayAll.map((attr) => {
      const crystal = crystalByAttr[attr];
      const market = runtime.marketData[crystal] || {};
      const required = Math.max(0, Math.ceil(Number(plan?.requirements?.[attr]) || 0));
      const rawStock = market.stock;
      const stock = runtime.inventoryLoaded && Number.isFinite(rawStock) ? Math.max(0, rawStock) : null;
      const shortage = stock === null ? null : Math.max(0, required - stock);
      const batchSize = Math.floor(positiveNumber(market.batchSize)) || null;
      const batches = shortage === null || !shortage || !batchSize
        ? (shortage === 0 ? 0 : null)
        : Math.floor(Math.ceil(shortage) / batchSize) + 1;
      const crystalsToBuy = batches === null || !batchSize ? null : batches * batchSize;
      const orderUnitPrice = positiveNumber(state.orderUnitPrices[attr]) || defaultPrice[attr];
      const orderBatchPrice = batchSize ? Math.max(1, Math.round(orderUnitPrice * batchSize)) : null;
      const estimate = runtime.orderBooksLoaded && crystalsToBuy
        ? planAskSweep(Math.floor(crystalsToBuy / batchSize), batchSize, market.askOrders)
        : null;
      return {
        attr,
        crystal,
        label: crystalLabel(attr),
        itemid: market.itemid || '',
        required,
        stock,
        shortage,
        batchSize,
        batches,
        crystalsToBuy,
        orderBatchPrice,
        orderBookLoaded: runtime.orderBooksLoaded,
        orderBookEstimate: estimate,
        currentOrder: {
          count: Math.max(0, Math.floor(Number(market.currentOrder?.count) || 0)),
        },
      };
    });
  }

  function getCrystalShortages(rows) {
    return rows.filter((row) => row.shortage > 0 && row.batches > 0);
  }

  function getUnknownCrystalRows(rows) {
    return rows.filter((row) =>
      row.required > 0
      && (row.stock === null || (row.shortage > 0 && (!row.itemid || !row.batchSize)))
    );
  }

  function getCrystalPlanIssue(rows) {
    const unknown = getUnknownCrystalRows(rows);
    if (unknown.length) {
      return { key: 'statusInventoryPartial', params: { failed: joinList(unknown.map((row) => row.label)) } };
    }
    const shortages = getCrystalShortages(rows);
    return shortages.length ? {
      key: 'statusCrystalShortage',
      params: { failed: joinList(shortages.map((row) => `${row.label} ${row.shortage.toLocaleString()}`)) },
    } : null;
  }

  function getTargetFailureIssue(status, slot, currentPL, target) {
    return {
      key: status === 'above' ? 'statusUpgradeAboveTarget' : 'statusUpgradeUnreachable',
      params: { slot, current: formatPL(currentPL), target: formatPL(target) },
    };
  }

  function getUpgradeResponseIssue({
    snapshot, previousPL, updatedPL, target, planOk, inventoryIssue, slot, request,
  }) {
    if (snapshot.insufficientCrystals) {
      return { key: 'statusCrystalResponseShortage', params: { slot, crystal: crystalLabel(request.attr) } };
    }
    if (updatedPL <= previousPL + EPS) {
      return { key: 'statusUpgradeNoProgress', params: { slot, attr: attrLabel(request.attr), count: request.count } };
    }
    if (updatedPL > target + EPS) return getTargetFailureIssue('above', slot, updatedPL, target);
    if (!planOk) return getTargetFailureIssue('unreachable', slot, updatedPL, target);
    return inventoryIssue;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function renameIssueText(issue) {
    const params = {
      line: issue.line || '-',
      slot: issue.slot || '-',
      name: issue.sourceName || issue.targetName || '',
      actual: issue.actualName || '',
    };
    const keyByCode = {
      format: 'renameIssueFormat',
      'invalid-slot': 'renameIssueInvalidSlot',
      'duplicate-slot': 'renameIssueDuplicateSlot',
      'empty-name': 'renameIssueEmptyName',
      'duplicate-source': 'renameIssueDuplicateSource',
      'duplicate-target': 'renameIssueDuplicateTarget',
      'slot-not-found': 'renameIssueSlotNotFound',
      'source-mismatch': 'renameIssueSourceMismatch',
      'already-named': 'renameIssueAlreadyNamed',
    };
    return t(keyByCode[issue.code] || 'renameIssueFormat', params);
  }

  function buildRenamePlan(monsters) {
    const mode = $('#hvmepp-rename-mode')?.value || state.renameMode;
    const selectedSlots = state.selectedMonsterSlots;
    if (!selectedSlots.length) throw new Error(t('errorNoMonsterSelection'));
    if (mode === 'text') {
      const mappingText = $('#hvmepp-rename-mappings')?.value ?? runtime.renameMappingText;
      const parsed = parseRenameMappings(mappingText);
      if (!parsed.entries.length && !parsed.errors.length) {
        throw new Error(t('errorNoRenameMappings'));
      }
      if (parsed.errors.length) {
        throw new Error(t('errorRenameMappingInvalid', {
          details: parsed.errors.map(renameIssueText).join(' '),
        }));
      }

      const planned = buildTextRenameTargets(
        monsters,
        filterRenameMappingsBySelection(parsed.entries, selectedSlots)
      );
      if (!planned.targets.length) throw new Error(t('errorNoRenameTargets'));
      return {
        mode,
        targets: planned.targets,
        issues: planned.issues,
      };
    }

    const prefix = String($('#hvmepp-rename-prefix')?.value ?? state.renamePrefix).trim();
    if (!prefix) throw new Error(t('errorRenamePrefix'));

    const selected = new Set(selectedSlots.map(String));
    const targets = monsters
      .filter((monster) => selected.has(String(monster.index)))
      .map((monster) => ({
        slot: String(monster.index),
        currentName: String(monster.name).trim(),
        prefix,
        mode: 'random',
      }));
    if (!targets.length) throw new Error(t('errorNoRenameTargets'));

    return { mode, targets, issues: [] };
  }

  async function readLiveMonsterList() {
    const html = await fetchText('?s=Bazaar&ss=ml');
    const monsters = parseHvutMonsterList(htmlToDoc(html));
    if (!monsters.length) throw new Error(t('errorNoRenameTargets'));
    return monsters;
  }

  async function exportMonsterNames() {
    const monsters = await readLiveMonsterList();
    runtime.monsterList = monsters;
    hydrateMonsterCache(monsters);
    const url = URL.createObjectURL(new Blob([serializeRenameMappings(monsters)], {
      type: 'text/plain;charset=utf-8',
    }));
    const link = elt('a', { href: url, download: 'hv-monster-names.txt' });
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setStatus(t('statusRenameExported', { total: monsters.length }));
  }

  async function requestMonsterRename(slot, previousName, requestedName) {
    const params = new URLSearchParams();
    params.set('rename_monster', requestedName);
    const html = await fetchText(
      `?s=Bazaar&ss=ml&slot=${encodeURIComponent(slot)}`,
      params.toString()
    );
    markHvutStateStale();
    const result = parseMonsterRenameResult(htmlToDoc(html), previousName, requestedName);
    return result;
  }

  function applyMonsterRename(slot, name) {
    const key = String(slot);
    const monster = runtime.monsterList.find((entry) => String(entry.index) === key);
    if (monster) monster.name = name;

    const cached = runtime.monsters.get(key);
    if (cached) cached.name = name;

    const option = $all('.hvmepp-monster-option')
      .find((element) => String(element.dataset.slot) === key);
    if (option) {
      const meta = getMonsterMeta(key);
      option.textContent = monsterOptionText({ index: key, name, pl: meta.pl });
    }

    const row = $all(HVUT.slotRows)
      .find((element) => String(parseNum(element.children[0]?.textContent)) === key);
    const nameCell = row?.children?.[1];
    const nameNode = nameCell?.querySelector('.fcb > div') || nameCell;
    if (nameNode) nameNode.textContent = name;
    saveCache();
  }

  async function executeBatchRename(button) {
    const liveMonsters = await readLiveMonsterList();
    const plan = buildRenamePlan(liveMonsters);
    const modeLabel = t(plan.mode === 'text' ? 'renameModeText' : 'renameModeRandom');
    if (!window.confirm(t('confirmRename', {
      targets: plan.targets.length,
      issues: plan.issues.length,
      mode: modeLabel,
    }))) {
      setStatus(t('statusRenameCancelled'));
      return;
    }

    runtime.monsterList = liveMonsters;
    hydrateMonsterCache(liveMonsters);
    const usedNames = new Set(liveMonsters.map((monster) => canonicalMonsterName(monster.name)));
    let renamed = 0;
    let occupied = 0;

    for (let index = 0; index < plan.targets.length; index++) {
      const target = plan.targets[index];
      const displayName = target.mode === 'text'
        ? target.targetName
        : t('renamePreviewRandom', { prefix: target.prefix });
      button.textContent = t('buttonRunningRename', {
        current: index + 1,
        total: plan.targets.length,
      });
      setStatus(t('statusRenaming', {
        current: index + 1,
        total: plan.targets.length,
        slot: target.slot,
        name: displayName,
      }));

      const result = await renameWithCollisionHandling(
        target,
        usedNames,
        requestMonsterRename
      );
      if (result.status === 'success') {
        usedNames.delete(canonicalMonsterName(target.currentName));
        usedNames.add(canonicalMonsterName(result.actualName));
        applyMonsterRename(target.slot, result.actualName);
        renamed++;
        continue;
      }
      if (result.status === 'occupied') {
        occupied++;
        continue;
      }
      if (result.status === 'unexpected') {
        applyMonsterRename(target.slot, result.actualName);
        throw new Error(t('errorRenameUnexpected', {
          slot: target.slot,
          expected: result.requestedName,
          actual: result.actualName,
        }));
      }
      throw new Error(result.requestedName
        ? t('errorRenameResponse', { slot: target.slot })
        : t('errorRenameCandidate', { slot: target.slot }));
    }

    runtime.lastPlan = null;
    if (runtime.panelMode === 'planner') calculate();
    refreshRenamePreview();
    setStatus(t('statusRenameComplete', {
      renamed,
      occupied,
      skipped: plan.issues.length,
    }));
  }

  function marketResponseError(doc) {
    const messages = $all('#messagebox_inner p', doc).map((node) => node.textContent.trim()).filter(Boolean);
    return messages.find((message) => /(?:error|invalid|cannot|not enough|insufficient|exceed|failed)/i.test(message)) || '';
  }

  function verifyCrystalOrderResponse(before, after, row, submission) {
    const { mode, submittedBatches, submittedPrice } = submission;
    const remainingBatches = after.currentOrder.count;
    const remainingPrice = after.currentOrder.price;
    const fail = (key, params, code = '') => ({ error: { key, params, code } });
    if (!Number.isFinite(before.inventoryStock) || !Number.isFinite(after.inventoryStock)) {
      return fail('errorMarketItemForm', { crystal: row.label });
    }
    const inventoryDelta = after.inventoryStock - before.inventoryStock;
    const matchedBatches = inventoryDelta >= 0 && inventoryDelta % row.batchSize === 0
      ? inventoryDelta / row.batchSize
      : -1;
    if (matchedBatches === 0 && remainingBatches === 0 && submittedBatches > 0) {
      return fail('errorOrderNotApplied', { crystal: row.label }, 'ORDER_NOT_APPLIED');
    }
    if (matchedBatches < 0 || matchedBatches + remainingBatches !== submittedBatches) {
      return fail('errorOrderResultMismatch', {
        crystal: row.label,
        submitted: submittedBatches,
        matched: Math.max(0, matchedBatches),
        remaining: remainingBatches,
      });
    }
    if (mode === 'order' && (
      remainingBatches > submittedBatches
      || (remainingBatches > 0 && remainingPrice !== submittedPrice)
    )) {
      return fail('errorBuyOrderVerification', {
        crystal: row.label,
        submitted: submittedBatches,
        remaining: remainingBatches,
        expectedPrice: submittedPrice,
        actualPrice: remainingPrice,
      });
    }
    return { matchedBatches, remainingBatches, remainingPrice };
  }

  function parseCrystalBuyForm(doc, crystal) {
    const section = $('#market_itembuy', doc);
    if (!section) throw new Error(t('errorMarketItemForm', { crystal: crystalLabel(crystal) }));

    const controls = $all('input, button', section);
    const token = section.querySelector('input[name="marketoken"]');
    const count = section.querySelector('#buyorder_batchcount, input[name="buyorder_batchcount"]')
      || controls.find((node) => /buyorder.*count/i.test(`${node.name || ''} ${node.id || ''}`));
    const price = section.querySelector('#buyorder_batchprice, input[name="buyorder_batchprice"]')
      || controls.find((node) => /buyorder.*price/i.test(`${node.name || ''} ${node.id || ''}`));
    const submit = section.querySelector('input[name="buyorder_update"], button[name="buyorder_update"]')
      || controls.find((node) => /buyorder.*(?:update|submit|place)/i.test(`${node.name || ''} ${node.id || ''}`));
    const deleteControl = controls.find((node) => {
      const signature = `${node.name || ''} ${node.id || ''} ${node.value || ''} ${node.textContent || ''}`;
      return node !== submit && /buyorder.*(?:delete|cancel|remove)|(?:delete|cancel|remove).*buyorder/i.test(signature);
    });
    const batchSize = parseMarketBatchSize(doc);
    const itemInfoText = $('#market_iteminfo', doc)?.textContent || '';
    const inventoryStock = parseNum(
      itemInfoText.match(/You have\s+([\d,]+)\s+available/i)?.[1]
      || itemInfoText.match(/你有\s*([\d,]+)\s*(?:件|個|个)/i)?.[1]
    );

    if (!token || !count || !price || !submit) {
      throw new Error(t('errorMarketItemForm', { crystal: crystalLabel(crystal) }));
    }
    if (!batchSize) {
      throw new Error(t('errorCrystalBatch', { crystal: crystalLabel(crystal) }));
    }

    function controlName(node) {
      return node.getAttribute('name') || node.id || '';
    }

    const names = {
      token: controlName(token),
      count: controlName(count),
      price: controlName(price),
      submit: controlName(submit),
    };
    if (Object.values(names).some((name) => !name)) {
      throw new Error(t('errorMarketItemForm', { crystal: crystalLabel(crystal) }));
    }

    return {
      names,
      token: token.value,
      submitValue: 'Update',
      batchSize,
      askOrders: parseOrderBook(doc, '#market_itemsell'),
      inventoryStock: Number.isFinite(inventoryStock) ? Math.max(0, Math.floor(inventoryStock)) : null,
      currentOrder: {
        count: Math.max(0, Math.floor(parseNum(count.value) || 0)),
        price: Math.max(0, Math.round(parseNum(price.value) || 0)),
      },
      deleteControl: deleteControl ? {
        name: controlName(deleteControl),
        value: deleteControl.value || deleteControl.textContent?.trim() || 'Delete',
      } : null,
    };
  }

  function readVerifiedCrystalForm(doc, row) {
    const responseError = marketResponseError(doc);
    if (responseError) throw new Error(responseError);
    const form = parseCrystalBuyForm(doc, row.crystal);
    if (form.batchSize !== row.batchSize) {
      throw new Error(t('errorCrystalBatchChanged', {
        crystal: row.label, expected: row.batchSize, actual: form.batchSize,
      }));
    }
    return form;
  }

  async function cancelCrystalBuyOrder(url, responseDoc, form, crystal) {
    if (!form.deleteControl?.name) return false;

    const params = new URLSearchParams();
    params.set(form.names.token, form.token);
    params.set(form.deleteControl.name, form.deleteControl.value);
    const cancelDoc = htmlToDoc(await fetchText(url, params.toString()));
    const error = marketResponseError(cancelDoc);
    if (error) throw new Error(error);

    try {
      return parseCrystalBuyForm(cancelDoc, crystal).currentOrder.count === 0;
    } catch (e) {
      logWarning(
        'market.buy_order.cancel_unverified',
        'The automatic remainder cancellation response could not be verified; cancellation is treated as failed.',
        { crystal: crystalLabel(crystal) },
        e
      );
      return false;
    }
  }

  async function placeCrystalBuyOrder(row, mode, requestedBatches = row.batches, onSubmit = null) {
    const label = crystalLabel(row.crystal);
    if (!row.itemid) throw new Error(t('errorMarketItemForm', { crystal: label }));

    const url = `?s=Bazaar&ss=mk&screen=browseitems&filter=mo&itemid=${encodeURIComponent(row.itemid)}`;
    const detailDoc = htmlToDoc(await fetchText(url));
    const form = readVerifiedCrystalForm(detailDoc, row);
    if (mode === 'direct' && form.currentOrder.count > 0) {
      throw new Error(t('errorExistingBuyOrder', { crystals: label }));
    }

    const directPlan = mode === 'direct'
      ? planAskSweep(requestedBatches, form.batchSize, form.askOrders)
      : null;
    if (mode === 'direct' && !directPlan) {
      return {
        matchedBatches: 0,
        remainingBatches: 0,
        submittedBatches: 0,
        submittedPrice: 0,
        responseStatus: 'no-liquidity',
        cancelledRemainder: false,
      };
    }

    const submittedPrice = mode === 'direct' ? directPlan.submittedPrice : row.orderBatchPrice;
    const marketBalance = mode === 'direct' ? parseMarketBalance(detailDoc) : null;
    const submittedBatches = mode === 'direct'
      ? directPlan.submittedBatches
      : Math.floor(positiveNumber(requestedBatches));
    if (!submittedBatches || !positiveNumber(submittedPrice)) {
      throw new Error(t('errorNoValidPlan'));
    }
    const reservedTotal = submittedBatches * submittedPrice;
    if (mode === 'direct' && (!Number.isFinite(marketBalance) || marketBalance < reservedTotal)) {
      throw new Error(t('errorDirectBalance', {
        crystal: label,
        required: reservedTotal.toLocaleString(),
        balance: Number.isFinite(marketBalance) ? marketBalance.toLocaleString() : '-',
        batches: submittedBatches.toLocaleString(),
        price: submittedPrice.toLocaleString(),
      }));
    }
    if (typeof onSubmit === 'function') {
      onSubmit({ submittedBatches, submittedPrice });
    }
    const params = new URLSearchParams();
    params.set(form.names.token, form.token);
    params.set(form.names.count, String(submittedBatches));
    params.set(form.names.price, String(submittedPrice));
    params.set(form.names.submit, form.submitValue);

    const responseDoc = htmlToDoc(await fetchText(url, params.toString()));
    const responseForm = readVerifiedCrystalForm(responseDoc, row);
    const verification = verifyCrystalOrderResponse(form, responseForm, row, {
      mode, submittedBatches, submittedPrice,
    });
    if (verification.error) {
      const verificationError = new Error(t(verification.error.key, verification.error.params));
      if (verification.error.code) verificationError.code = verification.error.code;
      throw verificationError;
    }
    const { matchedBatches, remainingBatches } = verification;
    Object.assign(runtime.marketData[row.crystal], {
      stock: responseForm.inventoryStock,
      batchSize: responseForm.batchSize,
      askOrders: responseForm.askOrders,
      currentOrder: { ...responseForm.currentOrder },
    });
    runtime.marketUpdatedAt = Date.now();
    saveCache();
    if (matchedBatches > 0) markHvutStateStale();
    const result = {
      matchedBatches,
      remainingBatches,
      submittedBatches,
      submittedPrice,
      estimatedCost: directPlan?.estimatedCost ?? null,
      responseStatus: remainingBatches > 0 ? 'pending' : (matchedBatches > 0 ? 'filled' : 'accepted'),
      cancelledRemainder: false,
    };

    if (mode === 'direct' && remainingBatches > 0) {
      const cancelled = await cancelCrystalBuyOrder(url, responseDoc, responseForm, row.crystal);
      if (!cancelled) {
        throw new Error(t('errorDirectRemainder', {
          crystal: label,
          batches: remainingBatches,
        }));
      }
      result.cancelledRemainder = true;
      result.responseStatus = 'remainder-cancelled';
      runtime.marketData[row.crystal].currentOrder = { count: 0, price: 0 };
      saveCache();
    }

    return result;
  }

  async function executeCrystalPurchase(mode, button) {
    const plan = runtime.lastPlan;
    if (!plan?.ok) {
      setStatus(t('errorNoValidPlan'));
      return;
    }

    setStatus(t('statusCheckingPurchase'));
    clearCrystalStockSnapshot();
    await refreshMarketSnapshot({ silent: true, rerender: false, applySavedSources: false });
    const crystalRows = getCrystalPlanRows(plan);
    renderPlan(plan, crystalRows);

    const unknown = getUnknownCrystalRows(crystalRows);
    if (unknown.length) {
      throw new Error(t('statusInventoryPartial', { failed: joinList(unknown.map((row) => row.label)) }));
    }

    const rows = getCrystalShortages(crystalRows);
    if (!rows.length) {
      setStatus(t('statusNoShortage'));
      return;
    }

    if (mode === 'order') {
      const invalidPrices = rows.filter((row) => !positiveNumber(row.orderBatchPrice));
      if (invalidPrices.length) {
        throw new Error(t('errorInvalidOrderPrice', {
          crystals: joinList(invalidPrices.map((row) => row.label)),
        }));
      }
    }

    if (mode === 'direct') {
      const existing = rows.filter((row) => row.currentOrder.count > 0);
      if (existing.length) {
        throw new Error(t('errorExistingBuyOrder', {
          crystals: joinList(existing.map((row) => row.label)),
        }));
      }
    }

    let directMatchedBatches = 0;
    let directMatchedCrystals = 0;
    let buyOrderMatchedTypes = 0;
    let buyOrderPendingTypes = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      if (mode === 'order') {
        button.textContent = t('buttonPlacingOrders', { current: i + 1, total: rows.length });
        setStatus(t('statusSubmittingBuyOrder', {
          current: i + 1,
          total: rows.length,
          crystal: row.label,
          batches: row.batches.toLocaleString(),
          crystals: row.crystalsToBuy.toLocaleString(),
          price: row.orderBatchPrice.toLocaleString(),
        }));
        const result = await placeCrystalBuyOrder(row, mode);
        if (result.matchedBatches > 0) buyOrderMatchedTypes++;
        if (result.remainingBatches > 0) buyOrderPendingTypes++;
      } else {
        button.textContent = t('buttonBuying', { current: i + 1, total: rows.length });
        let remainingBatches = row.batches;
        let emptyRefreshes = 0;

        while (remainingBatches > 0) {
          let ignoredRetries = 0;
          let result;
          while (!result) {
            try {
              result = await placeCrystalBuyOrder(
                row,
                mode,
                remainingBatches,
                ({ submittedBatches, submittedPrice }) => {
                  setStatus(t('statusSubmittingDirectOrder', {
                    current: i + 1,
                    total: rows.length,
                    crystal: row.label,
                    batches: submittedBatches.toLocaleString(),
                    crystals: (submittedBatches * row.batchSize).toLocaleString(),
                    price: submittedPrice.toLocaleString(),
                  }));
                }
              );
            } catch (error) {
              if (error?.code !== 'ORDER_NOT_APPLIED' || ignoredRetries >= DIRECT_BUY_MAX_RETRIES) {
                throw error;
              }
              ignoredRetries++;
              setStatus(t('statusRetryingPurchase', {
                crystal: row.label,
                attempt: ignoredRetries,
              }));
              await sleep(DIRECT_BUY_RETRY_DELAY_MS * ignoredRetries);
            }
          }

          if (result.matchedBatches > remainingBatches) {
            throw new Error(t('errorOrderResultMismatch', {
              crystal: row.label,
              submitted: result.submittedBatches,
              matched: result.matchedBatches,
              remaining: result.remainingBatches,
            }));
          }
          directMatchedBatches += result.matchedBatches;
          directMatchedCrystals += result.matchedBatches * row.batchSize;
          remainingBatches -= result.matchedBatches;
          if (!remainingBatches) break;

          if (result.matchedBatches > 0) {
            emptyRefreshes = 0;
            setStatus(t('statusDirectSweepProgress', {
              crystal: row.label,
              matched: result.matchedBatches.toLocaleString(),
              remaining: remainingBatches.toLocaleString(),
            }));
          continue;
          }

          emptyRefreshes++;
          if (emptyRefreshes > DIRECT_BUY_MAX_RETRIES) {
            throw new Error(t('errorNoSellOrders', {
              crystal: row.label,
              attempts: DIRECT_BUY_MAX_RETRIES,
            }));
          }
          setStatus(t('statusRefreshingSellOrders', {
            crystal: row.label,
            attempt: emptyRefreshes,
          }));
          await sleep(DIRECT_BUY_RETRY_DELAY_MS * emptyRefreshes);
        }
      }
    }

    if (mode === 'direct') {
      await refreshMarketSnapshot({ silent: true, rerender: false, applySavedSources: false });
      renderPlan(plan);
      setStatus(t('statusDirectBuyComplete', {
        types: rows.length,
        batches: directMatchedBatches.toLocaleString(),
        crystals: directMatchedCrystals.toLocaleString(),
      }));
    } else {
      setStatus(t('statusBuyOrdersComplete', {
        types: rows.length,
        matched: buyOrderMatchedTypes,
        pending: buyOrderPendingTypes,
      }));
    }
  }

  async function executeBatchUpgradePlan(plan, button) {
    if (!plan?.ok) {
      setStatus(t('errorNoValidPlan'));
      return;
    }

    let checked = 0;
    const currentRecords = await mapLimit(plan.results, HVUT_MAX_CONNECTIONS, async (result) => {
      const levels = await fetchMonsterLevels(result.monsterSlot);
      checked++;
      setStatus(t('statusCheckingMonsters', { done: checked, total: plan.results.length }));
      const record = {
        slot: result.monsterSlot,
        name: result.monsterName,
        levels,
      };
      return cacheMonsterRecord(record);
    });
    saveCache();

    const target = Number(plan.targetPL);
    let livePlan = buildBatchPlan(currentRecords, target);
    runtime.lastPlan = livePlan;
    renderPlan(livePlan);
    if (!livePlan.ok) {
      const invalidIndex = currentRecords.findIndex((record) => {
        const status = getLiveTargetState(record.levels, target, record.slot).status;
        return status !== 'reached' && status !== 'ready';
      });
      const invalidRecord = currentRecords[Math.max(0, invalidIndex)];
      const invalidState = getLiveTargetState(invalidRecord.levels, target, invalidRecord.slot);
      const issue = getTargetFailureIssue(
        invalidState.status,
        invalidRecord.slot,
        invalidState.currentPL,
        target
      );
      setStatus(t(issue.key, issue.params));
      return;
    }

    await refreshMarketSnapshot({ silent: true, rerender: false, applySavedSources: false });
    let crystalRows = getCrystalPlanRows(livePlan);
    renderPlan(livePlan, crystalRows);
    const initialCrystalIssue = getCrystalPlanIssue(crystalRows);
    if (initialCrystalIssue) {
      setStatus(t(initialCrystalIssue.key, initialCrystalIssue.params));
      return;
    }

    const estimate = estimateLiveRequests(livePlan);
    if (!estimate.requests) {
      setStatus(t('statusNoUpgrade'));
      return;
    }

    if (!confirm(t('confirmUpgrade', {
      monsters: livePlan.monsterCount,
      requests: estimate.requests,
      levels: estimate.levels,
      target: formatPL(target),
    }))) return;

    let requestCount = 0;
    let stopMessage = '';

    upgradeLoop:
    for (let monsterIndex = 0; monsterIndex < currentRecords.length; monsterIndex++) {
      while (true) {
        const record = currentRecords[monsterIndex];
        const liveState = getLiveTargetState(record.levels, target, record.slot);
        if (liveState.status === 'reached') {
          setStatus(t('statusMonsterTargetReached', {
            slot: record.slot,
            target: formatPL(target),
          }));
          break;
        }
        if (liveState.status !== 'ready') {
          const issue = getTargetFailureIssue(
            liveState.status,
            record.slot,
            liveState.currentPL,
            target
          );
          stopMessage = t(issue.key, issue.params);
          break upgradeLoop;
        }

        requestCount++;
        const request = liveState.request;
        button.textContent = t('buttonRunningUpgrade', {
          current: requestCount,
          total: Math.max(requestCount, estimate.requests),
        });
        setStatus(t('statusExecutingUpgrade', {
          request: requestCount,
          slot: request.slot,
          attr: attrLabel(request.attr),
          count: request.count,
        }));

        const html = await fetchText(request.url, request.data);
        markHvutStateStale();
        const snapshot = parseMonsterUpgradeSnapshot(htmlToDoc(html));
        if (!snapshot.levels) throw new Error(t('errorParseMonster'));

        const updatedRecord = cacheMonsterRecord({
          slot: record.slot,
          name: record.name,
          levels: snapshot.levels,
        });
        currentRecords[monsterIndex] = updatedRecord;

        if (snapshot.inventoryComplete) {
          applyMonsterStockSnapshot(snapshot.stocks);
        } else {
          clearCrystalStockSnapshot();
          await refreshMarketSnapshot({ silent: true, rerender: false, applySavedSources: false });
          if (!hasCompleteCrystalStock()) throw new Error(t('errorParseMonsterInventory'));
        }
        saveCache();

        const updatedPL = totalPL(updatedRecord.levels);
        livePlan = buildBatchPlan(currentRecords, target);
        crystalRows = getCrystalPlanRows(livePlan);
        const responseIssue = getUpgradeResponseIssue({
          snapshot,
          previousPL: liveState.currentPL,
          updatedPL,
          target,
          planOk: livePlan.ok,
          inventoryIssue: getCrystalPlanIssue(crystalRows),
          slot: record.slot,
          request,
        });
        if (responseIssue) {
          stopMessage = t(responseIssue.key, responseIssue.params);
          break upgradeLoop;
        }

        const nextState = getLiveTargetState(updatedRecord.levels, target, updatedRecord.slot);
        setStatus(nextState.status === 'reached'
          ? t('statusMonsterTargetReached', {
              slot: updatedRecord.slot,
              target: formatPL(target),
            })
          : t('statusLiveReplanning', {
              request: requestCount,
              slot: updatedRecord.slot,
              current: formatPL(updatedPL),
              target: formatPL(target),
            }));
        if (nextState.status === 'reached') break;
      }
    }

    if (stopMessage) {
      runtime.lastPlan = buildBatchPlan(currentRecords, target);
      renderPlan(runtime.lastPlan, getCrystalPlanRows(runtime.lastPlan));
      setStatus(stopMessage);
      return;
    }

    const finalRecords = await mapLimit(currentRecords, HVUT_MAX_CONNECTIONS, async (record) => {
      const levels = await fetchMonsterLevels(record.slot);
      return cacheMonsterRecord({
        slot: record.slot,
        name: record.name,
        levels,
      });
    });
    const complete = finalRecords.every((record) =>
      Math.abs(totalPL(record.levels) - target) <= EPS
    );

    await refreshMarketSnapshot({ silent: true, rerender: false, applySavedSources: false });
    runtime.lastPlan = buildBatchPlan(finalRecords, target);
    renderPlan(runtime.lastPlan);
    if (complete) {
      setStatus(t('statusUpgradeComplete', {
        total: finalRecords.length,
        target: formatPL(target),
        requests: requestCount,
      }));
      return;
    }

    const failedRecord = finalRecords.find((record) =>
      Math.abs(totalPL(record.levels) - target) > EPS
    );
    const failedPL = totalPL(failedRecord.levels);
    const failedIssue = getTargetFailureIssue(
      failedPL > target + EPS ? 'above' : 'unreachable',
      failedRecord.slot,
      failedPL,
      target
    );
    setStatus(t(failedIssue.key, failedIssue.params));
  }

  function renderPriceSourceSelect(id, selectedValue, values = priceSourceValues) {
    const select = elt('select', { id });

    values.forEach((value) => {
      select.appendChild(elt('option', {
        value,
        text: priceSourceLabel(value),
        dataset: { source: value },
        selected: selectedValue === value,
      }));
    });

    return select;
  }

  function renderButton(id, textKey) {
    return elt('button', {
      id,
      type: 'button',
      text: t(textKey),
      dataset: { i18n: textKey },
    });
  }

  function setRuntimeBusy(busy) {
    const nextBusy = Boolean(busy);
    runtime.busy = nextBusy;
    $all('.hvmepp-rename-control, .hvmepp-language-control')
      .forEach((control) => { control.disabled = nextBusy; });
    $all('.hvmepp-monster-list').forEach((list) => {
      list.setAttribute('aria-disabled', String(nextBusy));
      list.classList.toggle('hvmepp-disabled', nextBusy);
    });
  }

  function bindManagedAction(button, textKey, errorKey, action) {
    button.addEventListener('click', async () => {
      if (runtime.busy) return;

      setRuntimeBusy(true);
      button.disabled = true;
      try {
        await action(button);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logWarning(
          'ui.action.stopped',
          'A panel action stopped before completing all remaining work.',
          { action: button.id || textKey, statusKey: errorKey },
          error
        );
        setStatus(t(errorKey, { message }));
      } finally {
        button.disabled = false;
        button.textContent = t(textKey);
        setRuntimeBusy(false);
      }
    });
  }

  function setStatus(text) {
    const n = $('#hvmepp-log-message') || $('#hvmepp-rename-status');
    if (n) n.textContent = text || '';
  }

  function renderLogSummary() {
    const node = $('#hvmepp-log-summary');
    if (!node) return;
    const record = runtime.monsters.get(String(state.selectedMonsterSlots[0] || ''));
    const current = record ? totalPL(record.levels) : 0;
    node.replaceChildren(
      `${t('labelCurrentPL')}: `, elt('b', { text: formatPL(current) }),
      `  ${t('labelTargetPL')}: `, elt('b', { text: formatPL(state.targetPL || 0) }),
      `  ${t('labelNeedPL')}: `, elt('b', { text: formatPL((Number(state.targetPL) || 0) - current) }),
      `  ${t('labelMaxPL')}: `, elt('b', { text: formatPL(maxPL) })
    );
  }

  function refreshLanguageButtons() {
    $all('.hvmepp-lang-switch button').forEach((button) => {
      const active = button.dataset.language === state.language;
      button.classList.toggle('hvmepp-lang-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function setLanguage(language) {
    if (runtime.busy) return;
    readInputs({ save: false });
    state.language = normalizeLanguage(language);
    saveState();
    refreshLocalizedText({ rerenderResult: false });
    if (runtime.panelMode === 'planner' && state.selectedMonsterSlots.length) calculate();
    setStatus(t('statusLanguageChanged'));
  }

  function renderLanguageSwitcher() {
    const switcher = elt('div', {
      class: 'hvmepp-lang-switch', role: 'group', ariaLabel: 'Language / 语言',
    });
    languageOptions.forEach(([language, label]) => {
      const button = elt('button', {
        type: 'button',
        class: 'hvmepp-language-control',
        text: label,
        dataset: { language },
      });
      button.addEventListener('click', () => setLanguage(language));
      switcher.appendChild(button);
    });
    queueMicrotask(refreshLanguageButtons);
    return switcher;
  }

  function refreshLocalizedText({ rerenderResult = true } = {}) {
    $all('[data-i18n]').forEach((node) => {
      node.textContent = t(node.dataset.i18n);
    });

    $all('[data-i18n-value]').forEach((node) => {
      node.value = t(node.dataset.i18nValue);
    });

    $all('[data-i18n-placeholder]').forEach((node) => {
      node.placeholder = t(node.dataset.i18nPlaceholder);
    });

    $all('[data-i18n-aria-label]').forEach((node) => {
      node.setAttribute('aria-label', t(node.dataset.i18nAriaLabel));
    });

    $all('[data-attr]').forEach((node) => {
      node.textContent = attrLabel(node.dataset.attr);
    });

    $all('#hvmepp-source option, #hvmepp-order-source option').forEach((option) => {
      option.textContent = priceSourceLabel(option.dataset.source || option.value);
    });
    refreshLanguageButtons();
    if (runtime.hvutStale && $(HVUT.upgraderButton)) {
      $(HVUT.upgraderButton).title = t('statusHvutStale');
    }
    renderLogSummary();
    syncMonsterSelection();

    if (rerenderResult && runtime.lastPlan && $('#hvmepp-upgrade-result')?.hasChildNodes()) {
      renderPlan(runtime.lastPlan);
    }
  }

  function renderCollapsibleSection(id, headingKey, { open = false, className = '' } = {}) {
    const section = elt('details', {
      id,
      class: `hvmepp-card hvmepp-section hvmepp-collapsible ${className}`.trim(),
      open,
    });
    section.appendChild(elt('summary', { class: 'hvmepp-section-heading' }, [
      elt('span', { text: t(headingKey), dataset: { i18n: headingKey } }),
    ]));
    const body = elt('div', { class: 'hvmepp-section-body' });
    section.appendChild(body);
    return { section, body };
  }

  function renderConfiguredSection(config) {
    let section;
    let body;
    if (config.collapsible === false) {
      section = elt('section', {
        id: config.id,
        class: `hvmepp-card hvmepp-section ${config.className}`,
      }, elt('h3', { text: t(config.headingKey), dataset: { i18n: config.headingKey } }));
      body = section;
    } else {
      ({ section, body } = renderCollapsibleSection(config.id, config.headingKey, {
        open: config.open || (config.openWhenCustom && state.orderPriceSource === 'custom'),
        className: config.className,
      }));
    }
    body.appendChild(elt('div', {
      id: config.contentId,
      class: config.contentClass || '',
    }, (config.childIds || []).map((id) => elt('div', { id }))));
    return section;
  }

  function renderCrystalPlan(plan, rows) {
    const content = elt('div', { class: 'hvmepp-crystal-content' });

    if (!plan.ok) {
      content.appendChild(elt('div', { class: 'hvmepp-alert hvut-warn', text: t('crystalPlanUnavailable') }));
      return content;
    }

    const table = elt('table', { class: 'hvmepp-table hvmepp-crystal-table' });
    table.appendChild(elt('tr', {}, TABLE_HEADER_KEYS.crystal
      .map((key) => elt('th', { text: t(key) }))));

    rows.forEach((row) => {
      const shortage = row.shortage === null ? '-' : row.shortage.toLocaleString();
      let estimatedCost = row.shortage > 0 ? t('estimateUnavailable') : formatMoney(0);
      let estimateTitle = '';
      const estimate = row.orderBookEstimate;
      if (estimate) {
        estimatedCost = estimate.remainingBatches
          ? t('estimatePartial', {
            available: estimate.coveredBatches.toLocaleString(),
            needed: row.batches.toLocaleString(),
          })
          : formatMoney(estimate.estimatedCost);
        const range = estimate.lowestBatchPrice === estimate.highestBatchPrice
          ? `${estimate.lowestBatchPrice} C`
          : `${estimate.lowestBatchPrice}-${estimate.highestBatchPrice} C`;
        estimateTitle = range;
      } else if (row.shortage > 0 && row.orderBookLoaded) {
        estimatedCost = t('estimateNoSellOrders');
      }
      const tr = elt('tr', { class: row.shortage > 0 ? 'hvmepp-shortage hvut-warn' : '' }, [
        elt('td', { text: row.label }),
        elt('td', { text: row.required.toLocaleString() }),
        elt('td', { text: row.stock === null ? t('stockUnknown') : row.stock.toLocaleString() }),
        elt('td', { text: shortage }),
        elt('td', { text: estimatedCost, title: estimateTitle }),
        elt('td', {}, elt('input', {
          id: `hvmepp-order-price-${row.attr}`,
          type: 'number',
          min: 1,
          step: 1,
          value: row.orderBatchPrice || '',
          disabled: !row.batchSize,
          title: row.label,
        })),
      ]);
      table.appendChild(tr);
    });
    content.appendChild(elt('div', { class: 'hvmepp-table-wrap' }, table));

    const estimateSummary = getPurchaseEstimateSummary(rows);
    if (estimateSummary) {
      content.appendChild(elt('div', {
        class: 'hvmepp-estimate-summary',
        text: estimateSummary.complete
          ? t('estimateSummary', { cost: formatMoney(estimateSummary.estimatedCost) })
          : t('estimatePartialSummary', {
            available: estimateSummary.coveredBatches.toLocaleString(),
            needed: estimateSummary.totalBatches.toLocaleString(),
          }),
      }));
    }

    return content;
  }

  function renderPlan(plan, crystalRows = null) {
    const crystalBox = $('#hvmepp-crystal-result');
    const upgradeBox = $('#hvmepp-upgrade-result');
    if (!crystalBox || !upgradeBox) return;
    const crystalFragment = document.createDocumentFragment();
    const upgradeFragment = document.createDocumentFragment();

    if (!plan || plan.message) {
      const invalidPlan = plan || { ok: false };
      crystalFragment.appendChild(renderCrystalPlan(invalidPlan, []));
      upgradeFragment.appendChild(elt('div', {
        class: 'hvmepp-alert hvut-warn',
        text: plan?.message || t('errorNoValidPlan'),
      }));
    } else {
      upgradeFragment.appendChild(elt('div', { class: 'hvmepp-total' }, [
        `${t('totalMonsters')} `,
        elt('span', { class: 'hvmepp-good hvut-bonus', text: String(plan.monsterCount) }),
        `   ${t('totalCost')} `,
        elt('span', { class: 'hvmepp-good hvut-bonus', text: formatMoney(plan.totalCost) }),
      ]));
      crystalFragment.appendChild(renderCrystalPlan(plan, crystalRows || getCrystalPlanRows(plan)));
      plan.results.forEach((result) => {
        const details = elt('details', { class: 'hvmepp-monster-result' }, elt('summary', {
          text: result.ok
            ? `#${result.monsterSlot || '-'} ${result.monsterName} / PL ${formatPL(result.currentPL)} → ${formatPL(result.targetPL)} / ${formatMoney(result.totalCost)}`
            : `#${result.monsterSlot || '-'} ${result.monsterName}`,
        }));
        if (!result.ok) {
          details.appendChild(elt('div', { class: 'hvmepp-alert hvut-warn', text: result.message }));
        } else {
          const table = elt('table', { class: 'hvmepp-table' }, elt('tr', {}, TABLE_HEADER_KEYS.upgrade
            .map((key) => elt('th', { text: t(key) }))));
          const upgraded = displayAll.filter((attr) => result.agg[attr].k > 0);
          (upgraded.length ? upgraded : [null]).forEach((attr) => {
            const item = attr && result.agg[attr];
            table.appendChild(attr
              ? elt('tr', { class: 'hvmepp-upgraded' }, [
                  elt('td', { text: attrLabel(attr) }), elt('td', { text: item.from }),
                  elt('td', { text: item.to }), elt('td', { text: `+${item.k}` }),
                  elt('td', { text: formatMoney(item.cost) }),
                ])
              : elt('tr', {}, elt('td', { colspan: 5, text: t('noUpgradeNeeded') })));
          });
          details.appendChild(elt('div', { class: 'hvmepp-table-wrap' }, table));
        }
        upgradeFragment.appendChild(details);
      });
    }
    const panel = $('#hvmepp-panel');
    const scrollTop = panel?.scrollTop || 0;
    crystalBox.replaceChildren(crystalFragment);
    upgradeBox.replaceChildren(upgradeFragment);
    crystalBox.removeAttribute('aria-busy');
    upgradeBox.removeAttribute('aria-busy');
    if (panel) panel.scrollTop = scrollTop;
  }

  function calculate() {
    clearTimeout(runtime.calculationTimer);
    runtime.calculationTimer = null;
    readInputs();
    renderLogSummary();

    const selected = state.selectedMonsterSlots;
    if (!selected.length) {
      runtime.lastPlan = null;
      renderPlan(null);
      return null;
    }

    const monsters = selected.map((slot) => runtime.monsters.get(String(slot))).filter(Boolean);
    if (monsters.length !== selected.length) {
      const invalidPlan = { message: t('errorMonstersNotLoaded') };
      runtime.lastPlan = null;
      renderPlan(invalidPlan);
      setStatus(invalidPlan.message);
      return invalidPlan;
    }

    const plan = buildBatchPlan(monsters, Number(state.targetPL));
    runtime.lastPlan = plan;
    renderPlan(plan);
    return plan;
  }

  function monsterOptionText(monster, mode = runtime.panelMode) {
    const label = `#${monster.index} ${monster.name}`;
    return mode === 'planner' ? `${label} / PL ${monster.pl}` : label;
  }

  function renderMonsterSelection(monsterList) {
    const { section, body } = renderCollapsibleSection('hvmepp-selection-section', 'headingMonsterSelection', {
      className: 'hvmepp-monster-select-card',
    });

    body.appendChild(elt('div', { class: 'hvmepp-selection-meta' }, [
      elt('span', { id: 'hvmepp-selection-summary' }),
      elt('span', {
        class: 'hvmepp-selection-help',
        text: t('monsterSelectionHelp'),
        dataset: { i18n: 'monsterSelectionHelp' },
      }),
    ]));

    const selected = new Set(state.selectedMonsterSlots.map(String));

    const list = elt('div', {
      class: 'hvmepp-monster-list',
      tabindex: 0,
      role: 'listbox',
      'aria-label': t('headingMonsterSelection'),
      'aria-multiselectable': 'true',
      'aria-disabled': String(runtime.busy),
      dataset: { i18nAriaLabel: 'headingMonsterSelection' },
    });
    monsterList.forEach((monster) => {
      const slot = String(monster.index);
      list.appendChild(elt('div', {
        class: `hvmepp-monster-option${selected.has(slot) ? ' hvmepp-selected' : ''}`,
        role: 'option',
        'aria-selected': String(selected.has(slot)),
        text: monsterOptionText(monster),
        dataset: { slot },
      }));
    });
    body.appendChild(list);

    list.addEventListener('click', (event) => {
      if (runtime.busy) return;
      list.focus({ preventScroll: true });
      const option = event.target.closest('.hvmepp-monster-option');
      if (option) {
        syncMonsterSelection({
          type: 'item',
          slot: option.dataset.slot,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
        });
      } else if (event.target === list) {
        syncMonsterSelection({ type: 'clear' });
      }
    });
    list.addEventListener('keydown', (event) => {
      if (runtime.busy || !(event.ctrlKey && event.key.toLowerCase() === 'a')) return;
      event.preventDefault();
      event.stopPropagation();
      syncMonsterSelection({ type: 'all' });
    });

    queueMicrotask(() => syncMonsterSelection());
    return section;
  }

  function getRenamePreviewData(monsterList = runtime.monsterList) {
    const mode = $('#hvmepp-rename-mode')?.value || state.renameMode;
    if (mode === 'text') {
      const text = $('#hvmepp-rename-mappings')?.value ?? runtime.renameMappingText;
      const parsed = parseRenameMappings(text);
      const planned = buildTextRenameTargets(
        monsterList,
        filterRenameMappingsBySelection(parsed.entries, state.selectedMonsterSlots)
      );
      return {
        mode,
        targets: planned.targets,
        issues: [...parsed.errors, ...planned.issues],
      };
    }

    const prefix = String($('#hvmepp-rename-prefix')?.value ?? state.renamePrefix).trim();
    const selected = new Set(state.selectedMonsterSlots.map(String));
    return {
      mode,
      prefix,
      targets: monsterList
        .filter((monster) => selected.has(String(monster.index)))
        .map((monster) => ({
          slot: String(monster.index),
          currentName: String(monster.name).trim(),
          prefix,
          mode: 'random',
        })),
      issues: [],
    };
  }

  function refreshRenamePreview() {
    const preview = $('#hvmepp-rename-preview');
    if (!preview) return;

    const data = getRenamePreviewData();
    const fragment = document.createDocumentFragment();
    fragment.appendChild(elt('div', {
      text: t('renamePreviewSummary', {
        targets: data.targets.length,
        issues: data.issues.length,
      }),
    }));

    if (data.mode === 'random' && data.prefix) {
      fragment.appendChild(elt('div', {
        class: 'hvmepp-rename-pattern',
        text: t('renamePreviewRandom', { prefix: data.prefix }),
      }));
    }

    const items = data.targets.slice(0, 20).map((target) => elt('li', {
      text: target.mode === 'text'
        ? `#${target.slot} ${target.currentName} → ${target.targetName}`
        : `#${target.slot} ${target.currentName} → ${target.prefix || ''}######`,
    }));
    items.push(...data.issues.slice(0, 20).map((issue) => elt('li', {
      class: 'hvmepp-rename-issue',
      text: renameIssueText(issue),
    })));
    if (data.targets.length + data.issues.length > 20) {
      items.push(elt('li', { text: '…' }));
    }
    if (items.length) fragment.appendChild(elt('ul', {}, items));
    preview.replaceChildren(fragment);
  }

  function renderMonsterRename(monsterList) {
    const { section, body } = renderCollapsibleSection('hvmepp-rename-section', 'headingMonsterRename', {
      open: true,
      className: 'hvmepp-rename-card',
    });
    body.innerHTML = `
      <div class="hvmepp-controls"><label><span data-i18n="labelRenameMode">${t('labelRenameMode')}</span>
        <select id="hvmepp-rename-mode" class="hvmepp-rename-control">
          <option value="text" data-i18n="renameModeText">${t('renameModeText')}</option>
          <option value="random" data-i18n="renameModeRandom">${t('renameModeRandom')}</option>
        </select></label></div>
      <div id="hvmepp-rename-text-section">
        <div class="hvmepp-rename-file-label"><span data-i18n="labelRenameMappingFile">${t('labelRenameMappingFile')}</span>
          <div class="hvmepp-file-picker"><input id="hvmepp-rename-file" type="file" accept=".txt,text/plain" class="hvmepp-rename-control hvmepp-file-input">
            <button id="hvmepp-choose-rename-file" type="button" class="hvmepp-rename-control" data-i18n="buttonChooseFile">${t('buttonChooseFile')}</button>
            <span id="hvmepp-rename-file-name" class="hvmepp-file-name"></span></div></div>
        <div class="hvmepp-rename-help" data-i18n="renameMappingHelp">${t('renameMappingHelp')}</div>
        <label class="hvmepp-rename-text-label"><span data-i18n="labelRenameMappingText">${t('labelRenameMappingText')}</span>
          <textarea id="hvmepp-rename-mappings" rows="5" class="hvmepp-rename-control" data-i18n-placeholder="renameMappingPlaceholder" placeholder="${t('renameMappingPlaceholder')}"></textarea></label>
      </div>
      <div id="hvmepp-rename-random-section" class="hvmepp-controls"><label><span data-i18n="labelRenamePrefix">${t('labelRenamePrefix')}</span>
        <input id="hvmepp-rename-prefix" type="text" class="hvmepp-rename-control" data-i18n-placeholder="renamePrefixPlaceholder" placeholder="${t('renamePrefixPlaceholder')}"></label></div>
      <div id="hvmepp-rename-preview" class="hvmepp-rename-preview"></div>
      <div class="hvmepp-controls"><button id="hvmepp-export-names" type="button" class="hvmepp-rename-control" data-i18n="buttonExportNames">${t('buttonExportNames')}</button>
        <button id="hvmepp-run-rename" type="button" class="hvmepp-rename-control" data-i18n="buttonRunRename">${t('buttonRunRename')}</button></div>
      <div id="hvmepp-rename-status" class="hvmepp-rename-status"></div>`;

    const modeSelect = $('#hvmepp-rename-mode', body);
    const mappingFile = $('#hvmepp-rename-file', body);
    const mappingFileName = $('#hvmepp-rename-file-name', body);
    const mappingTextarea = $('#hvmepp-rename-mappings', body);
    const mappingSection = $('#hvmepp-rename-text-section', body);
    const randomSection = $('#hvmepp-rename-random-section', body);
    const prefixInput = $('#hvmepp-rename-prefix', body);
    const exportButton = $('#hvmepp-export-names', body);
    const runButton = $('#hvmepp-run-rename', body);
    modeSelect.value = state.renameMode;
    mappingTextarea.value = runtime.renameMappingText;
    prefixInput.value = state.renamePrefix;
    mappingFileName.textContent = runtime.renameMappingFileName || t('renameFileNone');
    if (!runtime.renameMappingFileName) mappingFileName.dataset.i18n = 'renameFileNone';
    $('#hvmepp-choose-rename-file', body).addEventListener('click', () => mappingFile.click());

    const syncMode = () => {
      state.renameMode = modeSelect.value === 'random' ? 'random' : 'text';
      mappingSection.classList.toggle('hvut-none', state.renameMode !== 'text');
      randomSection.classList.toggle('hvut-none', state.renameMode !== 'random');
      saveState();
      refreshRenamePreview();
    };
    modeSelect.addEventListener('change', syncMode);
    mappingTextarea.addEventListener('input', () => {
      runtime.renameMappingText = mappingTextarea.value;
      refreshRenamePreview();
    });
    prefixInput.addEventListener('input', () => {
      state.renamePrefix = prefixInput.value.trim();
      refreshRenamePreview();
    });
    prefixInput.addEventListener('change', saveState);
    mappingFile.addEventListener('change', async () => {
      const file = mappingFile.files?.[0];
      if (!file) {
        runtime.renameMappingFileName = '';
        mappingFileName.dataset.i18n = 'renameFileNone';
        mappingFileName.textContent = t('renameFileNone');
        return;
      }
      mappingFileName.removeAttribute('data-i18n');
      mappingFileName.textContent = file.name;
      runtime.renameMappingFileName = file.name;
      try {
        runtime.renameMappingText = await file.text();
        mappingTextarea.value = runtime.renameMappingText;
        const parsed = parseRenameMappings(runtime.renameMappingText);
        refreshRenamePreview();
        setStatus(t('statusRenameFileLoaded', {
          file: file.name,
          mappings: parsed.entries.length,
          errors: parsed.errors.length,
        }));
      } catch (error) {
        setStatus(t('statusRenameFileReadFailed', {
          message: error instanceof Error ? error.message : String(error),
        }));
      }
    });
    bindManagedAction(exportButton, 'buttonExportNames', 'statusRenameExportFailed', exportMonsterNames);
    bindManagedAction(runButton, 'buttonRunRename', 'statusRenameFailed',
      (managedButton) => executeBatchRename(managedButton));

    queueMicrotask(() => {
      runtime.monsterList = monsterList;
      syncMode();
    });
    return section;
  }

  function renderPlannerControls() {
    const controls = elt('div', { id: 'hvmepp-planner-controls' });
    const settings = elt('div', { class: 'hvmepp-controls hvmepp-planner-settings' });
    const actions = elt('div', { class: 'hvmepp-top-actions' });

    settings.appendChild(elt('label', {}, [
      elt('span', { text: t('labelTargetInput'), dataset: { i18n: 'labelTargetInput' } }),
      ' ',
      elt('input', {
        id: 'hvmepp-target',
        type: 'number',
        step: 0.5,
        value: state.targetPL,
      }),
    ]));

    settings.appendChild(elt('label', {}, [
      elt('span', { text: t('labelPriceSource'), dataset: { i18n: 'labelPriceSource' } }),
      ' ',
      renderPriceSourceSelect('hvmepp-source', state.priceSource),
    ]));

    const orderSource = renderPriceSourceSelect('hvmepp-order-source', state.orderPriceSource, orderPriceSourceValues);
    settings.appendChild(elt('label', {}, [
      elt('span', { text: t('labelOrderPriceSource'), dataset: { i18n: 'labelOrderPriceSource' } }),
      ' ',
      orderSource,
    ]));

    const actionHandlers = {
      refresh: refreshAllData,
      direct: (button) => executeCrystalPurchase('direct', button),
      order: (button) => executeCrystalPurchase('order', button),
      upgrade: (button) => executeBatchUpgradePlan(calculate(), button),
    };
    const actionButtons = Object.fromEntries(PLANNER_ACTION_CONFIGS.map(([name, id, textKey]) =>
      [name, renderButton(id, textKey)]
    ));
    actions.append(...Object.values(actionButtons));
    controls.append(settings, actions);

    settings.querySelector('#hvmepp-target').addEventListener('input', () => scheduleCalculation(80));
    settings.querySelector('#hvmepp-source').addEventListener('change', () => {
      readInputs({ save: false });
      const result = applyPricesByCrystal(getCrystalPricesForSource(state.priceSource));
      scheduleCalculation();
      setStatus(result.failed.length
        ? t('statusSavedPriceSourcePartial', {
          source: priceSourceLabel(state.priceSource),
          updated: result.updated,
          failed: joinList(result.failed),
        })
        : t('statusSavedPriceSource', { source: priceSourceLabel(state.priceSource) }));
    });
    orderSource.addEventListener('change', () => {
      state.orderPriceSource = orderSource.value;
      if (state.orderPriceSource === 'custom') {
        document.querySelector('#hvmepp-crystal-section').open = true;
      }
      applyOrderPricesFromCache();
    });

    PLANNER_ACTION_CONFIGS.forEach(([name, , textKey, errorKey]) =>
      bindManagedAction(actionButtons[name], textKey, errorKey, actionHandlers[name])
    );
    return controls;
  }

  function renderPanel(mode = 'planner') {
    if (runtime.busy) return;
    const panelMode = mode === 'rename' ? 'rename' : 'planner';
    const host = getHvutHost();
    if (!host) {
      showHvutDependencyError(t('errorHvutRequired', { version: HVUT_REQUIRED_VERSION }));
      return;
    }
    let panel = $('#hvmepp-panel') || runtime.panelElement;

    if (panel?.dataset.mode === panelMode) {
      panel.classList.remove('hvut-none');
      setDokidokiView(true);
      const easterEgg = $('#hvmepp-easter-egg');
      if (easterEgg) easterEgg.textContent = randomEasterEgg();
      refreshLocalizedText();
      return;
    }

    clearTimeout(runtime.calculationTimer);
    runtime.calculationTimer = null;
    panel?.remove();
    runtime.panelElement = null;
    runtime.panelMode = panelMode;
    $all(`${HVUT.upgraderPanel}, .hvut-ml-plc`).forEach((node) => node.classList.add('hvut-none'));
    panel = elt('div', {
      id: 'hvmepp-panel', class: 'hvut-ml-up hvmepp-panel',
      dataset: { mode: panelMode, version: ADDON_VERSION, hvutVersion: HVUT_REQUIRED_VERSION },
    });
    panel.appendChild(renderLanguageSwitcher());

    const easterEgg = elt('button', {
      id: 'hvmepp-easter-egg', class: 'hvmepp-easter-egg', type: 'button',
      text: randomEasterEgg(),
      title: 'Click to refresh',
    });
    easterEgg.addEventListener('click', () => {
      easterEgg.textContent = randomEasterEgg(easterEgg.textContent);
    });

    const closeButton = elt('button', { text: '×', class: 'hvmepp-close' });
    const titleKey = panelMode === 'rename' ? 'renameTitle' : 'plannerTitle';
    panel.appendChild(elt('div', { class: 'hvmepp-title' }, [
      elt('span', { text: t(titleKey), dataset: { i18n: titleKey } }),
      elt('div', { class: 'hvmepp-title-actions' }, [easterEgg, closeButton]),
    ]));
    closeButton.addEventListener('click', () => {
      panel.classList.add('hvut-none');
      setDokidokiView(false);
    });

    runtime.monsterList = parseHvutMonsterList();
    hydrateMonsterCache(runtime.monsterList);
    if (panelMode === 'rename') {
      if (runtime.monsterList.length) {
        panel.append(renderMonsterSelection(runtime.monsterList), renderMonsterRename(runtime.monsterList));
      }
    } else {
      panel.appendChild(renderPlannerControls());
      if (runtime.monsterList.length) panel.appendChild(renderMonsterSelection(runtime.monsterList));
      panel.append(...PLANNER_SECTION_CONFIGS.map(renderConfiguredSection));
      renderLogSummary();
    }
    const panelHost = getDokidokiHost()?.addonHost || host.mainpane;
    panelHost.appendChild(panel);
    runtime.panelElement = panel;
    setDokidokiView(true);
  }

  function createEntryButton(mode) {
    const isRename = mode === 'rename';
    const textKey = isRename ? 'renameTitle' : 'plannerTitle';
    const btn = elt('input', {
      id: isRename ? 'hvmepp-rename-entry' : 'hvmepp-planner-entry',
      type: 'button',
      value: t(textKey),
      class: 'hvmepp-entry',
      dataset: {
        i18nValue: textKey,
        panelMode: mode,
        version: ADDON_VERSION,
        hvutVersion: HVUT_REQUIRED_VERSION,
      },
    });

    btn.addEventListener('click', () => renderPanel(mode));
    return btn;
  }

  function bindHvutPanelHandoff() {
    if (document.documentElement.dataset.hvmmAddonBound) return;
    document.documentElement.dataset.hvmmAddonBound = 'true';
    document.addEventListener('click', (event) => {
      const control = event.target.closest?.(`${HVUT.side} input[type="button"], ${HVUT.side} button`);
      if (!control || control.closest('.hvmepp-entry')) return;
      ($('#hvmepp-panel') || runtime.panelElement)?.classList.add('hvut-none');
      setDokidokiView(false);
    }, true);
  }

  function mountEntryButtons() {
    const existingPlanner = $('#hvmepp-planner-entry');
    const existingRename = $('#hvmepp-rename-entry');
    if (existingPlanner && existingRename) return true;

    const side = $(HVUT.side);
    if (!side) return false;

    const plannerButton = existingPlanner || createEntryButton('planner');
    const renameButton = existingRename || createEntryButton('rename');
    const plcButton = $all('input[type="button"], button', side).find((node) =>
      (node.value || node.textContent || '').trim() === 'Power Level Calculator'
    );
    bindHvutPanelHandoff();

    if (plcButton) {
      plcButton.after(plannerButton, renameButton);
    } else {
      side.append(plannerButton, renameButton);
    }

    return true;
  }

  function showHvutDependencyError(message) {
    let box = $('#hvmepp-dependency-error');
    if (!box) {
      box = elt('div', { id: 'hvmepp-dependency-error', class: 'hvmepp-alert hvut-warn' });
      ($('#monster_outer') || $(HVUT.mainpane) || document.body).prepend(box);
    }
    box.textContent = message;
  }

  async function scheduleEntryButtons() {
    try {
      await waitForDom(
        getHvutHost,
        15000,
        t('errorHvutRequired', { version: HVUT_REQUIRED_VERSION })
      );
      mountEntryButtons();
    } catch (error) {
      showHvutDependencyError(error.message);
      logWarning('hvutils.host.missing', 'The required HV Utils Monster Lab host was not found.', {
        requiredVersion: HVUT_REQUIRED_VERSION,
      }, error);
    }
  }

  GM_addStyle(`
    .hvmepp-entry{cursor:pointer;display:block;box-sizing:border-box;}
    #hvmepp-panel{width:var(--hvmm-panel-width,100%);max-width:100%;height:675px;overflow:auto;overflow-anchor:none;background:var(--color-bg-default);color:var(--color-font-default);border:1px solid var(--color-border-default);padding:8px;font:9pt/1.25 Arial,sans-serif;text-align:left;box-sizing:border-box;}
    #hvmepp-dependency-error{margin:8px;}
    #hvmepp-hvut-stale{display:flex;align-items:center;justify-content:space-between;gap:8px;}
    .hvmepp-title{display:flex;justify-content:space-between;align-items:center;font-weight:bold;font-size:11pt;margin-bottom:4px;}
    .hvmepp-lang-switch{display:flex;justify-content:center;align-items:center;gap:6px;margin:0 32px 5px;}
    .hvmepp-lang-switch button{min-width:76px;padding:2px 8px;border:1px solid var(--color-border-light);background:var(--color-bg-alpha);color:var(--color-font-default);cursor:pointer;font:inherit;}
    .hvmepp-lang-switch button.hvmepp-lang-active{border-color:var(--color-border-default);background:var(--color-bg-h1);color:var(--color-font-default);font-weight:bold;}
    .hvmepp-title-actions{display:flex;align-items:center;gap:8px;}
    .hvmepp-easter-egg{padding:0;border:0;background:none;color:var(--color-font-light);cursor:pointer;font-family:inherit;font-size:9pt;font-weight:normal;white-space:nowrap;}
    .hvmepp-close{width:24px;height:22px;cursor:pointer;}
    .hvmepp-log-output{padding:4px 6px;background:var(--color-bg-alpha);border:1px solid var(--color-border-light);}
    #hvmepp-log-message:not(:empty){margin-top:4px;padding-top:4px;border-top:1px solid var(--color-border-alpha);}
    .hvmepp-controls{display:flex;flex-wrap:wrap;gap:4px 8px;align-items:center;margin:5px 0;}
    .hvmepp-controls input,.hvmepp-controls select{font-size:9pt;}
    .hvmepp-controls button{cursor:pointer;font:inherit;padding:2px 6px;}
    .hvmepp-top-actions{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;margin:5px 0;}
    .hvmepp-top-actions button{min-width:0;padding:2px 4px;font:inherit;white-space:normal;cursor:pointer;}
    .hvmepp-card{border:1px solid var(--color-border-light);background:var(--color-bg-alpha);padding:5px;}
    .hvmepp-section{margin:6px 0;}
    .hvmepp-collapsible{padding:0;}
    .hvmepp-section-heading{padding:5px 7px;cursor:pointer;font-size:10pt;font-weight:bold;user-select:none;}
    .hvmepp-collapsible[open] > .hvmepp-section-heading{border-bottom:1px solid var(--color-border-light);}
    .hvmepp-section-body{padding:5px;}
    .hvmepp-card h3{margin:0 0 4px;font-size:10pt;}
    .hvmepp-selection-meta{display:grid;gap:2px;margin-bottom:4px;}
    .hvmepp-selection-help{color:var(--color-font-light);font-size:8pt;}
    .hvmepp-monster-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:2px 8px;max-height:170px;overflow:auto;padding:4px;border:1px solid var(--color-border-light);background:var(--color-bg-alpha);}
    .hvmepp-monster-list:focus-visible{outline:1px solid var(--color-border-default);outline-offset:1px;}
    .hvmepp-monster-option{min-width:0;padding:2px 4px;overflow:hidden;border:1px solid transparent;white-space:nowrap;text-overflow:ellipsis;user-select:none;cursor:default;}
    .hvmepp-monster-option.hvmepp-selected{border-color:var(--color-border-default);background:var(--color-bg-h1);}
    .hvmepp-monster-list.hvmepp-disabled{opacity:0.55;}
    .hvmepp-rename-file-label,.hvmepp-rename-text-label{display:grid;gap:3px;margin:4px 0;}
    .hvmepp-file-input{display:none;}
    .hvmepp-file-picker{display:flex;flex-wrap:wrap;align-items:center;gap:6px;}
    .hvmepp-file-name{color:var(--color-font-invalid);overflow-wrap:anywhere;}
    #hvmepp-rename-mappings{width:100%;box-sizing:border-box;resize:vertical;font:9pt/1.35 Consolas,monospace;}
    #hvmepp-rename-prefix{min-width:180px;}
    .hvmepp-rename-help{color:var(--color-font-invalid);margin:3px 0;}
    .hvmepp-rename-preview{max-height:180px;overflow:auto;margin:4px 0;padding:4px;border:1px solid var(--color-border-light);background:var(--color-bg-alpha);}
    .hvmepp-rename-preview ul{margin:3px 0 0;padding-left:20px;}
    .hvmepp-rename-pattern{font-family:Consolas,monospace;}
    .hvmepp-rename-issue{color:var(--color-font-warn);}
    .hvmepp-rename-status{min-height:1.25em;margin-top:5px;padding-top:5px;border-top:1px solid var(--color-border-light);}
    .hvmepp-table{width:100%;border-collapse:collapse;margin:4px 0;table-layout:fixed;font-size:9pt;}
    .hvmepp-table-wrap{width:100%;overflow-x:auto;overflow-y:hidden;}
    .hvmepp-table-wrap>.hvmepp-table{min-width:560px;}
    .hvmepp-table th,.hvmepp-table td{border:1px solid var(--color-border-light);padding:2px 3px;text-align:center;word-break:keep-all;}
    .hvmepp-table th{background:var(--color-bg-h1);}
    .hvmepp-table input{width:58px;text-align:right;box-sizing:border-box;}
    .hvmepp-total{margin:5px 0;padding:5px 6px;border:1px solid var(--color-border-light);background:var(--color-bg-light);line-height:1.4;font-weight:bold;}
    .hvmepp-monster-result{margin:5px 0;border:1px solid var(--color-border-light);background:var(--color-bg-alpha);}
    .hvmepp-monster-result > summary{padding:5px 6px;cursor:pointer;font-weight:bold;background:var(--color-bg-h1);}
    .hvmepp-monster-result > .hvmepp-table-wrap,.hvmepp-monster-result > .hvmepp-alert{width:calc(100% - 8px);margin:4px;}
    .hvmepp-crystal-table td:first-child,.hvmepp-crystal-table th:first-child{width:230px;text-align:left;}
    .hvmepp-crystal-table td:last-child,.hvmepp-crystal-table th:last-child{width:105px;}
    .hvmepp-crystal-table td:last-child input{width:96px;}
    .hvmepp-estimate-summary{margin:4px 0;padding:5px 6px;border:1px solid var(--color-border-light);background:var(--color-warn-bg);line-height:1.4;font-weight:bold;}
    .hvmepp-shortage{background:var(--color-warn-alpha);font-weight:bold;}
    .hvmepp-good{font-weight:bold;}
    .hvmepp-alert{margin:5px 0;padding:5px 6px;border:1px solid var(--color-font-warn);background:var(--color-warn-alpha);font-weight:bold;}
    .hvmepp-upgraded{background:var(--color-bg-light);}
    #dokidoki-shell #hvmepp-panel{--color-bg-default:var(--dokidoki-surface);--color-bg-alpha:var(--dokidoki-surface-2);--color-bg-h1:#382335;--color-bg-light:#2d1c2a;--color-border-default:var(--dokidoki-gold);--color-border-light:var(--dokidoki-border);--color-border-alpha:#70405288;--color-font-default:var(--dokidoki-text);--color-font-light:var(--dokidoki-muted);--color-font-invalid:#e3a7bd;--color-font-warn:#ffb0b9;--color-warn-bg:#4b2430;--color-warn-alpha:#6b263d77;position:relative!important;inset:auto!important;z-index:auto!important;width:100%;max-width:none;height:calc(100vh - 175px);min-height:560px;margin:0;padding:12px;border:0;border-radius:8px;background:var(--dokidoki-surface);color:var(--dokidoki-text);scrollbar-color:var(--dokidoki-wine) #120e15;}#dokidoki-shell #hvmepp-panel button,#dokidoki-shell #hvmepp-panel input,#dokidoki-shell #hvmepp-panel select,#dokidoki-shell #hvmepp-panel textarea{border-color:var(--dokidoki-border);background:#120e15;color:var(--dokidoki-text);}
    #dokidoki-shell #hvmepp-panel button:focus-visible,#dokidoki-shell #hvmepp-panel input:focus-visible,#dokidoki-shell #hvmepp-panel select:focus-visible,#dokidoki-shell #hvmepp-panel textarea:focus-visible{outline:2px solid #d3b27388;outline-offset:1px;}#dokidoki-shell #hvmepp-panel .hvmepp-table-wrap{max-width:100%;border-radius:5px;scrollbar-color:var(--dokidoki-wine) #120e15;}
    @media (max-width:900px){#hvmepp-panel{padding:6px;}
    #dokidoki-shell #hvmepp-panel{height:auto;min-height:0;max-height:none;padding:7px;}
    .hvmepp-table input{width:50px;}
    }
  `);

  setupDokidokiCompatibility();
  scheduleEntryButtons();
})();
