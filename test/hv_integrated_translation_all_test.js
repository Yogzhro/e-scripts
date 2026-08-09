'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scriptPath = path.resolve(__dirname, '..', 'HV综合汉化.js');
const source = fs.readFileSync(scriptPath, 'utf8');

function extractFunction(name) {
    const start = source.indexOf(`    function ${name}(`);
    assert.notEqual(start, -1, `找不到生产函数 ${name}`);
    const nextFunction = source.indexOf('\n    function ', start + 1);
    const end = nextFunction === -1 ? source.length : nextFunction;
    return source.slice(start, end).replace(/^    /gm, '');
}

function assertMapping(english, chinese) {
    assert.ok(source.includes(`'${english}': '${chinese}'`), `缺少词条：${english} → ${chinese}`);
}

function extractConstObject(name) {
    const marker = `    const ${name} = {`;
    const declaration = source.indexOf(marker);
    assert.notEqual(declaration, -1, `找不到生产对象 ${name}`);
    const start = source.indexOf('{', declaration);
    const end = source.indexOf('\n    };', start);
    assert.notEqual(end, -1, `找不到生产对象 ${name} 的结尾`);
    return vm.runInNewContext(`(${source.slice(start, end + 6)})`);
}

function testMonsterInventoryCompatibility() {
    const monsterContext = {
        getCompiledDictByProfile(profile) {
            assert.equal(profile, 'monsterLab');
            return [
                { reg: /Monster Edibles/g, value: '怪物食品' },
                { reg: /Happy Pills?/g, value: '快乐药丸' },
            ];
        },
    };
    vm.runInNewContext([
        extractFunction('translateByDict'),
        extractFunction('isMonsterActionsMachineTextNode'),
        extractFunction('translateMonsterActionsVisualValue'),
    ].join('\n\n'), monsterContext);

    function createTextNode(text, { insideMonsterActions = true, insideRequirementSpan = false } = {}) {
        return {
            data: text,
            parentElement: {
                closest(selector) {
                    if (!insideMonsterActions) return null;
                    if (selector === '#monster_actions') return {};
                    if (selector === '#monster_actions > div > div > span' && insideRequirementSpan) return {};
                    return null;
                },
            },
        };
    }

    const protectedMachineTexts = [
        '21x Monster Edibles',
        '1x Happy Pills',
        'Cost: 250C',
        'Stock: 6483',
    ];
    for (const value of protectedMachineTexts) {
        const insideRequirementSpan = !/^(Cost|Stock):/.test(value);
        assert.equal(
            monsterContext.isMonsterActionsMachineTextNode(createTextNode(value, { insideRequirementSpan })),
            true,
            `怪物操作区机器文本必须保留英文：${value}`,
        );
    }
    assert.equal(
        monsterContext.isMonsterActionsMachineTextNode(createTextNode('Requires:')),
        false,
        'Requires 标签不是库存解析机器文本，应继续走普通汉化',
    );
    assert.equal(
        monsterContext.isMonsterActionsMachineTextNode(createTextNode('21x Monster Edibles', { insideMonsterActions: false })),
        false,
        '怪物操作区外不应触发库存兼容保护',
    );

    const visualCases = new Map([
        ['21x Monster Edibles', '21x 怪物食品'],
        ['21x Monster Edibles (6483)', '21x 怪物食品 (6483)'],
        ['1x Happy Pills', '1x 快乐药丸'],
        ['Cost: 250 Chaos Tokens', '消耗: 250 混沌令牌'],
        ['Stock: 6483', '库存: 6483'],
    ]);
    for (const [english, chinese] of visualCases) {
        assert.equal(
            monsterContext.translateMonsterActionsVisualValue(english),
            chinese,
            `怪物操作区视觉汉化错误：${english}`,
        );
    }
    assert.equal(
        monsterContext.translateMonsterActionsVisualValue('Unknown machine value'),
        '',
        '未知机器文本不得生成错误的视觉汉化',
    );
    assert.ok(
        source.includes('wrapper.textContent = node.data;'),
        '视觉包装层必须保留原始英文 textContent 供其他脚本读取',
    );
}

const charmRules = [
    { reg: /Juggernaut \(Greater\)/g, value: '生命加成（高级）' },
    { reg: /Juggernaut \(Lesser\)/g, value: '生命加成（次级）' },
    { reg: /Featherweight \(Lesser\)/g, value: '羽毛（次级）' },
    { reg: /Capacitor \(Greater\)/g, value: '法力（高级）' },
];
const context = {
    getCompiledDictByGroups(groups) {
        assert.deepEqual(Array.from(groups), ['domain.armory']);
        return charmRules;
    },
};

