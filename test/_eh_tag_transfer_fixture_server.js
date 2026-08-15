'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const port = Number(process.env.EH_TAG_TRANSFER_FIXTURE_PORT) || 43187;
const scriptPath = path.join(__dirname, '..', 'eh-tag-transfer.js');
let showNewGalleries = false;
let transientHomepageFailures = 0;
let transientBadTagFailures = 0;
let unknownVoteResponseSent = false;
const requestCounts = new Map();
const searchRequests = [];
const tagVoteRequests = [];

const galleries = {
    current: {
        path: '/g/500001/c001c001c0/',
        title: '[Rocket Chousashitsu (Koza)] Odoroke Odoroke Daifuntou da yo Kogasa-chan! Ch. 37 (Touhou Project) [Chinese] [Digital]',
        japaneseTitle: '[ロケット調査室 (コザ)] おどろけおどろけ 大奮闘だよ小傘ちゃん! 第37話 (東方Project) [中国翻訳]',
        pages: 34,
        postedAt: '2026-08-02 15:41',
        tags: [
            ['language:chinese'],
            ['language:translated'],
            ['group:rocket chousashitsu'],
            ['artist:koza'],
            ['male:sole male']
        ]
    },
    digital: {
        path: '/g/500002/d002d002d0/',
        title: '[Rocket Chousashitsu (Koza)] Odoroke Odoroke Daifuntou da yo Kogasa-chan! Ch. 37 (Touhou Project) [Digital]',
        japaneseTitle: '[ロケット調査室 (コザ)] おどろけおどろけ 大奮闘だよ小傘ちゃん! 第37話 (東方Project) [DL版]',
        pages: 32,
        postedAt: '2025-08-02 15:41',
        tags: [
            ['group:rocket chousashitsu'],
            ['artist:koza'],
            ['female:sole female'],
            ['female:unknown response']
        ]
    },
    event: {
        path: '/g/500003/e003e003e0/',
        title: '(Reitaisai 22) [Rocket Chousashitsu (Koza)] Odoroke Odoroke Daifuntou da yo Kogasa-chan! Ch. 37 (Touhou Project)',
        japaneseTitle: '(例大祭22) [ロケット調査室 (コザ)] おどろけおどろけ 大奮闘だよ小傘ちゃん! 第37話 (東方Project)',
        pages: 33,
        postedAt: '2024-08-02 15:41',
        tags: [
            ['group:rocket chousashitsu'],
            ['artist:koza'],
            ['female:glasses']
        ]
    },
    sameLanguage: {
        path: '/g/500006/a006a006a0/',
        title: '[Rocket Chousashitsu (Koza)] Odoroke Odoroke Daifuntou da yo Kogasa-chan! Ch. 37 (Touhou Project) [Chinese]',
        japaneseTitle: '',
        pages: 33,
        postedAt: '2025-10-02 15:41',
        tags: [
            ['language:chinese'],
            ['language:translated'],
            ['group:rocket chousashitsu'],
            ['artist:koza'],
            ['female:sole female']
        ]
    },
    badVote: {
        path: '/g/500004/b004b004b0/',
        title: '[Fixture Circle] Bad Tag Vote Fixture',
        japaneseTitle: '',
        pages: 12,
        postedAt: '2026-07-30 12:00',
        tags: [
            ['group:fixture circle'],
            ['female:lactation', {solid: false, voted: true}],
            ['female:filming', {solid: false}],
            ['female:mouth mask', {solid: false, downvoted: true}],
            ['female:locked vote', {solid: false, voted: true}],
            ['female:race before', {solid: false}],
            ['female:race after', {solid: false, voted: true}]
        ]
    },
    noVoteApi: {
        path: '/g/500008/a008a008a0/',
        title: '[Fixture Circle] Missing Vote API Fixture',
        japaneseTitle: '',
        pages: 12,
        postedAt: '2026-07-30 12:10',
        hasVoteApi: false,
        tags: [
            ['group:fixture circle'],
            ['female:api unavailable', {solid: false}]
        ]
    },
    short: {
        path: '/g/500005/f005f005f0/',
        title: '[Fixture Circle] Eight Page Preview',
        japaneseTitle: '',
        pages: 8,
        postedAt: '2026-08-02 15:40',
        tags: [
            ['group:fixture circle'],
            ['female:sole female']
        ]
    },
    correctionTarget: {
        path: '/g/500009/c009c009c0/',
        title: '[Fixture Circle] Correction Branch Fixture [English] [Digital]',
        japaneseTitle: '',
        pages: 20,
        postedAt: '2026-08-10 12:00',
        tags: [
            ['language:english'],
            ['language:translated'],
            ['group:fixture circle'],
            ['artist:fixture artist'],
            ['female:glasses', {solid: false, downvoted: true}]
        ]
    },
    correctionSource: {
        path: '/g/500010/c010c010c0/',
        title: '[Fixture Circle] Correction Branch Fixture [Chinese] [Uncensored] [Digital]',
        japaneseTitle: '',
        pages: 20,
        postedAt: '2025-08-10 12:00',
        tags: [
            ['language:chinese'],
            ['language:translated'],
            ['group:fixture circle'],
            ['artist:fixture artist'],
            ['female:glasses'],
            ['female:sole female'],
            ['other:uncensored']
        ]
    },
    derivedOnly: {
        path: '/g/500011/c011c011c0/',
        title: '[Fixture Circle] Derived Only Fixture [Korean] [Decensored] [Digital]',
        japaneseTitle: '',
        pages: 20,
        postedAt: '2026-08-11 12:00',
        tags: [
            ['language:korean'],
            ['language:translated'],
            ['group:fixture circle']
        ]
    },
    randomSkipTarget: {
        path: '/g/500012/c012c012c0/',
        title: '[Fixture Circle] Random Skip Fixture [English] [Uncensored] [Digital]',
        japaneseTitle: '',
        pages: 20,
        postedAt: '2026-08-12 12:00',
        tags: [
            ['language:english'],
            ['language:translated'],
            ['group:fixture circle'],
            ['artist:fixture artist'],
            ['female:glasses', {solid: false, downvoted: true}]
        ]
    },
    randomSkipSource: {
        path: '/g/500013/c013c013c0/',
        title: '[Fixture Circle] Random Skip Fixture [Chinese] [Uncensored] [Digital]',
        japaneseTitle: '',
        pages: 20,
        postedAt: '2025-08-12 12:00',
        tags: [
            ['language:chinese'],
            ['language:translated'],
            ['group:fixture circle'],
            ['artist:fixture artist'],
            ['female:glasses'],
            ['female:sole female'],
            ['male:sole male'],
            ['other:uncensored'],
            ['parody:random skip fixture'],
            ['parody:random skip fixture series']
        ]
    }
};

