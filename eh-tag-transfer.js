// ==UserScript==
// @name         E-Hentai 跨语言画廊 Tag 迁移
// @namespace    eh-tag-transfer
// @version      0.1.8.5
// @description  在详情页或 E-Hentai/ExHentai 主页增量发现同作品画廊，迁移标签并纠正错误投票
// @author       wakuwaku
// @match        https://e-hentai.org/
// @match        https://e-hentai.org/g/*/*
// @match        https://exhentai.org/
// @match        https://exhentai.org/g/*/*
// @icon         https://e-hentai.org/favicon.ico
// @grant        GM_xmlhttpRequest
// @connect      repo.e-hentai.org
// @noframes
// @run-at       document-end
// ==/UserScript==

const DEFAULT_BLACKLIST = [
    'language:*',
    'reclass:*',
    'extraneous ads',
    'full censorship',
    'mosaic censorship',
    'scanmark',
    'watermarked',
    'big ass',
    'x-ray',
    'rough translation',
    'original',
    'kissing',
    'handjob',
    'big breasts',
    'blowjob',
    'paizuri',
    'nakadashi'
].join('\n');

// 直接修改这里的参数；面板和 localStorage 不会覆盖这些值。
const SCRIPT_PARAMETERS = Object.freeze({
    mode: 'solid', // 标签范围：solid 仅迁移实线标签，all 迁移全部标签。
    transferDirection: 'newest', // 迁移方向：newest 仅旧画廊到最新画廊，all 各版本互相补全。
    maxSearchPages: 1, // 搜索翻页上限：每个标题查询最多读取的结果页数。
    searchRequestIntervalMs: 3000, // 搜索请求间隔（毫秒）：不得低于站点限制的 3000 毫秒。
    maxPageDifference: 3, // 最大页数差：候选与当前画廊允许相差的页数。
    maxTitleDistanceRatio: 0.34, // 标题距离阈值：标题规范化后的最大差异比例。
    minCandidateScoreGap: 8, // 候选最低分差：前两名低于此差值时保持歧义。
    genericTitleLength: 15, // 短标题长度：不高于此长度时要求额外作者或社团证据。
    minGalleryPages: 10, // 画廊最少页数：低于此页数时跳过迁移。
    homeScanPages: 3, // 主页扫描页数：每轮最多扫描的主页列表页数。
    homeRequestLimit: 80, // 每轮请求上限：达到上限后安全停止并保留任务。
    scheduleEnabled: true, // 周期运行：true 默认自动周期运行，false 只在页面加载时运行一次。
    scheduleMinutes: 3, // 周期（分钟）：每轮完成后等待的基础时间。
    badTagEnabled: true, // 检查错误标签：true 每轮检查，false 仅在手动复查时检查。
    uid: '7647802', // 用户 UID：用于读取 Repository 的错误标签记录。
    blacklist: DEFAULT_BLACKLIST // 标签黑名单：每行或逗号分隔，支持 * 通配符和 # 注释。
});

