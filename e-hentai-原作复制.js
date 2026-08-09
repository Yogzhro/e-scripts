// ==UserScript==
// @name         E-Hentai 原作标签 Alt+左键复制
// @namespace    e-hentai-parody-tag-copy
// @description  Alt+左键画廊的原作标签，将 E-Hentai 原始主标签按“出自作品:'标签内容'”复制到剪贴板
// @version      0.1.3.1
// @author       Reina
// @match        https://e-hentai.org/g/*/*
// @grant        GM_setClipboard
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    const GALLERY_PATH_PATTERN = /^\/g\/\d+\/[0-9a-f]+\/?$/i;
    const PARODY_TAG_SELECTOR =
        '#taglist a[id^="ta_parody:"][href*="/tag/parody:"]';
    const TOAST_ID = 'eh-parody-tag-copy-toast';

    if (!GALLERY_PATH_PATTERN.test(window.location.pathname)) {
        return;
    }

    function formatTag(tag) {
        return `出自作品:'${tag}'`;
    }

    function normalizeTag(tag) {
        return tag.replace(/\s+/g, ' ').trim();
    }

    function getPrimaryTag(tag) {
        return normalizeTag(tag).replace(/\s*\|.*$/, '').trim();
    }

    function getTagFromHref(tagLink) {
        try {
            const url = new URL(tagLink.href, window.location.href);
            const prefix = '/tag/parody:';

            if (!url.pathname.startsWith(prefix)) {
                return '';
            }

            const encodedTag = url.pathname.slice(prefix.length);
            return normalizeTag(
                decodeURIComponent(encodedTag.replace(/\+/g, ' '))
            );
        } catch (error) {
            console.warn(
                '[E-Hentai 原作标签 Alt+左键复制] 无法解析标签链接',
                error
            );
            return '';
        }
    }

    function getOriginalTag(tagLink) {
        // EhSyringe 翻译标签前，会把原始文本保存在 ehs-tag 属性中。
        const syringeOriginal = normalizeTag(
            tagLink.getAttribute('ehs-tag') || ''
        );
        if (syringeOriginal) {
            return syringeOriginal;
        }

        // 未安装 EhSyringe 时，从 E-Hentai 原始标签链接中还原标签。
        const hrefTag = getTagFromHref(tagLink);
        if (hrefTag) {
            return hrefTag;
        }

        const title = tagLink.getAttribute('title') || '';
        if (title.startsWith('p:')) {
            return normalizeTag(title.slice(2));
        }

        return '';
    }

    function writeClipboard(text) {
        if (typeof GM_setClipboard === 'function') {
            GM_setClipboard(text, 'text');
            return Promise.resolve();
        }

        return navigator.clipboard.writeText(text);
    }

    function showToast(message, isError) {
        let toast = document.getElementById(TOAST_ID);

        if (!toast) {
            toast = document.createElement('div');
            toast.id = TOAST_ID;
            toast.setAttribute('role', 'status');
            toast.setAttribute('aria-live', 'polite');
            Object.assign(toast.style, {
                position: 'fixed',
                left: '50%',
                bottom: '32px',
                zIndex: '2147483647',
                maxWidth: 'calc(100vw - 40px)',
                padding: '9px 14px',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '14px',
                lineHeight: '1.5',
                textAlign: 'center',
                wordBreak: 'break-word',
                boxShadow: '0 3px 12px rgba(0, 0, 0, .35)',
                pointerEvents: 'none',
                opacity: '0',
                transform: 'translate(-50%, 8px)',
                transition: 'opacity .15s ease, transform .15s ease',
            });
            document.body.appendChild(toast);
        }

        window.clearTimeout(showToast.timer);
        toast.textContent = message;
        toast.style.background = isError ? '#a82020' : '#287a3d';
        toast.style.opacity = '1';
        toast.style.transform = 'translate(-50%, 0)';

        showToast.timer = window.setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translate(-50%, 8px)';
        }, 1800);
    }

    document.addEventListener(
        'click',
        async (event) => {
            if (!event.altKey || event.button !== 0) {
                return;
            }

            const target =
                event.target instanceof Element
                    ? event.target
                    : event.target.parentElement;
            const tagLink = target?.closest(PARODY_TAG_SELECTOR);

            if (!tagLink) {
                return;
            }

            // 阻止 E-Hentai 标签菜单及浏览器 Alt+左键的默认动作。
            event.preventDefault();
            event.stopPropagation();

            const tag = getPrimaryTag(getOriginalTag(tagLink));
            if (!tag) {
                showToast('未找到 E-Hentai 原始原作标签', true);
                return;
            }

            const text = formatTag(tag);

            try {
                await writeClipboard(text);
                showToast(`已复制：${text}`, false);
            } catch (error) {
                console.error(
                    '[E-Hentai 原作标签 Alt+左键复制] 写入剪贴板失败',
                    error
                );
                showToast('复制失败，请检查浏览器剪贴板权限', true);
            }
        },
        true
    );
})();