vm.runInNewContext([
    extractFunction('translateByDict'),
    extractFunction('translateEquipmentPopupCharmValue'),
    'globalThis.underTest = { translateEquipmentPopupCharmValue };',
].join('\n'), context);

const { translateEquipmentPopupCharmValue } = context.underTest;
assert.equal(translateEquipmentPopupCharmValue('Charms'), '护符');
assert.equal(translateEquipmentPopupCharmValue('Juggernaut (G)'), '生命加成（高级）');
assert.equal(translateEquipmentPopupCharmValue('Juggernaut (L)'), '生命加成（次级）');
assert.equal(translateEquipmentPopupCharmValue('Featherweight (L)'), '羽毛（次级）');
assert.equal(translateEquipmentPopupCharmValue('Capacitor (G)'), '法力（高级）');
assert.equal(translateEquipmentPopupCharmValue('Unknown (G)'), '');
assert.equal(translateEquipmentPopupCharmValue('Capacitor (Greater)'), '');

assertMapping('Mage Stats', '法师面板数据');
assertMapping('Counter-resist for Fire Spells', '火魔法反抵抗');
assertMapping('Counter-resist for Cold Spells', '冰魔法反抵抗');
assertMapping('Counter-resist for Elec Spells', '雷魔法反抵抗');
assertMapping('Counter-resist for Wind Spells', '风魔法反抵抗');
assertMapping('Counter-resist for Holy Spells', '圣魔法反抵抗');
assertMapping('Counter-resist for Dark Spells', '暗魔法反抵抗');
assertMapping('Counter-resist for Deprecating Spells', '减益魔法反抵抗');
assertMapping('Cure Bonus', '治疗加成');