!(function () {
    "use strict";
    const SCRIPT_VERSION = "0.1.8.5",
        LOG_PREFIX = "[跨语言 Tag 迁移]",
        UI_STATE_STORAGE_KEY = "reina.ehTagTransfer.ui.v1",
        BAD_TAG_STATE_STORAGE_KEY = "reina.ehTagTransfer.badTags.v3",
        HOME_STATE_STORAGE_KEY = "reina.ehTagTransfer.home.v1",
        NO_RELATED_GALLERIES_REASON = "尚未找到其他语言版本",
        WORKER_LOCK_STORAGE_KEY = "reina.ehTagTransfer.workerLock.v1",
        RUN_MARKER_STORAGE_KEY = "reina.ehTagTransfer.runMarker.v1",
        STYLE_ELEMENT_ID = "ehtt-style",
        NORMAL_RUN_PHASES = Object.freeze(["tag-transfer", "bad-tags"]),
        UI_LOG_ORDER = Object.freeze([
            "ehtt-log",
            "ehtt-status",
            "ehtt-home-summary",
            "ehtt-log-entries",
        ]),
        BAD_TAG_OUTCOME_META = Object.freeze({
            "withdrawn-and-downvoted": {
                level: "ok",
                message: "已撤销赞成票并踩",
                terminal: !0,
            },
            downvoted: {
                level: "ok",
                message: "已踩",
                terminal: !0,
            },
            "already-downvoted": {
                level: "skip",
                message: "此前已经踩过",
                terminal: !0,
            },
            "already-missing": {
                level: "skip",
                message: "标签已不存在，已跳过",
                terminal: !0,
            },
            "gallery-unavailable": {
                level: "skip",
                message: "画廊已失效，已跳过",
                terminal: !0,
            },
            "vote-api-unavailable": {
                level: "warn",
                message: "页面投票接口暂不可用，将在后续周期重试",
                terminal: !1,
            },
        }),
        INSTANCE_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
        DEFAULT_ORIGIN = "https://e-hentai.org",
        LANGUAGE_TAG_NAMES = [
            "albanian",
            "arabic",
            "bengali",
            "catalan",
            "cebuano",
            "chinese",
            "czech",
            "danish",
            "dutch",
            "english",
            "esperanto",
            "estonian",
            "filipino",
            "finnish",
            "french",
            "german",
            "greek",
            "hebrew",
            "hindi",
            "hungarian",
            "indonesian",
            "italian",
            "japanese",
            "korean",
            "latin",
            "mongolian",
            "norwegian",
            "persian",
            "polish",
            "portuguese",
            "romanian",
            "russian",
            "slovak",
            "slovenian",
            "spanish",
            "swedish",
            "tagalog",
            "thai",
            "turkish",
            "ukrainian",
            "vietnamese",
            "speechless",
            "text cleaned",
            "rewrite",
        ],
        DEFAULT_CONFIG = SCRIPT_PARAMETERS,
        RUNTIME_LIMITS = Object.freeze({
            autoStartDelayMs: 900,
            fetchTimeoutMs: 3e4,
            fetchMaxAttempts: 3,
            fetchRetryBaseMs: 1e3,
            fetchRetryMaxMs: 5e3,
            directVoteVerifyDelayMs: 350,
            actionDelayMinMs: 900,
            actionDelayMaxMs: 1600,
            discoveryDelayMinMs: 250,
            discoveryDelayMaxMs: 500,
            detailCandidatesPerLanguage: 3,
            badTagRecordsPerRun: 10,
            schedulerJitterRatio: 0.1,
            lifecycleHeartbeatMs: 3e4,
            workerLockMs: 12e4,
            homeSeenLimit: 5e3,
        }),
        runtimeState = {
            runId: 0,
            running: !1,
            controller: null,
            autoTimer: null,
            scheduleTimer: null,
            schedulerPaused: !1,
            pageMode: "gallery",
            requestBudget: null,
            workerLockOwner: "",
            nextRunAt: 0,
            lifecycleTimer: null,
            lifecycleSuspended: !1,
            resumeRunAfterLifecycle: !1,
            waitingForRunOwner: "",
            lastSearchRequestAt: 0,
            logEntries: [],
            logDomDirty: !1,
            ui: null,
        },
        titleIdentityCache = new WeakMap(),
        creatorTagSetsCache = new WeakMap();
    function clampNumber(value, fallback, minimum, maximum) {
        const numericValue = Number(value);
        return Number.isFinite(numericValue)
            ? Math.min(maximum, Math.max(minimum, numericValue))
            : fallback;
    }
    function clampInteger(value, fallback, minimum, maximum) {
        return Math.round(clampNumber(value, fallback, minimum, maximum));
    }
    function sanitizeConfig(inputConfig = {}) {
        const sanitizedUid = String(inputConfig.uid ?? "")
            .replace(/\D/g, "")
            .slice(0, 12);
        return {
            mode: "all" === inputConfig.mode ? "all" : DEFAULT_CONFIG.mode,
            transferDirection:
                "all" === inputConfig.transferDirection ? "all" : DEFAULT_CONFIG.transferDirection,
            maxSearchPages: clampInteger(
                inputConfig.maxSearchPages,
                DEFAULT_CONFIG.maxSearchPages,
                1,
                5,
            ),
            searchRequestIntervalMs: clampInteger(
                inputConfig.searchRequestIntervalMs,
                DEFAULT_CONFIG.searchRequestIntervalMs,
                3e3,
                6e4,
            ),
            maxPageDifference: clampInteger(
                inputConfig.maxPageDifference,
                DEFAULT_CONFIG.maxPageDifference,
                0,
                20,
            ),
            maxTitleDistanceRatio: clampNumber(
                inputConfig.maxTitleDistanceRatio,
                DEFAULT_CONFIG.maxTitleDistanceRatio,
                0,
                1,
            ),
            minCandidateScoreGap: clampNumber(
                inputConfig.minCandidateScoreGap,
                DEFAULT_CONFIG.minCandidateScoreGap,
                0,
                50,
            ),
            genericTitleLength: clampInteger(
                inputConfig.genericTitleLength,
                DEFAULT_CONFIG.genericTitleLength,
                4,
                40,
            ),
            minGalleryPages: clampInteger(
                inputConfig.minGalleryPages,
                DEFAULT_CONFIG.minGalleryPages,
                0,
                1e3,
            ),
            homeScanPages: clampInteger(
                inputConfig.homeScanPages,
                DEFAULT_CONFIG.homeScanPages,
                1,
                10,
            ),
            homeRequestLimit: clampInteger(
                inputConfig.homeRequestLimit,
                DEFAULT_CONFIG.homeRequestLimit,
                10,
                200,
            ),
            scheduleEnabled:
                null == inputConfig.scheduleEnabled
                    ? DEFAULT_CONFIG.scheduleEnabled
                    : !0 === inputConfig.scheduleEnabled,
            scheduleMinutes: clampInteger(
                inputConfig.scheduleMinutes,
                DEFAULT_CONFIG.scheduleMinutes,
                3,
                1440,
            ),
            badTagEnabled:
                null == inputConfig.badTagEnabled
                    ? DEFAULT_CONFIG.badTagEnabled
                    : !0 === inputConfig.badTagEnabled,
            uid: sanitizedUid,
            blacklist:
                "string" == typeof inputConfig.blacklist
                    ? inputConfig.blacklist
                    : DEFAULT_CONFIG.blacklist,
        };
    }
    function resolveConfig() {
        return sanitizeConfig(SCRIPT_PARAMETERS);
    }
    function galleryIdFromUrl(url) {
        return String(url || "").match(/\/g\/(\d+)\//)?.[1] || "";
    }
    function getCurrentOrigin(fallbackOrigin = DEFAULT_ORIGIN) {
        return "undefined" == typeof location ? fallbackOrigin : location.origin;
    }
    function sanitizeHomeState(inputState = {}, origin = getCurrentOrigin()) {
        const sourceVersion = Math.max(1, Math.round(Number(inputState.version) || 1)),
            seenGids = Array.from(
                new Set(
                    (Array.isArray(inputState.seenGids) ? inputState.seenGids : [])
                        .map((value) => String(value || "").replace(/\D/g, ""))
                        .filter(Boolean),
                ),
            ).slice(-RUNTIME_LIMITS.homeSeenLimit),
            queue = [],
            queuedGids = new Set();
        for (const job of Array.isArray(inputState.queue) ? inputState.queue : []) {
            const url = canonicalGalleryUrl(job?.url, origin),
                gid = galleryIdFromUrl(url);
            if (!gid || queuedGids.has(gid)) continue;
            const lastError = normalizeWhitespace(job.lastError).slice(0, 240);
            (sourceVersion < 2 && lastError === NO_RELATED_GALLERIES_REASON) ||
                (queuedGids.add(gid),
                queue.push({
                    gid: gid,
                    url: url,
                    title: normalizeWhitespace(job.title),
                    pageCount: Number.isInteger(job.pageCount) ? job.pageCount : null,
                    discoveredAt: Math.max(0, Number(job.discoveredAt) || 0),
                    attempts: Math.max(0, Math.round(Number(job.attempts) || 0)),
                    nextAttemptAt: Math.max(0, Number(job.nextAttemptAt) || 0),
                    lastError: lastError,
                }));
        }
        return {
            version: 2,
            initializedAt: String(inputState.initializedAt || ""),
            seenGids: seenGids,
            queue: queue,
            scanCursor: String(inputState.scanCursor || ""),
            nextRunAt: Math.max(0, Number(inputState.nextRunAt) || 0),
        };
    }
    function loadHomeState() {
        try {
            const storedState =
                    JSON.parse(localStorage.getItem(HOME_STATE_STORAGE_KEY) || "null") || {},
                sanitizedState = sanitizeHomeState(storedState);
            if ((Number(storedState.version) || 1) < 2)
                try {
                    localStorage.setItem(HOME_STATE_STORAGE_KEY, JSON.stringify(sanitizedState));
                } catch (error) {
                    console.warn(`${LOG_PREFIX} 无法保存升级后的主页队列`, error);
                }
            return sanitizedState;
        } catch (error) {
            return console.warn(`${LOG_PREFIX} 无法读取主页队列`, error), sanitizeHomeState();
        }
    }
    function saveHomeState(homeState) {
        const sanitizedState =
            2 === homeState?.version &&
            Array.isArray(homeState.seenGids) &&
            Array.isArray(homeState.queue)
                ? homeState
                : sanitizeHomeState(homeState);
        try {
            localStorage.setItem(HOME_STATE_STORAGE_KEY, JSON.stringify(sanitizedState));
        } catch (error) {
            console.warn(`${LOG_PREFIX} 无法保存主页队列`, error);
        }
        return updateHomeSummary(sanitizedState), sanitizedState;
    }
    function mergeHomepageResults(
        homeState,
        results,
        config,
        now = Date.now(),
        origin = getCurrentOrigin(),
    ) {
        const normalizedHome =
                2 === homeState?.version &&
                Array.isArray(homeState.seenGids) &&
                Array.isArray(homeState.queue)
                    ? homeState
                    : sanitizeHomeState(homeState, origin),
            isInitialBaseline = !normalizedHome.initializedAt,
            seenGids = new Set(normalizedHome.seenGids),
            queuedGids = new Set(normalizedHome.queue.map((job) => job.gid)),
            queuedJobs = [];
        let skippedShort = 0;
        for (const result of results) {
            const url = canonicalGalleryUrl(result?.url, origin),
                gid = galleryIdFromUrl(url);
            gid &&
                !seenGids.has(gid) &&
                (seenGids.add(gid),
                isInitialBaseline ||
                    (Number.isInteger(result.pageCount) && result.pageCount < config.minGalleryPages
                        ? skippedShort++
                        : queuedGids.has(gid) ||
                          (queuedGids.add(gid),
                          queuedJobs.push({
                              gid: gid,
                              url: url,
                              title: normalizeWhitespace(result.title),
                              pageCount: Number.isInteger(result.pageCount)
                                  ? result.pageCount
                                  : null,
                              discoveredAt: now,
                              attempts: 0,
                              nextAttemptAt: 0,
                              lastError: "",
                          }))));
        }
        return (
            (normalizedHome.seenGids = Array.from(seenGids).slice(-RUNTIME_LIMITS.homeSeenLimit)),
            isInitialBaseline && (normalizedHome.initializedAt = new Date(now).toISOString()),
            normalizedHome.queue.push(...queuedJobs.reverse()),
            {
                home: normalizedHome,
                initialized: isInitialBaseline,
                baselineCount: isInitialBaseline ? results.length : 0,
                queued: queuedJobs.length,
                skippedShort: skippedShort,
            }
        );
    }
    function findReadyHomeJob(homeState, now = Date.now()) {
        return homeState.queue.find((job) => job.nextAttemptAt <= now) || null;
    }
    function beginHomeJob(homeState, gid) {
        const job = homeState.queue.find((job) => job.gid === String(gid));
        return job && (job.attempts++, (job.lastError = "")), homeState;
    }
    function retryHomeJob(homeState, gid, error, now = Date.now()) {
        const job = homeState.queue.find((job) => job.gid === String(gid));
        if (!job) return homeState;
        const retryMinutes = Math.min(1440, 30 * 2 ** Math.max(0, job.attempts - 1));
        return (
            (job.nextAttemptAt = now + 60 * retryMinutes * 1e3),
            (job.lastError = normalizeWhitespace(error?.message || error).slice(0, 240)),
            homeState
        );
    }
    function preserveHomeJobAfterBudget(homeState, gid) {
        const job = homeState.queue.find((job) => job.gid === String(gid));
        return (
            job &&
                ((job.attempts = Math.max(0, job.attempts - 1)),
                (job.nextAttemptAt = 0),
                (job.lastError = "")),
            homeState
        );
    }
    function completeHomeGroup(homeState, galleries) {
        const gids = Array.from(
            new Set(
                galleries
                    .map((gallery) => galleryIdFromUrl(gallery?.url || gallery))
                    .filter(Boolean),
            ),
        ).sort((leftGid, rightGid) => Number(leftGid) - Number(rightGid));
        if (!gids.length) return homeState;
        const gidSet = new Set(gids);
        return (homeState.queue = homeState.queue.filter((job) => !gidSet.has(job.gid))), homeState;
    }
    function getHomeJobDisposition(result = {}) {
        return "partial" === result.status
            ? {
                  action: "retry",
                  reason: `仍有 ${Math.max(0, Number(result.failed) || 0)} 个标签未确认`,
              }
            : {
                  action: "complete",
                  reason: "no-related" === result.status ? NO_RELATED_GALLERIES_REASON : "",
              };
    }
    function selectBadTagRecords(records, state, reviewKnown = !1) {
        if (reviewKnown) return records.slice();
        const knownFingerprints = new Set(state?.knownFingerprints || []);
        return records.filter((record) => !knownFingerprints.has(badTagRecordFingerprint(record)));
    }
    function selectBadTagBatch(
        records,
        state,
        reviewKnown = !1,
        limit = RUNTIME_LIMITS.badTagRecordsPerRun,
    ) {
        const pendingRecords = selectBadTagRecords(records, state, reviewKnown),
            batchLimit = Math.max(
                1,
                Math.floor(Number(limit) || RUNTIME_LIMITS.badTagRecordsPerRun),
            );
        return {
            records: pendingRecords.slice(0, batchLimit),
            totalPending: pendingRecords.length,
            remaining: Math.max(0, pendingRecords.length - batchLimit),
        };
    }
    function isForeignWorkerLock(lock, owner = INSTANCE_ID, now = Date.now()) {
        return Boolean(lock?.owner && lock.owner !== owner && Number(lock.expiresAt) > now);
    }
    function getInterruptedRunState(marker, owner, lock, now = Date.now()) {
        return owner && marker?.owner === owner
            ? Number(lock?.expiresAt) > now
                ? "active"
                : "interrupted"
            : "completed";
    }
    function loadRunMarker() {
        try {
            const marker = JSON.parse(localStorage.getItem(RUN_MARKER_STORAGE_KEY) || "null");
            return marker?.owner ? marker : null;
        } catch (error) {
            return console.warn(`${LOG_PREFIX} 无法读取运行标记`, error), null;
        }
    }
    function clearRunMarker(owner) {
        try {
            loadRunMarker()?.owner === owner && localStorage.removeItem(RUN_MARKER_STORAGE_KEY);
        } catch (error) {
            console.warn(`${LOG_PREFIX} 无法清理运行标记`, error);
        }
    }
    function createRequestBudget(limit) {
        return {
            limit: Math.max(1, Math.round(Number(limit) || 1)),
            used: 0,
            reserved: 0,
        };
    }
    function setRequestBudgetReserve(budget, reserved = 0) {
        budget &&
            (budget.reserved = Math.min(
                budget.limit,
                Math.max(0, Math.round(Number(reserved) || 0)),
            ));
    }
    function getRequestBudgetRemaining(budget, includeReserve = !1) {
        if (!budget) return 1 / 0;
        const usableLimit = includeReserve
            ? budget.limit
            : Math.max(0, budget.limit - budget.reserved);
        return Math.max(0, usableLimit - budget.used);
    }
    function consumeRequestBudget(budget, label = "网络请求") {
        if (budget) {
            if (getRequestBudgetRemaining(budget) <= 0) {
                const error = new Error(`本轮请求上限 ${budget.limit} 已用尽（${label}）`);
                throw ((error.name = "RequestBudgetError"), error);
            }
            budget.used++;
        }
    }
    function loadWorkerLock() {
        return JSON.parse(localStorage.getItem(WORKER_LOCK_STORAGE_KEY) || "null");
    }
    function saveWorkerLock(owner, now = Date.now()) {
        localStorage.setItem(
            WORKER_LOCK_STORAGE_KEY,
            JSON.stringify({
                owner: owner,
                expiresAt: now + RUNTIME_LIMITS.workerLockMs,
            }),
        );
    }
    function renewWorkerLock() {
        const owner = runtimeState.workerLockOwner;
        if (!owner) return !1;
        function failRenewal() {
            return runtimeState.controller?.abort(), (runtimeState.workerLockOwner = ""), !1;
        }
        try {
            const now = Date.now();
            return isForeignWorkerLock(loadWorkerLock(), owner, now)
                ? failRenewal()
                : (saveWorkerLock(owner, now), loadWorkerLock()?.owner === owner || failRenewal());
        } catch (error) {
            return (
                console.warn(`${LOG_PREFIX} 无法刷新跨标签页运行租约`, error),
                runtimeState.controller?.abort(),
                !1
            );
        }
    }
    function releaseWorkerLock(owner = runtimeState.workerLockOwner) {
        try {
            const lock = loadWorkerLock();
            lock?.owner === owner && localStorage.removeItem(WORKER_LOCK_STORAGE_KEY);
        } catch (error) {
            console.warn(`${LOG_PREFIX} 无法释放跨标签页运行租约`, error);
        } finally {
            runtimeState.workerLockOwner === owner && (runtimeState.workerLockOwner = "");
        }
    }
    function consumeTrackedRequest(label) {
        if ((consumeRequestBudget(runtimeState.requestBudget, label), !renewWorkerLock()))
            throw createAbortError();
    }
    function normalizeWhitespace(value) {
        return String(value || "")
            .replace(/\s+/g, " ")
            .trim();
    }
    function normalizeComparableText(value) {
        return normalizeWhitespace(
            String(value || "")
                .normalize("NFKC")
                .toLowerCase()
                .replace(/[\p{P}\p{S}_]+/gu, " "),
        );
    }
    function normalizeChapterNumber(value) {
        const normalized = String(value || "")
                .normalize("NFKC")
                .toLowerCase(),
            match = normalized.match(/^(\d{1,4})(?:\.(\d{1,2}))?([a-z])?$/u);
        if (!match) return normalizeComparableText(normalized);
        const integerPart = String(Number(match[1])),
            fractionPart = match[2]?.replace(/0+$/u, "") || "";
        return `${integerPart}${fractionPart ? `.${fractionPart}` : ""}${match[3] || ""}`;
    }
    function buildChapterSuffixResult(title, match, kind, startIndex = 2, endIndex = 3) {
        const start = normalizeChapterNumber(match[startIndex]),
            end = normalizeChapterNumber(match[endIndex] || match[startIndex]),
            raw = normalizeWhitespace(match[1]);
        return {
            baseTitle: title.slice(0, match.index).trim(),
            chapter: {
                kind: kind,
                start: start,
                end: end,
                raw: raw,
                key: `${kind}:${start}${end !== start ? `-${end}` : ""}`,
            },
        };
    }
    function extractChapterSuffix(title) {
        const normalizedTitle = normalizeWhitespace(String(title || "").normalize("NFKC"));
        if (!normalizedTitle) return null;
        const numberPattern = "\\d{1,4}(?:\\.\\d{1,2})?[a-z]?",
            rangePattern = "(?:-|–|—|~|～|to|至)";
        let match = normalizedTitle.match(
            new RegExp(
                `(?:^|\\s+)((?:ch(?:apter)?s?|ep(?:isode)?s?)\\.?\\s*#?(${numberPattern})(?:\\s*${rangePattern}\\s*#?(${numberPattern}))?)\\s*$`,
                "iu",
            ),
        );
        if (match) return buildChapterSuffixResult(normalizedTitle, match, "chapter");
        if (
            ((match = normalizedTitle.match(
                new RegExp(
                    `(?:^|\\s+)((?:vol(?:ume)?s?)\\.?\\s*#?(${numberPattern})(?:\\s*${rangePattern}\\s*#?(${numberPattern}))?)\\s*$`,
                    "iu",
                ),
            )),
            match)
        )
            return buildChapterSuffixResult(normalizedTitle, match, "volume");
        if (
            ((match = normalizedTitle.match(
                new RegExp(
                    `(?:^|\\s+)((?:part|pt)\\.?\\s*#?(${numberPattern})(?:\\s*${rangePattern}\\s*#?(${numberPattern}))?)\\s*$`,
                    "iu",
                ),
            )),
            match)
        )
            return buildChapterSuffixResult(normalizedTitle, match, "part");
        if (
            ((match = normalizedTitle.match(
                new RegExp(
                    `\\s*((?:第\\s*)?(${numberPattern})(?:\\s*${rangePattern}\\s*(${numberPattern}))?\\s*([話话章回集]))\\s*$`,
                    "iu",
                ),
            )),
            match)
        )
            return buildChapterSuffixResult(normalizedTitle, match, "chapter");
        if (
            ((match = normalizedTitle.match(
                new RegExp(
                    `\\s*((?:第\\s*)?(${numberPattern})(?:\\s*${rangePattern}\\s*(${numberPattern}))?\\s*[巻卷])\\s*$`,
                    "iu",
                ),
            )),
            match)
        )
            return buildChapterSuffixResult(normalizedTitle, match, "volume");
        if (
            ((match = normalizedTitle.match(
                new RegExp(
                    `\\s*((?:第\\s*)?(${numberPattern})(?:\\s*${rangePattern}\\s*(${numberPattern}))?\\s*部)\\s*$`,
                    "iu",
                ),
            )),
            match)
        )
            return buildChapterSuffixResult(normalizedTitle, match, "part");
        if (
            ((match = normalizedTitle.match(
                new RegExp(
                    `\\s*((?:제\\s*)?(${numberPattern})(?:\\s*${rangePattern}\\s*(${numberPattern}))?\\s*화)\\s*$`,
                    "iu",
                ),
            )),
            match)
        )
            return buildChapterSuffixResult(normalizedTitle, match, "chapter");
        if (
            ((match = normalizedTitle.match(
                /(?:^|\s+)((prologue|epilogue|interlude|extra|special|bonus|omake)(?:\s*#?\s*(\d{1,3}))?)\s*$/iu,
            )),
            match)
        ) {
            const specialName = normalizeComparableText(match[2]).replace(/\s+/g, "-"),
                numberSuffix = match[3] ? `-${normalizeChapterNumber(match[3])}` : "";
            return {
                baseTitle: normalizedTitle.slice(0, match.index).trim(),
                chapter: {
                    kind: "special",
                    start: `${specialName}${numberSuffix}`,
                    end: `${specialName}${numberSuffix}`,
                    raw: normalizeWhitespace(match[1]),
                    key: `special:${specialName}${numberSuffix}`,
                },
            };
        }
        if (
            ((match = normalizedTitle.match(/\s*((?:前|中|後|后)[編篇]|[上下][巻卷])\s*$/u)), match)
        ) {
            const partName = normalizeComparableText(match[1]);
            return {
                baseTitle: normalizedTitle.slice(0, match.index).trim(),
                chapter: {
                    kind: "part",
                    start: partName,
                    end: partName,
                    raw: normalizeWhitespace(match[1]),
                    key: `part:${partName}`,
                },
            };
        }
        return null;
    }
    function buildSearchTitle(baseTitle, chapter, maxLength = 192) {
        const suffix = chapter?.raw ? ` ${chapter.raw}` : "",
            availableLength = Math.max(1, maxLength - suffix.length);
        return normalizeWhitespace(`${baseTitle.slice(0, availableLength)}${suffix}`);
    }
    function parseTitlePart(title) {
        let remainingTitle = normalizeWhitespace(title),
            chapter = null,
            parody = "",
            changed = !0;
        for (; remainingTitle && changed; ) {
            changed = !1;
            const bracketMatch = remainingTitle.match(/\s*[\[【]([^\]】]+)[\]】]\s*$/u);
            if (bracketMatch) {
                (remainingTitle = remainingTitle.slice(0, bracketMatch.index).trim()),
                    (changed = !0);
                continue;
            }
            if (!chapter) {
                const chapterSuffix = extractChapterSuffix(remainingTitle);
                if (chapterSuffix) {
                    (chapter = chapterSuffix.chapter),
                        (remainingTitle = chapterSuffix.baseTitle),
                        (changed = !0);
                    continue;
                }
            }
            const parentheticalMatch = remainingTitle.match(/\s*[\(（]([^\)）]+)[\)）]\s*$/u);
            if (parentheticalMatch) {
                if (chapter) parody || (parody = normalizeWhitespace(parentheticalMatch[1]));
                else {
                    const parentheticalChapter = extractChapterSuffix(` ${parentheticalMatch[1]}`);
                    parentheticalChapter?.chapter && !parentheticalChapter.baseTitle
                        ? (chapter = parentheticalChapter.chapter)
                        : parody || (parody = normalizeWhitespace(parentheticalMatch[1]));
                }
                (remainingTitle = remainingTitle.slice(0, parentheticalMatch.index).trim()),
                    (changed = !0);
            }
        }
        const baseTitle = normalizeWhitespace(remainingTitle);
        return {
            baseTitle: baseTitle,
            searchTitle: buildSearchTitle(baseTitle, chapter),
            chapter: chapter,
            parody: parody,
        };
    }
    function parseTitleIdentity(title) {
        let remainingTitle = normalizeWhitespace(String(title || "").normalize("NFKC"));
        const eventPrefixMatch = remainingTitle.match(/^[\(（]([^\)）]+)[\)）]\s*/u);
        eventPrefixMatch && (remainingTitle = remainingTitle.slice(eventPrefixMatch[0].length));
        let creatorPrefix = "";
        const creatorPrefixMatch = remainingTitle.match(/^[\[【]([^\]】]+)[\]】]\s*/u);
        creatorPrefixMatch &&
            ((function (prefix) {
                const normalizedPrefix = normalizeComparableText(prefix);
                return (
                    !normalizedPrefix ||
                    LANGUAGE_TAG_NAMES.some((languageName) => normalizedPrefix === languageName) ||
                    [
                        "anthology",
                        "digital",
                        "dl版",
                        "translated",
                        "decensored",
                        "uncensored",
                        "colorized",
                        "full color",
                        "rewrite",
                        "speechless",
                        "text cleaned",
                        "sample",
                    ].includes(normalizedPrefix)
                );
            })(creatorPrefixMatch[1]) ||
                (creatorPrefix = normalizeWhitespace(creatorPrefixMatch[1])),
            (remainingTitle = remainingTitle.slice(creatorPrefixMatch[0].length)));
        const coreParts = [],
            searchParts = [],
            chapters = [],
            parodies = [];
        for (const titlePart of remainingTitle.split("|")) {
            const parsedPart = parseTitlePart(titlePart),
                normalizedPart = normalizeComparableTitle(parsedPart.baseTitle);
            normalizedPart &&
                !coreParts.some(
                    (existingTitle) => normalizeComparableTitle(existingTitle) === normalizedPart,
                ) &&
                (coreParts.push(parsedPart.baseTitle),
                searchParts.push(parsedPart.searchTitle),
                parsedPart.chapter &&
                    !chapters.some(
                        (existingChapter) => existingChapter.key === parsedPart.chapter.key,
                    ) &&
                    chapters.push(parsedPart.chapter),
                parsedPart.parody &&
                    !parodies.includes(parsedPart.parody) &&
                    parodies.push(parsedPart.parody));
        }
        const creatorTokens = new Set();
        if (creatorPrefix)
            for (const token of creatorPrefix.match(/[\p{L}\p{N}]+/gu) || []) {
                const normalizedToken = normalizeComparableText(token);
                normalizedToken.length >= 2 && creatorTokens.add(normalizedToken);
            }
        return {
            parody: parodies[0] || "",
            parodies: parodies,
            coreParts: coreParts,
            searchParts: searchParts,
            chapters: chapters,
            creatorTokens: creatorTokens,
        };
    }
    function normalizeComparableTitle(title) {
        return normalizeComparableText(title);
    }
    function levenshteinDistance(left, right) {
        const leftText = String(left || ""),
            rightText = String(right || "");
        if (!leftText.length) return rightText.length;
        if (!rightText.length) return leftText.length;
        let previousRow = Array.from(
                {
                    length: rightText.length + 1,
                },
                (unusedValue, index) => index,
            ),
            currentRow = new Array(rightText.length + 1);
        for (let rowIndex = 1; rowIndex <= leftText.length; rowIndex++) {
            currentRow[0] = rowIndex;
            for (let columnIndex = 1; columnIndex <= rightText.length; columnIndex++) {
                const substitutionCost =
                    previousRow[columnIndex - 1] +
                    (leftText[rowIndex - 1] === rightText[columnIndex - 1] ? 0 : 1);
                currentRow[columnIndex] = Math.min(
                    previousRow[columnIndex] + 1,
                    currentRow[columnIndex - 1] + 1,
                    substitutionCost,
                );
            }
            [previousRow, currentRow] = [currentRow, previousRow];
        }
        return previousRow[rightText.length];
    }
    function titleDistanceRatio(left, right) {
        const normalizedLeft = normalizeComparableTitle(left),
            normalizedRight = normalizeComparableTitle(right),
            maxLength = Math.max(normalizedLeft.length, normalizedRight.length);
        return maxLength ? levenshteinDistance(normalizedLeft, normalizedRight) / maxLength : 1;
    }
    function countSetOverlap(leftSet, rightSet) {
        let count = 0;
        for (const value of leftSet) rightSet.has(value) && count++;
        return count;
    }
    function analyzeTitleSet(titleRefs) {
        const cacheKey = Array.isArray(titleRefs) ? titleRefs : null,
            cached = cacheKey ? titleIdentityCache.get(cacheKey) : null;
        if (cached) return cached;
        const fields = (titleRefs || [])
                .map((title, index) => ({
                    index: index,
                    identity: parseTitleIdentity(title),
                }))
                .filter((field) => field.identity.coreParts.length > 0),
            identities = fields.map((field) => field.identity),
            analysis = {
                fields: fields,
                identities: identities,
                coreParts: identities.flatMap((identity) => identity.coreParts),
                creatorTokens: new Set(
                    identities.flatMap((identity) => Array.from(identity.creatorTokens)),
                ),
                parodies: new Set(
                    identities
                        .flatMap((identity) => identity.parodies)
                        .map((parody) => normalizeComparableText(parody))
                        .filter(Boolean),
                ),
                chapters: Array.from(
                    new Map(
                        identities
                            .flatMap((identity) => identity.chapters)
                            .map((chapter) => [chapter.key, chapter]),
                    ).values(),
                ),
            };
        return cacheKey && titleIdentityCache.set(cacheKey, analysis), analysis;
    }
    function findClosestTitlePair(leftIdentity, rightIdentity) {
        let bestRatio = 1 / 0,
            leftTitle = "",
            rightTitle = "";
        for (const leftTitlePart of leftIdentity.coreParts)
            for (const rightTitlePart of rightIdentity.coreParts) {
                const ratio = titleDistanceRatio(leftTitlePart, rightTitlePart);
                ratio < bestRatio &&
                    ((bestRatio = ratio),
                    (leftTitle = leftTitlePart),
                    (rightTitle = rightTitlePart));
            }
        return {
            ratio: bestRatio,
            leftTitle: leftTitle,
            rightTitle: rightTitle,
        };
    }
    function getTitleFieldLabel(index) {
        return 0 === index ? "主标题" : 1 === index ? "日文标题" : `标题 ${index + 1}`;
    }
    function compareChapterSets(currentIdentity, candidateIdentity) {
        if (!currentIdentity.chapters.length || !candidateIdentity.chapters.length)
            return {
                accepted: !0,
                relation: "unknown",
                score: 0,
                reason: "",
            };
        const candidateKeys = new Set(candidateIdentity.chapters.map((chapter) => chapter.key)),
            matchingChapter = currentIdentity.chapters.find((chapter) =>
                candidateKeys.has(chapter.key),
            );
        return matchingChapter
            ? {
                  accepted: !0,
                  relation: "match",
                  score: 8,
                  reason: `章节一致（${matchingChapter.raw}）`,
              }
            : {
                  accepted: !1,
                  relation: "conflict",
                  score: -1 / 0,
                  reason: `章节不同（${currentIdentity.chapters.map((chapter) => chapter.raw).join("/")} / ${candidateIdentity.chapters.map((chapter) => chapter.raw).join("/")}）`,
              };
    }
    function compareTitleContext(currentIdentity, candidateIdentity) {
        return countSetOverlap(currentIdentity.parodies, candidateIdentity.parodies) > 0
            ? {
                  score: 3,
                  reason: "原作段一致",
              }
            : {
                  score: 0,
                  reason: "",
              };
    }
    function creatorTagSets(gallery, solidOnly = !1) {
        const cacheKey = gallery && "object" == typeof gallery ? gallery : null,
            cacheSlot = solidOnly ? "solid" : "all",
            cached = cacheKey ? creatorTagSetsCache.get(cacheKey)?.[cacheSlot] : null;
        if (cached) return cached;
        const tagSets = {
            group: new Set(),
            artist: new Set(),
        };
        for (const tagEntry of gallery?.tags || []) {
            if (solidOnly && "object" == typeof tagEntry && !tagEntry.solid) continue;
            const normalizedTag = normalizeTag(
                    "string" == typeof tagEntry ? tagEntry : tagEntry?.tag,
                ),
                colonIndex = normalizedTag.indexOf(":");
            if (colonIndex < 1) continue;
            const namespace = normalizedTag.slice(0, colonIndex);
            namespace in tagSets && tagSets[namespace].add(normalizedTag.slice(colonIndex + 1));
        }
        if (cacheKey) {
            const cacheRecord = creatorTagSetsCache.get(cacheKey) || {};
            (cacheRecord[cacheSlot] = tagSets), creatorTagSetsCache.set(cacheKey, cacheRecord);
        }
        return tagSets;
    }
    function compareTitleSets(currentTitles, candidateTitles, config = DEFAULT_CONFIG) {
        const currentIdentity = analyzeTitleSet(currentTitles),
            candidateIdentity = analyzeTitleSet(candidateTitles);
        if (!currentIdentity.coreParts.length || !candidateIdentity.coreParts.length)
            return {
                accepted: !1,
                ratio: 1,
                creatorOverlap: 0,
                reason: "标题缺失",
            };
        let closestPair = {
            ratio: 1 / 0,
            leftTitle: "",
            rightTitle: "",
        };
        for (const currentTitleIdentity of currentIdentity.identities)
            for (const candidateTitleIdentity of candidateIdentity.identities) {
                const match = findClosestTitlePair(currentTitleIdentity, candidateTitleIdentity);
                match.ratio < closestPair.ratio && (closestPair = match);
            }
        if (closestPair.ratio > config.maxTitleDistanceRatio)
            return {
                accepted: !1,
                ratio: closestPair.ratio,
                creatorOverlap: 0,
                reason: `标题距离 ${(100 * closestPair.ratio).toFixed(1)}% 超过阈值`,
            };
        const fieldMatches = [];
        for (const currentField of currentIdentity.fields) {
            const candidateField = candidateIdentity.fields.find(
                (candidateField) => candidateField.index === currentField.index,
            );
            if (!candidateField) continue;
            const match = findClosestTitlePair(currentField.identity, candidateField.identity);
            fieldMatches.push({
                field: getTitleFieldLabel(currentField.index),
                index: currentField.index,
                ...match,
                accepted: match.ratio <= config.maxTitleDistanceRatio,
            });
        }
        const acceptedMatches = fieldMatches.filter((match) => match.accepted),
            coreLength = Math.max(
                normalizeComparableTitle(closestPair.leftTitle).length,
                normalizeComparableTitle(closestPair.rightTitle).length,
            ),
            creatorOverlap = countSetOverlap(
                currentIdentity.creatorTokens,
                candidateIdentity.creatorTokens,
            ),
            reason =
                acceptedMatches.length > 0
                    ? acceptedMatches
                          .map((match) => `${match.field} ${(100 * match.ratio).toFixed(1)}%`)
                          .join("，")
                    : `跨字段标题 ${(100 * closestPair.ratio).toFixed(1)}%`;
        return {
            accepted: !0,
            ratio: closestPair.ratio,
            creatorOverlap: creatorOverlap,
            coreLength: coreLength,
            fieldMatches: fieldMatches,
            currentIdentity: currentIdentity,
            candidateIdentity: candidateIdentity,
            reason: reason,
        };
    }
    function canonicalGalleryUrl(url, origin) {
        try {
            const parsedUrl = new URL(url, origin),
                match = parsedUrl.pathname.match(/^\/g\/(\d+)\/([0-9a-f]+)\/?/i);
            return match ? `${parsedUrl.origin}/g/${match[1]}/${match[2]}/` : "";
        } catch {
            return "";
        }
    }
    function parsePageCount(text) {
        const match = String(text || "").match(/(\d+)\s*pages?/i);
        return match ? Number(match[1]) : null;
    }
    function findSearchResultPageCount(texts) {
        const values = Array.from(texts || []);
        for (let index = values.length - 1; index >= 0; index--) {
            const match = normalizeWhitespace(values[index]).match(/^(\d+)\s*pages?$/i);
            if (match) return Number(match[1]);
        }
        return null;
    }
    function readSearchResultPageCount(row) {
        return findSearchResultPageCount(
            Array.from(row.querySelectorAll("td,div,span"), (element) => element.textContent),
        );
    }
    function parseGalleryPostedAt(text) {
        const match = String(text || "").match(
            /(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?/,
        );
        if (!match) return null;
        const timestamp = Date.UTC(
            Number(match[1]),
            Number(match[2]) - 1,
            Number(match[3]),
            Number(match[4]),
            Number(match[5]),
            Number(match[6] || 0),
        );
        return Number.isFinite(timestamp) ? timestamp : null;
    }
    function normalizeTag(tag) {
        let normalized = normalizeWhitespace(
            String(tag || "")
                .normalize("NFKC")
                .toLowerCase(),
        );
        if (!normalized) return "";
        normalized.includes(":") || (normalized = `misc:${normalized}`);
        const colonIndex = normalized.indexOf(":"),
            namespace = normalizeWhitespace(normalized.slice(0, colonIndex)),
            name = normalizeWhitespace(normalized.slice(colonIndex + 1));
        return namespace && name ? `${namespace}:${name}` : "";
    }
    function readTagFromAnchor(anchor) {
        const onclickMatch = (anchor.getAttribute("onclick") || "").match(
            /toggle_tagmenu\(\s*\d+\s*,\s*['"]([^'"]+)['"]/i,
        );
        if (onclickMatch) return normalizeTag(onclickMatch[1]);
        const href = anchor.getAttribute("href") || "";
        try {
            const pathname = new URL(href, location.origin).pathname,
                tagIndex = pathname.indexOf("/tag/");
            if (tagIndex >= 0) {
                const encodedTag = pathname.slice(tagIndex + 5);
                return normalizeTag(decodeURIComponent(encodedTag).replace(/\+/g, " "));
            }
        } catch {
            return "";
        }
        return "";
    }
    function parseGalleryTags(documentNode) {
        const tags = [],
            tagRows = documentNode.querySelectorAll('#taglist div[id^="td_"]');
        for (const tagRow of tagRows) {
            const anchor = tagRow.querySelector("a");
            if (!anchor) continue;
            const tag = readTagFromAnchor(anchor);
            tag &&
                tags.push({
                    tag: tag,
                    solid: tagRow.classList.contains("gt"),
                    voted: anchor.classList.contains("tup"),
                });
        }
        return tags;
    }
    function readGalleryPageCount(documentNode) {
        const rows = documentNode.querySelectorAll("#gdd tr");
        for (const row of rows) {
            const text = normalizeWhitespace(row.textContent);
            if (/^Length:/i.test(text)) return parsePageCount(text);
        }
        return null;
    }
    function readGalleryPostedAt(documentNode) {
        const rows = documentNode.querySelectorAll("#gdd tr");
        for (const row of rows) {
            const text = normalizeWhitespace(row.textContent);
            if (/^Posted:/i.test(text)) return parseGalleryPostedAt(text);
        }
        return null;
    }
    function getExplicitLanguage(tags) {
        const normalizedTags = (tags || [])
            .map((tag) => normalizeTag("string" == typeof tag ? tag : tag?.tag))
            .filter(Boolean);
        for (const languageName of LANGUAGE_TAG_NAMES)
            if (normalizedTags.includes(`language:${languageName}`)) return languageName;
        return "";
    }
    function classifyLanguage(tags, title) {
        const normalizedTags = tags.map(normalizeTag).filter(Boolean),
            explicitLanguage = getExplicitLanguage(normalizedTags);
        if (explicitLanguage) return explicitLanguage;
        const normalizedTitle = String(title || "")
            .normalize("NFKC")
            .toLowerCase()
            .replace(/_/g, " ");
        for (const languageName of LANGUAGE_TAG_NAMES)
            if (normalizedTitle.includes(languageName)) return languageName;
        const isTranslated = normalizedTags.includes("language:translated");
        return normalizedTags.length > 0 && !isTranslated ? "japanese" : "unknown";
    }
    function parseGalleryDocument(documentNode, url) {
        const titleGn = normalizeWhitespace(documentNode.querySelector("#gn")?.textContent),
            titleGj = normalizeWhitespace(documentNode.querySelector("#gj")?.textContent),
            tags = parseGalleryTags(documentNode),
            explicitLanguage = getExplicitLanguage(tags);
        return {
            url: canonicalGalleryUrl(url, new URL(url, location.href).origin),
            titleGn: titleGn,
            titleGj: titleGj,
            titleRefs: [titleGn, titleGj],
            pageCount: readGalleryPageCount(documentNode),
            postedAt: readGalleryPostedAt(documentNode),
            tags: tags,
            language: classifyLanguage(
                tags.map((tag) => tag.tag),
                `${titleGn} ${titleGj}`,
            ),
            explicitLanguage: explicitLanguage,
        };
    }
    function selectNewestGallery(galleries) {
        return (galleries || []).reduce(
            (selected, gallery) =>
                !selected ||
                (function (left, right) {
                    if (Number.isFinite(left?.postedAt) && Number.isFinite(right?.postedAt)) {
                        const dateDifference = left.postedAt - right.postedAt;
                        if (dateDifference) return dateDifference;
                    }
                    const dateDifference =
                        Number(galleryIdFromUrl(left?.url)) - Number(galleryIdFromUrl(right?.url));
                    return Number.isFinite(dateDifference) && dateDifference
                        ? dateDifference
                        : String(left?.url || "").localeCompare(String(right?.url || ""));
                })(gallery, selected) > 0
                    ? gallery
                    : selected,
            null,
        );
    }
    function buildTransferPlan(galleries, direction = "all") {
        const galleryList = Array.from(galleries || []);
        if ("newest" !== direction)
            return {
                sources: galleryList,
                targets: galleryList,
                newest: null,
            };
        const newest = selectNewestGallery(galleryList);
        return newest
            ? {
                  sources: galleryList.filter((gallery) => gallery.url !== newest.url),
                  targets: [newest],
                  newest: newest,
              }
            : {
                  sources: [],
                  targets: [],
                  newest: null,
              };
    }
    function hasSameExplicitLanguage(currentGallery, candidateGallery) {
        const currentLanguage =
                currentGallery?.explicitLanguage || getExplicitLanguage(currentGallery?.tags),
            candidateLanguage =
                candidateGallery?.explicitLanguage || getExplicitLanguage(candidateGallery?.tags);
        return Boolean(
            currentLanguage && candidateLanguage && currentLanguage === candidateLanguage,
        );
    }
    function assessCandidate(currentGallery, candidateGallery, config = DEFAULT_CONFIG) {
        if (
            !Number.isInteger(currentGallery.pageCount) ||
            !Number.isInteger(candidateGallery.pageCount)
        )
            return {
                accepted: !1,
                reason: "页数缺失",
                pageDifference: null,
                ratio: 1,
                score: -1 / 0,
            };
        if (
            currentGallery.pageCount < config.minGalleryPages ||
            candidateGallery.pageCount < config.minGalleryPages
        )
            return {
                accepted: !1,
                reason: `页数少于 ${config.minGalleryPages}`,
                pageDifference: Math.abs(currentGallery.pageCount - candidateGallery.pageCount),
                ratio: 1,
                score: -1 / 0,
            };
        const pageDifference = Math.abs(currentGallery.pageCount - candidateGallery.pageCount);
        if (pageDifference > config.maxPageDifference)
            return {
                accepted: !1,
                reason: `页数相差 ${pageDifference}，超过 ${config.maxPageDifference}`,
                pageDifference: pageDifference,
                ratio: 1,
                score: -1 / 0,
            };
        const titleAssessment = compareTitleSets(
            currentGallery.titleRefs,
            candidateGallery.titleRefs,
            config,
        );
        if (!titleAssessment.accepted)
            return {
                ...titleAssessment,
                pageDifference: pageDifference,
                score: -1 / 0,
            };
        const chapterAssessment = compareChapterSets(
            titleAssessment.currentIdentity,
            titleAssessment.candidateIdentity,
        );
        if (!chapterAssessment.accepted)
            return {
                accepted: !1,
                reason: chapterAssessment.reason,
                pageDifference: pageDifference,
                ratio: titleAssessment.ratio,
                chapterRelation: chapterAssessment.relation,
                score: -1 / 0,
            };
        const currentCreators = creatorTagSets(currentGallery, !0),
            candidateCreators = creatorTagSets(candidateGallery, !0),
            groupOverlap = countSetOverlap(currentCreators.group, candidateCreators.group),
            artistOverlap = countSetOverlap(currentCreators.artist, candidateCreators.artist),
            creatorTagOverlap = groupOverlap + artistOverlap;
        for (const namespace of ["group", "artist"])
            if (
                currentCreators[namespace].size > 0 &&
                candidateCreators[namespace].size > 0 &&
                0 === countSetOverlap(currentCreators[namespace], candidateCreators[namespace]) &&
                0 === titleAssessment.creatorOverlap
            )
                return {
                    accepted: !1,
                    reason: ("group" === namespace ? "社团" : "作者") + "标签冲突",
                    pageDifference: pageDifference,
                    ratio: titleAssessment.ratio,
                    creatorOverlap: 0,
                    score: -1 / 0,
                };
        const hasCreatorEvidence =
            currentCreators.group.size +
                currentCreators.artist.size +
                titleAssessment.currentIdentity.creatorTokens.size >
            0;
        if (
            titleAssessment.coreLength <= config.genericTitleLength &&
            hasCreatorEvidence &&
            creatorTagOverlap + titleAssessment.creatorOverlap === 0
        )
            return {
                accepted: !1,
                reason: "短标题缺少相同作者或社团证据",
                pageDifference: pageDifference,
                ratio: titleAssessment.ratio,
                creatorOverlap: 0,
                score: -1 / 0,
            };
        const titleThreshold = Math.max(config.maxTitleDistanceRatio, 0.001),
            pageScore =
                0 === config.maxPageDifference
                    ? 20
                    : 20 * Math.max(0, 1 - pageDifference / config.maxPageDifference),
            extraTitleScore = titleAssessment.fieldMatches
                .filter((match) => match.accepted)
                .sort((left, right) => left.ratio - right.ratio)
                .slice(1)
                .reduce(
                    (total, match) => total + 10 * Math.max(0, 1 - match.ratio / titleThreshold),
                    0,
                ),
            contextAssessment = compareTitleContext(
                titleAssessment.currentIdentity,
                titleAssessment.candidateIdentity,
            );
        let score =
            50 * Math.max(0, 1 - titleAssessment.ratio / titleThreshold) +
            extraTitleScore +
            pageScore +
            16 * groupOverlap +
            12 * artistOverlap +
            Math.min(8, 2 * titleAssessment.creatorOverlap) +
            chapterAssessment.score +
            contextAssessment.score;
        return (
            (score += Math.min(4, candidateGallery.matchedQueries?.length || 0)),
            (score = Math.round(10 * score) / 10),
            {
                accepted: !0,
                reason: [
                    titleAssessment.reason,
                    chapterAssessment.reason,
                    contextAssessment.reason,
                    `页差 ${pageDifference}`,
                    `评分 ${score}`,
                ]
                    .filter(Boolean)
                    .join("，"),
                pageDifference: pageDifference,
                ratio: titleAssessment.ratio,
                matchedTitleFields: titleAssessment.fieldMatches
                    .filter((match) => match.accepted)
                    .map((match) => match.field),
                chapterRelation: chapterAssessment.relation,
                creatorOverlap: creatorTagOverlap + titleAssessment.creatorOverlap,
                groupOverlap: groupOverlap,
                artistOverlap: artistOverlap,
                score: score,
            }
        );
    }
    function selectBestLanguageCandidates(candidates, minimumScoreGap) {
        const byLanguage = new Map(),
            rejected = [];
        for (const candidate of candidates)
            candidate.language && "unknown" !== candidate.language
                ? (byLanguage.has(candidate.language) || byLanguage.set(candidate.language, []),
                  byLanguage.get(candidate.language).push(candidate))
                : rejected.push({
                      ...candidate,
                      rejectionReason: "无法确认语言",
                  });
        const accepted = [];
        for (const [language, languageCandidates] of byLanguage) {
            if (
                (languageCandidates.sort(
                    (left, right) =>
                        (right.assessment?.score ?? -1 / 0) - (left.assessment?.score ?? -1 / 0) ||
                        (left.assessment?.pageDifference ?? 1 / 0) -
                            (right.assessment?.pageDifference ?? 1 / 0) ||
                        String(left.url).localeCompare(String(right.url)),
                ),
                1 === languageCandidates.length)
            ) {
                accepted.push(languageCandidates[0]);
                continue;
            }
            const scoreGap =
                (languageCandidates[0].assessment?.score ?? -1 / 0) -
                (languageCandidates[1].assessment?.score ?? -1 / 0);
            if (scoreGap >= minimumScoreGap) {
                accepted.push(languageCandidates[0]);
                for (const candidate of languageCandidates.slice(1))
                    rejected.push({
                        ...candidate,
                        rejectionReason: `${language} 版本评分低于首选 ${scoreGap.toFixed(1)} 分`,
                    });
            } else
                for (const candidate of languageCandidates)
                    rejected.push({
                        ...candidate,
                        rejectionReason: `${language} 前两名仅相差 ${scoreGap.toFixed(1)} 分，仍有歧义`,
                    });
        }
        return {
            accepted: accepted,
            rejected: rejected,
        };
    }
    function selectTransferCandidates(candidates, direction, minimumScoreGap) {
        if ("newest" !== direction)
            return selectBestLanguageCandidates(candidates, minimumScoreGap);
        const accepted = [],
            rejected = [];
        for (const candidate of candidates || [])
            candidate.language && "unknown" !== candidate.language
                ? accepted.push(candidate)
                : rejected.push({
                      ...candidate,
                      rejectionReason: "无法确认语言",
                  });
        return {
            accepted: accepted,
            rejected: rejected,
        };
    }
    function escapeRegex(value) {
        return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    function compileBlacklist(source) {
        const rules = [],
            lines = String(source || "").split(/[\n,]+/);
        for (let line of lines) {
            if (((line = normalizeWhitespace(line).toLowerCase()), !line || line.startsWith("#")))
                continue;
            const pattern = `^${escapeRegex(line.includes(":") ? normalizeTag(line) : line).replace(/\\\*/g, ".*")}$`;
            rules.push({
                namespaced: line.includes(":"),
                regex: new RegExp(pattern, "i"),
            });
        }
        return rules;
    }
    function isBlacklisted(tag, rules) {
        const normalizedTag = normalizeTag(tag),
            bareName = normalizedTag.slice(normalizedTag.indexOf(":") + 1);
        return rules.some((rule) => rule.regex.test(rule.namespaced ? normalizedTag : bareName));
    }
    function buildTransferTagUnion(galleries, mode, blacklist) {
        const union = new Set();
        for (const gallery of galleries)
            for (const tagEntry of gallery.tags)
                ("solid" !== mode || tagEntry.solid) &&
                    (isBlacklisted(tagEntry.tag, blacklist) || union.add(tagEntry.tag));
        return Array.from(union).sort();
    }
    function planTargetTags(union, targetTags) {
        const existingTags = new Map(targetTags.map((tag) => [tag.tag, tag])),
            pending = [];
        let skippedSolid = 0,
            skippedVoted = 0;
        for (const tag of union) {
            const existingTag = existingTags.get(tag);
            existingTag?.solid
                ? skippedSolid++
                : existingTag?.voted
                  ? skippedVoted++
                  : pending.push(tag);
        }
        return {
            pending: pending,
            skippedSolid: skippedSolid,
            skippedVoted: skippedVoted,
        };
    }
    function buildTagBatches(tags, maxLength = 200) {
        const batches = [];
        let batch = [],
            batchLength = 0;
        for (const tag of tags) {
            const normalizedTag = normalizeTag(tag);
            if (!normalizedTag || normalizedTag.length > maxLength) continue;
            const addedLength = normalizedTag.length + (batch.length ? 1 : 0);
            batch.length &&
                batchLength + addedLength > maxLength &&
                (batches.push(batch), (batch = []), (batchLength = 0)),
                batch.push(normalizedTag),
                (batchLength += normalizedTag.length + (batch.length > 1 ? 1 : 0));
        }
        return batch.length && batches.push(batch), batches;
    }
    function parseSearchResults(documentNode, origin) {
        const rows = documentNode.querySelectorAll(".itg tr,.gl1t"),
            results = [];
        for (const row of rows) {
            const titleLink = row.querySelector(".glink"),
                galleryLink = row.querySelector('.gl1e a,.glname a,.gl2e a,.gl1t>a,a[href*="/g/"]');
            if (!titleLink || !galleryLink) continue;
            const url = canonicalGalleryUrl(galleryLink.getAttribute("href"), origin);
            if (!url) continue;
            const tags = Array.from(row.querySelectorAll(".gt,.gtl"))
                    .map((tagElement) => ({
                        tag: normalizeTag(tagElement.getAttribute("title")),
                        solid: tagElement.classList.contains("gt"),
                    }))
                    .filter((tag) => tag.tag),
                title = normalizeWhitespace(titleLink.textContent),
                explicitLanguage = getExplicitLanguage(tags);
            results.push({
                url: url,
                title: title,
                titleRefs: [title],
                pageCount: readSearchResultPageCount(row),
                tags: tags,
                language: classifyLanguage(
                    tags.map((tag) => tag.tag),
                    title,
                ),
                explicitLanguage: explicitLanguage,
            });
        }
        return results;
    }
    function randomInteger(minimum, maximum) {
        return Math.round(minimum + Math.random() * (maximum - minimum));
    }
    function createAbortError() {
        return new DOMException("Aborted", "AbortError");
    }
    function delay(milliseconds, signal) {
        return signal?.aborted
            ? Promise.reject(createAbortError())
            : new Promise((resolve, reject) => {
                  let settled = !1;
                  const timer = setTimeout(() => settle(), milliseconds),
                      abortHandler = () => settle(createAbortError());
                  function settle(error) {
                      settled ||
                          ((settled = !0),
                          clearTimeout(timer),
                          signal?.removeEventListener("abort", abortHandler),
                          error ? reject(error) : resolve());
                  }
                  signal?.addEventListener("abort", abortHandler, {
                      once: !0,
                  }),
                      signal?.aborted && abortHandler();
              });
    }
    async function randomDelay(minimum, maximum, signal) {
        await delay(randomInteger(minimum, maximum), signal);
    }
    function getSearchWaitMs(
        lastRequestAt,
        now = Date.now(),
        intervalMs = DEFAULT_CONFIG.searchRequestIntervalMs,
    ) {
        return Math.max(0, Number(lastRequestAt || 0) + intervalMs - now);
    }
    async function waitForSearchThrottle(signal, intervalMs) {
        const waitMs = getSearchWaitMs(runtimeState.lastSearchRequestAt, Date.now(), intervalMs);
        waitMs > 0 && (await delay(waitMs, signal)),
            (runtimeState.lastSearchRequestAt = Date.now());
    }
    function isRetryableFetchError(error) {
        if (!error || ["AbortError", "RequestBudgetError"].includes(error.name)) return !1;
        const status = Number(error.status);
        return Number.isInteger(status) && status > 0
            ? [408, 425, 429].includes(status) || status >= 500
            : "TypeError" === error.name || "TimeoutError" === error.name;
    }
    function getRetryDelay(attempt) {
        const baseDelay = Math.min(
            RUNTIME_LIMITS.fetchRetryMaxMs,
            RUNTIME_LIMITS.fetchRetryBaseMs * 2 ** (attempt - 1),
        );
        return randomInteger(0.8 * baseDelay, 1.2 * baseDelay);
    }
    async function withFetchRetry(operation, signal, failureLabel) {
        let lastError = null;
        for (let attempt = 1; attempt <= RUNTIME_LIMITS.fetchMaxAttempts; attempt++) {
            if (signal?.aborted) throw createAbortError();
            try {
                return await operation();
            } catch (error) {
                lastError = signal?.aborted ? createAbortError() : error;
            }
            if (attempt >= RUNTIME_LIMITS.fetchMaxAttempts || !isRetryableFetchError(lastError))
                throw lastError;
            const delayMs = getRetryDelay(attempt);
            appendLog(
                "warn",
                `${failureLabel}，${delayMs} ms 后重试 ${attempt + 1}/${RUNTIME_LIMITS.fetchMaxAttempts}：${lastError.message}`,
            ),
                await delay(delayMs, signal);
        }
        throw lastError;
    }
    async function fetchHtml(
        url,
        signal,
        {
            beforeAttempt: beforeAttempt,
            acceptStatus: acceptStatus = () => !1,
            failureLabel: failureLabel = "读取失败",
        } = {},
    ) {
        const parsedUrl = new URL(url, location.href);
        return withFetchRetry(
            async () => {
                if (signal?.aborted) throw createAbortError();
                beforeAttempt && (await beforeAttempt(signal)),
                    consumeTrackedRequest(`读取 ${parsedUrl.pathname}`);
                const requestController = new AbortController();
                let timedOut = !1;
                const abortHandler = () => requestController.abort(),
                    timeoutId = setTimeout(() => {
                        (timedOut = !0), requestController.abort();
                    }, RUNTIME_LIMITS.fetchTimeoutMs);
                signal?.addEventListener("abort", abortHandler, {
                    once: !0,
                }),
                    signal?.aborted && abortHandler();
                try {
                    const response = await fetch(parsedUrl.href, {
                        credentials: "include",
                        signal: requestController.signal,
                        headers: {
                            Accept: "text/html",
                        },
                    });
                    if (!response.ok && !acceptStatus(response.status)) {
                        const error = new Error(`HTTP ${response.status}`);
                        throw ((error.status = response.status), error);
                    }
                    const responseText = await response.text();
                    return {
                        status: response.status,
                        url: response.url || parsedUrl.href,
                        html: responseText,
                    };
                } catch (error) {
                    if (signal?.aborted) throw createAbortError();
                    if (timedOut) {
                        const timeoutError = new Error(
                            `读取超时（${RUNTIME_LIMITS.fetchTimeoutMs / 1e3} 秒）`,
                        );
                        throw ((timeoutError.name = "TimeoutError"), timeoutError);
                    }
                    throw error;
                } finally {
                    clearTimeout(timeoutId), signal?.removeEventListener("abort", abortHandler);
                }
            },
            signal,
            failureLabel,
        );
    }
    async function fetchDocument(url, signal, { beforeAttempt: beforeAttempt } = {}) {
        const response = await fetchHtml(url, signal, {
            beforeAttempt: beforeAttempt,
        });
        return new DOMParser().parseFromString(response.html, "text/html");
    }
    function readInlineScriptAssignment(documentNode, variableName) {
        const escapedName = escapeRegex(variableName),
            assignmentPattern = new RegExp(
                `(?:^|[;\\n])\\s*(?:var|let|const)?\\s*${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|(-?\\d+))`,
                "m",
            );
        for (const script of documentNode.querySelectorAll("script:not([src])")) {
            const match = assignmentPattern.exec(script.textContent || "");
            if (match) return match[1] ?? match[2] ?? match[3] ?? "";
        }
        return "";
    }
    function isTrustedTagApiUrl(apiUrl, galleryUrl) {
        try {
            const api = new URL(apiUrl),
                gallery = new URL(galleryUrl);
            return (
                "/api.php" === api.pathname &&
                (["127.0.0.1", "localhost"].includes(gallery.hostname)
                    ? api.origin === gallery.origin
                    : "https:" === api.protocol &&
                      ("exhentai.org" === gallery.hostname
                          ? new Set(["exhentai.org", "s.exhentai.org", "api.e-hentai.org"])
                          : new Set(["e-hentai.org", "api.e-hentai.org"])
                      ).has(api.hostname))
            );
        } catch {
            return !1;
        }
    }
    function parseGalleryWriteContext(documentNode, galleryUrl) {
        const gidFromUrl = galleryIdFromUrl(galleryUrl),
            tokenFromUrl = String(galleryUrl || "").match(/\/g\/\d+\/([0-9a-f]+)\/?/i)?.[1] || "",
            rawApiUrl = readInlineScriptAssignment(documentNode, "api_url"),
            scriptGid = String(readInlineScriptAssignment(documentNode, "gid")).replace(/\D/g, ""),
            token = String(readInlineScriptAssignment(documentNode, "token")),
            apiuid = Number(readInlineScriptAssignment(documentNode, "apiuid")),
            apikey = String(readInlineScriptAssignment(documentNode, "apikey"));
        let normalizedApiUrl = "";
        try {
            normalizedApiUrl = new URL(rawApiUrl, galleryUrl).href;
        } catch {
            return null;
        }
        return gidFromUrl &&
            scriptGid === gidFromUrl &&
            tokenFromUrl &&
            token.toLowerCase() === tokenFromUrl.toLowerCase() &&
            Number.isSafeInteger(apiuid) &&
            !(apiuid <= 0) &&
            /^[0-9a-f]{8,}$/i.test(apikey) &&
            isTrustedTagApiUrl(normalizedApiUrl, galleryUrl)
            ? {
                  apiUrl: normalizedApiUrl,
                  gid: Number(scriptGid),
                  token: token,
                  apiuid: apiuid,
                  apikey: apikey,
              }
            : null;
    }
    function buildTagGalleryPayload(writeContext, tags, vote) {
        return {
            method: "taggallery",
            apiuid: writeContext.apiuid,
            apikey: writeContext.apikey,
            gid: writeContext.gid,
            token: writeContext.token,
            tags: tags.map(normalizeTag).filter(Boolean).join(","),
            vote: -1 === vote ? -1 : 1,
        };
    }
    function isUsableGalleryDocument(documentNode) {
        return Boolean(documentNode.querySelector("#gn") && documentNode.querySelector("#taglist"));
    }
    async function fetchGallerySnapshot(url, signal) {
        const response = await fetchHtml(url, signal, {
                acceptStatus: isUnavailableGalleryStatus,
                failureLabel: "画廊读取失败",
            }),
            documentNode = new DOMParser().parseFromString(response.html, "text/html"),
            unavailable = (function (documentNode, status) {
                if (isUnavailableGalleryStatus(status)) return !0;
                if (documentNode.querySelector("#gn")) return !1;
                const pageText = `${documentNode.title}\n${documentNode.body?.innerText || ""}`;
                return /\b(?:404|410)\b|gallery\s+(?:not found|unavailable|removed|expunged)/i.test(
                    pageText,
                );
            })(documentNode, response.status);
        if (!unavailable && !isUsableGalleryDocument(documentNode)) {
            const error = new Error("画廊页面结构异常或当前无法访问");
            throw ((error.name = "GalleryStructureError"), error);
        }
        return {
            url: response.url,
            status: response.status,
            unavailable: unavailable,
            doc: documentNode,
            gallery: unavailable ? null : parseGalleryDocument(documentNode, response.url),
            writeContext: unavailable ? null : parseGalleryWriteContext(documentNode, response.url),
        };
    }
    function parseBadTagRecords(documentNode, origin = "https://repo.e-hentai.org") {
        const records = [];
        let currentGallery = null;
        const rows = documentNode.querySelectorAll("#usertaglist tr");
        for (const row of rows) {
            const galleryAnchor = Array.from(row.querySelectorAll("a[href]")).find((anchor) =>
                /\/g\/\d+\/[0-9a-f]+\/?/i.test(anchor.href),
            );
            if (galleryAnchor) {
                const galleryUrl = canonicalGalleryUrl(galleryAnchor.href, origin),
                    gidMatch = galleryUrl.match(/\/g\/(\d+)\//);
                currentGallery =
                    galleryUrl && gidMatch
                        ? {
                              gid: gidMatch[1],
                              galleryUrl: galleryUrl,
                          }
                        : null;
                continue;
            }
            if (!currentGallery) continue;
            const redAnchors = Array.from(row.querySelectorAll("a")).filter(
                    (anchor) =>
                        "red" === String(anchor.style?.color || "").toLowerCase() ||
                        /(?:^|;)\s*color\s*:\s*red(?:\s*;|$)/i.test(
                            anchor.getAttribute("style") || "",
                        ),
                ),
                timestampCell = row.querySelector("td[title]"),
                timestamp = normalizeWhitespace(
                    timestampCell?.getAttribute("title") || timestampCell?.textContent,
                );
            for (const anchor of redAnchors) {
                const tag = normalizeTag(
                    anchor.getAttribute("ehs-tag") ||
                        anchor.getAttribute("title") ||
                        anchor.textContent,
                );
                tag &&
                    records.push({
                        ...currentGallery,
                        tag: tag,
                        timestamp: timestamp,
                    });
            }
        }
        return records;
    }
    function badTagRecordFingerprint(record) {
        return [record.gid, normalizeTag(record.tag), normalizeWhitespace(record.timestamp)].join(
            "|",
        );
    }
    function sanitizeBadTagState(state = {}, fallbackUid = "") {
        return {
            uid: String(state.uid || fallbackUid),
            knownFingerprints: Array.from(new Set(state.knownFingerprints || [])).slice(-2e3),
        };
    }
    function buildSearchUrl(query, origin = DEFAULT_ORIGIN) {
        const url = new URL("/", origin);
        url.searchParams.set("f_search", query);
        for (const parameterName of ["f_sfl", "f_sfu", "f_sft"])
            url.searchParams.set(parameterName, "on");
        return url.href;
    }
    function buildSearchQueries(gallery) {
        const titleSet = analyzeTitleSet(gallery.titleRefs),
            queries = [],
            seenTitleKeys = new Set();
        function addQuery(field, stage, label) {
            const title = field?.identity.searchParts[0] || field?.identity.coreParts[0],
                titleKey = normalizeComparableTitle(title);
            if (!titleKey || seenTitleKeys.has(titleKey)) return;
            seenTitleKeys.add(titleKey);
            const queryText = `title:"${normalizeWhitespace(title).replace(/["\\]/g, " ")}"`;
            queries.push({
                text: queryText,
                label: `${label}：${title}`,
                stage: stage,
                kind: "title",
                titleKey: titleKey,
                coreLength: titleKey.length,
            });
        }
        return (
            addQuery(
                titleSet.fields.find((field) => 0 === field.index),
                "english",
                "英文标题",
            ),
            addQuery(
                titleSet.fields.find((field) => 1 === field.index),
                "japanese",
                "日文标题",
            ),
            queries
        );
    }
    function shouldContinueSearchPages(
        {
            query: query,
            page: page,
            maxPages: maxPages,
            hasNext: hasNext,
            newResultCount: newResultCount,
            hasStrongCandidate: hasStrongCandidate,
        },
        config = DEFAULT_CONFIG,
    ) {
        return !(
            !hasNext ||
            page >= maxPages ||
            newResultCount <= 0 ||
            ("title" === query.kind &&
                query.coreLength > config.genericTitleLength &&
                hasStrongCandidate)
        );
    }
    function shouldRunJapaneseSearch(currentGallery, candidates, config = DEFAULT_CONFIG) {
        return !Array.from(candidates || []).some((candidate) =>
            (function (currentGallery, candidate, config) {
                return (
                    candidate.url !== currentGallery.url &&
                    !hasSameExplicitLanguage(currentGallery, candidate) &&
                    assessCandidate(currentGallery, candidate, config).accepted
                );
            })(currentGallery, candidate, config),
        );
    }
    function isStrongPreviewCandidate(currentGallery, candidate, config) {
        return (
            candidate.url !== currentGallery.url &&
            !hasSameExplicitLanguage(currentGallery, candidate) &&
            assessCandidate(currentGallery, candidate, config).accepted
        );
    }
    async function fetchSearchQueryResults(query, maxPages, signal, currentGallery, config) {
        let nextUrl = buildSearchUrl(query.text, location.origin);
        const visitedUrls = new Set(),
            resultsByUrl = new Map();
        for (let page = 1; page <= maxPages && nextUrl; page++) {
            if (signal.aborted) throw createAbortError();
            if (visitedUrls.has(nextUrl)) break;
            visitedUrls.add(nextUrl);
            const documentNode = await fetchDocument(nextUrl, signal, {
                    beforeAttempt: (attemptSignal) =>
                        waitForSearchThrottle(attemptSignal, config.searchRequestIntervalMs),
                }),
                pageResults = parseSearchResults(documentNode, location.origin);
            let newResultCount = 0;
            for (const result of pageResults)
                resultsByUrl.has(result.url) ||
                    (resultsByUrl.set(result.url, {
                        ...result,
                        matchedQueries: [query.text],
                    }),
                    newResultCount++);
            const nextHref = documentNode.querySelector("#dnext[href]")?.getAttribute("href");
            let followingUrl = "";
            if (nextHref) {
                const nextPageUrl = new URL(nextHref, nextUrl);
                if (nextPageUrl.origin === location.origin) {
                    for (const parameterName of ["f_sfl", "f_sfu", "f_sft"])
                        nextPageUrl.searchParams.set(parameterName, "on");
                    followingUrl = nextPageUrl.href;
                }
            }
            if (
                !shouldContinueSearchPages(
                    {
                        query: query,
                        page: page,
                        maxPages: maxPages,
                        hasNext: Boolean(followingUrl && !visitedUrls.has(followingUrl)),
                        newResultCount: newResultCount,
                        hasStrongCandidate: pageResults.some((candidate) =>
                            isStrongPreviewCandidate(currentGallery, candidate, config),
                        ),
                    },
                    config,
                )
            )
                break;
            nextUrl = followingUrl;
        }
        return {
            results: Array.from(resultsByUrl.values()),
        };
    }
    function truncateLogTitle(text, maxLength = 70) {
        const normalized = normalizeWhitespace(text);
        return normalized.length > maxLength
            ? `${normalized.slice(0, maxLength - 1)}…`
            : normalized;
    }
    function canonicalHomepageUrl(url) {
        try {
            const parsedUrl = new URL(url || "/", location.origin);
            return parsedUrl.origin !== location.origin ||
                "/" !== parsedUrl.pathname ||
                parsedUrl.searchParams.has("f_search")
                ? ""
                : parsedUrl.href;
        } catch {
            return "";
        }
    }
    function isUnavailableGalleryStatus(status) {
        return [404, 410].includes(Number(status));
    }
    function getBadTagCorrectionStrategy({
        exists: exists,
        upvoted: upvoted,
        downvoted: downvoted,
    }) {
        return downvoted
            ? "already-downvoted"
            : exists
              ? upvoted
                  ? "withdraw-and-downvote"
                  : "downvote"
              : "already-missing";
    }
    function getTagVoteState(documentNode, tag) {
        const tagAnchor = (function (documentNode, tag) {
            const normalizedTag = normalizeTag(tag);
            return (
                Array.from(documentNode.querySelectorAll('#taglist div[id^="td_"]')).find(
                    (tagRow) => {
                        const anchor = tagRow.querySelector("a");
                        return anchor && readTagFromAnchor(anchor) === normalizedTag;
                    },
                ) || null
            );
        })(documentNode, tag)?.querySelector("a");
        return {
            exists: Boolean(tagAnchor),
            upvoted: !0 === tagAnchor?.classList.contains("tup"),
            downvoted: !0 === tagAnchor?.classList.contains("tdn"),
        };
    }
    async function submitTagVoteAndVerify(snapshot, tags, vote, signal) {
        let voteError = null;
        try {
            await (function (writeContext, tags, vote, signal) {
                const payload = buildTagGalleryPayload(writeContext, tags, vote);
                return payload.tags
                    ? (consumeTrackedRequest(`标签投票 ${writeContext.gid}`),
                      new Promise((resolve, reject) => {
                          const request = new XMLHttpRequest();
                          let settled = !1;
                          function settle(error, value) {
                              settled ||
                                  ((settled = !0),
                                  signal?.removeEventListener("abort", abortRequest),
                                  error ? reject(error) : resolve(value));
                          }
                          function createUnknownResponseError(message, status = 0) {
                              const error = new Error(message);
                              return (
                                  (error.name = "TagVoteResponseUnknownError"),
                                  status && (error.status = status),
                                  error
                              );
                          }
                          function abortRequest() {
                              try {
                                  request.abort();
                              } finally {
                                  settle(createAbortError());
                              }
                          }
                          request.open("POST", writeContext.apiUrl, !0),
                              request.setRequestHeader("Content-Type", "application/json"),
                              request.setRequestHeader("Accept", "application/json"),
                              (request.withCredentials = !0),
                              (request.timeout = RUNTIME_LIMITS.fetchTimeoutMs),
                              (request.onload = () => {
                                  if (request.status < 200 || request.status >= 300)
                                      return void settle(
                                          createUnknownResponseError(
                                              `标签接口 HTTP ${request.status}`,
                                              request.status,
                                          ),
                                      );
                                  let responsePayload;
                                  try {
                                      responsePayload = JSON.parse(request.responseText || "{}");
                                  } catch {
                                      return void settle(
                                          createUnknownResponseError(
                                              "标签接口返回了无法识别的响应",
                                          ),
                                      );
                                  }
                                  if (null != responsePayload?.login) {
                                      const authError = new Error("标签接口要求重新登录");
                                      return (
                                          (authError.name = "TagVoteAuthError"),
                                          void settle(authError)
                                      );
                                  }
                                  if (null != responsePayload?.error) {
                                      const apiError = new Error(String(responsePayload.error));
                                      return (
                                          (apiError.name = isBadTagVoteLockedMessage(
                                              apiError.message,
                                          )
                                              ? "BadTagVoteLockedError"
                                              : "TagVoteApiError"),
                                          void settle(apiError)
                                      );
                                  }
                                  settle(null, responsePayload);
                              }),
                              (request.onerror = () =>
                                  settle(createUnknownResponseError("标签接口网络失败"))),
                              (request.ontimeout = () =>
                                  settle(createUnknownResponseError("标签接口响应超时"))),
                              (request.onabort = () => settle(createAbortError())),
                              signal?.aborted
                                  ? abortRequest()
                                  : (signal?.addEventListener("abort", abortRequest, {
                                        once: !0,
                                    }),
                                    request.send(JSON.stringify(payload)));
                      }))
                    : Promise.resolve({});
            })(snapshot.writeContext, tags, vote, signal);
        } catch (error) {
            if (["AbortError", "RequestBudgetError", "BadTagVoteLockedError"].includes(error.name))
                throw error;
            voteError = error;
        }
        return (
            await delay(RUNTIME_LIMITS.directVoteVerifyDelayMs, signal),
            {
                snapshot: await fetchGallerySnapshot(snapshot.url, signal),
                voteError: voteError,
            }
        );
    }
    async function correctBadTagRecord(record, signal) {
        const parsedUrl = new URL(record.galleryUrl),
            sameOriginUrl = `${location.origin}${parsedUrl.pathname}`;
        let snapshot = await fetchGallerySnapshot(sameOriginUrl, signal);
        if (snapshot.unavailable)
            return {
                status: "gallery-unavailable",
            };
        let voteState = getTagVoteState(snapshot.doc, record.tag);
        const strategy = getBadTagCorrectionStrategy(voteState);
        if ("already-downvoted" === strategy)
            return {
                status: "already-downvoted",
            };
        if ("already-missing" === strategy)
            return {
                status: "already-missing",
            };
        if (!snapshot.writeContext)
            return {
                status: "vote-api-unavailable",
            };
        let withdrewUpvote = !1;
        if ("withdraw-and-downvote" === strategy) {
            const withdrawResult = await submitTagVoteAndVerify(snapshot, [record.tag], -1, signal);
            if (((snapshot = withdrawResult.snapshot), snapshot.unavailable))
                return {
                    status: "gallery-unavailable",
                };
            if (((voteState = getTagVoteState(snapshot.doc, record.tag)), !voteState.exists))
                return {
                    status: "already-missing",
                };
            if (voteState.downvoted)
                return {
                    status: "withdrawn-and-downvoted",
                };
            if (voteState.upvoted)
                throw withdrawResult.voteError || new Error("撤销赞成票后状态没有变化");
            if (((withdrewUpvote = !0), !snapshot.writeContext))
                return {
                    status: "vote-api-unavailable",
                };
        }
        if (((voteState = getTagVoteState(snapshot.doc, record.tag)), !voteState.exists))
            return {
                status: "already-missing",
            };
        if (voteState.downvoted)
            return {
                status: withdrewUpvote ? "withdrawn-and-downvoted" : "already-downvoted",
            };
        const voteResult = await submitTagVoteAndVerify(snapshot, [record.tag], -1, signal);
        if (((snapshot = voteResult.snapshot), snapshot.unavailable))
            return {
                status: "gallery-unavailable",
            };
        if (((voteState = getTagVoteState(snapshot.doc, record.tag)), !voteState.exists))
            return {
                status: "already-missing",
            };
        if (!voteState.downvoted)
            throw voteResult.voteError || new Error("踩标签后未观察到反对票状态");
        return {
            status: withdrewUpvote ? "withdrawn-and-downvoted" : "downvoted",
        };
    }
    function isTerminalBadTagStatus(status) {
        return !0 === BAD_TAG_OUTCOME_META[status]?.terminal;
    }
    function logBadTagResult(level, record, message) {
        appendLog(level, `${record.gid} ${record.tag}：${message}`, record.galleryUrl);
    }
    async function processBadTags(config, signal, { reviewKnown: reviewKnown = !1 } = {}) {
        if (!config.badTagEnabled) return;
        if (!config.uid)
            return void appendLog("warn", "已启用错误标签检查，但脚本参数区尚未填写用户 UID");
        const repositoryUrl = `https://repo.e-hentai.org/tools/taglist?uid=${encodeURIComponent(config.uid)}&badtags=1`,
            html = await (async function (url, signal) {
                return withFetchRetry(
                    () =>
                        (function (url, signal) {
                            return (
                                consumeTrackedRequest("读取错误标签列表"),
                                new Promise((resolve, reject) => {
                                    if ("function" != typeof GM_xmlhttpRequest)
                                        return void reject(
                                            new Error("当前脚本管理器不支持 GM_xmlhttpRequest"),
                                        );
                                    let settled = !1;
                                    const request = GM_xmlhttpRequest({
                                        method: "GET",
                                        url: url,
                                        timeout: RUNTIME_LIMITS.fetchTimeoutMs,
                                        anonymous: !1,
                                        headers: {
                                            Accept: "text/html",
                                        },
                                        onload(response) {
                                            if (!settled) {
                                                if (
                                                    response.status < 200 ||
                                                    response.status >= 300
                                                ) {
                                                    const error = new Error(
                                                        `错误标签页 HTTP ${response.status}`,
                                                    );
                                                    return (
                                                        (error.status = response.status),
                                                        void rejectOnce(error)
                                                    );
                                                }
                                                (settled = !0),
                                                    cleanup(),
                                                    resolve(response.responseText);
                                            }
                                        },
                                        onerror(event) {
                                            const error = new Error("无法读取错误标签页");
                                            (error.name = "TypeError"),
                                                Number(event?.status) > 0 &&
                                                    (error.status = Number(event.status)),
                                                rejectOnce(error);
                                        },
                                        ontimeout() {
                                            const error = new Error(
                                                `读取错误标签页超时（${RUNTIME_LIMITS.fetchTimeoutMs / 1e3} 秒）`,
                                            );
                                            (error.name = "TimeoutError"), rejectOnce(error);
                                        },
                                        onabort() {
                                            rejectOnce(createAbortError());
                                        },
                                    });
                                    function cleanup() {
                                        signal?.removeEventListener("abort", abortRequest);
                                    }
                                    function rejectOnce(error) {
                                        settled || ((settled = !0), cleanup(), reject(error));
                                    }
                                    function abortRequest() {
                                        try {
                                            request.abort();
                                        } catch {
                                        } finally {
                                            rejectOnce(createAbortError());
                                        }
                                    }
                                    signal?.aborted
                                        ? abortRequest()
                                        : signal?.addEventListener("abort", abortRequest, {
                                              once: !0,
                                          });
                                })
                            );
                        })(url, signal),
                    signal,
                    "错误标签页读取失败",
                );
            })(repositoryUrl, signal),
            documentNode = new DOMParser().parseFromString(html, "text/html");
        if (!documentNode.querySelector("#usertaglist"))
            throw new Error("错误标签页结构异常或当前无法访问");
        const records = parseBadTagRecords(documentNode, repositoryUrl);
        let state = (function (uid) {
            try {
                const storedState = JSON.parse(
                    localStorage.getItem(BAD_TAG_STATE_STORAGE_KEY) || "null",
                );
                if (storedState?.uid === uid && Array.isArray(storedState.knownFingerprints))
                    return sanitizeBadTagState(storedState);
            } catch (error) {
                console.warn(`${LOG_PREFIX} 无法读取错误标签状态`, error);
            }
            return sanitizeBadTagState({}, uid);
        })(config.uid);
        const knownFingerprints = new Set(state.knownFingerprints),
            batch = selectBadTagBatch(records, state, reviewKnown);
        if (!batch.totalPending)
            return void appendLog("ok", `错误标签检查完成：${records.length} 条记录均已处理`);
        function markKnown(record) {
            knownFingerprints.add(badTagRecordFingerprint(record)),
                (state.knownFingerprints = Array.from(knownFingerprints)),
                (state = (function (state) {
                    const sanitizedState = sanitizeBadTagState(state);
                    return (
                        localStorage.setItem(
                            BAD_TAG_STATE_STORAGE_KEY,
                            JSON.stringify(sanitizedState),
                        ),
                        sanitizedState
                    );
                })(state));
        }
        appendLog(
            "warn",
            reviewKnown
                ? `重新检查 ${batch.totalPending} 条当前错误标签记录（本轮 ${batch.records.length} 条）`
                : `发现 ${batch.totalPending} 条待处理错误标签记录（本轮 ${batch.records.length} 条）`,
        );
        for (const record of batch.records) {
            if (signal.aborted) throw createAbortError();
            try {
                const result = await correctBadTagRecord(record, signal),
                    outcomeMeta = BAD_TAG_OUTCOME_META[result.status] || {
                        level: "warn",
                        message: `未知结果 ${result.status}`,
                    };
                isTerminalBadTagStatus(result.status) && markKnown(record),
                    logBadTagResult(outcomeMeta.level, record, outcomeMeta.message);
            } catch (error) {
                if (["AbortError", "RequestBudgetError"].includes(error.name)) throw error;
                "BadTagVoteLockedError" === error.name
                    ? (markKnown(record),
                      logBadTagResult("skip", record, "站点已锁定历史赞成票，无法撤销或改踩"))
                    : logBadTagResult("warn", record, `暂未处理：${error.message}`);
            }
            await randomDelay(
                RUNTIME_LIMITS.actionDelayMinMs,
                RUNTIME_LIMITS.actionDelayMaxMs,
                signal,
            );
        }
        const remaining = reviewKnown
            ? batch.remaining
            : selectBadTagRecords(records, state, !1).length;
        remaining && appendLog("info", `尚有 ${remaining} 条，将在后续周期继续处理`);
    }
    function isBadTagVoteLockedMessage(message) {
        return /vote can no longer be withdrawn/i.test(String(message || ""));
    }
    function findPendingTagsInDocument(documentNode, tags) {
        const tagMap = new Map(parseGalleryTags(documentNode).map((tag) => [tag.tag, tag]));
        return tags.filter((tag) => {
            const state = tagMap.get(tag);
            return !state || (!state.solid && !state.voted);
        });
    }
    function reconcileTagVoteBatch(documentNode, tags) {
        const failedTags = findPendingTagsInDocument(documentNode, tags);
        return {
            confirmed: tags.length - failedTags.length,
            failedTags: failedTags,
            shouldRetry: !1,
        };
    }
    async function transferTagsToTarget(target, transferContext) {
        const { current: current, union: union, config: config, signal: signal } = transferContext;
        appendLog("info", `处理 ${target.language}：${target.url}`);
        let snapshot = await fetchGallerySnapshot(target.url, signal);
        if (snapshot.unavailable || !snapshot.gallery)
            return (
                appendLog("warn", `写入前画廊已失效：${target.url}`),
                {
                    submitted: 0,
                    failed: union.length,
                }
            );
        const refreshedGallery = validateGallery(snapshot.gallery),
            assessment =
                target.url === current.url
                    ? {
                          accepted: !0,
                      }
                    : assessCandidate(current, refreshedGallery, config);
        if (!assessment.accepted)
            return (
                appendLog("skip", `写入前验证失败，跳过 ${target.url}（${assessment.reason}）`),
                {
                    submitted: 0,
                    failed: 0,
                }
            );
        const tagPlan = planTargetTags(union, refreshedGallery.tags);
        if (
            (appendLog(
                "info",
                `待迁移 ${tagPlan.pending.length}，已实线 ${tagPlan.skippedSolid}，已投票 ${tagPlan.skippedVoted}`,
            ),
            !tagPlan.pending.length)
        )
            return {
                submitted: 0,
                failed: 0,
            };
        const tagInput = snapshot.doc.querySelector("#newtagfield"),
            maxLength = tagInput?.maxLength > 0 ? tagInput.maxLength : 200,
            batches = buildTagBatches(tagPlan.pending, maxLength);
        let submitted = 0,
            failed = 0;
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            if (signal.aborted) throw createAbortError();
            const pendingTags = findPendingTagsInDocument(snapshot.doc, batches[batchIndex]);
            if (!pendingTags.length) continue;
            if (!snapshot.writeContext) {
                (failed += pendingTags.length),
                    appendLog("warn", `直连投票凭据不可用，未提交：${pendingTags.join(", ")}`);
                continue;
            }
            appendLog(
                "info",
                `直连提交 ${batchIndex + 1}/${batches.length}（${pendingTags.length} 个）`,
            );
            const voteResult = await submitTagVoteAndVerify(snapshot, pendingTags, 1, signal);
            snapshot = voteResult.snapshot;
            const reconciliation = snapshot.unavailable
                ? {
                      confirmed: 0,
                      failedTags: pendingTags,
                      shouldRetry: !1,
                  }
                : reconcileTagVoteBatch(snapshot.doc, pendingTags);
            if (
                ((submitted += reconciliation.confirmed),
                (failed += reconciliation.failedTags.length),
                reconciliation.failedTags.length)
            ) {
                const errorSuffix = voteResult.voteError ? `：${voteResult.voteError.message}` : "";
                appendLog(
                    "warn",
                    `写后复核仍未确认（本轮不重复投票）：${reconciliation.failedTags.join(", ")}${errorSuffix}`,
                );
            }
            batchIndex + 1 < batches.length &&
                (await randomDelay(
                    RUNTIME_LIMITS.actionDelayMinMs,
                    RUNTIME_LIMITS.actionDelayMaxMs,
                    signal,
                ));
        }
        return {
            submitted: submitted,
            failed: failed,
        };
    }
    async function executeTransferPlan(runId, currentGallery, config, signal) {
        if (
            (appendLog(
                "info",
                `种子：${currentGallery.language}，${currentGallery.pageCount} 页，${currentGallery.tags.length} 个标签`,
            ),
            currentGallery.pageCount < config.minGalleryPages)
        )
            return (
                appendLog("skip", `画廊少于 ${config.minGalleryPages} 页，跳过`),
                {
                    status: "short",
                    galleries: [currentGallery],
                    submitted: 0,
                    failed: 0,
                }
            );
        setStatus("搜索并验证其他语言版本");
        const candidates = await (async function (currentGallery, config, signal) {
            const queries = buildSearchQueries(currentGallery),
                candidatesByUrl = new Map(),
                sameLanguageUrls = new Set();
            async function runStage(stage) {
                for (const query of queries.filter((query) => query.stage === stage)) {
                    if (signal.aborted) throw createAbortError();
                    appendLog("info", `搜索 ${query.label}`);
                    try {
                        const searchResult = await fetchSearchQueryResults(
                            query,
                            config.maxSearchPages,
                            signal,
                            currentGallery,
                            config,
                        );
                        for (const candidate of searchResult.results) {
                            if (candidate.url === currentGallery.url) continue;
                            if (hasSameExplicitLanguage(currentGallery, candidate)) {
                                sameLanguageUrls.add(candidate.url);
                                continue;
                            }
                            const existingCandidate = candidatesByUrl.get(candidate.url);
                            existingCandidate
                                ? (existingCandidate.matchedQueries = Array.from(
                                      new Set([
                                          ...existingCandidate.matchedQueries,
                                          ...candidate.matchedQueries,
                                      ]),
                                  ))
                                : candidatesByUrl.set(candidate.url, candidate);
                        }
                    } catch (error) {
                        if (["AbortError", "RequestBudgetError"].includes(error.name)) throw error;
                        appendLog("warn", `搜索失败：${error.message}`);
                    }
                }
            }
            await runStage("english"),
                shouldRunJapaneseSearch(currentGallery, candidatesByUrl.values(), config) &&
                    (await runStage("japanese")),
                appendLog(
                    "info",
                    `搜索得到 ${candidatesByUrl.size} 个去重候选` +
                        (sameLanguageUrls.size
                            ? `，提前跳过同语言 ${sameLanguageUrls.size} 个`
                            : ""),
                );
            const previewCandidates = [];
            for (const candidate of candidatesByUrl.values()) {
                const assessment = assessCandidate(currentGallery, candidate, config);
                assessment.accepted
                    ? previewCandidates.push({
                          ...candidate,
                          assessment: assessment,
                      })
                    : appendLog(
                          "skip",
                          `拒绝：${truncateLogTitle(candidate.title)}（${assessment.reason}）`,
                      );
            }
            const detailCandidates = [];
            if ("newest" === config.transferDirection)
                detailCandidates.push(...previewCandidates),
                    appendLog(
                        "info",
                        `单向模式将完整读取 ${detailCandidates.length} 个初筛合规候选`,
                    );
            else {
                const candidatesByLanguage = new Map();
                for (const candidate of previewCandidates) {
                    const language = candidate.language || "unknown";
                    candidatesByLanguage.has(language) || candidatesByLanguage.set(language, []),
                        candidatesByLanguage.get(language).push(candidate);
                }
                for (const languageCandidates of candidatesByLanguage.values()) {
                    languageCandidates.sort(
                        (left, right) => right.assessment.score - left.assessment.score,
                    ),
                        detailCandidates.push(
                            ...languageCandidates.slice(
                                0,
                                RUNTIME_LIMITS.detailCandidatesPerLanguage,
                            ),
                        );
                    for (const candidate of languageCandidates.slice(
                        RUNTIME_LIMITS.detailCandidatesPerLanguage,
                    ))
                        appendLog(
                            "skip",
                            `暂不读取低分候选：${truncateLogTitle(candidate.title)}（评分 ${candidate.assessment.score}）`,
                        );
                }
            }
            const fullCandidates = [];
            for (const candidate of detailCandidates) {
                if (signal.aborted) throw createAbortError();
                try {
                    const gallery = parseGalleryDocument(
                        await fetchDocument(candidate.url, signal),
                        candidate.url,
                    );
                    if (
                        ((gallery.matchedQueries = candidate.matchedQueries),
                        !gallery.titleRefs.some(Boolean) || !Number.isInteger(gallery.pageCount))
                    )
                        throw new Error("画廊元数据不完整");
                    const assessment = assessCandidate(currentGallery, gallery, config);
                    assessment.accepted
                        ? gallery.language === currentGallery.language &&
                          "unknown" !== currentGallery.language
                            ? appendLog(
                                  "skip",
                                  `二次拒绝同语言：${truncateLogTitle(gallery.titleGn)}`,
                              )
                            : fullCandidates.push({
                                  ...gallery,
                                  assessment: assessment,
                              })
                        : appendLog(
                              "skip",
                              `二次拒绝：${truncateLogTitle(gallery.titleGn)}（${assessment.reason}）`,
                          );
                } catch (error) {
                    if (["AbortError", "RequestBudgetError"].includes(error.name)) throw error;
                    appendLog("warn", `无法读取候选 ${candidate.url}：${error.message}`);
                }
                await randomDelay(
                    RUNTIME_LIMITS.discoveryDelayMinMs,
                    RUNTIME_LIMITS.discoveryDelayMaxMs,
                    signal,
                );
            }
            const selection = selectTransferCandidates(
                fullCandidates,
                config.transferDirection,
                config.minCandidateScoreGap,
            );
            for (const candidate of selection.rejected)
                appendLog(
                    "skip",
                    `最终拒绝：${truncateLogTitle(candidate.titleGn)}（${candidate.rejectionReason}）`,
                );
            return selection.accepted;
        })(currentGallery, config, signal);
        if (!candidates.length)
            return (
                appendLog("skip", "没有通过完整复核的其他语言画廊"),
                {
                    status: "no-related",
                    galleries: [currentGallery],
                    submitted: 0,
                    failed: 0,
                }
            );
        for (const candidate of candidates)
            appendLog(
                "ok",
                `接受 ${candidate.language}：${candidate.pageCount} 页，${candidate.assessment.reason}`,
            );
        const galleries = [currentGallery, ...candidates],
            transferPlan = buildTransferPlan(galleries, config.transferDirection),
            tagUnion = buildTransferTagUnion(
                transferPlan.sources,
                config.mode,
                compileBlacklist(config.blacklist),
            );
        if (
            (transferPlan.newest &&
                appendLog(
                    "info",
                    `单向迁移：综合 ${transferPlan.sources.length} 个旧画廊 → 最新画廊 ${galleryIdFromUrl(transferPlan.newest.url)}`,
                ),
            appendLog(
                "info",
                `迁移集合 ${tagUnion.length} 个标签（${"solid" === config.mode ? "仅实线" : "全部"}；${transferPlan.targets.length} 个目标）`,
            ),
            !tagUnion.length)
        )
            return {
                status: "empty",
                galleries: galleries,
                submitted: 0,
                failed: 0,
            };
        let submitted = 0,
            failed = 0;
        const transferContext = {
            current: currentGallery,
            union: tagUnion,
            config: config,
            signal: signal,
        };
        for (let targetIndex = 0; targetIndex < transferPlan.targets.length; targetIndex++) {
            if (signal.aborted || runId !== runtimeState.runId) throw createAbortError();
            const target = transferPlan.targets[targetIndex];
            setStatus(`迁移 ${targetIndex + 1}/${transferPlan.targets.length}：${target.language}`);
            const result = await transferTagsToTarget(target, transferContext);
            (submitted += result.submitted), (failed += result.failed);
        }
        return (
            appendLog(
                failed ? "warn" : "ok",
                `迁移结束：确认 ${submitted} 个，未确认 ${failed} 个`,
            ),
            {
                status: failed ? "partial" : "completed",
                galleries: galleries,
                submitted: submitted,
                failed: failed,
            }
        );
    }
    function validateGallery(gallery) {
        if (
            !gallery.url ||
            !gallery.titleRefs.some(Boolean) ||
            !Number.isInteger(gallery.pageCount)
        )
            throw new Error("页面不是可识别的画廊页");
        return gallery;
    }
    async function processCurrentGallery(runId, config, signal) {
        setStatus("读取当前画廊");
        const currentGallery = validateGallery(parseGalleryDocument(document, location.href)),
            result = await executeTransferPlan(runId, currentGallery, config, signal);
        setStatus(
            "no-related" === result.status
                ? "完成：没有可迁移目标"
                : `完成：确认 ${result.submitted}，未确认 ${result.failed}`,
        );
    }
    async function processHomepage(runId, config, signal) {
        const scanResult = await (async function (config, signal) {
            let homeState = loadHomeState();
            if (!homeState.initializedAt) {
                const mergeResult = mergeHomepageResults(
                    homeState,
                    parseSearchResults(document, location.origin),
                    config,
                );
                return (
                    (homeState = saveHomeState(mergeResult.home)),
                    appendLog(
                        "info",
                        `主页基线已建立（${mergeResult.baselineCount} 个画廊），未回溯历史`,
                    ),
                    {
                        home: homeState,
                        initialized: !0,
                    }
                );
            }
            const seenGids = new Set(homeState.seenGids);
            let nextUrl = canonicalHomepageUrl(homeState.scanCursor) || `${location.origin}/`,
                savedCursor = "",
                reachedSeenGallery = !1;
            const results = [];
            for (let pageIndex = 0; pageIndex < config.homeScanPages && nextUrl; pageIndex++) {
                const documentNode = await fetchDocument(nextUrl, signal),
                    pageResults = parseSearchResults(documentNode, location.origin);
                if (
                    (results.push(...pageResults),
                    pageResults.some((result) => seenGids.has(galleryIdFromUrl(result.url))))
                ) {
                    reachedSeenGallery = !0;
                    break;
                }
                const nextHref = documentNode.querySelector("#dnext[href]")?.getAttribute("href");
                (savedCursor = canonicalHomepageUrl(
                    nextHref ? new URL(nextHref, nextUrl).href : "",
                )),
                    (nextUrl = savedCursor),
                    nextUrl &&
                        (await randomDelay(
                            RUNTIME_LIMITS.discoveryDelayMinMs,
                            RUNTIME_LIMITS.discoveryDelayMaxMs,
                            signal,
                        ));
            }
            const mergeResult = mergeHomepageResults(homeState, results, config);
            return (
                (homeState = mergeResult.home),
                (homeState.scanCursor = reachedSeenGallery ? "" : savedCursor),
                (homeState = saveHomeState(homeState)),
                appendLog(
                    mergeResult.queued ? "ok" : "skip",
                    `主页扫描：新增队列 ${mergeResult.queued}，短画廊跳过 ${mergeResult.skippedShort}`,
                ),
                homeState.scanCursor &&
                    appendLog("warn", "新增画廊超过本轮扫描上限，已保存翻页游标供下轮继续"),
                {
                    home: homeState,
                    initialized: !1,
                }
            );
        })(config, signal);
        if (scanResult.initialized) return void setStatus("主页基线已建立；等待新画廊");
        let homeState = scanResult.home;
        if (!findReadyHomeJob(homeState))
            return void setStatus(`主页扫描完成：队列 ${homeState.queue.length}`);
        let checkedCount = 0,
            writtenCount = 0;
        for (;;) {
            const job = findReadyHomeJob(homeState);
            if (!job) break;
            if (signal.aborted || runId !== runtimeState.runId) throw createAbortError();
            if (getRequestBudgetRemaining(runtimeState.requestBudget) < 6) {
                appendLog(
                    "info",
                    `剩余请求不足以安全开始下一个画廊，保留队列 ${homeState.queue.length}`,
                );
                break;
            }
            beginHomeJob(homeState, job.gid),
                setStatus(`主页连续任务 ${checkedCount + 1}：${job.gid}`);
            try {
                const gallery = validateGallery(
                        parseGalleryDocument(await fetchDocument(job.url, signal), job.url),
                    ),
                    result = await executeTransferPlan(runId, gallery, config, signal);
                checkedCount++;
                const disposition = getHomeJobDisposition(result);
                "retry" === disposition.action
                    ? ((homeState = retryHomeJob(homeState, job.gid, disposition.reason)),
                      appendLog("warn", `${job.gid} 将延迟重试：${disposition.reason}`))
                    : ((homeState = completeHomeGroup(homeState, result.galleries)),
                      result.submitted > 0 && writtenCount++,
                      disposition.reason &&
                          appendLog(
                              "skip",
                              `${job.gid} 已检查：${disposition.reason}，任务已移出队列`,
                          )),
                    (homeState = saveHomeState(homeState));
            } catch (error) {
                if ("AbortError" === error.name) throw error;
                if ("RequestBudgetError" === error.name) {
                    preserveHomeJobAfterBudget(homeState, job.gid),
                        appendLog("info", `${job.gid} 因本轮请求预算到达边界而保留，下一轮继续`);
                    break;
                }
                (homeState = retryHomeJob(homeState, job.gid, error)),
                    (homeState = saveHomeState(homeState)),
                    appendLog("warn", `${job.gid} 处理失败：${error.message}`);
            }
        }
        setStatus(
            `主页任务完成：检查 ${checkedCount}，写入 ${writtenCount}，队列 ${homeState.queue.length}`,
        );
    }
    function setStatus(message) {
        runtimeState.ui?.status && (runtimeState.ui.status.textContent = message);
    }
    function updateHomeSummary(homeState) {
        if (!runtimeState.ui?.homeSummary || "home" !== runtimeState.pageMode) return;
        const state = homeState || loadHomeState(),
            nextRunLabel =
                state.nextRunAt > Date.now()
                    ? new Date(state.nextRunAt).toLocaleTimeString()
                    : "未安排";
        runtimeState.ui.homeSummary.textContent = `队列 ${state.queue.length} · 已见 ${state.seenGids.length} · 下次 ${nextRunLabel}`;
    }
    function sanitizeLogUrl(url) {
        if (!url) return "";
        try {
            const parsedUrl = new URL(String(url), DEFAULT_ORIGIN);
            return ["http:", "https:"].includes(parsedUrl.protocol) ? parsedUrl.href : "";
        } catch {
            return "";
        }
    }
    function createLogEntry(level, message, galleryUrl = "", date = new Date()) {
        const timestamp = date instanceof Date ? date : new Date(date);
        return {
            timestamp: timestamp.toISOString(),
            localTime: timestamp.toLocaleTimeString(),
            level: String(level || "info"),
            message: String(message || ""),
            galleryUrl: sanitizeLogUrl(galleryUrl),
        };
    }
    function trimLogEntries(entries, limit = 1e3) {
        const maxEntries = Math.max(0, Math.floor(Number(limit) || 0));
        return (
            maxEntries
                ? entries.length > maxEntries && entries.splice(0, entries.length - maxEntries)
                : (entries.length = 0),
            entries
        );
    }
    function formatLogEntry(entry) {
        const url = sanitizeLogUrl(entry.galleryUrl);
        return `[${entry.timestamp}] [${String(entry.level || "info").toUpperCase()}] ${String(entry.message || "")}${url ? ` ${url}` : ""}`;
    }
    function buildLogExportText(
        entries,
        {
            version: version = SCRIPT_VERSION,
            site: site = "",
            exportedAt: exportedAt = new Date(),
        } = {},
    ) {
        const date = exportedAt instanceof Date ? exportedAt : new Date(exportedAt),
            origin = site || ("undefined" == typeof location ? "" : location.origin);
        return `\ufeff${["E-Hentai 跨语言画廊 Tag 迁移日志", `版本: ${version}`, `导出时间: ${date.toISOString()}`, `站点: ${origin || "未知"}`, `日志条数: ${entries.length}`, "", ...entries.map(formatLogEntry)].join("\r\n")}\r\n`;
    }
    function buildLogExportFilename(date = new Date()) {
        const normalizedDate = date instanceof Date ? date : new Date(date),
            pad = (value) => String(value).padStart(2, "0");
        return `eh-tag-transfer-log-${normalizedDate.getFullYear()}${pad(normalizedDate.getMonth() + 1)}${pad(normalizedDate.getDate())}-${pad(normalizedDate.getHours())}${pad(normalizedDate.getMinutes())}${pad(normalizedDate.getSeconds())}.txt`;
    }
    function exportLog() {
        const entries = runtimeState.logEntries.slice(),
            blob = new Blob([buildLogExportText(entries)], {
                type: "text/plain;charset=utf-8",
            }),
            objectUrl = URL.createObjectURL(blob),
            anchor = document.createElement("a");
        (anchor.hidden = !0),
            (anchor.href = objectUrl),
            (anchor.download = buildLogExportFilename()),
            document.body.appendChild(anchor),
            anchor.click(),
            anchor.remove(),
            setTimeout(() => URL.revokeObjectURL(objectUrl), 0),
            appendLog("ok", `已导出 ${entries.length} 条本页会话日志`);
    }
    function shouldDeferLogRender(visibilityState, minimized) {
        return "visible" !== visibilityState || !0 === minimized;
    }
    function createLogElement(entry) {
        const element = document.createElement("div");
        if (
            ((element.className = `ehtt-log-line ehtt-${entry.level}`),
            element.append(document.createTextNode(`${entry.localTime} ${entry.message}`)),
            entry.galleryUrl)
        ) {
            const link = document.createElement("a");
            (link.className = "ehtt-log-link"),
                (link.href = entry.galleryUrl),
                (link.target = "_blank"),
                (link.rel = "noopener noreferrer"),
                (link.textContent = entry.galleryUrl),
                element.append(document.createTextNode(" "), link);
        }
        return element;
    }
    function canRenderLogs() {
        return (
            Boolean(runtimeState.ui?.logEntries) &&
            !shouldDeferLogRender(
                document.visibilityState,
                runtimeState.ui.panel.classList.contains("ehtt-minimized"),
            )
        );
    }
    function renderLogEntries() {
        if (!runtimeState.ui?.logEntries) return;
        if (!canRenderLogs()) return void (runtimeState.logDomDirty = !0);
        const fragment = document.createDocumentFragment();
        for (const entry of runtimeState.logEntries.slice(-100))
            fragment.appendChild(createLogElement(entry));
        runtimeState.ui.logEntries.replaceChildren(fragment),
            (runtimeState.ui.logEntries.scrollTop = runtimeState.ui.logEntries.scrollHeight),
            (runtimeState.logDomDirty = !1);
    }
    function appendLog(level, message, galleryUrl = "") {
        const entry = createLogEntry(level, message, galleryUrl);
        if (
            (runtimeState.logEntries.push(entry),
            runtimeState.logEntries.length > 1e3 && trimLogEntries(runtimeState.logEntries),
            ("warn" !== level && "error" !== level) ||
                console[level](
                    `${LOG_PREFIX} ${entry.message}` +
                        (entry.galleryUrl ? ` ${entry.galleryUrl}` : ""),
                ),
            runtimeState.ui?.logEntries)
        )
            if (canRenderLogs()) {
                for (
                    runtimeState.ui.logEntries.appendChild(createLogElement(entry));
                    runtimeState.ui.logEntries.childElementCount > 100;

                )
                    runtimeState.ui.logEntries.firstElementChild?.remove();
                runtimeState.ui.logEntries.scrollTop = runtimeState.ui.logEntries.scrollHeight;
            } else runtimeState.logDomDirty = !0;
    }
    function clearScheduleTimer() {
        clearTimeout(runtimeState.scheduleTimer), (runtimeState.scheduleTimer = null);
    }
    function clearLifecycleTimer() {
        clearTimeout(runtimeState.lifecycleTimer), (runtimeState.lifecycleTimer = null);
    }
    function persistNextRunAt(nextRunAt) {
        if ("home" !== runtimeState.pageMode) return;
        const homeState = loadHomeState();
        (homeState.nextRunAt = Math.max(0, Number(nextRunAt) || 0)), saveHomeState(homeState);
    }
    function getScheduleState(nextRunAt, now = Date.now()) {
        const normalizedNextRunAt = Math.max(0, Number(nextRunAt) || 0);
        return normalizedNextRunAt ? (normalizedNextRunAt <= now ? "due" : "waiting") : "none";
    }
    function getPersistedNextRunAt() {
        if ("home" === runtimeState.pageMode) {
            const nextRunAt = loadHomeState().nextRunAt;
            if (nextRunAt) return nextRunAt;
        }
        return runtimeState.nextRunAt;
    }
    function scheduleNextRun(config, reuseExisting = !1, persist = !0) {
        if ((clearScheduleTimer(), !config.scheduleEnabled || runtimeState.schedulerPaused))
            return (runtimeState.nextRunAt = 0), void (persist && persistNextRunAt(0));
        let nextRunAt = reuseExisting ? getPersistedNextRunAt() : 0;
        if (nextRunAt <= Date.now()) {
            const intervalMs = 60 * config.scheduleMinutes * 1e3,
                jitter = 1 + (2 * Math.random() - 1) * RUNTIME_LIMITS.schedulerJitterRatio;
            nextRunAt = Date.now() + Math.max(6e4, Math.round(intervalMs * jitter));
        }
        runtimeState.nextRunAt = nextRunAt;
        const delayMs = Math.max(1e3, nextRunAt - Date.now());
        persist && persistNextRunAt(nextRunAt),
            (runtimeState.scheduleTimer = setTimeout(() => {
                (runtimeState.scheduleTimer = null), runWorker();
            }, delayMs)),
            appendLog("info", `下次周期运行约在 ${new Date(nextRunAt).toLocaleTimeString()}`),
            updateControlState();
    }
    function reconcileLifecycleState() {
        if (runtimeState.lifecycleSuspended) return;
        if (runtimeState.running) return void renewWorkerLock();
        if (runtimeState.autoTimer || runtimeState.schedulerPaused) return;
        const config = resolveConfig();
        if (runtimeState.waitingForRunOwner) {
            const marker = loadRunMarker(),
                owner = runtimeState.waitingForRunOwner;
            let lock = null;
            try {
                lock = loadWorkerLock();
            } catch (error) {
                console.warn(`${LOG_PREFIX} 无法读取跨标签页运行租约`, error);
            }
            const interruptedState = getInterruptedRunState(marker, owner, lock);
            if ("active" === interruptedState) return;
            if ("interrupted" === interruptedState)
                return (
                    (runtimeState.waitingForRunOwner = ""),
                    appendLog("warn", "检测到上次运行中断，正在恢复"),
                    void runWorker()
                );
            if (((runtimeState.waitingForRunOwner = ""), "home" !== runtimeState.pageMode))
                return void scheduleNextRun(config);
        }
        if (!config.scheduleEnabled) return;
        const scheduleState = getScheduleState(getPersistedNextRunAt());
        "due" === scheduleState
            ? (clearScheduleTimer(), runWorker())
            : "waiting" !== scheduleState ||
              runtimeState.scheduleTimer ||
              scheduleNextRun(config, !0, !1);
    }
    function scheduleLifecycleHeartbeat() {
        clearLifecycleTimer(),
            runtimeState.lifecycleSuspended ||
                (runtimeState.lifecycleTimer = setTimeout(() => {
                    (runtimeState.lifecycleTimer = null),
                        reconcileLifecycleState(),
                        scheduleLifecycleHeartbeat();
                }, RUNTIME_LIMITS.lifecycleHeartbeatMs));
    }
    function stopWorker(message, silent = !1, pauseScheduler = !1) {
        clearTimeout(runtimeState.autoTimer),
            (runtimeState.autoTimer = null),
            pauseScheduler &&
                ((runtimeState.schedulerPaused = !0),
                clearScheduleTimer(),
                (runtimeState.nextRunAt = 0),
                persistNextRunAt(0),
                clearRunMarker(runtimeState.workerLockOwner),
                (runtimeState.waitingForRunOwner = "")),
            runtimeState.runId++,
            runtimeState.controller?.abort(),
            (runtimeState.controller = null),
            (runtimeState.running = !1),
            silent || (setStatus(message), appendLog("warn", message)),
            updateControlState();
    }
    async function runWorker(options = {}) {
        if (runtimeState.running) return;
        clearScheduleTimer(), stopWorker("重新开始", !0, !1), (runtimeState.schedulerPaused = !1);
        const runId = runtimeState.runId,
            config = resolveConfig();
        (runtimeState.controller = new AbortController()), (runtimeState.running = !0);
        const owner = `${INSTANCE_ID}:${runId}`;
        let acquiredLock = !1;
        try {
            acquiredLock = (function (owner) {
                const now = Date.now();
                try {
                    if (isForeignWorkerLock(loadWorkerLock(), owner, now)) return !1;
                    saveWorkerLock(owner, now);
                    const acquired = loadWorkerLock()?.owner === owner;
                    return (runtimeState.workerLockOwner = acquired ? owner : ""), acquired;
                } catch (error) {
                    throw new Error(`无法建立跨标签页运行租约：${error.message}`);
                }
            })(owner);
        } catch (error) {
            return (
                (runtimeState.running = !1),
                (runtimeState.controller = null),
                setStatus(`失败：${error.message}`),
                appendLog("error", error.message),
                void updateControlState()
            );
        }
        if (!acquiredLock)
            return (
                (runtimeState.running = !1),
                (runtimeState.controller = null),
                setStatus("其他标签页正在运行，本轮跳过"),
                appendLog("skip", "其他标签页持有跨标签页运行租约"),
                (runtimeState.waitingForRunOwner = loadRunMarker()?.owner || ""),
                runtimeState.waitingForRunOwner || scheduleNextRun(config),
                void updateControlState()
            );
        !(function (owner) {
            try {
                localStorage.setItem(
                    RUN_MARKER_STORAGE_KEY,
                    JSON.stringify({
                        owner: owner,
                        startedAt: Date.now(),
                    }),
                );
            } catch (error) {
                console.warn(`${LOG_PREFIX} 无法保存运行标记`, error);
            }
        })(owner),
            (runtimeState.waitingForRunOwner = ""),
            (runtimeState.nextRunAt = 0),
            persistNextRunAt(0),
            (runtimeState.requestBudget =
                "home" === runtimeState.pageMode
                    ? createRequestBudget(config.homeRequestLimit)
                    : null),
            updateControlState(),
            appendLog("info", `开始运行 v${SCRIPT_VERSION}`);
        try {
            await (async function (runId, config, signal, options = {}) {
                if (options.reviewBadTags)
                    return (
                        setStatus("重新检查当前错误标签记录"),
                        await processBadTags(
                            {
                                ...config,
                                badTagEnabled: !0,
                            },
                            signal,
                            {
                                reviewKnown: !0,
                            },
                        ),
                        void setStatus("错误标签重新检查完成")
                    );
                for (const phase of NORMAL_RUN_PHASES)
                    if ("tag-transfer" === phase)
                        setRequestBudgetReserve(
                            runtimeState.requestBudget,
                            config.badTagEnabled ? 6 : 0,
                        ),
                            "home" === runtimeState.pageMode
                                ? await processHomepage(runId, config, signal)
                                : await processCurrentGallery(runId, config, signal),
                            setRequestBudgetReserve(runtimeState.requestBudget, 0);
                    else if (config.badTagEnabled) {
                        setStatus("检查待处理错误标签记录");
                        try {
                            await processBadTags(config, signal);
                        } catch (error) {
                            if ("AbortError" === error.name) throw error;
                            "RequestBudgetError" === error.name
                                ? appendLog("info", "本轮剩余请求不足，错误标签将在下一周期继续")
                                : appendLog("warn", `错误标签检查失败：${error.message}`);
                        }
                    }
            })(runId, config, runtimeState.controller.signal, options);
        } catch (error) {
            "AbortError" === error.name
                ? runId === runtimeState.runId && setStatus("已停止")
                : (appendLog("error", `运行失败：${error.message}`),
                  setStatus(`失败：${error.message}`));
        } finally {
            const budget = runtimeState.requestBudget;
            (runtimeState.requestBudget = null),
                runId === runtimeState.runId &&
                    ((runtimeState.running = !1),
                    (runtimeState.controller = null),
                    budget && appendLog("info", `本轮请求 ${budget.used}/${budget.limit}`),
                    updateControlState(),
                    scheduleNextRun(resolveConfig())),
                clearRunMarker(owner),
                releaseWorkerLock(owner);
        }
    }
    function updateControlState() {
        runtimeState.ui &&
            ((runtimeState.ui.stop.disabled =
                !runtimeState.running && !runtimeState.autoTimer && !runtimeState.scheduleTimer),
            (runtimeState.ui.restart.disabled = runtimeState.running),
            runtimeState.ui.reviewBadTags &&
                (runtimeState.ui.reviewBadTags.disabled = runtimeState.running));
    }
    function savePanelLayout() {
        if (!runtimeState.ui?.panel) return;
        const rect = runtimeState.ui.panel.getBoundingClientRect();
        try {
            localStorage.setItem(
                UI_STATE_STORAGE_KEY,
                JSON.stringify({
                    left: Math.round(rect.left),
                    top: Math.round(rect.top),
                    minimized: runtimeState.ui.panel.classList.contains("ehtt-minimized"),
                }),
            );
        } catch (error) {
            console.warn(`${LOG_PREFIX} 无法保存面板布局`, error);
        }
    }
    function constrainPanelToViewport(panel) {
        const rect = panel.getBoundingClientRect(),
            left = Math.max(0, Math.min(rect.left, Math.max(0, window.innerWidth - rect.width))),
            top = Math.max(0, Math.min(rect.top, Math.max(0, window.innerHeight - rect.height)));
        (panel.style.left = `${Math.round(left)}px`),
            (panel.style.top = `${Math.round(top)}px`),
            (panel.style.right = "auto");
    }
    function handleLifecycleSuspend() {
        runtimeState.lifecycleSuspended ||
            ((runtimeState.lifecycleSuspended = !0),
            (runtimeState.resumeRunAfterLifecycle =
                runtimeState.running || Boolean(runtimeState.autoTimer)),
            clearTimeout(runtimeState.autoTimer),
            (runtimeState.autoTimer = null),
            clearScheduleTimer(),
            clearLifecycleTimer(),
            runtimeState.runId++,
            runtimeState.controller?.abort(),
            (runtimeState.controller = null),
            (runtimeState.running = !1),
            (runtimeState.requestBudget = null),
            releaseWorkerLock(),
            updateControlState());
    }
    function shouldHandleLifecycleResume(eventType, visibilityState) {
        return "visibilitychange" !== eventType || "visible" === visibilityState;
    }
    function handleLifecycleResume(event) {
        if (!shouldHandleLifecycleResume(event?.type, document.visibilityState)) return;
        runtimeState.logDomDirty && renderLogEntries();
        const shouldResumeRun =
            runtimeState.lifecycleSuspended && runtimeState.resumeRunAfterLifecycle;
        (runtimeState.lifecycleSuspended = !1),
            (runtimeState.resumeRunAfterLifecycle = !1),
            scheduleLifecycleHeartbeat(),
            runtimeState.running
                ? renewWorkerLock()
                : !runtimeState.autoTimer && shouldResumeRun
                  ? runWorker()
                  : reconcileLifecycleState();
    }
    function initialize() {
        if (document.querySelector("#ehtt-panel")) return;
        if (
            ((runtimeState.pageMode = (function () {
                const searchParams = new URLSearchParams(location.search);
                return "/" === location.pathname &&
                    document.querySelector(".itg") &&
                    !["f_search", "next", "prev", "range"].some((parameterName) =>
                        searchParams.has(parameterName),
                    )
                    ? "home"
                    : document.querySelector("#gn") && document.querySelector("#taglist")
                      ? "gallery"
                      : "";
            })()),
            !runtimeState.pageMode)
        )
            return;
        !(function () {
            document.getElementById(STYLE_ELEMENT_ID)?.remove();
            const styleElement = document.createElement("style");
            (styleElement.id = STYLE_ELEMENT_ID),
                (styleElement.textContent =
                    '\n#ehtt-panel {\n    position: fixed;\n    top: 18px;\n    right: 18px;\n    z-index: 2147483646;\n    width: 352px;\n    max-height: calc(100vh - 36px);\n    overflow: hidden;\n    box-sizing: border-box;\n    border: 1px solid #8b7b70;\n    border-radius: 6px;\n    background: #f2f0e4;\n    color: #4f171b;\n    box-shadow: 0 5px 18px rgba(0, 0, 0, .22);\n    font: 12px/1.45 Arial, "Microsoft YaHei", sans-serif;\n    text-align: left;\n}\n#ehtt-panel * { box-sizing: border-box; }\n.ehtt-header {\n    display: flex;\n    align-items: center;\n    justify-content: space-between;\n    gap: 8px;\n    padding: 9px 10px;\n    border-bottom: 1px solid #b9aca1;\n    background: #e6e2d3;\n    cursor: move;\n    touch-action: none;\n    user-select: none;\n}\n.ehtt-title { font-size: 14px; font-weight: 700; }\n.ehtt-version { color: #725f57; font-size: 11px; }\n.ehtt-header-meta { display: flex; align-items: center; gap: 7px; }\n.ehtt-minimize {\n    width: 27px;\n    min-height: 24px !important;\n    padding: 0 !important;\n    line-height: 20px;\n}\n.ehtt-body {\n    max-height: calc(100vh - 78px);\n    overflow: auto;\n}\n#ehtt-panel.ehtt-minimized {\n    width: 238px;\n    max-height: none;\n}\n#ehtt-panel.ehtt-minimized .ehtt-header { border-bottom: 0; }\n#ehtt-panel.ehtt-minimized .ehtt-body { display: none; }\n.ehtt-controls {\n    display: grid;\n    grid-template-columns: 1fr 1fr;\n    gap: 7px;\n    padding: 9px 10px;\n}\n#ehtt-panel button {\n    min-width: 0;\n    border: 1px solid #9c8e83;\n    border-radius: 4px;\n    background: #fffef8;\n    color: #3f2224;\n    font: inherit;\n}\n#ehtt-panel button {\n    min-height: 31px;\n    padding: 5px 9px;\n    cursor: pointer;\n    font-weight: 700;\n}\n#ehtt-panel button:disabled { cursor: default; opacity: .52; }\n#ehtt-stop { background: #8f2931 !important; border-color: #741d24 !important; color: #fff !important; }\n#ehtt-restart { background: #315d45 !important; border-color: #244b36 !important; color: #fff !important; }\n.ehtt-log {\n    height: 230px;\n    display: flex;\n    flex-direction: column;\n    background: #252729;\n    color: #e5e5e5;\n    font: 11px/1.45 Consolas, monospace;\n}\n.ehtt-log-overview {\n    flex: none;\n    padding: 7px 9px;\n    border-bottom: 1px solid #4b4d50;\n    background: #1f2123;\n}\n.ehtt-status { color: #91d6a8; font-weight: 700; }\n.ehtt-home-summary { margin-top: 2px; color: #b8b8b8; }\n.ehtt-log-entries {\n    flex: 1;\n    min-height: 0;\n    overflow: auto;\n    padding: 7px 9px;\n}\n.ehtt-log-line { margin: 0 0 3px; overflow-wrap: anywhere; }\n.ehtt-log-link { color: inherit; text-decoration: underline; }\n.ehtt-ok { color: #91d6a8; }\n.ehtt-warn { color: #ffd27d; }\n.ehtt-error { color: #ff8f8f; }\n.ehtt-skip { color: #b8b8b8; }\n        '),
                document.head.appendChild(styleElement);
            const panel = document.createElement("section");
            (panel.id = "ehtt-panel"),
                (panel.innerHTML = `\n<div class="ehtt-header">\n    <span class="ehtt-title">跨语言 Tag 迁移</span>\n    <span class="ehtt-header-meta">\n        <span class="ehtt-version">wakuwaku · ${SCRIPT_VERSION}</span>\n        <button class="ehtt-minimize" id="ehtt-minimize" type="button" title="最小化">−</button>\n    </span>\n</div>\n<div class="ehtt-body">\n    <div class="ehtt-controls">\n        <button type="button" id="ehtt-stop">停止</button>\n        <button type="button" id="ehtt-restart">重新开始</button>\n        <button type="button" id="ehtt-review-badtags">重新检查错误标签</button>\n        <button type="button" id="ehtt-export-log">导出日志 TXT</button>\n    </div>\n    <div class="ehtt-log" id="ehtt-log">\n        <div class="ehtt-log-overview">\n            <div class="ehtt-status" id="ehtt-status">即将自动开始</div>\n            <div class="ehtt-home-summary" id="ehtt-home-summary" hidden></div>\n        </div>\n        <div class="ehtt-log-entries" id="ehtt-log-entries"></div>\n    </div>\n</div>\n        `),
                document.body.appendChild(panel);
            const storedLayout = (function () {
                try {
                    const storedLayout = JSON.parse(
                        localStorage.getItem(UI_STATE_STORAGE_KEY) || "null",
                    );
                    return {
                        left: Number.isFinite(storedLayout?.left) ? storedLayout.left : null,
                        top: Number.isFinite(storedLayout?.top) ? storedLayout.top : 18,
                        minimized: !0 === storedLayout?.minimized,
                    };
                } catch (error) {
                    return (
                        console.warn(`${LOG_PREFIX} 无法读取面板布局`, error),
                        {
                            left: null,
                            top: 18,
                            minimized: !1,
                        }
                    );
                }
            })();
            (runtimeState.ui = {
                panel: panel,
                header: panel.querySelector(".ehtt-header"),
                minimize: panel.querySelector("#ehtt-minimize"),
                status: panel.querySelector("#ehtt-status"),
                homeSummary: panel.querySelector("#ehtt-home-summary"),
                stop: panel.querySelector("#ehtt-stop"),
                restart: panel.querySelector("#ehtt-restart"),
                reviewBadTags: panel.querySelector("#ehtt-review-badtags"),
                exportLog: panel.querySelector("#ehtt-export-log"),
                logEntries: panel.querySelector("#ehtt-log-entries"),
            }),
                (runtimeState.ui.homeSummary.hidden = "home" !== runtimeState.pageMode),
                updateHomeSummary(),
                storedLayout.minimized && panel.classList.add("ehtt-minimized"),
                (runtimeState.ui.minimize.textContent = storedLayout.minimized ? "+" : "−"),
                (runtimeState.ui.minimize.title = storedLayout.minimized ? "展开" : "最小化"),
                null !== storedLayout.left &&
                    ((panel.style.left = `${storedLayout.left}px`),
                    (panel.style.top = `${storedLayout.top}px`),
                    (panel.style.right = "auto"),
                    requestAnimationFrame(() => constrainPanelToViewport(panel))),
                (function (panel, dragHandle) {
                    let dragState = null;
                    function finishDrag(event) {
                        dragState &&
                            dragState.pointerId === event.pointerId &&
                            ((dragState = null),
                            dragHandle.releasePointerCapture?.(event.pointerId),
                            savePanelLayout());
                    }
                    dragHandle.addEventListener("pointerdown", (event) => {
                        if (0 !== event.button || event.target.closest("button")) return;
                        const rect = panel.getBoundingClientRect();
                        (panel.style.left = `${rect.left}px`),
                            (panel.style.top = `${rect.top}px`),
                            (panel.style.right = "auto"),
                            (dragState = {
                                pointerId: event.pointerId,
                                offsetX: event.clientX - rect.left,
                                offsetY: event.clientY - rect.top,
                            }),
                            dragHandle.setPointerCapture?.(event.pointerId),
                            event.preventDefault();
                    }),
                        dragHandle.addEventListener("pointermove", (event) => {
                            if (!dragState || dragState.pointerId !== event.pointerId) return;
                            const panelWidth = panel.offsetWidth,
                                panelHeight = panel.offsetHeight,
                                left = Math.max(
                                    0,
                                    Math.min(
                                        event.clientX - dragState.offsetX,
                                        window.innerWidth - panelWidth,
                                    ),
                                ),
                                top = Math.max(
                                    0,
                                    Math.min(
                                        event.clientY - dragState.offsetY,
                                        window.innerHeight - panelHeight,
                                    ),
                                );
                            (panel.style.left = `${Math.round(left)}px`),
                                (panel.style.top = `${Math.round(top)}px`);
                        }),
                        dragHandle.addEventListener("pointerup", finishDrag),
                        dragHandle.addEventListener("pointercancel", finishDrag);
                })(panel, runtimeState.ui.header),
                runtimeState.ui.minimize.addEventListener("click", () => {
                    const minimized = panel.classList.toggle("ehtt-minimized");
                    (runtimeState.ui.minimize.textContent = minimized ? "+" : "−"),
                        (runtimeState.ui.minimize.title = minimized ? "展开" : "最小化"),
                        constrainPanelToViewport(panel),
                        savePanelLayout(),
                        !minimized && runtimeState.logDomDirty && renderLogEntries();
                });
            let resizeFrameId = 0;
            window.addEventListener("resize", () => {
                cancelAnimationFrame(resizeFrameId),
                    (resizeFrameId = requestAnimationFrame(() => {
                        (resizeFrameId = 0), constrainPanelToViewport(panel), savePanelLayout();
                    }));
            }),
                runtimeState.ui.stop.addEventListener("click", () =>
                    stopWorker("用户已停止；周期运行已暂停", !1, !0),
                ),
                runtimeState.ui.restart.addEventListener("click", () => runWorker()),
                runtimeState.ui.reviewBadTags.addEventListener("click", () =>
                    runWorker({
                        reviewBadTags: !0,
                    }),
                ),
                runtimeState.ui.exportLog.addEventListener("click", exportLog),
                updateControlState();
        })();
        const config = resolveConfig(),
            homeState = "home" === runtimeState.pageMode ? loadHomeState() : null;
        (runtimeState.nextRunAt = homeState?.nextRunAt || 0),
            scheduleLifecycleHeartbeat(),
            "home" === runtimeState.pageMode &&
            homeState.initializedAt &&
            config.scheduleEnabled &&
            homeState.nextRunAt > Date.now()
                ? (setStatus("等待下一次主页扫描"), scheduleNextRun(config, !0, !1))
                : (runtimeState.autoTimer = setTimeout(() => {
                      (runtimeState.autoTimer = null), runWorker();
                  }, RUNTIME_LIMITS.autoStartDelayMs)),
            document.addEventListener("visibilitychange", handleLifecycleResume),
            document.addEventListener("freeze", handleLifecycleSuspend),
            document.addEventListener("resume", handleLifecycleResume),
            window.addEventListener("pageshow", handleLifecycleResume),
            window.addEventListener("focus", handleLifecycleResume),
            window.addEventListener("beforeunload", handleLifecycleSuspend),
            window.addEventListener("pagehide", handleLifecycleSuspend),
            updateControlState();
    }
    const CORE = {
        SCRIPT_PARAMETERS: SCRIPT_PARAMETERS,
        NORMAL_RUN_PHASES: NORMAL_RUN_PHASES,
        WRITE_TRANSPORT: "direct-xhr-verified",
        UI_LOG_ORDER: UI_LOG_ORDER,
        DEFAULT_CONFIG: DEFAULT_CONFIG,
        sanitizeConfig: sanitizeConfig,
        resolveConfig: resolveConfig,
        normalizeComparableTitle: normalizeComparableTitle,
        levenshteinDistance: levenshteinDistance,
        titleDistanceRatio: titleDistanceRatio,
        compareTitleSets: compareTitleSets,
        extractChapterSuffix: extractChapterSuffix,
        compareChapterSets: compareChapterSets,
        compareTitleContext: compareTitleContext,
        canonicalGalleryUrl: canonicalGalleryUrl,
        galleryIdFromUrl: galleryIdFromUrl,
        parsePageCount: parsePageCount,
        findSearchResultPageCount: findSearchResultPageCount,
        parseGalleryPostedAt: parseGalleryPostedAt,
        normalizeTag: normalizeTag,
        getExplicitLanguage: getExplicitLanguage,
        classifyLanguage: classifyLanguage,
        hasSameExplicitLanguage: hasSameExplicitLanguage,
        assessCandidate: assessCandidate,
        parseTitleIdentity: parseTitleIdentity,
        creatorTagSets: creatorTagSets,
        buildSearchQueries: buildSearchQueries,
        buildSearchUrl: buildSearchUrl,
        shouldContinueSearchPages: shouldContinueSearchPages,
        shouldRunJapaneseSearch: shouldRunJapaneseSearch,
        isStrongPreviewCandidate: isStrongPreviewCandidate,
        getSearchWaitMs: getSearchWaitMs,
        delay: delay,
        parseSearchResults: parseSearchResults,
        selectBestLanguageCandidates: selectBestLanguageCandidates,
        selectTransferCandidates: selectTransferCandidates,
        parseBadTagRecords: parseBadTagRecords,
        badTagRecordFingerprint: badTagRecordFingerprint,
        readInlineScriptAssignment: readInlineScriptAssignment,
        isTrustedTagApiUrl: isTrustedTagApiUrl,
        parseGalleryWriteContext: parseGalleryWriteContext,
        buildTagGalleryPayload: buildTagGalleryPayload,
        isUsableGalleryDocument: isUsableGalleryDocument,
        sanitizeBadTagState: sanitizeBadTagState,
        selectBadTagRecords: selectBadTagRecords,
        selectBadTagBatch: selectBadTagBatch,
        getBadTagCorrectionStrategy: getBadTagCorrectionStrategy,
        isUnavailableGalleryStatus: isUnavailableGalleryStatus,
        isTerminalBadTagStatus: isTerminalBadTagStatus,
        isBadTagVoteLockedMessage: isBadTagVoteLockedMessage,
        createLogEntry: createLogEntry,
        trimLogEntries: trimLogEntries,
        formatLogEntry: formatLogEntry,
        buildLogExportText: buildLogExportText,
        buildLogExportFilename: buildLogExportFilename,
        shouldDeferLogRender: shouldDeferLogRender,
        sanitizeHomeState: sanitizeHomeState,
        mergeHomepageResults: mergeHomepageResults,
        findReadyHomeJob: findReadyHomeJob,
        beginHomeJob: beginHomeJob,
        retryHomeJob: retryHomeJob,
        preserveHomeJobAfterBudget: preserveHomeJobAfterBudget,
        completeHomeGroup: completeHomeGroup,
        getHomeJobDisposition: getHomeJobDisposition,
        getScheduleState: getScheduleState,
        shouldHandleLifecycleResume: shouldHandleLifecycleResume,
        isForeignWorkerLock: isForeignWorkerLock,
        getInterruptedRunState: getInterruptedRunState,
        createRequestBudget: createRequestBudget,
        setRequestBudgetReserve: setRequestBudgetReserve,
        getRequestBudgetRemaining: getRequestBudgetRemaining,
        consumeRequestBudget: consumeRequestBudget,
        isRetryableFetchError: isRetryableFetchError,
        compileBlacklist: compileBlacklist,
        isBlacklisted: isBlacklisted,
        buildTransferTagUnion: buildTransferTagUnion,
        selectNewestGallery: selectNewestGallery,
        buildTransferPlan: buildTransferPlan,
        planTargetTags: planTargetTags,
        buildTagBatches: buildTagBatches,
        reconcileTagVoteBatch: reconcileTagVoteBatch,
    };
    "undefined" != typeof module && module.exports && (module.exports = CORE),
        "undefined" != typeof window &&
            "undefined" != typeof document &&
            ("loading" === document.readyState
                ? document.addEventListener("DOMContentLoaded", initialize, {
                      once: !0,
                  })
                : initialize());
})();