const unavailableGallery = {
    path: '/g/500007/d007d007d0/',
    title: '[Fixture Circle] Removed Gallery Fixture'
};

const initialGalleryTags = new Map(
    Object.values(galleries).map(gallery => [
        gallery.path,
        JSON.parse(JSON.stringify(gallery.tags))
    ])
);

function resetGalleryTags() {
    for (const gallery of Object.values(galleries)) {
        gallery.tags = JSON.parse(JSON.stringify(initialGalleryTags.get(gallery.path)));
    }
}

function tagDiv(tag, {solid = true, voted = false, downvoted = false} = {}) {
    const [namespace, name] = tag.split(':');
    const idName = name.replace(/\s+/g, '_');
    return `<div id="td_${namespace}:${idName}" class="${solid ? 'gt' : 'gtl'}">
        <a id="ta_${namespace}:${idName}" class="${voted ? 'tup' : downvoted ? 'tdn' : ''}"
           href="/tag/${namespace}:${encodeURIComponent(name).replace(/%20/g, '+')}">${name}</a>
    </div>`;
}

function clientRuntime() {
    return `<script>
        function renderFixtureEvent(event) {
            const root = window.top.document.getElementById('fixture-events');
            if (!root) return;
            const marker = window.top.document.createElement('span');
            marker.dataset.type = event.type;
            marker.dataset.value = event.value;
            marker.dataset.path = event.path;
            root.appendChild(marker);
        }

        function recordFixtureEvent(type, value) {
            const events = JSON.parse(localStorage.getItem('ehtt.fixture.events') || '[]');
            const event = {type, value, path: location.pathname};
            events.push(event);
            localStorage.setItem('ehtt.fixture.events', JSON.stringify(events));
            renderFixtureEvent(event);
        }
    </script>`;
}