assertMapping('Ultimate', '𖣔终极𖣔');
assert.match(source, /className: 'hv-eq-q-ultimate',[\s\S]*?terms: \['𖣔终极𖣔'\]/);
assert.match(source, /const EQUIPMENT_QUALITY_GROUP_COUNT = 11;/);
assert.match(source, /const EXTERNAL_EQUIPMENT_QUALITY_WORDS = \[[\s\S]*?'Ultimate'/);

assertMapping('Great Mace', '巨锤(双)');
assertMapping('Mace', '巨锤(双)');
assertMapping('Reactive', '反应(重)');
assertMapping('Chain', '锁子甲(重)');
assertMapping('Drakehide', '龙鳞(轻)');
assertMapping('Kevlar', '凯夫拉(轻)');
assertMapping('Leather', '皮革(轻)');
assertMapping('Cuirass', '胸甲');
assertMapping('Greaves', '护胫');
assertMapping('Helmet', '头盔');
assertMapping('Gauntlets', '护手');
assertMapping('Boots', '靴子');
assertMapping('Breastplate', '护胸');

const integratedSubheadingDict = extractConstObject('INTEGRATED_EQUIPMENT_SUBHEADING_DICT');
assert.equal(integratedSubheadingDict.Mace, undefined, 'Mace 已由 HV Utils 归并为 Great Mace，不应保留无效专用词条');
assert.equal(integratedSubheadingDict['Great Mace'], undefined, '常规装备类型应复用 equipment.name，避免专用词典重复');
assert.equal(integratedSubheadingDict['Shade Helmet'], undefined, '可组合的护甲类型应复用 equipment.name');
assert.equal(integratedSubheadingDict['Protected Equipment'], undefined, '非分类标题不应放入专用词典');

const subheadingRules = [
    { reg: /Great Mace/g, value: '巨锤(双)' },
    { reg: /Mace/g, value: '巨锤(双)' },
    { reg: /Reactive/g, value: '反应(重)' },
    { reg: /Chain/g, value: '锁子甲(重)' },
    { reg: /Drakehide/g, value: '龙鳞(轻)' },
    { reg: /Kevlar/g, value: '凯夫拉(轻)' },
    { reg: /Leather/g, value: '皮革(轻)' },
    { reg: /Cuirass/g, value: '胸甲' },
    { reg: /Greaves/g, value: '护胫' },
    { reg: /Helmet/g, value: '头盔' },
    { reg: /Gauntlets/g, value: '护手' },
    { reg: /Boots/g, value: '靴子' },
    { reg: /Breastplate/g, value: '护胸' },
];
const subheadingContext = {
    HAS_ENGLISH: /[a-zA-Z]/,
    INTEGRATED_EQUIPMENT_SUBHEADING_DICT: integratedSubheadingDict,
    getCompiledDictByGroups(groups) {
        assert.deepEqual(Array.from(groups), ['equipment.name']);
        return subheadingRules;
    },
};
vm.runInNewContext([
    extractFunction('translateByDict'),
    extractFunction('translateIntegratedEquipmentSubheadingValue'),
    'globalThis.underTest = { translateIntegratedEquipmentSubheadingValue };',
].join('\n'), subheadingContext);
const { translateIntegratedEquipmentSubheadingValue } = subheadingContext.underTest;
assert.equal(translateIntegratedEquipmentSubheadingValue('Great Mace'), '巨锤');
assert.equal(translateIntegratedEquipmentSubheadingValue('Mace'), '巨锤');
assert.equal(translateIntegratedEquipmentSubheadingValue('Reactive Cuirass'), '反应胸甲');
assert.equal(translateIntegratedEquipmentSubheadingValue('Reactive Greaves'), '反应护胫');
assert.equal(translateIntegratedEquipmentSubheadingValue('Chain Greaves'), '锁子甲护胫');
assert.equal(translateIntegratedEquipmentSubheadingValue('Drakehide Helmet'), '龙鳞头盔');
assert.equal(translateIntegratedEquipmentSubheadingValue('Kevlar Helmet'), '凯夫拉头盔');
assert.equal(translateIntegratedEquipmentSubheadingValue('Kevlar Gauntlets'), '凯夫拉护手');
assert.equal(translateIntegratedEquipmentSubheadingValue('Kevlar Boots'), '凯夫拉靴');
assert.equal(translateIntegratedEquipmentSubheadingValue('Leather Breastplate'), '皮革护胸');
assert.equal(translateIntegratedEquipmentSubheadingValue('the Frost-born'), '冰抗');
assert.equal(translateIntegratedEquipmentSubheadingValue('the Cheetah'), '敏捷');
assert.equal(translateIntegratedEquipmentSubheadingValue('Unknown Cuirass'), '');
assert.match(source, /saveOriginal\(cell, 'textContent', oldVal, false\)/, '动态分类标题必须保存英文原文以支持实时切换');

const savedSubheadings = [];
const fakeSubheadingCell = {
    textContent: 'Reactive Cuirass',
    matches: () => true,
    closest: () => null,
    querySelectorAll: () => [],
};
const switchingContext = {
    INTEGRATED_EQUIPMENT_SUBHEADING_SELECTOR: '.hvut-eqp-type > td[colspan="10"]',
    translateIntegratedEquipmentSubheadingValue,
    saveOriginal(...args) {
        savedSubheadings.push(args);
    },
};
vm.runInNewContext([
    extractFunction('translateIntegratedEquipmentSubheadings'),
    'globalThis.underTest = { translateIntegratedEquipmentSubheadings };',
].join('\n'), switchingContext);
switchingContext.underTest.translateIntegratedEquipmentSubheadings(fakeSubheadingCell, 'armory', true);
assert.equal(fakeSubheadingCell.textContent, '反应胸甲');
assert.equal(savedSubheadings.length, 1);
assert.equal(savedSubheadings[0][3], false, '动态分类标题也必须进入中英切换快照');

assert.match(source, /'\.showequip': \{ profile: 'equipmentDetail', dynamic: true \}/);
assert.match(source, /TEXT_TRANSLATE_EXCLUDE_SELECTOR[\s\S]*?'\.chm > div'/);
assert.match(source, /saveOriginal\(row, 'textContent', oldVal, false\)/, '异步护符行必须保存英文原文以支持实时切换');

const unwrapAttributeSource = extractFunction('unwrapAttributeVisualText');
const applyAttributeSource = extractFunction('applyAttributeVisualText');
assert.match(unwrapAttributeSource, /wrapper\.replaceWith\(document\.createTextNode/);
assert.match(applyAttributeSource, /unwrapAttributeVisualText\(table\)/);
assert.match(applyAttributeSource, /document\.createElement\('span'\)/);
assert.match(applyAttributeSource, /wrapper\.dataset\.hvAttributeVisualText =/);
assert.match(applyAttributeSource, /node\.replaceWith\(wrapper\)/);
assert.doesNotMatch(applyAttributeSource, /host\.dataset\.hvAttributeVisualText/);

function createAttributeVisualFixture(initialWrapperFontSize = '') {
    const host = {
        childNodes: [],
        firstChild: null,
        fontSize: '10px',
        closest() {
            return null;
        },
    };

    function replaceHostChild(current, replacement) {
        assert.equal(host.firstChild, current, '夹具只允许替换当前唯一子节点');
        replacement.parentElement = host;
        host.childNodes = [replacement];
        host.firstChild = replacement;
    }

    function createTextNode(data) {
        const node = {
            data,
            parentElement: host,
            replaceWith(replacement) {
                replaceHostChild(this, replacement);
            },
        };
        return node;
    }

    function createWrapper(text, fontSize = '') {
        const styleValues = new Map();
        if (fontSize) styleValues.set('--hv-attribute-visual-font-size', fontSize);
        return {
            tagName: 'SPAN',
            dataset: { hvAttributeVisualText: '[565] 力量' },
            textContent: text,
            parentElement: host,
            styleValues,
            style: {
                getPropertyValue(name) {
                    return styleValues.get(name) || '';
                },
                setProperty(name, value) {
                    styleValues.set(name, value);
                },
            },
            matches(selector) {
                return selector === '[data-hv-attribute-visual-text]';
            },
            querySelectorAll() {
                return [];
            },
            closest(selector) {
                return selector === '[data-hv-attribute-visual-text]' ? this : null;
            },
            replaceWith(replacement) {
                replaceHostChild(this, replacement);
            },
        };
    }

    const initialChild = initialWrapperFontSize
        ? createWrapper('[565] Strength', initialWrapperFontSize)
        : createTextNode('[565] Strength');
    host.childNodes = [initialChild];
    host.firstChild = initialChild;

    const table = {
        matches() {
            return false;
        },
        querySelectorAll(selector) {
            return selector === '[data-hv-attribute-visual-text]' && host.firstChild.tagName === 'SPAN'
                ? [host.firstChild]
                : [];
        },
    };
    return { host, table, createTextNode, createWrapper };
}

let activeAttributeFixture;
const attributeContext = {
    state: { translated: true },
    ATTRIBUTE_VISUAL_PATTERN: /\b(Strength|Dexterity|Agility|Endurance|Intelligence|Wisdom)\b/g,
    ATTRIBUTE_VISUAL_LABELS: { Strength: '力量' },
    getAttributeVisualRoots: () => [activeAttributeFixture.table],
    ensureAttributeVisualTextStyle() {},
    getTextNodes: () => {
        const child = activeAttributeFixture.host.firstChild;
        return typeof child.data === 'string' ? [child] : [];
    },
    getComputedStyle(element) {
        return {
            fontSize: element.fontSize || '10px',
            lineHeight: '18px',
        };
    },
    document: {
        createTextNode(data) {
            return activeAttributeFixture.createTextNode(data);
        },
        createElement(tagName) {
            assert.equal(tagName, 'span');
            return activeAttributeFixture.createWrapper('');
        },
    },
};
vm.runInNewContext([
    unwrapAttributeSource,
    applyAttributeSource,
    'globalThis.underTest = { unwrapAttributeVisualText, applyAttributeVisualText };',
].join('\n'), attributeContext);

activeAttributeFixture = createAttributeVisualFixture();
attributeContext.underTest.applyAttributeVisualText(activeAttributeFixture.table);
attributeContext.underTest.applyAttributeVisualText(activeAttributeFixture.table);
let attributeWrapper = activeAttributeFixture.host.firstChild;
assert.equal(attributeWrapper.tagName, 'SPAN', '原方案必须使用独立 span 包装英文机器文本');
assert.equal(attributeWrapper.textContent, '[565] Strength', '包装元素必须保留 HV Utils 读取的英文 textContent');
assert.equal(attributeWrapper.dataset.hvAttributeVisualText, '[565] 力量');
assert.equal(attributeWrapper.styleValues.get('--hv-attribute-visual-font-size'), '10px', '重复应用必须从未隐藏的父元素重新取得可见字号');

attributeContext.underTest.unwrapAttributeVisualText(activeAttributeFixture.table);
assert.equal(activeAttributeFixture.host.firstChild.data, '[565] Strength', '切回英文时必须还原为原始文本节点');

activeAttributeFixture = createAttributeVisualFixture('0px');
attributeContext.underTest.applyAttributeVisualText(activeAttributeFixture.table);
attributeWrapper = activeAttributeFixture.host.firstChild;
assert.equal(attributeWrapper.tagName, 'SPAN');
assert.equal(attributeWrapper.styleValues.get('--hv-attribute-visual-font-size'), '10px', '旧的 0px 包装必须先拆除，再从父元素恢复可见字号');

assert.match(source, /\/\/ @version\s+1\.6\.7/, '版本号必须按用户要求保持 1.6.7');

testMonsterInventoryCompatibility();
require('./hv_ultimate_color_preview.user.js');

console.log('HV 综合汉化统一测试通过');
