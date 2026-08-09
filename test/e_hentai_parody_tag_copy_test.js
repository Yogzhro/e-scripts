'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SCRIPT_PATH = path.resolve(__dirname, '..', 'e-hentai-原作复制.js');
const SCRIPT_SOURCE = fs.readFileSync(SCRIPT_PATH, 'utf8');
const PARODY_SELECTOR =
    '#taglist a[id^="ta_parody:"][href*="/tag/parody:"]';

class FakeElement {
    constructor(tagName, attributes = {}) {
        this.tagName = tagName.toUpperCase();
        this.attributes = { ...attributes };
        this.id = attributes.id || '';
        this.href = attributes.href || '';
        this.parentElement = null;
        this.style = {};
        this.textContent = '';
    }

    getAttribute(name) {
        return this.attributes[name] ?? null;
    }

    setAttribute(name, value) {
        this.attributes[name] = String(value);
    }

    closest(selector) {
        for (let element = this; element; element = element.parentElement) {
            if (
                selector === PARODY_SELECTOR &&
                element.id.startsWith('ta_parody:') &&
                element.href.includes('/tag/parody:')
            ) {
                return element;
            }
        }

        return null;
    }
}

class FakeDocument {
    constructor() {
        this.listeners = new Map();
        this.elementsById = new Map();
        this.body = null;
    }

    mountBody() {
        this.body = {
            appendChild: (element) => {
                this.elementsById.set(element.id, element);
            },
        };
    }

    addEventListener(type, listener, capture) {
        this.listeners.set(type, { listener, capture });
    }

    createElement(tagName) {
        return new FakeElement(tagName);
    }

    getElementById(id) {
        return this.elementsById.get(id) || null;
    }

    dispatch(type, event) {
        return this.listeners.get(type)?.listener(event);
    }
}

function createClickEvent(target, overrides = {}) {
    return {
        altKey: true,
        button: 0,
        target,
        defaultPrevented: false,
        propagationStopped: false,
        preventDefault() {
            this.defaultPrevented = true;
        },
        stopPropagation() {
            this.propagationStopped = true;
        },
        ...overrides,
    };
}

function loadScript(pathname = '/g/4084701/6a82725332/') {
    const document = new FakeDocument();
    const clipboardWrites = [];
    const window = {
        location: {
            pathname,
            href: `https://e-hentai.org${pathname}`,
        },
        clearTimeout() {},
        setTimeout() {
            return 1;
        },
    };

    vm.runInNewContext(SCRIPT_SOURCE, {
        URL,
        Element: FakeElement,
        GM_setClipboard(text, type) {
            clipboardWrites.push({ text, type });
        },
        console,
        document,
        navigator: {
            clipboard: {
                writeText() {
                    throw new Error('不应调用 navigator.clipboard');
                },
            },
        },
        window,
    });

    const listenerAttachedBeforeBody = document.listeners.has('click');
    document.mountBody();

    return { clipboardWrites, document, listenerAttachedBeforeBody };
}

async function run() {
    assert.match(SCRIPT_SOURCE, /^\/\/ @version\s+0\.1\.3\.1$/m);
    assert.match(SCRIPT_SOURCE, /^\/\/ @author\s+Reina$/m);
    assert.match(SCRIPT_SOURCE, /^\/\/ @run-at\s+document-start$/m);

    const primaryFixture = loadScript();
    const primaryLink = new FakeElement('a', {
        id: 'ta_parody:chou_kaguya-hime',
        href: 'https://e-hentai.org/tag/parody:chou+kaguya-hime',
        'ehs-tag': 'chou kaguya-hime | cosmic princess kaguya',
        title: 'p:chou kaguya-hime',
    });
    const translatedText = new FakeElement('span');
    translatedText.parentElement = primaryLink;
    const primaryClick = createClickEvent(translatedText);

    assert.equal(primaryFixture.listenerAttachedBeforeBody, true);
    assert.equal(primaryFixture.document.listeners.get('click').capture, true);
    await primaryFixture.document.dispatch('click', primaryClick);
    assert.deepEqual(primaryFixture.clipboardWrites, [
        {
            text: "出自作品:'chou kaguya-hime'",
            type: 'text',
        },
    ]);
    assert.equal(primaryClick.defaultPrevented, true);
    assert.equal(primaryClick.propagationStopped, true);

    const hrefFixture = loadScript();
    const hrefLink = new FakeElement('a', {
        id: 'ta_parody:space_test',
        href: 'https://e-hentai.org/tag/parody:space+test',
    });
    await hrefFixture.document.dispatch('click', createClickEvent(hrefLink));
    assert.equal(
        hrefFixture.clipboardWrites[0].text,
        "出自作品:'space test'"
    );

    const ignoredFixture = loadScript();
    const ignoredLink = new FakeElement('a', {
        id: 'ta_parody:ignored',
        href: 'https://e-hentai.org/tag/parody:ignored',
    });
    await ignoredFixture.document.dispatch(
        'click',
        createClickEvent(ignoredLink, { altKey: false })
    );
    assert.deepEqual(ignoredFixture.clipboardWrites, []);

    const offPageFixture = loadScript('/tag/parody:chou+kaguya-hime');
    assert.equal(offPageFixture.document.listeners.has('click'), false);

    console.log('e_hentai_parody_tag_copy_test: 4 scenarios passed');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