function userscriptSetup() {
    const badTagState = {
        uid: '7647802',
        knownFingerprints: []
    };
    const homeState = {
        version: 2,
        initializedAt: '2026-08-09T00:00:00.000Z',
        seenGids: ['500003'],
        queue: [],
        scanCursor: '',
        nextRunAt: 0
    };
    return `<script>
        const fixtureRandomMode = new URLSearchParams(location.search).get('random');
        if (fixtureRandomMode === 'max') {
            Math.random = () => 0.999999999;
        } else if (fixtureRandomMode === 'zero') {
            Math.random = () => 0;
        }
        if (new URLSearchParams(location.search).has('reset')) {
            localStorage.clear();
        }
        if (!localStorage.getItem('reina.ehTagTransfer.badTags.v3')) {
            localStorage.setItem('reina.ehTagTransfer.badTags.v3', ${JSON.stringify(JSON.stringify(badTagState))});
        }
        if (!localStorage.getItem('reina.ehTagTransfer.home.v1')) {
            localStorage.setItem('reina.ehTagTransfer.home.v1', ${JSON.stringify(JSON.stringify(homeState))});
        }
        for (const event of JSON.parse(localStorage.getItem('ehtt.fixture.events') || '[]')) {
            renderFixtureEvent(event);
        }

        const gmPrefix = 'ehtt.fixture.gm.';
        const gmListeners = new Map();
        let gmListenerId = 0;
        const readGmValue = (name, fallback) => {
            const raw = localStorage.getItem(gmPrefix + name);
            if (raw === null) return fallback;
            try { return JSON.parse(raw); } catch { return fallback; }
        };
        window.GM_getValue = readGmValue;
        window.GM_setValue = (name, value) => {
            const oldValue = readGmValue(name, undefined);
            localStorage.setItem(gmPrefix + name, JSON.stringify(value));
            for (const listener of gmListeners.values()) {
                if (listener.name === name) listener.callback(name, oldValue, value, false);
            }
        };
        window.GM_addValueChangeListener = (name, callback) => {
            const id = ++gmListenerId;
            gmListeners.set(id, {name, callback});
            return id;
        };
        window.addEventListener('storage', event => {
            if (!event.key?.startsWith(gmPrefix)) return;
            const name = event.key.slice(gmPrefix.length);
            const parse = value => {
                try { return value === null ? undefined : JSON.parse(value); }
                catch { return undefined; }
            };
            for (const listener of gmListeners.values()) {
                if (listener.name === name) {
                    listener.callback(name, parse(event.oldValue), parse(event.newValue), true);
                }
            }
        });

        window.GM_xmlhttpRequest = function(options) {
            const controller = new AbortController();
            let aborted = false;
            recordFixtureEvent(
                'bad-tag-request-uid',
                new URL(options.url).searchParams.get('uid') || ''
            );
            fetch('/bad-tags', {signal: controller.signal})
                .then(async response => {
                    const responseText = await response.text();
                    if (!aborted) {
                        options.onload?.({
                            status: response.status,
                            responseText
                        });
                    }
                })
                .catch(error => {
                    if (!aborted) options.onerror?.(error);
                });
            return {
                abort() {
                    aborted = true;
                    controller.abort();
                    options.onabort?.();
                }
            };
        };
    </script>`;
}

