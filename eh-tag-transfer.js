// ==UserScript==
// @name         E-Hentai 跨语言画廊 Tag 迁移
// @namespace    eh-tag-transfer
// @version      0.2.5.0
// @description  在详情页或 E-Hentai/ExHentai 主页发现同作品画廊，迁移时随机少量省略标签、按明确标题补充 uncensored 并纠正错误投票
// @author       reina
// @match        https://e-hentai.org/
// @match        https://e-hentai.org/g/*/*
// @match        https://exhentai.org/
// @match        https://exhentai.org/g/*/*
// @icon         https://e-hentai.org/favicon.ico
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @connect      repo.e-hentai.org
// @noframes
// @run-at       document-end
// ==/UserScript==

const DEFAULT_BLACKLIST = [
    'language:*',
    'reclass:*',
    'extraneous ads',
    'full color',
    'full censorship',
    'mosaic censorship',
    'scanmark',
    'watermarked',
    'other:multipanel sequence',
    'big ass',
    'x-ray',
    'rough translation',
    'original',
    'kissing',
    'handjob',
    'big breasts',
    'blowjob',
    'paizuri',
    'nakadashi',
    'swimsuit'
].join('\n');

// 直接修改这里的参数；面板和 localStorage 不会覆盖这些值。
const SCRIPT_PARAMETERS = Object.freeze({
    mode: 'solid', // 标签范围：solid 仅迁移实线标签，all 迁移全部标签。
    transferDirection: 'newest', // 迁移方向：newest 仅旧画廊到最新画廊，all 各版本互相补全。
    randomTagSkipEnabled: true, // 随机少迁移标签：true 每个任务随机省略部分待迁移标签。
    randomTagSkipMin: 0, // 随机省略最少数量：允许为 0，同一任务所有目标共享结果。
    randomTagSkipMax: 3, // 随机省略最多数量：实际至少保留一个可迁移标签。
    maxSearchPages: 1, // 搜索翻页上限：每个标题查询最多读取的结果页数。
    searchRequestIntervalMs: 3000, // 搜索请求间隔（毫秒）：不得低于站点限制的 3000 毫秒。
    maxPageDifference: 3, // 最大页数差：候选与当前画廊允许相差的页数。
    maxTitleDistanceRatio: 0.34, // 标题距离阈值：标题规范化后的最大差异比例。
    minCandidateScoreGap: 8, // 候选最低分差：前两名低于此差值时保持歧义。
    genericTitleLength: 15, // 短标题长度：不高于此长度时要求额外作者或社团证据。
    minGalleryPages: 10, // 画廊最少页数：低于此页数时跳过迁移。
    homeScanPages: 3, // 主页扫描页数：每轮最多扫描的主页列表页数。
    homeRequestLimit: 120, // 每轮请求上限：达到上限后安全停止并保留任务。
    scheduleEnabled: true, // 周期运行：true 默认自动周期运行，false 只在页面加载时运行一次。
    scheduleMinutes: 3, // 周期（分钟）：每轮完成后等待的基础时间。
    scheduleStartTime: '14:00', // 定时运行开始时间：浏览器本地 HH:mm；与结束时间相同表示全天。
    scheduleEndTime: '22:00', // 定时运行结束时间：浏览器本地 HH:mm；支持跨午夜时间窗。
    scheduleTimeJitterMinutes: 60, // 定时启停波动（分钟）：每天分别随机偏移开始与结束时间。
    badTagEnabled: true, // 检查错误标签：true 每轮检查，false 仅在手动复查时检查。
    uid: '7647802', // 用户 UID：用于读取 Repository 的错误标签记录。
    blacklist: DEFAULT_BLACKLIST // 标签黑名单：每行或逗号分隔，支持 * 通配符和 # 注释。
});

