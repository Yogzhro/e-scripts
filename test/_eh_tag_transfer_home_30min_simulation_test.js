'use strict';

const assert = require('node:assert/strict');
const core = require('../eh-tag-transfer.js');

const THREE_MINUTES = 3 * 60 * 1000;
const START_AT = Date.parse('2026-08-07T00:00:00.000Z');
const config = core.sanitizeConfig(core.DEFAULT_CONFIG);

assert.equal(config.scheduleMinutes, 3);
assert.equal(config.homeRequestLimit, 80);

function galleryResult(gid) {
    return {
        url: `https://e-hentai.org/g/${gid}/abcdef/`,
        title: `Simulation Gallery ${gid}`,
        pageCount: 20
    };
}

const preloadedQueue = Array.from({length: 1000}, (_, index) => {
    const gid = String(100000 + index);
    return {
        gid,
        url: `https://e-hentai.org/g/${gid}/abcdef/`,
        title: `Preloaded ${gid}`,
        pageCount: 20,
        discoveredAt: START_AT - THREE_MINUTES,
        attempts: 0,
        nextAttemptAt: 0,
        lastError: ''
    };
});

let home = core.sanitizeHomeState({
    version: 2,
    initializedAt: new Date(START_AT - THREE_MINUTES).toISOString(),
    seenGids: preloadedQueue.map(job => job.gid),
    queue: preloadedQueue,
    nextRunAt: START_AT
});

const discovered = new Set(home.queue.map(job => job.gid));
const completed = new Set();
const timeline = [];
let rebuiltAtMinute15 = false;

for (let cycle = 0; cycle < 10; cycle++) {
    const now = START_AT + cycle * THREE_MINUTES;

    if (cycle === 5) {
        const persisted = JSON.stringify(home);
        home = core.sanitizeHomeState(JSON.parse(persisted));
        assert.equal(JSON.stringify(home), persisted);
        rebuiltAtMinute15 = true;
    }

    const incoming = Array.from({length: 8}, (_, index) =>
        galleryResult(String(200000 + cycle * 8 + 8 - index))
    );
    incoming.forEach(item => discovered.add(core.galleryIdFromUrl(item.url)));
    const merged = core.mergeHomepageResults(home, incoming, config, now);
    assert.equal(merged.queued, 8);
    home = merged.home;

    const budget = core.createRequestBudget(config.homeRequestLimit);
    core.setRequestBudgetReserve(budget, 6);
    for (let request = 0; request < config.homeScanPages; request++) {
        core.consumeRequestBudget(budget, '主页扫描');
    }

    let processedThisCycle = 0;
    while (core.getRequestBudgetRemaining(budget) >= 6) {
        const job = core.findReadyHomeJob(home, now);
        if (!job) break;
        const sameState = core.beginHomeJob(home, job.gid);
        assert.equal(sameState, home, '任务开始不应复制或重新规范化整条队列');
        for (let request = 0; request < 6; request++) {
            core.consumeRequestBudget(budget, `任务 ${job.gid}`);
        }
        const completedState = core.completeHomeGroup(home, [job.url]);
        assert.equal(completedState, home, '任务完成应原地更新一次状态');
        completed.add(job.gid);
        processedThisCycle++;
    }
    assert.equal(processedThisCycle, 11, '80 次预算内应连续处理十一个六请求任务');
    assert.ok(core.getRequestBudgetRemaining(budget) < 6);

    core.setRequestBudgetReserve(budget, 0);
    core.consumeRequestBudget(budget, '错误标签列表');
    home.nextRunAt = now + THREE_MINUTES;

    if (cycle === 4) {
        const frozenUntil = home.nextRunAt + 60 * 1000;
        assert.equal(core.getScheduleState(home.nextRunAt, frozenUntil), 'due');
        assert.equal(core.shouldHandleLifecycleResume('resume', 'hidden'), true);
    }

    const queued = new Set(home.queue.map(item => item.gid));
    for (const gid of discovered) {
        assert.equal(
            completed.has(gid) || queued.has(gid),
            true,
            `画廊 ${gid} 在第 ${cycle + 1} 轮后被静默丢失`
        );
    }
    timeline.push({
        minute: cycle * 3,
        discovered: discovered.size,
        completed: completed.size,
        queued: home.queue.length,
        budgetUsed: budget.used,
        nextRunAt: new Date(home.nextRunAt).toISOString()
    });
}

assert.equal(rebuiltAtMinute15, true);
assert.equal(discovered.size, 1080);
assert.equal(completed.size, 110);
assert.equal(home.queue.length, 970);
assert.deepEqual(
    new Set([...completed, ...home.queue.map(item => item.gid)]),
    discovered
);

console.log('E-Hentai homepage 30-minute accelerated simulation passed');
console.table(timeline);
