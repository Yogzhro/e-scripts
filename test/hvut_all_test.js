'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scriptPath = path.resolve(__dirname, '..', 'HVUT 熊猫汉化-4.2.3.js');
const source = fs.readFileSync(scriptPath, 'utf8');

function extractConstant(name) {
  const pattern = new RegExp(`const ${name} = \\{[\\s\\S]*?\\n\\};`);
  const match = source.match(pattern);
  assert.ok(match, `找不到生产常量 ${name}`);
  return match[0];
}

function extractFunction(name) {
  const pattern = new RegExp(`function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n\\}`);
  const match = source.match(pattern);
  assert.ok(match, `找不到生产函数 ${name}`);
  return match[0];
}

const context = {};
vm.runInNewContext([
  extractConstant('STAMINA_TEXT'),
  extractFunction('translateStaminaText'),
  'globalThis.translateStaminaTextUnderTest = translateStaminaText;',
].join('\n'), context);

const translateStaminaText = context.translateStaminaTextUnderTest;

function testStaminaTranslations() {
  assert.equal(
    translateStaminaText('Stamina: Great. You receive a 100% EXP Bonus but stamina drains 50% faster.'),
    '精力：充沛。你将获得 100% 经验加成，但精力消耗速度提高 50%。',
  );
  assert.equal(
    translateStaminaText('Stamina: Normal. You are not receiving any bonuses or penalties.'),
    '精力：正常。你不会获得任何加成，也不会受到任何惩罚。',
  );
  assert.equal(
    translateStaminaText('Stamina: Exhausted. You do not receive EXP or drops from monsters, and you cannot gain proficiencies.'),
    '精力：耗尽。你无法获得经验或怪物掉落，也无法提升熟练度。',
  );
  assert.equal(
    translateStaminaText('You have increased stamina drain due to low riddle accuracy'),
    '谜语回答准确率过低，精力消耗速度提高。',
  );
  assert.equal(translateStaminaText('Caffeinated Candy'), '咖啡因糖果');
  assert.equal(translateStaminaText('Energy Drink'), '能量饮料');
  assert.equal(translateStaminaText('No restorative available'), '没有可用的精力恢复物品');
  assert.equal(translateStaminaText('Future stamina status'), 'Future stamina status');
}

function testStaminaIntegration() {
  assert.match(source, /translateStaminaText\(_player\.condition\)/, '状态说明必须只在显示阶段翻译');
  assert.match(source, /translateStaminaText\(_player\.accuracy\)/, '低答题准确率警告必须只在显示阶段翻译');
  assert.match(source, /\$item\.count\(itemName\)/, '库存计数必须继续使用英文物品名');
  assert.match(source, /translateStaminaText\(itemName\)/, '库存显示名称必须使用中文映射');
  assert.match(source, /includes\('Stamina: Exhausted'\)/, '耗尽状态逻辑判断必须保留英文');
  assert.match(source, /includes\('Stamina: Great'\)/, '充沛状态逻辑判断必须保留英文');
  assert.match(source, /<span>精力: \$\{_player\.stamina\}<\/span>/, '顶部标签必须统一为“精力”');
  assert.match(source, /value: '使用恢复物品'/, '恢复按钮必须采用审核后的通用译文');
  assert.match(source, /confirm\('确定要使用恢复物品吗？'\)/, '确认提示必须采用审核后的通用译文');
  assert.match(source, /\/\/ @version\s+0\.0\.1\.0/, '版本号必须遵循仓库四段版本规则');
}

testStaminaTranslations();
testStaminaIntegration();

console.log('HVUT 综合测试通过（精力悬浮框）');
