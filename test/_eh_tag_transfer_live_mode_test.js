'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scriptPath = path.resolve(__dirname, '..', 'eh-tag-transfer.js');
const source = fs.readFileSync(scriptPath, 'utf8');
const retiredFeatureName = ['READ', 'ONLY', 'REHEARSAL'].join('_');
const retiredBannerId = ['ehtt', 'rehearsal', 'banner'].join('-');

assert.match(source, /\/\/ @version\s+0\.1\.8\.5/);
assert.equal(source.includes(retiredFeatureName), false, '正式版仍残留演练标识');
assert.equal(source.includes(retiredBannerId), false, '正式版仍残留演练横幅');
assert.equal(source.includes('只读演练'), false, '正式版仍残留演练文案');
assert.equal(source.includes('ReadOnlyRehearsalError'), false, '正式版仍残留演练阻断错误');
assert.equal(source.includes('shouldPersistDomainState'), false, '正式版仍残留状态持久化阻断');
assert.equal(source.includes('recordVotePlan'), false, '正式版仍残留投票计划记录器');
assert.doesNotThrow(() => new vm.Script(source, {filename: scriptPath}));
assert.match(source, /direct-xhr-verified/);
assert.doesNotMatch(source, /createElement\(['"]iframe['"]\)|send_vote/);

const bodyMatch = source.match(/!(?:\(\s*)?function\s*\(\)\s*\{/);
assert.ok(bodyMatch, '未找到脚本主体');
const bodyStart = bodyMatch.index;
const bodyLines = source.slice(bodyStart).split(/\r?\n/);
assert.ok(bodyLines.length > 2500, `脚本主体疑似重新压成少量长行：${bodyLines.length} 行`);
assert.ok(Math.max(...bodyLines.slice(0, 200).map((line) => line.length)) < 120, '常量区未充分换行');
const longCodeLines = bodyLines.filter(
    (line) =>
        line.length >= 500 &&
        !line.includes("'\\n#ehtt-panel") &&
        !line.includes('panel.innerHTML = `')
);
assert.deepEqual(longCodeLines, [], '脚本主体仍存在非字符串内容的压缩长行');

const core = require(scriptPath);
assert.equal(core.WRITE_TRANSPORT, 'direct-xhr-verified');
assert.equal(Object.prototype.hasOwnProperty.call(core, retiredFeatureName), false);

console.log('E-Hentai live mode residual audit passed');
