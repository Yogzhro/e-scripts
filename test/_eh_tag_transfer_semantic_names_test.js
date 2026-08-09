'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const scriptPath = path.resolve(__dirname, '..', 'eh-tag-transfer.js');
const source = fs.readFileSync(scriptPath, 'utf8');
const expectedConstants = [
    'SCRIPT_VERSION',
    'LOG_PREFIX',
    'UI_STATE_STORAGE_KEY',
    'BAD_TAG_STATE_STORAGE_KEY',
    'HOME_STATE_STORAGE_KEY',
    'WORKER_LOCK_STORAGE_KEY',
    'RUN_MARKER_STORAGE_KEY',
    'STYLE_ELEMENT_ID',
    'NORMAL_RUN_PHASES',
    'UI_LOG_ORDER',
    'BAD_TAG_OUTCOME_META',
    'INSTANCE_ID',
    'DEFAULT_ORIGIN',
    'LANGUAGE_TAG_NAMES',
    'DEFAULT_CONFIG',
    'RUNTIME_LIMITS',
    'runtimeState',
    'titleIdentityCache',
    'creatorTagSetsCache',
    'CORE'
];
const expectedFunctions = [
    'sanitizeConfig',
    'resolveConfig',
    'sanitizeHomeState',
    'mergeHomepageResults',
    'normalizeComparableTitle',
    'extractChapterSuffix',
    'parseTitleIdentity',
    'compareTitleSets',
    'assessCandidate',
    'buildSearchQueries',
    'parseSearchResults',
    'parseGalleryWriteContext',
    'buildTagGalleryPayload',
    'parseBadTagRecords',
    'correctBadTagRecord',
    'processBadTags',
    'executeTransferPlan',
    'processCurrentGallery',
    'processHomepage',
    'appendLog',
    'scheduleNextRun',
    'stopWorker',
    'runWorker',
    'initialize'
];

for (const name of expectedConstants) {
    assert.ok(new RegExp(`\\b${name}\\s*=`).test(source), `缺少语义常量：${name}`);
}
for (const name of expectedFunctions) {
    assert.ok(
        new RegExp(`\\b(?:async )?function ${name}\\s*\\(`).test(source),
        `缺少语义函数：${name}`
    );
}

const topLevelFunctionNames = [...source.matchAll(/^    (?:async )?function ([A-Za-z_$][\w$]*)\s*\(/gm)]
    .map(match => match[1]);
const shortTopLevelNames = topLevelFunctionNames.filter(name => name.length <= 2);
assert.deepEqual(shortTopLevelNames, [], `仍有顶层短函数名：${shortTopLevelNames.join(', ')}`);
assert.doesNotMatch(source, /^    const [A-Za-z_$] =/m, '仍有单字母顶层常量');
assert.doesNotMatch(source, /\bconst un = \{/m, 'CORE 仍使用混淆变量名');
assert.doesNotMatch(
    source,
    /\b(?:const|let|var)\s+[A-Za-z_$]{1,2}\b/,
    '仍有一至两个字符的局部变量声明'
);
assert.doesNotMatch(source, /\bcatch\s*\(\s*[A-Za-z_$]{1,2}\s*\)/, '异常参数仍是短名称');
assert.doesNotMatch(
    source,
    /\(\s*[A-Za-z_$]{1,2}(?:\s*,\s*[A-Za-z_$]{1,2})*\s*\)\s*=>/,
    '箭头函数参数仍是短名称'
);

for (const match of source.matchAll(/\b(?:async\s+)?function(?:\s+[A-Za-z_$][\w$]*)?\s*\(([\s\S]*?)\)\s*\{/g)) {
    const shortParameter = match[1].match(/(?:^|[,{]\s*)([A-Za-z_$]{1,2})(?=\s*(?:[,}=]|$))/);
    assert.equal(shortParameter, null, `函数参数仍是短名称：${shortParameter?.[1] || ''}`);
}

console.log('E-Hentai semantic naming audit passed');
