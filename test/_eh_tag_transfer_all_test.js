'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const fixturePath = path.join(__dirname, '_eh_tag_transfer_fixture_server.js');
const scriptPath = path.join(projectRoot, 'eh-tag-transfer.js');
const documentationPath = path.join(projectRoot, 'readme', 'e-hentai-跨语言Tag迁移-开发说明.md');
const functionAuditPath = path.join(
    projectRoot,
    'readme',
    'e-hentai-跨语言Tag迁移-函数审计.md'
);
const syntaxFiles = [
    'eh-tag-transfer.js',
    'test/_eh_tag_transfer_all_test.js',
    'test/_eh_tag_transfer_fixture_server.js'
];
const core = require(scriptPath);

function readScriptVersion(source) {
    const version = source.match(/\/\/ @version\s+(\d+\.\d+\.\d+\.\d+)/)?.[1];
    assert.ok(version, '主脚本缺少四段 @version');
    return version;
}

function gallery({
    title,
    japaneseTitle = '',
    pages,
    postedAt = null,
    language = 'japanese',
    tags = [],
    url = 'https://e-hentai.org/g/1/a/'
}) {
    return {
        title,
        titleGn: title,
        titleGj: japaneseTitle,
        titleRefs: [title, japaneseTitle],
        pageCount: pages,
        postedAt,
        language,
        tags,
        url
    };
}

