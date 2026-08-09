// ==UserScript==
// @name         HV综合汉化
// @namespace    hentaiverse.org
// @version      1.6.7
// @description  HV综合汉化，覆盖战斗页按钮、技能面板、结算页、信息面板和战斗日志等核心区域，采用分层架构和词典复用机制,支持动态内容翻译和关键词染色。
// @author       DDD
// @grant        none
// @include      *://hentaiverse.org/*
// @include      *://alt.hentaiverse.org/*
// @include      *://forums.e-hentai.org/*
// @include      *://reasoningtheory.net/*
// ==/UserScript==

(function () {
    'use strict';

    /*
     * 架构总览（单文件）：
     * 配置层 -> 词典解析层 -> 翻译执行层 -> 动态监听层 -> 启动层
     */

    // =========================================================
    // 0) 配置层：运行开关 / 区域映射 / 词典结构
    // =========================================================
    const CONFIG = {
        // 是否启用战斗页翻译总开关；关闭后按钮、技能面板、结算页、信息面板和战斗日志翻译都不运行
        battleTranslateEnabled: true,
        // 是否启用战斗日志翻译；需同时开启 battleTranslateEnabled 且 hideBattleLog 为 false，开启后用 #translog 显示中文日志
        battleLogTranslateEnabled: true,
        // 是否启用 #translog 内的关键词染色；只影响中文日志显示，不影响日志翻译本身
        battleLogColorEnabled: true,
        // 是否隐藏整个战斗日志面板；true 时不进行翻译，也不显示原日志；
        hideBattleLog: false,
        // 是否启用装备名染色（仅中文状态）；
        equipmentColorEnabled: true,
        // 是否翻译 HV Utils 献祭统计结果，装备名走拍卖站简约装备名词典
        translateHvutSnowflakeArtifact: true,
        // 动态翻译/外部装备/战斗日志等观察器的防抖时间，单位毫秒；
        observerDebounceMs: 80,
        // 单次动态变更节点过多时回退为整区翻译，避免对大量零散节点分别跑词典
        dynamicFullScanThreshold: 20,
        // 论坛页字体大小倍率；1 为原始大小
        forumFontScale: 1,
        // 切换按钮配置
        ui: {
            // 中英文切换按钮的 DOM id
            toggleButtonId: 'change-translate',
            // 当前为中文时按钮显示文字，点击后切回英文
            toggleButtonTextCN: '中',
            // 当前为英文时按钮显示文字，点击后切回中文
            toggleButtonTextEN: '英',
        },
    };

    // 词典组合（bundle）：用于复用 group 集合
    // 规则：'@bundleName' 表示引用另一个 bundle
    const GROUP_BUNDLES = {
        basicStats: ['base.attributes', 'base.proficiency', 'base.elements', 'base.avoidance', 'base.statLabels'],
        navPage: ['domain.nav', 'base.difficulty'],
        equipmentParts: ['equipment.parts'],
        leftPanel: ['domain.leftPanel', 'equipment.slots', '@equipmentParts', 'equipment.name', '@basicStats'],
        rightPanel: ['domain.rightPanel', '@basicStats'],
        equipmentDetailPage: ['equipment.detail', 'base.weaponEffects', '@equipmentParts', 'equipment.name', '@basicStats', 'base.effects'],
        moogleMailPage: ['domain.moogleMail', 'base.items', 'equipment.name', '@basicStats'],
        armoryPage: ['domain.armory', 'base.filterTags', 'base.items', 'equipment.name', 'equipment.detail', 'base.weaponEffects', '@equipmentParts', '@basicStats', 'base.effects'],
        marketPage: ['domain.market', 'base.items', 'base.filterTags'],
        itemShopPage: ['domain.itemShop', 'base.items', 'base.filterTags'],
        itemInventoryPage: ['domain.nav', 'domain.itemInventory', 'base.items'],
        shrinePage: ['domain.shrine', '@equipmentParts', 'base.items', 'base.proficiency', 'phrase.shrine'],
        shrineResultPage: ['phrase.shrine', 'base.items', 'equipment.name'],
        abilityPage: ['domain.ability', 'phrase.ability', 'base.items', 'base.spells', 'base.effects'],
        riddleMasterPage: ['domain.riddleMaster'],
        messageBoxPage: ['phrase.messagebox', 'base.items', 'equipment.name', '@basicStats'],
        monsterLabPage: ['domain.monsterLab', 'base.items', '@basicStats'],
        hvutEquipmentLinksPage: ['equipment.name'],
        hvutBottomPage: ['domain.hvutBottom'],
        hvutSnowflakeArtifactPage: ['domain.hvutSnowflakeArtifact', 'base.items', 'equipment.auctionName', 'equipment.name'],
        arenaPage: ['domain.arena', 'base.difficulty'],
        trainingPage: ['domain.training'],
        itemWorldPage: ['domain.armory', 'domain.itemWorld', 'base.items', 'base.difficulty', 'equipment.slots', 'equipment.name', 'equipment.detail', 'base.weaponEffects', '@equipmentParts', '@basicStats', 'base.effects'],
        popupPage: ['domain.popup', 'base.items', 'domain.itemMeta', 'phrase.itemTooltip', 'phrase.consumableTooltip'],
        lotteryPage: ['domain.lottery', 'base.items', 'equipment.name', 'equipment.detail', 'base.weaponEffects', '@equipmentParts', '@basicStats', 'base.effects'],
    };

    // profile -> bundle/group 引用
    // 一个 profile 代表一种“翻译上下文”
    const REGION_PROFILES = {
        popup: ['@popupPage'],
        equipmentPopup: ['@equipmentDetailPage'],
        navbar: ['@navPage'],
        leftPanel: ['@leftPanel'],
        rightPanel: ['@rightPanel'],
        equipmentDetail: ['@equipmentDetailPage'],
        moogleMail: ['@moogleMailPage'],
        armory: ['@armoryPage'],
        market: ['@marketPage'],
        itemFilter: ['base.filterTags'],
        itemShop: ['@itemShopPage'],
        itemInventory: ['@itemInventoryPage'],
        shrine: ['@shrinePage'],
        shrineResult: ['@shrineResultPage'],
        ability: ['@abilityPage'],
        riddleMaster: ['@riddleMasterPage'],
        messageBox: ['@messageBoxPage'],
        monsterLab: ['@monsterLabPage'],
        hvutEquipmentLinks: ['@hvutEquipmentLinksPage'],
        hvutBottom: ['@hvutBottomPage'],
        hvutSnowflakeArtifact: ['@hvutSnowflakeArtifactPage'],
        arena: ['@arenaPage'],
        training: ['@trainingPage'],
        itemWorld: ['@itemWorldPage'],
        lottery: ['@lotteryPage'],
        settings: ['domain.settings', 'base.difficulty', 'base.items', 'equipment.name'],
        settingsSpells: ['base.spells'],
        creditSummary: ['domain.credit'],
    };

    const PROFILE_FEATURES = {
        leftPanel: { equipmentColor: true },
        equipmentPopup: { equipmentColor: true },
        equipmentDetail: { equipmentColor: true },
        moogleMail: { equipmentColor: true },
        armory: { equipmentColor: true },
        shrineResult: { equipmentColor: true },
        messageBox: { equipmentColor: true },
        hvutEquipmentLinks: { equipmentColor: true },
        hvutSnowflakeArtifact: { equipmentColor: true, equipmentColorMode: 'auction' },
        itemWorld: { equipmentColor: true },
        lottery: { equipmentColor: true },
    };

    // DOM 分区定义：profile / 动态监听 / 即时翻译根 / 父级覆盖集中声明，避免多张配置表漂移。
    const REGION_DEFS = {
        '#popup_box': { profile: 'popup', dynamic: true, immediateRoots: [':scope'] },
        '#navbar': { profile: 'navbar' },
        '#eqch_left': { profile: 'leftPanel', dynamic: true },
        '#eqch_stats': { profile: 'rightPanel', dynamic: true },
        '#pabonus': { profile: 'leftPanel', dynamic: true },
        '#equiplist': { profile: 'leftPanel', dynamic: true, coveredBy: '#armory_outer' },
        '#hvut-bottom a': { profile: 'hvutEquipmentLinks', dynamic: true, immediateRoots: [':scope'] },
        '#hvut-bottom > div:not(.hvut-spaceholder):not(.hvut-lt-div)': { profile: 'hvutBottom', dynamic: true, immediateRoots: [':scope'] },
        '.hvut-ss-results': { profile: 'hvutSnowflakeArtifact', dynamic: true, translateRoots: ['.hvut-ss-table tr'], immediateRoots: ['tr'], enabled: () => CONFIG.translateHvutSnowflakeArtifact },
        '.showequip': { profile: 'equipmentDetail', dynamic: true },
        '#mmail_outer': { profile: 'moogleMail', dynamic: true },
        '#armory_outer': {
            profile: 'armory',
            dynamic: true,
            immediateRoots: ['#equipinfo', '#itemlist', '#equipaction', '#equipcount', '#cpreadout', '#setcharm', '#cdreason', '#confirm_inner'],
        },
        '#market_outer': { profile: 'market', dynamic: true },
        '#filterbar': { profile: 'itemFilter' },
        '#itshop_outer': { profile: 'itemShop', dynamic: true },
        '#item_outer': { profile: 'itemInventory', dynamic: true },
        '#shrine_outer': { profile: 'shrine', dynamic: true, immediateRoots: ['#shrine_offertext'] },
        '#shrine_right': { profile: 'shrine', dynamic: true, immediateRoots: ['#shrine_offertext'], coveredBy: '#shrine_outer' },
        '#ability_outer': { profile: 'ability', dynamic: true, immediateRoots: ['#ability_info'] },
        '#riddler2': { profile: 'riddleMaster', dynamic: true },
        '#riddlemid > p': { profile: 'riddleMaster' },
        '#messagebox_outer': { profile: 'messageBox', dynamic: true, immediateRoots: ['#messagebox_inner'] },
        '#messagebox_inner': { profile: 'messageBox', dynamic: true, immediateRoots: [':scope'], coveredBy: '#messagebox_outer' },
        '#monster_outer': { profile: 'monsterLab', dynamic: true, immediateRoots: ['#upgrade_text'] },
        '#monster_actions': { profile: 'monsterLab', dynamic: true },
        '#arena_list': { profile: 'arena' },
        '#arena_tokens': { profile: 'arena' },
        '#towerstart': { profile: 'arena' },
        '#grindfest': { profile: 'arena' },
        '#train_outer': { profile: 'training', dynamic: true, immediateRoots: ['#train_progress', '#train_table'] },
        '#equipselect_outer': { profile: 'itemWorld', dynamic: true, immediateRoots: ['#equipinfo', '#equipcompare', '#itemlist'], coveredBy: '#armory_outer' },
        '#confirm_outer': { profile: 'itemWorld', dynamic: true, immediateRoots: ['#confirm_inner'], coveredBy: '#armory_outer' },
        '#mainpane': {
            profile: 'lottery',
            enabled: () => document.querySelector('#lottery_eqname, #rightpane img[src*="/y/shops/lottery_"], #mainpane img[src*="/y/shops/buytickets"]'),
        },
        '#settings_quickbar': { profile: 'settingsSpells' },
        '#settings_autocast': { profile: 'settingsSpells' },
        '#settings_outer': { profile: 'settings' },
        '#networth': { profile: 'creditSummary' },
    };

    // 词典仓（三层）
    // - base: 高频公共词（尽量少且稳定）
    // - domain: 领域词（按页面/模块语义）
    // - phrase: 整句与专用句式（优先级最高）
    const words = {
        base: {
            attributes: {
                'Strength': '力量',
                'Dexterity': '灵巧',
                'Agility': '敏捷',
                'Endurance': '体质',
                'Intelligence': '智力',
                'Wisdom': '智慧',
            },
            proficiency: {
                'One-handed': '单手',
                'Two-handed': '双手',
                'Dual-wielding': '双持',
                'Staff': '法杖',
                'Elemental': '元素魔法',
                'Divine': '神圣魔法',
                'Forbidden': '黑暗魔法',
                'Deprecating': '减益魔法',
                'Supportive': '增益魔法',
                '/^Cloth armor$/i': '布甲',
                '/^Light armor$/i': '轻甲',
                '/^Heavy armor$/i': '重甲',
            },
            elements: {
                'Physical': '物理',
                'Magical': '魔法',
                'Fire': '火焰',
                'Cold': '冰冷',
                'Elec': '闪电',
                'Wind': '疾风',
                'Holy': '神圣',
                'Dark': '黑暗',
                'Crushing': '打击',
                'Slashing': '斩击',
                'Piercing': '刺击',
            },
            avoidance: {
                'Evade': '闪避',
                'Block': '格挡',
                'Parry': '招架',
                'Resist': '抵抗',
            },
            weaponEffects: {
                'Elemental Strike': '属性打击',
                'Fire Strike': '火焰打击',
                'Cold Strike': '冰霜打击',
                'Elec Strike': '闪电打击',
                'Lightning Strike': '闪电打击',
                'Wind Strike': '疾风打击',
                'Holy Strike': '神圣打击',
                'Dark Strike': '黑暗打击',
                'Void Strike': '虚空打击',
            },
            statLabels: {
                'Crushing Damage': '打击伤害',
                'Slashing Damage': '斩击伤害',
                'Piercing Damage': '刺击伤害',
                'Void Damage': '虚空伤害',
                'Fire Damage': '火焰伤害',
                'Cold Damage': '冰霜伤害',
                'Elec Damage': '闪电伤害',
                'Wind Damage': '疾风伤害',
                'Holy Damage': '神圣伤害',
                'Dark Damage': '黑暗伤害',
                'Spell Damage': '魔法伤害加成',
                'Magic Damage': '魔法伤害',
                'Attack Damage': '攻击伤害',
                'Attack Speed': '攻击速度',
                'Casting Speed': '施法速度',
                'Attack Accuracy': '攻击命中',
                'Magic Accuracy': '魔法命中',
                'Attack Crit Damage': '攻击暴击伤害',
                'Attack Crit Chance': '攻击暴击率',
                'Magic Crit Damage': '魔法暴击伤害',
                'Counter-resist': '反抵抗',
                'Counter-parry': '反招架',
                'Elemental Prof': '元素熟练',
                'Divine Prof': '神圣熟练',
                'Forbidden Prof': '黑暗熟练',
                'Deprecating Prof': '减益熟练',
                'Supportive Prof': '增益熟练',
                'Fire Affinity': '火焰亲和',
                'Cold Affinity': '冰霜亲和',
                'Elec Affinity': '闪电亲和',
                'Wind Affinity': '疾风亲和',
                'Holy Affinity': '神圣亲和',
                'Dark Affinity': '黑暗亲和',
                'Physical Mitigation': '物理减伤',
                'Magical Mitigation': '魔法减伤',
                'Crushing Mitigation': '打击减伤',
                'Slashing Mitigation': '斩击减伤',
                'Piercing Mitigation': '刺击减伤',
                'Damage Mitigation': '伤害减免',
                'HP Bonus': '生命加成',
                'MP Bonus':'法力加成',
                'Mana Conservation': '法力消耗降低',
            },
            difficulty: {
                'Normal': '普通',
                'Hard': '困难',
                'Nightmare': '噩梦',
                'Hell': '地狱',
                'Nintendo': '任天堂',
                'IWBTH': 'I Wanna',
                'PFUDOR': '彩虹小马',
            },
            filterTags: {
                'Consumables': '消耗品',
                'Materials': '材料',
                'Trophies': '奖杯',
                'Artifacts': '文物',
                'Figures' : '小马雕像',
                'Monster Items' : '怪物物品',
                'All': '全部',
                'Restoratives': '回复品',
                'Infusions': '魔药',
                'Scrolls': '卷轴',
                'Crystals': '水晶',
                'Special': '特殊',
                'Equipped': '已装备',
                'New': '新装备',
                'One-Handed': '单手',
                'Two-Handed': '双手',
                'Staffs': '法杖',
                'Shield': '盾牌',
                '/^Cloth$/': '布甲',
                '/^Light$/': '轻甲',
                '/^Heavy$/': '重甲',
                'Salvaged': '已分解',
            },
            items: {
                'Health Potion': '生命药水',
                'Health Draught': '生命长效药',
                'Health Elixir': '生命秘药',
                'Mana Potion': '法力药水',
                'Mana Draught': '法力长效药',
                'Mana Elixir': '法力秘药',
                'Spirit Potion': '灵力药水',
                'Spirit Draught': '灵力长效药',
                'Spirit Elixir': '灵力秘药',
                'Last Elixir': '终极秘药',
                'Energy Drink': '能量饮料',
                'Caffeinated Candy': '咖啡因糖果',
                'Infusion of Flames': '火焰魔药',
                'Infusion of Frost': '冰冷魔药',
                'Infusion of Lightning': '闪电魔药',
                'Infusion of Storms': '风暴魔药',
                'Infusion of Divinity': '神圣魔药',
                'Infusion of Darkness': '黑暗魔药',
                'Scroll of Swiftness': '加速卷轴',
                'Scroll of Protection': '保护卷轴',
                'Scroll of the Avatar': '化身卷轴',
                'Scroll of Absorption': '吸收卷轴',
                'Scroll of Shadows': '幻影卷轴',
                'Scroll of Life': '生命卷轴',
                'Scroll of the Gods': '神之卷轴',
                'Health Gem': '生命宝石',
                'Mana Gem': '法力宝石',
                'Spirit Gem': '灵力宝石',
                'Mystic Gem': '神秘宝石',
                'Flower Vase': '花瓶',
                'Bubble-Gum': '泡泡糖',
                'ManBearPig Tail': '人熊猪的尾巴(等级2)',
                'Holy Hand Grenade of Antioch': '安提阿的神圣手榴弹(等级2)',
                'Mithra\'s Flower': '猫人族的花(等级2)',
                'Dalek Voicebox': '戴立克音箱(等级2)',
                'Lock of Blue Hair': '一绺蓝发(等级2)',
                'Bunny-Girl Costume': '兔女郎装(等级3)',
                'Hinamatsuri Doll': '雏人形(等级3)',
                'Broken Glasses': '破碎的眼镜(等级3)',
                'Black T-Shirt': '黑色Ｔ恤(等级4)',
                'Sapling': '树苗(等级4)',
                'Unicorn Horn': '独角兽的角(等级5)',
                'Noodly Appendage': '面条般的附肢(等级6)',
                'Tenbora\'s Box': '天菠萝的盒子(等级9)',
                'Bronze Coupon' : '铜礼券(等级3)',
                'Silver Coupon' : '银礼券(等级5)',
                'Gold Coupon' : '黄金礼券(等级7)',
                'Platinum Coupon' : '白金礼券(等级8)',
                'Peerless Voucher' : '无双凭证(等级10)',
                'Precursor Artifact': '古遗物',
                'Soul Fragments': '灵魂碎片',
                'Soul Fragment': '灵魂碎片',
                'Token of Blood': '鲜血令牌',
                'Chaos Token': '混沌令牌',
                'Low-Grade Cloth': '低级布料',
                'Mid-Grade Cloth': '中级布料',
                'High-Grade Cloth': '高级布料',
                'Low-Grade Leather': '低级皮革',
                'Mid-Grade Leather': '中级皮革',
                'High-Grade Leather': '高级皮革',
                'Low-Grade Metals': '低级金属',
                'Mid-Grade Metals': '中级金属',
                'High-Grade Metals': '高级金属',
                'Low-Grade Wood': '低级木材',
                'Mid-Grade Wood': '中级木材',
                'High-Grade Wood': '高级木材',
                'Scrap Cloth': '废布料',
                'Scrap Leather': '皮革废料',
                'Scrap Metal': '金属废料',
                'Scrap Wood': '木材废料',
                'Energy Cell': '能量元',
                'Crystallized Phazon': '相位碎片(布)',
                'Shade Fragment': '暗影碎片(轻)',
                'Repurposed Actuator': '动力碎片(重)',
                'Defense Matrix Modulator': '力场碎片(盾)',
                'Legendary Weapon Core': '传奇武器核心',
                'Legendary Staff Core': '传奇法杖核心',
                'Legendary Armor Core': '传奇护甲核心',
                'Peerless Armor Core': '无双护甲核心',
                'Peerless Weapon Core': '无双武器核心',
                'Peerless Staff Core': '无双法杖核心',
                'Binding of Slaughter': '粘合剂 基础攻击伤害',
                'Binding of Balance': '粘合剂 物理命中率',
                'Binding of Isaac': '粘合剂 物理暴击率',
                'Binding of Destruction': '粘合剂 基础魔法伤害',
                'Binding of Focus': '粘合剂 魔法命中率',
                'Binding of Friendship': '粘合剂 魔法暴击率',
                'Binding of Protection': '粘合剂 物理减伤',
                'Binding of Warding': '粘合剂 魔法减伤',
                'Binding of the Fleet': '粘合剂 回避率',
                'Binding of the Barrier': '粘合剂 格挡率',
                'Binding of the Nimble': '粘合剂 招架率',
                'Binding of Negation': '粘合剂 抵抗率',
                'Binding of the Ox': '粘合剂 力量',
                'Binding of the Raccoon': '粘合剂 灵巧',
                'Binding of the Cheetah': '粘合剂 敏捷',
                'Binding of the Turtle': '粘合剂 体质',
                'Binding of the Fox': '粘合剂 智力',
                'Binding of the Owl': '粘合剂 智慧',
                'Binding of the Elementalist': '粘合剂 元素魔法熟练度',
                'Binding of the Heaven-sent': '粘合剂 神圣魔法熟练度',
                'Binding of the Demon-fiend': '粘合剂 黑暗魔法熟练度',
                'Binding of the Curse-weaver': '粘合剂 减益魔法熟练度',
                'Binding of the Earth-walker': '粘合剂 增益魔法熟练度',
                'Binding of Surtr': '粘合剂 火焰魔法伤害',
                'Binding of Niflheim': '粘合剂 冰冷魔法伤害',
                'Binding of Mjolnir': '粘合剂 闪电魔法伤害',
                'Binding of Freyr': '粘合剂 疾风魔法伤害',
                'Binding of Heimdall': '粘合剂 神圣魔法伤害',
                'Binding of Fenrir': '粘合剂 黑暗魔法伤害',
                'Binding of Dampening': '粘合剂 打击减伤',
                'Binding of Stoneskin': '粘合剂 斩击减伤',
                'Binding of Deflection': '粘合剂 刺击减伤',
                'Binding of the Fire-eater': '粘合剂 火焰减伤',
                'Binding of the Frost-born': '粘合剂 冰冷减伤',
                'Binding of the Thunder-child': '粘合剂 闪电减伤',
                'Binding of the Wind-waker': '粘合剂 疾风减伤',
                'Binding of the Thrice-blessed': '粘合剂 神圣减伤',
                'Binding of the Spirit-ward': '粘合剂 黑暗减伤',
                'Wispy Catalyst (Final Edition)' : '纤细 催化剂(最终版)',
                'Diluted Catalyst (Final Edition)' : '稀释 催化剂(最终版)',
                'Regular Catalyst (Final Edition)' : '平凡 催化剂(最终版)',
                'Robust Catalyst (Final Edition)' : '稳健 催化剂(最终版)',
                'Vibrant Catalyst (Final Edition)' : '活力 催化剂(最终版)',
                'Coruscating Catalyst (Final Edition)' : '闪耀 催化剂(最终版)',       
                'Voidseeker Shard': '虚空碎片',
                'Aether Shard': '以太碎片',
                'Crystal of Vigor': '力量水晶',
                'Crystal of Finesse': '灵巧水晶',
                'Crystal of Swiftness': '敏捷水晶',
                'Crystal of Fortitude': '体质水晶',
                'Crystal of Cunning': '智力水晶',
                'Crystal of Knowledge': '智慧水晶',
                'Crystal of Flames': '火焰水晶',
                'Crystal of Frost': '冰冻水晶',
                'Crystal of Lightning': '闪电水晶',
                'Crystal of Tempest': '疾风水晶',
                'Crystal of Devotion': '神圣水晶',
                'Crystal of Corruption': '暗黑水晶',
                'Crystal of Quintessence': '灵魂水晶',
                'Monster Chow': '怪物饲料',
                'Monster Edibles': '怪物食品',
                'Monster Cuisine': '怪物料理',
                'Happy Pills': '快乐药丸',
                'Featherweight Shard': '羽毛碎片',
                'Silk Charm Pouch': '丝绸护符袋',
                'Kevlar Charm Pouch': '凯夫拉护符袋',
                'Mithril Charm Pouch': '秘银护符袋',
                'Lesser Featherweight Charm': '次级 羽毛护符',
                'Greater Featherweight Charm': '高级 羽毛护符',
                'Lesser Hollowforged Charm': '次级 虚空升华护符',
                'Greater Hollowforged Charm': '高级 虚空升华护符',
                'Lesser Fire Strike Charm': '次级 火焰打击护符',
                'Greater Fire Strike Charm': '高级 火焰打击护符',
                'Lesser Cold Strike Charm': '次级 冰霜打击护符',
                'Greater Cold Strike Charm': '高级 冰霜打击护符',
                'Lesser Lightning Strike Charm': '次级 闪电打击护符',
                'Greater Lightning Strike Charm': '高级 闪电打击护符',
                'Lesser Wind Strike Charm': '次级 疾风打击护符',
                'Greater Wind Strike Charm': '高级 疾风打击护符',
                'Lesser Holy Strike Charm': '次级 神圣打击护符',
                'Greater Holy Strike Charm': '高级 神圣打击护符',
                'Lesser Dark Strike Charm': '次级 黑暗打击护符',
                'Greater Dark Strike Charm': '高级 黑暗打击护符',
                'Lesser Butcher Charm': '次级 攻击护符',
                'Greater Butcher Charm': '高级 攻击护符',
                'Lesser Aether Charm': '次级 以太护符',
                'Greater Aether Charm': '高级 以太护符',
                'Lesser Voidseeker Charm': '次级 虚空护符',
                'Greater Voidseeker Charm': '高级 虚空护符',
                'Lesser Juggernaut Charm': '次级 生命护符',
                'Greater Juggernaut Charm': '高级 生命护符',
                'Lesser Capacitor Charm': '次级 法力护符',
                'Greater Capacitor Charm': '高级 法力护符',
                'Lesser Fatality Charm': '次级 攻爆伤护符',
                'Greater Fatality Charm': '高级 攻爆伤护符',
                'Lesser Archmage Charm': '次级 法伤护符',
                'Greater Archmage Charm': '高级 法伤护符',
                'Lesser Annihilator Charm': '次级 法爆伤护符',
                'Greater Annihilator Charm': '高级 法爆伤护符',
                'Lesser Overpower Charm': '次级 反招架护符',
                'Greater Overpower Charm': '高级 反招架护符',
                'Lesser Penetrator Charm': '次级 反抵抗护符',
                'Greater Penetrator Charm': '高级 反抵抗护符',
                'Lesser Swiftness Charm': '次级 攻速护符',
                'Greater Swiftness Charm': '高级 攻速护符',
                'Lesser Spellweaver Charm': '次级 施法加速护符',
                'Greater Spellweaver Charm': '高级 施法加速护符',
                'Lesser Economizer Charm': '次级 节能护符',
                'Greater Economizer Charm': '高级 节能护符',
                'Lesser Fire-proof Charm': '次级 耐热护符',
                'Greater Fire-proof Charm': '高级 耐热护符',
                'Lesser Cold-proof Charm': '次级 抗寒护符',
                'Greater Cold-proof Charm': '高级 抗寒护符',
                'Lesser Lightning-proof Charm': '次级 绝缘护符',
                'Greater Lightning-proof Charm': '高级 绝缘护符',
                'Lesser Wind-proof Charm': '次级 防风护符',
                'Greater Wind-proof Charm': '高级 防风护符',
                'Lesser Holy-proof Charm': '次级 驱圣护符',
                'Greater Holy-proof Charm': '高级 驱圣护符',
                'Lesser Dark-proof Charm': '次级 驱暗护符',
                'Greater Dark-proof Charm': '高级 驱暗护符',
                'World Seeds': '世界种子',
                'World Seed': '世界种子',
                'Twilight Sparkle Figurine': '暮光闪闪公仔',
                'Rainbow Dash Figurine': '云宝黛西公仔',
                'Applejack Figurine': '苹果杰克公仔',
                'Fluttershy Figurine': '小蝶公仔',
                'Pinkie Pie Figurine': '萍琪派公仔',
                'Rarity Figurine': '瑞瑞公仔',
                'Trixie Figurine': '崔克茜公仔',
                'Princess Celestia Figurine': '塞拉斯蒂亚公主公仔',
                'Princess Luna Figurine': '露娜公主公仔',
                'Apple Bloom Figurine': '小苹花公仔',
                'Scootaloo Figurine': '飞板璐公仔',
                'Sweetie Belle Figurine': '甜贝儿公仔',
                'Big Macintosh Figurine': '大麦克公仔',
                'Spitfire Figurine': '飞火公仔',
                'Derpy Hooves Figurine': '小呆公仔',
                'Lyra Heartstrings Figurine': '天琴心弦公仔',
                'Octavia Figurine': '奥塔维亚公仔',
                'Zecora Figurine': '泽科拉公仔',
                'Cheerilee Figurine': '车厘子公仔',
                'Vinyl Scratch Figurine': '维尼尔公仔',
                'Daring Do Figurine': '无畏天马公仔',
                'Doctor Whooves Figurine': '神秘博士公仔',
                'Berry Punch Figurine': '酸梅酒公仔',
                'Bon-Bon Figurine': '糖糖公仔',
                'Fluffle Puff Figurine': '毛毛马公仔',
                'Angel Bunny Figurine': '天使兔公仔',
                'Gummy Figurine': '嘎米公仔',
            },
            spells: {
                'Absorb': '吸收',
                'Arcane Blow': '奥术打击',
                'Arcane Focus': '奥术专注',
                'Backstab': '背刺(Ⅱ)',
                'Banishment': '放逐(Ⅱ)',
                'Blind': '致盲',
                'Blizzard': '暴风雪(Ⅱ)',
                'Chained Lightning': '连锁闪电(Ⅱ)',
                'Concussive Strike': '震荡打击',
                'Confuse': '混乱',
                'Corruption': '腐化(Ⅰ)',
                'Cure': '治疗',
                'Disintegrate': '瓦解(Ⅱ)',
                'Downburst': '下击暴流(Ⅱ)',
                'Drain': '枯竭',
                'Fiery Blast': '炎爆术(Ⅰ)',
                'Fimbulvetr': '芬布尔之冬(Ⅲ)',
                'Flames of Loki': '洛基之焰(Ⅲ)',
                'Flee': '逃跑',
                'Freeze': '冰冻(Ⅰ)',
                'Frenzied Blows': '狂乱百裂斩(Ⅲ)',
                'Full-Cure': '完全治疗',
                'Gale': '烈风(Ⅰ)',
                'Great Cleave': '强力顺劈(Ⅰ)',
                'Haste': '加速',
                'Heartseeker': '觅心者',
                'Immobilize': '定身',
                'Imperil': '陷危',
                'Inferno': '地狱火(Ⅱ)',
                'Iris Strike': '虹膜打击(Ⅰ)',
                'Merciful Blow': '最后的慈悲(Ⅲ)',
                'Paradise Lost': '失乐园(Ⅲ)',
                'Protection': '保护',
                'Ragnarok': '诸神黄昏(Ⅲ)',
                'Regen': '细胞活化',
                'Rending Blow': '撕裂打击(Ⅱ)',
                'Scan': '扫描',
                'Shadow Veil': '影纱',
                'Shatter Strike': '碎甲打击(Ⅲ)',
                'Shield Bash': '盾击(Ⅰ)',
                'Skyward Sword': '天空之剑',
                'Shockblast': '电能爆破(Ⅰ)',
                'Silence': '沉默',
                'Sleep': '睡眠',
                'Slow': '迟缓',
                'Smite': '惩戒(Ⅰ)',
                'Spark of Life': '生命火花',
                'Spirit Shield': '灵力盾',
                'Storms of Njord': '尼奥尔德风暴(Ⅲ)',
                'Vital Strike': '要害打击(Ⅱ)',
                'Weaken': '虚弱',
                'Wrath of Thor': '雷神之怒(Ⅲ)',
                'FUS RO DAH': '龙吼',
                'Orbital Friendship Cannon': '友谊小马炮',
            },
            effects: {
                'Absorbing Ward': '吸收结界',
                'Asleep': '睡眠',
                'Bleeding Wound': '流血',
                'Blessing of the RiddleMaster': '谜题大师的祝福',
                'Blinded': '致盲',
                'Energized': '能量充盈',
                'Channeling': '咏唱',
                'Coalesced Mana': '法力合流',
                'Confused': '混乱',
                'Defending': '防御',
                'Deep Burns': '深度灼伤',
                'Ether Tap': '法力回流',
                'Focusing': '专注',
                'Freezing Limbs': '冻结四肢',
                'Hastened': '加速',
                'Imperiled': '陷危',
                'Immobilized': '定身',
                'Kicking Ass': '火力全开',
                'Overwhelming Strikes': '压制打击',
                '/Penetrated\\s+Armor/': '破甲',
                'Refreshment': '灵力长效药',
                'Regeneration': '生命长效药',
                'Replenishment': '法力长效药',
                'Searing Skin': '灼热皮肤',
                'Silenced': '沉默',
                'Sleeper Imprint': '沉睡印记',
                'Slowed': '迟缓',
                'Stunned': '眩晕',
                'Turbulent Air': '乱流',
                'Weakened': '虚弱',
            },
        },
        domain: {
            popup: {
                'Popup Box': '弹出框',
            },
            hvutBottom: {
                '/Inventory Capacity:\\s*([\\d,]+)\\s*\\/\\s*([\\d,]+)/': '库存容量: $1 / $2',
            },
            hvutSnowflakeArtifact: {
                '/^([\\d,]+)x\\s+Crystals$/': '$1x 水晶',
            },
            nav: {
                'Character': '角色',
                'Equipment': '装备',
                'Abilities': '技能',
                'Training': '训练',
                'Item Inventory': '道具仓库',
                'Settings': '设置',
                'Item Shop': '道具店',
                'The Shrine': '雪花祭坛',
                'The Market': '交易市场',
                'The Armory': '军械库',
                'MoogleMail': '莫古利邮局',
                'Monster Lab': '怪物实验室',
                'Weapon Lottery' : '武器彩票',
                'Armor Lottery' : '防具彩票',
                'The Arena': '竞技场',
                'The Tower': '塔楼',
                'Ring of Blood': '浴血擂台',
                'GrindFest': '压榨界',
                'Item World': '道具界',
            },
            leftPanel: {
                'Active persona:': '当前人格：',
                'Used persona slots:': '已使用角色槽：',
                'Primary attributes': '主属性',
                'Equipment proficiency': '武器/装备熟练度',
                'Magic proficiency': '法杖/魔法熟练度',
                '/^Isekai bonus:\\s*([+-]?\\d+)$/': '异世界加成: $1',
            },
            rightPanel: {
                'Mainhand Attack': '主手攻击',
                'Offhand Attack': '副手攻击',
                'Magic Attack': '魔法攻击',
                'Accuracy': '命中',
                'Crit Multiplier': '暴击伤害',
                'Attack Speed Bonus': '攻击速度加成',
                'Overwhelming Strikes on hit': '击中触发压制打击',
                'Counter-Attack on block/parry': '格挡/招架触发反击',
                'Domino Strike on hit': '命中时触发多米诺打击',
                'Coalesced Mana on spell hit': '法术命中时触发法力合流',
                'Damage Bonus': '伤害加成',
                'Mana Cost Modifier': '法力消耗修正',
                'Cast Speed Bonus': '施法速度加成',
                ' Magic Score':'法分',
                'Proficiency Factor':'熟练度系数',
                'Mitigation Reduction':'属性减伤削减',
                'Mage Stats': '法师面板数据',
                'Counter-resist for Fire Spells': '火魔法反抵抗',
                'Counter-resist for Cold Spells': '冰魔法反抵抗',
                'Counter-resist for Elec Spells': '雷魔法反抵抗',
                'Counter-resist for Wind Spells': '风魔法反抵抗',
                'Counter-resist for Holy Spells': '圣魔法反抵抗',
                'Counter-resist for Dark Spells': '暗魔法反抵抗',
                'Counter-resist for Deprecating Spells': '减益魔法反抵抗',
                'Cure Bonus': '治疗加成',
                'Vitals': '状态值',
                'Base Health': '基础生命值',
                'Base Mana': '基础法力值',
                'Base Spirit': '基础灵力值',
                'Mana Regen': '法力恢复',
                'Spirit Regen': '灵力恢复',
                'Avoidance': '规避',
                'Compromise': '装备影响',
                'Interference': '干涉',
                'Burden': '负重',
                'Spell Damage Bonus': '法术伤害加成',
                'Effective Primary Stats': '有效主属性',
                'Effective Proficiency': '有效熟练度',
            },
            lottery: {
                '/^Grand Prize for January\\s+(\\d+)(?:st|nd|rd|th):$/': '一等奖 1 月 $1 日',
                '/^Grand Prize for February\\s+(\\d+)(?:st|nd|rd|th):$/': '一等奖 2 月 $1 日',
                '/^Grand Prize for March\\s+(\\d+)(?:st|nd|rd|th):$/': '一等奖 3 月 $1 日',
                '/^Grand Prize for April\\s+(\\d+)(?:st|nd|rd|th):$/': '一等奖 4 月 $1 日',
                '/^Grand Prize for May\\s+(\\d+)(?:st|nd|rd|th):$/': '一等奖 5 月 $1 日',
                '/^Grand Prize for June\\s+(\\d+)(?:st|nd|rd|th):$/': '一等奖 6 月 $1 日',
                '/^Grand Prize for July\\s+(\\d+)(?:st|nd|rd|th):$/': '一等奖 7 月 $1 日',
                '/^Grand Prize for August\\s+(\\d+)(?:st|nd|rd|th):$/': '一等奖 8 月 $1 日',
                '/^Grand Prize for September\\s+(\\d+)(?:st|nd|rd|th):$/': '一等奖 9 月 $1 日',
                '/^Grand Prize for October\\s+(\\d+)(?:st|nd|rd|th):$/': '一等奖 10 月 $1 日',
                '/^Grand Prize for November\\s+(\\d+)(?:st|nd|rd|th):$/': '一等奖 11 月 $1 日',
                '/^Grand Prize for December\\s+(\\d+)(?:st|nd|rd|th):$/': '一等奖 12 月 $1 日',
                '/^2nd Prize:\\s*([\\d,]+)\\s+Golden Lottery Tickets?$/': '二等奖: $1 黄金彩票券',
                '/^3rd Prize:\\s*([\\d,]+)\\s+Caffeinated Cand(?:y|ies)$/': '三等奖: $1 咖啡因糖果',
                '/^4th Prize:\\s*([\\d,]+)\\s+Chaos Tokens?$/': '四等奖: $1 混沌令牌',
                '/^5th Prize:\\s*([\\d,]+)\\s+Chaos Tokens?$/': '五等奖: $1 混沌令牌',
                '/^You currently have\\s*([\\d,]+)\\s*GP\\.$/': '你目前拥有 $1 GP.',
                '/^Each ticket costs\\s*([\\d,]+)\\s*GP\\.$/': '购买一张彩票将花费 $1 GP.',
                'Choose number to buy:': '输入购买数量:',
                '/^You hold\\s*([\\d,]+)\\s*of\\s*([\\d,]+)\\s*sold tickets\\.$/': '你拥有 $1 / $2 张已售出的彩票.',
                '/^Stock:\\s*([\\d,]+)$/': '库存： $1',
                'Winner': '获奖者',
                'Equip Winner': '装备获奖者',
                'Core Winner': '核心获奖者',
                "Today's ticket sale is closed.": '今日彩票售卖已结束.',
                'The Weapon Lottery lets you spend GP on a chance to win the specific equipment piece shown on the left. Each lottery period lasts 24 hours. At midnight UTC, a drawing is held, and a new lottery period starts.': '使用GP购买武器彩票有机会赢取“无双”武器 每期彩票发行期为24小时，武器彩票于协调世界时 0点 开奖，同时发行新一期彩票',
                'In addition to normal tickets, you can also spend a Golden Lottery Ticket to add 100 tickets and double your effective ticket count at the time of drawing. This will not increase the effective ticket count past 10% of the total purchased tickets. Golden Lottery Tickets can only be acquired as a consolation prize from the lottery.': '你也可以使用黄金彩票券兑换100张彩票，并且让自己持有的彩票数量翻倍（效果在开奖时计算，最高不超过10%总售出彩票）。黄金彩票券只能通过购买彩票中奖获得。每人每期最多可购买20000张彩票',
                'The number of items granted by the 2nd-5th prize will increase with the size of the pot. You can only ever win one of the prizes no matter how many tickets you purchase.': '2-5等奖的奖品数量取决于彩池的大小，无论你购买了多少注彩票，你只能中一个奖项，如果你不想要一等奖装备，那么你可以点击一等奖下面的DO NOT WANT按钮，这会令你放弃头奖装备，取而代之如果你抽中头奖你将获得对应的装备核心',
                "/^Today's drawing is in\\s*(\\d+)\\s*hours?\\s*and\\s*(\\d+)\\s*minutes?\\. Ticket sales will close up to ten minutes before this time\\.$/": '距离今日开奖还剩 $1 小时 $2 分钟. 彩票售卖将于开奖前 10 分钟 结束',
                "/^Today's drawing is in\\s*(\\d+)\\s*hours?\\. Ticket sales will close up to ten minutes before this time\\.$/": '距离今日开奖还剩 $1 小时. 彩票售卖将于开奖前 10 分钟 结束',
                "/^Today's drawing is in\\s*(\\d+)\\s*minutes?\\. Ticket sales will close up to ten minutes before this time\\.$/": '距离今日开奖还剩 $1 分钟. 彩票售卖将于开奖前 10 分钟 结束',
                'You cannot opt out unless you have at least one ticket.': '你必须至少购买一张彩票才能选择放弃头奖争夺',
            },
            market: {
                'Account Balance': '账户余额',
                'Market Balance': '市场余额',
                '/▲\\s*Withdraw\\s*▲/': '▲ 提款 ▲',
                '/▼\\s*Deposit\\s*▼/': '▼ 存款 ▼',
                'Browse Items': '浏览物品',
                'My Buy Orders': '我的买单',
                'My Sell Orders': '我的卖单',
                'Account Log': '账户日志',
                'Trade Log': '交易日志',
                'There are no orders for this type of item': '当前类别没有订单',
                'Your Stock': '你的库存',
                'Market Bid': '市场买价',
                'Market Ask': '市场卖价',
                'Market Stock': '市场库存',
                'Show Obsolete Items': ' 显示绝版物品 ',
                'Only With Sellable Stock': '仅显示可出售库存',
                'Only With Buyable Stock': '仅显示可购买库存',
                'Your Sell Order': '你的卖单',
                'Your Buy Order': '你的买单',
                'Listed Sell Orders': '已挂卖单',
                'Listed Buy Orders': '已挂买单',
                'Price History': '价格历史',
                'Recent Trades': '最近成交',
                'Show Full Trade Log': '查看完整交易日志',
                'Previous Material': '上一种材料',
                'Back to Materials': '返回材料列表',
                'Next Material': '下一种材料',
                'Deposit from credit balance' : '从个人账户中存款至市场账户',
                'Withdrawal to credit balance' : '提款至个人账户',
                '/^You have\\s*/': '你有 ',
                ' available to sell. This item is traded in single units. Min price is ': ' 件库存可出售。本物品出售单位为一件，市场最低出价为',
                ' available to sell. This item is traded in batches of ': ' 件库存可出售。本物品出售单位为每组 ',
                '. Min price is ': ' 件，市场最低出价为',
                '; all prices are per batch. Min price is ': ' 件，以下价格均以组为单位。市场最低出价为',
                ' for market orders and ': ', 商店最低供货价为 ',
                ' for market orders. Can always be bought for ': ', 商店的直接供货价为 ',
                ' for backorders.': '.',
                '/^Count:\\s*/': '数量:',
                '/^Price:\\s*/': '价格:',
                '/^Stock:\\s*/': '库存:',
                '/^Order Total:\\s*/': '订单总价:',
                '/^Min Undercut:\\s*/': '最低减价:',
                '/^Min Ask Price:\\s*/': '最低卖价:',
                '/^Min Overbid:\\s*/': '最低加价:',
                '/^Count$/': '数量',
                '/^Price$/': '价格',
                '/^Order Count$/': '订单数量',
                '/^Order Price$/': '订单价格',
                '/^Amount$/': '数额',
                '/^Balance$/': '余额',
                '/^Item$/' : '物品',
                '/^Info$/': '详情',
                '/^Total$/': '总价',
                '/^Sold$/': '成交量',
                '/^Seller$/': '卖家',
                '/^Buyer$/': '买家',
                '/^Low$/': '最低',
                '/^Avg$/': '均价',
                '/^High$/': '最高',
                '/^Vol$/': '成交额',
                '/^Day$/': '日',
                '/^Week$/': '周',
                '/^Month$/': '月',
                '/^Year$/': '年',
                '/^Update$/': '更新',
                '/^Delete$/': '删除',
                '/^Place Buy Order$/': '提交买单',
                '/^Place Sell Order$/': '提交卖单',
                '/^No sell orders found$/': '当前没有卖单',
                '/^No buy orders found$/': '当前没有买单',
                '/^Player Trade Log:\\s*(.+)$/': '玩家交易记录: $1',
                '/^Sold\\s+(\\d+)x\\s+(.+)\\s+@\\s+([\\d,]+\\s*C)$/': '售出 $1x $2 @ $3',
            },
            itemShop: {
                'Your Inventory': '你的库存',
                'Store Inventory': '商店库存',
            },
            itemInventory: {
                'Battle Slots': '战斗槽位',
            },
            riddleMaster: {
                'Submit Answer': '提交答案',
                'Select ALL ponies you see in the image above then hit "Submit Answer" before the time limit runs out.': '请在时间限制结束前选择上图中所有出现的小马，然后点击“提交答案”。',
            },
            monsterLab: {
                'Arthropod': '节肢动物',
                'Avion': '鸟类',
                'Beast': '野兽',
                'Celestial': '天人',
                'Daimon': '魔灵',
                'Dragonkin': '龙类',
                'Elemental': '元素生物',
                'Giant': '巨人',
                'Humanoid': '类人',
                'Mechanoid': '机械体',
                'Reptilian': '爬行类',
                'Sprite': '妖精',
                'Undead': '亡灵',
                'Requires:': '需要:',
                'Needs:': '需要:',
                'Cost:': '消耗:',
                'Stock:': '库存:',
                'None': '无',
                'Skill name': '技能名',
                'Skill type': '技能攻击类型',
                '/^Damage$/': '伤害类型',
                '/^Power$/': '伤害',
                '/^Special$/': '特殊',
                'Cost': '消耗',
                'Claw Rake': '利爪撕扯',
                'Primary attributes': '主属性',
                'Elemental mitigation': '元素减伤',
                'Other stats': '其他属性',
                'Battles Won': '战斗胜利次数',
                'Killing Blows': '击杀次数',
                'Gift Factor': '礼物系数',
                'Phys. Attack': '物理攻击',
                'Mag. Attack': '魔法攻击',
                'Attack Speed': '攻击速度',
                'Accuracy': '命中',
                'Health': '生命值',
                'Phys. Defense': '物理防御',
                'Mag. Defense': '魔法防御',
                'Slashing Mit': '斩击减伤',
                'Piercing Mit': '刺击减伤',
                'Crushing Mit': '打击减伤',
                'Evade Bonus': '闪避加成',
                'Parry Bonus': '招架加成',
                'Resist Bonus': '抵抗加成',
                'Anti-Block': '反格挡',
                'Anti-Evade': '反闪避',
                'Anti-Parry': '反招架',
                'Anti-Resist': '反抵抗',
                'Scavenging': '寻宝',
                'Fortitude': '刚毅',
                'Brutality': '蛮横',
                'Precision': '精密',
                'Overpower': '压制',
                'Interception': '拦截',
                'Dissipation': '弥散',
                'Evasion': '闪避',
                'Defense': '防御',
                'Warding': '魔防',
                'Swiftness': '迅捷',
                '/^(\\d+)x\\s+(.+)$/': '$1x $2',
                '/^Lvl\\s*(\\d+)$/': '等级 $1',
                '/^Needs:\\s*([\\d,]+)\\s+(.+)$/': '需要: $1 $2',
                '/^Upgrade With:\\s*(.+?)\\s+Cost:\\s*([\\d,]+)\\s+Stock:\\s*([\\d,]+)$/': '升级材料: $1   消耗: $2   库存: $3',
                '/^Upgrade Cost:\\s*([\\d,]+)\\s+Chaos Tokens?\\s+Stock:\\s*([\\d,]+)$/': '升级消耗: $1 混沌令牌   库存: $2',
                '/^Next upgrade available at powerlevel\\s*([\\d,]+)$/': '下一次升级需要战斗力 $1',
                '/^Cost:\\s*([\\d,]+)\\s+Chaos Tokens?$/': '消耗: $1 混沌令牌',
                '/^Stock:\\s*([\\d,]+)$/': '库存: $1',
                '/Chaos Tokens?/': '混沌令牌',
                '/Happy Pills?/': '快乐药丸',
                '/Monster Chow(?:s)?/': '怪物饲料',
                'Powerlevel': '战斗力',
                'Increases the gift factor by': '提高礼物系数',
                'Increases monster health by': '提高怪物生命值',
                'Increases monster damage by': '提高怪物伤害',
                'Increases monster accuracy by': '提高怪物命中率',
                'Increases monster natural parry by': '提高怪物基础招架',
                'Increases monster natural resist by': '提高怪物基础抵抗',
                'Increases monster natural evade by': '提高怪物基础闪避',
                'Increases monster physical mitigation by': '提高怪物物理减伤',
                'Increases monster magical mitigation by': '提高怪物魔法减伤',
                'Increases monster attack speed by': '提高怪物攻击速度',
                'Decreases effective target evade/block by': '降低目标有效闪避/格挡',
                'Decreases effective target parry/resist by': '降低目标有效招架/抵抗',
                'You still have to feed this monsters enough crystals to reach powerlevel 25 and give it a name to activate it.': '要激活这个怪物，你还需要喂食足够的水晶使其达到战斗力 25，并为其命名。',
                'You still have to give this monster a name to activate it': '你还需要为这个怪物命名才能激活它',
                'Chow': '饲料',
            },
            moogleMail: {
                'Inbox': '收件箱',
                'Write New': '写新邮件',
                'Read Mail': '已读邮件',
                'Sent Mail': '已发送邮件',
                'To:': '收件人:',
                'Subject:': '主题:',
                'Subject': '主题',
                'Sent': '发送时间',
                '/^Read$/': '被阅读时间',
                '/^To[:\\s]/': '收件人',
                '/^From/': '寄件人',
                'No New Mail': '没有新邮件',
                'Attach Item': '选择附件',
                'Attach Equipment': '选择装备',
                'Attached: ': '已选择附件：',
                'You can click the buttons above to attach items or equipment to this message. Up to 10 different things can be attached to each message.': '你可以点击上方按钮为此邮件添加道具或装备附件。每封邮件最多可以附加 10 种不同物品。',
                'You can optionally request payment for messages with attachments with the Credits on Delivery (CoD) setting after attaching at least one item. The receipient will have to pay the specified number of credits in order to remove the attachments from your message. To prevent misuse, a fee is required to use this function.': '添加至少一个附件后，你可以使用货到付款（CoD）设置要求收件人支付附件费用。收件人必须支付指定 Credits 才能从邮件中取出附件。为防止滥用，使用此功能需要支付费用。',
                'Until the CoD has been paid, the sender and the recipient can both choose to return the message. This allows the recepient to reject an unwanted message, and allows you to recover your items if the recipient does not accept it within a reasonable time.': '在 CoD 付款完成前，发件人和收件人都可以选择退回邮件。这允许收件人拒收不想要的邮件，也允许你在对方未及时接受时取回物品。',
                'Note that unsent drafts will be deleted after one month, and sent messages will be deleted after one year. Any remaining attachments for a deleted message will be permanently lost.': '未发送的草稿会在一个月后删除，已发送的邮件会在一年后删除。被删除邮件中的剩余附件将永久丢失。',
            },
            armory: {
                'Organize': '整理',
                '/^Modify$/': '改造',
                '/^Repair$/': '修理',
                'Soulbind': '魂绑',
                'Purchase': '购买',
                '/^Sell$/': '出售',
                '/^Salvage$/': '分解',
                '/Selected (\\d+) of (\\d+) matching equipment available to organize/': '已选择 $1 / $2 件可整理装备',
                '/Selected (\\d+) of (\\d+) matching equipment available to repair/': '已选择 $1 / $2 件可修理装备',
                '/Selected (\\d+) of (\\d+) matching equipment available to soulbind/': '已选择 $1 / $2 件可魂绑装备',
                '/Selected (\\d+) of (\\d+) matching equipment available to purchase/': '已选择 $1 / $2 件可购买装备',
                '/Selected (\\d+) of (\\d+) matching equipment available to sell/': '已选择 $1 / $2 件可出售装备',
                '/Selected (\\d+) of (\\d+) matching equipment available to salvage/': '已选择 $1 / $2 件可分解装备',
                'This page allows you to organize your equipment.': '本页面可帮助你整理装备。',
                'Pinned equipment are always sorted before unpinned equipment for each respective equipment type.': '置顶装备始终会在各自装备类型中排在未置顶装备之前。',
                'Protected equipment require an additional confirmation to select for sell or salvage, to be attached to mooglemails, and to be sacrificed for stat fusion. This protects them from various dangerous actions while not preventing it outright.': '受保护装备在出售、分解、附加到邮件或作为属性融合材料时需要额外确认。这会保护它们免受各种危险操作影响，但不会完全禁止这些操作。',
                'Locked equipment are further protected and will not show up on pages with potentially dangerous actions at all. You can still freely repair, upgrade and modify protected and locked equipment. Equips cannot be both locked and protected.': '锁定装备会受到进一步保护，完全不会出现在可能有危险操作的页面中。你仍然可以自由修理、升级和修改受保护或锁定装备。装备不能同时处于锁定和受保护状态。',
                'Stored equipment are hidden on all equipment lists except for the one on this page, and are not available for any actions. These will not count towards your regular equipment limit unless your equipment storage overflows.': '存储装备会在除本页面外的所有装备列表中隐藏，且不可执行任何操作。除非装备存储空间溢出，否则它们不会计入常规装备上限。',
                'Equipped equipment is (obviously) used as an indicator for equipment that is currently equipped, even if it is in a different equipment set or profile. These cannot be stored; attempting this will be silently ignored.': '已装备标记用于表示当前已装备的装备，即使它在另一个装备套装或人格中。这些装备不能被存储，尝试存储会被静默忽略。',
                'Inventory Capacity:': '库存容量:',
                'Storage Capacity:': '存储容量:',
                'Pin': '置顶',
                'Store': '存储',
                'Protect': '保护',
                'Lock': '锁定',
                'Enable': '启用',
                'Clear': '清除',
                'Unchanged': '不变',
                'Organize Equipment': '整理装备',
                'Modify Equipment': '改造装备',
                'Rename Equipment': '重命名装备',
                'Enter a new customized name for your': '输入这件装备的新自定义名称',
                'Enter a blank name to revert to the default name. Customized names are always removed if the equipment is sold or attached to a MoogleMail.': '留空名称可恢复为默认名称。装备被出售或附加到莫古利邮局时，自定义名称总会被移除。',
                'Repair Equipment': '修理装备',
                'Soulbind Equipment': '魂绑装备',
                'Pin Equipment': '置顶装备',
                'Unpin Equipment': '取消置顶',
                'Change To Locked': '改为锁定',
                'Remove Lock': '移除锁定',
                'Change To Protected': '改为保护',
                'Remove Protection': '移除保护',
                'Force Unequip': '强制卸下',
                'Upgrade Equipment': '升级装备',
                'Confirm Upgrade': '确认升级',
                'Fully Upgraded': '已满级',
                'Challenge Item World': '挑战道具界',
                'Start Battle': '开始战斗',
                '(Insufficient World Seeds)': '（世界种子不足）',
                '(Insufficient Charm Points)': '（护符点数不足）',
                'Confirm Action': '确认操作',
                'There are no available equipment this type.': '此类型没有可用装备。',
                'There are no available equipment of this type.': '此类型没有可用装备。',
                'Here you can manage your equipment, as well as modify them using Upgrades, Charms and Stat Fusion. Modifications all require that the equipment is soulbound first.': '在这里你可以管理装备，并通过升级、护符和属性融合来改造它们。所有改造都要求装备先完成魂绑。',
                'Upgrading equipment will increase the number of Charm Points available, and adds bonues relative to its base stats. The maximum number of upgrades for an equipment is capped by the number of cleared Item Worlds.': '升级装备会增加可用护符点数，并根据基础属性追加加成。单件装备的最大升级次数受该装备已通关道具界次数限制。',
                'Attaching Charms to your equipment can improve or add new stats, or add special effects and various other boons. Charms and Charm Pouches can be obtained by offering trophies in The Shrine, or purchased from other players in The Market.': '给装备附加护符可以提升或新增属性，也可以附加特殊效果和各种增益。护符和护符袋可以通过雪花祭坛献祭获得，也可以在交易市场从其他玩家处购买。',
                'Stat Fusion lets you improve Legendary+ equipment by sacrificing another Legendary+ equipment together with various materials to increase its base stats. (Persistent Only)': '属性融合可以通过献祭另一件传奇以上装备和各种材料，提升传奇以上装备的基础属性。（仅永久区）',
                'Stat Fusion allows you sacrifice a similar equipment piece of Legendary grade and above to improve this equipment\'s base stats by +1. The cost of the upgrade depends on the quality and base stats of the equip you are upgrading compared to the equip you are sacrificing.': '属性融合允许你献祭一件同类型且品质为传奇及以上的装备，使当前装备的基础属性提升 +1。升级消耗取决于你要强化的装备与被献祭装备的品质和基础属性差异。',
                'Every fused stat will require ten of the corresponding bindings, and will normally also require an equipment core. However, if the sacrificial equipment is a Peerless or has a higher base for a particular stat, it will not charge a core for that stat, and it will be increased by +2 instead.': '每条被融合的属性都需要 10 个对应绑定材料，通常还需要一个装备核心。不过，如果祭品装备是无双，或某项属性的基础值更高，则该项属性不会消耗核心，并改为提升 +2。',
                'If any of the stats are already capped, this will add +1 overflow point for each capped stat. These are redistributed to uncapped stats in order of lowest base. Stats can get multiple overflow points if there are more capped than uncapped stats.': '如果某些属性已经封顶，则每条封顶属性会额外产生 1 点溢出点。这些溢出点会按基础值从低到高重新分配给未封顶属性。如果封顶属性多于未封顶属性，某些属性可能会获得多个溢出点。',
                'Equipment can only be fused if they have the same type and slot; for example, cotton shoes can only be fused with other cotton shoes. Equipment also cannot be sacrificed if it has an upgrade level above zero; if you want to sacrifice something with an upgrade level, you can salvage it first.': '只有类型和部位相同的装备才能进行融合；例如，棉布鞋只能与其他棉布鞋融合。此外，升级等级大于 0 的装备不能被献祭；如果你想献祭一件已升级装备，请先将其分解。',
                'Sacrificing salvaged equipment directly is possible, but doing this will add the materials that were gained by salvaging it to the fusion cost.': '可以直接献祭已分解状态的装备，但这样会把分解该装备时获得的材料追加到融合消耗中。',
                'Note that equipment that is sacrified for Stat Fusion will be ': '请注意，用于属性融合而被献祭的装备会被',
                'PERMANENTLY DESTROYED': '永久销毁',
                ' and cannot be recovered.': '，且无法恢复。',
                'Materials for upgrades and stat fusion can be obtained from salvaging unwanted equipment or raising monsters in the Monster Lab, or purchased from other players in The Market.': '升级和属性融合所需材料可以通过分解不需要的装备、在怪物实验室培养怪物获得，也可以在交易市场从其他玩家处购买。',
                'Select an equipment first to show the available options.': '请先选择一件装备以显示可用选项。',
                'Select an equipment to fuse with your selected equipment:': '请选择一件装备，与当前选中装备进行融合：',
                'The selected equipment will be sacrified, and fused with your:': '所选装备将被献祭，并与你的以下装备融合：',
                'This has the following effects and base costs:': '本次操作会产生以下效果与基础消耗：',
                'Here you can purchase tradeable equipment that was sold by other players. Most of the listed equipment can also be purchased by other players at any time, and is regularly cleared out to make room for new stock, so you will want to be quick if you see something you want.': '你可以在这里购买其他玩家出售的可交易装备。大部分列出的装备随时也可能被其他玩家买走，并会定期清理以腾出新库存；如果看到想要的装备，最好尽快下手。',
                'You can also buy back soulbound, salvaged or untradeable equipment that you previously sold yourself, as well as salvage remains that was sold when you manually salvaged equipment. These cannot be bought by other players, but will only be available for a limited time.': '你也可以回购自己此前卖出的魂绑、已分解或不可交易装备，以及手动分解装备时售出的分解残留。这些不会被其他玩家购买，但只会保留有限时间。',
                'Equipment that was automatically sold or salvaged by a traveling salesmoogle during battle cannot be bought back, since it never really existed in the first place.': '战斗中由旅行销售莫古利自动出售或分解的装备无法回购，因为它实际上从未进入过这里。',
                'Current Balance:': '当前余额:',
                'Back to Modify Screen': '返回改造界面',
                'Purchase Equipment': '购买装备',
                'Confirm Purchase': '确认购买',
                'Sacrifice Equipment': '献祭装备',
                'Confirm Sacrifice': '确认献祭',
                'Sell Equipment': '出售装备',
                'Confirm Sell': '确认出售',
                'SELL': '出售',
                'Salvage Equipment': '分解装备',
                'Confirm Salvage': '确认分解',
                'SALVAGE': '分解',
                'Sell Salvaged Equipment': '出售分解残骸',
                'Salvage Remains': '分解残骸',
                'salvage remains': '分解残骸',
                'Total Salvage:': '分解获得:',
                '/Are you sure you want to buy the\\s*(\\d+)\\s*selected equipment\\?/': '确定要购买选中的 $1 件装备吗？',
                '/Are you sure you want to buy the\\s*$/': '确定要购买这',
                '/Are you sure you want to\\s*[^A-Za-z]*$/': '确定要',
                '/^[^A-Za-z]*the\\s*$/': ' ',
                'selected equipment?': '件选中的装备吗？',
                'Soulbound and non-tradeable equipment can be bought back for a limited time. Other equipment can also be bought by other players.': '魂绑和不可交易装备可在限定时间内回购。其他装备也可能被其他玩家购买。',
                'Are you sure you want to make this protected equipment selectable?': '确定要让这件受保护装备可被选择吗？',
                'Obtained:': '获得日期:',
                'There are no compatible fusable equipment available.': '没有可用于融合的兼容装备。',
                'Only unlocked Legendary+ equips of the same type and slot can be fused.': '只有未锁定、且类型和部位相同的传奇及以上装备才能进行融合。',
                'Confirm Select': '确认选择',
                '/You have selected\\s*(\\d+)\\s*SOULBOUND equipment\\./': '你选择了 $1 件魂绑装备。',
                '/You have selected\\s*(\\d+)\\s*LEGENDARY equipment\\./': '你选择了 $1 件传奇装备。',
                'You have selected a SOULBOUND LEGENDARY equipment.': '你选择了 1 件魂绑传奇装备。',
                'You have selected a SOULBOUND equipment.': '你选择了 1 件魂绑装备。',
                'You have selected a LEGENDARY equipment.': '你选择了 1 件传奇装备。',
                'Check both safety boxes to continue.': '勾选两侧安全确认框以继续。',
                'Are you sure you want to ': '确定要',
                'SACRIFICE': '献祭',
                ' this equipment?': '这件装备吗？',
                'It will be ': '它将被',
                ' and ': '，且',
                'CANNOT': '无法',
                ' be recovered.': '恢复。',
                'Here you can sell equipment you no longer need in exchange for Credits. Any tradeable equipment you sell can be bought by other players. Excess inventory of tradeable equipment will be pruned regularly, and there are no guarantees for how long they will remain available.': '你可以在这里出售不再需要的装备以换取 Credits。你出售的任何可交易装备都可能被其他玩家购买。过量的可交易装备库存会定期清理，无法保证它们会保留多久。',
                'If you sell soulbound, salvaged or untradeable equipment, they cannot be bought by anyone else; you can however still buy them back yourself for a limited time, at an exorbitant markup. These will generally be available to buy back for up to a day, but you should not rely on this.': '如果你出售魂绑、已分解或不可交易装备，其他人无法购买；不过你仍可在限定时间内以高额加价自行回购。这些装备通常最多可回购一天，但不应依赖这一点。',
                'Salvaging equipment you no longer need will allow you to extract useful materials that can be used for upgrading or repairing other equipment.': '分解不再需要的装备可以提取有用材料，用于升级或修理其他装备。',
                'After salvaging, in addition to the extracted materials, the equipment itself will turn into Salvage Remains. You can either keep these, or sell them for a small amount of credits. Salvage Remains are only listed under the Salvaged tabs; they cannot be equipped or modified unless they are repaired, which will restore them to their original condition.': '分解后，除了提取出的材料，装备本身会变成分解残骸。你可以保留它们，也可以出售以获得少量 Credits。分解残骸只会列在已分解标签下；除非先修理并恢复到原始状态，否则不能装备或改造。',
                'Repairing salvage remains will require all the materials you obtained from salvaging them, in addition to the normal repair materials for repairing from zero Condition and Energy.': '修理分解残骸时，除了从零耐久和零能量修复所需的正常修理材料，还需要返还你分解它们时获得的全部材料。',
                'Salvaging an upgraded equipment will return 90% of the base materials spent upgrading it. It will not return cores or credits, nor any materials used for Stat Fusion.': '分解已升级装备会返还升级消耗基础材料的 90%。不会返还核心或 Credits，也不会返还用于属性融合的任何材料。',
                'If you sell the salvage remains, they can be bought back for a limited time. Salvage remains must be repaired to restore them to usable condition, requiring more materials than you get from salvaging.': '如果出售分解残骸，可以在限定时间内回购。分解残骸必须修理后才能恢复为可用状态，所需材料会多于你分解时获得的材料。',
                'All equipment has a Condition value which degrades when you are defeated in battle, as well as at a fixed rate depending on the equipment Durability and the number of cleared rounds. Repairs require different Scrap Material corresponding to the equipment type; these can be salvaged from low-grade equipment, or bought from the Item Store or The Market.': '所有装备都有耐久度。战斗失败时耐久度会下降，并且也会根据装备耐久属性和已通关回合数以固定速率下降。修理需要与装备类型对应的不同废料；这些废料可以从低级装备分解获得，也可以从道具店或交易市场购买。',
                'Magitech equipment and equipment with attached charms will also have an Energy value. Energy is consumed at a fixed rate depending on the number of cleared rounds. Recharging energy requires Energy Cells; these can be salvaged from magitech equipment, or bought from the Item Store or The Market. Attached charms affect the required number of energy cells and can also require other upkeep materials.': '魔导装备和附加了护符的装备还会有能量值。能量会根据已通关回合数以固定速率消耗。补充能量需要能量元；能量元可以从魔导装备分解获得，也可以从道具店或交易市场购买。已附加的护符会影响所需能量元数量，也可能需要其他维护材料。',
                'Charms attached to your equipment may take condition damage, depending on its Pouch; if the condition reaches zero, it will tear, rendering it useless. If you are defeated, some pouches can be destroyed, exposing their charms to additional damage. Torn charms and destroyed pouches can be replaced with spare charms and pouches from your inventory; these can be obtained in the Item World or by offering trophies in The Shrine, or bought from other players in The Market.': '装备上的护符可能会根据其护符袋承受耐久损伤；如果耐久降到零，护符会撕裂并失效。战斗失败时，某些护符袋可能被摧毁，使其中的护符承受额外损伤。撕裂的护符和被摧毁的护符袋可以用库存中的备用护符和护符袋替换；这些物品可以在道具界获得、通过雪花祭坛献祭获得，或从其他玩家的交易市场购买。',
                'Replace Charms & Pouches': '替换护符和护符袋',
                'Required Items:': '所需物品:',
                'Total Repair Cost:': '总修理成本:',
                '/Total Cost:\\s*([\\d,]+)/': '总费用：$1',
                '/^\\+([\\d,]+)\\s+Base Stat Rolls$/': '+$1 基础属性掷值',
                '/^([\\d,]+)x\\s+(.+)$/' : '$1x $2',
                '/^([\\d,]+)\\s+Credits$/': '$1 Credits',
                '/Charm Slot\\s*(\\d+)/': '护符槽 $1',
                '/Slot\\s*(\\d+)/': '槽位 $1',
                'Charm Points:': '护符点数:',
                '(empty)': '（空）',
                'No Charm': '无护符',
                'Attach Charm': '附加护符',
                'Replace Charm':'更换护符',
                'Confirm Replace':'确认替换',
                'Confirm Destroy': '确认销毁',
                'Destroy Charm':'销毁护符',
                'Replace Pouch':'更换护符袋',
                ' with a ': '，使用',
                '/(\\d+) CP/': '$1 护符点',
                '(none)': '（无）',
                'Charms': '护符',
                'Featherweight (Lesser)': '羽毛（次级）',
                'Featherweight (Greater)': '羽毛（高级）',
                'Hollowforged (Lesser)': '虚空升华（次级）',
                'Hollowforged (Greater)': '虚空升华（高级）',
                'Fire Strike (Lesser)': '火焰打击（次级）',
                'Fire Strike (Greater)': '火焰打击（高级）',
                'Cold Strike (Lesser)': '冰霜打击（次级）',
                'Cold Strike (Greater)': '冰霜打击（高级）',
                'Lightning Strike (Lesser)': '闪电打击（次级）',
                'Lightning Strike (Greater)': '闪电打击（高级）',
                'Wind Strike (Lesser)': '疾风打击（次级）',
                'Wind Strike (Greater)': '疾风打击（高级）',
                'Holy Strike (Lesser)': '神圣打击（次级）',
                'Holy Strike (Greater)': '神圣打击（高级）',
                'Dark Strike (Lesser)': '黑暗打击（次级）',
                'Dark Strike (Greater)': '黑暗打击（高级）',
                'Butcher (Lesser)': '攻击（次级）',
                'Butcher (Greater)': '攻击（高级）',
                'Swiftness (Lesser)': '攻速（次级）',
                'Swiftness (Greater)': '攻速（高级）',
                'Fatality (Lesser)': '攻爆伤（次级）',
                'Fatality (Greater)': '攻爆伤（高级）',
                'Overpower (Lesser)': '反招架（次级）',
                'Overpower (Greater)': '反招架（高级）',
                'Voidseeker (Lesser)': '虚空（次级）',
                'Voidseeker (Greater)': '虚空（高级）',
                'Capacitor (Lesser)': '法力（次级）',
                'Capacitor (Greater)': '法力（高级）',
                'Archmage (Lesser)': '法伤（次级）',
                'Archmage (Greater)': '法伤（高级）',
                'Economizer (Lesser)': '节能（次级）',
                'Economizer (Greater)': '节能（高级）',
                'Spellweaver (Lesser)': '施法加速（次级）',
                'Spellweaver (Greater)': '施法加速（高级）',
                'Annihilator (Lesser)': '法爆伤（次级）',
                'Annihilator (Greater)': '法爆伤（高级）',
                'Penetrator (Lesser)': '反抵抗（次级）',
                'Penetrator (Greater)': '反抵抗（高级）',
                'Aether (Lesser)': '以太（次级）',
                'Aether (Greater)': '以太（高级）',
                'Juggernaut (Lesser)': '生命加成（次级）',
                'Juggernaut (Greater)': '生命加成（高级）',
                'Fire-proof (Lesser)': '耐热（次级）',
                'Fire-proof (Greater)': '耐热（高级）',
                'Cold-proof (Lesser)': '抗寒（次级）',
                'Cold-proof (Greater)': '抗寒（高级）',
                'Lightning-proof (Lesser)': '绝缘（次级）',
                'Lightning-proof (Greater)': '绝缘（高级）',
                'Wind-proof (Lesser)': '防风（次级）',
                'Wind-proof (Greater)': '防风（高级）',
                'Holy-proof (Lesser)': '驱圣（次级）',
                'Holy-proof (Greater)': '驱圣（高级）',
                'Dark-proof (Lesser)': '驱暗（次级）',
                'Dark-proof (Greater)': '驱暗（高级）',
                'Kevlar Pouch': '凯夫拉袋',
                'Mithril Pouch': '秘银袋',
                'Silk Pouch': '丝绸袋',
                'DESTROY': '销毁',
                '/Are you sure you want to attach a new charm in\\s*$/': '确定要在 ',
                '/^\\s*:\\s*$/': ' 附加新护符吗：',
                'by spending the following materials:': '消耗以下材料：',
                'Confirm Attach': '确认附加',
                'replace the intact pouch in ': '更换护符袋在 ',
                'The existing charm will be ': '现有护符将被',
                'The existing pouch will be reused.': '现有护符袋将被重复使用。',
                'The existing pouch will be ': '现有护符袋将被',
                'DESTROYED': '销毁',
                '/This charm is already attached in Slot\\s*(\\d+)\\./': '此护符已安装在护符槽 $1',
                '/This charm cannot be attached due to the charm in Slot\\s*(\\d+)\\./': '由于护符槽 $1 中的护符，无法附加此护符。',
                '/Missing\\s*(\\d+)x\\s*(.+)\\.?/': '缺少 $1 个 $2',
                '/Upgrade Tier:\\s*(.+)/': '升级层级：$1',
                'Next Tier Materials:': '下一层级材料:',
                '(Item World Clear Required)': '（需要通关道具界）',
                '(Currently Equipped)': '（当前已装备）',
                '(No Current Equipment)': '（当前装备为空）',
                'You cannot enter the item world of a currently equipped item.': '无法进入当前已装备物品的道具界。',
                'You are missing the required materials and credits to perform this upgrade.': '缺少执行本次升级所需的材料或 Credits。',
                'Are you sure you want to spend the requisite materials and credits to upgrade this equipment? Credits and Cores cannot be refunded.': '确定要消耗所需材料和 Credits 来升级这件装备吗？Credits 和核心无法退还。',
                'Base Stat Rolls': '基础属性掷值',
                'Fuse Equipment Stats': '融合装备属性',
                'All Stats Maxed': '登峰造极',
                'Stat Fusion is not available on Isekai': '异世界不可使用属性融合。',
                '(Unavailable on Isekai)': '（异世界不可用）',
                'Set To Locked': '设为锁定',
                'Set To Protected': '设为保护',
                'Move To Storage': '移入仓库',
                '(Soulbinding Required)': '（需要魂绑）',
                'You can only upgrade soulbound equipment.': '只能升级已魂绑装备。',
                'You can only enter the item world of soulbound equipment.': '只能进入已魂绑装备的道具界。',
                'Equipment normally has a fixed level that determines the scaling of its stats. Some low-quality equipment drops with an unassigned level; in that case, it will be assigned to your current level when you first equip it.': '装备通常有一个固定等级，用于决定其属性缩放。部分低品质装备掉落时等级未指定；这种情况下，它会在你首次装备时分配为你的当前等级。',
                'Soulbinding equipment will permanently bind it to you, and makes it always scale to your level. This will also let you access its Item World, as well as enabling the use of Upgrades, Charms and Stat Fusions to improve it.': '魂绑装备会将其永久绑定给你，并使它始终随你的等级缩放。这也会让你可以进入它的道具界，并启用升级、护符和属性融合来强化它。',
                'Soulbound equipment becomes permanently untradeable, and can no longer be salvaged. It can still be sold in the Equipment Shop, but cannot be purchased by anyone else. Soulbinding cannot be reversed under any circumstances.': '魂绑装备会永久不可交易，并且不能再被分解。它仍可出售给装备商店，但其他人无法购买。魂绑在任何情况下都无法逆转。',
                '/You cannot soulbind equipment more than 100 levels above your current level\\. As of right now, you can soulbind equipment up to Level\\s*(\\d+)\\. Equipment that you cannot soulbind are not listed here\\./': '你不能魂绑比当前等级高出超过 100 级的装备。目前你最多可以魂绑到 $1 级的装备。无法魂绑的装备不会列在这里。',
                'Soulbinding costs a number of Soul Fragments depending on its quality and how much higher level it is compared to you.': '魂绑会消耗一定数量的灵魂碎片，数量取决于装备品质以及它比你高出多少等级。',
                'Available Soul Fragments:': '可用灵魂碎片:',
                'Are you sure you want to soulbind this equipment? This will enable charms and upgrades, but makes it permanently untradeable.': '确定要魂绑这件装备吗？这会启用护符和升级，但会使其永久不可交易。',
                'Cost:': '费用:',
                '/(\\d+) Soul Fragments?/': '$1 灵魂碎片',
                '/You need an additional\\s*(\\d+)\\s*soul fragments\\./': '你还需要 $1 个灵魂碎片。',
                'Confirm Soulbind': '确认魂绑',
                'Are you sure you want to repair this equipment?': '确定要修理这件装备吗？',
                'Required Repair Materials:': '所需修理材料:',
                'Confirm Repair': '确认修理',
                'You need additional materials to repair this equipment.': '你需要更多材料才能修理这件装备。',
                'This equipment does not currently require repair.': '此装备当前不需要修理。',
                'Are you sure you want to enter this Item World?': '你确定要进入这个道具界吗？',
            },
            itemWorld: {
                'Equipment must be soulbound before you can enter its Item World.': '装备必须先魂绑才能进入其道具界。',
                'Unequip Current': '卸下当前装备',
                'Equip Selected': '装备所选装备',
                'Clearing item worlds is the only way to unlock the full potential of your equipment. Select an equipment to enter the world contained within. You can only enter the worlds of equipment that are soulbound to you.': '通关道具界是解锁装备全部潜能的唯一方式。选择一件装备以进入其内部的世界。你只能进入已与你魂绑的装备道具界。',
                'If you manage to fight your way through, you will boost the latent potency of your equipment. This increases the total strength of the charms the equipment can handle, and allows you to upgrade it further.': '如果你成功战斗到底，就会提升装备的潜在力量。这会提高装备可承载护符的总强度，并允许你进一步升级它。',
                'The number of rounds you will be fighting depends on the quality of your item. More powerful items will have more powerful monsters inside them, and the monsters get more powerful the deeper you go. The difficulty setting does not affect the difficulty in Item Worlds.': '战斗回合数取决于物品品质。越强大的物品内部会有越强大的怪物，并且深入程度越高，怪物也越强。难度设置不会影响道具界难度。',
                'Spawning an item world requires a number of World Seeds, depending on its quality and number of item worlds cleared inside that particular equipment.': '生成道具界需要消耗一定数量的世界种子，数量取决于装备品质以及该装备已通关的道具界次数。',
                'Available World Seeds:': '可用世界种子:',
                'Enter Item World': '进入道具界',
                'Required Items:': '所需物品:',
                'World Level:': '世界等级:',
                'Battle Rounds:': '战斗回合:',
                'Monster LVL:': '怪物等级:',
                'Difficulty:': '难度:',
                'Entry Cost:': '入场消耗:',
            },
            shrine: {
                'Random Reward': '随机奖励',
            },
            ability: {
                '/Ability Points:\\s*(\\d+)/': '技能点：$1',
                '/Mastery Points:\\s*(\\d+)/': '精通点：$1',
                '/Cost:\\s*(\\d+) AP/': '消耗：$1 技能点',
                '/Level\\s*(\\d+)/': '等级 $1',
                '/(\\d+) Ability Points/': '$1 技能点',
                'Current Tier': '当前等级',
                'Next Tier': '下一等级',
                'At Maximum': '已满级',
                'Maxed': '已满级',
                'HP Tank': '生命值增幅',
                'MP Tank': '法力值增幅',
                'SP Tank': '灵力值增幅',
                'Better Health Pots': '生命药水效果加成',
                'Better Mana Pots': '法力药水效果加成',
                'Better Spirit Pots': '灵力药水效果加成',
                '1H Damage': '单手流伤害加成',
                '1H Accuracy': '单手流命中率加成',
                '1H Block': '单手流格挡率加成',
                '2H Damage': '双手流伤害加成',
                '2H Accuracy': '双手流命中率加成',
                '2H Parry': '双手流招架率加成',
                'DW Damage': '双持流伤害加成',
                'DW Accuracy': '双持流命中率加成',
                'DW Crit': '双持流暴击加成',
                'Staff Damage': '法杖流法杖攻击伤害加成',
                'Staff Accuracy': '法杖流全域命中率加成',
                'Staff Spell Damage': '法杖流魔法伤害加成',
                'Cloth MP': '布甲套法力值加成',
                'Cloth Spellacc': '布甲套法术命中率加成',
                'Cloth Castspeed': '布甲套咏唱速度加成',
                'Cloth Spellcrit': '布甲套法术暴击加成',
                'Light Acc': '轻甲套命中率加成',
                'Light Crit': '轻甲套暴击率加成',
                'Light Speed': '轻甲套攻速加成',
                'Light HP/MP': '轻甲套生命/法力值加成',
                'Heavy Crush': '重甲套打击减伤加成',
                'Heavy Prcg': '重甲套刺击减伤加成',
                'Heavy Slsh': '重甲套斩击减伤加成',
                'Heavy HP': '重甲套生命值加成',
                'Better Cure': '强力治疗',
                'Better Shadow Veil': '强力影纱',
                'Better Protection': '强力守护',
                'Better Regen': '强力细胞活化',
                'Better Haste': '强力加速',
                'Stronger Spirit': '强力灵能力',
                'Better Weaken': '强力虚弱',
                'Faster Weaken': '快速虚弱',
                'Better Imperil': '强力陷危',
                'Faster Imperil': '快速陷危',
                'Better Blind': '强力致盲',
                'Faster Blind': '快速致盲',
                'Mind Control': '精神控制',
                'Better Spark': '强力生命火花',
                'Better Silence': '强力沉默',
                'Better Heartseeker': '强力觅心者',
                'Storm Spike Shield': '风暴刺盾',
                'Better Drain': '强力枯竭',
                'Faster Drain': '快速枯竭',
                'Better Slow': '强力迟缓',
                'Better Immobilize': '强力定身',
                'Better Absorb': '强力吸收',
                'Better Arcane Focus': '强力奥术专注',
                'Flame Spike Shield': '烈焰刺盾',
                'Frost Spike Shield': '冰霜刺盾',
                'Shock Spike Shield': '闪电刺盾',
                'Elementalism': '自然崇拜者',
                'Archmage': '大法师',
                'Sorcery': '巫术',
                'Pyromancy': '火术',
                'Cryomancy': '寒灾',
                'Tempest': '风灾',
                'Havoc': '雷暴',
                'Better Corruption': '强力腐化',
                'Better Disintegrate': '强力瓦解',
                'Better Ragnarok': '强力诸神黄昏',
                'Dark Imperil': '黑暗陷危',
                'Better Smite': '强力惩戒',
                'Better Banish': '强力放逐',
                'Better Paradise': '强力失乐园',
                'Holy Imperil': '神圣陷危',
                'Major Ability Slot - Click or drag an unlocked ability to fill slot.': '主要技能槽 - 点击或拖拽已解锁技能来填充。',
                'Supportive Ability Slot - Click or drag an unlocked ability to fill slot.': '辅助技能槽 - 点击或拖拽已解锁技能来填充。',
                '/Major Ability Slot - Unlock Cost: (\\d+) Mastery Points/': '主要技能槽 - 解锁消耗：$1 精通点',
                '/Supportive Ability Slot - Unlock Cost: (\\d+) Mastery Points/': '辅助技能槽 - 解锁消耗：$1 精通点',
                '/Drain Augment Ability Slot - Unlock Cost: (\\d+) Mastery Points/': '吸收强化技能槽 - 解锁消耗：$1 精通点',
            },
            arena: {
                'Challenge': '挑战',
                'Highest Clear': '最高通关',
                'Min Level': '最低等级',
                'Rounds': '回合数',
                'EXP Mod': '经验倍率',
                'Entry Cost': '入场费用',
                'Clear Bonus': '通关奖励',
                '/Lv\\.\\s*(\\d+)/': '等级 $1',
                '/Cooldown:\\s*(\\d+)H\\s*(\\d+)M/': '冷却：$1小时$2分钟',
                'Cooldown:': '冷却：',
                'First Blood': '第一滴血',
                'Learning Curves': '学习曲线',
                'Graduation': '毕业考验',
                'Road Less Traveled': '少有人走的路',
                'A Rolling Stone': '滚石不生苔',
                'Fresh Meat': '新鲜血肉',
                'Dark Skies': '阴云密布',
                'Growing Storm': '渐起风暴',
                'Power Flux': '力量涌动',
                'Killzone': '杀戮地带',
                'Endgame': '终局之战',
                'Longest Journey': '漫长旅途',
                'Dreamfall': '梦陨',
                'Exile': '流放之地',
                'Sealed Power': '封印之力',
                'New Wings': '新生之翼',
                'To Kill a God': '弑神之路',
                'Eve of Death': '死亡前夜',
                'The Trio and the Tree': '三人与古树',
                'End of Days': '末日终章',
                'Eternal Darkness': '永恒黑暗',
                'A Dance with Dragons': '与龙共舞',
                'Post-Game Content': '后期挑战',
                'Secret Pony Level': '秘密小马关卡',
                'Konata': '泉此方',
                'Mikuru Asahina': '朝比奈实玖瑠',
                'Ryouko Asakura': '朝仓凉子',
                'Yuki Nagato': '长门有希',
                'Real Life': '现实人生',
                'Invisible Pink Unicorn': '隐形粉红独角兽',
                'Flying Spaghetti Monster': '飞天意面神',
                'Triple Trio and the Tree': '三人与古树',
                'The Tower is an Isekai-Only battle mode where the goal is to get as high as possible before the end of the season. Ranking high in this mode at the end of the season will provide you with some permanent bonuses on HV Persistent.': '塔楼是仅限异世界的战斗模式，目标是在赛季结束前尽可能爬到更高层。赛季结束时排名较高会在 HV 永久区获得一些永久奖励。',
                'The difficulty and monster level in this battle mode is locked to each floor, with an increase in monster level, difficulty or number of rounds for each floor.': '此战斗模式的难度和怪物等级由楼层固定；每层都会提高怪物等级、难度或回合数。',
                '/Your Ranking:\\s*(.+)/': '当前排名：$1',
                '/Current Floor:\\s*(\\d+)\\s*\\((\\d+) Rounds\\)/': '当前楼层：$1（$2 回合）',
                '/Monster Level\\s*(\\d+)/': '怪物等级 $1',
                '/Daily Attempts:\\s*(\\d+)\\s*\\/\\s*(\\d+)/': '每日尝试：$1 / $2',
                '/Daily Clears:\\s*(\\d+)\\s*\\/\\s*(\\d+)/': '每日通关：$1 / $2',
                '/You have\\s*(\\d+)\\s*tokens? of blood\\./': '你拥有 $1 个鲜血令牌。',
                '/^(\\d+)\\s*Tokens?$/i': '$1 个令牌',
                'Welcome to the Grindfest.': '欢迎来到压榨界。',
                'A Grindfest consists of up to 1000 rounds of battle.': '压榨界最多包含 1000 回合战斗。',
                'Starting a Grindfest will consume 1 point of Stamina.': '开始压榨界将消耗 1 点精力。',
                'There is a small credit reward at the end,': '通关结束时会有5000 Credits 奖励，',
                'if you make it all the way through.': '前提是你能一路打到底。',
            },
            training: {
                'Training': '训练',
                'Effect': '效果',
                'Credit Cost': '训练花费',
                'Time': '耗时',
                'Level': '等级',
                'Adept Learner': '熟练学习者',
                'Assimilator': '同化者',
                'Ability Boost': '技能强化',
                'Manifest Destiny': '天命所归',
                'Scavenger': '拾荒者',
                'Quartermaster': '军需官',
                'Luck of the Draw': '幸运抽奖',
                'Archaeologist': '考古学家',
                'Metabolism': '新陈代谢',
                'Inspiration': '激励',
                'Scholar of War': '战争学者',
                'Tincture': '酊剂知识',
                'Pack Rat': '仓鼠症',
                'Dissociation': '解离症',
                'Set Collector': '套装收藏家',
                '+1% EXP Bonus': '+1% 经验加成',
                '+10% Proficiency Experience': '+10% 熟练度经验',
                '+1 Ability Point': '+1 技能点',
                '+1 Mastery Point': '+1 精通点',
                '+1% Base Loot Drop Chance': '+1% 基础掉落率',
                '+5% Base Equipment Drop Chance': '+5% 基础装备掉落率',
                '+1% Base Rare Equipment Chance': '+1% 基础稀有装备掉落率',
                '+10% Base Artifact Drop Chance': '+10% 基础文物掉落率',
                'Improved Monster Hunger Drain': '改善怪物饥饿消耗',
                'Improved Monster Morale Drain': '改善怪物士气消耗',
                '+1 Battle Scroll Slots': '+1 战斗卷轴栏位',
                '+1 Battle Infusion Slots': '+1 战斗灌注栏位',
                '+1 Battle Inventory Slots': '+1 战斗背包栏位',
                '+1 Persona Slot': '+1 人格槽位',
                '+1 Equipment Set': '+1 装备套装',
                'Here you can exchange your credits for Henjutsu Training in various subjects.': '在这里你可以消耗 Credits 进行各种项目的训练。',
                'Training happens in realtime, and you can only train one skill at a time.': '训练按现实时间进行，并且你一次只能训练一个项目。',
                '/^(\\d+) H$/': '$1 小时',
            },
            battle: {
                'Attack': '攻击',
                'Skillbook': '技能书',
                'Items': '物品',
                'Spirit': '灵力',
                'Defend': '防御',
                'Focus': '专注',
                'Skills': '技能',
                'Spells': '法术',
                'Battle Time': '战斗时间',
                'Arena challenge cleared!': '竞技场挑战完成！',
                'Item world cleared!': '道具界通关！',
                '/^Tower floor\\s*(\\d+)\\s*cleared!$/i': '塔楼第 $1 层通关！',
                '/^You gain\\s*([\\d,]+)\\s*exp$/i': '你获得 $1 经验',
                '/^You gain\\s*([\\d,]+)\\s*credits$/i': '你获得 $1 Credits',
                'You are victorious!': '你胜利了！',
                'You have run away!': '你逃跑了！',
                'You escape from the grindfest': '你逃离了压榨界',
                'You escape from the arena': '你逃离了竞技场',
            },
            settings: {
                // Challenge Level
                'Challenge Level': '难度等级',
                'When you get too powerful to be challenged by the mobs on the normal difficulty, you can increase the Challenge Level here. Playing on a higher Challenge Level will increase the EXP you get from each mob, but the mobs have increased HP and hit harder. Additional difficulty levels unlock as you level up.': '当普通难度的怪物已无法构成挑战时，可以在这里提高难度等级。在更高难度下，怪物提供的经验会增加，但怪物拥有更高的生命值和更强的攻击力。更多难度等级会随着你等级提升而解锁。',
                'Challenge': '难度名称',
                'EXP Mod': '经验倍率',
                'Balanced Fun': '平衡而有趣',
                'Somewhat Tricky': '有些棘手',
                'Pretty Tough': '确实挺难',
                'Even Tougher': '还能更难',
                'Old School': '像红白机一样无情',
                'I Wanna Be The Hentai': '我要成为大Hentai',
                'Smiles': '微笑 :-)',
                // Display Title
                'Display Title': '称号一览',
                'Here you can choose which of your available titles that will be displayed below your level and on the forums.': '在这里可以选择你当前已解锁的称号，它会显示在等级下方以及论坛中。',
                'Title': '称号',
                'Effect': '效果',
                'Level Default': '自动选择（根据当前等级）',
                'See Below': '见下方',
                'Newbie': '新手',
                'No Bonus': '无加成',
                'Beginner': '初学者',
                'Novice': '菜鸟',
                'Apprentice': '学徒',
                'Journeyman': '熟练工',
                'Artisan': '工匠',
                'Expert': '专家',
                'Master': '大师',
                'Champion': '冠军',
                'Hero': '英雄',
                'Lord': '领主',
                'Ascended': '飞升者',
                'Destined': '天命之人',
                'Godslayer': '弑神者',
                'Dovahkiin': '龙裔',
                'Ponyslayer': '小马杀手（也可使用龙吼）',
                '% Damage': '% 伤害',
                '% Evade': '% 闪避',
                '+The power of the Dragonborn.': '+龙裔之力。',
                // Font Engine
                'Font Engine': '字体引擎',
                'Here you can choose a custom font instead of the standard HentaiVerse font engine. This mostly affects how fast pages will render and how pretty they will look.': '在这里可以选择自定义字体替代标准HV字体引擎。这主要影响页面渲染速度和显示美观度。',
                'Use Custom Font (specify below - this font MUST be installed on your local system to work)': '使用自定义字体（请在下方指定 - 该字体必须已安装在你的本地系统中）',
                'font-family': '字体名称',
                'font-size': '字体大小',
                'font-weight': '字体粗细',
                'font-style': '字体样式',
                'vertical adjust': '垂直偏移',
                'Allowed: 5 to 20 (points)': '允许范围: 5 ~ 20（磅）',
                'Allowed: normal, bold, bolder, lighter': '允许范围: normal(常规), bold(粗体), bolder(更粗), lighter(更细)',
                'Allowed: normal, italic, oblique': '允许范围: normal(常规), italic(斜体), oblique(更斜)',
                'Allowed: -8 to 8 pixels (tweak until text appears centered)': '允许范围: -8 ~ 8 像素（微调至文字垂直居中）',
                // Equipment Sets
                'Equipment Sets': '装备套装',
                'If you want to have separate slotted abilities, battle items and skillbars/autocast assignments per equipment set for your current persona, you can toggle the options below. If this is changed, the current persona\'s shared set will be assigned to Set 1 and vice versa. This can be set differently for each persona.': '如果想为当前人格的每个装备套装分别设置技能、战斗物品和快捷栏/自动施法，可以切换以下选项。更改后，当前人格的共享套装配制将分配到套装1，反之亦然。每个人格可分别设置。',
                'Use Separate Ability Set Assigments': '使用独立的技能配置',
                'Use Separate Battle Item Assigments': '使用独立的战斗物品配置',
                'Use Separate Skillbar/Autocast Assignments': '使用独立的快捷栏/自动施法配置',
                // Vital Bar Style
                'Vital Bar Style': '状态栏样式',
                'You can either use the standard bar which uses pips for charges, or a more utilitarian (and skinnable) bar that has numerical bars for everything.': '可以使用以圆点表示充能的标准栏，或使用以数字显示所有数值的更实用（且可换肤）栏。',
                'Standard': '标准样式',
                'Utilitarian': '实用样式',
                // Shrine Trophy Upgrades
                'Shrine Trophy Upgrades': '祭坛奖杯升级',
                'By default, as you gain levels, Snowflake will start accepting more lower-tier trophies for a higher-trophy roll in the Shrine. You can override this behavior here.': '默认情况下，随着等级提升，雪花女神会开始接受更多低级奖杯来换取更高级奖杯的抽取机会。你可以在此覆盖此行为。',
                'Use Default': '使用默认设置',
                'Upgrade to Tier 3': '升级至等级3（消耗8个T1奖杯以获得T3奖杯的奖励）',
                'Upgrade to Tier 4': '升级至等级4（消耗16个T1奖杯或4个T2奖杯以获得T4奖杯的奖励，同时总献祭价值提升为1.1倍）',
                'Upgrade to Tier 5': '升级至等级5（消耗32个T2奖杯或8个T3奖杯或4个T4奖杯以获得T5奖杯的奖励，同时总献祭价值提升为1.3倍）',
                'Do Not Upgrade': '不升级',
                // Quickbar Slots
                'Quickbar Slots': '快捷栏',
                'Here you can set up which spells will appear on the battle screen quickbar.': '在此设置战斗界面快捷栏中显示的法术。',
                '(Not Assigned)': '（未设置）',
                // Auto-Cast Slots
                'Auto-Cast Slots': '自动施法槽',
                'Here you can set which spells will be automatically cast at the start of each battle.': '在此设置在战斗开始时自动施放的法术。',
                '/^Autocast (\\d+)$/': '自动施法槽 $1',
                'Upkeep:': '维持消耗:',
                '/^([\\d.]+) MP\\/round$/': '$1 法力/回合',
                'If your MP decreases below 10%, the innate spells will dissipate. They will be recast when it goes back above 25%.': '若法力降至10%以下，固有法术会消散；法力恢复到25%以上时会重新施放。',
                // Auto-Sell / Auto-Salvage
                'Auto-Sell / Auto-Salvage': '自动出售 / 自动分解',
                'If you want to automatically dump junk equipment on the closest travelling salesmoogle or break it down into parts, you can do so here. All equipment of the specified qualify and below will be automatically sold or turned in to salvage. If a dropped equipment qualifies for both sell and salvage, the action with the lowest required quality will be taken.': '如果希望将垃圾装备自动丢给旅行销售莫古利或分解为零件，可以在此设置。所有指定品质及以下的装备将被自动出售或分解。若某装备同时满足出售与分解条件，则执行品质要求较低的操作。',
                'No Auto-Sell': '不自动出售',
                '/^Sell (.+)$/': '出售 $1',
                'No Auto-Salvage': '不自动分解',
                '/^Salvage (.+)$/': '分解 $1',
                // Submit
                'Apply Changes': '应用更改',
            },
            credit: {},
            itemMeta: {
                'Consumable': '消耗品',
                'Artifact': '文物',
                'Token': '令牌',
                'Crystal': '水晶',
                'Trophy': '奖杯',
                'Material': '材料',
                'Collectable': '收藏品',
                'Monster Food': '怪物食物',
            },
        },
        equipment: {
            parts: {
                '/^One-Handed Weapon$/': '单手武器',
                '/^Two-Handed Weapon$/': '双手武器',
                '/^Shield$/': '盾牌',
                '/^Helmet$/': '头盔',
                '/^Body$/': '身体',
                '/^Hands$/': '手部',
                '/^Legs$/': '腿部',
                '/^Feet$/': '脚部',
            },
            slots: {
                '/^Equipment Slots$/': '套装栏',
                '/^Main Hand$/': '主手',
                '/^Off Hand$/': '副手',
                '/^Empty Slot$/': '空槽位',
                '/^Empty$/': '空',
                '/^\\(empty\\)$/i': '（空）',
                '/^\\(unavailable\\s+with\\s+current\\s+mainhand\\)$/i': '（当前主手武器下不可用）',
            },
            detail: {
                'One-handed Weapon': '单手武器',
                'Two-handed Weapon': '双手武器',
                'Cloth Armor': '布甲',
                'Light Armor': '轻甲',
                'Heavy Armor': '重甲',
                '/^Staff /': '法杖 ',
                '/^Shield /': '盾牌 ',
                'Condition:': '耐久度:',
                'Energy:': '能量:',
                'Tier': '层级',
                'Soulbound': '灵魂绑定',
                'Unassigned': '未确定',
                'Untradeable': '不可交易',
                'Tradeable': '可交易',
                'Potency Tier': '潜能等级',
                'MAX': '已满',
                '/Level\\s*(\\d+|Unassigned)/': '等级 $1',
                'Burden:': '负重:',
                'Interference:': '干涉:',
                'None': '无',
                '/^Base:\\s*(.+)$/': '基础：$1',
                'Ether Tap': '法力回流',
                'Siphon Spirit': '灵力吸取',
                'Siphon Magic': '法力吸取',
                'Siphon Health': '生命吸取',
                'chance': '几率',
                '/\\((\\d+)\\s*turns?\\)/': '（$1 回合）',
                '/^Counter-resist$/i': '反抵抗',
                '/^Counter-parry$/i': '反招架',
                'Proficiency': '熟练度',
                'Primary Attributes': '主属性加成',
                '/^Rewarded as a Clear Bonus to\\s*/': '作为通关奖励授予 ',
                "/^Rewarded from Snowflake's Shrine to\\s*/": '由雪花祭坛奖励给 ',
                '/^Dropped by (.+?) for\\s*/': '由 $1 掉落给 ',
                '/\\s+on\\s*(\\d{4}-\\d{2}-\\d{2})$/': ' 于 $1',
                'Current Owner:': '当前持有者:',
                'Equipment Shop': '系统装备店',
            },
            name: {
                // 品质
                'Flimsy': '脆弱',
                'Crude': '粗糙',
                'Fair': '普通',
                'Average': '中等',
                'Superior': '上等',
                '/^Fine /': '优质 ',
                'Exquisite': '✧精良✧',
                'Magnificent': '☆史诗☆',
                'Legendary': '✪传奇✪',
                'Peerless': '☯无双☯',
                'Ultimate': '𖣔终极𖣔',

                //类型
                'One-handed Weapon': '单手武器',
                'Two-handed Weapon': '双手武器',
                'Staff':'法杖',
                'Shield':'盾牌',
                'Cloth Armor':'轻甲',
                'Light Armor':'轻甲',
                'Heavy Armor':'重甲',
                'Slaughter': ' 杀戮(攻击+)',
                'Balance': '平衡(攻命攻爆+)',
                'Swiftness': '迅捷(攻速+)',
                'the Vampire': '吸血鬼(吸血+)',
                'the Illithid': '汲灵(吸血/吸魔+)',
                'the Nimble' : '灵活(招架+)',
                'the Banshee' : '女妖(吸血/吸灵+)',
                'the Battlecaster': '战法师(魔耗-魔命+)',
                'the Heaven-sent': '天堂(神圣熟练+)',
                'the Elementalist': '元素使(元素熟练+)',
                'Destruction': '毁灭(法伤+)',
                'Focus': '专注(法爆魔命+魔耗-)',
                'Surtr': '苏尔特(火伤+)',
                'Niflheim': '尼芙菲姆(冰伤+)',
                'Freyr': '弗雷尔(风伤+)',
                'Mjolnir': '姆乔尔尼尔(雷伤+)',
                'Heimdall': '海姆达尔(圣伤+)',
                'Fenrir': '芬里尔(暗伤+)',
                'the Demon-fiend': '恶魔(黑暗熟练+)',
                'the Earth-walker': '地行者(增益熟练+)',
                'the Curse-weaver': '织咒者(减益熟练+)',
                'the Barrier': '屏障(格挡+)',
                'Warding': '护佑(魔减伤+)',
                'Protection': '保护(物减伤+)',
                'Dampening': '抑制(打减伤+)',
                'Stoneskin': '石肤(斩减伤+)',
                'Deflection': '偏转(刺减伤+)',
                'the Shadowdancer': '影舞者(闪避/攻爆+)',
                'the Arcanist': '奥术师(无干涉/魔命+)',
                'the Fleet': '迅捷(闪避+)',
                'Negation': '否定(抵抗+)',
                'the Wind-waker': '驭风者(风抗+)',
                'the Ox': '公牛(力量+)',
                'the Raccoon': '浣熊(灵巧+)',
                'the Cheetah': '猎豹(敏捷+)',
                'the Turtle': '乌龟(体质+)',
                'the Fox': '狐狸(智力+)',
                'the Owl': '猫头鹰(智慧+)',
                'the Fire-eater': '吞火者(火抗+)',
                'the Frost-born': '霜裔(冰抗+)',
                'the Thunder-child': '雷之子(雷抗+)',
                'the Thrice-blessed': '三重祝福(圣抗+)',
                'the Spirit-ward': '幽冥结界(暗抗+)',

                // 武器 / 盾牌
                'Axe': '斧(单)',
                'Club': '棍(单)',
                'Rapier': '西洋剑(单)',
                'Shortsword': '短剑(单)',
                'Wakizashi': '胁差(单)',
                'Swordchucks': '锁链双剑(双)',
                'Dagger': '匕首(单)',
                'Great Mace': '巨锤(双)',
                'Mace': '巨锤(双)',
                'Estoc': '刺剑(双)',
                'Longsword': '长剑(双)',
                'Katana': '日本刀(双)',
                'Scythe': '镰刀(双)',
                'Buckler': '小圆盾',
                'Kite Shield': '鸢盾',
                'Force Shield': '力场盾',
                'Tower Shield': '塔盾',
                'Oak': '橡木',
                'Redwood': '红木',
                'Willow': '柳木',
                'Katalox': '铁木',
                'Ebony': '乌木',

                // 护甲材质 / 部位
                'Cotton': '棉布(布)',
                'Phase': '相位(布)',
                'Gossamer': '薄纱(布)',
                'Shade': '暗影(轻)',
                'Leather': '皮革(轻)',
                'Drakehide': '龙鳞(轻)',
                'Chain': '锁子甲(重)',
                'Plate': '板甲(重)',
                'Power': '动力(重)',
                'Ironsilk': '铁丝绸(布)',
                'Kevlar': '凯夫拉(轻)',
                'Reactive': '反应(重)',
                'Cap': '帽',
                'Robe': '长袍',
                'Breastplate': '护胸',
                'Cuirass': '胸甲',
                'Gloves': '手套',
                'Gauntlets': '护手',
                'Pants': '裤子',
                'Leggings': '绑腿',
                'Greaves': '护胫',
                'Shoes': '鞋子',
                'Boots': '靴子',
                'Sabatons': '铁靴',
                'Helmet': '头盔',
                '/\\bArmor\\b/': '盔甲',

                // 前缀
                'Ethereal': '虚空(无负重/干涉)',
                'Fiery': '灼热(火伤+)',
                'Arctic': '极寒(冰伤+)',
                'Shocking': '闪电(电伤+)',
                'Tempestuous': '风暴(风伤+)',
                'Hallowed': '神圣(圣伤+)',
                'Demonic': '恶魔(暗伤+)',
                'Reinforced': '加固的(斩打刺减伤+)',
                'Radiant': '✪魔光✪(法伤+)',
                'Mystic': '神秘(法爆伤+)',
                'Charged': '充能(施速+)',
                'Amber': '琥珀的(电抗+)',
                'Mithril': '秘银的(负重-)',
                'Agile': '俊敏的(攻速+)',
                'Zircon': '锆石的(圣抗+)',
                'Frugal': '节能(魔耗-)',
                'Jade': '翡翠的(风抗+)',
                'Cobalt': '钴石的(冰抗+)',
                'Ruby': '红宝石(火抗+)',
                'Onyx': '缟玛瑙(暗抗+)',
                'Savage': '残暴的(攻爆伤+)',
                'Shielding': '盾化的(格挡+)',

                // 后缀
                ' of Slaughter': ' 杀戮(攻击+)',
                ' of Balance': ' 平衡(攻命攻爆+)',
                ' of Swiftness': ' 迅捷(攻速+)',
                ' of the Vampire': ' 吸血鬼(吸血+)',
                ' of the Illithid': ' 汲灵(吸血/吸魔+)',
                ' of the Nimble' : ' 灵活(招架+)',
                ' of the Banshee' : ' 女妖(吸血/吸灵+)',
                ' of the Battlecaster': ' 战法师(魔耗-魔命+)',
                ' of the Heaven-sent': ' 天堂(神圣熟练+)',
                ' of the Elementalist': ' 元素使(元素熟练+)',
                ' of Destruction': ' 毁灭(法伤+)',
                ' of Focus': ' 专注(法爆魔命+魔耗-)',
                ' of Surtr': ' 苏尔特(火伤+)',
                ' of Niflheim': ' 尼芙菲姆(冰伤+)',
                ' of Freyr': ' 弗雷尔(风伤+)',
                ' of Mjolnir': ' 姆乔尔尼尔(雷伤+)',
                ' of Heimdall': ' 海姆达尔(圣伤+)',
                ' of Fenrir': ' 芬里尔(暗伤+)',
                ' of the Demon-fiend': ' 恶魔(黑暗熟练+)',
                ' of the Earth-walker': ' 地行者(增益熟练+)',
                ' of the Curse-weaver': ' 织咒者(减益熟练+)',
                ' of the Barrier': ' 屏障(格挡+)',
                ' of Warding': ' 护佑(魔减伤+)',
                ' of Protection': ' 保护(物减伤+)',
                ' of Dampening': ' 抑制(打减伤+)',
                ' of Stoneskin': ' 石肤(斩减伤+)',
                ' of Deflection': ' 偏转(刺减伤+)',
                ' of the Shadowdancer': ' 影舞者(闪避/攻爆+)',
                ' of the Arcanist': ' 奥术师(无干涉/魔命+)',
                ' of the Fleet': ' 迅捷(闪避+)',
                ' of Negation': ' 否定(抵抗+)',
                ' of the Wind-waker': ' 驭风者(风抗+)',
                ' of the Ox': ' 公牛(力量+)',
                ' of the Raccoon': ' 浣熊(灵巧+)',
                ' of the Cheetah': ' 猎豹(敏捷+)',
                ' of the Turtle': ' 乌龟(体质+)',
                ' of the Fox': ' 狐狸(智力+)',
                ' of the Owl': ' 猫头鹰(智慧+)',
                ' of the Fire-eater': ' 吞火者(火抗+)',
                ' of the Frost-born': ' 霜裔(冰抗+)',
                ' of the Thunder-child': ' 雷之子(雷抗+)',
                ' of the Thrice-blessed': ' 三重祝福(圣抗+)',
                ' of the Spirit-ward': ' 幽冥结界(暗抗+)',
            },
            auctionName: {
                // 拍卖网站专用：英文装备名直接翻译为 ck 拍卖版文本
                'Radiant': '✪魔光✪',
                'Mystic': '神秘',
                'Charged': '充能',
                'Amber': '琥珀的(雷抗)',
                'Mithril': '秘银的',
                'Agile': '俊敏的',
                'Zircon': '锆石的(圣抗)',
                'Frugal': '节能',
                'Jade': '翡翠的(风抗)',
                'Cobalt': '钴石的(冰抗)',
                'Ruby': '红宝石(火抗)',
                'Onyx': '缟玛瑙(暗抗)',
                'Savage': '残暴的',
                'Ethereal': '虚空之',
                'Fiery': '灼热之',
                'Arctic': '极寒之',
                'Shocking': '闪电之',
                'Tempestuous': '风暴之',
                'Hallowed': '神圣之',
                'Demonic': '恶魔之',
                'Reinforced': '加固的',

                ' of the Shadowdancer': ' 影舞者',
                ' of the Arcanist': ' 奥术师',
                ' of the Fire-eater': ' 噬火者',
                ' Fire-eater': ' 噬火者',
                ' of the Thunder-child': ' 雷之子',
                ' of the Wind-waker': ' 驭风者',
                ' of the Spirit-ward': ' 幽冥结界',
                ' Spirit-ward': ' 幽冥结界',
                ' of the Battlecaster': ' 战法师',
                ' of the Elementalist': ' 元素使',
                ' of the Heaven-sent': ' 天堂',
                ' of the Demon-fiend': ' 恶魔',
                ' of the Earth-walker': ' 地行者',
                ' of the Curse-weaver': ' 咒术师',
                ' of the Thrice-blessed': ' 三重祝福',
                ' of the Frost-born': ' 霜裔',
                ' of the Cheetah': ' 猎豹',
                ' of the Fleet': ' 迅捷',
                ' of the Nimble': ' 招架',
                ' of the Barrier': ' 格挡',
                ' of the Raccoon': ' 浣熊',
                ' of the Turtle': ' 乌龟',
                ' of the Ox': ' 公牛',
                ' of the Fox': ' 狐狸',
                ' of the Owl': ' 猫头鹰',
                ' of the Banshee': ' 女妖',
                ' of the Illithid': ' 汲灵',
                ' of the Vampire': ' 吸血鬼',
                ' of Slaughter': ' 杀戮',
                ' of the Slaughter': ' 杀戮',
                ' of Destruction': ' 毁灭',
                ' of the Destruction': ' 毁灭',
                ' of Surtr': ' 苏尔特(火伤)',
                ' of Niflheim': ' 尼芙菲姆(冰伤)',
                ' of Mjolnir': ' 姆乔尔尼尔(雷伤)',
                ' of Freyr': ' 弗雷尔(风伤)',
                ' of Heimdall': ' 海姆达尔(圣伤)',
                ' of Fenrir': ' 芬里尔(暗伤)',
                ' of Negation': ' 否定',
                ' of the Negation': ' 否定',
                ' of Dampening': ' 抑制',
                ' of the Dampening': ' 抑制',
                ' of Stoneskin': ' 石肤',
                ' of the Stoneskin': ' 石肤',
                ' of Deflection': ' 偏转',
                ' of the Deflection': ' 偏转',
                ' of Protection': ' 物防',
                ' of the Protection': ' 物防',
                ' of Warding': ' 魔防',
                ' of the Warding': ' 魔防',
                ' of Swiftness': ' 加速',
                ' of the Swiftness': ' 加速',
                ' of Balance': ' 平衡',
                ' of the Balance': ' 平衡',
                ' of Focus': ' 专注',
                ' of the Focus': ' 专注',
            },
        },
        phrase: {
            alerts: {
                'Enter a new name for this persona.': '请输入一个新的角色名。',
                '/Are you sure you wish to create a new persona with the same attribute, slot, equipment and ability assignments as "(.+)"\\? This action is irreversible, and created personas cannot be deleted\\./': '你确定要创建一个与“$1”拥有相同属性、槽位、装备和技能配置的新人格吗？此操作不可逆，创建后的人格无法删除。',
                'Are you sure you wish to create a blank persona? This action is irreversible, and created personas cannot be deleted.': '你确定要创建一个空白人格吗？此操作不可逆，创建后的人格无法删除。',
                '/Reseting this ability will cost (\\d+) soul fragments?\\. Proceed\\?/': '重置此技能将消耗 $1 个灵魂碎片。是否继续？',
                'Reseting this ability is free this time. Proceed?': '本次重置此技能免费。是否继续？',
                '/This will reset ALL mastery and ability point assignments at a cost of (\\d+) soul fragments?\\. Proceed\\?/': '这将重置全部精通点与技能点分配，消耗 $1 个灵魂碎片。是否继续？',
                'This will reset ALL mastery and ability point assignments. This time it is free. Proceed?': '这将重置全部精通点与技能点分配。本次免费。是否继续？',
                '/Are you sure you wish to spend (\\d+) tokens? to start this Arena Challenge\\?/': '你确定要消耗 $1 个令牌来开始此竞技场挑战吗？',
                'Are you sure you wish to start this Arena Challenge?': '你确定要开始此竞技场挑战吗？',
                '/Are you sure you wish to spend (\\d+) tokens? to enter the Ring of Blood\\?/': '你确定要消耗 $1 个鲜血令牌进入浴血擂台吗？',
                'Are you sure you wish to enter the Ring of Blood?': '你确定要进入浴血擂台吗？',
                'Are you sure that you wish to cancel the current training?': '你确定要取消当前训练吗？',
                'Are you sure you wish to offer Snowflake a' : '是否确认向雪花女神献祭 ',
                '/Are you sure you want to attach the protected equipment (.+)\\?/': '你确定要附加受保护装备 $1 吗？',
                'Enter a new name for this monster.': '请输入这个怪物的新名称。',
                '/Are you sure you wish to delete the monster (.+)\\? This action cannot be reversed\\./': '确定要删除怪物 $1 吗？此操作无法撤销。',
            },
            messagebox: {
                'System Message': '系统信息',
                'There is no such skill': '所指定技能不存在',
                'Ability is already slotted': '技能已装备',
                'No slot available that fits the given ability': '没有合适的空槽位适合该技能',
                'The slot does not fit the given ability': '所选技能不能装备在该槽位上',
                'No such slot': '所指定槽位不存在',
                'Insufficient ability points': '技能点不足',
                'Insufficient mastery points': '精通点不足',
                'Ability cannot be increased further': '技能已满级',
                'No such ability': '你没有获得该技能',
                'Level requirements not met': '你还没有达到解锁该技能要求的等级',
                'You cannot enter the same arena twice in one day.': '你不能在同一天内重复进入同一个竞技场。',
                'You cannot afford to train that.': '你的 Credits 不足，无法进行该训练。',
                'You cannot start a new training at this time': '你当前无法开始新的训练。',
                'You have already maxed that training.': '该训练已经达到最高等级。',
                'You have gained another level in': '你的训练提升了一级：',
                '/^Bonded with\\s+/': '已魂绑：',
                '/^Salvaged\\s+(.+)$/': '已分解 $1',
                '/^Acquired\\s+([\\dx,.]+)\\s+(.+)$/': '获得 $1 $2',
                '/^Bought\\s+(.+?)\\s+for\\s+([\\d,]+)\\s+Credits:?\\s*$/': '已购买 $1，花费 $2 Credits',
                '/^Bought\\s+(\\d+)\\s+equipment\\s+for\\s+([\\d,]+)\\s+Credits:?\\s*$/': '已购买 $1 件装备，花费 $2 Credits：',
                '/^Sold\\s+$/': '已出售 ',
                '/^\\s+for\\s+([\\d,]+)\\s+Credits:?\\s*$/': '，金额 $1 Credits',
                '/^Sold the salvage remains for\\s*([\\d,]+)\\s*Credits$/': '已将分解残骸出售为 $1 Credits',
                '/^Sold\\s+(\\d+)\\s+equipment\\s+for\\s+([\\d,]+)\\s+Credits:$/': '已出售 $1 件装备，获得 $2 Credits：',
                'Could not reserve the selected items; usually this means they are no longer available.': '所选物品无法预订，通常是因为已售罄。',
                'A monster with that name already exists.': '已经存在同名怪物。',
                'Monster cannot yet be named.': '这个怪物现在还不能命名。',
                'Monster is not sufficiency high powerlevel': '这个怪物的战斗力还不足以强化该能力。',
                'Monster can no longer be deleted.': '这个怪物已经不能删除。',
                'Insufficient Happy Pills': '快乐药丸不足。',
                'Insufficient Monster Chow': '怪物饲料不足。',
                'Insufficient Monster Edibles': '怪物食品不足。',
                'Insufficient Monster Cuisine': '怪物料理不足。',
                '/^(.+)\\s+brought you a gift!$/': '$1 送来了礼物！',
                '/^(.+)\\s+brought you some gifts!$/': '$1 送来了一些礼物！',
                '/^Received some\\s+(.+)$/': '获得了一些 $1',
                '/^Received a\\s+(.+)$/': '获得了 $1',
                '/^Received\\s+(.+)$/': '获得了 $1',
                'Your equipment has been fused!': '你的装备已完成属性融合！',
                '/^(.+?)\\s+was\\s+increased\\s+by\\s+([+-]?\\d+)$/': '$1 提升 $2',
            },
            itemTooltip: {
                'These fragments can be used in the forge to permanently soulbind an equipment piece to you, which will make it level as you do.': '这些碎片可在锻造中将装备永久魂绑，使其随你的等级成长。',
                'Used to imbue a weapon or staff with a charm.': '用于给武器或法杖附加护符。',
                'Used to imbue an armor or shield with a charm.': '用于给护甲或盾牌附加护符。',
                'Can be used to create a new world inside an equipment piece. Clearing this world will allow you to upgrade it further.': '可用于在装备内创造新道具界。通关后可继续强化该装备。',
                'Some materials scavenged from fallen adventurers by a monster. Required to reforge and upgrade cloth armor.': '怪物从冒险者遗骸中收集的材料。用于重铸与强化布甲。',
                'Some materials scavenged from fallen adventurers by a monster. Required to reforge and upgrade light armor.': '怪物从冒险者遗骸中收集的材料。用于重铸与强化轻甲。',
                'Some materials scavenged from fallen adventurers by a monster. Required to reforge and upgrade heavy armor and weapons.': '怪物从冒险者遗骸中收集的材料。用于重铸与强化重甲和武器。',
                'Some materials scavenged from fallen adventurers by a monster. Required to reforge and upgrade staffs and shields.': '怪物从冒险者遗骸中收集的材料。用于重铸与强化法杖和盾牌。',
                'Some materials scavenged from fallen adventurers by a monster. Required to reforge Force Shields.': '怪物从冒险者遗骸中收集的材料。用于重铸力场盾。',
                'Some materials scavenged from fallen adventurers by a monster. Required to reforge Phase Armor.': '怪物从冒险者遗骸中收集的材料。用于重铸相位甲。',
                'Some materials scavenged from fallen adventurers by a monster. Required to reforge Shade Armor.': '怪物从冒险者遗骸中收集的材料。用于重铸暗影甲。',
                'Some materials scavenged from fallen adventurers by a monster. Required to reforge Power Armor.': '怪物从冒险者遗骸中收集的材料。用于重铸动力甲。',
                'Some materials scavenged from fallen adventurers by a monster. Required to upgrade equipment bonuses to Physical Base Damage.': '怪物从冒险者遗骸中收集的材料。用于升级装备的基础物理伤害属性。',
                'Some materials scavenged from fallen adventurers by a monster. Required to upgrade equipment bonuses to Physical Hit Chance.': '怪物从冒险者遗骸中收集的材料。用于升级装备的物理命中率属性。',
                'Some materials scavenged from fallen adventurers by a monster. Required to upgrade equipment bonuses to Physical Crit Damage.': '怪物从冒险者遗骸中收集的材料。用于升级装备的物理暴击伤害属性。',
                'Some materials scavenged from fallen adventurers by a monster. Required to upgrade equipment bonuses to Magical Base Damage.': '怪物从冒险者遗骸中收集的材料。用于升级装备的基础魔法伤害属性。',
                'Some materials scavenged from fallen adventurers by a monster. Required to upgrade equipment bonuses to Magical Hit Chance.': '怪物从冒险者遗骸中收集的材料。用于升级装备的魔法命中率属性。',
                'Some materials scavenged from fallen adventurers by a monster. Required to upgrade equipment bonuses to Magical Crit Damage.': '怪物从冒险者遗骸中收集的材料。用于升级装备的魔法暴击伤害属性。',
                'Some materials scavenged from fallen adventurers by a monster. Required to upgrade equipment bonuses to Physical Defense.': '怪物从冒险者遗骸中收集的材料。用于升级装备的物理减伤属性。',
                'Some materials scavenged from fallen adventurers by a monster. Required to upgrade equipment bonuses to Magical Mitigation.': '怪物从冒险者遗骸中收集的材料。用于升级装备的魔法减伤属性。',
                'Some materials scavenged from fallen adventurers by a monster. Required to upgrade equipment bonuses to Evade Chance.': '怪物从冒险者遗骸中收集的材料。用于升级装备的闪避率属性。',
                'Some materials scavenged from fallen adventurers by a monster. Required to upgrade equipment bonuses to Block Chance.': '怪物从冒险者遗骸中收集的材料。用于升级装备的格挡率属性。',
                'Some materials scavenged from fallen adventurers by a monster. Required to upgrade equipment bonuses to Parry Chance.': '怪物从冒险者遗骸中收集的材料。用于升级装备的招架率属性。',
                'Some materials scavenged from fallen adventurers by a monster. Required to upgrade equipment bonuses to Resist Chance.': '怪物从冒险者遗骸中收集的材料。用于升级装备的抵抗率属性。',
                'Some materials scavenged from fallen adventurers by a monster. Required to upgrade equipment bonuses to Strength.': '怪物从冒险者遗骸中收集的材料。用于升级装备的力量属性。',
                'Some materials scavenged from fallen adventurers by a monster. Required to upgrade equipment bonuses to Dexterity.': '怪物从冒险者遗骸中收集的材料。用于升级装备的灵巧属性。',
                'Some materials scavenged from fallen adventurers by a monster. Required to upgrade equipment bonuses to Agility.': '怪物从冒险者遗骸中收集的材料。用于升级装备的敏捷属性。',
                'Some materials scavenged from fallen adventurers by a monster. Required to upgrade equipment bonuses to Endurance.': '怪物从冒险者遗骸中收集的材料。用于升级装备的体质属性。',
                'Some materials scavenged from fallen adventurers by a monster. Required to upgrade equipment bonuses to Intelligence.': '怪物从冒险者遗骸中收集的材料。用于升级装备的智力属性。',
                'Some materials scavenged from fallen adventurers by a monster. Required to upgrade equipment bonuses to Wisdom.': '怪物从冒险者遗骸中收集的材料。用于升级装备的智慧属性。',
                'Some materials scavenged from fallen adventurers by a monster. Required to upgrade equipment bonuses to Elemental Magic Proficiency.': '怪物从冒险者遗骸中收集的材料。用于升级装备的元素魔法熟练度属性。',
                'Some materials scavenged from fallen adventurers by a monster. Required to upgrade equipment bonuses to Divine Magic Proficiency.': '怪物从冒险者遗骸中收集的材料。用于升级装备的神圣魔法熟练度属性。',
                'Some materials scavenged from fallen adventurers by a monster. Required to upgrade equipment bonuses to Forbidden Magic Proficiency.': '怪物从冒险者遗骸中收集的材料。用于升级装备的黑暗魔法熟练度属性。',
                'Some materials scavenged from fallen adventurers by a monster. Required to upgrade equipment bonuses to Deprecating Magic Proficiency.': '怪物从冒险者遗骸中收集的材料。用于升级装备的减益魔法熟练度属性。',
                'Some materials scavenged from fallen adventurers by a monster. Required to upgrade equipment bonuses to Supportive Magic Proficiency.': '怪物从冒险者遗骸中收集的材料。用于升级装备的增益魔法熟练度属性。',
                'Some materials scavenged from fallen adventurers by a monster. Required to upgrade equipment bonuses to Fire Spell Damage.': '怪物从冒险者遗骸中收集的材料。用于升级装备的火焰魔法伤害属性。',
                'Some materials scavenged from fallen adventurers by a monster. Required to upgrade equipment bonuses to Cold Spell Damage.': '怪物从冒险者遗骸中收集的材料。用于升级装备的冰冷魔法伤害属性。',
                'Some materials scavenged from fallen adventurers by a monster. Required to upgrade equipment bonuses to Elec Spell Damage.': '怪物从冒险者遗骸中收集的材料。用于升级装备的闪电魔法伤害属性。',
                'Some materials scavenged from fallen adventurers by a monster. Required to upgrade equipment bonuses to Wind Spell Damage.': '怪物从冒险者遗骸中收集的材料。用于升级装备的疾风魔法伤害属性。',
                'Some materials scavenged from fallen adventurers by a monster. Required to upgrade equipment bonuses to Holy Spell Damage.': '怪物从冒险者遗骸中收集的材料。用于升级装备的神圣魔法伤害属性。',
                'Some materials scavenged from fallen adventurers by a monster. Required to upgrade equipment bonuses to Dark Spell Damage.': '怪物从冒险者遗骸中收集的材料。用于升级装备的黑暗魔法伤害属性。',
                'Some materials scavenged from fallen adventurers by a monster. Required to upgrade equipment bonuses to Crushing Mitigation.': '怪物从冒险者遗骸中收集的材料。用于升级装备的打击减伤属性。',
                'Some materials scavenged from fallen adventurers by a monster. Required to upgrade equipment bonuses to Slashing Mitigation.': '怪物从冒险者遗骸中收集的材料。用于升级装备的斩击减伤属性。',
                'Some materials scavenged from fallen adventurers by a monster. Required to upgrade equipment bonuses to Piercing Mitigation.': '怪物从冒险者遗骸中收集的材料。用于升级装备的刺击减伤属性。',
                'Some materials scavenged from fallen adventurers by a monster. Required to upgrade equipment bonuses to Fire Mitigation.': '怪物从冒险者遗骸中收集的材料。用于升级装备的火焰减伤属性。',
                'Some materials scavenged from fallen adventurers by a monster. Required to upgrade equipment bonuses to Cold Mitigation.': '怪物从冒险者遗骸中收集的材料。用于升级装备的冰冷减伤属性。',
                'Some materials scavenged from fallen adventurers by a monster. Required to upgrade equipment bonuses to Elec Mitigation.': '怪物从冒险者遗骸中收集的材料。用于升级装备的闪电减伤属性。',
                'Some materials scavenged from fallen adventurers by a monster. Required to upgrade equipment bonuses to Wind Mitigation.': '怪物从冒险者遗骸中收集的材料。用于升级装备的疾风减伤属性。',
                'Some materials scavenged from fallen adventurers by a monster. Required to upgrade equipment bonuses to Holy Mitigation.': '怪物从冒险者遗骸中收集的材料。用于升级装备的神圣减伤属性。',
                'Some materials scavenged from fallen adventurers by a monster. Required to upgrade equipment bonuses to Dark Mitigation.': '怪物从冒险者遗骸中收集的材料。用于升级装备的黑暗减伤属性。',
                'An advanced technological artifact from an ancient and long-lost civilization. Handing these in at the Shrine of Snowflake will grant you a reward.': '来自古老失落文明的先进科技产物。在雪花女神的神殿交出这些将获得奖励。',
                'Various bits and pieces of scrap cloth. These can be used to mend the condition of an equipment piece.': '各种废布料碎片。可用于修复装备耐久。',
                'Various bits and pieces of scrap leather. These can be used to mend the condition of an equipment piece.': '各种皮革废料碎片。可用于修复装备耐久。',
                'Various bits and pieces of scrap metal. These can be used to mend the condition of an equipment piece.': '各种金属废料碎片。可用于修复装备耐久。',
                'Various bits and pieces of scrap wood. These can be used to mend the condition of an equipment piece.': '各种木材废料碎片。可用于修复装备耐久。',
                'A cylindrical object filled to the brim with magitech energy. Used to power charms and advanced equipment.': '充满魔导能量的圆柱体。用于为护符与高级装备供能。',
                'A protective pouch that will prevent a charm from tearing when you are defeated in battle. Fragile; will always be destroyed if it takes damage.': '保护袋可在你战败时防止护符撕裂。较脆弱，受到伤害必定损毁。',
                'No longer will MBP spread havoc, destruction, and melted polar ice caps.': 'MBP 再也不能传播混乱、毁灭和融化的极地冰盖了。',
                'You found this item in the lair of a White Bunneh. It appears to be a dud.': '你在白兔巢穴里找到了它，看起来是个哑弹。',
                'A Lilac flower given to you by a Mithra when you defeated her. Apparently, this type was her favorite.': '你击败猫人后得到的一朵丁香花。据说这是她最喜欢的花。',
                'Taken from the destroyed remains of a Dalek shell.': '从被摧毁的戴立克外壳残骸中取下。',
                'Given to you by Konata when you defeated her. It smells of Timotei.': '你击败此方后她交给你的，闻起来有 Timotei 的味道。',
                'Given to you by Mikuru when you defeated her. If you wear it, keep it to yourself.': '你击败实玖瑠后她交给你的。如果你要穿，请自己偷偷穿。',
                'Given to you by Ryouko when you defeated her. You decided to name it Achakura, for no particular reason.': '你击败凉子后她交给你的。你莫名其妙决定把它命名为阿虚拉。',
                'Given to you by Yuki when you defeated her. She looked better without them anyway.': '你击败有希后她交给你的。反正她不戴眼镜看起来更好看。',
                'A plain black 100% cotton T-Shirt. On the front, an inscription in white letters reads: "I defeated Real Life, and all I got was this lousy T-Shirt."': '一件纯黑色 100% 棉 T 恤。正面白字写着：“我打败了现实人生，结果只拿到这件破 T 恤。”',
                'A sapling from Yggdrasil, the World Tree.': '来自世界树尤克特拉希尔的树苗。',
                'An Invisible Pink Unicorn Horn taken from the Invisible Pink Unicorn. It doesn\'t weigh anything and has the consistency of air, but you\'re quite sure it\'s real.': '从隐形粉红独角兽身上取得的角。它毫无重量、触感如空气，但你十分确定它真实存在。',
                'A nutritious pasta-based appendage from the Flying Spaghetti Monster.': '来自飞天意面神的一条营养丰富的面条触手。',
                'You can exchange this token for the chance to face a legendary monster by itself in the Ring of Blood.': '你可以用这枚令牌换取一次在浴血擂台单挑传奇怪物的机会。',
                'You can use this token to unlock monster slots in the Monster Lab, as well as to upgrade your monsters' : '你可以用这枚令牌解锁怪物实验室中的怪物槽位，以及升级你的怪物能力。',
                'The core of a legendary weapon. Contains the power to improve a weapon beyond its original potential.' : '一件传奇武器的核心。含有提升一件武器原始潜能的力量。',
                'The core of a peerless weapon. Contains the power to improve a weapon beyond its original potential.' : '一件无双武器的核心。蕴含着将武器提升至超越其原有潜力的力量。',
                'The core of a legendary staff. Contains the power to improve a staff beyond its original potential.' : '一件传奇法杖的核心。含有提升一件法杖原始潜能的力量。',
                'The core of a peerless staff. Contains the power to improve a staff beyond its original potential.' : '一件无双法杖的核心。蕴含着将法杖提升至超越其原有潜力的力量。',
                'The core of a legendary armor. Contains the power to improve an armor piece or shield beyond its original potential.' : '一件传奇护甲的核心。含有提升一件护甲或者盾牌原始潜能的力量。',
                'The core of a peerless armor. Contains the power to improve an armor piece or shield beyond its original potential.' : '一件无双护甲的核心。蕴含着将护甲或盾牌提升至超越其原有潜力的力量。',
                'Used to power Featherweight Charms.': '用于为羽毛护符供能。',
                'Used to power Voidseeker Charms.': '用于为虚空护符供能。',
                'Used to power Aether Charms.': '用于为以太护符供能。',
                'A protective pouch that will prevent a charm from tearing when you are defeated in battle. Low chance of being destroyed if it takes damage.': '保护袋可在你战败时防止护符撕裂。受到伤害时仅有较低概率损毁。',
                'A protective pouch that will prevent a charm from tearing when you are defeated in battle. Indestructible.': '保护袋可在你战败时防止护符撕裂。不可损毁。',
                'Used to imbue equipment with a charm.': '用于给装备附加护符。',
                //小马
               'A 1/10th scale figurine of Twilight Sparkle, the cutest, smartest, all-around best pony. According to Pinkie Pie, anyway.' : 'NO.1 暮光闪闪的 1/10 比例缩放公仔。最可爱、最聪明，最全能的小马。(根据萍琪的说法，嗯…) ',
                'A 1/10th scale figurine of Rainbow Dash, flier extraordinaire. Owning this will make you about 20% cooler, but it probably took more than 10 seconds to get one.' : 'NO.2 云宝黛西的 1/10 比例缩放公仔。杰出的飞行员。拥有这个公仔可以让你多酷大约 20%，但为了得到她你得多花 10 秒！ ',
                'A 1/10th scale figurine of Applejack, the loyalest of friends and most dependable of ponies. Equestria\'s best applebucker, and founder of Appleholics Anonymous.' : 'NO.3 苹果杰克的 1/10 比例缩放公仔。最忠诚的朋友，最可靠的小马。阿奎斯陲亚最好的苹果采收员，同时也是苹果农庄的创始马。 ',
                'A 1/10th scale figurine of Fluttershy, resident animal caretaker. You\'re going to love her. Likes baby dragons; Hates grown up could-eat-a-pony-in-one-bite dragons.' : 'NO.4 小蝶的 1/10 比例缩放公仔。小马镇动物的褓姆，大家都喜爱她。喜欢幼龙；讨厌能一口吞掉小马的大龙。 ',
                'A 1/10th scale figurine of Pinkie Pie, a celebrated connoisseur of cupcakes and confectioneries. She just wants to keep smiling forever.' : 'NO.5 萍琪派的 1/10 比例缩放公仔。一位著名的杯子蛋糕与各式饼干糖果的行家。她只想让大家永远保持笑容。 ',
                'A 1/10th scale figurine of Rarity, the mistress of fashion and elegance. Even though she\'s prim and proper, she could make it in a pillow fight.' : 'NO.6 瑞瑞的 1/10 比例缩放公仔。时尚与品味的的女主宰。她总是能在枕头大战中保持拘谨矜持。 ',
                'A 1/10th scale figurine of The Great and Powerful Trixie. After losing her wagon, she now secretly lives in the Ponyville library with her girlfriend, Twilight Sparkle.' : 'NO.7 崔克茜的 1/10 比例缩放公仔。伟大的、法力无边的崔克茜。失去她的篷车后，她现在偷偷的与她的女友暮光闪闪住在小马镇的图书馆中。 ',
                'A 1/10th scale figurine of Princess Celestia, co-supreme ruler of Equestria. Bored of the daily squabble of the Royal Court, she has recently taken up sock swapping.' : 'NO.8 塞拉斯蒂亚公主的 1/10 比例缩放公仔。阿奎斯陲亚大陆的最高统治者。对每日的皇家争吵感到无聊，她近日开始穿上不成对的袜子。 ',
                'A 1/10th scale figurine of Princess Luna, aka Nightmare Moon. After escaping her 1000 year banishment to the moon, she was grounded for stealing Celestia\'s socks.' : 'NO.9 露娜公主的 1/10 比例缩放公仔。又名梦靥之月。在结束了一千年的放逐后，她从月球回到阿奎斯陲亚偷走了塞拉斯提娅的袜子。 ',
                'A 1/10th scale figurine of Apple Bloom, Applejack\'s little sister. Comes complete with a \"Draw Your Own Cutie Mark\" colored pencil and permanent tattoo applicator set.' : 'NO.10 小苹花的 1/10 比例缩放公仔。苹果杰克的小妹。使用了“画出妳自己的可爱标志”彩色铅笔与永久纹身组后，生命更加的完整了。 ',
                'A 1/10th scale figurine of Scootaloo. Die-hard Dashie fanfilly, best pony of the Cutie Mark Crusaders, and inventor of the Wingboner Propulsion Drive. 1/64th chicken.' : 'NO.11 飞板璐的 1/10 比例缩放公仔。云宝黛西的铁杆年轻迷妹，可爱标志十字军中最棒的小马，以及蠢翅动力推进系统的发明者。有 1/64 的组成成分是鲁莽。 ',
                'A 1/10th scale figurine of Sweetie Belle, Rarity\'s little sister. Comes complete with evening gown and cocktail dress accessories made of 100% Dumb Fabric.' : 'NO.12 甜贝儿的 1/10 比例缩放公仔。瑞瑞的小妹。在穿上 100% 蠢布料制成的晚礼服与宴会短裙后更加完美了。 ',
                'A 1/10th scale figurine of Big Macintosh, Applejack\'s older brother. Famed applebucker and draft pony, and an expert in applied mathematics.' : 'NO.13 大麦克的 1/10 比例缩放公仔。苹果杰克的大哥。有名的苹果采收员和大力马，同时也是实用数学的专家。 ',
                'A 1/10th scale figurine of Spitfire, team leader of the Wonderbolts. Dashie\'s idol and occasional shipping partner. Doesn\'t actually spit fire.' : 'NO.14 飞火的 1/10 比例缩放公仔。惊奇闪电的领导者。云宝黛西的偶像和临时飞行搭档。实际上不会吐火。 ',
                'A 1/10th scale figurine of Derpy Hooves, Ponyville\'s leading mailmare. Outspoken proponent of economic stimulus through excessive muffin consumption.' : 'NO.15 小呆的 1/10 比例缩放公仔。小马镇上重要的邮差马。直言不讳的主张以大量食用马芬的方式来刺激经济。 ',
                'A 1/10th scale figurine of Lyra Heartstrings. Features twenty-six points of articulation, replaceable pegasus hoofs, and a detachable unicorn horn.' : 'NO.16 天琴心弦的 1/10 比例缩放公仔。拥有 26 个可动关节，可更换的飞马蹄与一个可拆卸的独角兽角是其特色。 ',
                'A 1/10th scale figurine of Octavia. Famous cello musician; believed to have created the Octatonic scale, the Octahedron, and the Octopus.' : 'NO.17 奥塔维亚的 1/10 比例缩放公仔。著名的大提琴家；据信创造了八度空间、八面体以及章鱼。 ',
                'A 1/10th scale figurine of Zecora, a mysterious zebra from a distant land. She\'ll never hesitate to mix her brews or lend you a hand. Err, hoof.' : 'NO.18 泽科拉的 1/10 比例缩放公仔。一位来自远方的神秘斑马。她会毫不迟疑的搅拌她的魔药或助你一臂之力。呃，我是说一蹄之力… ',
                'A 1/10th scale figurine of Cheerilee, Ponyville\'s most beloved educational institution. Your teachers will never be as cool as Cheerilee.' : 'NO.19 车厘子的 1/10 比例缩放公仔。小马镇最有爱心的教育家。你的老师绝对不会像车厘子这么酷的！ ',
                'A 1/10th scale bobblehead figurine of Vinyl Scratch, the original DJ P0n-3. Octavia\'s musical rival and wub wub wub interest.' : 'NO.20 维尼尔的 1/10 比例缩放摇头公仔。是 DJ P0n-3 的本名。为奥塔维亚在音乐上的对手，喜欢重低音喇叭。 ',
                'A 1/10th scale figurine of Daring Do, the thrill-seeking, action-taking mare starring numerous best-selling books. Dashie\'s recolor and favorite literary character.' : 'NO.21 无畏天马的 1/10 比例缩放公仔。追寻刺激，有如动作片主角一般的小马，为一系列畅销小说的主角。是云宝黛西最喜欢的角色，也是带领她进入阅读世界的原因。 ',
                'A 1/10th scale figurine of Doctor Whooves. Not a medical doctor. Once got into a hoof fight with Applejack over a derogatory remark about apples.' : 'NO.22 神秘博士的 1/10 比例缩放公仔。不是医生。曾经与苹果杰克陷入一场因贬低苹果的不当发言而产生的蹄斗。 ',
                'A 1/10th scale figurine of Berry Punch. Overly protective parent pony and Ponyville\'s resident lush. It smells faintly of fruit wine.' : 'NO.23 酸梅酒的 1/10 比例缩放公仔。有过度保护倾向的小马，也是小马镇的万年酒鬼。闻起来有淡淡水果酒的气味。 ',
                'A 1/10th scale figurine of Bon-Bon. Usually seen in the company of Lyra. Suffers from various throat ailments that make her sound different every time you see her.' : 'NO.24 糖糖的 1/10 比例缩放公仔。常常被目击与天琴心弦在一起。患有许多呼吸道相关的疾病，使你每次遇到她的时候她的声音都不同。 ',
                'A 1/10th scale fluffy figurine of Fluffle Puff. Best Bed Forever.' : 'NO.25 毛毛马的 1/10 比例缩放的毛茸茸玩偶。让你想要永远躺在上面。 ',
                'A lifesize figurine of Angel Bunny, Fluttershy\'s faithful yet easily vexed pet and life partner. All-purpose assistant, time keeper, and personal attack alarm.' : 'NO.26 天使兔的等身大玩偶。为小蝶忠实且易怒的宠物及伴侣。万能助理、报时器、受到人身攻击时的警报器。 ',
                'A lifesize figurine of Gummy, Pinkie Pie\'s faithful pet. Usually found lurking in your bathtub. While technically an alligator, he is still arguably the best pony.' : 'NO.27 嘎米的等身大玩偶。是萍琪的忠实宠物。经常被发现潜伏在你的浴缸里。虽然技术上是只短吻鳄，但它仍然可以称得上是最棒的小马。 ',
                },
            consumableTooltip: {
                'Provides a long-lasting health restoration effect.': '持续回复一定量的生命，持续 50 回合。',
                'Instantly restores a large amount of health.': '立刻回复大量生命。',
                'Fully restores health, and grants a long-lasting health restoration effect.': '生命值全满，并获得长效生命回复效果，持续 100 回合。',
                'Provides a long-lasting mana restoration effect.': '持续回复一定量的法力，持续 50 回合。',
                'Instantly restores a moderate amount of mana.': '立刻回复一定量的法力。',
                'Fully restores mana, and grants a long-lasting mana restoration effect.': '法力值全满，并获得长效法力回复效果，持续 100 回合。',
                'Provides a long-lasting spirit restoration effect.': '持续回复一定量的灵力，持续 50 回合。',
                'Instantly restores a moderate amount of spirit.': '立刻回复一定量的灵力。',
                'Fully restores spirit, and grants a long-lasting spirit restoration effect.': '灵力值全满，并获得长效灵力回复效果，持续 100 回合。',
                'Fully restores all vitals, and grants long-lasting restoration effects.': '生命、法力、灵力全部回满，并同时获得三种长效回复效果，持续 100 回合。',
                'Restores 10 points of Stamina, up to the maximum of 99. When used in battle, also boosts Overcharge and Spirit by 10% for ten turns.': '恢复 10 点精力，最高不超过 99。战斗中使用时，还会使斗气和灵力提高 10%，持续 10 回合。',
                'Restores 5 points of Stamina, up to the maximum of 99. When used in battle, also boosts Overcharge and Spirit by 10% for five turns.': '恢复 5 点精力，最高不超过 99。战斗中使用时，还会使斗气和灵力提高 10%，持续 5 回合。',
                'There are three flowers in a vase. The third flower is green.': '攻击伤害、魔法伤害提升 25%，命中率、暴击率、闪避率、抵抗率大幅提升，持续 50 回合。',
                'It is time to kick ass and chew bubble-gum... and here is some gum.': '攻击和魔法伤害提升 100%，必定命中且必定暴击，持续 50 回合。',
                'You gain +25% resistance to Fire elemental attacks and do 25% more damage with Fire magicks.': '获得 +25% 火焰抗性，并使火焰魔法伤害提高 25%。',
                'You gain +25% resistance to Cold elemental attacks and do 25% more damage with Cold magicks.': '获得 +25% 冰冷抗性，并使冰冷魔法伤害提高 25%。',
                'You gain +25% resistance to Elec elemental attacks and do 25% more damage with Elec magicks.': '获得 +25% 闪电抗性，并使闪电魔法伤害提高 25%。',
                'You gain +25% resistance to Wind elemental attacks and do 25% more damage with Wind magicks.': '获得 +25% 疾风抗性，并使疾风魔法伤害提高 25%。',
                'You gain +25% resistance to Holy elemental attacks and do 25% more damage with Holy magicks.': '获得 +25% 神圣抗性，并使神圣魔法伤害提高 25%。',
                'You gain +25% resistance to Dark elemental attacks and do 25% more damage with Dark magicks.': '获得 +25% 黑暗抗性，并使黑暗魔法伤害提高 25%。',
                'Grants the Haste effect.': '获得加速效果，持续 100 回合。',
                'Grants the Protection effect.': '获得保护效果，持续 100 回合。',
                'Grants the Haste and Protection effects with twice the normal duration.': '获得加速和保护效果，持续时间为通常的两倍。',
                'Grants the Absorb effect.': '获得吸收效果，持续 100 回合。',
                'Grants the Shadow Veil effect.': '获得影纱效果，持续 100 回合。',
                'Grants the Spark of Life effect.': '获得生命火花效果，持续 100 回合。',
                'Grants the Absorb, Shadow Veil and Spark of Life effects with twice the normal duration.': '同时获得吸收、影纱和生命火花效果，持续时间为通常的两倍。',
            },
            shrine: {
                'Welcome to Snowflake\'s Shrine.': '欢迎来到雪花祭坛。',
                'Here you can make an offering to Snowflake, the Goddess of Loot and Harvest. Snowflake will grant you various boons depending on your offering.': '你可以向掌管战利品与收获的女神雪花献祭。雪花会根据祭品赐予你不同恩惠。',
                'Select a trophy, artifact or collectible to continue.': '请选择奖杯、文物或收藏品以继续。',
                '/You have\\s*([\\d,]+)\\s*\\/\\s*([\\d,]+)\\s*items required for this offering\\./': '本次献祭所需物品：$1 / $2。',
                'Artifacts can be exchanged for a random reward.': '文物可以兑换随机奖励。',
                'Depending on your luck and earlier rewards, you can get one of the following:': '根据你的运气和此前奖励，你可能得到以下之一：',
                'Some Hath': '一些 Hath',
                'A bunch of crystals': '一批水晶',
                'Some rare consumables': '一些稀有消耗品',
                'A permanent +1 bonus to a primary stat': '主属性永久 +1',
                'You cannot currently receive more than +41 to any primary stat. This increases by one for every tenth level. Gaining primary stats in this way will not increase how much EXP your next point costs.': '你当前任一主属性通过此方式最多只能获得 +41。每提升 10 级上限增加 1。用这种方式获得主属性不会提高下一点属性所需 EXP。',
                'Trophies can be exchanged for a piece of equipment.': '奖杯可以兑换一件装备。',
                'The quality and tier of the item depends on the trophy you offer. You can select the major class of the item being granted from the list below.': '装备品质与等级取决于你献上的奖杯。你可以从下方列表选择将获得装备的大类。',
                '/You have handed in ([\\d,]+) credits worth of trophies\\./': '你已上交价值 $1 的奖杯。',
                'Collectibles can be exchanged for a random selection of bindings and materials.': '收藏品可以兑换随机的绑定材料与普通材料。',
                '/Offer\\s+(\\d+)x\\s+(.+?)\\s+for\\s*:/': '献祭 $1x $2 以换取：',
                'Snowflake has blessed you with an item!': '雪花赐予了你一件物品！',
                '/^\\(Salvaged it for\\s*(\\d+)x\\s*(.+)\\)$/': '（已将其分解为 $1x $2）',
                '/^\\(Sold the remains for\\s*([\\d,]+)\\s*credits\\)$/': '（已将残骸出售为 $1 Credits）',
                'Hit Space Bar to offer another item like this.': '按空格键继续献祭同类物品。',
            },
            battleTooltip: {
                'Choose from the Battle Actions highlighted above, and use them to defeat your enemies listed to the right. When all enemies are reduced to zero Health, you win. If your Health reaches zero, you are defeated.': '选择上方高亮的战斗行动来击败右侧敌人。所有敌人的生命降为零时，你将获胜；你的生命降为零时，你将战败。',
                'Run away from the current battle.': '从当前战斗中逃跑。',
                'Fleeing': '逃跑',
                'You are running away.': '你正在逃跑。',
                'You have been blessed by the RiddleMaster. Your attack and magic damage are temporarily increased by 10%.': '你获得了谜题大师的祝福。你的攻击和魔法伤害暂时提高 10%。',
                'You are channeling the mystic forces of the ever-after. Your next spell is powered up by 50%, costs no MP, and cannot be resisted.': '你正在引导彼岸的奥秘力量。你的下一次法术伤害提高 50%，不消耗法力，且无法被抵抗。',
                'Retrieve data on the target.': '获取目标资料。',
                'Massive AoE damage to all enemies on the battlefield.' : '对战场上所有的敌人造成虚空伤害。',
                'Damages and temporarily staggers all enemies on the battlefield.' : '对战场上所有的敌人造成虚空伤害并导致其晕眩 5 回合。',
                'A precision strike towards the sensory organs of your enemy inflicts massive damage and temporarily blinds it.': '对敌人的感官器官发动精准打击，造成大量伤害并暂时致盲。',
                'Does additional damage to blinded targets.': '对致盲目标造成额外伤害。',
                'Hits up to five targets multiple times.': '对最多五个目标发动多次打击。',
                'Focus your magical power into your staff for a precision strike towards the head of your enemy, causing major damage and stunning it.': '将魔力集中到法杖中，对敌人头部发动精准打击，造成大量伤害并使其眩晕。',
                'Focus a powerful strike on a single enemy.': '对单个敌人发动强力打击。',
                'Tears through enemy defenses, leaving them vulnerable for followup attacks.': '撕开敌人的防御，使其容易受到后续攻击。',
                'A mighty swing with your weapon causes all enemies with penetrated armor to stagger.': '挥出强力一击，所有护甲被击穿的敌人都会踉跄后退。',
                'Bash an enemy with your shield to stun it, which opens up for devastating strikes with your weapon.': '用盾牌猛击敌人并使其眩晕，为武器的毁灭性打击创造机会。',
                'Channels the power of the heavens for a powerful strike that causes massive carnage.': '引动天穹之力，发动毁灭性打击，造成巨量杀伤。',
                'Follow up with an attack that inflicts internal bleeding and causes a large amount of damage if target is stunned.': '进行追击；若目标处于眩晕状态，则造成内出血并造成大量伤害。',
                'Finish off a mortally wounded enemy. Instantly kills a target with bleed and less than 25% health.': '终结重伤敌人。立即击杀带有流血且生命低于 25% 的目标。',
                'A ball of fire is hurled at the target.': '向目标投掷一团火球。',
                'Unleashes an inferno of flames on all hostile targets, causing Fire damage.': '向所有敌对目标释放地狱之火，造成火焰伤害。',
                'Cold damage.': '造成冰冷伤害。',
                'A bolt of lightning strikes the target, causing Elec damage.': '一道闪电击中目标，造成闪电伤害。',
                'A blast of wind hits the target, causing Wind damage.': '一阵疾风击中目标，造成疾风伤害。',
                'Holy damage.': '造成神圣伤害。',
                'Dark damage.': '造成黑暗伤害。',
                'Elec damage.': '造成闪电伤害。',
                'Wind damage.': '造成疾风伤害。',

                'Inflicts Drain on one target, causing damage over time.': '对一个目标施加吸取，造成持续伤害。',
                'The target is weakened, making it deal less damage, and preventing it from scoring critical hits.': '削弱目标，使其造成更少伤害，并防止其打出暴击。',
                'The target is imperiled, reducing physical and magical mitigation as well as elemental mitigations.': '使目标陷危，降低物理、魔法以及元素减伤。',
                'The target is slowed by 30%, making it attack less frequently.': '使目标迟缓 30%，降低其攻击频率。',
                'The target is lulled to sleep, preventing it from taking any actions.': '使目标进入睡眠，无法采取任何行动。',
                'Immobilize the target, making it unable to evade attacks or spells.': '定住目标，使其无法闪避攻击或法术。',
                'Confuses the target, making it lunge out wildly and strike friends and foes alike.': '使目标混乱，使其胡乱冲撞并同时攻击敌我双方。',
                'Blinds the target, reducing the chance of it landing attacks and hitting with magic spells.': '致盲目标，降低其攻击和法术命中几率。',
                'The target is silenced, preventing it from using special attacks and magic.': '沉默目标，使其无法使用特殊攻击和魔法。',
                'Restores a moderate amount of Health on the target.': '为目标恢复中量生命。',
                'Places a heal over time effect on the target.': '为目标施加持续治疗效果。',
                'Fully restores the Health of the target.' : '使目标恢复全部生命值。',
                'Places a shield effect on the target, absorbing 25% of the damage from all attacks.': '为目标施加护盾效果，吸收所有攻击 25% 的伤害。',
                'Speeds up all actions of the target, allowing it to attack more frequently.': '加快目标的所有行动，使其更频繁地攻击。',
                'Surrounds the target with a veil of shadows, making it harder to hit with attacks and spells.': '以影纱环绕目标，使其更难被攻击和法术命中。',
                'This protective veil activates for powerful blows that damage more than 50% of your max HP, absorbing the remainder as spirit damage.': '这个保护罩会在对你造成超过 50% 最大生命值伤害的强力攻击时激活，将剩余伤害转为灵力伤害吸收。',
                'The next magical attack against the target has a chance to be absorbed and partially converted to MP.': '目标受到的下一次魔法攻击有几率被吸收，并部分转化为法力。',
                '(Scroll) The next magical attack against the target will be absorbed and partially converted to MP.': '（卷轴）目标受到的下一次魔法攻击将被吸收，并部分转化为法力。',
                'Any attack that would one-shot a target with more than 1 HP leaves it alive but on the brink of defeat. The buff is removed when triggered.': '任何会秒杀生命大于 1 的目标的攻击，都会使其濒死但存活。触发后该增益会移除。',
                'Powerful attacks against you will be partially absorbed and damage your spirit gauge instead of health.': '针对你的强力攻击会被部分吸收，并改为损伤灵力槽而非生命。',
                'The target attains a higher level of attunement with the arcane forces, increasing spell and crit damage.': '目标与奥术力量达到更高调谐，提高法术伤害和暴击伤害。',
                'Mystical energies have converged on this target. Striking it with any magic spell will consume only half the normal mana.': '神秘能量汇聚在该目标身上。用任意魔法咒语攻击它只会消耗正常法力的一半。',
                'You are absorbing magicks from shattering the Coalesced Mana surrounding a target.': '你正在吸收击碎目标周围法力合流时释放的魔力。',
                'You have reached a high level of attunement with the arcane forces, increasing your spell damage and crit multiplier by 25%.': '你与奥术力量达到高度调谐，法术伤害和暴击倍率提高 25%。',
                'You are generating additional Overcharge and Spirit.': '你正在额外生成斗气和灵力。',
                'Your attack/magic damage, attack/magic accuracy and evade/resist chance increases significantly for a short time.': '短时间内大幅提高攻击/魔法伤害、攻击/魔法命中以及闪避/抵抗几率。',
                'Your attacks and spells deal twice as much damage for a short time, will always hit, and will always land critical hits.': '短时间内你的攻击和法术造成双倍伤害，必定命中且必定暴击。',
                'The Mana Restorative is replenishing your magic reserves.': '法力回复品正在补充你的法力储备。',
                'The Health Restorative is regenerating your body.': '生命回复品正在恢复你的身体。',
                'The Spirit Restorative is refreshing your spirit.': '灵力回复品正在恢复你的灵力。',
                'The holy effects of the spell are restoring your body.': '该法术的神圣效果正在恢复你的身体。',
                'You have been blessed by the RiddleMaster. Your attack and magic damage are temporarily increased by 20%.': '你获得了谜题大师的祝福。你的攻击和魔法伤害暂时提高 20%。',
                'You are able to see the flow of life in all living beings, increasing your attack damage and crit multiplier by 25%.': '你能够看清一切生灵的生命流动，使攻击伤害和暴击倍率提高 25%。',
                'The target attains intimate knowledge of the flow of life in all living beings, increasing attack and crit damage.': '目标洞悉一切生灵的生命流动，提高攻击伤害和暴击伤害。',
                'Increases attack damage by 15% and attack accuracy by 50%. Also grants a 20% chance per stack to overwhelm enemy parry.': '攻击伤害提高 15%，攻击命中提高 50%。每层还会提供 20% 几率压制敌人的招架。',
                'The armor of this target has been breached, reducing its physical defenses.': '目标的护甲已被击穿，物理防御降低。',
                'A powerful blow has temporarily stunned this target.': '强力打击暂时眩晕了该目标。',
                'Permanent until triggered' : '直到触发前将会一直有效',
                '/Expires in\\s*(\\d+)\\s*turns?\\./': '$1 回合后结束。',
                '/Decays by\\s*([\\d.]+%)\\s*per turn\\./': '每回合衰减 $1。',
                'Expires if magic is depleted to below 10%.': '法力降至 10% 以下时失效。',
                '/Requires\\s*(\\d+)\\s*Charges? to use\\. Cooldown:\\s*(\\d+)\\s*turns?\\./': '需要 $1 点充能才能使用。冷却：$2 回合。',
                '/Requires\\s*(\\d+)\\s*Magic Points? to use\\. Cooldown:\\s*(\\d+)\\s*turns?\\./': '需要 $1 点法力才能使用。冷却：$2 回合。',
                '/Requires\\s*(\\d+)\\s*Magic Points? to use\\./': '需要 $1 点法力才能使用。',                       'Damages a single enemy. Depending on your equipped weapon, this can place certain status effects on the affected monster. To attack, click here, then click your target. Simply clicking an enemy will also perform a normal attack.': '对单个敌人造成伤害。根据你装备的武器，这可能会对受影响的怪物施加特定状态效果。要发起攻击，请点击此处，然后点击你的目标。直接点击敌人也会进行普通攻击。',
                'Use special skills and magic. To use offensive spells and skills, first click it, then click your target. To use it on yourself, click it twice.': '使用技能和魔法。要施放攻击性法术和技能，请先点击它，再点击你的目标。若要对自身使用，请双击它。',
                'Use various consumable items that can replenish your vitals or augment your power in various ways.': '使用各种消耗品，它们能以多种方式补充你的生命值或增强你的力量。',
                'Increases your defensive capabilities for the next turn.': '提升你在下一回合的防御能力。',
                'Toggle Spirit Channeling.': '切换灵动架势。',
                'Reduces the chance that your next spell will be resisted. Your defenses and evade chances are lowered for the next turn.': '降低你下一个法术被抵抗的几率。你的防御和闪避几率将在下一回合降低。',
                'You are defending from enemy blows. The amount of damage you take is reduced by 25%.': '你正在防御敌人的攻击。你受到的伤害降低 25%。',
                'You are mentally prepared for casting a magical attack. The chance for your spell being evaded or resisted is reduced, but so is your chance to avoid attacks.': '你正在集中精神准备施放魔法攻击。你的法术被闪避或抵抗的几率降低，但你回避攻击的几率也会降低。',
                'The target has been hastened, increasing its action speed by 25%.': '目标已被加速，行动速度提高 25%。',
                '(Scroll) The target has been hastened, increasing its action speed by 60%.': '（卷轴）目标已被加速，行动速度提高 60%。',
                '(Scroll) Places a shield effect on the target, absorbing 50% of the damage from all attacks.': '（卷轴）为目标施加护盾效果，吸收所有攻击 50% 的伤害。',
                '(Scroll) A veil of shadows surround the target, causing monsters to occasionally whiff, and boosting Evade by 25%.': '（卷轴）影纱环绕目标，使怪物偶尔打空，并提高 25% 闪避。',
                'A veil of shadows surround the target, causing monsters to occasionally whiff, and boosting Evade by 10%.': '影纱环绕目标，使怪物偶尔打空，并提高 10% 闪避。',
                'Any attack that would normally kill the target leaves it alive with a small amount of HP. The buff is removed when triggered.': '任何通常会杀死目标的攻击都会使其保留少量生命。触发后该增益会移除。',
                '(Scroll) Any attack that would normally kill the target leaves it alive with 50% HP. The buff is removed when triggered.': '（卷轴）任何通常会杀死目标的攻击都会使其保留 50% 生命。触发后该增益会移除。',
                'The air around the target has been upset, blowing up dust and increasing its miss chance. Elec resistance is lowered.': '目标周围的气流被扰乱，扬起尘土并提高其未命中几率。闪电抗性降低。',
                'Gashing wounds are making this target take damage over time.': '撕裂伤使该目标持续受到伤害。',
                'The skin of the target has been scorched, inhibiting its attack damage. Cold resistance is lowered.': '目标皮肤被灼伤，攻击伤害降低。冰冷抗性降低。',
                'The limbs of the target have been frozen, causing slower movement. Wind resistance is lowered.': '目标四肢被冻结，行动变慢。疾风抗性降低。',
                'Internal damage causes slower reactions and lowers evade and resist chance. Fire resistance is lowered.': '内部损伤使反应变慢，并降低闪避和抵抗几率。火焰抗性降低。',
                
        
            },
            ability: {
                'Increases your maximum HP. This adds 10% to your total HP per tier.': '提高你的最大生命值。每级额外增加总生命值的 10%。',
                'Increases your maximum MP. This adds 10% to your total MP per tier.': '提高你的最大法力值。每级额外增加总法力值的 10%。',
                'Increases your maximum SP. This adds 10% to your total SP per tier.': '提高你的最大灵力值。每级额外增加总灵力值的 10%。',
                'Improves the overall potency of common health restoratives.': '提高常规生命回复品的整体效果。',
                'Improves the overall potency of common mana restoratives.': '提高常规法力回复品的整体效果。',
                'Improves the overall potency of common spirit restoratives.': '提高常规灵力回复品的整体效果。',
                'Increases your damage when using the One-Handed fighting style, scaling with your proficiency.': '使用单手战斗风格时提高伤害，效果随熟练度提升。',
                'Increases your accuracy when using the One-Handed fighting style, scaling with your proficiency.': '使用单手战斗风格时提高命中，效果随熟练度提升。',
                'Increases your block when using the One-Handed fighting style, scaling with your proficiency.': '使用单手战斗风格时提高格挡，效果随熟练度提升。',
                'Increases your damage when using the Two-Handed or Niten fighting style, scaling with your proficiency.': '使用双手或二天一流战斗风格时提高伤害，效果随熟练度提升。',
                'Increases your accuracy and damage when using the Two-Handed fighting style, scaling with your proficiency.': '使用双手战斗风格时提高命中和伤害，效果随熟练度提升。',
                'Increases your parry and block when using the Two-Handed or Niten fighting style, scaling with your proficiency.': '使用双手或二天一流战斗风格时提高招架和格挡，效果随熟练度提升。',
                'Increases your damage when using the Dual-Wielding fighting style, scaling with your proficiency.': '使用双持战斗风格时提高伤害，效果随熟练度提升。',
                'Increases your accuracy when using the Dual-Wielding or Niten fighting style, scaling with your proficiency.': '使用双持或二天一流战斗风格时提高命中，效果随熟练度提升。',
                'Increases your critical damage when using the Dual-Wielding or Niten fighting style, scaling with your proficiency.': '使用双持或二天一流战斗风格时提高暴击伤害，效果随熟练度提升。',
                'Increases your damage when using the Staff fighting style, scaling with your proficiency.': '使用法杖战斗风格时提高伤害，效果随熟练度提升。',
                'Increases your attack and magic accuracy when using the Staff fighting style, scaling with your proficiency.': '使用法杖战斗风格时提高攻击命中和魔法命中，效果随熟练度提升。',
                'Increases your spell damage when using the Staff fighting style, scaling with your proficiency.': '使用法杖战斗风格时提高法术伤害，效果随熟练度提升。',
                'Increases your maximum MP when using only cloth armor, scaling with your proficiency.': '只穿布甲时提高最大法力，效果随熟练度提升。',
                'Increases your spell accuracy when using only cloth armor, scaling with your proficiency.': '只穿布甲时提高法术命中，效果随熟练度提升。',
                'Increases your spell casting speed when using only cloth armor, scaling with your proficiency.': '只穿布甲时提高施法速度，效果随熟练度提升。',
                'Increases your spell critical damage when using only cloth armor, scaling with your proficiency.': '只穿布甲时提高法术暴击伤害，效果随熟练度提升。',
                'Increases your attack accuracy when using mostly light armor, scaling with your proficiency.': '主要穿着轻甲时提高攻击命中，效果随熟练度提升。',
                'Increases your attack crit damage when using mostly light armor, scaling with your proficiency.': '主要穿着轻甲时提高攻击暴击伤害，效果随熟练度提升。',
                'Increases your attack speed when using mostly light armor, scaling with your proficiency.': '主要穿着轻甲时提高攻击速度，效果随熟练度提升。',
                'Increases your maximum HP and MP when using mostly light armor, scaling with your proficiency.': '主要穿着轻甲时提高最大生命和法力，效果随熟练度提升。',
                'Increases your crushing mitigation when using mostly heavy armor, scaling with your proficiency.': '主要穿着重甲时提高打击减伤，效果随熟练度提升。',
                'Increases your piercing mitigation when using mostly heavy armor, scaling with your proficiency.': '主要穿着重甲时提高刺击减伤，效果随熟练度提升。',
                'Increases your slashing mitigation when using mostly heavy armor, scaling with your proficiency.': '主要穿着重甲时提高斩击减伤，效果随熟练度提升。',
                'Increases your maximum HP when using mostly heavy armor, scaling with your proficiency.': '主要穿着重甲时提高最大生命，效果随熟练度提升。',
                'Increase the healing power and decrease the cooldown of the Cure spell.': '提高治疗的治疗量并缩短冷却时间。',
                'Increases the evade bonus granted by the Shadow Veil spell.': '提高影纱法术提供的闪避加成。',
                'Increases the mitigation bonuses granted by the Protect spell.': '提高保护法术提供的减伤加成。',
                'Increase the power and duration of the Regen spell.': '提高再生法术的效果与持续时间。',
                'Increases the action speed-up granted by the Haste spell.': '提高加速法术提供的行动速度加成。',
                'Heartseeker will further increase the damage of any critical melee hits.': '觅心者会进一步提高近战暴击造成的伤害。',
                'Decreases the amount of damage required to make Spirit Shield kick in, as well as how much spirit is consumed when it does.': '降低触发灵力盾所需承受的伤害，并减少触发时消耗的灵力。',
                'Increase the duration and decrease the cooldown of the Silence spell. Higher levels also increase the number of targets affected per cast.': '延长沉默法术的持续时间并缩短冷却时间。更高等级还会增加每次施法影响的目标数量。',
                'Increases the duration and damage decrease granted by Weaken.': '延长虚弱持续时间，并提高其降低伤害的效果。',
                'Decreases the casttime and cooldown of weaken. Higher levels also increase the number of targets affected per cast.': '缩短虚弱的施法时间和冷却时间。更高等级还会增加每次施法影响的目标数量。',
                'Increases the duration and defensive penalties caused by Imperil.': '延长陷危持续时间，并提高其造成的防御惩罚。',
                'Decreases the casttime and cooldown of Imperil. Higher levels also increase the number of targets affected per cast.': '缩短陷危的施法时间和冷却时间。更高等级还会增加每次施法影响的目标数量。',
                'Increase the duration and hit penalty caused by the Blind spell.': '延长致盲持续时间，并提高其造成的命中惩罚。',
                'Decreases the cooldown and casttime on the Blind spell. Higher levels also increase the number of targets affected per cast.': '缩短致盲法术的冷却时间和施法时间。更高等级还会增加每次施法影响的目标数量。',
                'Increase the duration and decrease the chance that Sleep and Confuse will break upon taking damage. Higher levels also increase the number of targets affected per cast.': '延长睡眠与混乱的持续时间，并降低其因受到伤害而解除的概率。更高等级还会增加每次施法影响的目标数量。',
                'Increase the duration and decrease the mana cost of the Spark of Life spell.': '延长生命火花的持续时间并降低法力消耗。',
                'Augments your Protection spell by adding wind elemental spikes. Additional levels increase your wind elemental resistance while the spell is active.': '为保护法术附加风元素尖刺。额外等级会在法术生效时提高你的风元素抗性。',
                'Decreases the cooldown and cast time on the Drain spell.': '缩短吸取法术的冷却时间和施法时间。',
                'Increases the amount of health drained by the Drain spell.': '提高吸取法术吸取的生命量。',
                'Increase the duration and power of the Slow spell. Higher levels also increase the number of targets affected per cast.': '延长迟缓持续时间并提高效果。更高等级还会增加每次施法影响的目标数量。',
                'Increase the duration of the Immobilize spell, and add a slowing effect. Higher levels increase the number of targets affected per cast, and reduces the cooldown of the spell.': '延长定身持续时间，并附加迟缓效果。更高等级会增加每次施法影响的目标数量，并缩短法术冷却时间。',
                'Augment the Drain spell with the ability to inflict Ether Theft on any target afflicted with Soul Fire.': '强化枯竭咒语，使其可对带有焚烧的灵魂的目标施加以太窃取。',
                'Augment the Drain spell with the ability to inflict Spirit Theft on any target afflicted with Ripened Soul.': '强化枯竭咒语，使其可对带有成熟的灵魂的目标施加灵力窃取。',
                'Increases the chance that Absorb will successfully nullify a hostile spell.': '提高吸收成功抵消敌对法术的几率。',
                'Arcane Focus will additionally increase the damage of any critical spell hits.': '奥术专注会额外提高法术暴击造成的伤害。',
                'Augments your Protection spell by adding fire elemental spikes. Additional levels increase your fire elemental resistance while the spell is active.': '为保护法术附加火元素尖刺。额外等级会在法术生效时提高你的火元素抗性。',
                'Augments your Protection spell by adding cold elemental spikes. Additional levels increase your cold elemental resistance while the spell is active.': '为保护法术附加冰元素尖刺。额外等级会在法术生效时提高你的冰元素抗性。',
                'Augments your Protection spell by adding elec elemental spikes. Additional levels increase your elec elemental resistance while the spell is active.': '为保护法术附加雷元素尖刺。额外等级会在法术生效时提高你的雷元素抗性。',
                'Increases damage and decreases cast time of all first-tier elemental spells.': '提高所有一阶元素法术的伤害，并缩短施法时间。',
                'Increases damage, and decreases cast time and cooldown of all second-tier elemental spells.': '提高所有二阶元素法术的伤害，并缩短施法时间和冷却时间。',
                'Increases damage, and decreases cast time and cooldown of all third-tier elemental spells.': '提高所有三阶元素法术的伤害，并缩短施法时间和冷却时间。',
                'Increases the maximum number of targets hit by fire elemental spells.': '提高火元素法术可命中的最大目标数。',
                'Increases the maximum number of targets hit by cold elemental spells.': '提高冰元素法术可命中的最大目标数。',
                'Increases the maximum number of targets hit by lightning elemental spells.': '提高雷元素法术可命中的最大目标数。',
                'Increases the maximum number of targets hit by wind elemental spells.': '提高风元素法术可命中的最大目标数。',
                'Augments your forbidden spells with the Ripened Soul proc, which damages the target over time and enables certain follow-up attacks. Higher levels increase the chance of the proc occurring.': '为黑暗咒语附加成熟的灵魂触发效果，使目标持续受伤并启用特定追击。更高等级会提高触发几率。',
                'Decreases cooldown and increases the maximum number of targets hit by the Corruption spell.': '缩短腐化法术冷却时间，并提高最大命中目标数。',
                'Decreases cooldown and increases the maximum number of targets hit by the Disintegrate spell.': '缩短崩解法术冷却时间，并提高最大命中目标数。',
                'Decreases cooldown and increases the maximum number of targets hit by the Ragnarok spell.': '缩短诸神黄昏法术冷却时间，并提高最大命中目标数。',
                'Imperil additionally reduces specific mitigation against Dark.': '陷危会额外降低目标的黑暗减伤。',
                'Augments your divine spells with the Soul Fire proc, which damages the target over time and enables certain follow-up attacks. Higher levels increase the chance of the proc occurring.': '为神圣咒语附加焚烧的灵魂触发效果，使目标持续受伤并启用特定追击。更高等级会提高触发几率。',
                'Decreases cooldown and increases the maximum number of targets hit by the Smite holy spell.': '缩短惩击神圣法术冷却时间，并提高最大命中目标数。',
                'Decreases cooldown and increases the maximum number of targets hit by the Banishment holy spell.': '缩短放逐神圣法术冷却时间，并提高最大命中目标数。',
                'Decreases cooldown and increases the maximum number of targets hit by the Paradise Lost holy spell.': '缩短失乐园神圣法术冷却时间，并提高最大命中目标数。',
                'Imperil additionally reduces specific mitigation against Holy.': '陷危会额外降低目标的神圣减伤。',
                'Direct Player Stat Modification': '玩家属性直接修正',
                'Proficiency-based Stat Modification': '熟练度加成修正',
                'Requires': '需要',
                '/\\band\\b/': '和',
                'Effects Modified:': '效果修正：',
                'Spells Modified:': '法术修正：',
                'Items Modified:': '物品修正：',
                'For every ten points of One-Handed Weapon Proficiency, adds:': '单手武器熟练度每 10 点，额外获得：',
                'For every ten points of Two-Handed Weapon Proficiency, adds:': '双手武器熟练度每 10 点，额外获得：',
                'For every ten points of Dual-Wielding Weapon Proficiency, adds:': '双持武器熟练度每 10 点，额外获得：',
                'For every ten points of Staff Weapon Proficiency, adds:': '法杖武器熟练度每 10 点，额外获得：',
                'For every ten points of Cloth Armor Proficiency, adds:': '布甲熟练度每 10 点，额外获得：',
                'For every ten points of Light Armor Proficiency, adds:': '轻甲熟练度每 10 点，额外获得：',
                'For every ten points of Heavy Armor Proficiency, adds:': '重甲熟练度每 10 点，额外获得：',
                'Changes effect duration to': '效果持续时间变更为',
                'Changes cast time to': '施法时间变更为',
                'Changes cooldown to': '冷却时间变更为',
                'Changes base mana cost to': '基础法力消耗变更为',
                'Changes base damage to': '基础数值变更为',
                'Changes max affected targets to': '最多影响目标变更为',
                'Additional Effect:': '额外效果：',
                'Added special effect:': '新增特殊效果：',
                'Added effect:': '新增效果：',
                'Increases Sleep Break Resistance to': '睡眠受伤解除抗性提高到',
                'Increases Confuse Break Resistance to': '混乱受伤解除抗性提高到',
                'Increases Damage Decrease to': '伤害降低提高到',
                'Increases Absorption Chance to': '吸收几率提高到',
                'Reduces Damage Threshold to': '伤害触发阈值降低到',
                'Multiplies HP Drain by': '生命吸取倍率变为',
                'turns': '回合',
                'turn': '回合',
                'Sleep, Confuse': '睡眠、混乱',
                'Storm Spikes': '风暴尖刺',
                'Vital Theft': '生命窃取',
                'Ether Theft': '法力窃取',
                'Spirit Theft': '灵力窃取',
                'Flame Spikes': '火焰尖刺',
                'Frost Spikes': '冰霜尖刺',
                'Shock Spikes': '闪电尖刺',
                'Conflagration': '火灾',
                'Fiery Blast, Freeze, Shockblast, Gale': '炎爆术(Ⅰ),冰冻(Ⅰ),电能爆破(Ⅰ),烈风(Ⅰ)',
                'Inferno, Blizzard, Chained Lightning, Downburst': '地狱火(Ⅱ),暴风雪(Ⅱ),连锁闪电(Ⅱ),下击暴流(Ⅱ)',
                'Flames of Loki, Fimbulvetr, Wrath of Thor, Storms of Njord': '洛基之焰(Ⅲ),芬布尔之冬(Ⅲ),雷神之怒(Ⅲ),尼奥尔德风暴(Ⅲ)',
                'Ripened Soul': '成熟的灵魂',
                'Soul Fire': '焚烧的灵魂',
                'Not Acquired': '未习得',
                'Followup': '追击',
                'Chance': '几率',
                '/([+-]?\\d+(?:\\.\\d+)?%?) Attack Base Damage/': '$1 攻击基础伤害',
                '/([+-]?\\d+(?:\\.\\d+)?%?) Magic Base Damage/': '$1 魔法基础伤害',
                '/([+-]?\\d+(?:\\.\\d+)?%?) Attack Accuracy/': '$1 攻击命中',
                '/([+-]?\\d+(?:\\.\\d+)?) Attack Damage Multiplier/': '$1 攻击伤害倍率',
                '/([+-]?\\d+(?:\\.\\d+)?%?) Magic Accuracy/': '$1 魔法命中',
                '/([+-]?\\d+(?:\\.\\d+)?%?) Attack Speed/': '$1 攻击速度',
                '/([+-]?\\d+(?:\\.\\d+)?%?) Magic Cast Speed/': '$1 魔法施法速度',
                '/([+-]?\\d+(?:\\.\\d+)?%?) Block Chance/': '$1 格挡几率',
                '/([+-]?\\d+(?:\\.\\d+)?%?) Parry Chance/': '$1 招架几率',
                '/([+-]?\\d+(?:\\.\\d+)?%?) Crushing Mitigation/': '$1 打击减伤',
                '/([+-]?\\d+(?:\\.\\d+)?%?) Piercing Mitigation/': '$1 刺击减伤',
                '/([+-]?\\d+(?:\\.\\d+)?%?) Slashing Mitigation/': '$1 斩击减伤',
                '/([+-]?\\d+(?:\\.\\d+)?%?) Physical Mitigation/': '$1 物理减伤',
                '/([+-]?\\d+(?:\\.\\d+)?%?) Magical Mitigation/': '$1 魔法减伤',
                '/([+-]?\\d+(?:\\.\\d+)?%?) Fire Mitigation/': '$1 火焰减伤',
                '/([+-]?\\d+(?:\\.\\d+)?%?) Cold Mitigation/': '$1 冰冷减伤',
                '/([+-]?\\d+(?:\\.\\d+)?%?) Elec Mitigation/': '$1 闪电减伤',
                '/([+-]?\\d+(?:\\.\\d+)?%?) Wind Mitigation/': '$1 疾风减伤',
                '/([+-]?\\d+(?:\\.\\d+)?%?) Holy Mitigation/': '$1 神圣减伤',
                '/([+-]?\\d+(?:\\.\\d+)?%?) Dark Mitigation/': '$1 黑暗减伤',
                '/([+-]?\\d+(?:\\.\\d+)?%?) Natural Resist Modifier/': '$1 基础抵抗修正',
                '/([+-]?\\d+(?:\\.\\d+)?%?) Natural Evade Modifier/': '$1 基础闪避修正',
                '/([+-]?\\d+(?:\\.\\d+)?%?) Shadow Veil Trigger Chance/': '$1 影纱触发几率',
                '/([+-]?\\d+(?:\\.\\d+)?%?) Action Speed Modification/': '$1 行动速度修正',
                '/([+-]?\\d+(?:\\.\\d+)?%?) Attack Crit Multiplier/': '$1 攻击暴击倍率',
                '/([+-]?\\d+(?:\\.\\d+)?%?) Spell Crit Multiplier/': '$1 法术暴击倍率',
                '/([+-]?\\d+(?:\\.\\d+)?%?) Base Health Regen per tick/': '$1 基础生命每回合恢复',
                '/([+-]?\\d+(?:\\.\\d+)?%?) Base Mana Regen per tick/': '$1 基础法力每回合恢复',
                '/([+-]?\\d+(?:\\.\\d+)?%?) Base Spirit Regen per tick/': '$1 基础灵力每回合恢复',
                '/\\+([\\d.]+)% Maximum Health/': '+$1% 最大生命',
                '/\\+([\\d.]+)% Maximum Magic/': '+$1% 最大法力',
                '/\\+([\\d.]+)% Maximum Spirit/': '+$1% 最大灵力',
                '/^When Used:\\s*Instantly restores\\s*([\\d.]+%)\\s*of Base Health$/': '使用时：立即恢复 $1 基础生命',
                '/^When Used:\\s*Instantly restores\\s*([\\d.]+%)\\s*of Base Magic$/': '使用时：立即恢复 $1 基础法力',
                '/^When Used:\\s*Instantly restores\\s*([\\d.]+%)\\s*of Base Spirit$/': '使用时：立即恢复 $1 基础灵力',
            },
        },
    };

    // =========================================================
    // 1) 运行状态层：切换状态与缓存
    // =========================================================
    const state = {
        translated: localStorage.getItem('hv_translate_enabled') !== 'false',
        translatedList: new Map(), // elem -> {prop: originalValue}
        dictSetCache: new Map(), // key(groupSet) -> [{reg,value}]
        groupRegexCache: new Map(), // group -> [{reg,value}]
        profileGroupsCache: new Map(), // profile -> [group,...]
        observers: new Set(),
        imageTranslatedList: [],
        battleInfopaneObserver: null,
        battleSkillPanelObserver: null,
        battleLogObserver: null,
        battleSettlementObserver: null,
        battleHooked: null,
        battleImageStyle: null,
        abilityTreeImageStyle: null,
        imageDataUrlCache: new Map(),
        equipmentColorRulesCache: null,
        auctionEquipmentColorRulesCache: null,
        battleLogColorRulesCache: null,
        applyingEquipmentColor: false,
        externalEquipmentObserver: null,
        shopAcceptObserver: null,
    };

    const TAGS_WHITELIST = new Set(['BUTTON', 'TEXTAREA', 'SCRIPT', 'STYLE']);
    const HAS_ENGLISH = /[a-zA-Z]/;
    const REGEX_RULE = /^\/(.+)\/([gimuy]*)$/;
    const ATTRIBUTE_VISUAL_LABELS = {
        Strength: '力量',
        Dexterity: '灵巧',
        Agility: '敏捷',
        Endurance: '体质',
        Intelligence: '智力',
        Wisdom: '智慧',
    };
    const ATTRIBUTE_VISUAL_SELECTOR = '#attr_table, #stats_scrollable > table:nth-last-of-type(2)';
    const ATTRIBUTE_VISUAL_PATTERN = /\b(Strength|Dexterity|Agility|Endurance|Intelligence|Wisdom)\b/g;
    const ABILITY_TAB_LABELS = {
        'general': '通用',
        'onehanded': '单手',
        'twohanded': '双手',
        'dualwield': '双持',
        'niten': '二天一流',
        'staff': '法杖',
        'cloth': '布甲',
        'light': '轻甲',
        'heavy': '重甲',
        'deprecating1': '减益魔法1',
        'deprecating2': '减益魔法2',
        'supportive1': '增益魔法1',
        'supportive2': '增益魔法2',
        'elemental': '元素魔法',
        'forbidden': '黑暗魔法',
        'divine': '神圣魔法',
    };
    const IMAGE_BUTTON_LABELS = {
        'Character.png': '角色',
        'Bazaar.png': '商店',
        'Battle.png': '战斗',
        'send.png': '发送',
        'save.png': '保存',
        'discard.png': '丢弃',
        'attach_item.png': '附加道具',
        'attach_equip.png': '附加装备',
        'attach_attach.png': '附加',
        'resetall.png': '重置全部',
        'reset_a.png': '重置',
        'reset_d.png': '重置',
        'rename.png': '重命名',
        'apply.png': '应用',
        'persona_create_clone.png': '创建克隆人格',
        'persona_create_clone_d.png': '创建克隆人格',
        'persona_create_blank.png': '创建空白人格',
        'persona_create_blank_d.png': '创建空白人格',
        'startchallenge.png': '开始战斗',
        'startchallenge_d.png': '开始战斗',
        'startgrindfest.png': '开始战斗',
        'set1_on.png': '套装一',
        'set1_off.png': '套装一',
        'set2_on.png': '套装二',
        'set2_off.png': '套装二',
        'set3_on.png': '套装三',
        'set3_off.png': '套装三',
        'set4_on.png': '套装四',
        'set4_off.png': '套装四',
        'set5_on.png': '套装五',
        'set5_off.png': '套装五',
        'set6_on.png': '套装六',
        'set6_off.png': '套装六',
        'set7_on.png': '套装七',
        'set7_off.png': '套装七',
        'ponychartbutton.png': '名称参考',
        'buytickets.png': '购买',
        'buytickets_d.png': '购买',
        'lottery_prev_a.png': '上一期',
        'lottery_prev_d.png': '上一期',
        'lottery_next_a.png': '下一期',
        'lottery_next_d.png': '下一期',
        'lottery_today_a.png': '本期',
        'lottery_today_d.png': '本期',
        'lottery_golden_a.png': '黄金彩票',
        'lottery_golden_d.png': '黄金彩票',
        'lottery_donotwant_a.png': '放弃大奖',
        'lottery_donotwant_d.png': '放弃大奖',
        'train.png': '训练',
        'train_d.png': '训练',
        'canceltrain.png': '取消训练',
        'feedallmonsters.png': '喂养全部怪物',
        'feedallmonsters_d.png': '喂养全部怪物',
        'drugallmonsters.png': '安抚全部怪物',
        'drugallmonsters_d.png': '安抚全部怪物',
        'feedmonster.png': '喂养怪物',
        'feedmonster_d.png': '喂养怪物',
        'drugmonster.png': '使用快乐药丸',
        'drugmonster_d.png': '使用快乐药丸',
        'unlock_slot.png': '解锁怪物槽',
        'unlock_slot_d.png': '解锁怪物槽',
        'createmonster.png': '创建怪物',
        'createmonster_d.png': '创建怪物',
        'saveskills.png': '保存技能',
        'delete.png': '删除',
        'next.png': '下一个 >',
        'prev.png': '<< 上一个',
        'ml_monstats.png': '怪物属性',
        'ml_monstats_a.png': '怪物属性',
        'ml_skilledit.png': '技能编辑',
        'ml_skilledit_a.png': '技能编辑',
        'str.png': '力量',
        'str_a.png': '力量',
        'dex.png': '灵巧',
        'dex_a.png': '灵巧',
        'agi.png': '敏捷',
        'agi_a.png': '敏捷',
        'end.png': '体质',
        'end_a.png': '体质',
        'int.png': '智力',
        'int_a.png': '智力',
        'wis.png': '智慧',
        'wis_a.png': '智慧',
        'fire.png': '火焰',
        'fire_a.png': '火焰',
        'cold.png': '冰冷',
        'cold_a.png': '冰冷',
        'elec.png': '闪电',
        'elec_a.png': '闪电',
        'wind.png': '疾风',
        'wind_a.png': '疾风',
        'holy.png': '神圣',
        'holy_a.png': '神圣',
        'dark.png': '黑暗',
        'dark_a.png': '黑暗',
        'arthropod.png': '节肢动物',
        'arthropod_a.png': '节肢动物',
        'avion.png': '鸟类',
        'avion_a.png': '鸟类',
        'beast.png': '野兽',
        'beast_a.png': '野兽',
        'celestial.png': '天人',
        'celestial_a.png': '天人',
        'daimon.png': '魔灵',
        'daimon_a.png': '魔灵',
        'dragonkin.png': '龙类',
        'dragonkin_a.png': '龙类',
        'elemental.png': '元素生物',
        'elemental_a.png': '元素生物',
        'giant.png': '巨人',
        'giant_a.png': '巨人',
        'humanoid.png': '类人',
        'humanoid_a.png': '类人',
        'mechanoid.png': '机械体',
        'mechanoid_a.png': '机械体',
        'reptilian.png': '爬行类',
        'reptilian_a.png': '爬行类',
        'sprite.png': '妖精',
        'sprite_a.png': '妖精',
        'undead.png': '亡灵',
        'undead_a.png': '亡灵',
        'crsh.png': '打击',
        'crsh_a.png': '打击',
        'prcg.png': '刺击',
        'prcg_a.png': '刺击',
        'slsh.png': '斩击',
        'slsh_a.png': '斩击',
    };

    function getImageButtonLabel(file) {
        if (!file) return '';
        if (IMAGE_BUTTON_LABELS[file]) return IMAGE_BUTTON_LABELS[file];
        // 非 _a 变体回退到 _a 版本（如 str.png -> str_a.png），统一覆盖资源不足/充足两种状态
        const activeVariant = file.replace(/\.png$/i, '_a.png');
        if (activeVariant !== file && IMAGE_BUTTON_LABELS[activeVariant]) return IMAGE_BUTTON_LABELS[activeVariant];
        const m = file.match(/^t[ad]([a-z0-9]+)\.png$/i); // ta* / td*
        if (!m) return '';
        return ABILITY_TAB_LABELS[m[1].toLowerCase()] || '';
    }

    function isImageButtonActive(file) {
        if (!file) return false;
        if (/^ta[a-z0-9]+\.png$/i.test(file)) return true;   // 能力页签激活态
        if (/^td[a-z0-9]+\.png$/i.test(file)) return false;  // 能力页签未激活态
        if (/^set\d+_on\.png$/i.test(file)) return true;
        if (/^set\d+_off\.png$/i.test(file)) return false;
        if (/^.+_a\.png$/i.test(file) && IMAGE_BUTTON_LABELS[file]) return true;
        // 非 _a 变体但存在对应 _a 词典条目 -> 资源不足/未激活态（如 str.png vs str_a.png）
        const activeVariant = file.replace(/\.png$/i, '_a.png');
        if (activeVariant !== file && IMAGE_BUTTON_LABELS[activeVariant]) return false;
        if (file === 'resetall.png') return true;
        if (file === 'reset_d.png') return false;
        if (file === 'startchallenge.png') return true;
        if (file === 'startchallenge_d.png') return false;
        if (file === 'startgrindfest.png') return true;
        if (/_d\.png$/i.test(file) && IMAGE_BUTTON_LABELS[file]) return false;
        return true;
    }

    // =========================================================
    // 2) 配置解析与校验层
    // =========================================================
    function getTargetNodes(selector) {
        if (typeof selector !== 'string' || !selector) return [];
        return [...document.querySelectorAll(selector)];
    }

    function warnConfig(message) {
        console.warn(`[HV综合汉化][配置] ${message}`);
    }

    function isPlainObject(v) {
        return !!v && typeof v === 'object' && !Array.isArray(v);
    }

    function getDictSourceByGroupKey(groupKey) {
        if (!groupKey || typeof groupKey !== 'string') return null;
        const parts = groupKey.split('.');
        let node = words;
        for (const p of parts) {
            if (!isPlainObject(node) || !(p in node)) return null;
            node = node[p];
        }
        return isPlainObject(node) ? node : null;
    }

    // =========================================================
    // 3) 词典解析层：group/profile 编译与缓存
    // =========================================================
    function escapeRegex(str) {
        return str.replace(/([\[\]\^&$.()?/\\+{}|])/g, '\\$1');
    }

    function getRuleSortWeight(key) {
        const regMatch = key.match(REGEX_RULE);
        if (!regMatch) return key.length;
        const literalPart = regMatch[1]
            .replace(/\(\?[:=!<][^)]*\)/g, '')
            .replace(/\[[^\]]*\]/g, '')
            .replace(/\\[bBdDsSwW]/g, '')
            .replace(/\\(.)/g, '$1')
            .replace(/[()^$*+?.|{}]/g, '');
        return literalPart.length || key.length;
    }

    function compileGroupDict(group) {
        if (state.groupRegexCache.has(group)) return state.groupRegexCache.get(group);
        const source = getDictSourceByGroupKey(group) || {};
        const entries = Object.entries(source)
            .filter(([k]) => k)
            .map(([key, value]) => ({ key, value, weight: getRuleSortWeight(key) }))
            .sort((a, b) => b.weight - a.weight || b.key.length - a.key.length);

        const compiled = entries.map(({ key, value, weight }) => {
            const regMatch = key.match(REGEX_RULE);
            if (regMatch) {
                return { reg: new RegExp(regMatch[1], regMatch[2] || 'g'), value, key, weight };
            }
            const pattern = escapeRegex(key)
                .replace(/\s+/g, '\\s+')
                .replace(/\\?\*/g, m => (m === '\\*' ? '\\*' : '[^ ]*'));
            return { reg: new RegExp(pattern, 'g'), value, key, weight };
        });

        state.groupRegexCache.set(group, compiled);
        return compiled;
    }

    function getCompiledDictByGroups(groupNames) {
        const key = (groupNames || []).join(',');
        if (state.dictSetCache.has(key)) return state.dictSetCache.get(key);
        const compiled = (groupNames || [])
            .flatMap(compileGroupDict)
            .sort((a, b) => b.weight - a.weight || b.key.length - a.key.length);
        state.dictSetCache.set(key, compiled);
        return compiled;
    }

    // 解析 profile 引用的所有 group（递归展开 @bundle）
    function resolveProfileGroups(profileName) {
        if (state.profileGroupsCache.has(profileName)) return state.profileGroupsCache.get(profileName);

        const refs = REGION_PROFILES[profileName] || [];
        const result = [];
        const visitBundle = (bundleName, stack = []) => {
            if (stack.includes(bundleName)) {
                warnConfig(`bundle 循环引用：${[...stack, bundleName].join(' -> ')}`);
                return;
            }
            const refsInBundle = GROUP_BUNDLES[bundleName];
            if (!refsInBundle) {
                warnConfig(`引用了不存在的 bundle "@${bundleName}"`);
                return;
            }
            for (const ref of refsInBundle) {
                if (typeof ref !== 'string') continue;
                if (ref.startsWith('@')) {
                    visitBundle(ref.slice(1), [...stack, bundleName]);
                } else {
                    result.push(ref);
                }
            }
        };

        for (const ref of refs) {
            if (typeof ref !== 'string') continue;
            if (ref.startsWith('@')) {
                visitBundle(ref.slice(1));
            } else {
                result.push(ref);
            }
        }

        const uniqueGroups = [...new Set(result)];
        state.profileGroupsCache.set(profileName, uniqueGroups);
        return uniqueGroups;
    }

    function getCompiledDictByProfile(profileName) {
        const groups = resolveProfileGroups(profileName);
        return getCompiledDictByGroups(groups);
    }

    function resolveNodeProfile(selector, elem, fallbackProfile) {
        const root = elem?.nodeType === 1 ? elem : elem?.parentElement;
        if (selector === '#popup_box') {
            const popup = root?.id === 'popup_box' ? root : root?.closest?.('#popup_box');
            if (!popup) return fallbackProfile;
            return popup.querySelector('.eq') ? 'equipmentPopup' : fallbackProfile;
        }
        if (selector === '#armory_outer' && root?.closest?.('#confirm_inner')?.querySelector?.('#iwinfo')) return 'itemWorld';
        return fallbackProfile;
    }

    function getRegionTranslateRoots(selector, elem) {
        const rootSelectors = REGION_DEFS[selector]?.translateRoots;
        if (!rootSelectors || !rootSelectors.length) return [elem];

        const roots = new Set();
        for (const rootSelector of rootSelectors) {
            if (rootSelector === ':scope') {
                if (elem) roots.add(elem);
                continue;
            }
            if (elem?.matches?.(rootSelector)) roots.add(elem);
            elem?.querySelectorAll?.(rootSelector).forEach(root => roots.add(root));
        }
        return [...roots];
    }

    function getImmediateDynamicRoots(selector, elem, changedNodes) {
        const rootSelectors = REGION_DEFS[selector]?.immediateRoots;
        if (!rootSelectors || !rootSelectors.length) return [];

        const roots = new Set();
        if (rootSelectors.includes(':scope') && elem) roots.add(elem);

        for (const node of changedNodes) {
            const root = node?.nodeType === 1 ? node : node?.parentElement;
            if (!root) continue;
            for (const rootSelector of rootSelectors) {
                if (rootSelector === ':scope') continue;
                const matched = root.matches?.(rootSelector)
                    ? root
                    : root.closest?.(rootSelector)
                        || (root === elem ? elem.querySelector?.(rootSelector) : null);
                if (matched) roots.add(matched);
            }
        }
        return [...roots];
    }

    // =========================================================
    // 4) 翻译执行层：文本 / 按钮 / title 三通道
    // =========================================================
    function getTextNodes(root) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                if (!node.data || !node.data.trim()) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });

        const result = [];
        let node;
        while ((node = walker.nextNode())) result.push(node);
        return result;
    }

    function saveOriginal(elem, prop, oldValue, isDynamic) {
        if (isDynamic) return;
        if (!state.translatedList.has(elem)) state.translatedList.set(elem, {});
        const snapshot = state.translatedList.get(elem);
        if (!(prop in snapshot)) snapshot[prop] = oldValue;
    }

    function translateByDict(text, dict) {
        let out = String(text || '').replace(/\u00a0/g, ' ');
        for (const { reg, value } of dict) out = out.replace(reg, value);
        return out;
    }

    const INTEGRATED_EQUIPMENT_SUBHEADING_SELECTOR = [
        '.hvut-eqp-category > td[colspan="10"]',
        '.hvut-eqp-type > td[colspan="10"]',
    ].join(', ');
    const TEXT_TRANSLATE_EXCLUDE_SELECTOR = [
        '#monster_outer .msl > div:nth-child(2)',
        'select[name="persona_set"] option',
        '.chm > div',
        INTEGRATED_EQUIPMENT_SUBHEADING_SELECTOR,
    ].join(', ');

    function isMonsterActionsMachineTextNode(node) {
        const parent = node?.parentElement;
        if (!parent?.closest?.('#monster_actions')) return false;
        if (parent.closest('#monster_actions > div > div > span')) return true;
        return /^(Cost|Stock):\s*/.test(String(node.data || '').replace(/\u00a0/g, ' ').trim());
    }

    function isTextTranslateExcludedNode(node) {
        return !!node?.parentElement?.closest?.(TEXT_TRANSLATE_EXCLUDE_SELECTOR);
    }

    function canTranslateTextNode(node) {
        if (!node || !node.parentNode) return false;
        if (TAGS_WHITELIST.has(node.parentNode.tagName)) return false;
        if (isMonsterActionsMachineTextNode(node)) return false;
        if (isTextTranslateExcludedNode(node)) return false;
        if (node.parentElement?.closest?.(ATTRIBUTE_VISUAL_SELECTOR)) return false;
        if (!CONFIG.translateHvutSnowflakeArtifact && node.parentElement?.closest?.('tr.hvut-ss-equip')) return false;
        if (isEquipmentTypeLabelNode(node)) return false;
        return HAS_ENGLISH.test(node.data || '');
    }

    function translateText(root, dict, isDynamic) {
        if (!root || !dict || !dict.length) return;
        for (const node of getTextNodes(root)) {
            if (!canTranslateTextNode(node)) continue;
            if (node.parentElement?.closest?.('#equipblurb') && !node.parentElement?.closest?.('a')) {
                if (
                    node.data.includes('Legendary grade and above') ||
                    node.data.includes('Note that equipment that is sacrified for Stat Fusion will be ') ||
                    node.data.includes(' and cannot be recovered.')
                ) {
                    const filteredDict = dict.filter(rule => rule.key !== 'Legendary' && rule.key !== 'PERMANENTLY DESTROYED');
                    const next = translateByDict(node.data, filteredDict);
                    if (next !== node.data) {
                        saveOriginal(node, 'data', node.data, isDynamic);
                        node.data = next;
                    }
                    continue;
                }
            }
            const next = translateByDict(node.data, dict);
            if (next !== node.data) {
                saveOriginal(node, 'data', node.data, isDynamic);
                node.data = next;
            }
        }
    }

    function translateButtons(root, dict, isDynamic) {
        const elems = root instanceof HTMLInputElement || root instanceof HTMLButtonElement
            ? [root]
            : [...root.querySelectorAll('input[type="submit"], button')];

        for (const elem of elems) {
            const isInput = elem instanceof HTMLInputElement;
            const prop = isInput ? 'value' : 'textContent';
            const oldVal = elem[prop] || '';
            if (!/[a-zA-Z]/.test(oldVal)) continue;
            const next = translateByDict(oldVal, dict);
            if (next !== oldVal) {
                saveOriginal(elem, prop, oldVal, isDynamic);
                elem[prop] = next;
            }
        }
    }

    function translateTextAttributes(root, dict, isDynamic) {
        const attrs = ['title', 'placeholder'];
        const selector = attrs.map(attr => `[${attr}]`).join(',');
        const elems = root.matches?.(selector) ? [root] : [...root.querySelectorAll(selector)];
        for (const elem of elems) {
            for (const attr of attrs) {
                if (!elem.hasAttribute(attr)) continue;
                const oldVal = elem.getAttribute(attr) || '';
                if (!/[a-zA-Z]/.test(oldVal)) continue;
                const next = translateByDict(oldVal, dict);
                if (next === oldVal) continue;
                saveOriginal(elem, attr, oldVal, isDynamic);
                elem.setAttribute(attr, next);
            }
        }
    }

    function translateSection(root, dict, isDynamic) {
        translateText(root, dict, isDynamic);
        translateButtons(root, dict, isDynamic);
        translateTextAttributes(root, dict, isDynamic);
    }

    function ensureBattleVisualTextStyle() {
        if (document.getElementById('hv-battle-visual-text-style')) return;
        const style = document.createElement('style');
        style.id = 'hv-battle-visual-text-style';
        style.textContent = `
            [data-hv-battle-visual-text]{font-size:0!important;}
            [data-hv-battle-visual-text]::after{
                content:attr(data-hv-battle-visual-text);
                color:var(--hv-battle-visual-color,#202020);
                font-size:var(--hv-battle-visual-font-size,12px);
                line-height:var(--hv-battle-visual-line-height,normal);
                white-space:nowrap;
                pointer-events:none;
                text-shadow:none;
            }
            #infopane [data-hv-battle-visual-text]::after,
            #btcp [data-hv-battle-visual-text]::after{white-space:normal;}
        `;
        document.head.appendChild(style);
    }

    function clearBattleVisualText(root = document) {
        const elems = root.matches?.('[data-hv-battle-visual-text]')
            ? [root]
            : [...root.querySelectorAll?.('[data-hv-battle-visual-text]') || []];
        for (const elem of elems) {
            delete elem.dataset.hvBattleVisualText;
            delete elem.dataset.hvBattleVisualSource;
            elem.style.removeProperty('--hv-battle-visual-color');
            elem.style.removeProperty('--hv-battle-visual-font-size');
            elem.style.removeProperty('--hv-battle-visual-line-height');
        }
    }

    function canVisualTranslateBattleTextNode(node) {
        if (!node || !node.parentElement) return false;
        const parent = node.parentElement;
        if (!HAS_ENGLISH.test(node.data || '')) return false;
        if (TAGS_WHITELIST.has(parent.tagName)) return false;
        if (['INPUT', 'SELECT', 'OPTION'].includes(parent.tagName)) return false;
        if (parent.closest?.('#textlog,#translog')) return false;
        return parent.childNodes.length === 1;
    }

    function translateBattleSectionVisually(root, dict) {
        if (!root || !dict || !dict.length) return;
        if (!state.translated) {
            clearBattleVisualText(root);
            return;
        }
        ensureBattleVisualTextStyle();
        for (const node of getTextNodes(root)) {
            if (!canVisualTranslateBattleTextNode(node)) continue;
            const parent = node.parentElement;
            const source = node.data;
            if (parent.dataset.hvBattleVisualSource === source) continue;
            const next = translateByDict(source, dict);
            if (next !== source) {
                if (!parent.style.getPropertyValue('--hv-battle-visual-color')) {
                    const computedStyle = getComputedStyle(parent);
                    parent.style.setProperty('--hv-battle-visual-color', computedStyle.color || '#202020');
                    parent.style.setProperty('--hv-battle-visual-font-size', computedStyle.fontSize || '12px');
                    parent.style.setProperty('--hv-battle-visual-line-height', computedStyle.lineHeight || 'normal');
                }
                parent.dataset.hvBattleVisualText = next;
                parent.dataset.hvBattleVisualSource = source;
            } else if (parent.dataset.hvBattleVisualText) {
                delete parent.dataset.hvBattleVisualText;
                delete parent.dataset.hvBattleVisualSource;
                parent.style.removeProperty('--hv-battle-visual-color');
                parent.style.removeProperty('--hv-battle-visual-font-size');
                parent.style.removeProperty('--hv-battle-visual-line-height');
            }
        }
    }

    const EQUIPMENT_TYPE_LABELS = {
        'Cotton Armor': '棉甲',
        'Phase Armor': '相位甲',
        'Gossamer Armor': '薄纱甲',
        'Ironsilk Armor': '铁丝绸甲',
        'Shade Armor': '暗影甲',
        'Leather Armor': '皮革甲',
        'Drakehide Armor': '龙鳞甲',
        'Kevlar Armor': '凯夫拉甲',
        'Chain Armor': '锁子甲',
        'Plate Armor': '板甲',
        'Reactive Armor': '反应甲',
        'Power Armor': '动力甲',
    };

    const EQUIPMENT_TYPE_LABEL_CONTEXTS = {
        armory: ['#armory_outer td[colspan="2"]'],
        settings: ['#settings_autosalvage tr > td:first-child'],
    };

    function isEquipmentTypeLabelNode(node) {
        const value = String(node?.data || '').replace(/\s+/g, ' ').trim();
        if (!value || !Object.prototype.hasOwnProperty.call(EQUIPMENT_TYPE_LABELS, value)) return false;
        return Object.values(EQUIPMENT_TYPE_LABEL_CONTEXTS)
            .flat()
            .some(selector => !!node.parentElement?.closest?.(selector));
    }

    function translateEquipmentTypeLabels(root, profileName, isDynamic) {
        if (!root) return;
        const selectors = EQUIPMENT_TYPE_LABEL_CONTEXTS[profileName];
        if (!selectors?.length) return;

        const cells = new Set();
        for (const selector of selectors) {
            if (root.matches?.(selector)) cells.add(root);
            const closestCell = root.closest?.(selector);
            if (closestCell) cells.add(closestCell);
            if (root.querySelectorAll) {
                for (const cell of root.querySelectorAll(selector)) cells.add(cell);
            }
        }

        for (const cell of cells) {
            const oldVal = cell.textContent || '';
            const key = oldVal.replace(/\s+/g, ' ').trim();
            const next = EQUIPMENT_TYPE_LABELS[key];
            if (!next || next === oldVal) continue;
            saveOriginal(cell, 'textContent', oldVal, isDynamic);
            cell.textContent = oldVal.replace(key, next);
        }
    }

    // HV Utils 装备分组专用短标签。常规装备名复用 equipment.name，
    // 这里只保留分组语境下需要缩写或改写的覆盖项，避免维护两套重复词条。
    const INTEGRATED_EQUIPMENT_SUBHEADING_DICT = {
        'One-handed Weapon': '单手',
        'Two-handed Weapon': '双手',
        'Cloth Armor': '布甲',
        'Oak Staff': '橡木',
        'Redwood Staff': '红木',
        'Willow Staff': '柳木',
        'Katalox Staff': '铁木',
        'Ebony Staff': '乌木',
        'the Heaven-sent': '圣熟练',
        'the Elementalist': '元素熟练',
        'Surtr': '火',
        'Niflheim': '冰',
        'Freyr': '风',
        'Mjolnir': '雷',
        'Heimdall': '圣',
        'Fenrir': '暗',
        'the Demon-fiend': '暗熟练',
        'the Earth-walker': '增益熟练',
        'the Curse-weaver': '减益熟练',
        'Protection': '物防',
        'Warding': '魔防',
        'the Fire-eater': '火抗',
        'the Frost-born': '冰抗',
        'the Thunder-child': '雷抗',
        'the Wind-waker': '风抗',
        'the Thrice-blessed': '圣抗',
        'the Spirit-ward': '暗抗',
        'the Cheetah': '敏捷',
        'the Fox': '智力',
        'the Owl': '智慧',
    };

    function translateIntegratedEquipmentSubheadingValue(text) {
        const key = String(text || '').replace(/\s+/g, ' ').trim();
        const override = INTEGRATED_EQUIPMENT_SUBHEADING_DICT[key];
        if (override) return override;

        const translated = translateByDict(key, getCompiledDictByGroups(['equipment.name']));
        if (translated === key || HAS_ENGLISH.test(translated)) return '';
        return translated
            .replace(/\s*\([^)]*\)/g, '')
            .replace(/\s+/g, '')
            .replace(/靴子$/, '靴')
            .replace(/鞋子$/, '鞋')
            .trim();
    }

    function translateIntegratedEquipmentSubheadings(root, profileName, isDynamic) {
        if ((profileName !== 'armory' && profileName !== 'leftPanel') || !root) return;

        const cells = new Set();
        if (root.matches?.(INTEGRATED_EQUIPMENT_SUBHEADING_SELECTOR)) cells.add(root);
        const closestCell = root.closest?.(INTEGRATED_EQUIPMENT_SUBHEADING_SELECTOR);
        if (closestCell) cells.add(closestCell);
        root.querySelectorAll?.(INTEGRATED_EQUIPMENT_SUBHEADING_SELECTOR).forEach(cell => cells.add(cell));

        for (const cell of cells) {
            const oldVal = cell.textContent || '';
            const key = oldVal.replace(/\s+/g, ' ').trim();
            const next = translateIntegratedEquipmentSubheadingValue(key);
            if (!next || next === key) continue;
            // 这些标题由 HV Utils 动态生成，但仍需保存英文原文，才能实时切回英文。
            saveOriginal(cell, 'textContent', oldVal, false);
            cell.textContent = oldVal.replace(key, next);
        }
    }

    function translateEquipmentDetailNames(root, profileName, isDynamic) {
        if (profileName !== 'equipmentDetail' && profileName !== 'equipmentPopup' && profileName !== 'lottery') return;
        if (!root?.querySelector) return;
        const dict = getCompiledDictByGroups(['equipment.name']);
        const containers = root.matches?.('.showequip, #popup_box, #leftpane')
            ? [root]
            : [...root.querySelectorAll?.('.showequip, #popup_box, #leftpane') || []];
        for (const container of containers) {
            const eq = container.querySelector('.eq');
            if (!eq) continue;
            const eqHost = [...container.children].find(child => child === eq || child.contains(eq));
            if (!eqHost) continue;
            for (const child of container.children) {
                if (child === eqHost) break;
                translateSection(child, dict, isDynamic);
            }
        }
    }

    function translateEquipmentPopupCharmValue(text) {
        const normalized = String(text || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
        if (normalized === 'Charms') return '护符';

        const match = normalized.match(/^(.+?) \(([GL])\)$/);
        if (!match) return '';
        const tier = match[2] === 'G' ? 'Greater' : 'Lesser';
        const expanded = `${match[1]} (${tier})`;
        const translated = translateByDict(expanded, getCompiledDictByGroups(['domain.armory']));
        return translated === expanded ? '' : translated;
    }

    function translateEquipmentPopupCharms(root, profileName) {
        if (profileName !== 'equipmentDetail' && profileName !== 'equipmentPopup') return;
        if (!root) return;

        const selector = '.chm > div';
        const rows = new Set();
        if (root.matches?.(selector)) rows.add(root);
        const closestRow = root.closest?.(selector);
        if (closestRow) rows.add(closestRow);
        root.querySelectorAll?.(selector).forEach(row => rows.add(row));

        for (const row of rows) {
            const oldVal = row.textContent || '';
            const normalized = oldVal.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
            const next = translateEquipmentPopupCharmValue(normalized);
            if (!next || next === normalized) continue;
            saveOriginal(row, 'textContent', oldVal, false);
            row.textContent = oldVal.replace(normalized, next);
        }
    }

    function translateArmoryCharmDestroyConfirm(root, profileName, isDynamic) {
        if (profileName !== 'armory' || !root?.querySelectorAll) return;
        const paragraphs = root.matches?.('#confirm_body p')
            ? [root]
            : [...root.querySelectorAll('#confirm_body p')];

        for (const paragraph of paragraphs) {
            const text = (paragraph.textContent || '').replace(/\s+/g, ' ').trim();
            if (!/^(?:Are you sure you want to|确定要)/.test(text)) continue;
            if (!/(?:DESTROY|销毁)/.test(text)) continue;
            if (!/charm/.test(text) || !/pouch/.test(text)) continue;
            const match = text.match(/(?:Slot|槽位)\s*(\d+)/);
            if (!match) continue;
            const next = `确定要<strong>销毁</strong>槽位 ${match[1]} 中的护符和护符袋吗？`;
            if (paragraph.innerHTML === next) continue;
            saveOriginal(paragraph, 'innerHTML', paragraph.innerHTML, isDynamic);
            paragraph.innerHTML = next;
        }
    }

    function translateContextSpecials(root, profileName, isDynamic) {
        translateEquipmentDetailNames(root, profileName, isDynamic);
        translateEquipmentPopupCharms(root, profileName);
        translateEquipmentTypeLabels(root, profileName, isDynamic);
        translateIntegratedEquipmentSubheadings(root, profileName, isDynamic);
        translateArmoryCharmDestroyConfirm(root, profileName, isDynamic);
    }

    // =========================================================
    // 4.5) 装备名染色层：独立于翻译字典，仅在中文状态按当前翻译结果染色
    // =========================================================
    const EQUIPMENT_COLOR_GROUPS = [
        {
            className: 'hv-eq-q-ultimate',
            terms: ['𖣔终极𖣔'],
        },
        {
            className: 'hv-eq-q-peerless',
            terms: ['☯无双☯'],
        },
        {
            className: 'hv-eq-q-legendary',
            terms: ['✪传奇✪'],
        },
        {
            className: 'hv-eq-q-magnificent',
            terms: ['☆史诗☆'],
        },
        {
            className: 'hv-eq-q-exquisite',
            terms: ['✧精良✧'],
        },
        {
            className: 'hv-eq-q-superior',
            terms: ['上等'],
        },
        {
            className: 'hv-eq-q-fine',
            terms: ['优质'],
        },
        {
            className: 'hv-eq-q-average',
            terms: ['中等'],
        },
        {
            className: 'hv-eq-q-fair',
            terms: ['普通'],
        },
        {
            className: 'hv-eq-q-crude',
            terms: ['粗糙'],
        },
        {
            className: 'hv-eq-q-flimsy',
            terms: ['脆弱'],
        },
        {
            className: 'hv-eq-void',
            terms: ['虚空(无负重/干涉)'],
        },
        {
            className: 'hv-eq-fire-damage',
            terms: ['灼热(火伤+)', '苏尔特(火伤+)'],
        },
        {
            className: 'hv-eq-fire-resist',
            terms: ['红宝石(火抗+)', '吞火者(火抗+)'],
        },
        {
            className: 'hv-eq-cold-damage',
            terms: ['极寒(冰伤+)', '尼芙菲姆(冰伤+)'],
        },
        {
            className: 'hv-eq-cold-resist',
            terms: ['钴石的(冰抗+)', '霜裔(冰抗+)'],
        },
        {
            className: 'hv-eq-elec-damage',
            terms: ['闪电(电伤+)', '姆乔尔尼尔(雷伤+)'],
        },
        {
            className: 'hv-eq-elec-resist',
            terms: ['琥珀的(电抗+)', '雷之子(雷抗+)'],
        },
        {
            className: 'hv-eq-wind-damage',
            terms: ['风暴(风伤+)', '弗雷尔(风伤+)'],
        },
        {
            className: 'hv-eq-wind-resist',
            terms: ['翡翠的(风抗+)', '驭风者(风抗+)'],
        },
        {
            className: 'hv-eq-holy-damage',
            terms: ['神圣(圣伤+)', '海姆达尔(圣伤+)'],
        },
        {
            className: 'hv-eq-holy-resist',
            terms: ['锆石的(圣抗+)', '三重祝福(圣抗+)'],
        },
        {
            className: 'hv-eq-dark-damage',
            terms: ['恶魔(暗伤+)', '芬里尔(暗伤+)'],
        },
        {
            className: 'hv-eq-dark-resist',
            terms: ['缟玛瑙(暗抗+)', '幽冥结界(暗抗+)'],
        },
        {
            className: 'hv-eq-radiant',
            terms: ['✪魔光✪(法伤+)'],
        },
        {
            className: 'hv-eq-offense-redtext',
            terms: ['残暴的(攻爆伤+)', '充能(施速+)'],
        },
        {
            className: 'hv-eq-weight',
            terms: ['秘银的(负重-)'],
        },
        {
            className: 'hv-eq-agile',
            terms: ['俊敏的(攻速+)'],
        },
        {
            className: 'hv-eq-frugal',
            terms: ['节能(魔耗-)'],
        },
        {
            className: 'hv-eq-slaughter',
            terms: ['杀戮(攻击+)'],
        },
        {
            className: 'hv-eq-balance',
            terms: ['平衡(攻命攻爆+)'],
        },
        {
            className: 'hv-eq-swiftness',
            terms: ['迅捷(攻速+)'],
        },
        {
            className: 'hv-eq-destruction',
            terms: ['毁灭(法伤+)'],
        },
        {
            className: 'hv-eq-focus',
            terms: ['专注(法爆魔命+魔耗-)', '神秘(法爆伤+)'],
        },
        {
            className: 'hv-eq-defense',
            terms: ['加固的(斩打刺减伤+)', '盾化的(格挡+)'],
        },
        {
            className: 'hv-eq-barrier',
            terms: ['屏障(格挡+)'],
        },
        {
            className: 'hv-eq-nimble',
            terms: ['灵活(招架+)'],
        },
        {
            className: 'hv-eq-shadowdancer',
            terms: ['影舞者(闪避/攻爆+)'],
        },
        {
            className: 'hv-eq-battlecaster',
            terms: ['战法师(魔耗-魔命+)'],
        },
        {
            className: 'hv-eq-arcanist',
            terms: ['奥术师(无干涉/魔命+)'],
        },
        {
            className: 'hv-eq-elementalist',
            terms: ['元素使(元素熟练+)'],
        },
        {
            className: 'hv-eq-heaven',
            terms: ['天堂(神圣熟练+)'],
        },
        {
            className: 'hv-eq-vampire',
            terms: ['吸血鬼(吸血+)'],
        },
        {
            className: 'hv-eq-special-material',
            terms: ['相位', '暗影', '动力', '反应'],
        },
        {
            className: 'hv-eq-light',
            terms: ['皮革', '龙鳞', '凯夫拉'],
        },
        {
            className: 'hv-eq-heavy',
            terms: ['锁甲', '板甲'],
        },
    ];
    const EQUIPMENT_QUALITY_GROUP_COUNT = 11;
    const EQUIPMENT_NAME_HINTS = [
        '斧', '棍', '西洋剑', '短剑', '胁差', '锁链双剑', '匕首', '锤', '刺剑', '长剑', '日本刀', '镰刀', '盾', '法杖',
        '甲', '帽', '长袍', '护胸', '胸甲', '手套', '护手', '裤子', '绑腿', '护胫', '鞋子', '靴子', '铁靴', '头盔',
    ];

    function ensureArmoryCompatibilityStyle() {
        if (document.getElementById('hv-armory-compat-style')) return;
        const style = document.createElement('style');
        style.id = 'hv-armory-compat-style';
        style.textContent = `
            #armory_outer .armory_tab { min-width:85px; box-sizing:border-box; }
        `;
        document.head.appendChild(style);
    }

    function ensureEqsbLayoutCompatibilityStyle() {
        if (document.getElementById('hv-eqsb-layout-compat-style')) return;
        const style = document.createElement('style');
        style.id = 'hv-eqsb-layout-compat-style';
        style.textContent = `
            #eqsb { overflow:visible !important; }
        `;
        document.head.appendChild(style);
    }

    function ensureEquipmentColorStyle() {
        if (document.getElementById('hv-equipment-color-style')) return;
        const style = document.createElement('style');
        style.id = 'hv-equipment-color-style';
        style.textContent = `
            [data-hv-eq-color-root="1"] { font-weight: inherit; }
            .hv-eq-token { border-radius:2px; padding:0 2px; line-height:1.18; box-shadow:inset 0 0 0 1px rgba(0,0,0,.12); box-decoration-break:clone; -webkit-box-decoration-break:clone; }
            #eqsb .eqb > div:last-child { padding:1px 0; }
            #eqsb [data-hv-eq-color-root="1"] { display:inline-block; max-width:100%; line-height:1.2; vertical-align:top; }
            #eqsb .hv-eq-token { display:inline-block; vertical-align:baseline; line-height:1.1; }
            .hv-eq-q-ultimate { background:#2b2b35; color:#f5f5f5;}
            .hv-eq-q-peerless { background:#ffd760; color:#111; }
            .hv-eq-q-legendary { background:#ffbbff; color:#111; }
            .hv-eq-q-magnificent { background:#a6daf6; color:#111; }
            .hv-eq-q-exquisite { background:#d7e698; color:#111; }
            .hv-eq-q-superior { background:#fbf9f9; color:#111; }
            .hv-eq-q-fine { background:#b9ffb9; color:#111; }
            .hv-eq-q-average { background:#dfdfdf; color:#111; }
            .hv-eq-q-fair { background:#c1c1c1; color:#111; }
            .hv-eq-q-crude { background:#acacac; color:#111; }
            .hv-eq-q-flimsy { background:#848482; color:#fff; }
            .hv-eq-void { background:#fff; color:#5c5a5a; }
            .hv-eq-fire-damage { background:#f97c7c; color:#111; }
            .hv-eq-fire-resist { background:#ffa6a6; color:#111; }
            .hv-eq-cold-damage { background:#94c2f5; color:#111; }
            .hv-eq-cold-resist { background:#a0f4f4; color:#111; }
            .hv-eq-elec-damage { background:#f4f375; color:#111; }
            .hv-eq-elec-resist { background:#ffff00; color:#9f9f16; }
            .hv-eq-wind-damage { background:#7ff97c; color:#111; }
            .hv-eq-wind-resist { background:#b1f9b1; color:#111; }
            .hv-eq-holy-damage { background:#fff; color:#111; }
            .hv-eq-holy-resist { background:#fff; color:#5c5a5a; }
            .hv-eq-dark-damage { background:#000; color:#fff; }
            .hv-eq-dark-resist { background:#ccc; color:#111; }
            .hv-eq-radiant { background:#fff; color:#111; }
            .hv-eq-offense-redtext { color:red; }
            .hv-eq-weight { background:#e8edf2; color:#b00000; }
            .hv-eq-agile { background:#ffa07a; color:#111; }
            .hv-eq-frugal { background:#f0e2ff; color:#7a1fa2; }
            .hv-eq-slaughter { background:#f00; color:#fff; }
            .hv-eq-balance { background:#daa520; color:#fff; }
            .hv-eq-swiftness { background:#ffdb58; color:#111; }
            .hv-eq-destruction { background:#9400d3; color:#fff; }
            .hv-eq-focus { background:#ba55d3; color:#fff; }
            .hv-eq-defense { background:#dcecff; color:#12395c; }
            .hv-eq-barrier { background:#4682b4; color:#fff; }
            .hv-eq-nimble { background:#ffa07a; color:#111; }
            .hv-eq-shadowdancer { background:#708090; color:#f0f8ff; }
            .hv-eq-battlecaster { background:#6a5acd; color:#fff; }
            .hv-eq-arcanist { background:#9370db; color:#fff; }
            .hv-eq-elementalist { background:#74d6d6; color:#073f3f; }
            .hv-eq-heaven { background:#fff4b8; color:#6b5600; }
            .hv-eq-vampire { background:#8b0000; color:#fff; }
            .hv-eq-special-material { background:#ffa500; color:#111; }
            .hv-eq-light { background:#666; color:#fff; }
            .hv-eq-heavy { background:#111; color:#fff; }
        `;
        document.head.appendChild(style);
    }

    function getEquipmentColorRules() {
        if (state.equipmentColorRulesCache) return state.equipmentColorRulesCache;
        const rules = [];
        for (const group of EQUIPMENT_COLOR_GROUPS) {
            for (const term of group.terms) {
                if (term) rules.push({ term, className: group.className });
            }
        }
        rules.sort((a, b) => b.term.length - a.term.length);
        state.equipmentColorRulesCache = rules;
        return rules;
    }

    function getAuctionEquipmentColorRules() {
        if (state.auctionEquipmentColorRulesCache) return state.auctionEquipmentColorRulesCache;
        const rules = getEquipmentColorRules().flatMap(rule => {
            const alias = AUCTION_EQUIPMENT_COLOR_ALIASES[rule.term];
            return alias && alias !== rule.term
                ? [rule, { ...rule, term: alias }]
                : [rule];
        });
        rules.sort((a, b) => b.term.length - a.term.length);
        state.auctionEquipmentColorRulesCache = rules;
        return rules;
    }

    function hasAnyTerm(text, terms) {
        return terms.some(term => text.includes(term));
    }

    function looksLikeEquipmentName(text, rules = getEquipmentColorRules()) {
        const value = String(text || '').trim();
        if (!value || value.length > 160 || /[。！？.!?]{2,}/.test(value)) return false;
        const qualityGroups = EQUIPMENT_COLOR_GROUPS.slice(0, EQUIPMENT_QUALITY_GROUP_COUNT);
        const hasQuality = qualityGroups.some(group => hasAnyTerm(value, group.terms));
        if (!hasQuality) return false;
        return hasAnyTerm(value, EQUIPMENT_NAME_HINTS) || rules.some(rule => value.includes(rule.term) && !qualityGroups.some(group => group.terms.includes(rule.term)));
    }

    function unwrapEquipmentColor(root, restoreOriginal) {
        if (!root?.querySelectorAll) return;
        state.applyingEquipmentColor = true;
        try {
            const wrappers = [
                ...(root.matches?.('[data-hv-eq-color-root="1"]') ? [root] : []),
                ...root.querySelectorAll('[data-hv-eq-color-root="1"]')
            ];
            for (const wrapper of wrappers) {
                const text = restoreOriginal && wrapper.dataset.hvOriginalText
                    ? wrapper.dataset.hvOriginalText
                    : wrapper.textContent;
                wrapper.replaceWith(document.createTextNode(text || ''));
            }
        } finally {
            state.applyingEquipmentColor = false;
        }
    }

    function restoreEquipmentColorToOriginal() {
        unwrapEquipmentColor(document, true);
    }

    function pruneDetachedTranslatedSnapshots() {
        for (const elem of state.translatedList.keys()) {
            if (!elem?.isConnected) state.translatedList.delete(elem);
        }
    }

    function colorizeEquipmentTextNode(node, rules = getEquipmentColorRules()) {
        const text = node.data;
        if (!looksLikeEquipmentName(text, rules)) return;
        const parent = node.parentElement;
        if (!parent || parent.closest('[data-hv-eq-color-root="1"]')) return;
        if (['SCRIPT', 'STYLE', 'TEXTAREA', 'SELECT', 'OPTION', 'BUTTON'].includes(parent.tagName)) return;

        const wrapper = document.createElement('font');
        wrapper.dataset.hvEqColorRoot = '1';
        const original = state.translatedList.get(node)?.data;
        if (original) wrapper.dataset.hvOriginalText = original;

        let index = 0;
        while (index < text.length) {
            const rule = rules.find(item => text.startsWith(item.term, index));
            if (!rule) {
                let next = text.length;
                for (const item of rules) {
                    const found = text.indexOf(item.term, index + 1);
                    if (found !== -1 && found < next) next = found;
                }
                wrapper.appendChild(document.createTextNode(text.slice(index, next)));
                index = next;
                continue;
            }
            const token = document.createElement('font');
            token.className = `hv-eq-token ${rule.className}`;
            token.dataset.hvEqColor = '1';
            token.textContent = rule.term;
            wrapper.appendChild(token);
            index += rule.term.length;
        }

        node.replaceWith(wrapper);
    }

    function applyEquipmentColor(root, mode = '') {
        if (!CONFIG.equipmentColorEnabled || !state.translated || !root) return;
        ensureEquipmentColorStyle();
        const rules = mode === 'auction' ? getAuctionEquipmentColorRules() : getEquipmentColorRules();
        state.applyingEquipmentColor = true;
        try {
            unwrapEquipmentColor(root, false);
            for (const node of getTextNodes(root)) colorizeEquipmentTextNode(node, rules);
        } finally {
            state.applyingEquipmentColor = false;
        }
    }

    function shouldApplyEquipmentColor(profileName) {
        return !!PROFILE_FEATURES[profileName]?.equipmentColor;
    }

    function ensureMonsterActionsVisualTextStyle() {
        if (document.getElementById('hv-monster-actions-visual-text-style')) return;
        const style = document.createElement('style');
        style.id = 'hv-monster-actions-visual-text-style';
        style.textContent = `
            #monster_actions [data-hv-monster-actions-visual-text]{font-size:0!important;}
            #monster_actions [data-hv-monster-actions-visual-text]::after{
                content:attr(data-hv-monster-actions-visual-text);
                font-size:var(--hv-monster-actions-visual-font-size,12px);
                line-height:var(--hv-monster-actions-visual-line-height,normal);
            }
        `;
        document.head.appendChild(style);
    }

    function translateMonsterActionsVisualValue(text) {
        const normalized = String(text || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
        let m = normalized.match(/^Cost:\s*([\d,]+)\s+Chaos Tokens?$/);
        if (m) return `消耗: ${m[1]} 混沌令牌`;
        m = normalized.match(/^Stock:\s*([\d,]+)$/);
        if (m) return `库存: ${m[1]}`;
        const translated = translateByDict(normalized, getCompiledDictByProfile('monsterLab'));
        return translated === normalized ? '' : translated;
    }

    function unwrapMonsterActionsVisualText(root = document) {
        const wrappers = [
            ...(root.matches?.('[data-hv-monster-actions-visual-text]') ? [root] : []),
            ...(root.querySelectorAll?.('[data-hv-monster-actions-visual-text]') || []),
        ];
        for (const wrapper of wrappers) {
            wrapper.replaceWith(document.createTextNode(wrapper.textContent || ''));
        }
    }

    function applyMonsterActionsVisualText(root) {
        const actions = root?.id === 'monster_actions'
            ? root
            : root?.closest?.('#monster_actions') || root?.querySelector?.('#monster_actions');
        if (!actions || !state.translated) return;
        ensureMonsterActionsVisualTextStyle();
        unwrapMonsterActionsVisualText(actions);

        for (const node of getTextNodes(actions)) {
            if (!node.parentElement || node.parentElement.closest('[data-hv-monster-actions-visual-text]')) continue;
            const translated = translateMonsterActionsVisualValue(node.data);
            if (!translated) continue;

            const wrapper = document.createElement('span');
            const computedStyle = getComputedStyle(node.parentElement);
            wrapper.dataset.hvMonsterActionsVisualText = translated;
            wrapper.style.setProperty('--hv-monster-actions-visual-font-size', computedStyle.fontSize || '12px');
            wrapper.style.setProperty('--hv-monster-actions-visual-line-height', computedStyle.lineHeight || 'normal');
            wrapper.textContent = node.data;
            node.replaceWith(wrapper);
        }
    }

    function ensureAttributeVisualTextStyle() {
        if (document.getElementById('hv-attribute-visual-text-style')) return;
        const style = document.createElement('style');
        style.id = 'hv-attribute-visual-text-style';
        style.textContent = `
            [data-hv-attribute-visual-text]{font-size:0!important;}
            [data-hv-attribute-visual-text]::after{
                content:attr(data-hv-attribute-visual-text);
                font-size:var(--hv-attribute-visual-font-size,12px);
                line-height:var(--hv-attribute-visual-line-height,normal);
            }
        `;
        document.head.appendChild(style);
    }

    function unwrapAttributeVisualText(root = document) {
        const wrappers = [
            ...(root.matches?.('[data-hv-attribute-visual-text]') ? [root] : []),
            ...(root.querySelectorAll?.('[data-hv-attribute-visual-text]') || []),
        ];
        for (const wrapper of wrappers) {
            wrapper.replaceWith(document.createTextNode(wrapper.textContent || ''));
        }
    }

    function getAttributeVisualRoots(root) {
        if (!root?.querySelectorAll && !root?.matches) return [];
        const roots = new Set();
        if (root.matches?.(ATTRIBUTE_VISUAL_SELECTOR)) roots.add(root);
        const closest = root.closest?.(ATTRIBUTE_VISUAL_SELECTOR);
        if (closest) roots.add(closest);
        root.querySelectorAll?.(ATTRIBUTE_VISUAL_SELECTOR).forEach(elem => roots.add(elem));
        return [...roots];
    }

    function applyAttributeVisualText(root) {
        if (!state.translated) return;
        const roots = getAttributeVisualRoots(root);
        if (!roots.length) return;
        ensureAttributeVisualTextStyle();

        for (const table of roots) {
            unwrapAttributeVisualText(table);
            for (const node of getTextNodes(table)) {
                if (!node.parentElement || node.parentElement.closest('[data-hv-attribute-visual-text]')) continue;
                const text = node.data;
                ATTRIBUTE_VISUAL_PATTERN.lastIndex = 0;
                if (!ATTRIBUTE_VISUAL_PATTERN.test(text)) continue;
                ATTRIBUTE_VISUAL_PATTERN.lastIndex = 0;

                const wrapper = document.createElement('span');
                const computedStyle = getComputedStyle(node.parentElement);
                wrapper.dataset.hvAttributeVisualText = text.replace(ATTRIBUTE_VISUAL_PATTERN, attr => ATTRIBUTE_VISUAL_LABELS[attr] || attr);
                wrapper.style.setProperty('--hv-attribute-visual-font-size', computedStyle.fontSize || '12px');
                wrapper.style.setProperty('--hv-attribute-visual-line-height', computedStyle.lineHeight || 'normal');
                wrapper.textContent = text;
                node.replaceWith(wrapper);
            }
        }
    }

    function applyProfileFeatures(root, profileName) {
        if (!state.translated) return;
        if (profileName === 'armory') ensureArmoryCompatibilityStyle();
        if (profileName === 'leftPanel') ensureEqsbLayoutCompatibilityStyle();
        if (shouldApplyEquipmentColor(profileName)) applyEquipmentColor(root, PROFILE_FEATURES[profileName]?.equipmentColorMode || '');
        if (profileName === 'monsterLab') applyMonsterActionsVisualText(root);
        if (profileName === 'leftPanel' || profileName === 'rightPanel') applyAttributeVisualText(root);
    }

    function clearProfileFeatures(root, profileName, restoreOriginal = false) {
        if (shouldApplyEquipmentColor(profileName)) unwrapEquipmentColor(root, restoreOriginal);
        if (profileName === 'monsterLab') unwrapMonsterActionsVisualText(root);
        if (profileName === 'leftPanel' || profileName === 'rightPanel') unwrapAttributeVisualText(root);
    }

    // =========================================================
    // 4.6) 游戏外装备链接翻译：只处理 /equip/id/key 与 /isekai/equip/id/key 链接
    // =========================================================
    const EXTERNAL_EQUIPMENT_LINK_SELECTOR = [
        'a[href*="hentaiverse.org/equip/"]',
        'a[href*="hentaiverse.org/isekai/equip/"]',
        'a[href*="alt.hentaiverse.org/equip/"]',
        'a[href*="alt.hentaiverse.org/isekai/equip/"]',
    ].join(', ');
    const EXTERNAL_EQUIPMENT_TEXT_SELECTOR = '#NAE_menu .NAE_name, #NAE_menu .NAE_lot_name, #NAE_menu .NAE_equip_name';
    const EXTERNAL_EQUIPMENT_QUALITY_ALIASES = {
        Peer: 'Peerless',
        Leg: 'Legendary',
        Mag: 'Magnificent',
        Exq: 'Exquisite',
    };
    const EXTERNAL_EQUIPMENT_QUALITY_WORDS = [
        'Ultimate', 'Peerless', 'Legendary', 'Magnificent', 'Exquisite', 'Superior', 'Fine', 'Average', 'Fair', 'Crude', 'Flimsy',
        ...Object.keys(EXTERNAL_EQUIPMENT_QUALITY_ALIASES),
    ];
    const EXTERNAL_EQUIPMENT_CORE_TYPE_WORDS = [
        'Axe', 'Club', 'Rapier', 'Shortsword', 'Wakizashi', 'Dagger', 'Mace', 'Katana', 'Longsword', 'Estoc', 'Scythe', 'Staff', 'Shield', 'Buckler',
        'Cap', 'Robe', 'Breastplate', 'Cuirass', 'Gloves', 'Gauntlets', 'Pants', 'Leggings', 'Greaves', 'Shoes', 'Boots', 'Sabatons', 'Helmet', 'Armor',
    ];
    const EXTERNAL_EQUIPMENT_TYPE_WORDS = [
        ...EXTERNAL_EQUIPMENT_CORE_TYPE_WORDS,
        'Cotton', 'Gossamer', 'Ironsilk', 'Phase', 'Leather', 'Drakehide', 'Shade', 'Power', 'Plate',
    ];

    function isGameHost() {
        return /(^|\.)hentaiverse\.org$/i.test(location.hostname) || /(^|\.)alt\.hentaiverse\.org$/i.test(location.hostname);
    }

    function isForumFontPage() {
        return /(^|\.)forums\.e-hentai\.org$/i.test(location.hostname);
    }

    function getExternalEquipmentMode() {
        if (isGameHost()) return '';
        if (document.getElementById('itemSections') || /(^|\.)reasoningtheory\.net$/i.test(location.hostname)) return 'auction';
        if (document.querySelector('.postcolor') || /(^|\.)forums\.e-hentai\.org$/i.test(location.hostname)) return 'forum';
        return '';
    }

    function isEquipmentLink(link) {
        const href = link?.getAttribute?.('href') || '';
        return /(?:^|\/\/)(?:alt\.)?hentaiverse\.org\/(?:isekai\/)?equip\/\d+\/[0-9a-f]+/i.test(href);
    }

    function normalizeExternalEquipmentName(text) {
        return String(text || '').replace(/\s+/g, ' ').trim();
    }

    function expandExternalEquipmentQualityAlias(text) {
        return normalizeExternalEquipmentName(text).replace(/\b(Exq|Peer|Leg|Mag)\b/g, (match) => EXTERNAL_EQUIPMENT_QUALITY_ALIASES[match] || match);
    }

    function looksLikeExternalEquipmentName(text) {
        const value = normalizeExternalEquipmentName(text);
        if (!value || value.length > 180) return false;
        return EXTERNAL_EQUIPMENT_QUALITY_WORDS.some(word => new RegExp(`\\b${word}\\b`).test(value))
            && EXTERNAL_EQUIPMENT_TYPE_WORDS.some(word => new RegExp(`\\b${word}\\b`).test(value));
    }

    function looksLikeExternalEquipmentLinkText(text) {
        const value = normalizeExternalEquipmentName(text);
        if (!value || value.length > 180) return false;
        return EXTERNAL_EQUIPMENT_CORE_TYPE_WORDS.some(word => new RegExp(`\\b${word}\\b`).test(value));
    }

    function translateExternalEquipmentName(text, mode) {
        const groups = mode === 'auction'
            ? ['equipment.auctionName', 'equipment.name']
            : ['equipment.name'];
        return translateByDict(expandExternalEquipmentQualityAlias(text), getCompiledDictByGroups(groups));
    }

    // 拍卖页已由 equipment.auctionName 直接翻译；这里仅为染色规则提供 ck 拍卖短名别名。
    const AUCTION_EQUIPMENT_COLOR_ALIASES = {
        '✪魔光✪(法伤+)': '✪魔光✪',
        '神秘(法爆伤+)': '神秘',
        '充能(施速+)': '充能',
        '加固的(斩打刺减伤+)': '加固的',
        '秘银的(负重-)': '秘银的',
        '俊敏的(攻速+)': '俊敏的',
        '节能(魔耗-)': '节能',
        '残暴的(攻爆伤+)': '残暴的',
        '虚空(无负重/干涉)': '虚空之',
        '灼热(火伤+)': '灼热之',
        '极寒(冰伤+)': '极寒之',
        '闪电(电伤+)': '闪电之',
        '风暴(风伤+)': '风暴之',
        '神圣(圣伤+)': '神圣之',
        '恶魔(暗伤+)': '恶魔之',
        '琥珀的(电抗+)': '琥珀的(雷抗)',
        '锆石的(圣抗+)': '锆石的(圣抗)',
        '翡翠的(风抗+)': '翡翠的(风抗)',
        '钴石的(冰抗+)': '钴石的(冰抗)',
        '红宝石(火抗+)': '红宝石(火抗)',
        '缟玛瑙(暗抗+)': '缟玛瑙(暗抗)',
        '杀戮(攻击+)': '杀戮',
        '迅捷(攻速+)': '加速',
        '平衡(攻命攻爆+)': '平衡',
        '毁灭(法伤+)': '毁灭',
        '专注(法爆魔命+魔耗-)': '专注',
        '灵活(招架+)': '招架',
        '屏障(格挡+)': '格挡',
        '吸血鬼(吸血+)': '吸血鬼',
        '汲灵(吸血/吸魔+)': '汲灵',
        '女妖(吸血/吸灵+)': '女妖',
        '影舞者(闪避/攻爆+)': '影舞者',
        '迅捷(闪避+)': '迅捷',
        '战法师(魔耗-魔命+)': '战法师',
        '元素使(元素熟练+)': '元素使',
        '天堂(神圣熟练+)': '天堂',
        '恶魔(黑暗熟练+)': '恶魔',
        '地行者(增益熟练+)': '地行者',
        '织咒者(减益熟练+)': '咒术师',
        '三重祝福(圣抗+)': '三重祝福',
        '霜裔(冰抗+)': '霜裔',
        '猎豹(敏捷+)': '猎豹',
        '浣熊(灵巧+)': '浣熊',
        '乌龟(体质+)': '乌龟',
        '公牛(力量+)': '公牛',
        '狐狸(智力+)': '狐狸',
        '猫头鹰(智慧+)': '猫头鹰',
        '噬火者(火抗+)': '噬火者',
        '雷之子(雷抗+)': '雷之子',
        '驭风者(风抗+)': '驭风者',
        '幽冥结界(暗抗+)': '幽冥结界',
        '苏尔特(火伤+)': '苏尔特(火伤)',
        '尼芙菲姆(冰伤+)': '尼芙菲姆(冰伤)',
        '姆乔尔尼尔(雷伤+)': '姆乔尔尼尔(雷伤)',
        '弗雷尔(风伤+)': '弗雷尔(风伤)',
        '海姆达尔(圣伤+)': '海姆达尔(圣伤)',
        '芬里尔(暗伤+)': '芬里尔(暗伤)',
        '否定(抵抗+)': '否定',
        '抑制(打减伤+)': '抑制',
        '石肤(斩减伤+)': '石肤',
        '偏转(刺减伤+)': '偏转',
        '保护(物减伤+)': '物防',
        '护佑(魔减伤+)': '魔防',
    };

    function simplifyAuctionEquipmentText(text) {
        const override = AUCTION_EQUIPMENT_COLOR_ALIASES[text];
        if (override) return override;
        return String(text || '')
            .replace(/\([^)]*\)/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function simplifyAuctionEquipmentChunk(text) {
        return String(text || '').replace(/\s+/g, ' ');
    }

    function getExternalEquipmentRenderRules(mode) {
        const colorRules = getEquipmentColorRules();
        if (mode !== 'auction') {
            return colorRules.map(rule => ({ ...rule, displayText: rule.term }));
        }

        const colorClassByTerm = new Map(colorRules.map(rule => [rule.term, rule.className]));
        const used = new Set();
        const rules = [];
        for (const [term, displayText] of Object.entries(AUCTION_EQUIPMENT_COLOR_ALIASES)) {
            rules.push({ term, displayText, className: colorClassByTerm.get(term) || '' });
            if (displayText && displayText !== term) {
                rules.push({ term: displayText, displayText, className: colorClassByTerm.get(term) || '' });
            }
            used.add(term);
        }
        for (const rule of colorRules) {
            if (used.has(rule.term)) continue;
            rules.push({ ...rule, displayText: simplifyAuctionEquipmentText(rule.term) });
        }
        return rules.sort((a, b) => b.term.length - a.term.length);
    }

    function renderExternalEquipmentName(translatedText, mode) {
        const fragment = document.createDocumentFragment();
        const source = String(translatedText || '');
        const rules = getExternalEquipmentRenderRules(mode);
        let index = 0;

        while (index < source.length) {
            const rule = rules.find(item => source.startsWith(item.term, index));
            if (!rule) {
                let next = source.length;
                for (const item of rules) {
                    const found = source.indexOf(item.term, index + 1);
                    if (found !== -1 && found < next) next = found;
                }
                const chunk = source.slice(index, next);
                fragment.appendChild(document.createTextNode(mode === 'auction' ? simplifyAuctionEquipmentChunk(chunk) : chunk));
                index = next;
                continue;
            }

            const tokenText = rule.displayText;
            if (tokenText) {
                if (rule.className) {
                    const token = document.createElement('font');
                    token.className = `hv-eq-token ${rule.className}`;
                    token.dataset.hvEqColor = '1';
                    token.textContent = tokenText;
                    fragment.appendChild(token);
                } else {
                    fragment.appendChild(document.createTextNode(tokenText));
                }
            }
            index += rule.term.length;
        }

        return fragment;
    }

    function unwrapForumEquipmentBold(link, mode) {
        if (mode !== 'forum') return;
        const wrapper = link?.parentElement;
        if (!wrapper || !['B', 'STRONG'].includes(wrapper.tagName)) return;
        const hasOnlyLinkAndWhitespace = [...wrapper.childNodes].every(node => {
            return node === link || (node.nodeType === Node.TEXT_NODE && !node.data.trim());
        });
        if (!hasOnlyLinkAndWhitespace) return;
        wrapper.replaceWith(link);
    }

    function restoreExternalEquipmentLinks(root = document) {
        const links = root.matches?.('[data-hv-ext-eq="1"]') ? [root] : [...root.querySelectorAll?.('[data-hv-ext-eq="1"]') || []];
        for (const link of links) {
            if (!link.dataset.hvExtEqOriginalHtml) continue;
            link.innerHTML = link.dataset.hvExtEqOriginalHtml;
            delete link.dataset.hvExtEq;
        }
        const textNodes = root.matches?.('[data-hv-ext-eq-text="1"]') ? [root] : [...root.querySelectorAll?.('[data-hv-ext-eq-text="1"]') || []];
        for (const elem of textNodes) {
            if (!elem.dataset.hvExtEqOriginalHtml) continue;
            elem.innerHTML = elem.dataset.hvExtEqOriginalHtml;
            delete elem.dataset.hvExtEqText;
        }
    }

    function translateExternalEquipmentLinks(root = document) {
        const mode = getExternalEquipmentMode();
        if (!mode || !state.translated) return;
        ensureEquipmentColorStyle();

        const links = root.matches?.(EXTERNAL_EQUIPMENT_LINK_SELECTOR)
            ? [root]
            : [...root.querySelectorAll?.(EXTERNAL_EQUIPMENT_LINK_SELECTOR) || []];
        for (const link of links) {
            if (!isEquipmentLink(link) || link.dataset.hvExtEq === '1') continue;
            const originalText = normalizeExternalEquipmentName(link.textContent);
            if (!looksLikeExternalEquipmentLinkText(originalText)) continue;

            const translated = translateExternalEquipmentName(originalText, mode);
            if (!translated || translated === originalText) continue;
            link.dataset.hvExtEqOriginalHtml = link.innerHTML;
            link.dataset.hvExtEqOriginalText = originalText;
            link.dataset.hvExtEq = '1';
            link.replaceChildren(renderExternalEquipmentName(translated, mode));
            unwrapForumEquipmentBold(link, mode);
        }
    }

    function translateExternalEquipmentTextNodes(root = document) {
        const mode = getExternalEquipmentMode();
        if (!mode || !state.translated) return;
        ensureEquipmentColorStyle();

        const nodes = root.matches?.(EXTERNAL_EQUIPMENT_TEXT_SELECTOR)
            ? [root]
            : [...root.querySelectorAll?.(EXTERNAL_EQUIPMENT_TEXT_SELECTOR) || []];
        for (const elem of nodes) {
            if (elem.dataset.hvExtEqText === '1') continue;
            const originalText = normalizeExternalEquipmentName(elem.textContent);
            if (!looksLikeExternalEquipmentName(originalText)) continue;

            const translated = translateExternalEquipmentName(originalText, mode);
            if (!translated || translated === originalText) continue;
            elem.dataset.hvExtEqOriginalHtml = elem.innerHTML;
            elem.dataset.hvExtEqOriginalText = originalText;
            elem.dataset.hvExtEqText = '1';
            elem.replaceChildren(renderExternalEquipmentName(translated, mode));
        }
    }

    function translateExternalEquipmentTooltips(root = document) {
        const mode = getExternalEquipmentMode();
        if (!mode || !state.translated || !root) return;
        const tips = root.matches?.('.showequip')
            ? [root]
            : [...root.querySelectorAll?.('.showequip') || []];
        if (!tips.length) return;

        const dict = getCompiledDictByProfile('equipmentDetail');
        for (const tip of tips) {
            if (tip.dataset.hvExtEqTip === '1') continue;
            tip.dataset.hvExtEqTip = '1';

            translateExternalEquipmentLinks(tip);
            clearProfileFeatures(tip, 'equipmentDetail');
            translateSection(tip, dict, true);
            translateContextSpecials(tip, 'equipmentDetail', true);
            applyProfileFeatures(tip, 'equipmentDetail');
        }
    }

    function translateExternalEquipmentSurfaces(root = document) {
        translateExternalEquipmentLinks(root);
        translateExternalEquipmentTextNodes(root);
        translateExternalEquipmentTooltips(root);
    }

    function applyForumFontScale() {
        if (!isForumFontPage()) return;
        const scale = Number(CONFIG.forumFontScale);
        if (!Number.isFinite(scale) || scale <= 0 || scale === 1) return;
        const style = document.createElement('style');
        style.id = 'hv-forum-font-scale-style';
        style.textContent = `
            :root { --hv-forum-font-scale:${scale}; }
            body,
            td,
            th,
            input,
            select,
            textarea,
            button,
            .postcolor,
            .postbody {
                font-size:calc(12px * var(--hv-forum-font-scale)) !important;
            }
            .maintitle {
                font-size:calc(13px * var(--hv-forum-font-scale)) !important;
            }
            .quotemain {
                font-size:calc(12px * var(--hv-forum-font-scale)) !important;
            }
            .subtitle,
            .forumdesc,
            .forumdesc a,
            .quotetop,
            .signature,
            .edit,
            #navstrip,
            #userlinks,
            #submenu {
                font-size:calc(11px * var(--hv-forum-font-scale)) !important;
            }
            #NAE_menu,
            #NAE_menu td,
            #NAE_menu th,
            #NAE_menu input,
            #NAE_menu select,
            #NAE_menu textarea,
            #NAE_menu button,
            #NAE_menu .maintitle,
            #NAE_menu .subtitle {
                font-size:12px !important;
            }
            #NAE_menu_section3 {
                font-size:20px !important;
            }
            #NAE_timezone_alert {
                font-size:16px !important;
            }
        `;
        document.head.appendChild(style);
    }

    function observeExternalEquipmentLinks() {
        const mode = getExternalEquipmentMode();
        if (!mode) return false;
        if (state.translated) translateExternalEquipmentSurfaces(document);
        if (!document.body) return true;
        if (state.externalEquipmentObserver) state.externalEquipmentObserver.disconnect();

        let timer = null;
        state.externalEquipmentObserver = new MutationObserver((mutations) => {
            if (!state.translated) return;
            const roots = new Set();
            for (const m of mutations) {
                if (m.type === 'childList') {
                    if (m.target?.nodeType === 1) roots.add(m.target);
                    for (const node of m.addedNodes || []) if (node.nodeType === 1) roots.add(node);
                }
            }
            if (!roots.size) return;
            clearTimeout(timer);
            timer = setTimeout(() => {
                for (const root of roots) translateExternalEquipmentSurfaces(root);
            }, CONFIG.observerDebounceMs);
        });
        state.externalEquipmentObserver.observe(document.body, { childList: true, subtree: true });
        return true;
    }

    // =========================================================
    // 5) 状态切换层：中英切换与原文恢复
    // =========================================================
    function restoreAllTranslated() {
        const externalMode = getExternalEquipmentMode();
        if (externalMode && state.translated) restoreExternalEquipmentLinks(document);
        if (state.translated) restoreEquipmentColorToOriginal();
        if (state.translated) unwrapMonsterActionsVisualText(document);
        if (state.translated) unwrapAttributeVisualText(document);
        state.translatedList.forEach((snapshot, elem) => {
            if (!elem) return;
            for (const [prop, oldVal] of Object.entries(snapshot)) {
                try {
                    const cur = elem[prop];
                    elem[prop] = oldVal;
                    snapshot[prop] = cur;
                } catch (_) {}
            }
        });
        pruneDetachedTranslatedSnapshots();

        if (state.imageTranslatedList.length) {
            for (const item of state.imageTranslatedList) {
                try {
                    if (state.translated) {
                        item.div.replaceWith(item.img);
                    } else {
                        item.img.replaceWith(item.div);
                    }
                } catch (_) {}
            }
        }

        state.translated = !state.translated;
        localStorage.setItem('hv_translate_enabled', String(state.translated));

        const btn = document.getElementById(CONFIG.ui.toggleButtonId);
        if (btn) btn.textContent = state.translated ? CONFIG.ui.toggleButtonTextCN : CONFIG.ui.toggleButtonTextEN;

        if (state.translated) {
            start();
        } else {
            if (state.abilityTreeImageStyle) {
                state.abilityTreeImageStyle.remove();
                state.abilityTreeImageStyle = null;
            }
            cleanupBattleTranslate();
            cleanupExternalEquipmentTranslate();
            cleanupShopAcceptButtonTranslate();
            document.getElementById('hv-monster-actions-visual-text-style')?.remove();
            document.getElementById('hv-attribute-visual-text-style')?.remove();
        }
    }

    function initToggleButton() {
        let btn = document.getElementById(CONFIG.ui.toggleButtonId);
        if (!btn) {
            btn = document.createElement('button');
            btn.id = CONFIG.ui.toggleButtonId;
            document.body.appendChild(btn);
        }
        btn.style.cssText = [
            'position:fixed',
            'top:2px',
            'right:2px',
            'z-index:9999',
            'width:18px',
            'height:18px',
            'padding:0',
            'border:1px solid rgba(0,0,0,.35)',
            'border-radius:2px',
            'background:rgba(255,255,255,.68)',
            'color:#111',
            'font:12px/16px sans-serif',
            'text-align:center',
            'cursor:pointer',
            'opacity:.7',
        ].join(';');
        btn.textContent = state.translated ? CONFIG.ui.toggleButtonTextCN : CONFIG.ui.toggleButtonTextEN;
        btn.title = '点击切换翻译';
        btn.onmouseenter = () => { btn.style.opacity = '1'; };
        btn.onmouseleave = () => { btn.style.opacity = '.7'; };
        btn.onclick = restoreAllTranslated;
    }

    // =========================================================
    // 6) 动态监听层：白名单 + 去重 + 防抖
    // =========================================================
    function observeDynamicSection(elem, selector, profileName) {
        const regionDef = REGION_DEFS[selector];
        if (regionDef?.enabled && !regionDef.enabled()) return;
        let timer = null;
        const observerOptions = {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['title', 'value', 'placeholder']
        };
        const reconnect = (observer) => observer.observe(elem, observerOptions);
        const observer = new MutationObserver((mutations) => {
            if (state.applyingEquipmentColor) return;
            if (!state.translated) return;
            const changed = new Set();
            for (const m of mutations) {
                if (m.type === 'characterData' && m.target?.parentElement) changed.add(m.target.parentElement);
                if (m.type === 'childList' && m.target?.nodeType === 1) changed.add(m.target);
                for (const node of m.addedNodes || []) {
                    if (node.nodeType === 1) {
                        changed.add(node);
                    } else if (node.nodeType === 3 && node.parentElement) {
                        changed.add(node.parentElement);
                    }
                }
                if (m.type === 'attributes' && m.target?.nodeType === 1) changed.add(m.target);
            }
            if (!changed.size) return;

            const immediateRoots = getImmediateDynamicRoots(selector, elem, changed);
            // 小型即时信息面板不能走通用防抖，否则会先闪出英文。
            if (immediateRoots.length) {
                observer.disconnect();
                try {
                    for (const root of immediateRoots) {
                        const resolvedProfile = resolveNodeProfile(selector, root, profileName);
                        const dict = getCompiledDictByProfile(resolvedProfile);
                        clearProfileFeatures(root, resolvedProfile);
                        translateSection(root, dict, true);
                        translateContextSpecials(root, resolvedProfile, true);
                        applyProfileFeatures(root, resolvedProfile);
                    }
                } finally {
                    reconnect(observer);
                }
                return;
            }
            if (changed.size > CONFIG.dynamicFullScanThreshold) {
                changed.clear();
                for (const root of getRegionTranslateRoots(selector, elem)) changed.add(root);
            }

            clearTimeout(timer);
            timer = setTimeout(() => {
                observer.disconnect();
                try {
                    for (const node of changed) {
                        for (const root of getRegionTranslateRoots(selector, node)) {
                            const resolvedProfile = resolveNodeProfile(selector, root, profileName);
                            const dict = getCompiledDictByProfile(resolvedProfile);
                            clearProfileFeatures(root, resolvedProfile);
                            translateSection(root, dict, true);
                            translateContextSpecials(root, resolvedProfile, true);
                            applyProfileFeatures(root, resolvedProfile);
                        }
                    }
                } finally {
                    reconnect(observer);
                }
            }, CONFIG.observerDebounceMs);
        });

        reconnect(observer);

        state.observers.add(observer);
    }

    function isArmoryAllPage() {
        if (!document.getElementById('armory_outer')) return false;
        const query = new URLSearchParams(location.search);
        return query.get('s') === 'Bazaar' && query.get('ss') === 'am' && query.get('filter') === 'all';
    }

    function shouldTranslateArmoryIntegratedNode(node) {
        if (!node?.isConnected || node.nodeType !== 1) return false;
        const text = node.textContent || '';
        if (!text.trim() || /^\s*Loading\.\.\./i.test(text)) return false;
        return !!(
            node.matches?.('tbody, tr, td, label, span') ||
            node.querySelector?.(`tr[onmouseover*="hover_equip"], .hvut-eqp-category, .hvut-eqp-type, ${INTEGRATED_EQUIPMENT_SUBHEADING_SELECTOR}`)
        );
    }

    function translateArmoryIntegratedNode(node) {
        if (!shouldTranslateArmoryIntegratedNode(node)) return;
        const dict = getCompiledDictByProfile('armory');
        if (!dict.length) return;
        clearProfileFeatures(node, 'armory');
        translateSection(node, dict, true);
        translateContextSpecials(node, 'armory', true);
        applyProfileFeatures(node, 'armory');
    }

    function observeArmoryIntegratedEquipList() {
        if (!isArmoryAllPage()) return;
        const table = document.querySelector('#armory_outer #equiplist > table');
        if (!table) return;

        let timer = null;
        const pending = new Set();
        const addPendingRoot = (node) => {
            if (!node || node.nodeType !== 1) return;
            if (node.matches?.('tbody')) {
                pending.add(node);
                return;
            }
            const tbody = node.closest?.('tbody');
            if (tbody) {
                pending.add(tbody);
                return;
            }
            if (node.matches?.('tr')) pending.add(node);
        };

        const observer = new MutationObserver((mutations) => {
            if (!state.translated || state.applyingEquipmentColor) return;
            for (const m of mutations) {
                for (const node of m.addedNodes || []) {
                    addPendingRoot(node);
                    if (node.nodeType === 1) {
                        node.querySelectorAll?.(`tbody, tr[onmouseover*="hover_equip"], tr.hvut-eqp-category, tr.hvut-eqp-type, ${INTEGRATED_EQUIPMENT_SUBHEADING_SELECTOR}`)
                            .forEach(addPendingRoot);
                    }
                }
            }
            if (!pending.size) return;

            clearTimeout(timer);
            timer = setTimeout(() => {
                observer.disconnect();
                try {
                    for (const node of pending) translateArmoryIntegratedNode(node);
                    pending.clear();
                } finally {
                    observer.observe(table, { childList: true, subtree: true });
                }
            }, 260);
        });

        observer.observe(table, { childList: true, subtree: true });
        state.observers.add(observer);
    }

    function translateShrineResultBox(isDynamic) {
        if (!document.getElementById('shrine_outer')) return false;
        const box = document.querySelector('#mainpane > #messagebox_outer');
        if (!box) return false;
        const dict = getCompiledDictByProfile('shrineResult');
        clearProfileFeatures(box, 'shrineResult');
        translateSection(box, dict, isDynamic);
        applyProfileFeatures(box, 'shrineResult');
        return true;
    }

    function disconnectAllObservers() {
        state.observers.forEach(obs => obs.disconnect());
        state.observers.clear();
    }

    function isDynamicRegionCovered(selector, node) {
        const parentSelector = REGION_DEFS[selector]?.coveredBy;
        return !!parentSelector && !!node.closest?.(parentSelector);
    }

    function isStaticRegionAlreadyTranslated(translatedRoots, node, profileName) {
        return translatedRoots.some(item => item.profileName === profileName && item.node.contains?.(node));
    }

    // =========================================================
    // 7) 特殊通道：浏览器弹窗翻译
    // =========================================================
    function hookAlertTranslate() {
        const dict = getCompiledDictByGroups(['phrase.alerts']);
        if (!dict.length) return;

        const rawAlert = window.alert;
        const rawPrompt = window.prompt;
        const rawConfirm = window.confirm;

        const translate = (txt) => (typeof txt === 'string' && state.translated) ? translateByDict(txt, dict) : txt;

        window.alert = (txt) => rawAlert(translate(txt));
        window.prompt = (txt, value) => rawPrompt(translate(txt), value);
        window.confirm = (txt) => rawConfirm(translate(txt));
    }

    // =========================================================
    // 8) 特殊通道：图片控件翻译
    // =========================================================
    // 静态按钮可替换为文字节点；状态型图片保留 DOM，并用 CSS content:url(data:) 替换显示。
    function ensureImageButtonTextStyle() {
        if (document.getElementById('hv-image2block-style')) return;
        const style = document.createElement('style');
        style.id = 'hv-image2block-style';
        style.textContent = `
            .hv-image2block {
                display:inline;
                font:bold 15px "Microsoft YaHei","微软雅黑",sans-serif;
                color:#202020;
                padding:1px 5px;
                user-select:none;
                cursor:pointer;
            }
            .hv-image2block.active {
                text-shadow:2px 2px 2px #EFD34F;
                color:#5C0D11;
            }
        `;
        document.head.appendChild(style);
    }

    function ensureShopAcceptButtonStyle() {
        if (document.getElementById('hv-shop-accept-style')) return;
        const style = document.createElement('style');
        style.id = 'hv-shop-accept-style';
        style.textContent = `
            #itshop_t3.hv-shop-accept-translated {
                position:relative;
            }
            #itshop_t3.hv-shop-accept-translated > #accept_button {
                opacity:0;
            }
            #itshop_t3.hv-shop-accept-translated::after {
                content:"购买";
                position:absolute;
                inset:0;
                display:flex;
                align-items:center;
                justify-content:center;
                font:bold 14px sans-serif;
                color:#5C0D11;
                text-shadow:2px 2px 2px #EFD34F;
                pointer-events:none;
                user-select:none;
            }
            #itshop_t3.hv-shop-accept-disabled::after {
                color:#202020;
                text-shadow:none;
            }
        `;
        document.head.appendChild(style);
    }

    function updateShopAcceptButtonState(img) {
        const parent = img?.parentElement;
        if (!parent) return;
        const src = img.getAttribute('src') || '';
        parent.classList.toggle('hv-shop-accept-disabled', /_d\.png(?:[?#].*)?$/i.test(src));
    }

    function translateShopAcceptButton(root = document) {
        if (!document.querySelector('#itshop_outer')) return;
        const img = root.matches?.('#accept_button')
            ? root
            : root.querySelector?.('#accept_button');
        if (!img || !img.closest?.('#itshop_outer')) return;

        ensureShopAcceptButtonStyle();
        const parent = img.parentElement;
        if (!parent) return;
        parent.classList.add('hv-shop-accept-translated');
        updateShopAcceptButtonState(img);

        if (state.shopAcceptObserver) state.shopAcceptObserver.disconnect();
        state.shopAcceptObserver = new MutationObserver(() => updateShopAcceptButtonState(img));
        state.shopAcceptObserver.observe(img, { attributes: true, attributeFilter: ['src'] });
    }

    function cleanupShopAcceptButtonTranslate() {
        if (state.shopAcceptObserver) {
            state.shopAcceptObserver.disconnect();
            state.shopAcceptObserver = null;
        }
        const img = document.getElementById('accept_button');
        const parent = img?.parentElement;
        if (parent) parent.classList.remove('hv-shop-accept-translated', 'hv-shop-accept-disabled');
    }

    function wordImageDataUrl(text, style = {}) {
        const strokeStyle = style.strokeStyle || '';
        const fillStyle = style.fillStyle || '#202020';
        const fontSize = style.fontSize || 14;
        const cacheKey = `img|${text}|${strokeStyle}|${fillStyle}|${fontSize}`;
        if (state.imageDataUrlCache.has(cacheKey)) return state.imageDataUrlCache.get(cacheKey);

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.height = fontSize + 2;
        canvas.width = Math.max(20, String(text).length * fontSize + 5);
        ctx.font = `bold ${fontSize}px "Microsoft YaHei", "SimHei", sans-serif`;
        ctx.textBaseline = 'alphabetic';

        if (strokeStyle) {
            ctx.strokeStyle = strokeStyle;
            ctx.lineWidth = 2;
            ctx.strokeText(text, 0, fontSize);
        }
        ctx.fillStyle = fillStyle;
        ctx.fillText(text, 2, fontSize);

        const dataUrl = canvas.toDataURL();
        if (state.imageDataUrlCache.size > 120) {
            const firstKey = state.imageDataUrlCache.keys().next().value;
            state.imageDataUrlCache.delete(firstKey);
        }
        state.imageDataUrlCache.set(cacheKey, dataUrl);
        return dataUrl;
    }

    function imageContentRule(filename, text, style) {
        return `img[src*="${filename}"]{content:url(${wordImageDataUrl(text, style)})}`;
    }

    function translateAbilityTreeImagesByCss() {
        if (!document.getElementById('ability_treelist')) return;
        if (!state.abilityTreeImageStyle) {
            state.abilityTreeImageStyle = document.createElement('style');
            state.abilityTreeImageStyle.id = 'hv-ability-tree-image-translate';
            document.head.appendChild(state.abilityTreeImageStyle);
        }

        const normal = { fontSize: 14 };
        const active = { fontSize: 14, strokeStyle: '#EFD34F', fillStyle: '#5C0D11' };
        const rules = [];
        for (const [key, label] of Object.entries(ABILITY_TAB_LABELS)) {
            rules.push(imageContentRule(`/y/ab/ta${key}.png`, label, active));
            rules.push(imageContentRule(`/y/ab/td${key}.png`, label, normal));
        }
        state.abilityTreeImageStyle.textContent = rules.join('\n');
    }

    function monsterStatusBarBackground(label) {
        const cacheKey = `monsterStatusBar|${label}`;
        if (state.imageDataUrlCache.has(cacheKey)) return state.imageDataUrlCache.get(cacheKey);

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 200;
        canvas.height = 22;
        ctx.font = 'bold 12px "Microsoft YaHei", "SimHei", sans-serif';
        ctx.strokeStyle = '#000';
        ctx.strokeRect(63, 6, 122, 10);
        ctx.fillStyle = '#000';
        ctx.fillText(label, 30, 15);

        const dataUrl = canvas.toDataURL();
        state.imageDataUrlCache.set(cacheKey, dataUrl);
        return dataUrl;
    }

    function translateMonsterStatusBarsByCss() {
        if (!document.querySelector('#monster_outer .msl > div.msn img[src*="/y/bar_"]')) return;
        let style = document.getElementById('hv-monster-status-bar-translate');
        if (!style) {
            style = document.createElement('style');
            style.id = 'hv-monster-status-bar-translate';
            document.head.appendChild(style);
        }
        style.textContent = [
            `#monster_outer .msl > div:nth-child(5) > div{background:url(${monsterStatusBarBackground('饥饿')}) no-repeat;}`,
            `#monster_outer .msl > div:nth-child(6) > div{background:url(${monsterStatusBarBackground('情绪')}) no-repeat;}`,
        ].join('\n');
    }

    function replaceImageButtonsWithText(root = document) {
        if (!document.querySelector('#navbar, #persona_outer, #attr_outer, #mmail_outer, #ability_outer, #eqsl, #monster_outer, #monster_actions, #arena_list, #towerstart, #grindfest, #mainpane')) return;
        ensureImageButtonTextStyle();

        const imgs = root.querySelectorAll([
            '#navbar img[src*="/y/m/"]',
            '#persona_outer img[src*="/y/monster/rename.png"]',
            '#persona_new img[src*="/y/character/persona_create_"]',
            '#attr_outer img[src*="/y/character/apply.png"]',
            '#mmail_outer img[src*="/y/mmail/"]',
            '#ability_outer img[src*="/y/ab/reset"]',
            '#eqsl img[src*="/y/equip/set"]',
            '#monster_outer img[src*="/y/monster/"]',
            '#monster_actions img[src*="/y/monster/"]',
            '#arena_list img[src*="/y/arena/startchallenge"]',
            '#towerstart img[src*="/y/arena/startchallenge"]',
            '#grindfest img[src*="/y/grindfest/startgrindfest.png"]',
            '#mainpane img[src*="/y/training/"]',
            '#riddlepon img[src*="/y/battle/ponychartbutton.png"]',
            '#mainpane img[src*="/y/shops/buytickets"]',
            '#mainpane img[src*="/y/shops/lottery_"]',
        ].join(', '));
        for (const img of imgs) {
            if (!img || img.dataset.hvImageReplaced === '1') continue;
            const src = img.getAttribute('src') || '';
            const file = src.split('/').pop() || '';
            const label = getImageButtonLabel(file);
            if (!label) continue;

            const div = document.createElement('div');
            div.textContent = label;
            div.className = `hv-image2block ${isImageButtonActive(file) ? 'active' : ''}`.trim();

            const onclick = img.getAttribute('onclick');
            const onmouseover = img.getAttribute('onmouseover');
            const onmouseout = img.getAttribute('onmouseout');
            if (onclick) div.setAttribute('onclick', onclick);
            if (onmouseover) div.setAttribute('onmouseover', onmouseover);
            if (onmouseout) div.setAttribute('onmouseout', onmouseout);

            img.dataset.hvImageReplaced = '1';
            div.dataset.hvImageReplaced = '1';
            img.replaceWith(div);
            state.imageTranslatedList.push({ img, div });
        }
    }

    function initImageTranslate() {
        translateAbilityTreeImagesByCss();
        translateMonsterStatusBarsByCss();
        replaceImageButtonsWithText(document);
        translateShopAcceptButton(document);
    }

    // =========================================================
    // 9) 特殊通道：战斗页翻译
    // =========================================================
    function getBattleDict() {
        return getCompiledDictByGroups(['domain.battle', 'base.items', 'base.spells', 'base.effects', 'base.weaponEffects', 'phrase.consumableTooltip', 'phrase.battleTooltip']);
    }

    function getBattleLootDict() {
        return getCompiledDictByGroups(['base.items', 'equipment.name']);
    }

    function translateBattleTextValue(value) {
        if (!state.translated) return value;
        if (typeof value !== 'string' || !/[a-zA-Z]/.test(value)) return value;
        return translateByDict(value, getBattleDict());
    }

    function translateBattleLootValue(value) {
        if (!state.translated) return value;
        if (typeof value !== 'string' || !/[a-zA-Z]/.test(value)) return value;
        return translateByDict(value, getBattleLootDict());
    }

    const BATTLE_SKILL_PANEL_SELECTORS = ['#pane_skill', '#pane_magic', '#pane_item', '#table_skills', '#table_magic', '#item_pane'];

    function hasBattleSurface() {
        return !!document.querySelector('#battle_main, #btcp, #textlog');
    }

    function translateBattleSkillPanels() {
        if (!document.querySelector('#battle_main')) return;
        const dict = getBattleDict();
        for (const selector of BATTLE_SKILL_PANEL_SELECTORS) {
            const root = document.querySelector(selector);
            if (root) translateBattleSectionVisually(root, dict);
        }
    }

    function translateBattleStatic() {
        if (!hasBattleSurface()) return;
        translateBattleSkillPanels();
        translateBattleSettlement();
        translateBattleInfopane();
    }

    function ensureBattleInfopaneStyle() {
        if (document.getElementById('hv-battle-infopane-style')) return;
        const style = document.createElement('style');
        style.id = 'hv-battle-infopane-style';
        style.textContent = `
            #infopane{box-sizing:border-box;max-width:calc(100vw - 24px);overflow-wrap:break-word;word-break:normal;}
            #infopane div,#infopane span{white-space:normal;}
            #infopane [style*="width:601px"]{max-width:calc(100% - 40px);}
            #table_skills .fc2,#table_magic .fc2,#pane_item .fc2{height:auto;line-height:13px;}
            #table_skills .fc2>div,#table_magic .fc2>div,#pane_item .fc2>div{
                font-family:"Microsoft YaHei","SimHei",Arial,sans-serif;
                top:0;
                line-height:13px;
            }
        `;
        document.head.appendChild(style);
    }

    function translateBattleSettlement() {
        const settlement = document.getElementById('btcp');
        if (!settlement) return false;
        translateBattleSectionVisually(settlement, getBattleDict());
        return true;
    }

    function initBattleImageTranslate() {
        if (!document.querySelector('#battle_main')) return;
        if (!state.battleImageStyle) {
            state.battleImageStyle = document.createElement('style');
            state.battleImageStyle.id = 'hv-battle-image-translate';
        }

        const normal = {};
        const active = { strokeStyle: '#EFD34F', fillStyle: '#5C0D11' };
        const selected = { strokeStyle: '#F8DA34', fillStyle: '#0030CB' };
        const locked = { strokeStyle: '#EE3632', fillStyle: '#000000' };
        const rules = [];

        for (const item of [
            { text: '技能', active: 'sbsel_skills_s.png', normal: 'sbsel_skills_n.png' },
            { text: '法术', active: 'sbsel_spells_s.png', normal: 'sbsel_spells_n.png' },
            { text: '固有技能', normal: 'skills_innate.png' },
            { text: '武器技能', normal: 'skills_weapon.png' },
            { text: '伤害法术', normal: 'magic_damage.png' },
            { text: '减益法术', normal: 'magic_debuff.png' },
            { text: '治疗法术', normal: 'magic_curative.png' },
            { text: '辅助法术', normal: 'magic_support.png' },
            { text: '继续竞技场', active: 'arenacontinue.png' },
            { text: '继续压榨界', active: 'grindfestcontinue.png' },
            { text: '继续道具界', active: 'itemworldcontinue.png' },
            { text: '结束战斗', active: 'finishbattle.png' },
            { text: '回答', active: '/y/battle/answer.png' },
            { text: '名称参考', active: '/y/battle/ponychartbutton.png' },
        ]) {
            if (item.normal) rules.push(imageContentRule(item.normal, item.text, normal));
            if (item.active) rules.push(imageContentRule(item.active, item.text, active));
        }

        for (const [key, text] of Object.entries({
            attack: '攻击',
            skill: '技能',
            items: '物品',
            spirit: '灵动架势',
            defend: '防御',
            focus: '专注',
        })) {
            rules.push(imageContentRule(`${key}_n.png`, text, active));
            rules.push(imageContentRule(`${key}_s.png`, text, selected));
            rules.push(imageContentRule(`${key}_a.png`, text, locked));
        }

        state.battleImageStyle.textContent = rules.join('\n');
        if (!state.battleImageStyle.isConnected) document.head.appendChild(state.battleImageStyle);
    }

    function hookBattleInfopaneMethods() {
        const battle = window.battle;
        if (!battle || state.battleHooked === battle) return;

        let didWrap = false;
        const wrap = (name) => {
            const original = battle[name];
            if (typeof original !== 'function' || original._hvTranslated) return;
            const wrapped = function (...args) {
                const result = original.apply(this, args);
                setTimeout(translateBattleInfopane, 0);
                return result;
            };
            wrapped._hvTranslated = true;
            battle[name] = wrapped;
            didWrap = true;
        };

        wrap('set_infopane');
        wrap('set_infopane_spell');
        wrap('set_infopane_effect');

        if (didWrap) state.battleHooked = battle;
    }

    function translateBattleInfopane() {
        const pane = document.getElementById('infopane');
        if (!pane) return false;
        translateBattleSectionVisually(pane, getBattleDict());
        return true;
    }

    function observeBattleInfopane() {
        const pane = document.getElementById('infopane');
        if (!pane) return;
        if (state.battleInfopaneObserver) state.battleInfopaneObserver.disconnect();

        const dict = getBattleDict();
        let timer = null;
        state.battleInfopaneObserver = new MutationObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(() => translateBattleSectionVisually(pane, dict), 0);
        });
        state.battleInfopaneObserver.observe(pane, { childList: true, subtree: true, characterData: true });
    }

    function observeBattleSkillPanels() {
        const root = document.getElementById('battle_main');
        if (!root) return;
        if (state.battleSkillPanelObserver) state.battleSkillPanelObserver.disconnect();

        let timer = null;
        state.battleSkillPanelObserver = new MutationObserver((mutations) => {
            const hasSkillPanelChange = mutations.some(m => {
                const target = m.target?.nodeType === 1 ? m.target : m.target?.parentElement;
                if (target?.closest?.(BATTLE_SKILL_PANEL_SELECTORS.join(','))) return true;
                return [...m.addedNodes || []].some(node => {
                    if (node.nodeType !== 1) return false;
                    return BATTLE_SKILL_PANEL_SELECTORS.some(selector => node.matches?.(selector) || node.querySelector?.(selector));
                });
            });
            if (!hasSkillPanelChange) return;
            clearTimeout(timer);
            timer = setTimeout(translateBattleSkillPanels, CONFIG.observerDebounceMs);
        });
        state.battleSkillPanelObserver.observe(root, { childList: true, subtree: true, characterData: true });
    }

    function observeBattleSettlement() {
        const root = document.body;
        if (!root) return;
        if (state.battleSettlementObserver) state.battleSettlementObserver.disconnect();

        let timer = null;
        state.battleSettlementObserver = new MutationObserver((mutations) => {
            const hasSettlementChange = mutations.some(m => {
                const target = m.target?.nodeType === 1 ? m.target : m.target?.parentElement;
                if (target?.id === 'btcp' || target?.closest?.('#btcp')) return true;
                return [...m.addedNodes || []].some(node => node.nodeType === 1 && (node.id === 'btcp' || node.querySelector?.('#btcp')));
            });
            if (!hasSettlementChange) return;
            clearTimeout(timer);
            timer = setTimeout(translateBattleSettlement, CONFIG.observerDebounceMs);
        });
        state.battleSettlementObserver.observe(root, { childList: true, subtree: true });
    }

    const BATTLE_DAMAGE_TYPES = {
        crushing: '打击',
        slashing: '斩击',
        piercing: '刺击',
        fire: '火焰',
        cold: '冰冷',
        elec: '闪电',
        wind: '疾风',
        holy: '神圣',
        dark: '黑暗',
        void: '虚空',
    };
    const BATTLE_RESOURCES = {
        health: '生命',
        magic: '法力',
        spirit: '灵力',
    };
    const BATTLE_ACTIONS = {
        hit: '击中',
        hits: '击中',
        crit: '暴击',
        crits: '暴击',
        glance: '擦过',
        glanced: '擦过',
        glances: '擦过',
        counter: '反击',
    };
    const BATTLE_PROFICIENCIES = {
        'one-handed weapon': '单手武器',
        'two-handed weapon': '双手武器',
        'dual wielding': '双持',
        'dual-wielding': '双持',
        'staff': '法杖',
        'cloth armor': '布甲',
        'light armor': '轻甲',
        'heavy armor': '重甲',
        'elemental magic': '元素魔法',
        'divine magic': '神圣魔法',
        'forbidden magic': '黑暗魔法',
        'deprecating magic': '减益魔法',
        'supportive magic': '增益魔法',
    };

    function translateBattleDamageType(type) {
        return BATTLE_DAMAGE_TYPES[String(type || '').toLowerCase()] || type;
    }

    function translateBattleResource(resource) {
        return BATTLE_RESOURCES[String(resource || '').toLowerCase()] || resource;
    }

    function translateBattleEffect(effect) {
        if (!effect) return effect;
        const m = String(effect).trim().match(/^(.+?)(\s*\(x\d+\))?$/);
        if (!m) return translateBattleTextValue(effect);
        return `${translateBattleTextValue(m[1])}${m[2] || ''}`;
    }

    function translateBattleTerm(text) {
        return translateBattleTextValue(String(text || '').trim());
    }

    function translateBattleLootTerm(text) {
        return translateBattleLootValue(String(text || '').trim());
    }

    function translateBattleResult(result) {
        const text = String(result || '').toLowerCase();
        const multiCrit = text.match(/^(\d+)x-crits?$/);
        if (multiCrit) return `${multiCrit[1]}倍暴击`;
        return BATTLE_ACTIONS[text] || result;
    }

    function translateBattleProficiency(proficiency) {
        return BATTLE_PROFICIENCIES[String(proficiency || '').toLowerCase()] || proficiency;
    }

    function translateBattleScanValue(label, value) {
        const text = String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
        if (!text) return '';
        if (label === 'Monster Class') {
            return {
                Common: '普通',
                Rare: '稀有',
                Legendary: '传奇',
                Ultimate: '终极',
                God: '神级',
            }[text] || text;
        }

        let m = text.match(/^(.+?);\s*Accuracy\s*([\d.]+)\s*\(([\d.]+)% hit chance against player\)$/i);
        if (m) return `${translateBattleDamageType(m[1])}；命中 ${m[2]}（对玩家命中率 ${m[3]}%）`;

        m = text.match(/^Evade\s*([\d.]+)\s*\(([\d.]+)% base chance vs player attack,\s*([\d.]+)% base chance vs player magic\)$/i);
        if (m) return `闪避 ${m[1]}（攻击闪避率 ${m[2]}%，魔法闪避率 ${m[3]}%）`;

        m = text.match(/^Parry\s*([\d.]+)\s*\(([\d.]+)% base chance vs player attack\)\s*Resist\s*([\d.]+)\s*\(([\d.]+)% base chance vs player magic\)$/i);
        if (m) return `招架 ${m[1]}（招架率 ${m[2]}%）；抵抗 ${m[3]}（抵抗率 ${m[4]}%）`;

        return text.replace(/(Fire|Cold|Elec|Wind|Holy|Dark|Crushing|Slashing|Piercing):([+-]?\d+%)/gi, (_, type, amount) => `${translateBattleDamageType(type)}:${amount} `).trim();
    }

    function parseBattleScanLog(text) {
        const raw = String(text || '').replace(/\u00a0/g, ' ');
        const normalized = raw.replace(/\r/g, '');
        const lines = normalized.split('\n').map(line => line.trim()).filter(Boolean);
        if (!lines.length || !/^Scanning\s+.+\.\.\./i.test(lines[0])) return null;

        const first = lines[0].replace(/\s+/g, ' ');
        const head = first.match(/^Scanning\s+(.+?)\.\.\.\s+HP:\s*([\d,]+)\s*\/\s*([\d,]+)\s+MP:\s*([\d.]+%)\s+SP:\s*([\d.]+%)$/i);
        const result = {
            name: head ? head[1] : first.replace(/^Scanning\s+/i, '').replace(/\.\.\..*$/, ''),
            hp: head ? `${head[2]} / ${head[3]}` : '',
            mp: head ? head[4] : '',
            sp: head ? head[5] : '',
            rows: [],
        };

        const labels = {
            'Monster Class:': ['怪物类型', 'Monster Class'],
            'Melee Attack:': ['近战攻击', 'Melee Attack'],
            'Avoidance:': ['回避', 'Avoidance'],
            'Intercept:': ['拦截', 'Intercept'],
            'Resists:': ['抗性', 'Resists'],
        };
        for (let i = 1; i < lines.length; i++) {
            const label = labels[lines[i]];
            if (!label) continue;
            const value = lines[i + 1] || '';
            result.rows.push({ label: label[0], value: translateBattleScanValue(label[1], value) });
            i++;
        }
        return result;
    }

    function renderBattleScanLog(text) {
        const data = parseBattleScanLog(text);
        if (!data) return null;

        const box = document.createElement('div');
        box.className = 'hv-log-scan';

        const title = document.createElement('div');
        title.className = 'hv-log-scan-title';
        title.textContent = `扫描 ${data.name}`;
        box.appendChild(title);

        if (data.hp || data.mp || data.sp) {
            const stats = document.createElement('div');
            stats.className = 'hv-log-scan-stats';
            const parts = [];
            if (data.hp) parts.push(`生命: ${data.hp}`);
            if (data.mp) parts.push(`法力: ${data.mp}`);
            if (data.sp) parts.push(`灵力: ${data.sp}`);
            stats.textContent = parts.join('    ');
            box.appendChild(stats);
        }

        for (const row of data.rows) {
            const line = document.createElement('div');
            line.className = 'hv-log-scan-row';
            const label = document.createElement('span');
            label.className = 'hv-log-scan-label';
            label.textContent = `${row.label}:`;
            line.appendChild(label);
            line.appendChild(document.createTextNode(` ${row.value}`));
            box.appendChild(line);
        }
        return box;
    }

    function translateBattleDefense(text) {
        if (!text) return '';
        return text
            .replace(/you block and partially parry the attack/gi, '你格挡并部分招架了攻击')
            .replace(/you partially block and partially parry the attack/gi, '你部分格挡并部分招架了攻击')
            .replace(/you partially block and resist the attack/gi, '你部分格挡并抵抗了攻击')
            .replace(/you partially block the attack/gi, '你部分格挡了攻击')
            .replace(/you partially parry the attack/gi, '你部分招架了攻击')
            .replace(/you resist the attack/gi, '你抵抗了攻击')
            .replace(/you take/gi, '你受到');
    }

    function translateBattleTargetDefense(defense) {
        return {
            'partially parries': '但对方部分招架',
            'parries': '但对方招架',
        }[String(defense || '').toLowerCase()] || '';
    }

    function translateRiddlemasterResponse(line) {
        return {
            'The Riddlemaster listens to your answer, tries to keep a pensive face, then breaks into a wide grin': '谜语大师听了你的回答，努力保持沉思的表情，然后咧嘴大笑。',
            'The Riddlemaster listens to your answer and winks at you': '谜语大师听了你的回答，向你眨眼。',
            'The Riddlemaster listens to your answer and cackles hysterically.': '谜语大师听了你的回答，歇斯底里地笑了起来。',
            'The Riddlemaster listens to your answer and grins mischievously.': '谜语大师听了你的回答，顽皮地笑了起来。',
            'The Riddlemaster listens to your answer and shows no reaction whatsoever.': '谜语大师听了你的回答，没有任何反应。',
            'The Riddlemaster listens to your answer and snorts ambiguously.': '谜语大师听了你的回答，含糊地哼了一声。',
        }[line] || null;
    }

    function translateBattleLogActionLine(line) {
        let m = line.match(/^(.+) restores ([\d,]+) points of (health|magic|spirit)\.$/i);
        if (m) return `${translateBattleEffect(m[1])}恢复 ${m[2]} 点${translateBattleResource(m[3])}。`;

        m = line.match(/^Time Bonus: Recovered ([\d,]+) HP, ([\d,]+) MP and ([\d,]+) SP\.$/i);
        if (m) return `快速回答奖励：恢复 ${m[1]} 点生命、${m[2]} 点法力和 ${m[3]} 点灵力。`;

        const riddlemasterResponse = translateRiddlemasterResponse(line);
        if (riddlemasterResponse !== null) return riddlemasterResponse;

        m = line.match(/^Your spike shield hits (.+) for ([\d,]+) points of (.+) damage\.$/i);
        if (m) return `你的尖刺盾击中 ${m[1]}，造成 ${m[2]} 点${translateBattleDamageType(m[3])}伤害。`;

        m = line.match(/^(.+) gains the effect (.+)\.$/);
        if (m) return `${m[1]} 获得效果 ${translateBattleEffect(m[2])}。`;

        m = line.match(/^Your offhand attack ((?:\d+x-)?(?:hits|crits|glances)) (.+?)(?:, which (partially parries|parries))?, causing ([\d,]+) points of (.+) damage\.$/i);
        if (m) return `你的副手攻击${translateBattleResult(m[1])} ${m[2]}${m[3] ? `，${translateBattleTargetDefense(m[3])}` : ''}，造成 ${m[4]} 点${translateBattleDamageType(m[5])}伤害。`;

        m = line.match(/^You ((?:\d+x-)?(?:hit|crit|glance)) (.+?)(?:, which (partially parries|parries))?, causing ([\d,]+) points of (.+) damage\.$/i);
        if (m) return `你${translateBattleResult(m[1])} ${m[2]}${m[3] ? `，${translateBattleTargetDefense(m[3])}` : ''}，造成 ${m[4]} 点${translateBattleDamageType(m[5])}伤害。`;

        m = line.match(/^(.+) (hits|crits|glances) you; (.+), and take ([\d,]+) (?:points of )?(.+) damage\.$/i);
        if (m) return `${m[1]}${translateBattleResult(m[2])}你；${translateBattleDefense(m[3])}，受到 ${m[4]} 点${translateBattleDamageType(m[5])}伤害。`;

        m = line.match(/^(.+) (hits|crits|glances) you, causing ([\d,]+) points of (.+) damage\.$/i);
        if (m) return `${m[1]}${translateBattleResult(m[2])}你，造成 ${m[3]} 点${translateBattleDamageType(m[4])}伤害。`;

        m = line.match(/^(.+?) ((?:\d+x-)?(?:hits|crits|glances)) (.+?)(?:, which (partially parries|parries))?, causing ([\d,]+) points of (.+) damage\.$/i);
        if (m) return `${translateBattleTerm(m[1])}${translateBattleResult(m[2])} ${m[3]}${m[4] ? `，${translateBattleTargetDefense(m[4])}` : ''}，造成 ${m[5]} 点${translateBattleDamageType(m[6])}伤害。`;

        m = line.match(/^(.+?) (?:is )?eviscerated for ([\d,]+) (.+) damage, putting it out of its misery\.?$/i);
        if (m) return `${m[1]}被终结，受到 ${m[2]} 点${translateBattleDamageType(m[3])}伤害，就此从痛苦中解脱。`;

        m = line.match(/^(.+) hits (.+), causing ([\d,]+) additional points of (.+) damage\.$/i);
        if (m) return `${translateBattleTerm(m[1])}击中 ${m[2]}，额外造成 ${m[3]} 点${translateBattleDamageType(m[4])}伤害。`;

        m = line.match(/^You counter (.+) for ([\d,]+) points of (.+) damage\.$/i);
        if (m) return `你反击 ${m[1]}，造成 ${m[2]} 点${translateBattleDamageType(m[3])}伤害。`;

        m = line.match(/^(.+) hits (.+) for ([\d,]+) damage\.$/);
        if (m) return `${translateBattleEffect(m[1])}击中 ${m[2]}，造成 ${m[3]} 点伤害。`;

        m = line.match(/^(.+) vigorously whiffs at a shadow, missing you completely\.$/);
        if (m) return `${m[1]} 猛烈挥向影子，完全没有击中你。`;

        m = line.match(/^You gain the effect (.+)\.$/);
        if (m) return `你获得效果 ${translateBattleEffect(m[1])}。`;

        m = line.match(/^The effect (.+) on (.+) has worn off\.$/);
        if (m) return `${m[2]} 身上的 ${translateBattleEffect(m[1])} 效果已消失。`;

        m = line.match(/^You drain ([\d,]+) points of (health|magic|spirit) from (.+)\.?$/i);
        if (m) return `你从 ${m[3]} 吸取 ${m[1]} 点${translateBattleResource(m[2])}。`;

        m = line.match(/^(.+) has been defeated\.$/);
        if (m) return `${m[1]} 已被击败。`;

        m = line.match(/^(.+) uses (.+), which (hits|crits|glances)! (.+), and take ([\d,]+) (?:points of )?(.+) damage\.$/i);
        if (m) return `${m[1]}使用 ${translateBattleTerm(m[2])}，${translateBattleResult(m[3])}！${translateBattleDefense(m[4])}，受到 ${m[5]} 点${translateBattleDamageType(m[6])}伤害。`;

        m = line.match(/^(.+) uses (.+), which (hits|crits|glances)! You take ([\d,]+) (?:points of )?(.+) damage\.$/i);
        if (m) return `${m[1]}使用 ${translateBattleTerm(m[2])}，${translateBattleResult(m[3])}！你受到 ${m[4]} 点${translateBattleDamageType(m[5])}伤害。`;

        m = line.match(/^You (block|parry|evade) the attack from (.+)\.$/i);
        if (m) {
            const action = { block: '格挡', parry: '招架', evade: '闪避' }[m[1].toLowerCase()];
            return `你${action}了来自 ${m[2]} 的攻击。`;
        }

        m = line.match(/^(.+) uses (.+) in the general direction of a shadow, missing you completely\.$/);
        if (m) return `${m[1]}对着影子的大致方向使用 ${translateBattleTerm(m[2])}，完全没有击中你。`;

        m = line.match(/^You (block and partially parry|block and parry|partially block and parry) the attack from (.+)\.$/);
        if (m) {
            const action = {
                'block and partially parry': '格挡并部分招架',
                'block and parry': '格挡并招架',
                'partially block and parry': '部分格挡并招架',
            }[m[1]];
            return `你${action}了来自 ${m[2]} 的攻击。`;
        }

        m = line.match(/^You cast (.+)\.$/);
        if (m) return `你施放 ${translateBattleTerm(m[1])}。`;

        m = line.match(/^The effect (.+?)\s+has worn off\.$/);
        if (m) return `${translateBattleEffect(m[1])} 效果已消失。`;

        m = line.match(/^Cooldown expired for (.+)$/);
        if (m) return `${translateBattleTerm(m[1])} 冷却结束。`;

        m = line.match(/^Recovered ([\d,]+) points of (health|magic|spirit)\.$/i);
        if (m) return `恢复 ${m[1]} 点${translateBattleResource(m[2])}。`;

        m = line.match(/^You are healed for ([\d,]+) Health Points\.$/i);
        if (m) return `你恢复 ${m[1]} 点生命。`;

        m = line.match(/^You (block|parry|evade) the attack\.$/i);
        if (m) {
            const action = { block: '格挡', parry: '招架', evade: '闪避' }[m[1].toLowerCase()];
            return `你${action}了攻击。`;
        }

        m = line.match(/^You use (.+)\.$/);
        if (m) return `你使用 ${translateBattleTerm(m[1])}。`;

        m = line.match(/^(.+) casts (.+), which (hits|crits|glances)! (.+), and take ([\d,]+) (?:points of )?(.+) damage\.$/i);
        if (m) return `${m[1]}施放 ${translateBattleTerm(m[2])}，${translateBattleResult(m[3])}！${translateBattleDefense(m[4])}，受到 ${m[5]} 点${translateBattleDamageType(m[6])}伤害。`;

        m = line.match(/^(.+) (dodges|parries) your attack\.$/i);
        if (m) return `${m[1]}${m[2].toLowerCase() === 'dodges' ? '闪避' : '招架'}了你的攻击。`;

        m = line.match(/^(.+) uses (.+), but misses the attack\.$/);
        if (m) return `${m[1]}使用 ${translateBattleTerm(m[2])}，但攻击未命中。`;

        m = line.match(/^(.+) casts (.+) in the general direction of a shadow, missing you completely\.$/);
        if (m) return `${m[1]}对着影子的大致方向施放 ${translateBattleTerm(m[2])}，完全没有击中你。`;

        m = line.match(/^You (block and partially parry|block and parry|partially block and parry) the attack\.$/);
        if (m) {
            const action = {
                'block and partially parry': '格挡并部分招架',
                'block and parry': '格挡并招架',
                'partially block and parry': '部分格挡并招架',
            }[m[1]];
            return `你${action}了攻击。`;
        }

        m = line.match(/^Your spirit shield absorbs ([\d,]+) points of damage from the attack into ([\d,]+) points of spirit damage\.$/);
        if (m) return `你的灵力盾吸收了此次攻击造成的 ${m[1]} 点伤害，并转化为 ${m[2]} 点灵力伤害。`;

        m = line.match(/^(.+) has been roused from its sleep\.$/);
        if (m) return `${m[1]} 从睡眠中醒来。`;

        m = line.match(/^The effect (.+) was dispelled\.$/);
        if (m) return `${translateBattleEffect(m[1])} 效果被驱散。`;

        m = line.match(/^(.+) partially resists the effects of your spell\.$/);
        if (m) return `${m[1]} 部分抵抗了你的法术效果。`;

        m = line.match(/^(.+) block and resist the attack\.$/i);
        if (m) return `${m[1]} 格挡并抵抗了攻击。`;

        m = line.match(/^(.+) shrugs off the effects of your spell\.$/);
        if (m) return `${m[1]} 无视了你的法术效果。`;

        m = line.match(/^(.+) explodes for ([\d,]+) (.+) damage$/i);
        if (m) return `${translateBattleEffect(m[1])}爆炸，造成 ${m[2]} 点${translateBattleDamageType(m[3])}伤害。`;

        m = line.match(/^(.+) resists, and was ((?:\d+x-)?(?:hit|crit|glanced)) for ([\d,]+) (.+) damage$/i);
        if (m) return `${m[1]} 抵抗，但仍被${translateBattleResult(m[2])}，受到 ${m[3]} 点${translateBattleDamageType(m[4])}伤害。`;

        m = line.match(/^(.+?)\s+was ((?:\d+x-)?(?:hit|crit|glanced)) for ([\d,]+) (.+) damage$/i);
        if (m) return `${m[1]} 被${translateBattleResult(m[2])}，受到 ${m[3]} 点${translateBattleDamageType(m[4])}伤害。`;

        m = line.match(/^(.+) casts (.+), which (hits|crits|glances)! You take ([\d,]+) (?:points of )?(.+) damage\.$/i);
        if (m) return `${m[1]}施放 ${translateBattleTerm(m[2])}，${translateBattleResult(m[3])}！你受到 ${m[4]} 点${translateBattleDamageType(m[5])}伤害。`;

        m = line.match(/^(.+) casts (.+), but misses the attack\.$/);
        if (m) return `${m[1]}施放 ${translateBattleTerm(m[2])}，但攻击未命中。`;

        m = line.match(/^(.+) deftly evades your spell\.$/);
        if (m) return `${m[1]}灵巧地闪避了你的法术。`;

        return null;
    }

    function translateBattleLogLine(text) {
        const line = String(text || '').trim();
        if (!line) return '';

        const actionLine = translateBattleLogActionLine(line);
        if (actionLine !== null) return actionLine;

        let m = line.match(/^Initializing arena challenge #(\d+) \(Round (\d+) \/ (\d+)\) \.\.\.$/);
        if (m) return `初始化竞技场挑战 #${m[1]}（第 ${m[2]} / ${m[3]} 回合）...`;

        m = line.match(/^Initializing Grindfest \(Round (\d+) \/ (\d+)\) \.\.\.$/);
        if (m) return `初始化压榨界（第 ${m[1]} / ${m[2]} 回合）...`;

        m = line.match(/^Initializing Item World \(Round (\d+) \/ (\d+)\) \.\.\.$/);
        if (m) return `初始化道具界（第 ${m[1]} / ${m[2]} 回合）...`;

        m = line.match(/^Spawned Monster ([A-Z]): MID=(\d+) \((.+)\) LV=(\d+) HP=(\d+)$/);
        if (m) return `生成怪物 ${m[1]}：MID=${m[2]}（${m[3]}）等级=${m[4]} 生命=${m[5]}`;

        if (line === 'Spirit Stance Disabled') return '灵动架势已关闭。';
        if (line === 'Spirit Stance Engaged') return '灵动架势已开启。';
        if (line === 'Spirit Stance Exhausted') return '灵动架势已耗尽。';
        if (line === 'You have escaped from the battle.') return '你已逃离战斗。';

        if (line === 'Spark of Life fails due to insufficient Spirit!') return '生命火花因灵力不足而失效！';
        if (line === 'You have been defeated.') return '你已被击败。';
        if (line === 'You are Victorious!') return '你胜利了！';
        if (line === 'The potential of your equipment has grown!') return '你的装备潜能提升了！';

        m = line.match(/^You received (?:a |an )?\[(.+)\]$/i);
        if (m) return `你获得了 [${translateBattleLootTerm(m[1])}]`;

        m = line.match(/^(.+) dropped \[(.+)\]$/);
        if (m) return `${m[1]} 掉落 [${translateBattleLootTerm(m[2])}]`;

        m = line.match(/^(.+) drops a (Health|Mana|Spirit|Mystic) Gem powerup!$/i);
        if (m) return `${m[1]} 掉落一个${translateBattleLootTerm(`${m[2]} Gem`)}强化！`;

        m = line.match(/^A traveling salesmoogle salvages it into ([\dx]+) \[(.+)\], plus \[(.+)\] for the remains\.$/);
        if (m) return `旅行商人莫古力将其分解为 ${m[1]} [${translateBattleLootTerm(m[2])}]，残余部分另得 [${translateBattleLootTerm(m[3])}]。`;

        m = line.match(/^A traveling salesmoogle gives you \[([\d,]+) Credits\] for it\.$/);
        if (m) return `旅行商人莫古力给予了你 [${m[1]} Credits]。`;

        m = line.match(/^Battle Clear Bonus! \[(.+)\]$/);
        if (m) return `战斗通关奖励！[${translateBattleLootTerm(m[1])}]`;

        m = line.match(/^You obtained ([\dx,.]+) \[(.+)\]$/);
        if (m) return `你获得 ${m[1]} [${translateBattleLootTerm(m[2])}]`;

        m = line.match(/^Arena Extra Bonus! You obtained ([\dx]+) \[(.+)\]$/);
        if (m) return `竞技场额外奖励！你获得 ${m[1]} [${translateBattleLootTerm(m[2])}]`;

        m = line.match(/^Arena Token Bonus! \[(.+)\]$/);
        if (m) return `竞技场令牌奖励！[${translateBattleLootTerm(m[1])}]`;

        m = line.match(/^You gain ([\d,]+) EXP!$/);
        if (m) return `你获得 ${m[1]} 经验！`;

        m = line.match(/^You gain ([\d,]+) Credits!$/);
        if (m) return `你获得 ${m[1]} Credits！`;

        m = line.match(/^You gain ([\d.]+) points of (.+) proficiency\.$/);
        if (m) return `你获得 ${m[1]} 点${translateBattleProficiency(m[2])}熟练度。`;

        m = line.match(/^You have reached Level (\d+)!$/);
        if (m) return `你已达到等级 ${m[1]}！`;

        if (line === 'Spark of Life saves you from the brink of defeat!') return '生命火花将你从败北边缘救回！';

        return line;
    }

    const BATTLE_LOG_COLOR_GROUPS = [
        {
            className: 'hv-log-you',
            terms: ['你的', '你'],
        },
        {
            className: 'hv-log-crit',
            terms: ['倍暴击', '暴击'],
        },
        {
            className: 'hv-log-hit',
            terms: ['反击', '击中'],
        },
        {
            className: 'hv-log-glance',
            terms: ['擦过'],
        },
        {
            className: 'hv-log-miss',
            terms: ['完全没有击中', '未命中'],
        },
        {
            className: 'hv-log-defense',
            terms: ['部分格挡', '部分招架', '格挡', '招架', '闪避', '抵抗', '无视'],
        },
        {
            className: 'hv-log-recover',
            terms: ['恢复', '治疗', '吸取'],
        },
        {
            className: 'hv-log-effect',
            terms: ['获得效果', '效果已消失', '已被驱散', '被施加效果', '生命火花'],
        },
        {
            className: 'hv-log-cooldown',
            terms: ['冷却结束'],
        },
        {
            className: 'hv-log-defeat',
            terms: ['已被击败', '败北边缘', '你胜利了', '你已逃离战斗'],
        },
        {
            className: 'hv-log-loot',
            terms: ['掉落', '获得', '战斗通关奖励', '清仓出售', '分解获得', '出售获得', 'Credits', '经验'],
        },
        {
            className: 'hv-log-dmg-fire',
            terms: ['火焰伤害'],
        },
        {
            className: 'hv-log-dmg-cold',
            terms: ['冰冷伤害'],
        },
        {
            className: 'hv-log-dmg-elec',
            terms: ['闪电伤害'],
        },
        {
            className: 'hv-log-dmg-wind',
            terms: ['疾风伤害'],
        },
        {
            className: 'hv-log-dmg-holy',
            terms: ['神圣伤害'],
        },
        {
            className: 'hv-log-dmg-dark',
            terms: ['黑暗伤害'],
        },
        {
            className: 'hv-log-dmg-void',
            terms: ['虚空伤害'],
        },
        {
            className: 'hv-log-dmg-physical',
            terms: ['打击伤害', '斩击伤害', '刺击伤害'],
        },
        {
            className: 'hv-log-dmg-spirit',
            terms: ['灵力伤害'],
        },
    ];
    const BATTLE_LOG_COLOR_PATTERNS = [
        {
            className: 'hv-log-health',
            pattern: /^[\d,]+\s*点生命/,
            tokenClass: 'hv-log-token',
        },
        {
            className: 'hv-log-magic',
            pattern: /^[\d,]+\s*点法力/,
            tokenClass: 'hv-log-token',
        },
        {
            className: 'hv-log-spirit',
            pattern: /^[\d,]+\s*点灵力/,
            tokenClass: 'hv-log-token',
        },
        {
            className: 'hv-log-crit',
            pattern: /^\d+\s*倍暴击/,
            tokenClass: 'hv-log-token',
        },
    ];

    function ensureBattleLogColorStyle() {
        if (document.getElementById('hv-battle-log-color-style')) return;
        const style = document.createElement('style');
        style.id = 'hv-battle-log-color-style';
        style.textContent = `
            #translog .hv-log-token { border-radius:2px; padding:0 2px; box-decoration-break:clone; -webkit-box-decoration-break:clone; }
            #translog .hv-log-you { color:#1e73d8; font-weight:bold; }
            #translog .hv-log-hit { color:#d700d7; font-weight:bold; }
            #translog .hv-log-crit { background:#d80000; color:#fff; font-weight:bold; }
            #translog .hv-log-glance { color:#d98200; font-weight:bold; }
            #translog .hv-log-miss { color:#777; font-weight:bold; }
            #translog .hv-log-defense { color:#246f9e; font-weight:bold; }
            #translog .hv-log-recover { color:#006b2a; font-weight:bold; }
            #translog .hv-log-health { color:#007a2d; font-weight:bold; }
            #translog .hv-log-magic { color:#337ab7; font-weight:bold; }
            #translog .hv-log-spirit { color:#c73562; font-weight:bold; }
            #translog .hv-log-effect { background:#c7ffd5; color:#0f4d1e; }
            #translog .hv-log-cooldown { background:#97ffb2; color:#111; }
            #translog .hv-log-defeat { background:#dedede; color:#111; }
            #translog .hv-log-loot { color:#7a4b00; font-weight:bold; }
            #translog .hv-log-dmg-fire { background:#f97c7c; color:#111; }
            #translog .hv-log-dmg-cold { background:#94c2f5; color:#111; }
            #translog .hv-log-dmg-elec { background:#f4f375; color:#111; }
            #translog .hv-log-dmg-wind { background:#7ff97c; color:#111; }
            #translog .hv-log-dmg-holy { background:#fff; color:#111; }
            #translog .hv-log-dmg-dark { background:#000; color:#fff; }
            #translog .hv-log-dmg-void { background:#fff; color:#5c5a5a; }
            #translog .hv-log-dmg-physical { background:#000; color:#f6f504; }
            #translog .hv-log-dmg-spirit { color:#a2042c; font-weight:bold; }
        `;
        document.head.appendChild(style);
    }

    function getBattleLogColorRules() {
        if (state.battleLogColorRulesCache) return state.battleLogColorRulesCache;
        const rules = [];
        for (const group of BATTLE_LOG_COLOR_GROUPS) {
            for (const term of group.terms) {
                if (term) rules.push({ term, className: group.className, tokenClass: 'hv-log-token' });
            }
        }
        if (CONFIG.equipmentColorEnabled) {
            ensureEquipmentColorStyle();
            for (const rule of getEquipmentColorRules()) {
                rules.push({ term: rule.term, className: rule.className, tokenClass: 'hv-log-token hv-eq-token' });
            }
        }
        rules.sort((a, b) => b.term.length - a.term.length);
        state.battleLogColorRulesCache = rules;
        return rules;
    }

    function matchBattleLogColorPattern(text, index) {
        if (!/\d/.test(text[index] || '')) return null;
        for (const rule of BATTLE_LOG_COLOR_PATTERNS) {
            const m = text.slice(index).match(rule.pattern);
            if (m) return { text: m[0], className: rule.className, tokenClass: rule.tokenClass };
        }
        return null;
    }

    function findNextBattleLogColorPatternIndex(text, index) {
        for (let i = index + 1; i < text.length; i++) {
            if (matchBattleLogColorPattern(text, i)) return i;
        }
        return -1;
    }

    function renderBattleLogLine(text) {
        if (!CONFIG.battleLogColorEnabled || !state.translated) return document.createTextNode(text);
        ensureBattleLogColorStyle();

        const fragment = document.createDocumentFragment();
        const rules = getBattleLogColorRules();
        let index = 0;
        while (index < text.length) {
            const patternRule = matchBattleLogColorPattern(text, index);
            const rule = patternRule || rules.find(item => text.startsWith(item.term, index));
            if (!rule) {
                let next = text.length;
                const nextPattern = findNextBattleLogColorPatternIndex(text, index);
                if (nextPattern !== -1 && nextPattern < next) next = nextPattern;
                for (const item of rules) {
                    const found = text.indexOf(item.term, index + 1);
                    if (found !== -1 && found < next) next = found;
                }
                fragment.appendChild(document.createTextNode(text.slice(index, next)));
                index = next;
                continue;
            }

            const span = document.createElement('span');
            span.className = `${rule.tokenClass} ${rule.className}`;
            span.textContent = rule.text || rule.term;
            fragment.appendChild(span);
            index += (rule.text || rule.term).length;
        }
        return fragment;
    }

    function getOrCreateTranslog(textlog) {
        let translog = document.getElementById('translog');
        if (!translog) {
            translog = document.createElement('table');
            translog.id = 'translog';
            textlog.parentNode.insertBefore(translog, textlog);
        }
        if (!document.getElementById('hv-translog-style')) {
            const style = document.createElement('style');
            style.id = 'hv-translog-style';
            style.textContent = `
                #translog{width:100%;border-collapse:collapse;}
                #translog td{vertical-align:top;}
                #translog tr.hv-log-turn-separator td{border-top:1px dashed #999;height:6px;padding:0;font-size:0;line-height:0;}
                #translog .hv-log-scan{margin:2px 0 4px;padding:4px 6px;border:1px solid #b8c4d2;background:#f7fbff;line-height:1.35;}
                #translog .hv-log-scan-title{font-weight:bold;color:#214e7b;}
                #translog .hv-log-scan-stats{color:#333;}
                #translog .hv-log-scan-row{margin-top:2px;}
                #translog .hv-log-scan-label{font-weight:bold;color:#4d5a68;}
            `;
            document.head.appendChild(style);
        }
        textlog.style.display = 'none';
        return translog;
    }

    function updateTranslogRow(transRow, sourceRow) {
        const sourceCell = sourceRow?.cells?.[0];
        const sourceText = sourceCell?.textContent || '';
        const sourceClass = sourceCell?.className || '';
        if (transRow.dataset.hvSourceText === sourceText && transRow.dataset.hvSourceClass === sourceClass) return;

        let td = transRow.firstElementChild;
        if (!td) {
            td = document.createElement('td');
            transRow.appendChild(td);
        }
        td.className = sourceClass;
        const isSeparator = sourceClass.split(/\s+/).includes('tls');
        transRow.classList.toggle('hv-log-turn-separator', isSeparator);
        if (isSeparator) {
            td.replaceChildren();
            transRow.dataset.hvSourceText = sourceText;
            transRow.dataset.hvSourceClass = sourceClass;
            return;
        }

        const scanNode = renderBattleScanLog(sourceText);
        if (scanNode) {
            td.replaceChildren(scanNode);
        } else {
            const translatedText = translateBattleLogLine(sourceText);
            td.replaceChildren(renderBattleLogLine(translatedText));
        }
        transRow.dataset.hvSourceText = sourceText;
        transRow.dataset.hvSourceClass = sourceClass;
    }

    function getSourceTextlogRows(textlog) {
        const section = textlog.tBodies?.[0] || textlog;
        return [...section.children].filter(node => node.tagName === 'TR');
    }

    function syncTranslogRows() {
        const textlog = document.getElementById('textlog');
        if (!textlog) return;
        const translog = getOrCreateTranslog(textlog);
        let body = translog.tBodies[0];
        if (!body) {
            body = document.createElement('tbody');
            translog.appendChild(body);
        }

        const sourceRows = getSourceTextlogRows(textlog);
        while (body.rows.length > sourceRows.length) body.deleteRow(body.rows.length - 1);

        sourceRows.forEach((sourceRow, index) => {
            let transRow = body.rows[index];
            if (!transRow) transRow = body.insertRow(-1);
            updateTranslogRow(transRow, sourceRow);
        });
    }

    function initBattleLogTranslate() {
        if (!CONFIG.battleLogTranslateEnabled || CONFIG.hideBattleLog) return;
        const textlog = document.getElementById('textlog');
        if (!textlog) return;

        syncTranslogRows();
        if (state.battleLogObserver) state.battleLogObserver.disconnect();

        let timer = null;
        state.battleLogObserver = new MutationObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(syncTranslogRows, CONFIG.observerDebounceMs);
        });
        state.battleLogObserver.observe(textlog, { childList: true, subtree: true, characterData: true });
    }

    function initBattleTranslate() {
        if (!CONFIG.battleTranslateEnabled || !hasBattleSurface()) return;
        translateBattleStatic();
        initBattleImageTranslate();
        ensureBattleInfopaneStyle();
        hookBattleInfopaneMethods();
        observeBattleInfopane();
        observeBattleSkillPanels();
        observeBattleSettlement();
        setTimeout(hookBattleInfopaneMethods, 100);
        setTimeout(hookBattleInfopaneMethods, 300);
        setTimeout(hookBattleInfopaneMethods, 800);
        initBattleLogTranslate();
    }

    function cleanupBattleTranslate() {
        if (state.battleInfopaneObserver) {
            state.battleInfopaneObserver.disconnect();
            state.battleInfopaneObserver = null;
        }
        if (state.battleSkillPanelObserver) {
            state.battleSkillPanelObserver.disconnect();
            state.battleSkillPanelObserver = null;
        }
        if (state.battleLogObserver) {
            state.battleLogObserver.disconnect();
            state.battleLogObserver = null;
        }
        if (state.battleSettlementObserver) {
            state.battleSettlementObserver.disconnect();
            state.battleSettlementObserver = null;
        }
        const translog = document.getElementById('translog');
        if (translog) translog.remove();
        const textlog = document.getElementById('textlog');
        if (textlog) textlog.style.display = '';
        clearBattleVisualText(document);
        document.getElementById('hv-battle-visual-text-style')?.remove();
        if (state.battleImageStyle) {
            state.battleImageStyle.remove();
            state.battleImageStyle = null;
        }
    }

    function cleanupExternalEquipmentTranslate() {
        if (state.externalEquipmentObserver) {
            state.externalEquipmentObserver.disconnect();
            state.externalEquipmentObserver = null;
        }
        restoreExternalEquipmentLinks(document);
    }

    // =========================================================
    // 10) 启动层：调度翻译流程
    // =========================================================
    function translateAllSections() {
        disconnectAllObservers();
        const translatedRoots = [];
        const dynamicRoots = [];

        for (const [selector, regionDef] of Object.entries(REGION_DEFS)) {
            if (regionDef.enabled && !regionDef.enabled()) continue;
            const profileName = regionDef.profile;
            const nodes = getTargetNodes(selector);
            if (!nodes.length) continue;

            const isDynamic = !!regionDef.dynamic;
            for (const node of nodes) {
                if (isDynamic && isDynamicRegionCovered(selector, node)) continue;
                const resolvedProfile = resolveNodeProfile(selector, node, profileName);
                if (isStaticRegionAlreadyTranslated(translatedRoots, node, resolvedProfile)) continue;

                const dict = getCompiledDictByProfile(resolvedProfile);
                if (!dict.length) continue;

                for (const root of getRegionTranslateRoots(selector, node)) {
                    clearProfileFeatures(root, resolvedProfile);
                    translateSection(root, dict, false);
                    translateContextSpecials(root, resolvedProfile, false);
                    applyProfileFeatures(root, resolvedProfile);
                }
                translatedRoots.push({ node, profileName: resolvedProfile });
                if (isDynamic) dynamicRoots.push({ node, selector, profileName });
            }
        }

        translateShrineResultBox(false);
        for (const item of dynamicRoots) observeDynamicSection(item.node, item.selector, item.profileName);
        observeArmoryIntegratedEquipList();
    }

    function applyBattlePageOptions() {
        if (!document.getElementById('textlog')) return;
        if (CONFIG.hideBattleLog) {
            if (document.getElementById('hv-hide-battle-log-style')) return;
            const style = document.createElement('style');
            style.id = 'hv-hide-battle-log-style';
            style.textContent = '#pane_log,#textlog{display:none !important;}';
            document.head.appendChild(style);
        }
    }

    function start() {
        if (!state.translated) return;
        ensureEqsbLayoutCompatibilityStyle();
        if (observeExternalEquipmentLinks()) return;
        applyBattlePageOptions();
        translateAllSections();
        initImageTranslate();
        initBattleTranslate();
    }

    function bootstrap() {
        initToggleButton();
        applyForumFontScale();
        if (!getExternalEquipmentMode()) hookAlertTranslate();
        if (state.translated) start();

        // HV 战斗页常见重载事件
        document.addEventListener('HVReload', () => { if (state.translated) start(); });
        document.addEventListener('DOMContentLoaded', () => { if (state.translated) start(); });
    }

    bootstrap();
})();
