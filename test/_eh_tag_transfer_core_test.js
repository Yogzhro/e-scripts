'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const core = require('../eh-tag-transfer.js');

let passed = 0;
const tests = [];

function test(name, callback) {
    tests.push({name, callback});
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
        titleRefs: [title, japaneseTitle],
        pageCount: pages,
        postedAt,
        language,
        tags,
        url
    };
}

const config = core.resolveConfig();

test('全部运行参数使用指定默认值、中文注释且不读取旧配置存储', () => {
    assert.deepEqual(core.SCRIPT_PARAMETERS, {
        mode: 'solid',
        transferDirection: 'newest',
        maxSearchPages: 1,
        searchRequestIntervalMs: 3000,
        maxPageDifference: 3,
        maxTitleDistanceRatio: 0.34,
        minCandidateScoreGap: 8,
        genericTitleLength: 15,
        minGalleryPages: 10,
        homeScanPages: 3,
        homeRequestLimit: 80,
        scheduleEnabled: true,
        scheduleMinutes: 3,
        badTagEnabled: true,
        uid: '7647802',
        blacklist: core.DEFAULT_CONFIG.blacklist
    });

    const resolved = core.resolveConfig({
        mode: 'all',
        transferDirection: 'all',
        maxSearchPages: 5,
        maxPageDifference: 20,
        genericTitleLength: 40,
        homeRequestLimit: 200,
        scheduleEnabled: false,
        scheduleMinutes: 60,
        badTagEnabled: false,
        badTagUid: '123456',
        blacklist: 'female:fixture'
    });
    assert.equal(resolved.maxSearchPages, 1);
    assert.equal(resolved.mode, 'solid');
    assert.equal(resolved.transferDirection, 'newest');
    assert.equal(resolved.searchRequestIntervalMs, 3000);
    assert.equal(resolved.maxPageDifference, 3);
    assert.equal(resolved.genericTitleLength, 15);
    assert.equal(resolved.homeRequestLimit, 80);
    assert.equal(resolved.scheduleMinutes, 3);
    assert.equal(resolved.scheduleEnabled, true);
    assert.equal(resolved.badTagEnabled, true);
    assert.equal(resolved.uid, '7647802');
    assert.equal(resolved.blacklist, core.DEFAULT_CONFIG.blacklist);
    assert.equal('badTagUid' in resolved, false);

    const source = fs.readFileSync(require.resolve('../eh-tag-transfer.js'), 'utf8');
    for (const label of [
        '标签范围：', '迁移方向：',
        '搜索翻页上限：', '搜索请求间隔（毫秒）：', '最大页数差：', '标题距离阈值：',
        '候选最低分差：', '短标题长度：', '画廊最少页数：', '主页扫描页数：',
        '每轮请求上限：', '周期运行：', '周期（分钟）：',
        '检查错误标签：', '用户 UID：', '标签黑名单：'
    ]) {
        assert.equal(source.includes(label), true, `缺少中文参数注释：${label}`);
    }
    assert.equal(source.includes('reina.ehTagTransfer.config.v0'), false);
    assert.equal(source.includes('persistentConfigFrom'), false);
});

test('面板不再包含配置控件，状态、队列和详细日志位于同一日志区域', () => {
    const source = fs.readFileSync(require.resolve('../eh-tag-transfer.js'), 'utf8');
    for (const id of [
        'ehtt-settings', 'ehtt-mode', 'ehtt-transfer-direction',
        'ehtt-schedule-enabled', 'ehtt-badtag-enabled', 'ehtt-blacklist'
    ]) {
        assert.equal(source.includes(id), false, `仍存在面板配置控件：${id}`);
    }
    assert.deepEqual(core.UI_LOG_ORDER, [
        'ehtt-log', 'ehtt-status', 'ehtt-home-summary', 'ehtt-log-entries'
    ]);
});

test('正常运行先执行 Tag 转移再检查错误标签，主页不再限制一轮一个任务', () => {
    const source = fs.readFileSync(require.resolve('../eh-tag-transfer.js'), 'utf8');
    assert.deepEqual(core.NORMAL_RUN_PHASES, ['tag-transfer', 'bad-tags']);
    assert.equal(source.includes('homeJobsPerRun'), false);
    assert.equal(source.includes('单 Worker 锁'), false);
});

test('配置值会被规范化并限制在允许范围内', () => {
    const sanitized = core.sanitizeConfig({
        mode: 'invalid',
        transferDirection: 'invalid',
        maxSearchPages: 99,
        searchRequestIntervalMs: 1,
        maxPageDifference: -1,
        maxPageDifferenceRatio: 2,
        maxTitleDistanceRatio: 2,
        minCandidateScoreGap: -1,
        genericTitleLength: 2,
        minGalleryPages: -1,
        homeScanPages: 99,
        homeJobsPerRun: 0,
        homeRequestLimit: 5,
        homeDelayMinutes: 9999,
        scheduleEnabled: true,
        scheduleMinutes: 1,
        badTagEnabled: true,
        uid: 'uid=7647802abc',
        blacklist: 123
    });
    assert.equal(sanitized.mode, 'solid');
    assert.equal(sanitized.transferDirection, 'newest');
    assert.equal(sanitized.maxSearchPages, 5);
    assert.equal(sanitized.searchRequestIntervalMs, 3000);
    assert.equal(sanitized.maxPageDifference, 0);
    assert.equal('maxPageDifferenceRatio' in sanitized, false);
    assert.equal(sanitized.maxTitleDistanceRatio, 1);
    assert.equal(sanitized.minCandidateScoreGap, 0);
    assert.equal(sanitized.genericTitleLength, 4);
    assert.equal(sanitized.minGalleryPages, 0);
    assert.equal(sanitized.homeScanPages, 10);
    assert.equal('homeJobsPerRun' in sanitized, false);
    assert.equal(sanitized.homeRequestLimit, 10);
    assert.equal('homeDelayMinutes' in sanitized, false);
    assert.equal(sanitized.scheduleEnabled, true);
    assert.equal(sanitized.scheduleMinutes, 3);
    assert.equal(sanitized.badTagEnabled, true);
    assert.equal(sanitized.uid, '7647802');
    assert.equal('badTagUid' in sanitized, false);
    assert.equal(sanitized.blacklist, core.DEFAULT_CONFIG.blacklist);
});