function runSourceAndInterfaceAudit() {
    console.log('\n=== 源码、接口与极简面板审计 ===');
    const sourceBuffer = fs.readFileSync(scriptPath);
    const source = sourceBuffer.toString('utf8');
    const fixtureSource = fs.readFileSync(fixturePath, 'utf8');
    assert.equal(core.version, '0.2.6.7');
    assert.equal(core.transport, 'direct-xhr-verified');
    assert.equal(core.parameters.searchRequestIntervalMs, 3000);
    assert.equal(core.parameters.homeRequestLimit, 120);
    assert.equal(core.parameters.scheduleMinutes, 3);
    assert.equal(core.parameters.scheduleStartTime, '14:00');
    assert.equal(core.parameters.scheduleEndTime, '22:00');
    assert.equal(core.parameters.scheduleTimeJitterMinutes, 60);
    assert.equal(core.parameters.randomTagSkipEnabled, true);
    assert.equal(core.parameters.randomTagSkipMin, 0);
    assert.equal(core.parameters.randomTagSkipMax, 3);
    assert.match(core.parameters.blacklist, /(?:^|\n)female:swimsuit(?:\n|$)/);
    assert.deepEqual(Object.keys(core), [
        'version', 'transport', 'parameters', 'defaults', 'limits', 'config',
        'matching', 'search', 'transfer', 'repository', 'writeProtocol',
        'logs', 'home', 'schedule', 'requests', 'coordination'
    ]);
    assert.equal(core.limits.visibleLogs, 20);
    assert.match(source, /function createEhTagTransferModule\(\)/);
    assert.doesNotMatch(
        source,
        /!0|!1|return void|REQUEST_CLIENT|SCHEDULER|parseBadTagRecords/
    );
    assert.doesNotMatch(source, /rememberGallerySnapshot/);
    assert.doesNotMatch(
        source,
        /function (?:getGalleryListLayout|announceSearchPhase|clearScheduleTimer|clearLifecycleTimer)\b/,
        '单用途薄包装不应回流'
    );
    assert.doesNotMatch(source, /(?:-1|1) \/ 0|\b\d+e\d+\b/);
    assert.doesNotMatch(source, /\bNL\b/);
    for (const retiredMarker of [
        'READ_ONLY_REHEARSAL', 'ehtt-rehearsal-banner', '只读演练',
        'ReadOnlyRehearsalError', 'shouldPersistDomainState', 'recordVotePlan'
    ]) {
        assert.equal(source.includes(retiredMarker), false, `正式版仍残留 ${retiredMarker}`);
    }
    assert.doesNotMatch(source, /ehtt-minimize|ehtt-minimized|savePanelLayout|pointerdown/);
    assert.doesNotMatch(source, /createElement\(['"]iframe['"]\)|send_vote/);
    assert.doesNotMatch(
        source,
        /GDATA_BATCH_SIZE|buildGdataBatches|normalizeGdataMetadata|mergeGdataCandidates|fetchGdataBatch|enrichCandidatesWithGdata|method:\s*["']gdata["']/,
        '生产脚本不得残留 gdata 子系统或请求负载'
    );
    assert.doesNotMatch(
        source,
        /GALLERY_LIST_LAYOUTS|detectGalleryListLayout|findGalleryListLink/,
        '列表解析应使用统一宽泛选择器，不保留布局分派'
    );
    assert.match(source, /querySelectorAll\("\.itg tr,\.gl1t"\)/);
    assert.match(source, /page < maxPages && hasNext && newResultCount > 0/);
    assert.match(
        source,
        /if \(candidateIndex \+ 1 < detailCandidates\.length\)\s+await randomDelay/,
        '最后一个详情候选完成后不得继续等待'
    );
    assert.match(source, /const primarySearchStatus = await runQueryStage\("english"\);/);
    assert.match(source, /if \(primarySearchStatus === "empty"\)/);
    assert.match(source, /主标题与副标题均未搜索到结果/);
    assert.doesNotMatch(fixtureSource, /gdata/i, '浏览器夹具不得保留 gdata 模拟协议');
    assert.ok(
        source.indexOf('applyVersionStateReset();') < source.indexOf('setupGlobalPauseSync();'),
        '版本重置必须先于全局停止监听与自动调度'
    );
    assert.match(source, /aria-live="polite"/);
    assert.match(source, /grid-template-columns:\s*1fr 1fr/);
    assert.match(
        source,
        /\.ehtt-status\s*\{[^}]*height:\s*calc\(4\.35em \+ 16px\);[^}]*overflow:\s*hidden;/s,
        '状态栏必须固定为三行高度并截断溢出内容'
    );
    assert.match(fixtureSource, /id="fixture-status-short"/);
    assert.match(fixtureSource, /id="fixture-status-long"/);
    assert.match(fixtureSource, /id="fixture-status-audit"/);
    assert.match(fixtureSource, /id="fixture-correction-target"/);
    assert.match(fixtureSource, /id="fixture-derived-only"/);
    assert.match(fixtureSource, /id="fixture-random-skip"/);
    assert.match(source, /按明确标题补充 uncensored/);
    assert.match(source, /cachedSnapshot = gallerySnapshotCache\.get\(target\)/);
    assert.match(source, /if \(!canStartVerifiedTagVote\(runtimeState\.requestBudget\)\)/);
    for (const buttonId of [
        'ehtt-stop', 'ehtt-restart', 'ehtt-review-badtags', 'ehtt-export-log'
    ]) {
        assert.match(source, new RegExp(`id="${buttonId}"`));
    }
    const functionNames = [...source.matchAll(/^    (?:async )?function ([A-Za-z_$][\w$]*)\s*\(/gm)]
        .map(match => match[1]);
    assert.deepEqual(functionNames.filter(name => name.length <= 2), []);
    for (const semanticName of [
        'sanitizeConfig', 'sanitizeHomeState', 'assessCandidate', 'runRequestLifecycle',
        'parseGalleryWriteContext', 'correctBadTagRecord', 'runSearchPipeline',
        'processHomepage', 'resolveDailyScheduleWindow', 'classifyCorrectionState',
        'buildTargetTagSet', 'planRandomTagSkip',
        'parseGalleryList', 'runWorker', 'initialize'
    ]) {
        assert.ok(functionNames.includes(semanticName), `缺少语义函数：${semanticName}`);
    }
    assert.doesNotMatch(source, /\b(?:const|let|var)\s+[A-Za-z_$]{1,2}\b/);
    assert.doesNotMatch(source, /\bcatch\s*\(\s*[A-Za-z_$]{1,2}\s*\)/);
    assert.doesNotMatch(
        source,
        /\(\s*[A-Za-z_$]{1,2}(?:\s*,\s*[A-Za-z_$]{1,2})*\s*\)\s*=>/
    );
    for (const match of source.matchAll(
        /\b(?:async\s+)?function(?:\s+[A-Za-z_$][\w$]*)?\s*\(([\s\S]*?)\)\s*\{/g
    )) {
        const shortParameter = match[1].match(
            /(?:^|[,{]\s*)([A-Za-z_$]{1,2})(?=\s*(?:[,}=]|$))/
        );
        assert.equal(shortParameter, null, `函数参数仍是短名称：${shortParameter?.[1] || ''}`);
    }
    const moduleLines = source.slice(source.indexOf('function createEhTagTransferModule()'))
        .split(/\r?\n/);
    assert.ok(moduleLines.length > 2500, `脚本主体疑似重新压缩：${moduleLines.length} 行`);
    assert.ok(
        Math.max(...moduleLines.slice(0, 200).map(line => line.length)) < 120,
        '配置与常量区存在压缩长行'
    );
    assert.deepEqual(
        moduleLines.filter(line => line.length >= 500 && !line.includes('panel.innerHTML = `')),
        [],
        '脚本主体存在非模板字符串的压缩长行'
    );
    for (let index = 0; index < sourceBuffer.length; index++) {
        if (sourceBuffer[index] === 0x0a) {
            assert.equal(sourceBuffer[index - 1], 0x0d, `第 ${index} 字节附近存在孤立 LF`);
        }
    }
    console.log('source and interface audit passed');
}

function runMatchingGoldenSamples() {
    console.log('\n=== 匹配黄金样本 ===');
    const config = core.config.resolve();
    const contaminatedTags = [
        {tag: 'group:project kaguya', solid: true},
        {tag: 'artist:koumo', solid: true},
        {tag: 'parody:xenoblade chronicles 2', solid: true}
    ];
    const incident = gallery({
        title: '[D.P] Boy Meets Girl! (COMIC HOTMiLK 2009-10) | 男孩遇见女孩! [Chinese] [易碎品个人汉化]',
        pages: 30,
        language: 'chinese',
        tags: contaminatedTags,
        url: 'https://e-hentai.org/g/4112860/eebe6c1886/'
    });
    const wrongSequel = gallery({
        title: '(C96) [PROJECT KAGUYA (Koumo)] Boy Meets Girls 2 (Xenoblade Chronicles 2)',
        pages: 31,
        tags: contaminatedTags,
        url: 'https://e-hentai.org/g/1478533/8a0b6013fd/'
    });
    const correctTranslation = gallery({
        title: '[PROJECT KAGUYA (Koumo)] Boy Meets Girls 2 [English] [Digital]',
        pages: 31,
        language: 'english',
        tags: contaminatedTags,
        url: 'https://e-hentai.org/g/2478533/8a0b6013fd/'
    });
    const rejected = core.matching.assessCandidate(incident, wrongSequel, config);
    assert.equal(rejected.accepted, false);
    assert.match(rejected.reason, /标题署名冲突|作品编号冲突/);
    assert.equal(
        core.matching.assessCandidate(wrongSequel, correctTranslation, config).accepted,
        true
    );

    const sharedTags = [
        {tag: 'group:rocket chousashitsu', solid: true},
        {tag: 'artist:koza', solid: true}
    ];
    const translated = gallery({
        title: '[Rocket Chousashitsu (Koza)] Odoroke Odoroke Daifuntou da yo Kogasa-chan! (Touhou Project) [Chinese]',
        japaneseTitle: '[ロケット調査室 (コザ)] おどろけおどろけ 大奮闘だよ小傘ちゃん! (東方Project) [中国翻訳]',
        pages: 34,
        language: 'chinese',
        tags: sharedTags
    });
    const original = gallery({
        title: '(Reitaisai 22) [Rocket Chousashitsu (Koza)] Odoroke Odoroke Daifuntou da yo Kogasa-chan! (Touhou Project)',
        japaneseTitle: '(例大祭22) [ロケット調査室 (コザ)] おどろけおどろけ 大奮闘だよ小傘ちゃん! (東方Project)',
        pages: 32,
        tags: sharedTags
    });
    assert.equal(core.matching.assessCandidate(translated, original, config).accepted, true);
    assert.deepEqual(
        core.search.buildQueries({titleRefs: translated.titleRefs}).map(query => query.stage),
        ['english', 'japanese']
    );
    const translationSuffixQueries = core.search.buildQueries({
        titleRefs: [
            '[Circle] Translation Suffix Work Ch. 2 [某汉化]【某机翻】[某Translate][某Traslate]',
            ''
        ]
    });
    assert.deepEqual(
        translationSuffixQueries.map(query => query.text),
        ['title:"Translation Suffix Work Ch. 2"'],
        '连续翻译尾缀必须全部从搜索标题中删除'
    );
    const leadingTranslationPrefix = core.matching.assessCandidate(
        gallery({
            title: '[某汉化] Translation Prefix Work', pages: 20, language: 'chinese'
        }),
        gallery({
            title: '[Circle] Translation Prefix Work', pages: 20, language: 'japanese'
        }),
        config
    );
    assert.equal(leadingTranslationPrefix.accepted, false);
    assert.equal(leadingTranslationPrefix.reason, '标题署名冲突');
    console.log('matching golden samples passed');
}

function runCorrectionStateTests() {
    console.log('\n=== 修正状态与目标专属标签计划 ===');
    const classify = core.transfer.classifyCorrectionState;
    for (const [title, expected] of [
        ['Work [Uncensored]', 'explicit-uncensored'],
        ['Work (DECENSORED)', 'explicit-uncensored'],
        ['Work 【去碼版】', 'explicit-uncensored'],
        ['Work [無修正]', 'explicit-uncensored'],
        ['Work [무수정]', 'explicit-uncensored'],
        ['Work [Censored]', 'explicit-censored'],
        ['Work [有修正]', 'explicit-censored'],
        ['Work [Not Uncensored]', 'unknown'],
        ['Work 【非无修正】', 'unknown'],
        ['Work (無修正ではない)', 'unknown'],
        ['Work [무수정 아님]', 'unknown'],
        ['Work [Uncensored Censored]', 'conflict'],
        ['Work [English] [Digital]', 'unmarked']
    ]) {
        assert.equal(classify(title, '').state, expected, title);
    }
    assert.equal(
        classify('Work [Uncensored]', '作品 [有修正]').state,
        'conflict',
        'GN/GJ 的正负证据必须合并判冲突'
    );

    const firstIncident = [
        ['https://e-hentai.org/g/4114632/4fbaf80618/',
            '(C105) [CLUTCH SHOT KING (Kakkuu)] Kougekiteki Houshigata LOVE RELINK | Agressive Servicing LOVE RELINK (Dokidoki! PreCure) [English] [Pinandhita 論理型]',
            'unmarked'],
        ['https://e-hentai.org/g/3418696/4138e3d356/',
            '(C105) [CLUTCH SHOT KING (Kakkuu)] Kougekiteki Houshigata LOVE RELINK (Dokidoki! PreCure) [Chinese] [雾雨玲子] [Uncensored]',
            'explicit-uncensored'],
        ['https://e-hentai.org/g/3368378/9590047bbf/',
            '(C105) [CLUTCH SHOT KING (Kakkuu)] Kougekiteki Houshigata LOVE RELINK (Dokidoki! PreCure) [Chinese] [雾雨玲子]',
            'unmarked'],
        ['https://e-hentai.org/g/3345275/60ea7ccb46/',
            '(C105) [CLUTCH SHOT KING (Kakkuu)] Kougekiteki Houshigata LOVE RELINK (Dokidoki! PreCure)',
            'unmarked']
    ];
    const secondIncident = [
        ['https://e-hentai.org/g/4114757/0f0d83d742/',
            '[Tortoiseshell (Kinku)] Oshioki no Ojikan Desu | 벌받을 시간이에요 [Korean] [Digital]',
            'unmarked'],
        ['https://e-hentai.org/g/4087133/096ac22c40/',
            "[Tortoiseshell (Kinku)] Oshioki no Ojikan desu | It's Time for Punishment [English] [Sussy] [Decensored]  [Digital]",
            'explicit-uncensored'],
        ['https://e-hentai.org/g/4087125/0f4294696d/',
            "[Tortoiseshell (Kinku)] Oshioki no Ojikan desu | It's Time for Punishment [English] [Sussy] [Digital]",
            'unmarked']
    ];
    for (const [url, title, expected] of [...firstIncident, ...secondIncident]) {
        assert.equal(classify(title, '').state, expected, url);
    }

    const noBlacklist = core.transfer.compileBlacklist('');
    const unmarkedTarget = gallery({
        title: firstIncident[0][1], pages: 31, language: 'english',
        url: firstIncident[0][0]
    });
    const blockedPlan = core.transfer.buildTargetTagSet(
        unmarkedTarget,
        ['female:glasses', 'other:uncensored'],
        noBlacklist,
        [firstIncident[1][0]]
    );
    assert.deepEqual(blockedPlan.tags, ['female:glasses']);
    assert.equal(blockedPlan.audit.action, 'source-blocked');
    assert.deepEqual(blockedPlan.audit.sourceUrls, [firstIncident[1][0]]);

    const explicitTarget = gallery({
        title: firstIncident[1][1], pages: 30, language: 'chinese',
        url: firstIncident[1][0]
    });
    const derivedPlan = core.transfer.buildTargetTagSet(
        explicitTarget, [], noBlacklist, []
    );
    assert.deepEqual(derivedPlan.tags, ['other:uncensored']);
    assert.deepEqual(derivedPlan.derivedTags, ['other:uncensored']);
    assert.equal(derivedPlan.audit.action, 'derived');

    const blacklistedPlan = core.transfer.buildTargetTagSet(
        explicitTarget,
        ['other:uncensored'],
        core.transfer.compileBlacklist('uncensored'),
        [firstIncident[1][0]]
    );
    assert.deepEqual(blacklistedPlan.tags, []);
    assert.equal(blacklistedPlan.audit.action, 'blacklisted');
    const shortTargetPlan = core.transfer.buildTargetTagSet(
        explicitTarget, [], noBlacklist, [], false
    );
    assert.deepEqual(shortTargetPlan.tags, []);
    assert.equal(shortTargetPlan.audit.action, 'below-minimum-pages');

    const errorTarget = {
        url: 'https://e-hentai.org/g/1/error/',
        get titleGn() { throw new Error('fixture classifier failure'); },
        titleGj: ''
    };
    const failClosedPlan = core.transfer.buildTargetTagSet(
        errorTarget,
        ['female:glasses', 'other:uncensored'],
        noBlacklist,
        []
    );
    assert.equal(failClosedPlan.correction.state, 'error');
    assert.deepEqual(failClosedPlan.tags, ['female:glasses']);
    assert.equal(failClosedPlan.audit.action, 'classifier-error');

    assert.deepEqual(
        core.transfer.collectTagSourceUrls([
            {url: firstIncident[1][0], tags: [{tag: 'other:uncensored', solid: true}]},
            {url: firstIncident[2][0], tags: [{tag: 'other:uncensored', solid: false}]}
        ], 'other:uncensored', 'solid'),
        [firstIncident[1][0]]
    );
    const voteBudget = core.requests.createBudget(2);
    assert.equal(core.requests.canStartVerifiedVote(voteBudget), true);
    core.requests.consumeBudget(voteBudget, 'fixture');
    assert.equal(core.requests.canStartVerifiedVote(voteBudget), false);
    console.log('correction state tests passed');
}

function runRandomTagSkipTests() {
    console.log('\n=== 随机少迁移标签计划 ===');
    const planSkip = core.transfer.planRandomTagSkip;
    const defaultConfig = core.config.resolve();
    const eligibleTags = [
        'female:dark skin',
        'female:long hair',
        'female:sole female',
        'male:sole male'
    ];

    assert.deepEqual(
        planSkip(eligibleTags, {...defaultConfig, randomTagSkipEnabled: false}, () => {
            throw new Error('关闭功能时不得读取随机源');
        }),
        {
            eligibleCount: 4,
            requestedCount: 0,
            actualCount: 0,
            skippedTags: [],
            remainingTags: eligibleTags
        }
    );
    assert.deepEqual(planSkip(eligibleTags, defaultConfig, () => 0), {
        eligibleCount: 4,
        requestedCount: 0,
        actualCount: 0,
        skippedTags: [],
        remainingTags: eligibleTags
    });
    const deduplicatedPlan = planSkip(
        [' Female:One ', 'female:one', 'female:two', ''],
        {...defaultConfig, randomTagSkipMin: 1, randomTagSkipMax: 1},
        () => 1
    );
    assert.equal(deduplicatedPlan.eligibleCount, 2);
    assert.equal(deduplicatedPlan.skippedTags.length, 1);
    assert.equal(new Set(deduplicatedPlan.skippedTags).size, 1);
    assert.equal(deduplicatedPlan.remainingTags.length, 1);

    const maximumPlan = planSkip(eligibleTags, defaultConfig, () => 1);
    assert.equal(maximumPlan.requestedCount, 3);
    assert.equal(maximumPlan.actualCount, 3);
    assert.deepEqual(maximumPlan.skippedTags, eligibleTags.slice(0, 3));
    assert.deepEqual(maximumPlan.remainingTags, eligibleTags.slice(3));
    const cappedPlan = planSkip(
        ['female:one', 'female:two'],
        {...defaultConfig, randomTagSkipMin: 3, randomTagSkipMax: 3},
        () => 0
    );
    assert.equal(cappedPlan.requestedCount, 3);
    assert.equal(cappedPlan.actualCount, 1);
    assert.equal(cappedPlan.remainingTags.length, 1);
    assert.deepEqual(
        planSkip(['female:only'], defaultConfig, () => {
            throw new Error('只有一个标签时不得读取随机源');
        }),
        {
            eligibleCount: 1,
            requestedCount: 0,
            actualCount: 0,
            skippedTags: [],
            remainingTags: ['female:only']
        }
    );

    const firstRun = planSkip(
        ['female:a', 'female:b', 'female:c'],
        {...defaultConfig, randomTagSkipMin: 1, randomTagSkipMax: 1},
        () => 0
    );
    const secondRun = planSkip(
        ['female:a', 'female:b', 'female:c'],
        {...defaultConfig, randomTagSkipMin: 1, randomTagSkipMax: 1},
        () => 1
    );
    assert.notDeepEqual(firstRun.skippedTags, secondRun.skippedTags);

    const randomValues = [1, 0, 0];
    const sensitivePlan = planSkip(
        ['female:existing', 'female:downvoted', 'female:pending', 'other:uncensored']
            .filter(tag => !['female:existing', 'female:downvoted'].includes(tag)),
        {...defaultConfig, randomTagSkipMin: 3, randomTagSkipMax: 3},
        () => randomValues.shift() ?? 0
    );
    assert.equal(sensitivePlan.eligibleCount, 2);
    assert.equal(sensitivePlan.actualCount, 1);
    assert.equal(sensitivePlan.skippedTags.includes('other:uncensored'), true);
    assert.equal(sensitivePlan.skippedTags.includes('female:existing'), false);
    assert.equal(sensitivePlan.skippedTags.includes('female:downvoted'), false);
    console.log('random tag skip tests passed');
}

function runSafetyRegressionTests() {
    console.log('\n=== 配置、迁移与安全协议回归 ===');
    const sanitized = core.config.sanitize({
        mode: 'all',
        transferDirection: 'all',
        randomTagSkipEnabled: false,
        randomTagSkipMin: 50,
        randomTagSkipMax: -5,
        maxSearchPages: 99,
        searchRequestIntervalMs: 1,
        maxPageDifference: -1,
        maxTitleDistanceRatio: 2,
        minCandidateScoreGap: -1,
        genericTitleLength: 1,
        minGalleryPages: 5000,
        homeScanPages: 0,
        homeRequestLimit: 500,
        scheduleMinutes: 1,
        scheduleStartTime: '25:00',
        scheduleEndTime: '06:30',
        scheduleTimeJitterMinutes: 999,
        badTagEnabled: false,
        uid: 'user-7647802',
        badTagUid: '111'
    });
    assert.deepEqual(
        {
            mode: sanitized.mode,
            direction: sanitized.transferDirection,
            randomSkipEnabled: sanitized.randomTagSkipEnabled,
            randomSkipMin: sanitized.randomTagSkipMin,
            randomSkipMax: sanitized.randomTagSkipMax,
            pages: sanitized.maxSearchPages,
            interval: sanitized.searchRequestIntervalMs,
            pageDifference: sanitized.maxPageDifference,
            titleRatio: sanitized.maxTitleDistanceRatio,
            scoreGap: sanitized.minCandidateScoreGap,
            shortTitle: sanitized.genericTitleLength,
            minPages: sanitized.minGalleryPages,
            scanPages: sanitized.homeScanPages,
            requestLimit: sanitized.homeRequestLimit,
            scheduleMinutes: sanitized.scheduleMinutes,
            start: sanitized.scheduleStartTime,
            end: sanitized.scheduleEndTime,
            jitter: sanitized.scheduleTimeJitterMinutes,
            badTags: sanitized.badTagEnabled,
            uid: sanitized.uid
        },
        {
            mode: 'all', direction: 'all',
            randomSkipEnabled: false, randomSkipMin: 0, randomSkipMax: 50,
            pages: 5, interval: 3000,
            pageDifference: 0, titleRatio: 1, scoreGap: 0, shortTitle: 4,
            minPages: 1000, scanPages: 1, requestLimit: 200, scheduleMinutes: 3,
            start: '14:00', end: '06:30', jitter: 720, badTags: false,
            uid: '7647802'
        }
    );
    assert.equal(Object.hasOwn(sanitized, 'badTagUid'), false);
    const sanitizedRandomLimits = core.config.sanitize({
        randomTagSkipMin: 'invalid',
        randomTagSkipMax: 5000
    });
    assert.equal(sanitizedRandomLimits.randomTagSkipMin, 0);
    assert.equal(sanitizedRandomLimits.randomTagSkipMax, 1000);

    const searchUrl = new URL(core.search.buildUrl('title:"Work Ch. 2"', 'https://exhentai.org'));
    assert.equal(searchUrl.origin, 'https://exhentai.org');
    assert.equal(searchUrl.searchParams.get('f_search'), 'title:"Work Ch. 2"');
    for (const parameter of ['f_sfl', 'f_sfu', 'f_sft']) {
        assert.equal(searchUrl.searchParams.get(parameter), 'on');
    }
    assert.deepEqual(Object.keys(core.search.pipeline), [
        'discover', 'prefilter', 'loadProgressiveDetails', 'selectFinal', 'run'
    ]);
    assert.equal(core.search.pipeline.prefilter.constructor.name, 'Function');
    assert.deepEqual(Object.keys(core.search.listings), ['parse']);
    assert.equal(core.search.canContinuePages(1, 1, true, 25), false);
    assert.equal(core.search.canContinuePages(1, 2, true, 25), true);
    assert.equal(core.search.canContinuePages(1, 2, false, 25), false);
    assert.equal(core.search.canContinuePages(1, 2, true, 0), false);
    assert.equal(Object.hasOwn(core.search, 'gdata'), false);

    let exactDistanceCalls = 0;
    assert.equal(
        core.matching.titleDistanceRatio('ＡＢＣ！', 'abc', () => exactDistanceCalls++),
        0,
        '规范化后相等的标题应直接返回零距离'
    );
    assert.equal(exactDistanceCalls, 0, '完全相等标题不得建立 Levenshtein 矩阵');
    let cachedDistanceCalls = 0;
    const cachedTitleComparison = core.matching.compareTitles(
        ['[Circle] Distance Cache Work Alpha'],
        ['[Circle] Distance Cache Work Alphb'],
        core.config.resolve(),
        () => {
            cachedDistanceCalls++;
            return 0.05;
        }
    );
    assert.equal(cachedTitleComparison.accepted, true);
    assert.equal(cachedDistanceCalls, 1, '全局与同字段比较必须复用同一标题对距离');

    const cacheCurrent = gallery({title: '[Circle] Cached Preview', pages: 20});
    const cacheCandidate = gallery({
        title: '[Circle] Cached Preview',
        pages: 20,
        language: 'english',
        url: 'https://e-hentai.org/g/2/b/'
    });
    let assessmentCalls = 0;
    const getTaskAssessment = core.search.createTaskAssessor(
        cacheCurrent,
        core.config.resolve(),
        () => {
            assessmentCalls++;
            return {accepted: true, score: 100};
        }
    );
    assert.equal(getTaskAssessment(cacheCandidate).accepted, true);
    assert.equal(
        core.search.pipeline.prefilter(
            cacheCurrent,
            [cacheCandidate],
            core.config.resolve(),
            getTaskAssessment
        ).length,
        1
    );
    assert.equal(assessmentCalls, 1, '同一任务的预览候选评估必须只计算一次');

    const expectedDefaultBlacklist = [
        'language:*',
        'reclass:*',
        'other:extraneous ads',
        'other:full color',
        'other:scanmark',
        'other:watermarked',
        'other:multipanel sequence',
        'other:rough translation',
        'parody:original',
        'female:handjob',
        'female:blowjob',
        'female:paizuri',
        'female:nakadashi',
        'female:swimsuit'
    ];
    assert.deepEqual(core.parameters.blacklist.split('\n'), expectedDefaultBlacklist);
    const defaultBlacklist = core.transfer.compileBlacklist(core.parameters.blacklist);
    for (const tag of [
        'language:english', 'reclass:artistcg', 'other:extraneous ads',
        'other:full color', 'other:scanmark', 'other:watermarked',
        'other:multipanel sequence', 'other:rough translation', 'parody:original',
        'female:handjob', 'female:blowjob', 'female:paizuri', 'female:nakadashi',
        'female:swimsuit'
    ]) {
        assert.equal(core.transfer.isBlacklisted(tag, defaultBlacklist), true, tag);
    }
    for (const tag of [
        'other:full censorship', 'other:mosaic censorship', 'female:big ass',
        'female:x-ray', 'female:kissing', 'female:big breasts', 'male:handjob',
        'other:original', 'female:rough translation'
    ]) {
        assert.equal(core.transfer.isBlacklisted(tag, defaultBlacklist), false, tag);
    }

    const blacklist = core.transfer.compileBlacklist(
        '# comment\nfull color\nother:multipanel sequence\nlanguage:*\nswimsuit'
    );
    for (const tag of [
        'other:full color', 'other:multipanel sequence', 'language:japanese',
        'female:swimsuit'
    ]) {
        assert.equal(core.transfer.isBlacklisted(tag, blacklist), true, tag);
    }
    assert.equal(core.transfer.isBlacklisted('female:glasses', blacklist), false);
    assert.deepEqual(
        core.transfer.buildTagUnion([
            {tags: [
                {tag: 'female:glasses', solid: true},
                {tag: 'female:swimsuit', solid: true},
                {tag: 'female:sole female', solid: false}
            ]},
            {tags: [{tag: 'female:glasses', solid: true}]}
        ], 'solid', blacklist),
        ['female:glasses']
    );
    assert.deepEqual(
        core.transfer.planTarget(
            ['female:glasses', 'female:sole female', 'male:sole male'],
            [
                {tag: 'female:glasses', solid: true, voted: false},
                {tag: 'female:sole female', solid: false, voted: true},
                {tag: 'male:sole male', solid: false, voted: false, downvoted: true}
            ]
        ),
        {
            pending: [], skippedSolid: 1, skippedVoted: 1,
            skippedDownvoted: 1, downvotedTags: ['male:sole male']
        }
    );
    assert.deepEqual(core.transfer.buildBatches(['female:a', 'female:bb'], 15), [
        ['female:a'], ['female:bb']
    ]);
    const transferPlan = core.transfer.buildPlan([
        gallery({title: 'Work', pages: 20, postedAt: 100, url: 'https://e-hentai.org/g/1/a/'}),
        gallery({title: 'Work', pages: 20, postedAt: 200, url: 'https://e-hentai.org/g/2/b/'})
    ], 'newest');
    assert.equal(transferPlan.newest.url, 'https://e-hentai.org/g/2/b/');
    assert.deepEqual(transferPlan.targets.map(item => item.url), ['https://e-hentai.org/g/2/b/']);

    assert.equal(core.writeProtocol.isTrustedApiUrl(
        'https://api.e-hentai.org/api.php',
        'https://e-hentai.org/g/123/abcdef/'
    ), true);
    assert.equal(core.writeProtocol.isTrustedApiUrl(
        'https://api.e-hentai.org/api.php',
        'https://exhentai.org/g/123/abcdef/'
    ), true);
    assert.equal(core.writeProtocol.isTrustedApiUrl(
        'https://evil.example/api.php',
        'https://e-hentai.org/g/123/abcdef/'
    ), false);
    const scriptDocument = {
        querySelectorAll(selector) {
            assert.equal(selector, 'script:not([src])');
            return [{textContent: [
                'var api_url="https://api.e-hentai.org/api.php"',
                'var gid=123',
                'var token="abcdef"',
                'var apiuid=7647802',
                'var apikey="0123456789abcdef"'
            ].join(';')}];
        }
    };
    const writeContext = core.writeProtocol.parseContext(
        scriptDocument,
        'https://e-hentai.org/g/123/abcdef/'
    );
    assert.ok(writeContext);
    assert.deepEqual(
        core.writeProtocol.buildPayload(writeContext, [' Female:Glasses ', ''], -1),
        {
            method: 'taggallery', apiuid: 7647802, apikey: '0123456789abcdef',
            gid: 123, token: 'abcdef', tags: 'female:glasses', vote: -1
        }
    );
    assert.equal(core.writeProtocol.parseContext(
        scriptDocument,
        'https://e-hentai.org/g/124/abcdef/'
    ), null);

    const correctionCases = new Map([
        ['already-missing', {exists: false, upvoted: false, downvoted: false}],
        ['already-downvoted', {exists: true, upvoted: false, downvoted: true}],
        ['withdraw-and-downvote', {exists: true, upvoted: true, downvoted: false}],
        ['downvote', {exists: true, upvoted: false, downvoted: false}]
    ]);
    for (const [expected, state] of correctionCases) {
        assert.equal(core.repository.correctionStrategy(state), expected);
    }
    const records = Array.from({length: 12}, (_, index) => ({
        gid: String(index + 1), tag: 'female:test', timestamp: String(index)
    }));
    const knownFingerprint = core.repository.fingerprint(records[0]);
    const badTagState = core.repository.sanitizeState({
        uid: '7647802', knownFingerprints: [knownFingerprint, knownFingerprint]
    });
    assert.deepEqual(badTagState.knownFingerprints, [knownFingerprint]);
    const badTagBatch = core.repository.selectBatch(records, badTagState, false, 10);
    assert.equal(badTagBatch.records.length, 10);
    assert.equal(badTagBatch.totalPending, 11);
    assert.equal(badTagBatch.remaining, 1);
    const uncertainWrite = core.transfer.reconcileBatch(
        {querySelectorAll() { return []; }},
        ['female:test']
    );
    assert.deepEqual(uncertainWrite, {
        confirmed: 0, failedTags: ['female:test'], shouldRetry: false
    });

    let home = core.home.sanitizeState({
        queue: Array.from({length: 505}, (_, index) => ({
            url: `https://e-hentai.org/g/${1000 + index}/abcdef/`,
            title: `Queued ${index}`,
            pageCount: 20
        }))
    });
    assert.equal(home.queue.length, 505);
    const firstJob = home.queue[0];
    core.home.beginJob(home, firstJob.gid);
    assert.equal(firstJob.attempts, 1);
    core.home.preserveJobAfterBudget(home, firstJob.gid);
    assert.deepEqual(
        {attempts: firstJob.attempts, nextAttemptAt: firstJob.nextAttemptAt, error: firstJob.lastError},
        {attempts: 0, nextAttemptAt: 0, error: ''}
    );
    assert.equal(core.home.getDisposition({status: 'no-related'}).action, 'complete');
    assert.equal(core.home.getDisposition({status: 'partial', failed: 2}).action, 'retry');

    const budget = core.requests.createBudget(10);
    core.requests.setReserve(budget, 3);
    for (let index = 0; index < 7; index++) core.requests.consumeBudget(budget, 'test');
    assert.equal(core.requests.getRemaining(budget), 0);
    assert.equal(core.requests.getRemaining(budget, true), 3);
    assert.throws(() => core.requests.consumeBudget(budget, 'test'), {name: 'RequestBudgetError'});
    assert.equal(core.requests.isRetryableError(Object.assign(new Error(), {status: 503})), true);
    assert.equal(core.requests.isRetryableError(Object.assign(new Error(), {status: 404})), false);

    assert.deepEqual(core.coordination.sanitizePause(true), {paused: true, changedAt: 0});
    assert.equal(core.coordination.isForeignLock(
        {owner: 'other', expiresAt: 200}, 'self', 100
    ), true);
    assert.equal(core.coordination.getInterruptedState(
        {owner: 'owner'}, 'owner', {owner: 'owner', expiresAt: 200}, 100
    ), 'active');
    assert.equal(core.coordination.getInterruptedState(
        {owner: 'owner'}, 'owner', {owner: 'owner', expiresAt: 50}, 100
    ), 'interrupted');
    assert.equal(core.coordination.shouldResumeLifecycle('visibilitychange', 'hidden'), false);
    assert.equal(core.coordination.shouldResumeLifecycle('resume', 'hidden'), true);
    console.log('configuration, transfer and protocol regressions passed');
}

function runGalleryListingTests() {
    console.log('\n=== 统一列表解析 ===');
    const currentGallery = gallery({
        title: '[Circle] Preview Only Work Ch. 1',
        pages: 20,
        url: 'https://e-hentai.org/g/9000/aaaaaaaaaa/'
    });
    const previewCandidate = gallery({
        title: '[Circle] Preview Only Work Ch. 1',
        pages: 20,
        language: 'english',
        url: 'https://e-hentai.org/g/9001/bbbbbbbbbb/'
    });
    assert.equal(
        core.search.pipeline.prefilter(currentGallery, [previewCandidate], core.config.resolve()).length,
        1,
        '列表信息完整且匹配时应同步通过预筛'
    );
    assert.equal(
        core.search.pipeline.prefilter(
            currentGallery,
            [{...previewCandidate, pageCount: null}],
            core.config.resolve()
        ).length,
        0,
        '列表页数缺失时应直接拒绝，不再请求元数据补全'
    );
    function listingItem(title, url, pageText) {
        const titleElement = {textContent: title};
        const linkElement = {getAttribute: name => name === 'href' ? url : ''};
        return {
            querySelector(selector) {
                if (selector === '.glink') return titleElement;
                if (selector.includes('a[href*="/g/"]')) return linkElement;
                return null;
            },
            querySelectorAll(selector) {
                if (selector === 'td,div,span') return [{textContent: pageText}];
                if (selector === '.gt,.gtl') return [];
                return [];
            }
        };
    }
    const listingDocument = {
        querySelectorAll(selector) {
            assert.equal(selector, '.itg tr,.gl1t');
            return [
                listingItem('English Pages', '/g/10/aaaaaaaaaa/', '20 pages'),
                listingItem('Localized Pages', '/g/11/bbbbbbbbbb/', '20 ページ')
            ];
        }
    };
    const parsedListings = core.search.listings.parse(
        listingDocument,
        'https://e-hentai.org'
    );
    assert.equal(parsedListings.length, 2);
    assert.equal(parsedListings[0].pageCount, 20);
    assert.equal(parsedListings[1].pageCount, null, '列表页数应以完整 pages 字段为准');
    assert.deepEqual(
        core.search.listings.parse({querySelectorAll: () => []}, 'https://e-hentai.org'),
        [],
        '空结果页应直接返回空列表'
    );
    console.log('gallery listing tests passed');
}

async function runRequestLifecycleTests() {
    console.log('\n=== 统一请求生命周期 ===');
    let abortCount = 0;
    const controller = new AbortController();
    const request = core.requests.runLifecycle({
        signal: controller.signal,
        start() {
            return () => abortCount++;
        }
    });
    controller.abort();
    await assert.rejects(request, error => error.name === 'AbortError');
    assert.equal(abortCount, 1);

    let resolveRequest;
    const settled = core.requests.runLifecycle({
        start({resolve}) {
            resolveRequest = resolve;
        }
    });
    resolveRequest('first');
    resolveRequest('second');
    assert.equal(await settled, 'first');

    let timeoutAbortCount = 0;
    await assert.rejects(
        core.requests.runLifecycle({
            timeoutMs: 5,
            createTimeoutFailure() {
                const error = new Error('fixture timeout');
                error.name = 'TimeoutError';
                return error;
            },
            start() {
                return () => timeoutAbortCount++;
            }
        }),
        error => error.name === 'TimeoutError'
    );
    assert.equal(timeoutAbortCount, 1);
    assert.equal(
        (fs.readFileSync(scriptPath, 'utf8').match(/runRequestLifecycle\(/g) || []).length,
        4,
        'HTML Fetch、标签 XHR 与 GM 适配器必须复用唯一生命周期入口'
    );
    console.log('request lifecycle tests passed');
}

function runVersionAndScheduleTests() {
    console.log('\n=== 版本重置与每日调度 ===');
    const first = core.coordination.planVersionReset(null, '0.2.4.0', 'https://e-hentai.org');
    assert.equal(first.shouldResetOrigin, true);
    assert.equal(first.shouldClearGlobalPause, true);
    const second = core.coordination.planVersionReset(
        first.state,
        '0.2.4.0',
        'https://exhentai.org'
    );
    assert.equal(second.shouldResetOrigin, true);
    assert.equal(second.shouldClearGlobalPause, false);
    const same = core.coordination.planVersionReset(
        second.state,
        '0.2.4.0',
        'https://exhentai.org'
    );
    assert.equal(same.shouldResetOrigin, false);

    const config = core.config.resolve();
    const noon = Date.parse('2026-08-13T12:00:00+08:00');
    const earliestWindow = core.schedule.resolveWindow(noon, config, null, () => 0);
    assert.equal(earliestWindow.startAt, Date.parse('2026-08-13T13:00:00+08:00'));
    assert.equal(earliestWindow.endAt, Date.parse('2026-08-13T21:00:00+08:00'));
    const latestWindow = core.schedule.resolveWindow(noon, config, null, () => 1);
    assert.equal(latestWindow.startAt, Date.parse('2026-08-13T15:00:00+08:00'));
    assert.equal(latestWindow.endAt, Date.parse('2026-08-13T23:00:00+08:00'));
    assert.equal(core.schedule.isWithinWindow(noon, config, earliestWindow), false);
    assert.equal(
        core.schedule.alignRunAt(noon, config, earliestWindow).runAt,
        earliestWindow.startAt
    );
    assert.deepEqual(
        core.schedule.resolveWindow(
            Date.parse('2026-08-13T16:00:00+08:00'),
            config,
            earliestWindow,
            () => 1
        ),
        earliestWindow,
        '刷新后必须复用当天已经生成的绝对时间窗'
    );
    const changedWindow = core.schedule.resolveWindow(
        noon,
        {...config, scheduleTimeJitterMinutes: 59},
        earliestWindow,
        () => 0.5
    );
    assert.notEqual(changedWindow.key, earliestWindow.key);
    assert.equal(changedWindow.startAt, Date.parse('2026-08-13T14:00:00+08:00'));
    assert.equal(changedWindow.endAt, Date.parse('2026-08-13T22:00:00+08:00'));
    console.log('version and schedule tests passed');
}

function runHomepageSimulation() {
    console.log('\n=== 主页十周期 / 中途刷新模拟 ===');
    const threeMinutes = 3 * 60 * 1000;
    const startAt = Date.parse('2026-08-07T00:00:00.000Z');
    const config = core.config.resolve();
    const preloadedQueue = Array.from({length: 1000}, (_, index) => {
        const gid = String(100000 + index);
        return {
            gid,
            url: `https://e-hentai.org/g/${gid}/abcdef/`,
            title: `Preloaded ${gid}`,
            pageCount: 20,
            discoveredAt: startAt - threeMinutes,
            attempts: 0,
            nextAttemptAt: 0,
            lastError: ''
        };
    });
    let home = core.home.sanitizeState({
        version: 2,
        initializedAt: new Date(startAt - threeMinutes).toISOString(),
        seenGids: preloadedQueue.map(job => job.gid),
        queue: preloadedQueue,
        nextRunAt: startAt
    });
    const discovered = new Set(home.queue.map(job => job.gid));
    const completed = new Set();

    for (let cycle = 0; cycle < 10; cycle++) {
        const now = startAt + cycle * threeMinutes;
        if (cycle === 5) home = core.home.sanitizeState(JSON.parse(JSON.stringify(home)));
        const incoming = Array.from({length: 8}, (_, index) => {
            const gid = String(200000 + cycle * 8 + index);
            discovered.add(gid);
            return {
                url: `https://e-hentai.org/g/${gid}/abcdef/`,
                title: `Gallery ${gid}`,
                pageCount: 20
            };
        });
        home = core.home.mergeResults(home, incoming, config, now).home;
        const budget = core.requests.createBudget(config.homeRequestLimit);
        core.requests.setReserve(budget, 6);
        for (let scan = 0; scan < config.homeScanPages; scan++) {
            core.requests.consumeBudget(budget, 'scan');
        }
        while (core.requests.getRemaining(budget) >= 6) {
            const job = core.home.findReadyJob(home, now);
            if (!job) break;
            core.home.beginJob(home, job.gid);
            for (let request = 0; request < 6; request++) {
                core.requests.consumeBudget(budget, job.gid);
            }
            core.home.completeGroup(home, [job.url]);
            completed.add(job.gid);
        }
        const queued = new Set(home.queue.map(job => job.gid));
        for (const gid of discovered) {
            assert.equal(completed.has(gid) || queued.has(gid), true, `队列丢失 ${gid}`);
        }
    }
    assert.equal(discovered.size, 1080);
    assert.equal(completed.size, 180);
    assert.equal(home.queue.length, 900);
    console.log('homepage simulation passed');
}

function runRepositoryAndLogTests() {
    console.log('\n=== Repository、隐藏审计与 TXT ===');
    const galleryUrl = 'https://e-hentai.org/g/4112860/eebe6c1886/';
    const audit = core.repository.buildAudit([{
        gid: '4112860',
        galleryUrl,
        title: '[D.P] Boy Meets Girl!',
        tags: ['other:full color', 'female:swimsuit'],
        badTags: [{tag: 'female:swimsuit', timestamp: '8/13 10:01:00'}]
    }], {
        uid: '7647802',
        recordedAt: new Date('2026-08-13T02:03:04.000Z')
    });
    assert.equal(audit.galleryCount, 1);
    assert.equal(audit.badTagRecordCount, 1);
    const entries = Array.from({length: 1002}, (_, index) =>
        core.logs.createEntry('warn', `消息 ${index}`, galleryUrl)
    );
    core.logs.trimEntries(entries);
    assert.equal(entries.length, 1000);
    assert.equal(entries[0].message, '消息 2');
    entries[998] = core.logs.createEntry(
        'skip',
        '随机省略 2 个标签',
        galleryUrl,
        new Date('2026-08-13T02:02:03.000Z'),
        null,
        {
            rangeMin: 0,
            rangeMax: 3,
            eligibleCount: 5,
            actualCount: 2,
            skippedTags: ['female:long hair', 'other:uncensored']
        }
    );
    assert.doesNotMatch(core.logs.formatEntry(entries[998]), /long hair|uncensored/);
    entries[999] = core.logs.createEntry(
        'warn',
        '目标标题不兼容，已拦截来源的 other:uncensored',
        galleryUrl,
        new Date('2026-08-13T02:03:04.000Z'),
        {
            tag: 'other:uncensored',
            targetUrl: galleryUrl,
            titleGn: '[D.P] Boy Meets Girl! [English]',
            titleGj: '',
            state: 'unmarked',
            action: 'source-blocked',
            reason: '目标标题没有明确无修正标记',
            positiveMarkers: [],
            negativeMarkers: [],
            negatedMarkers: [],
            sourceUrls: ['https://e-hentai.org/g/3418696/4138e3d356/']
        }
    );
    const text = core.logs.buildExportText(entries, {
        version: core.version,
        site: 'https://e-hentai.org',
        exportedAt: new Date('2026-08-13T02:03:04.000Z'),
        badTagAudit: audit
    });
    assert.equal(text.charCodeAt(0), 0xfeff);
    assert.match(text, /日志条数: 1000\r\n/);
    assert.match(text, /\[错误标签频次 TSV\]/);
    assert.match(text, /\[修正状态审计\]/);
    assert.match(text, /\[随机少迁移审计\]/);
    assert.match(text, /配置范围: 0-3/);
    assert.match(text, /候选标签数: 5/);
    assert.match(text, /实际省略数: 2/);
    assert.match(text, /省略标签:\r\nfemale:long hair\r\nother:uncensored/);
    assert.match(text, /动作: source-blocked/);
    assert.match(text, /GN: \[D\.P\] Boy Meets Girl! \[English\]/);
    assert.match(text, /相关来源:\r\nhttps:\/\/e-hentai\.org\/g\/3418696\/4138e3d356\//);
    assert.match(text, /链接: https:\/\/e-hentai\.org\/g\/4112860\/eebe6c1886\//);
    assert.match(text, /female:swimsuit/);
    console.log('repository and log tests passed');
}

function runNode(args, label) {
    console.log(`\n=== ${label} ===`);
    const result = childProcess.spawnSync(process.execPath, args, {
        cwd: projectRoot,
        stdio: 'inherit'
    });
    if (result.error) throw result.error;
    assert.equal(
        result.status,
        0,
        `${label} 失败${result.signal ? `（${result.signal}）` : ''}`
    );
}

function requestText(url) {
    return new Promise((resolve, reject) => {
        const request = http.get(url, {timeout: 2000}, response => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', chunk => {
                body += chunk;
            });
            response.on('end', () => {
                resolve({statusCode: response.statusCode, body});
            });
        });
        request.on('timeout', () => request.destroy(new Error(`请求超时：${url}`)));
        request.on('error', reject);
    });
}

function delay(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function getFreePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            server.close(error => {
                if (error) reject(error);
                else resolve(address.port);
            });
        });
    });
}

async function waitForFixture(baseUrl, child, readOutput) {
    for (let attempt = 0; attempt < 50; attempt++) {
        if (child.exitCode !== null) {
            throw new Error(`夹具服务器提前退出：${readOutput()}`);
        }
        try {
            return await requestText(`${baseUrl}/?reset=1`);
        } catch {
            await delay(100);
        }
    }
    throw new Error(`夹具服务器启动超时：${readOutput()}`);
}

async function stopChild(child) {
    if (child.exitCode !== null) return;
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill();
    await Promise.race([exited, delay(2000)]);
    if (child.exitCode === null) {
        child.kill('SIGKILL');
        await exited;
    }
}

async function runFixtureSmokeTest() {
    console.log('\n=== 本地浏览器夹具 HTTP 烟测 ===');
    const port = await getFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    let stdout = '';
    let stderr = '';
    const child = childProcess.spawn(process.execPath, [fixturePath], {
        cwd: projectRoot,
        env: {...process.env, EH_TAG_TRANSFER_FIXTURE_PORT: String(port)},
        stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.on('data', chunk => {
        stdout += chunk;
    });
    child.stderr.on('data', chunk => {
        stderr += chunk;
    });

    try {
        const homepage = await waitForFixture(baseUrl, child, () => `${stdout}\n${stderr}`.trim());
        assert.equal(homepage.statusCode, 200);
        assert.match(homepage.body, /tag-transfer\.user\.js/);
        for (const [layout, rootClass] of [
            ['m', 'gltm'], ['p', 'gltm'], ['l', 'gltc'], ['e', 'glte'], ['t', 'gld']
        ]) {
            const listing = await requestText(`${baseUrl}/?layout=${layout}`);
            assert.equal(listing.statusCode, 200);
            assert.match(listing.body, new RegExp(`class="itg ${rootClass}"`));
        }

        const userScript = await requestText(`${baseUrl}/tag-transfer.user.js`);
        assert.equal(userScript.statusCode, 200);
        const fixtureVersion = readScriptVersion(userScript.body);
        assert.equal(fixtureVersion, readScriptVersion(fs.readFileSync(scriptPath, 'utf8')));
        assert.match(userScript.body, /const SCRIPT_PARAMETERS = Object\.freeze\(/);

        const correctionTarget = await requestText(
            `${baseUrl}/g/500009/c009c009c0/`
        );
        assert.equal(correctionTarget.statusCode, 200);
        assert.match(correctionTarget.body, /Correction Branch Fixture \[English\]/);
        const derivedOnlyTarget = await requestText(
            `${baseUrl}/g/500011/c011c011c0/`
        );
        assert.equal(derivedOnlyTarget.statusCode, 200);
        assert.match(derivedOnlyTarget.body, /Derived Only Fixture \[Korean\] \[Decensored\]/);
        const randomSkipTarget = await requestText(
            `${baseUrl}/g/500012/c012c012c0/`
        );
        assert.equal(randomSkipTarget.statusCode, 200);
        assert.match(randomSkipTarget.body, /Random Skip Fixture \[English\] \[Uncensored\]/);

        const transientFailure = await requestText(`${baseUrl}/bad-tags`);
        assert.equal(transientFailure.statusCode, 503);
        const badTags = await requestText(`${baseUrl}/bad-tags`);
        assert.equal(badTags.statusCode, 200);
        assert.match(badTags.body, /female:lactation/);

        const auditResponse = await requestText(`${baseUrl}/fixture/requests`);
        assert.equal(auditResponse.statusCode, 200);
        const audit = JSON.parse(auditResponse.body);
        assert.ok(audit['/'] >= 1);
        assert.equal(audit['/tag-transfer.user.js'], 1);
        assert.equal(audit['/bad-tags'], 2);
        assert.deepEqual(audit.__searchRequests, []);
        assert.deepEqual(audit.__tagVotes, []);
        console.log('E-Hentai fixture HTTP smoke test passed');
    } finally {
        await stopChild(child);
    }
}

function runDocumentationAudit() {
    console.log('\n=== 测试文档一致性审计 ===');
    const source = fs.readFileSync(scriptPath, 'utf8');
    const documentation = fs.readFileSync(documentationPath, 'utf8');
    const functionAudit = fs.readFileSync(functionAuditPath, 'utf8');
    const version = readScriptVersion(source);
    const versionLine = `- 当前版本：` + '`' + version + '`';
    assert.ok(documentation.includes(versionLine), `开发说明版本未同步：${version}`);
    for (const file of syntaxFiles.filter(file => file.startsWith('test/'))) {
        assert.ok(documentation.includes(file), `开发说明缺少测试文件：${file}`);
    }
    assert.match(documentation, /node test\/_eh_tag_transfer_all_test\.js\s*\n/);
    assert.match(documentation, /node test\/_eh_tag_transfer_all_test\.js --fixture/);
    assert.ok(functionAudit.includes(`- 审计版本：` + '`' + version + '`'));
    const namedFunctions = [
        ...source.matchAll(/\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)
    ].map(match => match[1]);
    for (const functionName of namedFunctions) {
        assert.ok(
            functionAudit.includes('`' + functionName + '`'),
            `函数审计缺少 ${functionName}`
        );
    }
    console.log('E-Hentai test documentation audit passed');
}

async function runAutomatedTests() {
    console.log('E-Hentai Tag Transfer unified test runner');
    for (const file of syntaxFiles) {
        runNode(['--check', file], `语法检查：${file}`);
    }
    runSourceAndInterfaceAudit();
    runMatchingGoldenSamples();
    runCorrectionStateTests();
    runRandomTagSkipTests();
    runSafetyRegressionTests();
    runGalleryListingTests();
    await runRequestLifecycleTests();
    runVersionAndScheduleTests();
    runHomepageSimulation();
    runRepositoryAndLogTests();
    await runFixtureSmokeTest();
    runDocumentationAudit();
    console.log('\nE-Hentai Tag Transfer all automated tests passed');
}

function printHelp() {
    console.log(`用法：
  node test/_eh_tag_transfer_all_test.js            运行全部自动测试
  node test/_eh_tag_transfer_all_test.js --fixture  启动本地 Chrome 浏览器夹具
  node test/_eh_tag_transfer_all_test.js --help     显示本帮助`);
}

const options = new Set(process.argv.slice(2));
if (options.has('--help')) {
    printHelp();
} else if (options.has('--fixture')) {
    console.log('启动本地浏览器夹具；按 Ctrl+C 停止。');
    require(fixturePath);
} else if (options.size) {
    console.error(`未知参数：${[...options].join(' ')}`);
    printHelp();
    process.exitCode = 1;
} else {
    runAutomatedTests().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}