function createEhTagTransferModule() {
    "use strict";
    // 1. 配置与运行状态
    const SCRIPT_VERSION = "0.2.5.0",
        LOG_PREFIX = "[跨语言 Tag 迁移]",
        LEGACY_UI_STATE_STORAGE_KEY = "reina.ehTagTransfer.ui.v1",
        BAD_TAG_STATE_STORAGE_KEY = "reina.ehTagTransfer.badTags.v3",
        HOME_STATE_STORAGE_KEY = "reina.ehTagTransfer.home.v1",
        NO_RELATED_GALLERIES_REASON = "尚未找到其他语言版本",
        WORKER_LOCK_STORAGE_KEY = "reina.ehTagTransfer.workerLock.v1",
        RUN_MARKER_STORAGE_KEY = "reina.ehTagTransfer.runMarker.v1",
        GLOBAL_PAUSE_STORAGE_KEY = "reina.ehTagTransfer.globalPause.v1",
        VERSION_STATE_STORAGE_KEY = "reina.ehTagTransfer.version.v1",
        STYLE_ELEMENT_ID = "ehtt-style",
        VISIBLE_LOG_LIMIT = 20,
        SENSITIVE_UNCENSORED_TAG = "other:uncensored",
        POSITIVE_CORRECTION_MARKERS = Object.freeze([
            "uncensored",
            "decensored",
            "无修正",
            "無修正",
            "无码",
            "無碼",
            "去码",
            "去碼",
            "무수정",
        ]),
        NEGATIVE_CORRECTION_MARKERS = Object.freeze([
            "censored",
            "有修正",
            "有码",
            "有碼",
            "修正",
            "モザイク",
            "검열",
            "모자이크",
        ]),
        SEARCH_PHASES = Object.freeze({
            discovery: "发现",
            prefilter: "预筛",
            progressiveDetails: "渐进详情",
            finalSelection: "最终选择",
        }),
        BAD_TAG_OUTCOME_META = Object.freeze({
            "withdrawn-and-downvoted": {
                level: "ok",
                message: "已撤销赞成票并踩",
                terminal: true,
            },
            downvoted: {
                level: "ok",
                message: "已踩",
                terminal: true,
            },
            "already-downvoted": {
                level: "skip",
                message: "此前已经踩过",
                terminal: true,
            },
            "already-missing": {
                level: "skip",
                message: "标签已不存在，已跳过",
                terminal: true,
            },
            "gallery-unavailable": {
                level: "skip",
                message: "画廊已失效，已跳过",
                terminal: true,
            },
            "vote-api-unavailable": {
                level: "warn",
                message: "页面投票接口暂不可用，将在后续周期重试",
                terminal: false,
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
            fetchTimeoutMs: 30_000,
            fetchMaxAttempts: 3,
            fetchRetryBaseMs: 1_000,
            fetchRetryMaxMs: 5_000,
            directVoteVerifyDelayMs: 350,
            actionDelayMinMs: 900,
            actionDelayMaxMs: 1600,
            discoveryDelayMinMs: 250,
            discoveryDelayMaxMs: 500,
            detailCandidatesPerLanguage: 3,
            badTagRecordsPerRun: 10,
            schedulerJitterRatio: 0.1,
            lifecycleHeartbeatMs: 30_000,
            workerLockMs: 120_000,
            homeSeenLimit: 5_000,
        }),
        runtimeState = {
            runId: 0,
            running: false,
            controller: null,
            autoTimer: null,
            scheduleTimer: null,
            schedulerPaused: false,
            pageMode: "gallery",
            requestBudget: null,
            workerLockOwner: "",
            nextRunAt: 0,
            scheduleWindow: null,
            manualRun: false,
            scheduleBoundaryReached: false,
            loggedScheduleWindowKey: "",
            lifecycleTimer: null,
            lifecycleSuspended: false,
            resumeRunAfterLifecycle: false,
            waitingForRunOwner: "",
            lastSearchRequestAt: 0,
            logEntries: [],
            correctionLogKeys: new Set(),
            badTagAudit: null,
            logDomDirty: false,
            globallyPaused: false,
            ui: null,
        },
        titleIdentityCache = new WeakMap(),
        gallerySnapshotCache = new WeakMap(),
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
    function parseScheduleMinutes(value) {
        const match = String(value || "")
            .trim()
            .match(/^([01]\d|2[0-3]):([0-5]\d)$/u);
        return match ? Number(match[1]) * 60 + Number(match[2]) : null;
    }
    function normalizeScheduleTime(value, fallback) {
        return parseScheduleMinutes(value) === null ? fallback : String(value).trim();
    }
    function sanitizeConfig(inputConfig = {}) {
        const sanitizedUid = String(inputConfig.uid ?? "")
            .replace(/\D/g, "")
            .slice(0, 12),
            requestedRandomTagSkipMin = clampInteger(
                inputConfig.randomTagSkipMin,
                DEFAULT_CONFIG.randomTagSkipMin,
                0,
                1_000,
            ),
            requestedRandomTagSkipMax = clampInteger(
                inputConfig.randomTagSkipMax,
                DEFAULT_CONFIG.randomTagSkipMax,
                0,
                1_000,
            );
        return {
            mode: inputConfig.mode === "all" ? "all" : DEFAULT_CONFIG.mode,
            transferDirection:
                inputConfig.transferDirection === "all" ? "all" : DEFAULT_CONFIG.transferDirection,
            randomTagSkipEnabled:
                inputConfig.randomTagSkipEnabled == null
                    ? DEFAULT_CONFIG.randomTagSkipEnabled
                    : inputConfig.randomTagSkipEnabled === true,
            randomTagSkipMin: Math.min(requestedRandomTagSkipMin, requestedRandomTagSkipMax),
            randomTagSkipMax: Math.max(requestedRandomTagSkipMin, requestedRandomTagSkipMax),
            maxSearchPages: clampInteger(
                inputConfig.maxSearchPages,
                DEFAULT_CONFIG.maxSearchPages,
                1,
                5,
            ),
            searchRequestIntervalMs: clampInteger(
                inputConfig.searchRequestIntervalMs,
                DEFAULT_CONFIG.searchRequestIntervalMs,
                3_000,
                60_000,
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
                1_000,
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
                inputConfig.scheduleEnabled == null
                    ? DEFAULT_CONFIG.scheduleEnabled
                    : inputConfig.scheduleEnabled === true,
            scheduleMinutes: clampInteger(
                inputConfig.scheduleMinutes,
                DEFAULT_CONFIG.scheduleMinutes,
                3,
                1440,
            ),
            scheduleStartTime: normalizeScheduleTime(
                inputConfig.scheduleStartTime,
                DEFAULT_CONFIG.scheduleStartTime,
            ),
            scheduleEndTime: normalizeScheduleTime(
                inputConfig.scheduleEndTime,
                DEFAULT_CONFIG.scheduleEndTime,
            ),
            scheduleTimeJitterMinutes: clampInteger(
                inputConfig.scheduleTimeJitterMinutes,
                DEFAULT_CONFIG.scheduleTimeJitterMinutes,
                0,
                720,
            ),
            badTagEnabled:
                inputConfig.badTagEnabled == null
                    ? DEFAULT_CONFIG.badTagEnabled
                    : inputConfig.badTagEnabled === true,
            uid: sanitizedUid,
            blacklist:
                typeof inputConfig.blacklist === "string"
                    ? inputConfig.blacklist
                    : DEFAULT_CONFIG.blacklist,
        };
    }
    function resolveConfig() {
        return sanitizeConfig(SCRIPT_PARAMETERS);
    }
    function sanitizeGlobalPauseState(value) {
        if (value === true) return { paused: true, changedAt: 0 };
        return {
            paused: value?.paused === true,
            changedAt: Math.max(0, Number(value?.changedAt) || 0),
        };
    }
    function readGlobalPauseState() {
        try {
            return sanitizeGlobalPauseState(GM_getValue(GLOBAL_PAUSE_STORAGE_KEY, null));
        } catch (error) {
            console.warn(`${LOG_PREFIX} 无法读取全局停止状态`, error);
            return sanitizeGlobalPauseState(null);
        }
    }
    function writeGlobalPauseState(paused) {
        const state = { paused: paused === true, changedAt: Date.now() };
        try {
            GM_setValue(GLOBAL_PAUSE_STORAGE_KEY, state);
        } catch (error) {
            throw new Error(`无法保存全局停止状态：${error.message}`);
        }
        return state;
    }
    function planVersionStateReset(inputState, currentVersion, origin) {
        const version = String(currentVersion || ""),
            normalizedOrigin = String(origin || ""),
            previousVersion = String(inputState?.version || ""),
            versionChanged = previousVersion !== version,
            previousOrigins = versionChanged
                ? []
                : Array.from(
                      new Set(
                          (Array.isArray(inputState?.resetOrigins)
                              ? inputState.resetOrigins
                              : []
                          ).map(String),
                      ),
                  ),
            shouldResetOrigin = Boolean(
                normalizedOrigin && !previousOrigins.includes(normalizedOrigin),
            ),
            resetOrigins = shouldResetOrigin
                ? [...previousOrigins, normalizedOrigin]
                : previousOrigins;
        return {
            state: { version: version, resetOrigins: resetOrigins },
            shouldResetOrigin: shouldResetOrigin,
            shouldClearGlobalPause: versionChanged,
        };
    }
    function applyVersionStateReset() {
        let storedState = null;
        try {
            storedState = GM_getValue(VERSION_STATE_STORAGE_KEY, null);
        } catch (error) {
            console.warn(`${LOG_PREFIX} 无法读取版本状态`, error);
        }

        const resetPlan = planVersionStateReset(
            storedState,
            SCRIPT_VERSION,
            getCurrentOrigin(),
        );
        if (resetPlan.shouldResetOrigin) {
            for (const storageKey of [
                HOME_STATE_STORAGE_KEY,
                WORKER_LOCK_STORAGE_KEY,
                RUN_MARKER_STORAGE_KEY,
                LEGACY_UI_STATE_STORAGE_KEY,
            ]) {
                localStorage.removeItem(storageKey);
            }
        }
        if (resetPlan.shouldClearGlobalPause) {
            try {
                writeGlobalPauseState(false);
            } catch (error) {
                console.warn(`${LOG_PREFIX} 无法在版本更新后解除全局停止`, error);
            }
        }
        try {
            GM_setValue(VERSION_STATE_STORAGE_KEY, resetPlan.state);
        } catch (error) {
            console.warn(`${LOG_PREFIX} 无法保存版本状态`, error);
        }
        return resetPlan;
    }
    // 2. 持久状态、预算与跨标签页协调
    function galleryIdFromUrl(url) {
        return String(url || "").match(/\/g\/(\d+)\//)?.[1] || "";
    }
    function getCurrentOrigin(fallbackOrigin = DEFAULT_ORIGIN) {
        return typeof location === "undefined" ? fallbackOrigin : location.origin;
    }
    function sanitizeScheduleWindow(inputWindow) {
        const key = String(inputWindow?.key || "").slice(0, 80),
            startAt = Math.max(0, Number(inputWindow?.startAt) || 0),
            endAt = Math.max(0, Number(inputWindow?.endAt) || 0);
        return key && startAt && endAt > startAt
            ? {
                  key: key,
                  startAt: startAt,
                  endAt: endAt,
              }
            : null;
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
            if (sourceVersion < 2 && lastError === NO_RELATED_GALLERIES_REASON) continue;
            queuedGids.add(gid);
            queue.push({
                gid: gid,
                url: url,
                title: normalizeWhitespace(job.title),
                pageCount: Number.isInteger(job.pageCount) ? job.pageCount : null,
                discoveredAt: Math.max(0, Number(job.discoveredAt) || 0),
                attempts: Math.max(0, Math.round(Number(job.attempts) || 0)),
                nextAttemptAt: Math.max(0, Number(job.nextAttemptAt) || 0),
                lastError: lastError,
            });
        }
        return {
            version: 2,
            initializedAt: String(inputState.initializedAt || ""),
            seenGids: seenGids,
            queue: queue,
            scanCursor: String(inputState.scanCursor || ""),
            nextRunAt: Math.max(0, Number(inputState.nextRunAt) || 0),
            scheduleWindow: sanitizeScheduleWindow(inputState.scheduleWindow),
        };
    }
    function loadHomeState() {
        try {
            const storedState =
                    JSON.parse(localStorage.getItem(HOME_STATE_STORAGE_KEY) || "null") || {},
                sanitizedState = sanitizeHomeState(storedState);
            if ((Number(storedState.version) || 1) < 2) {
                try {
                    localStorage.setItem(HOME_STATE_STORAGE_KEY, JSON.stringify(sanitizedState));
                } catch (error) {
                    console.warn(`${LOG_PREFIX} 无法保存升级后的主页队列`, error);
                }
            }
            return sanitizedState;
        } catch (error) {
            console.warn(`${LOG_PREFIX} 无法读取主页队列`, error);
            return sanitizeHomeState();
        }
    }
    function saveHomeState(homeState) {
        try {
            localStorage.setItem(HOME_STATE_STORAGE_KEY, JSON.stringify(homeState));
        } catch (error) {
            console.warn(`${LOG_PREFIX} 无法保存主页队列`, error);
        }
        return homeState;
    }
    function mergeHomepageResults(
        homeState,
        results,
        config,
        now = Date.now(),
        origin = getCurrentOrigin(),
    ) {
        const isInitialBaseline = !homeState.initializedAt,
            seenGids = new Set(homeState.seenGids),
            queuedGids = new Set(homeState.queue.map((job) => job.gid)),
            queuedJobs = [];
        let skippedShort = 0;
        for (const result of results) {
            const url = canonicalGalleryUrl(result?.url, origin),
                gid = galleryIdFromUrl(url);
            if (!gid || seenGids.has(gid)) continue;
            seenGids.add(gid);
            if (isInitialBaseline) continue;
            if (Number.isInteger(result.pageCount) && result.pageCount < config.minGalleryPages) {
                skippedShort++;
                continue;
            }
            if (queuedGids.has(gid)) continue;
            queuedGids.add(gid);
            queuedJobs.push({
                gid: gid,
                url: url,
                title: normalizeWhitespace(result.title),
                pageCount: Number.isInteger(result.pageCount) ? result.pageCount : null,
                discoveredAt: now,
                attempts: 0,
                nextAttemptAt: 0,
                lastError: "",
            });
        }
        homeState.seenGids = Array.from(seenGids).slice(-RUNTIME_LIMITS.homeSeenLimit);
        if (isInitialBaseline) homeState.initializedAt = new Date(now).toISOString();
        homeState.queue.push(...queuedJobs.reverse());
        return {
            home: homeState,
            initialized: isInitialBaseline,
            baselineCount: isInitialBaseline ? results.length : 0,
            queued: queuedJobs.length,
            skippedShort: skippedShort,
        };
    }
    function findReadyHomeJob(homeState, now = Date.now()) {
        return homeState.queue.find((job) => job.nextAttemptAt <= now) || null;
    }
    function beginHomeJob(homeState, gid) {
        const job = homeState.queue.find((job) => job.gid === String(gid));
        if (job) {
            job.attempts++;
            job.lastError = "";
        }
        return homeState;
    }
    function retryHomeJob(homeState, gid, error, now = Date.now()) {
        const job = homeState.queue.find((job) => job.gid === String(gid));
        if (!job) return homeState;
        const retryMinutes = Math.min(1440, 30 * 2 ** Math.max(0, job.attempts - 1));
        job.nextAttemptAt = now + 60 * retryMinutes * 1_000;
        job.lastError = normalizeWhitespace(error?.message || error).slice(0, 240);
        return homeState;
    }
    function preserveHomeJobAfterBudget(homeState, gid) {
        const job = homeState.queue.find((job) => job.gid === String(gid));
        if (job) {
            job.attempts = Math.max(0, job.attempts - 1);
            job.nextAttemptAt = 0;
            job.lastError = "";
        }
        return homeState;
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
        homeState.queue = homeState.queue.filter((job) => !gidSet.has(job.gid));
        return homeState;
    }
    function getHomeJobDisposition(result = {}) {
        return result.status === "partial"
            ? {
                  action: "retry",
                  reason: `仍有 ${Math.max(0, Number(result.failed) || 0)} 个标签未确认`,
              }
            : {
                  action: "complete",
                  reason: result.status === "no-related" ? NO_RELATED_GALLERIES_REASON : "",
              };
    }
    function selectBadTagRecords(records, state, reviewKnown = false) {
        if (reviewKnown) return records.slice();
        const knownFingerprints = new Set(state?.knownFingerprints || []);
        return records.filter((record) => !knownFingerprints.has(badTagRecordFingerprint(record)));
    }
    function selectBadTagBatch(
        records,
        state,
        reviewKnown = false,
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
            console.warn(`${LOG_PREFIX} 无法读取运行标记`, error);
            return null;
        }
    }
    function clearRunMarker(owner) {
        try {
            if (loadRunMarker()?.owner === owner) {
                localStorage.removeItem(RUN_MARKER_STORAGE_KEY);
            }
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
        if (budget) {
            budget.reserved = Math.min(
                budget.limit,
                Math.max(0, Math.round(Number(reserved) || 0)),
            );
        }
    }
    function getRequestBudgetRemaining(budget, includeReserve = false) {
        if (!budget) return Infinity;
        const usableLimit = includeReserve
            ? budget.limit
            : Math.max(0, budget.limit - budget.reserved);
        return Math.max(0, usableLimit - budget.used);
    }
    function canStartVerifiedTagVote(budget) {
        return getRequestBudgetRemaining(budget) >= 2;
    }
    function consumeRequestBudget(budget, label = "网络请求") {
        if (budget) {
            if (getRequestBudgetRemaining(budget) <= 0) {
                const error = new Error(`本轮请求上限 ${budget.limit} 已用尽（${label}）`);
                error.name = "RequestBudgetError";
                throw error;
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
        if (!owner) return false;
        function failRenewal() {
            runtimeState.controller?.abort();
            runtimeState.workerLockOwner = "";
            return false;
        }
        try {
            const now = Date.now();
            if (isForeignWorkerLock(loadWorkerLock(), owner, now)) return failRenewal();
            saveWorkerLock(owner, now);
            return loadWorkerLock()?.owner === owner || failRenewal();
        } catch (error) {
            console.warn(`${LOG_PREFIX} 无法刷新跨标签页运行租约`, error);
            runtimeState.controller?.abort();
            return false;
        }
    }
    function releaseWorkerLock(owner = runtimeState.workerLockOwner) {
        try {
            const lock = loadWorkerLock();
            lock?.owner === owner && localStorage.removeItem(WORKER_LOCK_STORAGE_KEY);
        } catch (error) {
            console.warn(`${LOG_PREFIX} 无法释放跨标签页运行租约`, error);
        } finally {
            if (runtimeState.workerLockOwner === owner) runtimeState.workerLockOwner = "";
        }
    }
    function consumeTrackedRequest(label) {
        consumeRequestBudget(runtimeState.requestBudget, label);
        if (!renewWorkerLock()) throw createAbortError();
    }
    // 3. 标题、标签与候选纯规则
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
        match = normalizedTitle.match(
            new RegExp(
                `(?:^|\\s+)((?:vol(?:ume)?s?)\\.?\\s*#?(${numberPattern})(?:\\s*${rangePattern}\\s*#?(${numberPattern}))?)\\s*$`,
                "iu",
            ),
        );
        if (match) return buildChapterSuffixResult(normalizedTitle, match, "volume");
        match = normalizedTitle.match(
            new RegExp(
                `(?:^|\\s+)((?:part|pt)\\.?\\s*#?(${numberPattern})(?:\\s*${rangePattern}\\s*#?(${numberPattern}))?)\\s*$`,
                "iu",
            ),
        );
        if (match) return buildChapterSuffixResult(normalizedTitle, match, "part");
        match = normalizedTitle.match(
            new RegExp(
                `\\s*((?:第\\s*)?(${numberPattern})(?:\\s*${rangePattern}\\s*(${numberPattern}))?\\s*([話话章回集]))\\s*$`,
                "iu",
            ),
        );
        if (match) return buildChapterSuffixResult(normalizedTitle, match, "chapter");
        match = normalizedTitle.match(
            new RegExp(
                `\\s*((?:第\\s*)?(${numberPattern})(?:\\s*${rangePattern}\\s*(${numberPattern}))?\\s*[巻卷])\\s*$`,
                "iu",
            ),
        );
        if (match) return buildChapterSuffixResult(normalizedTitle, match, "volume");
        match = normalizedTitle.match(
            new RegExp(
                `\\s*((?:第\\s*)?(${numberPattern})(?:\\s*${rangePattern}\\s*(${numberPattern}))?\\s*部)\\s*$`,
                "iu",
            ),
        );
        if (match) return buildChapterSuffixResult(normalizedTitle, match, "part");
        match = normalizedTitle.match(
            new RegExp(
                `\\s*((?:제\\s*)?(${numberPattern})(?:\\s*${rangePattern}\\s*(${numberPattern}))?\\s*화)\\s*$`,
                "iu",
            ),
        );
        if (match) return buildChapterSuffixResult(normalizedTitle, match, "chapter");
        match = normalizedTitle.match(
            /(?:^|\s+)((prologue|epilogue|interlude|extra|special|bonus|omake)(?:\s*#?\s*(\d{1,3}))?)\s*$/iu,
        );
        if (match) {
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
        match = normalizedTitle.match(/\s*((?:前|中|後|后)[編篇]|[上下][巻卷])\s*$/u);
        if (match) {
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
    function isTitleMetadataPrefix(prefix) {
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
    }
    function parseTitlePart(title) {
        let remainingTitle = normalizeWhitespace(title),
            chapter = null,
            parody = "",
            changed = true;
        for (; remainingTitle && changed; ) {
            changed = false;
            const bracketMatch = remainingTitle.match(/\s*[\[【]([^\]】]+)[\]】]\s*$/u);
            if (bracketMatch) {
                remainingTitle = remainingTitle.slice(0, bracketMatch.index).trim();
                changed = true;
                continue;
            }
            if (!chapter) {
                const chapterSuffix = extractChapterSuffix(remainingTitle);
                if (chapterSuffix) {
                    chapter = chapterSuffix.chapter;
                    remainingTitle = chapterSuffix.baseTitle;
                    changed = true;
                    continue;
                }
            }
            const parentheticalMatch = remainingTitle.match(/\s*[\(（]([^\)）]+)[\)）]\s*$/u);
            if (parentheticalMatch) {
                if (chapter && !parody) parody = normalizeWhitespace(parentheticalMatch[1]);
                else {
                    const parentheticalChapter = extractChapterSuffix(` ${parentheticalMatch[1]}`);
                    if (parentheticalChapter?.chapter && !parentheticalChapter.baseTitle) {
                        chapter = parentheticalChapter.chapter;
                    } else if (!parody) {
                        parody = normalizeWhitespace(parentheticalMatch[1]);
                    }
                }
                remainingTitle = remainingTitle.slice(0, parentheticalMatch.index).trim();
                changed = true;
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
        if (eventPrefixMatch) remainingTitle = remainingTitle.slice(eventPrefixMatch[0].length);
        let creatorPrefix = "";
        const creatorPrefixMatch = remainingTitle.match(/^[\[【]([^\]】]+)[\]】]\s*/u);
        if (creatorPrefixMatch) {
            if (!isTitleMetadataPrefix(creatorPrefixMatch[1])) {
                creatorPrefix = normalizeWhitespace(creatorPrefixMatch[1]);
            }
            remainingTitle = remainingTitle.slice(creatorPrefixMatch[0].length);
        }
        const coreParts = [],
            searchParts = [],
            chapters = [],
            parodies = [];
        for (const titlePart of remainingTitle.split("|")) {
            const parsedPart = parseTitlePart(titlePart),
                normalizedPart = normalizeComparableTitle(parsedPart.baseTitle);
            const isDuplicateTitle = coreParts.some(
                (existingTitle) => normalizeComparableTitle(existingTitle) === normalizedPart,
            );
            if (!normalizedPart || isDuplicateTitle) continue;
            coreParts.push(parsedPart.baseTitle);
            searchParts.push(parsedPart.searchTitle);
            if (
                parsedPart.chapter &&
                !chapters.some((existingChapter) => existingChapter.key === parsedPart.chapter.key)
            ) {
                chapters.push(parsedPart.chapter);
            }
            if (parsedPart.parody && !parodies.includes(parsedPart.parody)) {
                parodies.push(parsedPart.parody);
            }
        }
        const normalizedCreatorPrefix = normalizeComparableText(creatorPrefix),
            creatorTokens = new Set();
        if (normalizedCreatorPrefix)
            for (const token of normalizedCreatorPrefix.match(/[\p{L}\p{N}]+/gu) || []) {
                const normalizedToken = normalizeComparableText(token);
                if (normalizedToken.length >= 2) creatorTokens.add(normalizedToken);
            }
        if (normalizedCreatorPrefix && !creatorTokens.size) {
            creatorTokens.add(normalizedCreatorPrefix);
        }
        return {
            parody: parodies[0] || "",
            parodies: parodies,
            coreParts: coreParts,
            searchParts: searchParts,
            chapters: chapters,
            creatorPrefix: normalizedCreatorPrefix,
            creatorTokens: creatorTokens,
            coreNumbers: new Set(
                coreParts
                    .flatMap((part) => normalizeComparableTitle(part).split(" "))
                    .filter((token) => /^\d{1,4}$/u.test(token))
                    .map(normalizeChapterNumber),
            ),
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
        for (const value of leftSet) {
            if (rightSet.has(value)) count++;
        }
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
                creatorPrefixes: new Set(
                    identities.map((identity) => identity.creatorPrefix).filter(Boolean),
                ),
                coreNumbers: new Set(
                    identities.flatMap((identity) => Array.from(identity.coreNumbers)),
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
        if (cacheKey) titleIdentityCache.set(cacheKey, analysis);
        return analysis;
    }
    function findClosestTitlePair(leftIdentity, rightIdentity) {
        let bestRatio = Infinity,
            leftTitle = "",
            rightTitle = "";
        for (const leftTitlePart of leftIdentity.coreParts)
            for (const rightTitlePart of rightIdentity.coreParts) {
                const ratio = titleDistanceRatio(leftTitlePart, rightTitlePart);
                if (ratio < bestRatio) {
                    bestRatio = ratio;
                    leftTitle = leftTitlePart;
                    rightTitle = rightTitlePart;
                }
            }
        return {
            ratio: bestRatio,
            leftTitle: leftTitle,
            rightTitle: rightTitle,
        };
    }
    function getTitleFieldLabel(index) {
        return index === 0 ? "主标题" : index === 1 ? "日文标题" : `标题 ${index + 1}`;
    }
    function compareChapterSets(currentIdentity, candidateIdentity) {
        if (!currentIdentity.chapters.length || !candidateIdentity.chapters.length)
            return {
                accepted: true,
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
                  accepted: true,
                  relation: "match",
                  score: 8,
                  reason: `章节一致（${matchingChapter.raw}）`,
              }
            : {
                  accepted: false,
                  relation: "conflict",
                  score: -Infinity,
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
    function creatorTagSets(gallery, solidOnly = false) {
        const cacheKey = gallery && typeof gallery === "object" ? gallery : null,
            cacheSlot = solidOnly ? "solid" : "all",
            cached = cacheKey ? creatorTagSetsCache.get(cacheKey)?.[cacheSlot] : null;
        if (cached) return cached;
        const tagSets = {
            group: new Set(),
            artist: new Set(),
        };
        for (const tagEntry of gallery?.tags || []) {
            if (solidOnly && typeof tagEntry === "object" && !tagEntry.solid) continue;
            const normalizedTag = normalizeTag(
                    typeof tagEntry === "string" ? tagEntry : tagEntry?.tag,
                ),
                colonIndex = normalizedTag.indexOf(":");
            if (colonIndex < 1) continue;
            const namespace = normalizedTag.slice(0, colonIndex);
            if (namespace in tagSets) {
                tagSets[namespace].add(normalizedTag.slice(colonIndex + 1));
            }
        }
        if (cacheKey) {
            const cacheRecord = creatorTagSetsCache.get(cacheKey) || {};
            cacheRecord[cacheSlot] = tagSets;
            creatorTagSetsCache.set(cacheKey, cacheRecord);
        }
        return tagSets;
    }
    function compareTitleSets(currentTitles, candidateTitles, config = DEFAULT_CONFIG) {
        const currentIdentity = analyzeTitleSet(currentTitles),
            candidateIdentity = analyzeTitleSet(candidateTitles);
        if (!currentIdentity.coreParts.length || !candidateIdentity.coreParts.length)
            return {
                accepted: false,
                ratio: 1,
                creatorOverlap: 0,
                reason: "标题缺失",
            };
        const creatorOverlap = countSetOverlap(
            currentIdentity.creatorTokens,
            candidateIdentity.creatorTokens,
        );
        if (
            currentIdentity.creatorPrefixes.size &&
            candidateIdentity.creatorPrefixes.size &&
            !creatorOverlap
        )
            return {
                accepted: false,
                ratio: 1,
                creatorOverlap: 0,
                reason: "标题署名冲突",
            };
        if (
            (currentIdentity.coreNumbers.size || candidateIdentity.coreNumbers.size) &&
            (currentIdentity.coreNumbers.size !== candidateIdentity.coreNumbers.size ||
                countSetOverlap(currentIdentity.coreNumbers, candidateIdentity.coreNumbers) !==
                    currentIdentity.coreNumbers.size)
        )
            return {
                accepted: false,
                ratio: 1,
                creatorOverlap: creatorOverlap,
                reason: `作品编号冲突（${Array.from(currentIdentity.coreNumbers).join("/") || "无"} / ${Array.from(candidateIdentity.coreNumbers).join("/") || "无"}）`,
            };
        let closestPair = {
            ratio: Infinity,
            leftTitle: "",
            rightTitle: "",
        };
        for (const currentTitleIdentity of currentIdentity.identities)
            for (const candidateTitleIdentity of candidateIdentity.identities) {
                const match = findClosestTitlePair(currentTitleIdentity, candidateTitleIdentity);
                if (match.ratio < closestPair.ratio) closestPair = match;
            }
        if (closestPair.ratio > config.maxTitleDistanceRatio)
            return {
                accepted: false,
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
            reason =
                acceptedMatches.length > 0
                    ? acceptedMatches
                          .map((match) => `${match.field} ${(100 * match.ratio).toFixed(1)}%`)
                          .join("，")
                    : `跨字段标题 ${(100 * closestPair.ratio).toFixed(1)}%`;
        return {
            accepted: true,
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
        if (!normalized.includes(":")) normalized = `misc:${normalized}`;
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
                    downvoted: anchor.classList.contains("tdn"),
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
            .map((tag) => normalizeTag(typeof tag === "string" ? tag : tag?.tag))
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
    function compareGalleryRecency(leftGallery, rightGallery) {
        if (Number.isFinite(leftGallery?.postedAt) && Number.isFinite(rightGallery?.postedAt)) {
            const postedDifference = leftGallery.postedAt - rightGallery.postedAt;
            if (postedDifference) return postedDifference;
        }
        const gidDifference =
            Number(galleryIdFromUrl(leftGallery?.url)) -
            Number(galleryIdFromUrl(rightGallery?.url));
        if (Number.isFinite(gidDifference) && gidDifference) return gidDifference;
        return String(leftGallery?.url || "").localeCompare(String(rightGallery?.url || ""));
    }
    function selectNewestGallery(galleries) {
        let newestGallery = null;
        for (const gallery of galleries || []) {
            if (!newestGallery || compareGalleryRecency(gallery, newestGallery) > 0) {
                newestGallery = gallery;
            }
        }
        return newestGallery;
    }
    function buildTransferPlan(galleries, direction = "all") {
        const galleryList = Array.from(galleries || []);
        if (direction !== "newest")
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
                accepted: false,
                reason: "页数缺失",
                pageDifference: null,
                ratio: 1,
                score: -Infinity,
            };
        if (
            currentGallery.pageCount < config.minGalleryPages ||
            candidateGallery.pageCount < config.minGalleryPages
        )
            return {
                accepted: false,
                reason: `页数少于 ${config.minGalleryPages}`,
                pageDifference: Math.abs(currentGallery.pageCount - candidateGallery.pageCount),
                ratio: 1,
                score: -Infinity,
            };
        const pageDifference = Math.abs(currentGallery.pageCount - candidateGallery.pageCount);
        if (pageDifference > config.maxPageDifference)
            return {
                accepted: false,
                reason: `页数相差 ${pageDifference}，超过 ${config.maxPageDifference}`,
                pageDifference: pageDifference,
                ratio: 1,
                score: -Infinity,
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
                score: -Infinity,
            };
        const chapterAssessment = compareChapterSets(
            titleAssessment.currentIdentity,
            titleAssessment.candidateIdentity,
        );
        if (!chapterAssessment.accepted)
            return {
                accepted: false,
                reason: chapterAssessment.reason,
                pageDifference: pageDifference,
                ratio: titleAssessment.ratio,
                chapterRelation: chapterAssessment.relation,
                score: -Infinity,
            };
        const currentCreators = creatorTagSets(currentGallery, true),
            candidateCreators = creatorTagSets(candidateGallery, true),
            groupOverlap = countSetOverlap(currentCreators.group, candidateCreators.group),
            artistOverlap = countSetOverlap(currentCreators.artist, candidateCreators.artist),
            creatorTagOverlap = groupOverlap + artistOverlap;
        for (const namespace of ["group", "artist"])
            if (
                currentCreators[namespace].size > 0 &&
                candidateCreators[namespace].size > 0 &&
                countSetOverlap(currentCreators[namespace], candidateCreators[namespace]) === 0 &&
                titleAssessment.creatorOverlap === 0
            )
                return {
                    accepted: false,
                    reason: (namespace === "group" ? "社团" : "作者") + "标签冲突",
                    pageDifference: pageDifference,
                    ratio: titleAssessment.ratio,
                    creatorOverlap: 0,
                    score: -Infinity,
                };
        if (
            titleAssessment.coreLength <= config.genericTitleLength &&
            creatorTagOverlap + titleAssessment.creatorOverlap === 0
        )
            return {
                accepted: false,
                reason: "短标题缺少相同作者或社团证据",
                pageDifference: pageDifference,
                ratio: titleAssessment.ratio,
                creatorOverlap: 0,
                score: -Infinity,
            };
        const contextAssessment = compareTitleContext(
                titleAssessment.currentIdentity,
                titleAssessment.candidateIdentity,
            ),
            hasIndependentIdentityEvidence =
                creatorTagOverlap + titleAssessment.creatorOverlap > 0 ||
                chapterAssessment.relation === "match" ||
                contextAssessment.score > 0;
        if (titleAssessment.ratio > 0 && !hasIndependentIdentityEvidence)
            return {
                accepted: false,
                reason: "非完全一致标题缺少独立身份依据",
                pageDifference: pageDifference,
                ratio: titleAssessment.ratio,
                creatorOverlap: 0,
                score: -Infinity,
            };
        const titleThreshold = Math.max(config.maxTitleDistanceRatio, 0.001),
            pageScore =
                config.maxPageDifference === 0
                    ? 20
                    : 20 * Math.max(0, 1 - pageDifference / config.maxPageDifference),
            extraTitleScore = titleAssessment.fieldMatches
                .filter((match) => match.accepted)
                .sort((left, right) => left.ratio - right.ratio)
                .slice(1)
                .reduce(
                    (total, match) => total + 10 * Math.max(0, 1 - match.ratio / titleThreshold),
                    0,
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
        score += Math.min(4, candidateGallery.matchedQueries?.length || 0);
        score = Math.round(10 * score) / 10;
        return {
            accepted: true,
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
        };
    }
    function selectBestLanguageCandidates(candidates, minimumScoreGap) {
        const byLanguage = new Map(),
            rejected = [];
        for (const candidate of candidates) {
            if (candidate.language && candidate.language !== "unknown") {
                if (!byLanguage.has(candidate.language)) byLanguage.set(candidate.language, []);
                byLanguage.get(candidate.language).push(candidate);
            } else {
                rejected.push({
                    ...candidate,
                    rejectionReason: "无法确认语言",
                });
            }
        }
        const accepted = [];
        for (const [language, languageCandidates] of byLanguage) {
            languageCandidates.sort(
                (left, right) =>
                    (right.assessment?.score ?? -Infinity) -
                        (left.assessment?.score ?? -Infinity) ||
                    (left.assessment?.pageDifference ?? Infinity) -
                        (right.assessment?.pageDifference ?? Infinity) ||
                    String(left.url).localeCompare(String(right.url)),
            );
            if (languageCandidates.length === 1) {
                accepted.push(languageCandidates[0]);
                continue;
            }
            const scoreGap =
                (languageCandidates[0].assessment?.score ?? -Infinity) -
                (languageCandidates[1].assessment?.score ?? -Infinity);
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
        if (direction !== "newest")
            return selectBestLanguageCandidates(candidates, minimumScoreGap);
        const accepted = [],
            rejected = [];
        for (const candidate of candidates || []) {
            if (candidate.language && candidate.language !== "unknown") {
                accepted.push(candidate);
            } else {
                rejected.push({
                    ...candidate,
                    rejectionReason: "无法确认语言",
                });
            }
        }
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
            line = normalizeWhitespace(line).toLowerCase();
            if (!line || line.startsWith("#")) continue;
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
    function extractCorrectionMetadata(title) {
        const normalizedTitle = String(title || "")
            .normalize("NFKC")
            .toLowerCase();
        return Array.from(
            normalizedTitle.matchAll(/\[([^\[\]]*)\]|\(([^()]*)\)|【([^【】]*)】/gu),
            (match) => normalizeWhitespace(match[1] ?? match[2] ?? match[3]),
        ).filter(Boolean);
    }
    function maskMatches(text, regex, matches) {
        return text.replace(regex, (match) => {
            matches.push(normalizeWhitespace(match));
            return " ".repeat(match.length);
        });
    }
    function consumeLongestMarkers(text, markers) {
        const matched = [],
            sortedMarkers = [...markers].sort((left, right) => right.length - left.length);
        let remainder = text;
        for (const marker of sortedMarkers) {
            let index = remainder.indexOf(marker);
            while (index >= 0) {
                matched.push(marker);
                remainder = `${remainder.slice(0, index)}${" ".repeat(marker.length)}${remainder.slice(index + marker.length)}`;
                index = remainder.indexOf(marker, index + marker.length);
            }
        }
        return { matched: matched, remainder: remainder };
    }
    function classifyCorrectionState(titleGn, titleGj) {
        const positivePattern = [...POSITIVE_CORRECTION_MARKERS]
                .sort((left, right) => right.length - left.length)
                .map(escapeRegex)
                .join("|"),
            prefixNegation = new RegExp(
                `(?:\\b(?:not|non)\\s*[-–—]?\\s*|(?:不是|非|不)\\s*)(?:${positivePattern})`,
                "giu",
            ),
            suffixNegation = new RegExp(
                `(?:${positivePattern})\\s*(?:ではない|ではありません|じゃない|아님|아닌|아니다)`,
                "giu",
            ),
            positiveMarkers = [],
            negativeMarkers = [],
            negatedMarkers = [];
        for (const segment of [
            ...extractCorrectionMetadata(titleGn),
            ...extractCorrectionMetadata(titleGj),
        ]) {
            let remainder = maskMatches(segment, prefixNegation, negatedMarkers);
            remainder = maskMatches(remainder, suffixNegation, negatedMarkers);
            const positiveResult = consumeLongestMarkers(
                remainder,
                POSITIVE_CORRECTION_MARKERS,
            );
            positiveMarkers.push(...positiveResult.matched);
            negativeMarkers.push(
                ...consumeLongestMarkers(
                    positiveResult.remainder,
                    NEGATIVE_CORRECTION_MARKERS,
                ).matched,
            );
        }
        const uniquePositive = Array.from(new Set(positiveMarkers)),
            uniqueNegative = Array.from(new Set(negativeMarkers)),
            uniqueNegated = Array.from(new Set(negatedMarkers));
        return {
            state: uniqueNegated.length
                ? "unknown"
                : uniquePositive.length && uniqueNegative.length
                  ? "conflict"
                  : uniquePositive.length
                    ? "explicit-uncensored"
                    : uniqueNegative.length
                      ? "explicit-censored"
                      : "unmarked",
            positiveMarkers: uniquePositive,
            negativeMarkers: uniqueNegative,
            negatedMarkers: uniqueNegated,
        };
    }
    function collectTagSourceUrls(galleries, tag, mode) {
        const normalizedTag = normalizeTag(tag),
            urls = [];
        for (const gallery of galleries || []) {
            if (
                gallery.tags?.some(
                    (entry) =>
                        normalizeTag(entry.tag) === normalizedTag &&
                        (mode !== "solid" || entry.solid),
                )
            )
                urls.push(gallery.url);
        }
        return Array.from(new Set(urls.filter(Boolean)));
    }
    function buildTargetTagSet(
        target,
        union,
        blacklist,
        sensitiveSourceUrls = [],
        allowDerivedTag = true,
    ) {
        const normalizedUnion = Array.from(new Set((union || []).map(normalizeTag).filter(Boolean))),
            hasSensitiveSource = normalizedUnion.includes(SENSITIVE_UNCENSORED_TAG),
            tags = new Set(normalizedUnion.filter((tag) => tag !== SENSITIVE_UNCENSORED_TAG));
        let correction,
            titleGn = "",
            titleGj = "";
        try {
            titleGn = String(target?.titleGn || "");
            titleGj = String(target?.titleGj || "");
            correction = classifyCorrectionState(titleGn, titleGj);
        } catch (error) {
            correction = {
                state: "error",
                positiveMarkers: [],
                negativeMarkers: [],
                negatedMarkers: [],
                error: error instanceof Error ? error.message : String(error),
            };
        }
        const isSensitiveBlacklisted = isBlacklisted(SENSITIVE_UNCENSORED_TAG, blacklist),
            audit = {
                tag: SENSITIVE_UNCENSORED_TAG,
                targetUrl: String(target?.url || ""),
                titleGn: titleGn,
                titleGj: titleGj,
                state: correction.state,
                positiveMarkers: correction.positiveMarkers,
                negativeMarkers: correction.negativeMarkers,
                negatedMarkers: correction.negatedMarkers,
                sourceUrls: Array.from(new Set(sensitiveSourceUrls.filter(Boolean))),
                action: "",
                reason: "",
            },
            derivedTags = [];
        if (correction.state === "explicit-uncensored") {
            if (!allowDerivedTag) {
                audit.action = "below-minimum-pages";
                audit.reason = "目标画廊未达到标题派生的最少页数";
            } else if (isSensitiveBlacklisted) {
                audit.action = "blacklisted";
                audit.reason = "黑名单阻止标题派生标签";
            } else {
                tags.add(SENSITIVE_UNCENSORED_TAG);
                derivedTags.push(SENSITIVE_UNCENSORED_TAG);
                audit.action = "derived";
                audit.reason = "目标标题明确标注无修正或去修正";
            }
        } else if (correction.state === "conflict") {
            audit.action = "conflict";
            audit.reason = "GN/GJ 修正状态证据互相冲突";
        } else if (correction.state === "unknown") {
            audit.action = "unknown";
            audit.reason = "标题包含修正状态否定短语";
        } else if (correction.state === "error") {
            audit.action = "classifier-error";
            audit.reason = `标题修正状态分类失败：${correction.error}`;
        } else if (hasSensitiveSource) {
            audit.action = "source-blocked";
            audit.reason =
                correction.state === "explicit-censored"
                    ? "目标标题明确表示有修正"
                    : "目标标题没有明确无修正标记";
        }
        return {
            tags: Array.from(tags).sort(),
            derivedTags: derivedTags,
            correction: correction,
            audit: audit.action ? audit : null,
        };
    }
    function buildTransferTagUnion(galleries, mode, blacklist) {
        const union = new Set();
        for (const gallery of galleries) {
            for (const tagEntry of gallery.tags) {
                if (mode === "solid" && !tagEntry.solid) continue;
                if (!isBlacklisted(tagEntry.tag, blacklist)) union.add(tagEntry.tag);
            }
        }
        return Array.from(union).sort();
    }
    function planTargetTags(union, targetTags) {
        const existingTags = new Map(targetTags.map((tag) => [tag.tag, tag])),
            pending = [],
            downvotedTags = [];
        let skippedSolid = 0,
            skippedVoted = 0,
            skippedDownvoted = 0;
        for (const tag of union) {
            const existingTag = existingTags.get(tag);
            if (existingTag?.solid) {
                skippedSolid++;
            } else if (existingTag?.voted) {
                skippedVoted++;
            } else if (existingTag?.downvoted) {
                skippedDownvoted++;
                downvotedTags.push(tag);
            } else {
                pending.push(tag);
            }
        }
        return {
            pending: pending,
            skippedSolid: skippedSolid,
            skippedVoted: skippedVoted,
            skippedDownvoted: skippedDownvoted,
            downvotedTags: downvotedTags,
        };
    }
    function planRandomTagSkip(eligibleTags, config = DEFAULT_CONFIG, random = Math.random) {
        const uniqueTags = Array.from(
                new Set((eligibleTags || []).map(normalizeTag).filter(Boolean)),
            ).sort(),
            disabledResult = {
                eligibleCount: uniqueTags.length,
                requestedCount: 0,
                actualCount: 0,
                skippedTags: [],
                remainingTags: uniqueTags,
            };
        if (!config.randomTagSkipEnabled || uniqueTags.length < 2) return disabledResult;

        const configuredMinimum = clampInteger(
                config.randomTagSkipMin,
                DEFAULT_CONFIG.randomTagSkipMin,
                0,
                1_000,
            ),
            configuredMaximum = clampInteger(
                config.randomTagSkipMax,
                DEFAULT_CONFIG.randomTagSkipMax,
                0,
                1_000,
            ),
            minimum = Math.min(configuredMinimum, configuredMaximum),
            maximum = Math.max(configuredMinimum, configuredMaximum),
            countRandom = Math.min(1 - Number.EPSILON, Math.max(0, Number(random()) || 0)),
            requestedCount = minimum + Math.floor(countRandom * (maximum - minimum + 1)),
            actualCount = Math.min(requestedCount, uniqueTags.length - 1);
        if (!actualCount)
            return {
                ...disabledResult,
                requestedCount: requestedCount,
            };

        const shuffledTags = [...uniqueTags];
        for (let index = shuffledTags.length - 1; index > 0; index--) {
            const selectionRandom = Math.min(
                    1 - Number.EPSILON,
                    Math.max(0, Number(random()) || 0),
                ),
                selectedIndex = Math.floor(selectionRandom * (index + 1));
            [shuffledTags[index], shuffledTags[selectedIndex]] = [
                shuffledTags[selectedIndex],
                shuffledTags[index],
            ];
        }
        const skippedTags = shuffledTags.slice(0, actualCount).sort(),
            skippedTagSet = new Set(skippedTags);
        return {
            eligibleCount: uniqueTags.length,
            requestedCount: requestedCount,
            actualCount: actualCount,
            skippedTags: skippedTags,
            remainingTags: uniqueTags.filter((tag) => !skippedTagSet.has(tag)),
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
            if (batch.length && batchLength + addedLength > maxLength) {
                batches.push(batch);
                batch = [];
                batchLength = 0;
            }
            batch.push(normalizedTag);
            batchLength += normalizedTag.length + (batch.length > 1 ? 1 : 0);
        }
        if (batch.length) batches.push(batch);
        return batches;
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
    // 4. 统一请求生命周期与读取客户端
    function createAbortError() {
        return new DOMException("Aborted", "AbortError");
    }
    function createTimeoutError(message) {
        const error = new Error(message);
        error.name = "TimeoutError";
        return error;
    }
    function runRequestLifecycle({
        signal,
        timeoutMs = RUNTIME_LIMITS.fetchTimeoutMs,
        createTimeoutFailure = () => createTimeoutError("请求超时"),
        start,
    }) {
        return new Promise((resolve, reject) => {
            let settled = false,
                abortRequested = false,
                transportAborted = false,
                abortTransport = null,
                timeoutId = null;
            function settle(error, value) {
                if (settled) return false;
                settled = true;
                clearTimeout(timeoutId);
                signal?.removeEventListener("abort", handleAbort);
                error ? reject(error) : resolve(value);
                return true;
            }
            function abortTransportOnce() {
                if (transportAborted || typeof abortTransport !== "function") return;
                transportAborted = true;
                try {
                    abortTransport();
                } catch (error) {
                    console.warn(`${LOG_PREFIX} 无法中止底层请求`, error);
                }
            }
            function cancel(error) {
                if (settled) return;
                abortRequested = true;
                settle(error);
                abortTransportOnce();
            }
            function handleAbort() {
                cancel(createAbortError());
            }
            if (signal?.aborted) {
                settle(createAbortError());
                return;
            }
            signal?.addEventListener("abort", handleAbort, { once: true });
            timeoutId = setTimeout(
                () => cancel(createTimeoutFailure()),
                Math.max(1, Number(timeoutMs) || RUNTIME_LIMITS.fetchTimeoutMs),
            );
            try {
                abortTransport =
                    start({
                        resolve: (value) => settle(null, value),
                        reject: (error) => settle(error),
                        isSettled: () => settled,
                    }) || null;
                abortRequested && abortTransportOnce();
            } catch (error) {
                settle(error);
            }
        });
    }
    function delay(milliseconds, signal) {
        if (signal?.aborted) return Promise.reject(createAbortError());
        return new Promise((resolve, reject) => {
            let settled = false;
            const timer = setTimeout(() => settle(), milliseconds);
            const abortHandler = () => settle(createAbortError());
            function settle(error) {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                signal?.removeEventListener("abort", abortHandler);
                if (error) reject(error);
                else resolve();
            }
            signal?.addEventListener("abort", abortHandler, { once: true });
            if (signal?.aborted) abortHandler();
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
        if (waitMs > 0) await delay(waitMs, signal);
        runtimeState.lastSearchRequestAt = Date.now();
    }
    function isRetryableFetchError(error) {
        if (!error || ["AbortError", "RequestBudgetError"].includes(error.name)) return false;
        const status = Number(error.status);
        return Number.isInteger(status) && status > 0
            ? [408, 425, 429].includes(status) || status >= 500
            : error.name === "TypeError" || error.name === "TimeoutError";
    }
    function getRetryDelay(attempt) {
        const baseDelay = Math.min(
            RUNTIME_LIMITS.fetchRetryMaxMs,
            RUNTIME_LIMITS.fetchRetryBaseMs * 2 ** (attempt - 1),
        );
        return randomInteger(0.8 * baseDelay, 1.2 * baseDelay);
    }
    async function withReadRetry(operation, signal, failureLabel) {
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
            );
            await delay(delayMs, signal);
        }
        throw lastError;
    }
    async function fetchHtml(
        url,
        signal,
        {
            beforeAttempt: beforeAttempt,
            acceptStatus: acceptStatus = () => false,
            failureLabel: failureLabel = "读取失败",
        } = {},
    ) {
        const parsedUrl = new URL(url, location.href);
        return withReadRetry(
            async () => {
                if (signal?.aborted) throw createAbortError();
                if (beforeAttempt) await beforeAttempt(signal);
                consumeTrackedRequest(`读取 ${parsedUrl.pathname}`);
                return runRequestLifecycle({
                    signal: signal,
                    createTimeoutFailure: () =>
                        createTimeoutError(
                            `读取超时（${RUNTIME_LIMITS.fetchTimeoutMs / 1_000} 秒）`,
                        ),
                    start({ resolve: resolveRequest, reject: rejectRequest }) {
                        const requestController = new AbortController();
                        fetch(parsedUrl.href, {
                            credentials: "include",
                            signal: requestController.signal,
                            headers: { Accept: "text/html" },
                        })
                            .then(async (response) => {
                                if (!response.ok && !acceptStatus(response.status)) {
                                    const error = new Error(`HTTP ${response.status}`);
                                    error.status = response.status;
                                    throw error;
                                }
                                return {
                                    status: response.status,
                                    url: response.url || parsedUrl.href,
                                    html: await response.text(),
                                };
                            })
                            .then(resolveRequest, rejectRequest);
                        return () => requestController.abort();
                    },
                });
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
                api.pathname === "/api.php" &&
                (["127.0.0.1", "localhost"].includes(gallery.hostname)
                    ? api.origin === gallery.origin
                    : api.protocol === "https:" &&
                      (gallery.hostname === "exhentai.org"
                          ? new Set(["exhentai.org", "s.exhentai.org", "api.e-hentai.org"])
                          : new Set(["e-hentai.org", "api.e-hentai.org"])
                      ).has(api.hostname))
            );
        } catch {
            return false;
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
    function isUnavailableGalleryDocument(documentNode, status) {
        if (isUnavailableGalleryStatus(status)) return true;
        if (documentNode.querySelector("#gn")) return false;
        const pageText = `${documentNode.title}\n${documentNode.body?.innerText || ""}`;
        return /\b(?:404|410)\b|gallery\s+(?:not found|unavailable|removed|expunged)/i.test(
            pageText,
        );
    }
    function rememberGallerySnapshot(snapshot) {
        if (snapshot?.gallery) gallerySnapshotCache.set(snapshot.gallery, snapshot);
        return snapshot;
    }
    async function fetchGallerySnapshot(url, signal) {
        const response = await fetchHtml(url, signal, {
                acceptStatus: isUnavailableGalleryStatus,
                failureLabel: "画廊读取失败",
            }),
            documentNode = new DOMParser().parseFromString(response.html, "text/html"),
            unavailable = isUnavailableGalleryDocument(documentNode, response.status);
        if (!unavailable && !isUsableGalleryDocument(documentNode)) {
            const error = new Error("画廊页面结构异常或当前无法访问");
            error.name = "GalleryStructureError";
            throw error;
        }
        return rememberGallerySnapshot({
            url: response.url,
            status: response.status,
            unavailable: unavailable,
            doc: documentNode,
            gallery: unavailable ? null : parseGalleryDocument(documentNode, response.url),
            writeContext: unavailable ? null : parseGalleryWriteContext(documentNode, response.url),
        });
    }
    function isRedBadTagAnchor(anchor) {
        return (
            String(anchor.style?.color || "").toLowerCase() === "red" ||
            /(?:^|;)\s*color\s*:\s*red(?:\s*;|$)/i.test(anchor.getAttribute("style") || "")
        );
    }
    function buildBadTagAudit(
        galleries,
        { uid: uid = "", repositoryUrl: repositoryUrl = "", recordedAt: recordedAt = new Date() } = {},
    ) {
        const normalizedGalleries = [];
        for (const gallery of galleries || []) {
            const galleryUrl = canonicalGalleryUrl(gallery?.galleryUrl, DEFAULT_ORIGIN),
                title = normalizeWhitespace(gallery?.title),
                tags = Array.from(new Set((gallery?.tags || []).map(normalizeTag).filter(Boolean))),
                badTags = (gallery?.badTags || [])
                    .map((record) => ({
                        tag: normalizeTag(typeof record === "string" ? record : record?.tag),
                        timestamp: normalizeWhitespace(
                            typeof record === "string" ? "" : record?.timestamp,
                        ),
                    }))
                    .filter((record) => record.tag);
            if (!galleryUrl || !badTags.length) continue;
            for (const record of badTags) {
                if (!tags.includes(record.tag)) tags.push(record.tag);
            }
            normalizedGalleries.push({
                gid: String(gallery?.gid || galleryIdFromUrl(galleryUrl)),
                galleryUrl: galleryUrl,
                title: title,
                titleLength: Array.from(title).length,
                normalizedTitleLength: normalizeComparableTitle(title).length,
                tagCount: tags.length,
                badTagCount: badTags.length,
                tags: tags,
                badTags: badTags,
            });
        }
        const tagCountMap = new Map();
        for (const gallery of normalizedGalleries)
            for (const record of gallery.badTags) {
                const count = tagCountMap.get(record.tag) || {
                    tag: record.tag,
                    count: 0,
                    galleryIds: new Set(),
                };
                count.count++;
                count.galleryIds.add(gallery.gid);
                tagCountMap.set(record.tag, count);
            }
        const tagCounts = Array.from(tagCountMap.values())
                .map((count) => ({
                    tag: count.tag,
                    count: count.count,
                    galleryCount: count.galleryIds.size,
                }))
                .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag)),
            recordedDate = recordedAt instanceof Date ? recordedAt : new Date(recordedAt);
        return {
            recordedAt: (Number.isFinite(recordedDate.getTime()) ? recordedDate : new Date()).toISOString(),
            uid: String(uid || ""),
            repositoryUrl: String(repositoryUrl || ""),
            galleryCount: normalizedGalleries.length,
            badTagRecordCount: normalizedGalleries.reduce(
                (total, gallery) => total + gallery.badTagCount,
                0,
            ),
            uniqueBadTagCount: tagCounts.length,
            tagCounts: tagCounts,
            galleries: normalizedGalleries,
        };
    }
    function parseBadTagReport(documentNode, origin = "https://repo.e-hentai.org", options = {}) {
        const records = [],
            galleries = [];
        let currentGallery = null;
        for (const row of documentNode.querySelectorAll("#usertaglist tr")) {
            const galleryAnchor = Array.from(row.querySelectorAll("a[href]")).find((anchor) =>
                /\/g\/\d+\/[0-9a-f]+\/?/i.test(anchor.href),
            );
            if (galleryAnchor) {
                const galleryUrl = canonicalGalleryUrl(galleryAnchor.href, origin),
                    gid = galleryIdFromUrl(galleryUrl);
                currentGallery =
                    galleryUrl && gid
                        ? {
                              gid: gid,
                              galleryUrl: galleryUrl,
                              title: normalizeWhitespace(galleryAnchor.textContent),
                              tags: [],
                              badTags: [],
                          }
                        : null;
                currentGallery && galleries.push(currentGallery);
                continue;
            }
            if (!currentGallery) continue;
            const timestampCell = row.querySelector("td[title]"),
                timestamp = normalizeWhitespace(
                    timestampCell?.getAttribute("title") || timestampCell?.textContent,
                );
            for (const anchor of row.querySelectorAll('a[ehs-tag],a[href*="/tag/"]')) {
                const tag = normalizeTag(
                    anchor.getAttribute("ehs-tag") ||
                        anchor.getAttribute("title") ||
                        anchor.textContent,
                );
                if (!tag) continue;
                if (!currentGallery.tags.includes(tag)) currentGallery.tags.push(tag);
                if (isRedBadTagAnchor(anchor)) {
                    const record = {
                        gid: currentGallery.gid,
                        galleryUrl: currentGallery.galleryUrl,
                        tag: tag,
                        timestamp: timestamp,
                    };
                    currentGallery.badTags.push({ tag: tag, timestamp: timestamp });
                    records.push(record);
                }
            }
        }
        return {
            records: records,
            audit: buildBadTagAudit(galleries, {
                ...options,
                repositoryUrl: options.repositoryUrl || origin,
            }),
        };
    }
    function badTagRecordFingerprint(record) {
        return [record.gid, normalizeTag(record.tag), normalizeWhitespace(record.timestamp)].join(
            "|",
        );
    }
    function sanitizeBadTagState(state = {}, fallbackUid = "") {
        return {
            uid: String(state.uid || fallbackUid),
            knownFingerprints: Array.from(new Set(state.knownFingerprints || [])).slice(-2_000),
        };
    }
    function loadBadTagState(uid) {
        try {
            const storedState = JSON.parse(
                localStorage.getItem(BAD_TAG_STATE_STORAGE_KEY) || "null",
            );
            if (storedState?.uid === uid && Array.isArray(storedState.knownFingerprints)) {
                return sanitizeBadTagState(storedState);
            }
        } catch (error) {
            console.warn(`${LOG_PREFIX} 无法读取错误标签状态`, error);
        }
        return sanitizeBadTagState({}, uid);
    }
    function saveBadTagState(state) {
        const sanitizedState = sanitizeBadTagState(state);
        localStorage.setItem(BAD_TAG_STATE_STORAGE_KEY, JSON.stringify(sanitizedState));
        return sanitizedState;
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
        addQuery(
            titleSet.fields.find((field) => field.index === 0),
            "english",
            "英文标题",
        );
        addQuery(
            titleSet.fields.find((field) => field.index === 1),
            "japanese",
            "日文标题",
        );
        return queries;
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
            (query.kind === "title" &&
                query.coreLength > config.genericTitleLength &&
                hasStrongCandidate)
        );
    }
    function shouldRunJapaneseSearch(currentGallery, candidates, config = DEFAULT_CONFIG) {
        return !Array.from(candidates || []).some((candidate) =>
            isStrongPreviewCandidate(currentGallery, candidate, config),
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
            for (const result of pageResults) {
                if (!resultsByUrl.has(result.url)) {
                    resultsByUrl.set(result.url, {
                        ...result,
                        matchedQueries: [query.text],
                    });
                    newResultCount++;
                }
            }
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
    function canonicalHomepageUrl(url) {
        try {
            const parsedUrl = new URL(url || "/", location.origin);
            return parsedUrl.origin !== location.origin ||
                parsedUrl.pathname !== "/" ||
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
    // 5. 直连写入与错误标签处理
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
        const normalizedTag = normalizeTag(tag);
        const tagRow =
            Array.from(documentNode.querySelectorAll('#taglist div[id^="td_"]')).find(
                (candidateRow) => {
                    const anchor = candidateRow.querySelector("a");
                    return anchor && readTagFromAnchor(anchor) === normalizedTag;
                },
            ) || null;
        const tagAnchor = tagRow?.querySelector("a");
        return {
            exists: Boolean(tagAnchor),
            upvoted: tagAnchor?.classList.contains("tup") === true,
            downvoted: tagAnchor?.classList.contains("tdn") === true,
        };
    }
    function createTagVoteResponseError(message, status = 0) {
        const error = new Error(message);
        error.name = "TagVoteResponseUnknownError";
        if (status) error.status = status;
        return error;
    }
    function submitTagVoteRequest(writeContext, tags, vote, signal) {
        const payload = buildTagGalleryPayload(writeContext, tags, vote);
        if (!payload.tags) return Promise.resolve({});
        consumeTrackedRequest(`标签投票 ${writeContext.gid}`);
        return runRequestLifecycle({
            signal: signal,
            createTimeoutFailure: () => createTagVoteResponseError("标签接口响应超时"),
            start({ resolve: resolveRequest, reject: rejectRequest }) {
                const request = new XMLHttpRequest();
                request.open("POST", writeContext.apiUrl, true);
                request.setRequestHeader("Content-Type", "application/json");
                request.setRequestHeader("Accept", "application/json");
                request.withCredentials = true;
                request.onload = () => {
                    if (request.status < 200 || request.status >= 300) {
                        rejectRequest(
                            createTagVoteResponseError(
                                `标签接口 HTTP ${request.status}`,
                                request.status,
                            ),
                        );
                        return;
                    }
                    let responsePayload;
                    try {
                        responsePayload = JSON.parse(request.responseText || "{}");
                    } catch {
                        rejectRequest(createTagVoteResponseError("标签接口返回了无法识别的响应"));
                        return;
                    }
                    if (responsePayload?.login != null) {
                        const authError = new Error("标签接口要求重新登录");
                        authError.name = "TagVoteAuthError";
                        rejectRequest(authError);
                        return;
                    }
                    if (responsePayload?.error != null) {
                        const apiError = new Error(String(responsePayload.error));
                        apiError.name = isBadTagVoteLockedMessage(apiError.message)
                            ? "BadTagVoteLockedError"
                            : "TagVoteApiError";
                        rejectRequest(apiError);
                        return;
                    }
                    resolveRequest(responsePayload);
                };
                request.onerror = () =>
                    rejectRequest(createTagVoteResponseError("标签接口网络失败"));
                request.onabort = () => rejectRequest(createAbortError());
                request.send(JSON.stringify(payload));
                return () => request.abort();
            },
        });
    }
    async function submitTagVoteAndVerify(snapshot, tags, vote, signal) {
        if (!canStartVerifiedTagVote(runtimeState.requestBudget)) {
            const error = new Error("剩余请求不足以完成标签投票和写后验证");
            error.name = "RequestBudgetError";
            throw error;
        }
        let voteError = null;
        try {
            await submitTagVoteRequest(snapshot.writeContext, tags, vote, signal);
        } catch (error) {
            if (["AbortError", "RequestBudgetError", "BadTagVoteLockedError"].includes(error.name))
                throw error;
            voteError = error;
        }
        await delay(RUNTIME_LIMITS.directVoteVerifyDelayMs, signal);
        return {
            snapshot: await fetchGallerySnapshot(snapshot.url, signal),
            voteError: voteError,
        };
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
        if (strategy === "already-downvoted")
            return {
                status: "already-downvoted",
            };
        if (strategy === "already-missing")
            return {
                status: "already-missing",
            };
        if (!snapshot.writeContext)
            return {
                status: "vote-api-unavailable",
            };
        let withdrewUpvote = false;
        if (strategy === "withdraw-and-downvote") {
            const withdrawResult = await submitTagVoteAndVerify(snapshot, [record.tag], -1, signal);
            snapshot = withdrawResult.snapshot;
            if (snapshot.unavailable)
                return {
                    status: "gallery-unavailable",
                };
            voteState = getTagVoteState(snapshot.doc, record.tag);
            if (!voteState.exists)
                return {
                    status: "already-missing",
                };
            if (voteState.downvoted)
                return {
                    status: "withdrawn-and-downvoted",
                };
            if (voteState.upvoted)
                throw withdrawResult.voteError || new Error("撤销赞成票后状态没有变化");
            withdrewUpvote = true;
            if (!snapshot.writeContext)
                return {
                    status: "vote-api-unavailable",
                };
        }
        voteState = getTagVoteState(snapshot.doc, record.tag);
        if (!voteState.exists)
            return {
                status: "already-missing",
            };
        if (voteState.downvoted)
            return {
                status: withdrewUpvote ? "withdrawn-and-downvoted" : "already-downvoted",
            };
        const voteResult = await submitTagVoteAndVerify(snapshot, [record.tag], -1, signal);
        snapshot = voteResult.snapshot;
        if (snapshot.unavailable)
            return {
                status: "gallery-unavailable",
            };
        voteState = getTagVoteState(snapshot.doc, record.tag);
        if (!voteState.exists)
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
        return BAD_TAG_OUTCOME_META[status]?.terminal === true;
    }
    function logBadTagResult(level, record, message) {
        appendLog(level, `${record.gid} ${record.tag}：${message}`, record.galleryUrl, true);
    }
    function fetchRepositoryText(url, signal) {
        return withReadRetry(
            () => {
                if (typeof GM_xmlhttpRequest !== "function")
                    throw new Error("当前脚本管理器不支持 GM_xmlhttpRequest");
                consumeTrackedRequest("读取错误标签列表");
                return runRequestLifecycle({
                    signal: signal,
                    createTimeoutFailure: () =>
                        createTimeoutError(
                            `读取错误标签页超时（${RUNTIME_LIMITS.fetchTimeoutMs / 1_000} 秒）`,
                        ),
                    start({ resolve: resolveRequest, reject: rejectRequest }) {
                        const request = GM_xmlhttpRequest({
                            method: "GET",
                            url: url,
                            anonymous: false,
                            headers: { Accept: "text/html" },
                            onload(response) {
                                if (response.status < 200 || response.status >= 300) {
                                    const error = new Error(
                                        `错误标签页 HTTP ${response.status}`,
                                    );
                                    error.status = response.status;
                                    rejectRequest(error);
                                    return;
                                }
                                resolveRequest(response.responseText);
                            },
                            onerror(event) {
                                const error = new Error("无法读取错误标签页");
                                error.name = "TypeError";
                                if (Number(event?.status) > 0) {
                                    error.status = Number(event.status);
                                }
                                rejectRequest(error);
                            },
                            onabort() {
                                rejectRequest(createAbortError());
                            },
                        });
                        return () => request?.abort();
                    },
                });
            },
            signal,
            "错误标签页读取失败",
        );
    }
    async function processBadTags(config, signal, { reviewKnown: reviewKnown = false } = {}) {
        if (!config.badTagEnabled) return;
        if (!config.uid) {
            appendLog("warn", "已启用错误标签检查，但脚本参数区尚未填写用户 UID");
            return;
        }
        const repositoryUrl = `https://repo.e-hentai.org/tools/taglist?uid=${encodeURIComponent(config.uid)}&badtags=1`,
            html = await fetchRepositoryText(repositoryUrl, signal),
            documentNode = new DOMParser().parseFromString(html, "text/html");
        if (!documentNode.querySelector("#usertaglist"))
            throw new Error("错误标签页结构异常或当前无法访问");
        const report = parseBadTagReport(documentNode, repositoryUrl, {
                uid: config.uid,
                repositoryUrl: repositoryUrl,
            }),
            records = report.records;
        runtimeState.badTagAudit = report.audit;
        let state = loadBadTagState(config.uid);
        const knownFingerprints = new Set(state.knownFingerprints),
            batch = selectBadTagBatch(records, state, reviewKnown);
        if (!batch.totalPending) {
            setStatus(`错误标签检查完成：${records.length} 条记录均已处理`);
            return;
        }
        function markKnown(record) {
            knownFingerprints.add(badTagRecordFingerprint(record));
            state.knownFingerprints = Array.from(knownFingerprints);
            state = saveBadTagState(state);
        }
        appendLog(
            "warn",
            reviewKnown
                ? `重新检查 ${batch.totalPending} 条当前错误标签记录（本轮 ${batch.records.length} 条）`
                : `发现 ${batch.totalPending} 条待处理错误标签记录（本轮 ${batch.records.length} 条）`,
        );
        for (const record of batch.records) {
            if (shouldStopAutomaticWork(config)) break;
            if (signal.aborted) throw createAbortError();
            try {
                const result = await correctBadTagRecord(record, signal),
                    outcomeMeta = BAD_TAG_OUTCOME_META[result.status] || {
                        level: "warn",
                        message: `未知结果 ${result.status}`,
                    };
                if (isTerminalBadTagStatus(result.status)) markKnown(record);
                logBadTagResult(outcomeMeta.level, record, outcomeMeta.message);
            } catch (error) {
                if (["AbortError", "RequestBudgetError"].includes(error.name)) throw error;
                if (error.name === "BadTagVoteLockedError") {
                    markKnown(record);
                    logBadTagResult("skip", record, "站点已锁定历史赞成票，无法撤销或改踩");
                } else {
                    logBadTagResult("warn", record, `暂未处理：${error.message}`);
                }
            }
            if (!shouldStopAutomaticWork(config)) {
                await randomDelay(
                    RUNTIME_LIMITS.actionDelayMinMs,
                    RUNTIME_LIMITS.actionDelayMaxMs,
                    signal,
                );
            }
        }
        const remaining = reviewKnown
            ? batch.remaining
            : selectBadTagRecords(records, state, false).length;
        if (remaining) setStatus(`尚有 ${remaining} 条错误标签，将在后续周期继续处理`);
    }
    function isBadTagVoteLockedMessage(message) {
        return /vote can no longer be withdrawn/i.test(String(message || ""));
    }
    function findTagsNeedingUpvote(documentNode, tags, respectDownvotes) {
        const tagMap = new Map(parseGalleryTags(documentNode).map((tag) => [tag.tag, tag]));
        return tags.filter((tag) => {
            const state = tagMap.get(tag);
            return (
                !state ||
                (!state.solid && !state.voted && !(respectDownvotes && state.downvoted))
            );
        });
    }
    function reconcileTagVoteBatch(documentNode, tags) {
        const failedTags = findTagsNeedingUpvote(documentNode, tags, false);
        return {
            confirmed: tags.length - failedTags.length,
            failedTags: failedTags,
            shouldRetry: false,
        };
    }
    function logCorrectionAudit(level, message, audit, action = audit?.action) {
        if (!audit || !action) return;
        const details = { ...audit, action: action },
            key = `${details.targetUrl}|${details.tag}|${details.reason}`;
        if (runtimeState.correctionLogKeys.has(key)) return;
        runtimeState.correctionLogKeys.add(key);
        appendLog(level, message, details.targetUrl, true, details);
    }
    function logTargetCorrectionPolicy(policy) {
        const audit = policy.audit;
        if (!audit || audit.action === "derived") return;
        const messages = {
                blacklisted: "黑名单已阻止标题派生 other:uncensored",
                "below-minimum-pages": "目标页数不足，已跳过标题派生 other:uncensored",
                conflict: "标题修正状态冲突，已拦截 other:uncensored",
                unknown: "标题修正状态存在否定表达，已拦截 other:uncensored",
                "classifier-error": "标题修正状态分类失败，已安全拦截 other:uncensored",
                "source-blocked": "目标标题不兼容，已拦截来源的 other:uncensored",
            },
            level = ["blacklisted", "below-minimum-pages"].includes(audit.action)
                ? "skip"
                : audit.action === "classifier-error"
                  ? "error"
                  : "warn";
        logCorrectionAudit(level, messages[audit.action], audit);
    }
    function logDownvotedTags(target, tagPlan, correctionAudit) {
        const ordinaryTags = tagPlan.downvotedTags.filter(
            (tag) => tag !== SENSITIVE_UNCENSORED_TAG,
        );
        if (ordinaryTags.length) {
            appendLog(
                "warn",
                `尊重人工踩票，跳过 ${ordinaryTags.length} 个标签：${ordinaryTags.join(", ")}`,
                target.url,
                true,
            );
        }
        if (tagPlan.downvotedTags.includes(SENSITIVE_UNCENSORED_TAG) && correctionAudit) {
            logCorrectionAudit(
                "warn",
                "目标已有人工踩票，未重新赞成 other:uncensored",
                {
                    ...correctionAudit,
                    reason: "当前用户已踩过该标签",
                },
                "user-downvoted",
            );
        }
    }
    function logDerivedTagResult(policy, isConfirmed, message = "") {
        const audit = policy.audit;
        if (!audit || audit.action !== "derived") return;
        logCorrectionAudit(
            isConfirmed ? "ok" : "warn",
            isConfirmed
                ? "已按明确标题确认 other:uncensored"
                : `标题派生 other:uncensored 未确认${message ? `：${message}` : ""}`,
            {
                ...audit,
                reason: isConfirmed
                    ? "标题派生标签已通过写后验证"
                    : message || "标题派生标签未通过写后验证",
            },
            isConfirmed ? "derived-confirmed" : "derived-failed",
        );
    }
    async function transferTagsToTarget(target, transferContext) {
        const {
                current: current,
                union: union,
                blacklist: blacklist,
                sensitiveSourceUrls: sensitiveSourceUrls,
                isTransferTarget: isTransferTarget,
                targetPolicy: targetPolicy,
                randomSkippedTags: randomSkippedTags,
                config: config,
                signal: signal,
            } = transferContext,
            cachedSnapshot = gallerySnapshotCache.get(target),
            randomSkippedTagSet = randomSkippedTags || new Set();
        setStatus(`处理 ${target.language}：${target.url}`);
        let snapshot = cachedSnapshot || (await fetchGallerySnapshot(target.url, signal));
        if (snapshot.unavailable || !snapshot.gallery) {
            appendLog("warn", `写入前画廊已失效：${target.url}`);
            return {
                submitted: 0,
                failed: isTransferTarget
                    ? union.filter((tag) => !randomSkippedTagSet.has(tag)).length
                    : 0,
                derivedConsidered: false,
                hadPlannedTags: false,
            };
        }
        const targetGallery = validateGallery(snapshot.gallery),
            assessment =
                cachedSnapshot || target.url === current.url
                    ? {
                          accepted: true,
                      }
                    : assessCandidate(current, targetGallery, config);
        if (!assessment.accepted) {
            appendLog(
                "skip",
                `写入前验证失败，跳过 ${target.url}（${assessment.reason}）`,
                target.url,
                true,
            );
            return {
                submitted: 0,
                failed: 0,
                derivedConsidered: false,
                hadPlannedTags: false,
            };
        }
        const policy =
                targetPolicy ||
                buildTargetTagSet(
                    targetGallery,
                    isTransferTarget ? union : [],
                    blacklist,
                    isTransferTarget ? sensitiveSourceUrls : [],
                    targetGallery.pageCount >= config.minGalleryPages,
                ),
            effectiveTags = policy.tags.filter((tag) => !randomSkippedTagSet.has(tag)),
            tagPlan = planTargetTags(effectiveTags, targetGallery.tags),
            derivedTags = new Set(policy.derivedTags);
        logTargetCorrectionPolicy(policy);
        logDownvotedTags(targetGallery, tagPlan, policy.audit);
        setStatus(
            `待迁移 ${tagPlan.pending.length}，已实线 ${tagPlan.skippedSolid}，已投票 ${tagPlan.skippedVoted}，已踩 ${tagPlan.skippedDownvoted}`,
        );
        if (!tagPlan.pending.length)
            return {
                submitted: 0,
                failed: 0,
                derivedConsidered: policy.correction.state === "explicit-uncensored",
                hadPlannedTags: Boolean(effectiveTags.length),
            };
        const tagInput = snapshot.doc.querySelector("#newtagfield"),
            maxLength = tagInput?.maxLength > 0 ? tagInput.maxLength : 200,
            batches = buildTagBatches(tagPlan.pending, maxLength);
        let submitted = 0,
            failed = 0;
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            if (signal.aborted) throw createAbortError();
            const currentBatchPlan = planTargetTags(
                    batches[batchIndex],
                    parseGalleryTags(snapshot.doc),
                ),
                pendingTags = currentBatchPlan.pending,
                derivedPendingTags = pendingTags.filter((tag) => derivedTags.has(tag)),
                ordinaryPendingTags = pendingTags.filter((tag) => !derivedTags.has(tag));
            logDownvotedTags(snapshot.gallery || targetGallery, currentBatchPlan, policy.audit);
            if (!pendingTags.length) continue;
            if (!snapshot.writeContext) {
                failed += ordinaryPendingTags.length;
                appendLog("warn", `直连投票凭据不可用，未提交：${pendingTags.join(", ")}`);
                if (derivedPendingTags.length)
                    logDerivedTagResult(policy, false, "直连投票凭据不可用");
                continue;
            }
            setStatus(
                `直连提交 ${batchIndex + 1}/${batches.length}（${pendingTags.length} 个）`,
            );
            let voteResult;
            try {
                voteResult = await submitTagVoteAndVerify(snapshot, pendingTags, 1, signal);
            } catch (error) {
                if (["AbortError", "RequestBudgetError"].includes(error.name)) throw error;
                failed += ordinaryPendingTags.length;
                if (ordinaryPendingTags.length) {
                    appendLog(
                        "warn",
                        `标签写入或验证失败：${ordinaryPendingTags.join(", ")}：${error.message}`,
                        targetGallery.url,
                    );
                }
                if (derivedPendingTags.length) logDerivedTagResult(policy, false, error.message);
                continue;
            }
            snapshot = voteResult.snapshot;
            const reconciliation = snapshot.unavailable
                ? {
                      confirmed: 0,
                      failedTags: pendingTags,
                      shouldRetry: false,
                  }
                : reconcileTagVoteBatch(snapshot.doc, pendingTags);
            const failedTagSet = new Set(reconciliation.failedTags),
                confirmedTags = pendingTags.filter((tag) => !failedTagSet.has(tag)),
                failedDerivedTags = reconciliation.failedTags.filter((tag) => derivedTags.has(tag)),
                failedOrdinaryTags = reconciliation.failedTags.filter(
                    (tag) => !derivedTags.has(tag),
                );
            submitted += confirmedTags.length;
            failed += failedOrdinaryTags.length;
            if (confirmedTags.some((tag) => derivedTags.has(tag))) {
                logDerivedTagResult(policy, true);
            }
            if (failedDerivedTags.length) {
                logDerivedTagResult(
                    policy,
                    false,
                    voteResult.voteError?.message || "写后仍未观察到标签",
                );
            }
            if (failedOrdinaryTags.length) {
                const errorSuffix = voteResult.voteError ? `：${voteResult.voteError.message}` : "";
                appendLog(
                    "warn",
                    `写后复核仍未确认（本轮不重复投票）：${failedOrdinaryTags.join(", ")}${errorSuffix}`,
                    targetGallery.url,
                );
            }
            if (batchIndex + 1 < batches.length) {
                await randomDelay(
                    RUNTIME_LIMITS.actionDelayMinMs,
                    RUNTIME_LIMITS.actionDelayMaxMs,
                    signal,
                );
            }
        }
        return {
            submitted: submitted,
            failed: failed,
            derivedConsidered: policy.correction.state === "explicit-uncensored",
            hadPlannedTags: Boolean(effectiveTags.length),
        };
    }
    // 6. 搜索管线与迁移编排
    async function discoverSearchCandidates(currentGallery, config, signal) {
        const queries = buildSearchQueries(currentGallery),
            candidatesByUrl = new Map(),
            sameLanguageUrls = new Set();
        async function runQueryStage(stage) {
            for (const query of queries.filter((candidateQuery) => candidateQuery.stage === stage)) {
                if (signal.aborted) throw createAbortError();
                setStatus(`搜索 ${query.label}`);
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
        await runQueryStage("english");
        shouldRunJapaneseSearch(currentGallery, candidatesByUrl.values(), config) &&
            (await runQueryStage("japanese"));
        setStatus(
            `搜索得到 ${candidatesByUrl.size} 个去重候选` +
                (sameLanguageUrls.size ? `，提前跳过同语言 ${sameLanguageUrls.size} 个` : ""),
        );
        return Array.from(candidatesByUrl.values());
    }
    function prefilterSearchCandidates(currentGallery, candidates, config) {
        const acceptedCandidates = [];
        for (const candidate of candidates) {
            const assessment = assessCandidate(currentGallery, candidate, config);
            if (assessment.accepted) {
                acceptedCandidates.push({ ...candidate, assessment: assessment });
            }
        }
        return acceptedCandidates;
    }
    function chooseProgressiveDetailCandidates(candidates, config) {
        if (config.transferDirection === "newest") {
            setStatus(`单向模式将读取 ${candidates.length} 个初筛候选`);
            return [...candidates];
        }
        const candidatesByLanguage = new Map(),
            selectedCandidates = [];
        for (const candidate of candidates) {
            const language = candidate.language || "unknown";
            candidatesByLanguage.has(language) || candidatesByLanguage.set(language, []);
            candidatesByLanguage.get(language).push(candidate);
        }
        for (const languageCandidates of candidatesByLanguage.values()) {
            languageCandidates.sort(
                (leftCandidate, rightCandidate) =>
                    rightCandidate.assessment.score - leftCandidate.assessment.score,
            );
            selectedCandidates.push(
                ...languageCandidates.slice(0, RUNTIME_LIMITS.detailCandidatesPerLanguage),
            );
        }
        return selectedCandidates;
    }
    async function loadProgressiveCandidateDetails(currentGallery, candidates, config, signal) {
        const fullCandidates = [];
        for (const candidate of chooseProgressiveDetailCandidates(candidates, config)) {
            if (signal.aborted) throw createAbortError();
            try {
                const snapshot = await fetchGallerySnapshot(candidate.url, signal);
                if (snapshot.unavailable || !snapshot.gallery)
                    throw new Error("候选画廊已失效");
                const gallery = snapshot.gallery;
                gallery.matchedQueries = candidate.matchedQueries;
                if (!gallery.titleRefs.some(Boolean) || !Number.isInteger(gallery.pageCount))
                    throw new Error("画廊元数据不完整");
                const assessment = assessCandidate(currentGallery, gallery, config);
                if (
                    assessment.accepted &&
                    !(gallery.language === currentGallery.language &&
                        currentGallery.language !== "unknown")
                ) {
                    gallery.assessment = assessment;
                    fullCandidates.push(gallery);
                }
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
        return fullCandidates;
    }
    function selectFinalSearchCandidates(candidates, config) {
        const selection = selectTransferCandidates(
            candidates,
            config.transferDirection,
            config.minCandidateScoreGap,
        );
        return selection.accepted;
    }
    function announceSearchPhase(phase) {
        setStatus(`搜索阶段：${phase}`);
    }
    async function runSearchPipeline(currentGallery, config, signal) {
        announceSearchPhase(SEARCH_PHASES.discovery);
        const discoveredCandidates = await SEARCH_PIPELINE.discover(
            currentGallery,
            config,
            signal,
        );
        announceSearchPhase(SEARCH_PHASES.prefilter);
        const prefilteredCandidates = SEARCH_PIPELINE.prefilter(
            currentGallery,
            discoveredCandidates,
            config,
        );
        announceSearchPhase(SEARCH_PHASES.progressiveDetails);
        const detailedCandidates = await SEARCH_PIPELINE.loadProgressiveDetails(
            currentGallery,
            prefilteredCandidates,
            config,
            signal,
        );
        announceSearchPhase(SEARCH_PHASES.finalSelection);
        return SEARCH_PIPELINE.selectFinal(detailedCandidates, config);
    }
    async function executeTransferPlan(runId, currentGallery, config, signal) {
        setStatus(
            `种子：${currentGallery.language}，${currentGallery.pageCount} 页，${currentGallery.tags.length} 个标签`,
        );
        if (currentGallery.pageCount < config.minGalleryPages) {
            appendLog("skip", `画廊少于 ${config.minGalleryPages} 页，跳过`, "", true);
            return {
                status: "short",
                galleries: [currentGallery],
                submitted: 0,
                failed: 0,
            };
        }
        const candidates = await SEARCH_PIPELINE.run(currentGallery, config, signal),
            galleries = [currentGallery, ...candidates],
            transferPlan = candidates.length
                ? buildTransferPlan(galleries, config.transferDirection)
                : { sources: [], targets: [], newest: null },
            blacklist = compileBlacklist(config.blacklist),
            tagUnion = buildTransferTagUnion(
                transferPlan.sources,
                config.mode,
                blacklist,
            ),
            sensitiveSourceUrls = tagUnion.includes(SENSITIVE_UNCENSORED_TAG)
                ? collectTagSourceUrls(
                      transferPlan.sources,
                      SENSITIVE_UNCENSORED_TAG,
                      config.mode,
                  )
                : [],
            transferTargetUrls = new Set(transferPlan.targets.map((target) => target.url)),
            targets = [],
            targetUrls = new Set();
        for (const target of [currentGallery, ...transferPlan.targets]) {
            if (!targetUrls.has(target.url)) {
                targetUrls.add(target.url);
                targets.push(target);
            }
        }
        const plannedTargets = targets.map((target) => {
                const isTransferTarget = transferTargetUrls.has(target.url),
                    policy = buildTargetTagSet(
                        target,
                        isTransferTarget ? tagUnion : [],
                        blacklist,
                        isTransferTarget ? sensitiveSourceUrls : [],
                        target.pageCount >= config.minGalleryPages,
                    );
                return {
                    target: target,
                    isTransferTarget: isTransferTarget,
                    policy: policy,
                    pendingTags: planTargetTags(policy.tags, target.tags).pending,
                };
            }),
            randomSkipPlan = planRandomTagSkip(
                plannedTargets.flatMap((targetPlan) => targetPlan.pendingTags),
                config,
            ),
            randomSkippedTags = new Set(randomSkipPlan.skippedTags);
        if (randomSkipPlan.actualCount) {
            appendLog(
                "skip",
                `随机省略 ${randomSkipPlan.actualCount} 个标签`,
                currentGallery.url,
                true,
                null,
                {
                    rangeMin: config.randomTagSkipMin,
                    rangeMax: config.randomTagSkipMax,
                    eligibleCount: randomSkipPlan.eligibleCount,
                    skippedTags: randomSkipPlan.skippedTags,
                },
            );
        }
        setStatus(
            `迁移集合 ${tagUnion.length} 个标签（${config.mode === "solid" ? "仅实线" : "全部"}；${targets.length} 个目标；随机省略 ${randomSkipPlan.actualCount}）`,
        );
        let submitted = 0,
            failed = 0,
            derivedConsidered = false,
            hadPlannedTags = false;
        for (let targetIndex = 0; targetIndex < plannedTargets.length; targetIndex++) {
            if (signal.aborted || runId !== runtimeState.runId) throw createAbortError();
            const targetPlan = plannedTargets[targetIndex],
                target = targetPlan.target;
            setStatus(`迁移 ${targetIndex + 1}/${targets.length}：${target.language}`);
            const result = await transferTagsToTarget(target, {
                current: currentGallery,
                union: tagUnion,
                blacklist: blacklist,
                sensitiveSourceUrls: sensitiveSourceUrls,
                isTransferTarget: targetPlan.isTransferTarget,
                targetPolicy: targetPlan.policy,
                randomSkippedTags: randomSkippedTags,
                config: config,
                signal: signal,
            });
            submitted += result.submitted;
            failed += result.failed;
            derivedConsidered ||= result.derivedConsidered;
            hadPlannedTags ||= result.hadPlannedTags;
        }
        if (!candidates.length) {
            appendLog("skip", "没有通过完整复核的其他语言画廊", currentGallery.url, true);
        } else {
            appendLog(
                failed ? "warn" : "ok",
                `迁移结束：确认 ${submitted} 个，未确认 ${failed} 个`,
                "",
                true,
            );
        }
        return {
            status: failed
                ? "partial"
                : !candidates.length
                  ? derivedConsidered
                      ? "derived-only"
                      : "no-related"
                  : hadPlannedTags
                    ? "completed"
                    : "empty",
            galleries: galleries,
            submitted: submitted,
            failed: failed,
            randomlySkipped: randomSkipPlan.actualCount,
        };
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
        const currentGallery = validateGallery(parseGalleryDocument(document, location.href));
        rememberGallerySnapshot({
            url: currentGallery.url,
            status: 200,
            unavailable: false,
            doc: document,
            gallery: currentGallery,
            writeContext: parseGalleryWriteContext(document, currentGallery.url),
        });
        const result = await executeTransferPlan(runId, currentGallery, config, signal);
        setStatus(
            result.status === "no-related"
                ? "完成：没有可迁移目标"
                : result.status === "derived-only"
                  ? `完成：仅标题派生，确认 ${result.submitted}`
                : `完成：确认 ${result.submitted}，未确认 ${result.failed}`,
        );
    }
    async function scanHomepage(config, signal) {
        let homeState = loadHomeState();
        if (!homeState.initializedAt) {
            const mergeResult = mergeHomepageResults(
                homeState,
                parseSearchResults(document, location.origin),
                config,
            );
            homeState = saveHomeState(mergeResult.home);
            appendLog(
                "info",
                `主页基线已建立（${mergeResult.baselineCount} 个画廊），未回溯历史`,
                "",
                true,
            );
            return { home: homeState, initialized: true };
        }

        const seenGids = new Set(homeState.seenGids);
        let nextUrl = canonicalHomepageUrl(homeState.scanCursor) || `${location.origin}/`;
        let savedCursor = "";
        let reachedSeenGallery = false;
        const results = [];
        for (let pageIndex = 0; pageIndex < config.homeScanPages && nextUrl; pageIndex++) {
            const documentNode = await fetchDocument(nextUrl, signal);
            const pageResults = parseSearchResults(documentNode, location.origin);
            results.push(...pageResults);
            if (pageResults.some((result) => seenGids.has(galleryIdFromUrl(result.url)))) {
                reachedSeenGallery = true;
                break;
            }
            const nextHref = documentNode.querySelector("#dnext[href]")?.getAttribute("href");
            savedCursor = canonicalHomepageUrl(nextHref ? new URL(nextHref, nextUrl).href : "");
            nextUrl = savedCursor;
            if (shouldStopAutomaticWork(config)) break;
            if (nextUrl) {
                await randomDelay(
                    RUNTIME_LIMITS.discoveryDelayMinMs,
                    RUNTIME_LIMITS.discoveryDelayMaxMs,
                    signal,
                );
            }
        }
        const mergeResult = mergeHomepageResults(homeState, results, config);
        homeState = mergeResult.home;
        homeState.scanCursor = reachedSeenGallery ? "" : savedCursor;
        homeState = saveHomeState(homeState);
        appendLog(
            mergeResult.queued ? "ok" : "skip",
            `主页扫描：新增队列 ${mergeResult.queued}，短画廊跳过 ${mergeResult.skippedShort}`,
            "",
            true,
        );
        if (homeState.scanCursor) {
            appendLog("warn", "新增画廊超过本轮扫描上限，已保存翻页游标供下轮继续");
        }
        return { home: homeState, initialized: false };
    }
    async function processHomepage(runId, config, signal) {
        const scanResult = await scanHomepage(config, signal);
        if (scanResult.initialized) {
            setStatus("主页基线已建立；等待新画廊");
            return;
        }
        if (shouldStopAutomaticWork(config)) {
            setStatus("已到自动运行结束时间，主页扫描结果已保存");
            return;
        }
        let homeState = scanResult.home;
        if (!findReadyHomeJob(homeState)) {
            setStatus(`主页扫描完成：队列 ${homeState.queue.length}`);
            return;
        }
        let checkedCount = 0,
            writtenCount = 0;
        for (;;) {
            if (shouldStopAutomaticWork(config)) break;
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
            beginHomeJob(homeState, job.gid);
            setStatus(`主页连续任务 ${checkedCount + 1}：${job.gid}`);
            try {
                const snapshot = await fetchGallerySnapshot(job.url, signal);
                if (snapshot.unavailable || !snapshot.gallery)
                    throw new Error("主页任务画廊已失效");
                const gallery = validateGallery(snapshot.gallery),
                    result = await executeTransferPlan(runId, gallery, config, signal);
                checkedCount++;
                const disposition = getHomeJobDisposition(result);
                if (disposition.action === "retry") {
                    homeState = retryHomeJob(homeState, job.gid, disposition.reason);
                    appendLog("warn", `${job.gid} 将延迟重试：${disposition.reason}`);
                } else {
                    homeState = completeHomeGroup(homeState, result.galleries);
                    if (result.submitted > 0) writtenCount++;
                    if (disposition.reason) {
                        appendLog(
                            "skip",
                            `${job.gid} 已检查：${disposition.reason}，任务已移出队列`,
                            job.url,
                            true,
                        );
                    }
                }
                homeState = saveHomeState(homeState);
            } catch (error) {
                if (error.name === "AbortError") throw error;
                if (error.name === "RequestBudgetError") {
                    preserveHomeJobAfterBudget(homeState, job.gid);
                    setStatus(`${job.gid} 因请求预算到达边界而保留，下一轮继续`);
                    break;
                }
                homeState = retryHomeJob(homeState, job.gid, error);
                homeState = saveHomeState(homeState);
                appendLog("warn", `${job.gid} 处理失败：${error.message}`);
            }
        }
        setStatus(
            `主页任务完成：检查 ${checkedCount}，写入 ${writtenCount}，队列 ${homeState.queue.length}`,
        );
    }
    function setStatus(message) {
        if (runtimeState.ui?.status) runtimeState.ui.status.textContent = message;
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
    function sanitizeCorrectionLogDetails(details) {
        if (!details) return null;
        const normalizeList = (values) =>
                Array.from(
                    new Set((Array.isArray(values) ? values : []).map(normalizeWhitespace).filter(Boolean)),
                ),
            targetUrl = sanitizeLogUrl(details.targetUrl),
            tag = normalizeTag(details.tag);
        if (!targetUrl || !tag) return null;
        return {
            tag: tag,
            targetUrl: targetUrl,
            titleGn: normalizeWhitespace(details.titleGn),
            titleGj: normalizeWhitespace(details.titleGj),
            state: normalizeWhitespace(details.state),
            action: normalizeWhitespace(details.action),
            reason: normalizeWhitespace(details.reason),
            positiveMarkers: normalizeList(details.positiveMarkers),
            negativeMarkers: normalizeList(details.negativeMarkers),
            negatedMarkers: normalizeList(details.negatedMarkers),
            sourceUrls: Array.from(
                new Set((details.sourceUrls || []).map(sanitizeLogUrl).filter(Boolean)),
            ),
        };
    }
    function sanitizeRandomSkipLogDetails(details) {
        if (!details) return null;
        const skippedTags = Array.from(
                new Set((details.skippedTags || []).map(normalizeTag).filter(Boolean)),
            ).sort(),
            requestedRangeMin = clampInteger(details.rangeMin, 0, 0, 1_000),
            requestedRangeMax = clampInteger(details.rangeMax, 0, 0, 1_000);
        if (!skippedTags.length) return null;
        return {
            rangeMin: Math.min(requestedRangeMin, requestedRangeMax),
            rangeMax: Math.max(requestedRangeMin, requestedRangeMax),
            eligibleCount: Math.max(
                skippedTags.length,
                Math.floor(Number(details.eligibleCount) || 0),
            ),
            actualCount: skippedTags.length,
            skippedTags: skippedTags,
        };
    }
    function createLogEntry(
        level,
        message,
        galleryUrl = "",
        date = new Date(),
        correction = null,
        randomSkip = null,
    ) {
        const timestamp = date instanceof Date ? date : new Date(date),
            entry = {
                timestamp: timestamp.toISOString(),
                localTime: timestamp.toLocaleTimeString(),
                level: String(level || "info"),
                message: String(message || ""),
                galleryUrl: sanitizeLogUrl(galleryUrl),
            },
            sanitizedCorrection = sanitizeCorrectionLogDetails(correction),
            sanitizedRandomSkip = sanitizeRandomSkipLogDetails(randomSkip);
        if (sanitizedCorrection) entry.correction = sanitizedCorrection;
        if (sanitizedRandomSkip) entry.randomSkip = sanitizedRandomSkip;
        return entry;
    }
    function trimLogEntries(entries, limit = 1_000) {
        const maxEntries = Math.max(0, Math.floor(Number(limit) || 0));
        if (!maxEntries) entries.length = 0;
        else if (entries.length > maxEntries) entries.splice(0, entries.length - maxEntries);
        return entries;
    }
    function formatLogEntry(entry) {
        const url = sanitizeLogUrl(entry.galleryUrl);
        return `[${entry.timestamp}] [${String(entry.level || "info").toUpperCase()}] ${String(entry.message || "")}${url ? ` ${url}` : ""}`;
    }
    function buildBadTagAuditExportText(audit) {
        if (!audit)
            return [
                "[错误标签审计]",
                "状态: 本页会话尚未自动记录错误标签页",
            ].join("\r\n");
        const lines = [
            "[错误标签审计]",
            `记录时间: ${audit.recordedAt}`,
            `用户 UID: ${audit.uid || "未知"}`,
            `来源: ${audit.repositoryUrl || "未知"}`,
            `错误画廊数: ${audit.galleryCount}`,
            `错误标签记录数: ${audit.badTagRecordCount}`,
            `不同错误标签数: ${audit.uniqueBadTagCount}`,
            "",
            "[错误标签频次 TSV]",
            "次数\t画廊数\t标签",
            ...audit.tagCounts.map(
                (count) => `${count.count}\t${count.galleryCount}\t${count.tag}`,
            ),
            "",
            "[黑名单候选（一行一个）]",
            ...audit.tagCounts.map((count) => count.tag),
            "",
            "[错误画廊明细]",
        ];
        audit.galleries.forEach((gallery, index) => {
            lines.push(
                "",
                `--- 画廊 ${index + 1} ---`,
                `GID: ${gallery.gid}`,
                `链接: ${gallery.galleryUrl}`,
                `标题: ${gallery.title}`,
                `标题长度: ${gallery.titleLength}`,
                `规范标题长度: ${gallery.normalizedTitleLength}`,
                `全部标签数: ${gallery.tagCount}`,
                `错误标签数: ${gallery.badTagCount}`,
                "错误标签（标签\t记录时间）:",
                ...gallery.badTags.map((record) => `${record.tag}\t${record.timestamp}`),
                "全部标签:",
                ...gallery.tags,
            );
        });
        return lines.join("\r\n");
    }
    function buildCorrectionAuditExportText(entries) {
        const records = entries.filter((entry) => entry.correction);
        if (!records.length)
            return ["[修正状态审计]", "状态: 本页会话没有修正状态动作或阻断"].join(
                "\r\n",
            );
        const lines = ["[修正状态审计]", `记录数: ${records.length}`];
        records.forEach((entry, index) => {
            const audit = entry.correction;
            lines.push(
                "",
                `--- 记录 ${index + 1} ---`,
                `时间: ${entry.timestamp}`,
                `目标: ${audit.targetUrl}`,
                `标签: ${audit.tag}`,
                `GN: ${audit.titleGn || "(空)"}`,
                `GJ: ${audit.titleGj || "(空)"}`,
                `状态: ${audit.state || "未知"}`,
                `动作: ${audit.action || "未知"}`,
                `原因: ${audit.reason || "未提供"}`,
                `正向命中: ${audit.positiveMarkers.join(", ") || "(无)"}`,
                `否定命中: ${audit.negativeMarkers.join(", ") || "(无)"}`,
                `否定短语: ${audit.negatedMarkers.join(", ") || "(无)"}`,
                "相关来源:",
                ...(audit.sourceUrls.length ? audit.sourceUrls : ["(无)"]),
            );
        });
        return lines.join("\r\n");
    }
    function buildRandomSkipAuditExportText(entries) {
        const records = entries.filter((entry) => entry.randomSkip);
        if (!records.length)
            return ["[随机少迁移审计]", "状态: 本页会话没有随机省略标签"].join("\r\n");
        const lines = ["[随机少迁移审计]", `记录数: ${records.length}`];
        records.forEach((entry, index) => {
            const audit = entry.randomSkip;
            lines.push(
                "",
                `--- 记录 ${index + 1} ---`,
                `时间: ${entry.timestamp}`,
                `种子画廊: ${entry.galleryUrl || "未知"}`,
                `配置范围: ${audit.rangeMin}-${audit.rangeMax}`,
                `候选标签数: ${audit.eligibleCount}`,
                `实际省略数: ${audit.actualCount}`,
                "省略标签:",
                ...audit.skippedTags,
            );
        });
        return lines.join("\r\n");
    }
    function buildLogExportText(
        entries,
        {
            version: version = SCRIPT_VERSION,
            site: site = "",
            exportedAt: exportedAt = new Date(),
            badTagAudit: badTagAudit = null,
        } = {},
    ) {
        const date = exportedAt instanceof Date ? exportedAt : new Date(exportedAt),
            origin = site || (typeof location === "undefined" ? "" : location.origin);
        return `\ufeff${[
            "E-Hentai 跨语言画廊 Tag 迁移日志",
            `版本: ${version}`,
            `导出时间: ${date.toISOString()}`,
            `站点: ${origin || "未知"}`,
            `日志条数: ${entries.length}`,
            "",
            ...entries.map(formatLogEntry),
            "",
            buildCorrectionAuditExportText(entries),
            "",
            buildRandomSkipAuditExportText(entries),
            "",
            buildBadTagAuditExportText(badTagAudit),
        ].join("\r\n")}\r\n`;
    }
    function buildLogExportFilename(date = new Date()) {
        const normalizedDate = date instanceof Date ? date : new Date(date),
            pad = (value) => String(value).padStart(2, "0");
        return `eh-tag-transfer-log-${normalizedDate.getFullYear()}${pad(normalizedDate.getMonth() + 1)}${pad(normalizedDate.getDate())}-${pad(normalizedDate.getHours())}${pad(normalizedDate.getMinutes())}${pad(normalizedDate.getSeconds())}.txt`;
    }
    function exportLog() {
        const entries = runtimeState.logEntries.slice(),
            blob = new Blob([
                buildLogExportText(entries, { badTagAudit: runtimeState.badTagAudit }),
            ], {
                type: "text/plain;charset=utf-8",
            }),
            objectUrl = URL.createObjectURL(blob),
            anchor = document.createElement("a");
        anchor.hidden = true;
        anchor.href = objectUrl;
        anchor.download = buildLogExportFilename();
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
        appendLog("ok", `已导出 ${entries.length} 条本页会话日志`, "", true);
    }
    function shouldDeferLogRender(visibilityState) {
        return visibilityState !== "visible";
    }
    function createLogElement(entry) {
        const element = document.createElement("div");
        element.className = `ehtt-log-line ehtt-${entry.level}`;
        element.append(document.createTextNode(`${entry.localTime} ${entry.message}`));
        if (entry.galleryUrl) {
            const link = document.createElement("a");
            link.className = "ehtt-log-link";
            link.href = entry.galleryUrl;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = entry.galleryUrl;
            element.append(document.createTextNode(" "), link);
        }
        return element;
    }
    function canRenderLogs() {
        return (
            Boolean(runtimeState.ui?.logEntries) &&
            !shouldDeferLogRender(document.visibilityState)
        );
    }
    function renderLogEntries() {
        if (!runtimeState.ui?.logEntries) return;
        if (!canRenderLogs()) {
            runtimeState.logDomDirty = true;
            return;
        }
        const fragment = document.createDocumentFragment();
        for (const entry of runtimeState.logEntries.slice(-VISIBLE_LOG_LIMIT))
            fragment.appendChild(createLogElement(entry));
        runtimeState.ui.logEntries.replaceChildren(fragment);
        runtimeState.ui.logEntries.scrollTop = runtimeState.ui.logEntries.scrollHeight;
        runtimeState.logDomDirty = false;
    }
    function appendLog(
        level,
        message,
        galleryUrl = "",
        isImportant = false,
        correction = null,
        randomSkip = null,
    ) {
        if (!isImportant && !["warn", "error"].includes(level)) return;
        const entry = createLogEntry(
            level,
            message,
            galleryUrl,
            new Date(),
            correction,
            randomSkip,
        );
        runtimeState.logEntries.push(entry);
        if (runtimeState.logEntries.length > 1_000) trimLogEntries(runtimeState.logEntries);
        if (["warn", "error"].includes(level)) {
            console[level](
                `${LOG_PREFIX} ${entry.message}` +
                    (entry.galleryUrl ? ` ${entry.galleryUrl}` : ""),
            );
        }
        if (!runtimeState.ui?.logEntries) return;
        if (!canRenderLogs()) {
            runtimeState.logDomDirty = true;
            return;
        }
        runtimeState.ui.logEntries.appendChild(createLogElement(entry));
        while (runtimeState.ui.logEntries.childElementCount > VISIBLE_LOG_LIMIT) {
            runtimeState.ui.logEntries.firstElementChild?.remove();
        }
        runtimeState.ui.logEntries.scrollTop = runtimeState.ui.logEntries.scrollHeight;
    }
    // 7. 定时调度、生命周期与面板
    function clearScheduleTimer() {
        clearTimeout(runtimeState.scheduleTimer);
        runtimeState.scheduleTimer = null;
    }
    function clearLifecycleTimer() {
        clearTimeout(runtimeState.lifecycleTimer);
        runtimeState.lifecycleTimer = null;
    }
    function persistScheduleState(nextRunAt, scheduleWindow = runtimeState.scheduleWindow) {
        if (runtimeState.pageMode !== "home") return;
        const homeState = loadHomeState();
        homeState.nextRunAt = Math.max(0, Number(nextRunAt) || 0);
        homeState.scheduleWindow = sanitizeScheduleWindow(scheduleWindow);
        saveHomeState(homeState);
    }
    function getScheduleState(nextRunAt, now = Date.now()) {
        const normalizedNextRunAt = Math.max(0, Number(nextRunAt) || 0);
        return normalizedNextRunAt ? (normalizedNextRunAt <= now ? "due" : "waiting") : "none";
    }
    function getScheduleSignature(config) {
        return `${config.scheduleStartTime}|${config.scheduleEndTime}|${config.scheduleTimeJitterMinutes}`;
    }
    function getLocalDayStart(timestamp, offsetDays = 0) {
        const dayStart = new Date(Number(timestamp));
        dayStart.setHours(0, 0, 0, 0);
        if (offsetDays) dayStart.setDate(dayStart.getDate() + offsetDays);
        return dayStart.getTime();
    }
    function getScheduleDayKey(dayStart) {
        const date = new Date(dayStart);
        return [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, "0"),
            String(date.getDate()).padStart(2, "0"),
        ].join("-");
    }
    function getScheduleWindowDayStart(scheduleWindow) {
        const match = String(scheduleWindow?.key || "").match(
            /^(\d{4})-(\d{2})-(\d{2})\|/u,
        );
        if (!match) return null;
        const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
        return getScheduleDayKey(date.getTime()) === match[0].slice(0, 10)
            ? date.getTime()
            : null;
    }
    function getEffectiveScheduleJitter(config) {
        const startMinutes = parseScheduleMinutes(config.scheduleStartTime),
            endMinutes = parseScheduleMinutes(config.scheduleEndTime),
            durationMinutes =
                startMinutes === endMinutes
                    ? 1440
                    : endMinutes > startMinutes
                      ? endMinutes - startMinutes
                      : 1440 - startMinutes + endMinutes;
        return startMinutes === endMinutes
            ? 0
            : Math.min(
                  config.scheduleTimeJitterMinutes,
                  Math.max(0, Math.floor(durationMinutes / 2) - 1),
              );
    }
    function createDailyScheduleWindow(dayStart, config, random = Math.random) {
        const startMinutes = parseScheduleMinutes(config.scheduleStartTime),
            endMinutes = parseScheduleMinutes(config.scheduleEndTime),
            jitterMinutes = getEffectiveScheduleJitter(config),
            randomOffset = () => {
                if (!jitterMinutes) return 0;
                const randomIndex = Math.min(
                    2 * jitterMinutes,
                    Math.floor(Math.max(0, Number(random()) || 0) * (2 * jitterMinutes + 1)),
                );
                return randomIndex - jitterMinutes;
            },
            startTime = new Date(dayStart),
            endTime = new Date(dayStart);
        startTime.setMinutes(startMinutes + randomOffset());
        endTime.setDate(endTime.getDate() + (endMinutes <= startMinutes ? 1 : 0));
        endTime.setMinutes(endMinutes + randomOffset());
        return {
            key: `${getScheduleDayKey(dayStart)}|${getScheduleSignature(config)}`,
            startAt: startTime.getTime(),
            endAt: Math.max(startTime.getTime() + 60_000, endTime.getTime()),
        };
    }
    function resolveDailyScheduleWindow(
        timestamp,
        config = DEFAULT_CONFIG,
        storedWindow = null,
        random = Math.random,
    ) {
        const now = Number(timestamp),
            signature = `|${getScheduleSignature(config)}`,
            sanitizedStoredWindow = sanitizeScheduleWindow(storedWindow),
            isStoredCompatible =
                sanitizedStoredWindow?.key.endsWith(signature) &&
                getScheduleWindowDayStart(sanitizedStoredWindow) !== null;
        if (isStoredCompatible && sanitizedStoredWindow.endAt > now)
            return sanitizedStoredWindow;

        const todayStart = getLocalDayStart(now),
            startMinutes = parseScheduleMinutes(config.scheduleStartTime),
            endMinutes = parseScheduleMinutes(config.scheduleEndTime);
        let scheduleWindow;
        if (startMinutes >= endMinutes) {
            const previousWindow = createDailyScheduleWindow(
                getLocalDayStart(now, -1),
                config,
                random,
            );
            if (
                startMinutes === endMinutes ||
                (now >= previousWindow.startAt && now < previousWindow.endAt)
            )
                scheduleWindow = previousWindow;
        }
        if (!scheduleWindow) {
            scheduleWindow = createDailyScheduleWindow(todayStart, config, random);
        }
        if (now >= scheduleWindow.endAt) {
            scheduleWindow = createDailyScheduleWindow(
                getLocalDayStart(getScheduleWindowDayStart(scheduleWindow), 1),
                config,
                random,
            );
        }

        if (isStoredCompatible && sanitizedStoredWindow.endAt <= now) {
            const storedDayStart = getScheduleWindowDayStart(sanitizedStoredWindow),
                selectedDayStart = getScheduleWindowDayStart(scheduleWindow);
            selectedDayStart <= storedDayStart &&
                (scheduleWindow = createDailyScheduleWindow(
                    getLocalDayStart(storedDayStart, 1),
                    config,
                    random,
                ));
        }
        return scheduleWindow;
    }
    function isWithinDailyScheduleWindow(timestamp, config, scheduleWindow) {
        return (
            config.scheduleStartTime === config.scheduleEndTime ||
            (Number(timestamp) >= scheduleWindow?.startAt &&
                Number(timestamp) < scheduleWindow?.endAt)
        );
    }
    function alignScheduledRunAt(
        timestamp,
        config,
        storedWindow = null,
        random = Math.random,
    ) {
        let scheduleWindow = resolveDailyScheduleWindow(
            timestamp,
            config,
            storedWindow,
            random,
        );
        if (config.scheduleStartTime === config.scheduleEndTime)
            return {
                runAt: Number(timestamp),
                window: scheduleWindow,
            };
        while (timestamp >= scheduleWindow.endAt) {
            const dayStart = getScheduleWindowDayStart(scheduleWindow);
            scheduleWindow = createDailyScheduleWindow(
                getLocalDayStart(dayStart, 1),
                config,
                random,
            );
        }
        return {
            runAt: Math.max(Number(timestamp), scheduleWindow.startAt),
            window: scheduleWindow,
        };
    }
    function getPersistedScheduleState() {
        return runtimeState.pageMode === "home"
            ? loadHomeState()
            : {
                  nextRunAt: runtimeState.nextRunAt,
                  scheduleWindow: runtimeState.scheduleWindow,
              };
    }
    function logScheduleWindow(config, scheduleWindow) {
        if (runtimeState.loggedScheduleWindowKey === scheduleWindow.key) return;
        runtimeState.loggedScheduleWindowKey = scheduleWindow.key;
        setStatus(
            config.scheduleStartTime === config.scheduleEndTime
                ? "本次自动运行窗口：全天"
                : `本次自动运行窗口：${new Date(scheduleWindow.startAt).toLocaleString()}–${new Date(scheduleWindow.endAt).toLocaleString()}`,
        );
    }
    function scheduleNextRun(config, reuseExisting = false) {
        clearScheduleTimer();
        if (!config.scheduleEnabled || runtimeState.schedulerPaused || runtimeState.globallyPaused) {
            runtimeState.nextRunAt = 0;
            persistScheduleState(0);
            return;
        }
        const now = Date.now(),
            persistedState = getPersistedScheduleState();
        let nextRunAt = reuseExisting ? persistedState.nextRunAt : 0;
        if (nextRunAt <= now) {
            const intervalMs = 60 * config.scheduleMinutes * 1_000,
                jitter = 1 + (2 * Math.random() - 1) * RUNTIME_LIMITS.schedulerJitterRatio;
            nextRunAt = now + Math.max(60_000, Math.round(intervalMs * jitter));
        }
        const alignedSchedule = alignScheduledRunAt(
            nextRunAt,
            config,
            persistedState.scheduleWindow,
        );
        runtimeState.nextRunAt = alignedSchedule.runAt;
        runtimeState.scheduleWindow = alignedSchedule.window;
        logScheduleWindow(config, alignedSchedule.window);
        const delayMs = Math.max(1_000, runtimeState.nextRunAt - now);
        persistScheduleState(runtimeState.nextRunAt, runtimeState.scheduleWindow);
        runtimeState.scheduleTimer = setTimeout(() => {
            runtimeState.scheduleTimer = null;
            runWorker();
        }, delayMs);
        setStatus(`下次周期运行约在 ${new Date(runtimeState.nextRunAt).toLocaleString()}`);
        updateControlState();
    }
    function getCurrentScheduleWindow(config, now = Date.now()) {
        const persistedState = getPersistedScheduleState(),
            scheduleWindow = resolveDailyScheduleWindow(
                now,
                config,
                persistedState.scheduleWindow,
            );
        runtimeState.scheduleWindow = scheduleWindow;
        logScheduleWindow(config, scheduleWindow);
        persistScheduleState(persistedState.nextRunAt, scheduleWindow);
        return scheduleWindow;
    }
    function shouldStopAutomaticWork(config, now = Date.now()) {
        const shouldStop =
            config.scheduleEnabled &&
            !runtimeState.manualRun &&
            config.scheduleStartTime !== config.scheduleEndTime &&
            now >= runtimeState.scheduleWindow?.endAt;
        if (shouldStop) runtimeState.scheduleBoundaryReached = true;
        return shouldStop;
    }
    function reconcileLifecycleState() {
        if (runtimeState.lifecycleSuspended) return;
        if (runtimeState.globallyPaused) {
            setStatus("已全局停止；点击重新开始恢复");
            return;
        }
        if (runtimeState.running) {
            renewWorkerLock();
            return;
        }
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
            if (interruptedState === "active") return;
            if (interruptedState === "interrupted") {
                runtimeState.waitingForRunOwner = "";
                appendLog("warn", "检测到上次运行中断，正在恢复");
                runWorker();
                return;
            }
            runtimeState.waitingForRunOwner = "";
            if (runtimeState.pageMode !== "home") {
                scheduleNextRun(config);
                return;
            }
        }
        if (!config.scheduleEnabled) return;
        const scheduleState = getScheduleState(getPersistedScheduleState().nextRunAt);
        if (scheduleState === "due") {
            clearScheduleTimer();
            runWorker();
        } else if (scheduleState !== "waiting" || !runtimeState.scheduleTimer) {
            scheduleNextRun(config, true);
        }
    }
    function scheduleLifecycleHeartbeat() {
        clearLifecycleTimer();
        if (runtimeState.lifecycleSuspended) return;
        runtimeState.lifecycleTimer = setTimeout(() => {
            runtimeState.lifecycleTimer = null;
            reconcileLifecycleState();
            scheduleLifecycleHeartbeat();
        }, RUNTIME_LIMITS.lifecycleHeartbeatMs);
    }
    function applyGlobalPauseState(value, isRemoteChange = false) {
        const isPaused = sanitizeGlobalPauseState(value).paused;
        if (runtimeState.globallyPaused === isPaused) {
            updateControlState();
            return;
        }
        runtimeState.globallyPaused = isPaused;
        if (isPaused) {
            stopWorker(
                isRemoteChange ? "其他页面已全局停止脚本" : "用户已全局停止脚本",
                false,
                true,
            );
            return;
        }
        runtimeState.schedulerPaused = false;
        setStatus(isRemoteChange ? "其他页面已恢复全局运行" : "正在恢复全局运行");
        appendLog(
            "info",
            isRemoteChange ? "其他页面已恢复全局运行" : "恢复全局运行",
            "",
            true,
        );
        if (isRemoteChange) scheduleNextRun(resolveConfig());
        updateControlState();
    }
    function setupGlobalPauseSync() {
        runtimeState.globallyPaused = readGlobalPauseState().paused;
        try {
            GM_addValueChangeListener(
                GLOBAL_PAUSE_STORAGE_KEY,
                (name, oldValue, newValue, isRemoteChange) => {
                    if (isRemoteChange) applyGlobalPauseState(newValue, true);
                },
            );
        } catch (error) {
            console.warn(`${LOG_PREFIX} 无法监听全局停止状态`, error);
        }
    }
    function pauseAllPages() {
        try {
            writeGlobalPauseState(true);
            applyGlobalPauseState(true);
        } catch (error) {
            setStatus(`停止失败：${error.message}`);
            appendLog("error", error.message);
        }
    }
    function resumeAllPages(options = { manual: true }) {
        try {
            writeGlobalPauseState(false);
            applyGlobalPauseState(false);
            runWorker({ ...options, globalResume: true });
        } catch (error) {
            setStatus(`恢复失败：${error.message}`);
            appendLog("error", error.message);
        }
    }
    function stopWorker(message, silent = false, pauseScheduler = false) {
        clearTimeout(runtimeState.autoTimer);
        runtimeState.autoTimer = null;
        if (pauseScheduler) {
            runtimeState.schedulerPaused = true;
            clearScheduleTimer();
            runtimeState.nextRunAt = 0;
            persistScheduleState(0);
            clearRunMarker(runtimeState.workerLockOwner);
            runtimeState.waitingForRunOwner = "";
        }
        runtimeState.runId++;
        runtimeState.controller?.abort();
        runtimeState.controller = null;
        runtimeState.running = false;
        runtimeState.manualRun = false;
        runtimeState.scheduleBoundaryReached = false;
        if (!silent) {
            setStatus(message);
            appendLog("warn", message);
        }
        updateControlState();
    }
    function acquireWorkerLock(owner) {
        const now = Date.now();
        try {
            if (isForeignWorkerLock(loadWorkerLock(), owner, now)) return false;
            saveWorkerLock(owner, now);
            const acquired = loadWorkerLock()?.owner === owner;
            runtimeState.workerLockOwner = acquired ? owner : "";
            return acquired;
        } catch (error) {
            throw new Error(`无法建立跨标签页运行租约：${error.message}`);
        }
    }
    function saveRunMarker(owner) {
        try {
            localStorage.setItem(
                RUN_MARKER_STORAGE_KEY,
                JSON.stringify({ owner: owner, startedAt: Date.now() }),
            );
        } catch (error) {
            console.warn(`${LOG_PREFIX} 无法保存运行标记`, error);
        }
    }
    function resetWorkerAfterLockFailure(message) {
        runtimeState.running = false;
        runtimeState.controller = null;
        runtimeState.manualRun = false;
        setStatus(message);
        updateControlState();
    }
    async function runWorker(options = {}) {
        if (runtimeState.running) return;
        if (runtimeState.globallyPaused && !options.globalResume) {
            setStatus("已全局停止；点击重新开始恢复");
            updateControlState();
            return;
        }
        const config = resolveConfig(),
            isManualRun = options.manual === true;
        if (config.scheduleEnabled && !isManualRun) {
            const scheduleWindow = getCurrentScheduleWindow(config);
            if (!isWithinDailyScheduleWindow(Date.now(), config, scheduleWindow)) {
                setStatus("等待本次自动运行窗口");
                appendLog("skip", "当前不在本次自动运行窗口");
                scheduleNextRun(config);
                return;
            }
        }
        clearScheduleTimer();
        stopWorker("重新开始", true, false);
        runtimeState.schedulerPaused = false;
        const runId = runtimeState.runId;
        runtimeState.controller = new AbortController();
        runtimeState.running = true;
        runtimeState.manualRun = isManualRun;
        runtimeState.scheduleBoundaryReached = false;
        const owner = `${INSTANCE_ID}:${runId}`;
        let acquiredLock = false;
        try {
            acquiredLock = acquireWorkerLock(owner);
        } catch (error) {
            resetWorkerAfterLockFailure(`失败：${error.message}`);
            appendLog("error", error.message);
            return;
        }
        if (!acquiredLock) {
            resetWorkerAfterLockFailure("其他标签页正在运行，本轮跳过");
            appendLog("skip", "其他标签页持有跨标签页运行租约");
            runtimeState.waitingForRunOwner = loadRunMarker()?.owner || "";
            if (!runtimeState.waitingForRunOwner) scheduleNextRun(config);
            return;
        }
        saveRunMarker(owner);
        runtimeState.waitingForRunOwner = "";
        runtimeState.nextRunAt = 0;
        persistScheduleState(0);
        runtimeState.requestBudget =
            runtimeState.pageMode === "home" ? createRequestBudget(config.homeRequestLimit) : null;
        updateControlState();
        appendLog("info", `开始运行 v${SCRIPT_VERSION}`, "", true);
        try {
            const signal = runtimeState.controller.signal;
            if (options.reviewBadTags) {
                setStatus("重新检查当前错误标签记录");
                await processBadTags(
                    { ...config, badTagEnabled: true },
                    signal,
                    { reviewKnown: true },
                );
                setStatus("错误标签重新检查完成");
            } else {
                setRequestBudgetReserve(
                    runtimeState.requestBudget,
                    config.badTagEnabled ? 6 : 0,
                );
                if (!shouldStopAutomaticWork(config)) {
                    if (runtimeState.pageMode === "home") {
                        await processHomepage(runId, config, signal);
                    } else {
                        await processCurrentGallery(runId, config, signal);
                    }
                }
                setRequestBudgetReserve(runtimeState.requestBudget, 0);

                if (config.badTagEnabled && !shouldStopAutomaticWork(config)) {
                    setStatus("检查待处理错误标签记录");
                    try {
                        await processBadTags(config, signal);
                    } catch (error) {
                        if (error.name === "AbortError") throw error;
                        if (error.name === "RequestBudgetError") {
                            setStatus("本轮剩余请求不足，错误标签将在下一周期继续");
                        } else {
                            appendLog("warn", `错误标签检查失败：${error.message}`);
                        }
                    }
                }
            }
        } catch (error) {
            if (error.name === "AbortError") {
                if (runId === runtimeState.runId) setStatus("已停止");
            } else {
                appendLog("error", `运行失败：${error.message}`);
                setStatus(`失败：${error.message}`);
            }
        } finally {
            const budget = runtimeState.requestBudget;
            runtimeState.requestBudget = null;
            if (runId === runtimeState.runId) {
                runtimeState.running = false;
                runtimeState.controller = null;
                if (runtimeState.scheduleBoundaryReached) {
                    appendLog(
                        "info",
                        "已到自动运行结束时间，当前工作已安全完成",
                        "",
                        true,
                    );
                }
                runtimeState.manualRun = false;
                runtimeState.scheduleBoundaryReached = false;
                if (budget) {
                    appendLog(
                        "info",
                        `本轮请求 ${budget.used}/${budget.limit}`,
                        "",
                        true,
                    );
                }
                updateControlState();
                scheduleNextRun(resolveConfig());
            }
            clearRunMarker(owner);
            releaseWorkerLock(owner);
        }
    }
    function updateControlState() {
        if (!runtimeState.ui) return;
        runtimeState.ui.stop.disabled =
            runtimeState.globallyPaused ||
            (!runtimeState.running && !runtimeState.autoTimer && !runtimeState.scheduleTimer);
        runtimeState.ui.restart.disabled = runtimeState.running;
        if (runtimeState.ui.reviewBadTags) {
            runtimeState.ui.reviewBadTags.disabled =
                runtimeState.running || runtimeState.globallyPaused;
        }
    }
    function handleLifecycleSuspend() {
        if (runtimeState.lifecycleSuspended) return;
        runtimeState.lifecycleSuspended = true;
        runtimeState.resumeRunAfterLifecycle =
            runtimeState.running || Boolean(runtimeState.autoTimer);
        clearTimeout(runtimeState.autoTimer);
        runtimeState.autoTimer = null;
        clearScheduleTimer();
        clearLifecycleTimer();
        runtimeState.runId++;
        runtimeState.controller?.abort();
        runtimeState.controller = null;
        runtimeState.running = false;
        runtimeState.requestBudget = null;
        releaseWorkerLock();
        updateControlState();
    }
    function shouldHandleLifecycleResume(eventType, visibilityState) {
        return eventType !== "visibilitychange" || visibilityState === "visible";
    }
    function handleLifecycleResume(event) {
        if (!shouldHandleLifecycleResume(event?.type, document.visibilityState)) return;
        if (runtimeState.logDomDirty) renderLogEntries();
        const shouldResumeRun =
            runtimeState.lifecycleSuspended && runtimeState.resumeRunAfterLifecycle;
        runtimeState.lifecycleSuspended = false;
        runtimeState.resumeRunAfterLifecycle = false;
        scheduleLifecycleHeartbeat();
        if (runtimeState.running) renewWorkerLock();
        else if (!runtimeState.autoTimer && shouldResumeRun) runWorker();
        else reconcileLifecycleState();
    }
    function detectPageMode() {
        const searchParams = new URLSearchParams(location.search);
        const isFilteredHomePage = ["f_search", "next", "prev", "range"].some(
            (parameterName) => searchParams.has(parameterName),
        );
        if (location.pathname === "/" && document.querySelector(".itg") && !isFilteredHomePage) {
            return "home";
        }
        if (document.querySelector("#gn") && document.querySelector("#taglist")) {
            return "gallery";
        }
        return "";
    }
    function initialize() {
        if (document.querySelector("#ehtt-panel")) return;
        runtimeState.pageMode = detectPageMode();
        if (!runtimeState.pageMode) return;

        applyVersionStateReset();
        document.getElementById(STYLE_ELEMENT_ID)?.remove();
        const styleElement = document.createElement("style");
        styleElement.id = STYLE_ELEMENT_ID;
        styleElement.textContent = `
#ehtt-panel {
    --ehtt-surface: #222628;
    --ehtt-surface-raised: #2c3235;
    --ehtt-border: #626b70;
    --ehtt-text: #f1f4f5;
    --ehtt-muted: #b8c0c4;
    --ehtt-ok: #9cddb1;
    --ehtt-warn: #ffda87;
    --ehtt-error: #ff9a9a;
    position: fixed;
    right: 14px;
    bottom: 14px;
    z-index: 2147483646;
    width: min(320px, calc(100vw - 28px));
    overflow: hidden;
    box-sizing: border-box;
    border: 1px solid var(--ehtt-border);
    border-radius: 7px;
    background: var(--ehtt-surface);
    color: var(--ehtt-text);
    box-shadow: 0 6px 20px rgba(0, 0, 0, .32);
    font: 12px/1.45 "Microsoft YaHei", "Segoe UI", sans-serif;
    text-align: left;
}
#ehtt-panel * { box-sizing: border-box; }
.ehtt-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--ehtt-border);
    background: var(--ehtt-surface-raised);
}
.ehtt-title { font-size: 13px; font-weight: 700; }
.ehtt-version { color: var(--ehtt-muted); font-size: 11px; }
.ehtt-controls {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    padding: 8px 10px;
}
#ehtt-panel button {
    min-width: 0;
    min-height: 32px;
    padding: 5px 8px;
    border: 1px solid var(--ehtt-border);
    border-radius: 4px;
    background: #f7f4ed;
    color: #2c3032;
    cursor: pointer;
    font: inherit;
    font-weight: 700;
}
#ehtt-panel button:focus-visible { outline: 2px solid #9ac8ff; outline-offset: 2px; }
#ehtt-panel button:disabled { cursor: default; opacity: .5; }
#ehtt-stop { background: #992f39 !important; border-color: #c66a73 !important; color: #fff !important; }
#ehtt-restart { background: #34704e !important; border-color: #69a17f !important; color: #fff !important; }
.ehtt-status {
    height: calc(4.35em + 16px);
    padding: 7px 10px;
    border-top: 1px solid var(--ehtt-border);
    border-bottom: 1px solid var(--ehtt-border);
    color: var(--ehtt-ok);
    font-weight: 700;
    overflow: hidden;
    overflow-wrap: anywhere;
}
.ehtt-log-entries {
    max-height: 150px;
    overflow: auto;
    padding: 7px 10px;
    color: var(--ehtt-text);
    font: 11px/1.45 Consolas, monospace;
}
.ehtt-log-line { margin: 0 0 3px; overflow-wrap: anywhere; }
.ehtt-log-link { color: inherit; text-decoration: underline; }
.ehtt-ok { color: var(--ehtt-ok); }
.ehtt-warn { color: var(--ehtt-warn); }
.ehtt-error { color: var(--ehtt-error); }
.ehtt-skip { color: var(--ehtt-muted); }
`;
        document.head.appendChild(styleElement);
        const panel = document.createElement("section");
        panel.id = "ehtt-panel";
        panel.innerHTML = `
<header class="ehtt-header">
    <span class="ehtt-title">跨语言 Tag 迁移</span>
    <span class="ehtt-version">reina · ${SCRIPT_VERSION}</span>
</header>
<div class="ehtt-controls">
    <button type="button" id="ehtt-stop">停止</button>
    <button type="button" id="ehtt-restart">重新开始</button>
    <button type="button" id="ehtt-review-badtags">重新检查错误标签</button>
    <button type="button" id="ehtt-export-log">导出日志 TXT</button>
</div>
<div class="ehtt-status" id="ehtt-status" role="status" aria-live="polite">即将自动开始</div>
<div class="ehtt-log-entries" id="ehtt-log-entries"></div>
`;
        document.body.appendChild(panel);
        runtimeState.ui = {
            panel: panel,
            status: panel.querySelector("#ehtt-status"),
            stop: panel.querySelector("#ehtt-stop"),
            restart: panel.querySelector("#ehtt-restart"),
            reviewBadTags: panel.querySelector("#ehtt-review-badtags"),
            exportLog: panel.querySelector("#ehtt-export-log"),
            logEntries: panel.querySelector("#ehtt-log-entries"),
        };
        runtimeState.ui.stop.addEventListener("click", pauseAllPages);
        runtimeState.ui.restart.addEventListener("click", () =>
            resumeAllPages({ manual: true }),
        );
        runtimeState.ui.reviewBadTags.addEventListener("click", () =>
            runWorker({ manual: true, reviewBadTags: true }),
        );
        runtimeState.ui.exportLog.addEventListener("click", exportLog);
        updateControlState();
        setupGlobalPauseSync();
        const config = resolveConfig(),
            homeState = runtimeState.pageMode === "home" ? loadHomeState() : null;
        runtimeState.nextRunAt = homeState?.nextRunAt || 0;
        runtimeState.scheduleWindow = homeState?.scheduleWindow || null;
        scheduleLifecycleHeartbeat();
        if (runtimeState.globallyPaused) {
            runtimeState.schedulerPaused = true;
            setStatus("已全局停止；点击重新开始恢复");
        } else if (
            runtimeState.pageMode === "home" &&
            homeState.initializedAt &&
            config.scheduleEnabled &&
            homeState.nextRunAt > Date.now()
        ) {
            setStatus("等待下一次主页扫描");
            scheduleNextRun(config, true);
        } else {
            runtimeState.autoTimer = setTimeout(() => {
                runtimeState.autoTimer = null;
                runWorker();
            }, RUNTIME_LIMITS.autoStartDelayMs);
        }
        document.addEventListener("visibilitychange", handleLifecycleResume);
        document.addEventListener("freeze", handleLifecycleSuspend);
        document.addEventListener("resume", handleLifecycleResume);
        window.addEventListener("pageshow", handleLifecycleResume);
        window.addEventListener("focus", handleLifecycleResume);
        window.addEventListener("beforeunload", handleLifecycleSuspend);
        window.addEventListener("pagehide", handleLifecycleSuspend);
        updateControlState();
    }
    // 8. 搜索阶段与测试入口
    const SEARCH_PIPELINE = Object.freeze({
        discover: discoverSearchCandidates,
        prefilter: prefilterSearchCandidates,
        loadProgressiveDetails: loadProgressiveCandidateDetails,
        selectFinal: selectFinalSearchCandidates,
        run: runSearchPipeline,
    });
    const CORE = Object.freeze({
        version: SCRIPT_VERSION,
        transport: "direct-xhr-verified",
        parameters: SCRIPT_PARAMETERS,
        defaults: DEFAULT_CONFIG,
        limits: Object.freeze({ visibleLogs: VISIBLE_LOG_LIMIT }),
        config: Object.freeze({ sanitize: sanitizeConfig, resolve: resolveConfig }),
        matching: Object.freeze({
            assessCandidate: assessCandidate,
            selectBestByLanguage: selectBestLanguageCandidates,
            selectForTransfer: selectTransferCandidates,
        }),
        search: Object.freeze({
            phases: SEARCH_PHASES,
            pipeline: SEARCH_PIPELINE,
            buildQueries: buildSearchQueries,
            buildUrl: buildSearchUrl,
        }),
        transfer: Object.freeze({
            compileBlacklist: compileBlacklist,
            isBlacklisted: isBlacklisted,
            classifyCorrectionState: classifyCorrectionState,
            buildTagUnion: buildTransferTagUnion,
            collectTagSourceUrls: collectTagSourceUrls,
            buildTargetTagSet: buildTargetTagSet,
            selectNewest: selectNewestGallery,
            buildPlan: buildTransferPlan,
            planTarget: planTargetTags,
            planRandomTagSkip: planRandomTagSkip,
            buildBatches: buildTagBatches,
            reconcileBatch: reconcileTagVoteBatch,
        }),
        repository: Object.freeze({
            parseReport: parseBadTagReport,
            buildAudit: buildBadTagAudit,
            fingerprint: badTagRecordFingerprint,
            sanitizeState: sanitizeBadTagState,
            selectRecords: selectBadTagRecords,
            selectBatch: selectBadTagBatch,
            correctionStrategy: getBadTagCorrectionStrategy,
        }),
        writeProtocol: Object.freeze({
            parseContext: parseGalleryWriteContext,
            buildPayload: buildTagGalleryPayload,
            isTrustedApiUrl: isTrustedTagApiUrl,
            isUsableGallery: isUsableGalleryDocument,
        }),
        logs: Object.freeze({
            createEntry: createLogEntry,
            trimEntries: trimLogEntries,
            formatEntry: formatLogEntry,
            buildExportText: buildLogExportText,
            buildFilename: buildLogExportFilename,
            shouldDeferRender: shouldDeferLogRender,
        }),
        home: Object.freeze({
            sanitizeState: sanitizeHomeState,
            mergeResults: mergeHomepageResults,
            galleryIdFromUrl: galleryIdFromUrl,
            findReadyJob: findReadyHomeJob,
            beginJob: beginHomeJob,
            retryJob: retryHomeJob,
            preserveJobAfterBudget: preserveHomeJobAfterBudget,
            completeGroup: completeHomeGroup,
            getDisposition: getHomeJobDisposition,
        }),
        schedule: Object.freeze({
            parseMinutes: parseScheduleMinutes,
            resolveWindow: resolveDailyScheduleWindow,
            isWithinWindow: isWithinDailyScheduleWindow,
            alignRunAt: alignScheduledRunAt,
            getState: getScheduleState,
        }),
        requests: Object.freeze({
            runLifecycle: runRequestLifecycle,
            delay: delay,
            isRetryableError: isRetryableFetchError,
            createBudget: createRequestBudget,
            setReserve: setRequestBudgetReserve,
            getRemaining: getRequestBudgetRemaining,
            canStartVerifiedVote: canStartVerifiedTagVote,
            consumeBudget: consumeRequestBudget,
        }),
        coordination: Object.freeze({
            sanitizePause: sanitizeGlobalPauseState,
            planVersionReset: planVersionStateReset,
            isForeignLock: isForeignWorkerLock,
            getInterruptedState: getInterruptedRunState,
            shouldResumeLifecycle: shouldHandleLifecycleResume,
        }),
    });
    if (typeof module !== "undefined" && module.exports) module.exports = CORE;
    if (typeof window !== "undefined" && typeof document !== "undefined") {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", initialize, { once: true });
        } else {
            initialize();
        }
    }
}

createEhTagTransferModule();