test('直连协议从画廊脚本读取动态凭据并同时支持 E-Hentai 与 ExHentai', () => {
    const inlineDocument = source => ({
        querySelectorAll(selector) {
            assert.equal(selector, 'script:not([src])');
            return [{textContent: source}];
        }
    });
    const source = `
        var api_url = "https://api.e-hentai.org/api.php";
        var gid = 4098055;
        var token = "1a963be98a";
        var apiuid = 123456;
        var apikey = "0123456789abcdef";
    `;
    const context = core.parseGalleryWriteContext(
        inlineDocument(source),
        'https://e-hentai.org/g/4098055/1a963be98a/'
    );
    assert.deepEqual(context, {
        apiUrl: 'https://api.e-hentai.org/api.php',
        gid: 4098055,
        token: '1a963be98a',
        apiuid: 123456,
        apikey: '0123456789abcdef'
    });
    assert.deepEqual(core.buildTagGalleryPayload(
        context,
        [' Female:Sole   Female ', 'artist:Koza'],
        -1
    ), {
        method: 'taggallery',
        apiuid: 123456,
        apikey: '0123456789abcdef',
        gid: 4098055,
        token: '1a963be98a',
        tags: 'female:sole female,artist:koza',
        vote: -1
    });

    assert.equal(core.isTrustedTagApiUrl(
        'https://s.exhentai.org/api.php',
        'https://exhentai.org/g/1/abcdef/'
    ), true);
    assert.equal(core.isTrustedTagApiUrl(
        'https://api.e-hentai.org/api.php',
        'https://exhentai.org/g/1/abcdef/'
    ), true);
    assert.equal(core.isTrustedTagApiUrl(
        'https://evil.example/api.php',
        'https://e-hentai.org/g/1/abcdef/'
    ), false);
    assert.equal(core.parseGalleryWriteContext(
        inlineDocument(source.replace('var apiuid = 123456;', 'var apiuid = -1;')),
        'https://e-hentai.org/g/4098055/1a963be98a/'
    ), null);
    assert.equal(core.isUsableGalleryDocument({
        querySelector(selector) {
            return ['#gn', '#taglist'].includes(selector) ? {} : null;
        }
    }), true);
    assert.equal(core.isUsableGalleryDocument({
        querySelector(selector) {
            return selector === '#taglist' ? {} : null;
        }
    }), false);
});

test('最终脚本只保留直连写入，写后未确认批次明确禁止本轮重投', () => {
    const source = fs.readFileSync(require.resolve('../eh-tag-transfer.js'), 'utf8');
    for (const removed of [
        "createElement('iframe')", 'loadGalleryFrame', 'installAlertGuard',
        'send_vote', 'submitBatchWithFallback'
    ]) {
        assert.equal(source.includes(removed), false, `仍存在旧写入路径：${removed}`);
    }
    assert.equal(core.WRITE_TRANSPORT, 'direct-xhr-verified');

    const unresolvedDocument = {
        querySelectorAll() {
            return [];
        }
    };
    assert.deepEqual(core.reconcileTagVoteBatch(
        unresolvedDocument,
        ['female:sole female']
    ), {
        confirmed: 0,
        failedTags: ['female:sole female'],
        shouldRetry: false
    });
});

test('标题身份会清理展会和发行标记，但只保留署名、核心标题、原作段和章节', () => {
    const convention = core.parseTitleIdentity(
        '(Reitaisai 22) [Rocket Chousashitsu (Koza)] Odoroke Odoroke Daifuntou da yo Kogasa-chan! (Touhou Project)'
    );
    assert.equal(convention.creatorTokens.has('rocket'), true);
    assert.equal(convention.creatorTokens.has('chousashitsu'), true);
    assert.equal(convention.creatorTokens.has('koza'), true);
    assert.equal(convention.parody, 'Touhou Project');
    assert.ok(convention.coreParts.includes(
        'Odoroke Odoroke Daifuntou da yo Kogasa-chan!'
    ));
    assert.equal('event' in convention, false);
    assert.equal('titleFormats' in convention, false);

    const digital = core.parseTitleIdentity(
        '[Rocket Chousashitsu (Koza)] Odoroke Odoroke Daifuntou da yo Kogasa-chan! (Touhou Project) [Digital]'
    );
    assert.equal(digital.coreParts[0], 'Odoroke Odoroke Daifuntou da yo Kogasa-chan!');
    assert.equal(digital.parody, 'Touhou Project');
    assert.equal('titleFormats' in digital, false);

    const bilingual = core.parseTitleIdentity(
        '[NENIGE] Shiborare Dungeon Toubatsu | 榨精地下城 [Chinese] [K64 & Reiko]'
    );
    assert.equal(bilingual.creatorTokens.has('nenige'), true);
    assert.deepEqual(bilingual.coreParts, [
        'Shiborare Dungeon Toubatsu',
        '榨精地下城'
    ]);
    assert.equal(core.parseTitleIdentity('鬼针草fantia').coreParts[0], '鬼针草fantia');
});

test('标题、页数、URL、语言和标签基础解析正确', () => {
    const chapterTitle = core.parseTitleIdentity('[Circle] Example Title [Chinese] Ch.1');
    assert.equal(chapterTitle.coreParts[0], 'Example Title');
    assert.equal(chapterTitle.searchParts[0], 'Example Title Ch.1');
    assert.equal(chapterTitle.chapters[0].key, 'chapter:1');
    assert.equal(core.levenshteinDistance('daydream', 'daydream'), 0);
    assert.equal(core.parsePageCount('178 pages'), 178);
    assert.equal(core.parsePageCount('no length'), null);
    assert.equal(
        core.findSearchResultPageCount(['2916 pages', '29', '16 pages']),
        16
    );
    assert.equal(
        core.findSearchResultPageCount(['5220 pages', '52', '20 pages']),
        20
    );
    assert.equal(
        core.findSearchResultPageCount(['2026-08-05 00:29', '43 times']),
        null
    );
    assert.equal(
        core.parseGalleryPostedAt('Posted: 2026-08-02 15:41'),
        Date.UTC(2026, 7, 2, 15, 41)
    );
    assert.equal(core.parseGalleryPostedAt('Posted: unknown'), null);
    assert.equal(core.normalizeTag('Female:Very   Long Hair'), 'female:very long hair');
    assert.equal(core.normalizeTag('orphan tag'), 'misc:orphan tag');
    assert.equal(
        core.canonicalGalleryUrl('/g/123/abcdef/', 'https://e-hentai.org'),
        'https://e-hentai.org/g/123/abcdef/'
    );
    assert.equal(core.canonicalGalleryUrl('/watched', 'https://e-hentai.org'), '');
    assert.equal(core.classifyLanguage(['language:english'], ''), 'english');
    assert.equal(core.classifyLanguage(['female:sole female'], ''), 'japanese');
    assert.equal(core.classifyLanguage(['language:translated'], ''), 'unknown');
});