function galleryHtml(gallery, shouldInjectScript = false) {
    const tags = gallery.tags.map(([tag, options]) => tagDiv(tag, options));
    const match = gallery.path.match(/^\/g\/(\d+)\/([0-9a-f]+)\//i);
    const writeContext = gallery.hasVoteApi === false ? '' : `<script>
        var api_url = "http://127.0.0.1:${port}/api.php";
        var gid = ${match[1]};
        var token = "${match[2]}";
        var apiuid = 7647802;
        var apikey = "0123456789abcdef";
    </script>`;
    return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Tag Transfer Fixture</title></head>
<body>
    ${writeContext}
    <h1 id="gn">${gallery.title}</h1>
    <h1 id="gj">${gallery.japaneseTitle}</h1>
    <table id="gdd"><tbody>
        <tr><td class="gdt1">Posted:</td><td class="gdt2">${gallery.postedAt}</td></tr>
        <tr><td class="gdt1">Length:</td><td class="gdt2">${gallery.pages} pages</td></tr>
    </tbody></table>
    <div id="taglist">${tags.join('')}</div>
    <div id="waitroller" style="visibility:hidden"></div>
    ${shouldInjectScript ? '<div id="fixture-events" hidden></div>' : ''}
    <form>
        <input id="newtagfield" maxlength="200" size="60"
               placeholder="Enter new tags, separated with comma">
        <input id="newtagbutton" type="button" value="Tag">
    </form>
    ${clientRuntime()}
    ${shouldInjectScript ? userscriptSetup() : ''}
    ${shouldInjectScript ? '<script src="/tag-transfer.user.js"></script>' : ''}
</body>
</html>`;
}

function searchRow(gallery) {
    const previewTags = gallery.tags.map(([tag, options = {}]) =>
        `<div class="${options.solid === false ? 'gtl' : 'gt'}" title="${tag}"></div>`
    ).join('');
    return `<tr>
        <td class="gl1e"><a href="${gallery.path}"></a></td>
        <td class="glname">
            <a href="${gallery.path}"><div class="glink">${gallery.title}</div></a>
        </td>
        <td>
            <div class="gl3e"><div></div><div></div><div></div><div></div><div class="fixture-list-meta"><div>29</div><div>${gallery.pages} pages</div></div></div>
            ${previewTags}
        </td>
    </tr>`;
}

function searchHtml(url) {
    const searchTerm = url.searchParams.get('f_search') || '';
    if (searchTerm.includes('Correction Branch Fixture')) {
        return `<!doctype html><html><body><table class="itg"><tbody>${searchRow(
            galleries.correctionSource
        )}</tbody></table></body></html>`;
    }
    if (searchTerm.includes('Derived Only Fixture')) {
        return '<!doctype html><html><body><table class="itg"><tbody></tbody></table></body></html>';
    }
    if (searchTerm.includes('Random Skip Fixture')) {
        return `<!doctype html><html><body><table class="itg"><tbody>${searchRow(
            galleries.randomSkipSource
        )}</tbody></table></body></html>`;
    }
    const onSecondPage = url.searchParams.get('next') === 'fixture';
    const rows = onSecondPage
        ? searchRow(galleries.digital)
        : [galleries.sameLanguage, galleries.event, galleries.digital]
            .map(searchRow)
            .join('');
    const nextHref = `/?f_search=${encodeURIComponent(url.searchParams.get('f_search') || '')}&next=fixture`;
    return `<!doctype html>
<html><body>
    <table class="itg"><tbody>${rows}</tbody></table>
    ${onSecondPage ? '' : `<a id="dnext" href="${nextHref.replace(/&/g, '&amp;')}">Next</a>`}
</body></html>`;
}

function homepageAuditRuntime() {
    return `<script>
    (() => {
        const auditKey = 'ehtt.fixture.homeAudit';
        const readAudit = () => {
            try {
                return JSON.parse(localStorage.getItem(auditKey) || '[]');
            } catch {
                return [];
            }
        };
        const auditElement = document.getElementById('fixture-home-audit');
        const renderAudit = () => {
            auditElement.textContent = readAudit()
                .slice(-200)
                .map(entry => entry.at + ' [' + entry.type + '] ' + entry.message)
                .join('\\n');
        };
        const recordAudit = (type, message) => {
            const entries = readAudit();
            entries.push({at: new Date().toISOString(), type, message});
            localStorage.setItem(auditKey, JSON.stringify(entries.slice(-500)));
            renderAudit();
        };
        const seenLogs = new Set();
        const captureLogs = () => {
            for (const line of document.querySelectorAll('#ehtt-log-entries .ehtt-log-line')) {
                const message = (line.textContent || '').trim();
                if (!message || seenLogs.has(message)) continue;
                seenLogs.add(message);
                recordAudit('log', message);
            }
        };
        const observer = new MutationObserver(captureLogs);
        let observedLogElement = null;
        const connectLogObserver = () => {
            const logElement = document.getElementById('ehtt-log-entries');
            if (!logElement || logElement === observedLogElement) return;
            observer.disconnect();
            observedLogElement = logElement;
            observer.observe(logElement, {childList: true, subtree: true});
            captureLogs();
        };
        const pageObserver = new MutationObserver(connectLogObserver);
        pageObserver.observe(document.body, {childList: true, subtree: true});
        connectLogObserver();
        setInterval(() => {
            connectLogObserver();
            captureLogs();
        }, 250);

        for (const type of [
            'visibilitychange', 'freeze', 'resume', 'pageshow', 'pagehide', 'beforeunload'
        ]) {
            const target = type === 'pagehide' || type === 'pageshow' || type === 'beforeunload'
                ? window
                : document;
            target.addEventListener(type, () => {
                recordAudit('lifecycle', type + ':' + document.visibilityState);
            });
        }

        const setFixtureVisibility = value => {
            window.__ehttFixtureVisibility = value;
            if (!Object.prototype.hasOwnProperty.call(document, 'visibilityState')) {
                Object.defineProperty(document, 'visibilityState', {
                    configurable: true,
                    get: () => window.__ehttFixtureVisibility
                });
            }
        };
        const renderStatusAudit = mode => requestAnimationFrame(() => {
            const panel = document.getElementById('ehtt-panel');
            const status = document.getElementById('ehtt-status');
            if (!panel || !status) return;
            document.getElementById('fixture-status-audit').textContent = JSON.stringify({
                mode,
                panelHeight: panel.getBoundingClientRect().height,
                statusHeight: status.getBoundingClientRect().height,
                scrollHeight: status.scrollHeight,
                clientHeight: status.clientHeight,
                overflow: getComputedStyle(status).overflow,
                isClipped: status.scrollHeight > status.clientHeight
            });
        });
        document.getElementById('fixture-freeze').addEventListener('click', () => {
            setFixtureVisibility('hidden');
            document.dispatchEvent(new Event('visibilitychange'));
            document.dispatchEvent(new Event('freeze'));
        });
        document.getElementById('fixture-resume-hidden').addEventListener('click', () => {
            document.dispatchEvent(new Event('resume'));
        });
        document.getElementById('fixture-visible').addEventListener('click', () => {
            setFixtureVisibility('visible');
            document.dispatchEvent(new Event('visibilitychange'));
        });
        document.getElementById('fixture-status-short').addEventListener('click', () => {
            document.getElementById('ehtt-status').textContent = '短状态';
            renderStatusAudit('short');
        });
        document.getElementById('fixture-status-long').addEventListener('click', () => {
            document.getElementById('ehtt-status').textContent =
                '这是用于验证固定三行高度的长状态文字，内容会持续换行并超过第三行，' +
                '超出部分应当直接截断，且状态栏和整个面板的高度都不得发生变化。' +
                '这段额外文字保证内容明确进入第四行以后，隐藏部分不会扩大状态栏。';
            renderStatusAudit('long');
        });
        renderAudit();
    })();
    </script>`;
}

function homepageHtml(url) {
    if (url.searchParams.has('reset')) showNewGalleries = false;
    const rows = showNewGalleries
        ? [galleries.current, galleries.short, galleries.digital]
        : [galleries.digital];
    return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Tag Transfer Homepage Fixture</title></head>
<body>
    <a id="fixture-show-new" href="/fixture/show-new">显示新画廊</a>
    <a id="fixture-correction-target" href="${galleries.correctionTarget.path}?reset=1&amp;run=1&amp;random=zero">未标注分支</a>
    <a id="fixture-derived-only" href="${galleries.derivedOnly.path}?reset=1&amp;run=1&amp;random=zero">仅标题派生</a>
    <a id="fixture-random-skip" href="${galleries.randomSkipTarget.path}?reset=1&amp;run=1&amp;random=max">随机少迁移</a>
    <button type="button" id="fixture-freeze">模拟后台冻结</button>
    <button type="button" id="fixture-resume-hidden">模拟隐藏恢复</button>
    <button type="button" id="fixture-visible">恢复可见</button>
    <button type="button" id="fixture-status-short">短状态</button>
    <button type="button" id="fixture-status-long">超长状态</button>
    <table class="itg"><tbody>${rows.map(searchRow).join('')}</tbody></table>
    <div id="fixture-events" hidden></div>
    <pre id="fixture-home-audit"></pre>
    <pre id="fixture-status-audit"></pre>
    ${clientRuntime()}
    ${userscriptSetup()}
    <script src="/tag-transfer.user.js"></script>
    ${homepageAuditRuntime()}
</body>
</html>`;
}

function badTagsHtml() {
    const galleryUrl = `http://127.0.0.1:${port}${galleries.badVote.path}`;
    const unavailableUrl = `http://127.0.0.1:${port}${unavailableGallery.path}`;
    const noVoteApiUrl = `http://127.0.0.1:${port}${galleries.noVoteApi.path}`;
    return `<!doctype html>
<html><body>
<table id="usertaglist"><tbody>
    <tr><td colspan="3">
        <a href="https://repo.e-hentai.org/tools/taglist?gid=500004">500004</a>
        <a href="${galleryUrl}">${galleries.badVote.title}</a>
    </td></tr>
    <tr><td colspan="3">Last bad tag vote: 7/30 12:00</td></tr>
    <tr>
        <td title="7/30 12:00:00">7/30 12:00</td>
        <td style="color:green">+1</td>
        <td><a href="/tag/female:lactation" style="color:red"
               title="female:lactation" ehs-tag="female:lactation">female:lactation</a></td>
    </tr>
    <tr>
        <td title="7/30 12:01:00">7/30 12:01</td>
        <td style="color:green">+1</td>
        <td><a href="/tag/female:filming" style="color:red"
               title="female:filming" ehs-tag="female:filming">female:filming</a></td>
    </tr>
    <tr>
        <td title="7/30 12:02:00">7/30 12:02</td>
        <td style="color:green">+1</td>
        <td><a href="/tag/female:mouth+mask" style="color:red"
               title="female:mouth mask" ehs-tag="female:mouth mask">female:mouth mask</a></td>
    </tr>
    <tr>
        <td title="7/30 12:03:00">7/30 12:03</td>
        <td style="color:green">+1</td>
        <td><a href="/tag/female:blowjob" style="color:red"
               title="female:blowjob" ehs-tag="female:blowjob">female:blowjob</a></td>
    </tr>
    <tr>
        <td title="7/30 12:04:00">7/30 12:04</td>
        <td style="color:green">+1</td>
        <td><a href="/tag/female:locked+vote" style="color:red"
               title="female:locked vote" ehs-tag="female:locked vote">female:locked vote</a></td>
    </tr>
    <tr>
        <td title="7/30 12:05:00">7/30 12:05</td>
        <td style="color:green">+1</td>
        <td><a href="/tag/female:race+before" style="color:red"
               title="female:race before" ehs-tag="female:race before">female:race before</a></td>
    </tr>
    <tr>
        <td title="7/30 12:06:00">7/30 12:06</td>
        <td style="color:green">+1</td>
        <td><a href="/tag/female:race+after" style="color:red"
               title="female:race after" ehs-tag="female:race after">female:race after</a></td>
    </tr>
    <tr><td colspan="3">
        <a href="https://repo.e-hentai.org/tools/taglist?gid=500007">500007</a>
        <a href="${unavailableUrl}">${unavailableGallery.title}</a>
    </td></tr>
    <tr><td colspan="3">Last bad tag vote: 7/30 12:07</td></tr>
    <tr>
        <td title="7/30 12:07:00">7/30 12:07</td>
        <td style="color:green">+1</td>
        <td><a href="/tag/female:removed" style="color:red"
               title="female:removed" ehs-tag="female:removed">female:removed</a></td>
    </tr>
    <tr><td colspan="3">
        <a href="https://repo.e-hentai.org/tools/taglist?gid=500008">500008</a>
        <a href="${noVoteApiUrl}">${galleries.noVoteApi.title}</a>
    </td></tr>
    <tr><td colspan="3">Last bad tag vote: 7/30 12:08</td></tr>
    <tr>
        <td title="7/30 12:08:00">7/30 12:08</td>
        <td style="color:green">+1</td>
        <td><a href="/tag/female:api+unavailable" style="color:red"
               title="female:api unavailable" ehs-tag="female:api unavailable">female:api unavailable</a></td>
    </tr>
</tbody></table>
</body></html>`;
}

const galleryByPath = new Map(
    Object.values(galleries).map(gallery => [gallery.path, gallery])
);
const galleryByGid = new Map(
    Object.values(galleries).map(gallery => [
        Number(gallery.path.match(/^\/g\/(\d+)\//)?.[1]),
        gallery
    ])
);

function applyTagGalleryVote(payload) {
    const gallery = galleryByGid.get(Number(payload.gid));
    const expectedToken = gallery?.path.match(/^\/g\/\d+\/([0-9a-f]+)\//i)?.[1];
    if (
        !gallery || payload.method !== 'taggallery' ||
        payload.token !== expectedToken || payload.apiuid !== 7647802 ||
        payload.apikey !== '0123456789abcdef'
    ) {
        return {status: 400, body: {error: 'Invalid fixture request'}};
    }
    const tags = String(payload.tags || '')
        .split(',')
        .map(value => value.trim().toLowerCase())
        .filter(Boolean);
    if (tags.includes('female:locked vote')) {
        tagVoteRequests.push({gid: payload.gid, tags, vote: payload.vote, result: 'locked'});
        return {
            status: 200,
            body: {error: 'Your vote can no longer be withdrawn.'}
        };
    }

    for (const tag of tags) {
        const index = gallery.tags.findIndex(([value]) => value === tag);
        if (
            payload.vote === -1 &&
            ['female:race before', 'female:race after'].includes(tag)
        ) {
            if (index >= 0) gallery.tags.splice(index, 1);
            continue;
        }
        if (payload.vote === 1) {
            if (index < 0) {
                gallery.tags.push([tag, {solid: false, voted: true}]);
            } else {
                const options = gallery.tags[index][1] ||= {};
                if (options.solid === false && !options.voted) {
                    options.downvoted = false;
                    options.voted = true;
                }
            }
        } else if (index >= 0) {
            const options = gallery.tags[index][1] ||= {};
            if (options.voted) {
                options.voted = false;
            } else if (options.downvoted) {
                options.downvoted = false;
            } else {
                options.downvoted = true;
            }
        }
    }
    tagVoteRequests.push({gid: payload.gid, tags, vote: payload.vote, result: 'applied'});
    const tagpane = gallery.tags.map(([tag, options]) => tagDiv(tag, options)).join('');
    if (tags.includes('female:unknown response') && !unknownVoteResponseSent) {
        unknownVoteResponseSent = true;
        return {status: 200, rawBody: '{'};
    }
    return {status: 200, body: {tagpane}};
}

const server = http.createServer((request, response) => {
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    if (url.searchParams.has('reset')) {
        requestCounts.clear();
        searchRequests.length = 0;
        tagVoteRequests.length = 0;
        transientHomepageFailures = 0;
        transientBadTagFailures = 1;
        unknownVoteResponseSent = false;
        resetGalleryTags();
    }
    if (url.pathname !== '/fixture/requests') {
        requestCounts.set(url.pathname, (requestCounts.get(url.pathname) || 0) + 1);
    }
    response.setHeader('Cache-Control', 'no-store');

    if (url.pathname === '/fixture/requests') {
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.end(JSON.stringify({
            ...Object.fromEntries(requestCounts),
            __searchRequests: searchRequests,
            __tagVotes: tagVoteRequests
        }));
        return;
    }

    if (url.pathname === '/api.php' && request.method === 'POST') {
        let body = '';
        request.setEncoding('utf8');
        request.on('data', chunk => {
            body += chunk;
            if (body.length > 10000) request.destroy();
        });
        request.on('end', () => {
            let result;
            try {
                result = applyTagGalleryVote(JSON.parse(body || '{}'));
            } catch {
                result = {status: 400, body: {error: 'Invalid JSON'}};
            }
            response.statusCode = result.status;
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.end(result.rawBody ?? JSON.stringify(result.body));
        });
        return;
    }

    if (url.pathname === '/tag-transfer.user.js') {
        response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        response.end(fs.readFileSync(scriptPath, 'utf8'));
        return;
    }
    if (url.pathname === '/bad-tags') {
        if (transientBadTagFailures > 0) {
            transientBadTagFailures--;
            response.statusCode = 503;
            response.setHeader('Content-Type', 'text/plain; charset=utf-8');
            response.end('temporary bad tag failure');
            return;
        }
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(badTagsHtml());
        return;
    }
    if (url.pathname === '/fixture/show-new') {
        showNewGalleries = true;
        transientHomepageFailures = 1;
        response.statusCode = 302;
        response.setHeader('Location', '/');
        response.end();
        return;
    }
    if (url.pathname === unavailableGallery.path) {
        response.statusCode = 404;
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(`<!doctype html><html><head><title>404 Gallery Not Found</title></head>
            <body><p>Gallery Not Found</p><div id="taglist"></div></body></html>`);
        return;
    }
    if (galleryByPath.has(url.pathname)) {
        const sendGallery = () => {
            response.setHeader('Content-Type', 'text/html; charset=utf-8');
            response.end(galleryHtml(
                galleryByPath.get(url.pathname),
                url.searchParams.has('run')
            ));
        };
        if (url.pathname === galleries.noVoteApi.path) {
            setTimeout(sendGallery, 1800);
        } else {
            sendGallery();
        }
        return;
    }
    if (url.pathname === '/' && url.searchParams.has('f_search')) {
        searchRequests.push({
            at: Date.now(),
            query: url.searchParams.get('f_search'),
            isNextPage: url.searchParams.get('next') === 'fixture',
            hasTitleQualifier: url.searchParams.get('f_search').includes('title:'),
            filters: ['f_sfl', 'f_sfu', 'f_sft'].every(
                key => url.searchParams.get(key) === 'on'
            )
        });
        setTimeout(() => {
            response.setHeader('Content-Type', 'text/html; charset=utf-8');
            response.end(searchHtml(url));
        }, 80);
        return;
    }
    if (
        url.pathname === '/' &&
        request.headers['sec-fetch-dest'] === 'empty' &&
        transientHomepageFailures > 0
    ) {
        transientHomepageFailures--;
        response.statusCode = 503;
        response.setHeader('Content-Type', 'text/plain; charset=utf-8');
        response.end('temporary fixture failure');
        return;
    }
    if (url.pathname === '/') {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(homepageHtml(url));
        return;
    }

    response.statusCode = 404;
    response.end('Not found');
});

server.listen(port, '127.0.0.1', () => {
    console.log(`fixture listening on http://127.0.0.1:${port}`);
    console.log(`homepage http://127.0.0.1:${port}/?reset=1`);
    console.log(`detail http://127.0.0.1:${port}${galleries.current.path}?reset=1&run=1`);
});