test('章节后缀支持范围、全角、多语言、卷、分部和特殊章节，并保留在搜索标题中', () => {
    const cases = [
        ['Work Ch. 1-50 [English]', 'Work', 'Work Ch. 1-50', 'chapter:1-50'],
        ['Work Chapters 12.5a-14', 'Work', 'Work Chapters 12.5a-14', 'chapter:12.5a-14'],
        ['作品第１－５０話 [Chinese]', '作品', '作品 第1-50話', 'chapter:1-50'],
        ['作品 第37集', '作品', '作品 第37集', 'chapter:37'],
        ['作品 第12巻', '作品', '作品 第12巻', 'volume:12'],
        ['Work Volume 8', 'Work', 'Work Volume 8', 'volume:8'],
        ['Work Pt. 2', 'Work', 'Work Pt. 2', 'part:2'],
        ['작품 제12화', '작품', '작품 제12화', 'chapter:12'],
        ['Work Extra', 'Work', 'Work Extra', 'special:extra'],
        ['作品 後編', '作品', '作品 後編', 'part:後編']
    ];
    for (const [source, coreTitle, searchTitle, chapterKey] of cases) {
        const identity = core.parseTitleIdentity(source);
        assert.equal(identity.coreParts[0], coreTitle, source);
        assert.equal(identity.searchParts[0], searchTitle, source);
        assert.equal(identity.chapters[0].key, chapterKey, source);
    }

    const beforeQualifier = core.parseTitleIdentity('Work Ch. 27 [English]');
    const afterQualifier = core.parseTitleIdentity('Work [English] Ch. 27');
    const beforeContext = core.parseTitleIdentity('Work Ch. 27 (Series)');
    const afterContext = core.parseTitleIdentity('Work (Series) Ch. 27');
    for (const identity of [beforeQualifier, afterQualifier, beforeContext, afterContext]) {
        assert.equal(identity.searchParts[0], 'Work Ch. 27');
        assert.equal(identity.chapters[0].key, 'chapter:27');
    }

    const longTitleQueries = core.buildSearchQueries(gallery({
        title: `${'Very Long Work '.repeat(20)}Ch. 50`,
        pages: 30
    }));
    assert.ok(longTitleQueries[0].text.length <= 200);
    assert.match(longTitleQueries[0].text, /Ch\. 50"$/u);
});

test('章节比较仅拒绝双方明确冲突，缺失章节保持可用', () => {
    const chapter12 = core.parseTitleIdentity('Work Ch. 12');
    const japanese12 = core.parseTitleIdentity('作品 第12話');
    const chapter13 = core.parseTitleIdentity('Work Chapter 13');
    const missing = core.parseTitleIdentity('Work');
    assert.equal(core.compareChapterSets(chapter12, japanese12).relation, 'match');
    assert.equal(core.compareChapterSets(chapter12, chapter13).accepted, false);
    assert.equal(core.compareChapterSets(chapter12, missing).relation, 'unknown');
});

test('主页状态按当前站点规范化相对画廊 URL', () => {
    const home = core.sanitizeHomeState({
        queue: [{
            url: '/g/456/defabc/',
            discoveredAt: 1000
        }]
    }, 'https://exhentai.org');
    assert.equal(home.queue[0].url, 'https://exhentai.org/g/456/defabc/');

    const incremental = core.mergeHomepageResults({
        initializedAt: '2026-08-02T00:00:00.000Z'
    }, [{
        url: '/g/457/abc123/',
        title: 'ExHentai fixture',
        pageCount: 20
    }], config, 2000, 'https://exhentai.org');
    assert.equal(incremental.home.queue[0].url, 'https://exhentai.org/g/457/abc123/');
});

test('搜索计划只生成英文和日文两级标题查询，保留章节且忽略作者、社团和上传者', () => {
    const current = gallery({
        title: '[Rocket Chousashitsu (Koza)] Example Work Ch. 27 | 示例作品 [Chinese]',
        japaneseTitle: '[Rocket Chousashitsu (Koza)] サンプル作品 第27話',
        pages: 34,
        tags: [
            {tag: 'group:rocket chousashitsu', solid: true},
            {tag: 'artist:koza', solid: true},
            {tag: 'group:wrong source tag', solid: false}
        ]
    });
    current.uploader = 'unrelated uploader';
    const queries = core.buildSearchQueries(current);
    assert.deepEqual(queries.map(query => [query.stage, query.text]), [
        ['english', 'title:"Example Work Ch. 27"'],
        ['japanese', 'title:"サンプル作品 第27話"']
    ]);
    assert.equal(queries.length, 2);
    assert.equal(queries.some(query => /group:|artist:/u.test(query.text)), false);
    assert.equal(queries.some(query => query.text.includes('wrong source tag')), false);
    assert.equal(queries.some(query => query.text.includes('unrelated uploader')), false);
});

test('英文搜索只有获得合规候选时才阻止日文回退', () => {
    const current = gallery({
        title: 'A Distinctive Work Ch. 12',
        pages: 30,
        language: 'chinese',
        tags: [{tag: 'language:chinese', solid: true}],
        url: 'https://e-hentai.org/g/10/a/'
    });
    const accepted = gallery({
        title: 'A Distinctive Work Chapter 12',
        pages: 30,
        language: 'english',
        tags: [{tag: 'language:english', solid: true}],
        url: 'https://e-hentai.org/g/11/b/'
    });
    const rejected = gallery({
        title: 'A Distinctive Work Ch. 13',
        pages: 30,
        language: 'english',
        tags: [{tag: 'language:english', solid: true}],
        url: 'https://e-hentai.org/g/12/c/'
    });
    assert.equal(core.shouldRunJapaneseSearch(current, [], config), true);
    assert.equal(core.shouldRunJapaneseSearch(current, [rejected], config), true);
    assert.equal(core.shouldRunJapaneseSearch(current, [accepted], config), false);
});

test('搜索 URL 固定覆盖语言、上传者和 My Tags 过滤但不加入上传者条件', () => {
    const searchUrl = new URL(core.buildSearchUrl(
        'title:"Fixture title"',
        'https://exhentai.org'
    ));
    assert.equal(searchUrl.origin, 'https://exhentai.org');
    assert.equal(searchUrl.searchParams.get('f_search'), 'title:"Fixture title"');
    assert.equal(searchUrl.searchParams.get('f_sfl'), 'on');
    assert.equal(searchUrl.searchParams.get('f_sfu'), 'on');
    assert.equal(searchUrl.searchParams.get('f_sft'), 'on');
    assert.equal(searchUrl.searchParams.has('uploader'), false);
});

test('只有双方都具有相同显式语言标签时才提前判定同语言', () => {
    const chinese = gallery({
        title: 'Fixture',
        pages: 20,
        tags: [{tag: 'language:chinese', solid: true}]
    });
    const inferredChinese = gallery({
        title: 'Fixture [Chinese]',
        pages: 20,
        language: 'chinese'
    });
    const english = gallery({
        title: 'Fixture',
        pages: 20,
        tags: [{tag: 'language:english', solid: true}]
    });
    assert.equal(core.getExplicitLanguage(chinese.tags), 'chinese');
    assert.equal(core.hasSameExplicitLanguage(chinese, chinese), true);
    assert.equal(core.hasSameExplicitLanguage(chinese, inferredChinese), false);
    assert.equal(core.hasSameExplicitLanguage(chinese, english), false);
});

test('搜索分页只在高辨识度标题获得强候选后停止，其余情况继续', () => {
    const base = {
        page: 1,
        maxPages: 3,
        hasNext: true,
        newResultCount: 20
    };
    assert.equal(core.shouldContinueSearchPages({
        ...base,
        query: {kind: 'title', coreLength: 30},
        hasStrongCandidate: true
    }, config), false);
    assert.equal(core.shouldContinueSearchPages({
        ...base,
        query: {kind: 'title', coreLength: 8},
        hasStrongCandidate: true
    }, config), true);
    assert.equal(core.shouldContinueSearchPages({
        ...base,
        query: {kind: 'title', coreLength: 30},
        hasStrongCandidate: false
    }, config), true);
    assert.equal(core.shouldContinueSearchPages({
        ...base,
        query: {kind: 'title', coreLength: 30},
        hasStrongCandidate: false,
        newResultCount: 0
    }, config), false);
});

test('搜索节流按照最后请求时间补足独立间隔', () => {
    assert.equal(core.getSearchWaitMs(1000, 2000, 3000), 2000);
    assert.equal(core.getSearchWaitMs(1000, 4000, 3000), 0);
    assert.equal(core.getSearchWaitMs(0, 5000, 3000), 0);
});

test('可中止延时在完成和取消后都会清理 abort 监听器', async () => {
    let added = 0;
    let removed = 0;
    let currentListener = null;
    const fakeSignal = {
        aborted: false,
        addEventListener(_type, listener) {
            added++;
            currentListener = listener;
        },
        removeEventListener(_type, listener) {
            if (currentListener === listener) removed++;
        }
    };
    await core.delay(0, fakeSignal);
    assert.equal(added, 1);
    assert.equal(removed, 1);

    const controller = new AbortController();
    const pending = core.delay(1000, controller.signal);
    controller.abort();
    await assert.rejects(pending, error => error.name === 'AbortError');
});

test('候选页数只按绝对页差验证，不再应用相对页差', () => {
    const current = gallery({
        title: '[Circle] A Distinctive Work Title [Chinese]',
        pages: 100
    });
    const absoluteFailure = gallery({
        title: '[Circle] A Distinctive Work Title',
        pages: 107
    });
    assert.equal(core.assessCandidate(current, absoluteFailure, config).accepted, false);

    const widerAbsoluteConfig = core.sanitizeConfig({
        ...core.DEFAULT_CONFIG,
        maxPageDifference: 20,
        maxPageDifferenceRatio: 0.1
    });
    const ratioFailure = gallery({
        title: '[Circle] A Distinctive Work Title',
        pages: 112
    });
    assert.equal(
        core.assessCandidate(current, ratioFailure, widerAbsoluteConfig).accepted,
        true
    );
});

test('候选双方章节明确不同时拒绝，相同章节或单方缺失时继续验证', () => {
    const current = gallery({title: '[Circle] A Distinctive Work Ch. 27', pages: 30});
    const matching = gallery({title: '[Circle] A Distinctive Work Chapter 27', pages: 30});
    const conflicting = gallery({title: '[Circle] A Distinctive Work Ch. 28', pages: 30});
    const missing = gallery({title: '[Circle] A Distinctive Work', pages: 30});
    assert.equal(core.assessCandidate(current, matching, config).accepted, true);
    const conflictResult = core.assessCandidate(current, conflicting, config);
    assert.equal(conflictResult.accepted, false);
    assert.match(conflictResult.reason, /章节不同/);
    assert.equal(core.assessCandidate(current, missing, config).accepted, true);
});

test('画廊 4097790 与日文版 4097763 按真实 18/16 页差通过', () => {
    const current = gallery({
        title: '[omiyamairi(onomiya)]Uwasa no sakura ni Momiji-chan to ittekita yo | 我跟椛醬去了傳聞中的櫻花树 (Touhou Project) [Chinese] [明稿昨拖漢化組] [Digital]',
        pages: 18,
        language: 'chinese',
        tags: [{tag: 'group:omiyamairi', solid: true}],
        url: 'https://e-hentai.org/g/4097790/f70a3aef08/'
    });
    const japanese = gallery({
        title: '[omiyamairi(onomiya)]Uwasa no sakura ni Momiji-chan to ittekita yo (Touhou Project) [Digital]',
        pages: 16,
        language: 'japanese',
        tags: [{tag: 'group:omiyamairi', solid: true}],
        url: 'https://e-hentai.org/g/4097763/7693de89e1/'
    });
    const assessment = core.assessCandidate(current, japanese, config);
    assert.equal(assessment.accepted, true);
    assert.equal(assessment.pageDifference, 2);
});

test('当前画廊或候选低于最少页数时拒绝处理', () => {
    const shortCurrent = gallery({title: 'Short Work', pages: 9});
    const normal = gallery({title: 'Short Work', pages: 10});
    assert.equal(core.assessCandidate(shortCurrent, normal, config).accepted, false);
    assert.equal(core.assessCandidate(normal, shortCurrent, config).accepted, false);
    assert.match(core.assessCandidate(normal, shortCurrent, config).reason, /少于 10/);
});

test('长标题在标题和页数均匹配时通过，明显短页版本被拒绝', () => {
    const current = gallery({
        title: '[momico] Chikubi Ate Game ni Hamatta Osananajimi | 乳首当てゲームにハマった幼馴染 [Chinese] [Digital]',
        pages: 178
    });
    const matchingJapanese = gallery({
        title: '[momico] Chikubi Ate Game ni Hamatta Osananajimi [Digital]',
        pages: 177
    });
    const shortChinese = gallery({
        title: '[momico] Chikubi Ate Game ni Hamatta Osananajimi [Chinese]',
        pages: 42,
        language: 'chinese'
    });
    assert.equal(core.assessCandidate(current, matchingJapanese, config).accepted, true);
    assert.equal(core.assessCandidate(current, shortChinese, config).accepted, false);
});

test('通用短标题必须具有相同作者或社团证据', () => {
    const current = gallery({
        title: '(COMITIA154) [Hiyashite Katameru (hiyakata)] daydream',
        pages: 34
    });
    const matching = gallery({
        title: '[Hiyashite Katameru (kumasawa)] daydream [English] [Digital]',
        pages: 35,
        language: 'english'
    });
    const unrelated = gallery({
        title: '[Sushi Nigiri Mushi (Kasoku)] daydream [English] [Digital]',
        pages: 35,
        language: 'english'
    });
    assert.equal(core.assessCandidate(current, matching, config).accepted, true);
    assert.equal(core.assessCandidate(current, unrelated, config).accepted, false);
});

test('完整画廊的作者或社团标签冲突会拒绝候选', () => {
    const current = gallery({
        title: 'A Very Distinctive Work Name',
        pages: 40,
        tags: [{tag: 'group:alpha circle', solid: true}]
    });
    const wrongGroup = gallery({
        title: 'A Very Distinctive Work Name',
        pages: 40,
        tags: [{tag: 'group:beta circle', solid: true}]
    });
    const result = core.assessCandidate(current, wrongGroup, config);
    assert.equal(result.accepted, false);
    assert.match(result.reason, /社团标签冲突/);
});

test('主标题缺漏时可由日文原标题独立确认，缺少副标题时仍会拒绝', () => {
    const sharedTags = [
        {tag: 'group:rocket chousashitsu', solid: true},
        {tag: 'artist:koza', solid: true}
    ];
    const current = gallery({
        title: '[Rocket Chousashitsu (Koza)] Completely Different Localized Name [Chinese]',
        japaneseTitle: '[ロケット調査室 (コザ)] おどろけおどろけ 大奮闘だよ小傘ちゃん! (東方Project) [中国翻訳]',
        pages: 34,
        language: 'chinese',
        tags: sharedTags
    });
    const candidate = gallery({
        title: '[Rocket Chousashitsu (Koza)] Unrelated Placeholder [Digital]',
        japaneseTitle: '[ロケット調査室 (コザ)] おどろけおどろけ 大奮闘だよ小傘ちゃん! (東方Project) [DL版]',
        pages: 32,
        tags: sharedTags
    });
    const withoutJapaneseTitle = gallery({
        title: candidate.title,
        pages: 32,
        tags: sharedTags
    });

    const result = core.assessCandidate(current, candidate, config);
    assert.equal(result.accepted, true);
    assert.deepEqual(result.matchedTitleFields, ['日文标题']);
    assert.equal(
        core.assessCandidate(current, withoutJapaneseTitle, config).accepted,
        false
    );
});

test('Digital 与展会信息不再参与候选判断或评分', () => {
    const sharedTags = [
        {tag: 'group:rocket chousashitsu', solid: true},
        {tag: 'artist:koza', solid: true}
    ];
    const current = gallery({
        title: '[Rocket Chousashitsu (Koza)] Odoroke Odoroke Daifuntou da yo Kogasa-chan! (Touhou Project) [Chinese] [Digital]',
        japaneseTitle: '[ロケット調査室 (コザ)] おどろけおどろけ 大奮闘だよ小傘ちゃん! (東方Project) [中国翻訳]',
        pages: 34,
        language: 'chinese',
        tags: sharedTags
    });
    const matchingDigital = gallery({
        title: '[Rocket Chousashitsu (Koza)] Odoroke Odoroke Daifuntou da yo Kogasa-chan! (Touhou Project) [Digital]',
        japaneseTitle: '[ロケット調査室 (コザ)] おどろけおどろけ 大奮闘だよ小傘ちゃん! (東方Project) [DL版]',
        pages: 32,
        tags: sharedTags
    });
    const omittedFormat = gallery({
        title: '[Rocket Chousashitsu (Koza)] Odoroke Odoroke Daifuntou da yo Kogasa-chan! (Touhou Project)',
        japaneseTitle: '[ロケット調査室 (コザ)] おどろけおどろけ 大奮闘だよ小傘ちゃん! (東方Project)',
        pages: 32,
        tags: sharedTags
    });
    const convention = gallery({
        title: '(Reitaisai 22) [Rocket Chousashitsu (Koza)] Odoroke Odoroke Daifuntou da yo Kogasa-chan! (Touhou Project)',
        japaneseTitle: '(例大祭22) [ロケット調査室 (コザ)] おどろけおどろけ 大奮闘だよ小傘ちゃん! (東方Project)',
        pages: 32,
        tags: sharedTags
    });

    const digitalResult = core.assessCandidate(current, matchingDigital, config);
    const omittedResult = core.assessCandidate(current, omittedFormat, config);
    const conventionResult = core.assessCandidate(current, convention, config);
    assert.equal('formatRelation' in digitalResult, false);
    assert.equal('formatRelation' in omittedResult, false);
    assert.equal('formatRelation' in conventionResult, false);
    assert.equal(digitalResult.score, omittedResult.score);
    assert.equal(omittedResult.score, conventionResult.score);
    assert.equal(core.isStrongPreviewCandidate(current, {
        ...matchingDigital,
        url: 'https://e-hentai.org/g/2/b/'
    }, config), true);
    assert.equal(core.isStrongPreviewCandidate(current, {
        ...convention,
        url: 'https://e-hentai.org/g/3/c/'
    }, config), true);
});

test('同语言候选不会再因 Digital 或展会格式形成最低分差', () => {
    const current = gallery({
        title: '[Rocket Chousashitsu (Koza)] Odoroke Odoroke Daifuntou da yo Kogasa-chan! (Touhou Project) [Chinese] [Digital]',
        japaneseTitle: '[ロケット調査室 (コザ)] おどろけおどろけ 大奮闘だよ小傘ちゃん! (東方Project) [中国翻訳]',
        pages: 34,
        language: 'chinese',
        tags: [
            {tag: 'group:rocket chousashitsu', solid: true},
            {tag: 'artist:koza', solid: true}
        ]
    });
    const sharedTags = [
        {tag: 'group:rocket chousashitsu', solid: true},
        {tag: 'artist:koza', solid: true}
    ];
    const digital = gallery({
        title: '[Rocket Chousashitsu (Koza)] Odoroke Odoroke Daifuntou da yo Kogasa-chan! (Touhou Project) [Digital]',
        japaneseTitle: '[ロケット調査室 (コザ)] おどろけおどろけ 大奮闘だよ小傘ちゃん! (東方Project) [DL版]',
        pages: 32,
        tags: sharedTags,
        url: 'https://e-hentai.org/g/2/b/'
    });
    const eventEdition = gallery({
        title: '(Reitaisai 22) [Rocket Chousashitsu (Koza)] Odoroke Odoroke Daifuntou da yo Kogasa-chan! (Touhou Project)',
        japaneseTitle: '(例大祭22) [ロケット調査室 (コザ)] おどろけおどろけ 大奮闘だよ小傘ちゃん! (東方Project)',
        pages: 30,
        tags: sharedTags,
        url: 'https://e-hentai.org/g/3/c/'
    });
    const formatPreferenceConfig = core.sanitizeConfig({
        ...config,
        maxPageDifference: 6
    });
    digital.assessment = core.assessCandidate(current, digital, formatPreferenceConfig);
    eventEdition.assessment = core.assessCandidate(
        current,
        eventEdition,
        formatPreferenceConfig
    );
    assert.equal(digital.assessment.accepted, true);
    assert.equal(eventEdition.assessment.accepted, true);
    assert.ok(digital.assessment.score - eventEdition.assessment.score < 8);

    const selected = core.selectBestLanguageCandidates(
        [eventEdition, digital],
        config.minCandidateScoreGap
    );
    assert.equal(selected.accepted.length, 0);
    assert.equal(selected.rejected.length, 2);
});

test('同语言前两名分差不足时保守拒绝，未知语言也拒绝', () => {
    const first = {
        ...gallery({
            title: 'Example',
            pages: 20,
            language: 'english',
            url: 'https://e-hentai.org/g/4/d/'
        }),
        assessment: {score: 100, pageDifference: 0}
    };
    const second = {
        ...gallery({
            title: 'Example',
            pages: 20,
            language: 'english',
            url: 'https://e-hentai.org/g/5/e/'
        }),
        assessment: {score: 96, pageDifference: 0}
    };
    const unknown = {
        ...gallery({
            title: 'Example',
            pages: 20,
            language: 'unknown',
            url: 'https://e-hentai.org/g/6/f/'
        }),
        assessment: {score: 120, pageDifference: 0}
    };
    const selected = core.selectBestLanguageCandidates([first, second, unknown], 8);
    assert.equal(selected.accepted.length, 0);
    assert.equal(selected.rejected.length, 3);
});

test('仅旧到新模式保留全部已复核候选，互补模式仍按语言消歧', () => {
    const first = {
        ...gallery({
            title: 'Example',
            pages: 20,
            language: 'japanese',
            url: 'https://e-hentai.org/g/41/a/'
        }),
        assessment: {score: 100, pageDifference: 0}
    };
    const second = {
        ...gallery({
            title: 'Example Event Edition',
            pages: 20,
            language: 'japanese',
            url: 'https://e-hentai.org/g/42/b/'
        }),
        assessment: {score: 90, pageDifference: 0}
    };
    const unknown = {
        ...gallery({
            title: 'Example Unknown',
            pages: 20,
            language: 'unknown',
            url: 'https://e-hentai.org/g/43/c/'
        }),
        assessment: {score: 120, pageDifference: 0}
    };

    const directional = core.selectTransferCandidates(
        [first, second, unknown],
        'newest',
        8
    );
    assert.deepEqual(directional.accepted.map(item => item.url), [first.url, second.url]);
    assert.equal(directional.rejected.length, 1);
    assert.equal(directional.rejected[0].rejectionReason, '无法确认语言');

    const reciprocal = core.selectTransferCandidates([first, second], 'all', 8);
    assert.deepEqual(reciprocal.accepted.map(item => item.url), [first.url]);
    assert.equal(reciprocal.rejected.length, 1);
});

test('错误标签记录指纹按画廊、规范标签和记录时间区分', () => {
    const first = core.badTagRecordFingerprint({
        gid: '4067403',
        tag: 'Other:Non-H   Imageset',
        timestamp: '7/21 20:36:30'
    });
    const same = core.badTagRecordFingerprint({
        gid: '4067403',
        tag: 'other:non-h imageset',
        timestamp: '7/21 20:36:30'
    });
    const later = core.badTagRecordFingerprint({
        gid: '4067403',
        tag: 'other:non-h imageset',
        timestamp: '7/23 14:27:00'
    });
    assert.equal(first, same);
    assert.notEqual(first, later);
});

test('错误标签增量检查忽略已知记录，手动复查会重新选择全部记录', () => {
    const records = [
        {gid: '1', tag: 'female:filming', timestamp: '1/1 00:00'},
        {gid: '2', tag: 'female:lactation', timestamp: '1/1 00:01'}
    ];
    const stored = {
        knownFingerprints: [core.badTagRecordFingerprint(records[0])]
    };
    assert.deepEqual(core.selectBadTagRecords(records, stored, false), [records[1]]);
    assert.deepEqual(core.selectBadTagRecords(records, stored, true), records);

    const normalized = core.sanitizeBadTagState({
        uid: '123456',
        initializedAt: 'legacy-only-state',
        knownFingerprints: ['one', 'one', 'two']
    });
    assert.deepEqual(normalized, {
        uid: '123456',
        knownFingerprints: ['one', 'two']
    });
});

test('错误标签首次启用不跳过历史、按轮分批且缺失标签终止跳过', () => {
    const records = Array.from({length: 12}, (_, index) => ({
        gid: String(index + 1),
        tag: `female:fixture ${index + 1}`,
        timestamp: `8/2 12:${String(index).padStart(2, '0')}`
    }));
    const firstBatch = core.selectBadTagBatch(records, {
        knownFingerprints: []
    }, false, 10);
    assert.deepEqual(firstBatch.records, records.slice(0, 10));
    assert.equal(firstBatch.totalPending, 12);
    assert.equal(firstBatch.remaining, 2);

    const resumed = core.selectBadTagBatch(records, {
        knownFingerprints: records.slice(0, 10).map(core.badTagRecordFingerprint)
    }, false, 10);
    assert.deepEqual(resumed.records, records.slice(10));
    assert.equal(resumed.remaining, 0);
    assert.equal(core.getBadTagCorrectionStrategy({
        exists: false,
        upvoted: false,
        downvoted: false
    }), 'already-missing');
    assert.equal(core.getBadTagCorrectionStrategy({
        exists: true,
        upvoted: true,
        downvoted: false
    }), 'withdraw-and-downvote');
    assert.equal(core.getBadTagCorrectionStrategy({
        exists: true,
        upvoted: false,
        downvoted: true
    }), 'already-downvoted');
    assert.equal(core.isBadTagVoteLockedMessage(
        'Could not vote for tag: Your vote can no longer be withdrawn.'
    ), true);
    assert.equal(core.isBadTagVoteLockedMessage('Temporary network error'), false);
    assert.equal(core.isUnavailableGalleryStatus(404), true);
    assert.equal(core.isUnavailableGalleryStatus(410), true);
    assert.equal(core.isUnavailableGalleryStatus(503), false);
    assert.equal(core.isTerminalBadTagStatus('already-missing'), true);
    assert.equal(core.isTerminalBadTagStatus('gallery-unavailable'), true);
    assert.equal(core.isTerminalBadTagStatus('vote-api-unavailable'), false);
});

test('会话日志保留最近一千条并导出带链接的 UTF-8 文本', () => {
    const galleryUrl = 'https://e-hentai.org/g/3607360/2a3a23d6fb/';
    const entries = Array.from({length: 1002}, (_, index) => core.createLogEntry(
        index % 2 ? 'warn' : 'ok',
        `错误标签消息 ${index}`,
        galleryUrl,
        new Date(Date.UTC(2026, 7, 3, 1, 2, index % 60))
    ));
    const trimmed = core.trimLogEntries(entries);
    assert.equal(trimmed.length, 1000);
    assert.equal(trimmed[0].message, '错误标签消息 2');
    assert.match(core.formatLogEntry(trimmed[0]), /\[OK\].*3607360/);

    const exported = core.buildLogExportText(trimmed.slice(0, 2), {
        version: '0.1.8.2',
        site: 'https://e-hentai.org',
        exportedAt: new Date('2026-08-03T04:05:06.000Z')
    });
    assert.equal(exported.charCodeAt(0), 0xFEFF);
    assert.match(exported, /版本: 0\.1\.8\.2\r\n/);
    assert.match(exported, /日志条数: 2\r\n/);
    assert.match(exported, /错误标签消息 2.*https:\/\/e-hentai\.org\/g\/3607360\/2a3a23d6fb\//);
    assert.equal(
        core.buildLogExportFilename(new Date(2026, 7, 3, 4, 5, 6)),
        'eh-tag-transfer-log-20260803-040506.txt'
    );

    const unsafeEntry = core.createLogEntry(
        'warn',
        '不安全链接',
        'javascript:alert(1)',
        new Date('2026-08-03T04:05:06.000Z')
    );
    assert.equal(unsafeEntry.galleryUrl, '');
    assert.equal(core.shouldDeferLogRender('hidden', false), true);
    assert.equal(core.shouldDeferLogRender('visible', true), true);
    assert.equal(core.shouldDeferLogRender('visible', false), false);
});

test('主页首次扫描只建立基线，后续增量入队并跳过短画廊', () => {
    const homeConfig = core.sanitizeConfig({
        ...core.DEFAULT_CONFIG,
        minGalleryPages: 10
    });
    const result = (gid, pages) => ({
        url: `https://e-hentai.org/g/${gid}/abcdef/`,
        title: `Gallery ${gid}`,
        pageCount: pages
    });
    const baseline = core.mergeHomepageResults({}, [result(100, 20), result(99, 5)], homeConfig, 1000);
    assert.equal(baseline.initialized, true);
    assert.equal(baseline.baselineCount, 2);
    assert.equal(baseline.home.queue.length, 0);
    assert.deepEqual(baseline.home.seenGids, ['100', '99']);

    const incremental = core.mergeHomepageResults(
        baseline.home,
        [result(103, 8), result(102, 20), result(101, null), result(100, 20)],
        homeConfig,
        2000
    );
    assert.equal(incremental.queued, 2);
    assert.equal(incremental.skippedShort, 1);
    assert.deepEqual(incremental.home.queue.map(job => job.gid), ['101', '102']);

    const duplicate = core.mergeHomepageResults(
        incremental.home,
        [result(102, 20), result(101, 20)],
        homeConfig,
        3000
    );
    assert.equal(duplicate.queued, 0);
    assert.equal(duplicate.home.queue.length, 2);
});

test('主页队列不会在 500 条时静默淘汰未处理任务', () => {
    const homeConfig = core.sanitizeConfig(core.DEFAULT_CONFIG);
    const queue = Array.from({length: 500}, (_, index) => {
        const gid = String(index + 1);
        return {
            gid,
            url: `https://e-hentai.org/g/${gid}/abcdef/`,
            title: `Queued ${gid}`,
            pageCount: 20,
            discoveredAt: index + 1
        };
    });
    const seenGids = queue.map(job => job.gid);
    const merged = core.mergeHomepageResults(
        {
            version: 2,
            initializedAt: '2026-08-01T00:00:00.000Z',
            seenGids,
            queue
        },
        [
            {url: 'https://e-hentai.org/g/502/abcdef/', title: 'Newest', pageCount: 20},
            {url: 'https://e-hentai.org/g/501/abcdef/', title: 'Older', pageCount: 20}
        ],
        homeConfig,
        2000
    );

    assert.equal(merged.queued, 2);
    assert.equal(merged.home.queue.length, 502);
    assert.equal(merged.home.queue[0].gid, '1');
    assert.deepEqual(merged.home.queue.slice(-2).map(job => job.gid), ['501', '502']);
    assert.deepEqual(merged.home.seenGids.slice(-2), ['502', '501']);
});

test('主页状态升级会清理旧版永久无关联重试，同时保留真实失败任务', () => {
    const migrated = core.sanitizeHomeState({
        initializedAt: '2026-08-01T00:00:00.000Z',
        seenGids: ['101', '102', '103'],
        queue: [
            {
                gid: '101',
                url: 'https://e-hentai.org/g/101/abcdef/',
                attempts: 5,
                nextAttemptAt: 999999,
                lastError: '尚未找到其他语言版本'
            },
            {
                gid: '102',
                url: 'https://e-hentai.org/g/102/abcdef/',
                attempts: 2,
                nextAttemptAt: 888888,
                lastError: '仍有 2 个标签未确认'
            },
            {
                gid: '103',
                url: 'https://e-hentai.org/g/103/abcdef/',
                attempts: 1,
                nextAttemptAt: 777777,
                lastError: 'HTTP 503'
            }
        ]
    });

    assert.equal(migrated.version, 2);
    assert.deepEqual(migrated.queue.map(job => job.gid), ['102', '103']);
    assert.deepEqual(migrated.seenGids, ['101', '102', '103']);
});

test('主页无关联结果终止任务，部分写入和网络失败才保留重试', () => {
    assert.deepEqual(core.getHomeJobDisposition({status: 'no-related', failed: 0}), {
        action: 'complete',
        reason: '尚未找到其他语言版本'
    });
    assert.deepEqual(core.getHomeJobDisposition({status: 'completed', failed: 0}), {
        action: 'complete',
        reason: ''
    });
    assert.deepEqual(core.getHomeJobDisposition({status: 'partial', failed: 3}), {
        action: 'retry',
        reason: '仍有 3 个标签未确认'
    });
});

test('主页按顺序查找单个就绪任务、失败任务指数退避并按关联画廊组去重完成', () => {
    const initial = core.sanitizeHomeState({
        initializedAt: '2026-01-01T00:00:00.000Z',
        seenGids: ['101', '102'],
        processedGroups: ['legacy-only-state'],
        queue: [
            {gid: '101', url: 'https://e-hentai.org/g/101/abcdef/', discoveredAt: 1000},
            {gid: '102', url: 'https://e-hentai.org/g/102/abcdef/', discoveredAt: 1000}
        ]
    });
    assert.equal(core.findReadyHomeJob(initial, 1000).gid, '101');
    assert.equal('processedGroups' in initial, false);

    let running = core.beginHomeJob(initial, '101');
    assert.equal(running, initial);
    assert.equal(running.queue[0].attempts, 1);
    running = core.retryHomeJob(running, '101', new Error('temporary'), 2000);
    assert.equal(running, initial);
    assert.equal(running.queue[0].nextAttemptAt, 2000 + 30 * 60000);
    assert.equal(running.queue[0].lastError, 'temporary');
    assert.equal(core.findReadyHomeJob(running, 2000).gid, '102');

    const completed = core.completeHomeGroup(running, [
        'https://e-hentai.org/g/101/abcdef/',
        'https://e-hentai.org/g/102/abcdef/'
    ]);
    assert.equal(completed, initial);
    assert.equal(completed.queue.length, 0);
    assert.equal('processedGroups' in completed, false);
});

test('周期截止状态区分未安排、等待和冻结后已到期', () => {
    assert.equal(core.getScheduleState(0, 1000), 'none');
    assert.equal(core.getScheduleState(2000, 1000), 'waiting');
    assert.equal(core.getScheduleState(1000, 1000), 'due');
    assert.equal(core.getScheduleState(1000, 5000), 'due');
});

test('后台 resume 会恢复调度，隐藏 visibilitychange 不会误恢复', () => {
    assert.equal(core.shouldHandleLifecycleResume('resume', 'hidden'), true);
    assert.equal(core.shouldHandleLifecycleResume('pageshow', 'hidden'), true);
    assert.equal(core.shouldHandleLifecycleResume('visibilitychange', 'hidden'), false);
    assert.equal(core.shouldHandleLifecycleResume('visibilitychange', 'visible'), true);
});

test('运行标记区分其他标签页活跃、已完成和冻结中断', () => {
    const marker = {owner: 'tab-a'};
    assert.equal(core.getInterruptedRunState(
        marker,
        'tab-a',
        {owner: 'tab-a', expiresAt: 2000},
        1000
    ), 'active');
    assert.equal(core.getInterruptedRunState(marker, 'tab-a', null, 1000), 'interrupted');
    assert.equal(core.getInterruptedRunState(null, 'tab-a', null, 1000), 'completed');
});

test('读取重试只覆盖网络、超时和临时 HTTP 错误', () => {
    assert.equal(core.isRetryableFetchError(new TypeError('Failed to fetch')), true);
    assert.equal(core.isRetryableFetchError(Object.assign(new Error('timeout'), {
        name: 'TimeoutError'
    })), true);
    assert.equal(core.isRetryableFetchError(Object.assign(new Error('HTTP 429'), {
        status: 429
    })), true);
    assert.equal(core.isRetryableFetchError(Object.assign(new Error('HTTP 503'), {
        status: 503
    })), true);
    assert.equal(core.isRetryableFetchError(Object.assign(new Error('HTTP 404'), {
        status: 404
    })), false);
    assert.equal(core.isRetryableFetchError(Object.assign(new Error('aborted'), {
        name: 'AbortError'
    })), false);
});

test('跨标签页运行租约区分持有者，请求预算支持错误标签保留额度', () => {
    assert.equal(core.isForeignWorkerLock({owner: 'other', expiresAt: 200}, 'mine', 100), true);
    assert.equal(core.isForeignWorkerLock({owner: 'mine', expiresAt: 200}, 'mine', 100), false);
    assert.equal(core.isForeignWorkerLock({owner: 'other', expiresAt: 99}, 'mine', 100), false);

    const budget = core.createRequestBudget(2);
    core.setRequestBudgetReserve(budget, 1);
    core.consumeRequestBudget(budget, 'one');
    assert.equal(core.getRequestBudgetRemaining(budget), 0);
    assert.throws(
        () => core.consumeRequestBudget(budget, 'reserved'),
        error => error.name === 'RequestBudgetError' && /上限 2/.test(error.message)
    );
    core.setRequestBudgetReserve(budget, 0);
    core.consumeRequestBudget(budget, 'two');
    assert.equal(budget.used, 2);
    assert.equal(core.getRequestBudgetRemaining(budget, true), 0);
});

test('请求预算耗尽时主页任务保持立即可运行且不累计失败次数', () => {
    const initial = core.sanitizeHomeState({
        initializedAt: '2026-01-01T00:00:00.000Z',
        queue: [{gid: '201', url: 'https://e-hentai.org/g/201/abcdef/'}]
    });
    const running = core.beginHomeJob(initial, '201');
    assert.equal(running, initial);
    assert.equal(running.queue[0].attempts, 1);
    const preserved = core.preserveHomeJobAfterBudget(running, '201');
    assert.equal(preserved, initial);
    assert.equal(preserved.queue[0].attempts, 0);
    assert.equal(preserved.queue[0].nextAttemptAt, 0);
    assert.equal(preserved.queue[0].lastError, '');
    assert.equal(core.findReadyHomeJob(preserved, Date.now()).gid, '201');
});

test('黑名单支持命名空间、裸标签名、通配符和注释', () => {
    const blacklist = core.compileBlacklist(
        '# comment\nlanguage:*\nblowjob\nother:mosaic*'
    );
    assert.equal(core.isBlacklisted('language:chinese', blacklist), true);
    assert.equal(core.isBlacklisted('female:blowjob', blacklist), true);
    assert.equal(core.isBlacklisted('other:mosaic censorship', blacklist), true);
    assert.equal(core.isBlacklisted('female:sole female', blacklist), false);
});

test('标签并集遵守实线模式、全量模式、去重和黑名单', () => {
    const galleries = [
        {
            url: 'https://e-hentai.org/g/1/a/',
            tags: [
                {tag: 'female:sole female', solid: true, voted: true},
                {tag: 'female:blowjob', solid: false, voted: false}
            ]
        },
        {
            url: 'https://e-hentai.org/g/2/b/',
            tags: [
                {tag: 'female:sole female', solid: true, voted: false},
                {tag: 'male:sole male', solid: true, voted: false},
                {tag: 'language:english', solid: true, voted: false}
            ]
        }
    ];
    const solidUnion = core.buildTransferTagUnion(
        galleries,
        'solid',
        core.compileBlacklist('language:*\nblowjob')
    );
    assert.deepEqual(
        solidUnion,
        ['female:sole female', 'male:sole male']
    );

    const allUnion = core.buildTransferTagUnion(
        galleries,
        'all',
        core.compileBlacklist('language:*')
    );
    assert.deepEqual(
        allUnion,
        ['female:blowjob', 'female:sole female', 'male:sole male']
    );
});

test('仅旧画廊到最新画廊模式按 Posted 选择唯一目标', () => {
    const oldest = gallery({
        title: 'Fixture',
        pages: 20,
        postedAt: core.parseGalleryPostedAt('2025-01-01 00:00'),
        tags: [{tag: 'female:source one', solid: true}],
        url: 'https://e-hentai.org/g/900/aaa/'
    });
    const newest = gallery({
        title: 'Fixture [Chinese]',
        pages: 20,
        postedAt: core.parseGalleryPostedAt('2026-08-02 15:41'),
        tags: [{tag: 'female:target only', solid: true}],
        url: 'https://e-hentai.org/g/100/bbb/'
    });
    const middle = gallery({
        title: 'Fixture [English]',
        pages: 20,
        postedAt: core.parseGalleryPostedAt('2026-01-01 00:00'),
        tags: [{tag: 'female:source two', solid: true}],
        url: 'https://e-hentai.org/g/1000/ccc/'
    });
    const directional = core.buildTransferPlan([oldest, newest, middle], 'newest');
    assert.equal(directional.newest, newest);
    assert.deepEqual(directional.targets, [newest]);
    assert.deepEqual(directional.sources, [oldest, middle]);
    assert.deepEqual(
        core.buildTransferTagUnion(directional.sources, 'solid', []),
        ['female:source one', 'female:source two']
    );

    const reciprocal = core.buildTransferPlan([oldest, newest, middle], 'all');
    assert.deepEqual(reciprocal.sources, [oldest, newest, middle]);
    assert.deepEqual(reciprocal.targets, [oldest, newest, middle]);
});

test('发布时间缺失时以较大 GID 选择最新画廊', () => {
    const lower = gallery({
        title: 'Fixture',
        pages: 20,
        url: 'https://e-hentai.org/g/100/a/'
    });
    const higher = gallery({
        title: 'Fixture [English]',
        pages: 20,
        url: 'https://e-hentai.org/g/200/b/'
    });
    assert.equal(core.selectNewestGallery([lower, higher]), higher);
});

test('目标规划跳过实线标签和当前账号已经投票的标签', () => {
    const union = [
        'female:blowjob',
        'female:sole female',
        'male:sole male'
    ];
    const plan = core.planTargetTags(union, [
        {tag: 'female:sole female', solid: true, voted: false},
        {tag: 'female:blowjob', solid: false, voted: true}
    ]);
    assert.deepEqual(plan.pending, ['male:sole male']);
    assert.equal(plan.skippedSolid, 1);
    assert.equal(plan.skippedVoted, 1);
});

test('提交批次不超过输入框长度并跳过单个超长标签', () => {
    const batches = core.buildTagBatches([
        'female:very long hair',
        'female:schoolgirl uniform',
        'group:night white lily',
        'artist:nishina kakeri',
        'mixed:incest',
        'male:sole male',
        `misc:${'x'.repeat(60)}`
    ], 55);
    assert.ok(batches.length > 1);
    for (const batch of batches) {
        assert.ok(batch.join(',').length <= 55);
    }
    assert.equal(batches.flat().some(tag => tag.includes('x'.repeat(60))), false);
});

async function run() {
    for (const {name, callback} of tests) {
        try {
            await callback();
            passed++;
            console.log(`✓ ${name}`);
        } catch (error) {
            error.message = `${name}: ${error.message}`;
            throw error;
        }
    }
    console.log(`\nE-Hentai tag transfer core tests passed: ${passed}`);
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
