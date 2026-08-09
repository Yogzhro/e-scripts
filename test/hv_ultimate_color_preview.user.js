// ==UserScript==
// @name         HV Ultimate 品质颜色测试
// @namespace    https://hentaiverse.org/
// @version      0.0.1.0
// @description  预览并读取论坛、角色装备页和装备详情页中的 Ultimate 品质及整件装备实际颜色
// @author       Reina
// @match        https://hentaiverse.org/*
// @match        https://forums.e-hentai.org/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // 只需修改这一段并重新运行脚本，即可直接预览新的 Ultimate 配色。
    const ULTIMATE_COLOR_CSS = `
.hv-eq-q-ultimate { background:#2b2b35; color:#f5f5f5;}
`;

    const EXAMPLE_EQUIPMENT = {
        url: 'https://hentaiverse.org/equip/311306864/4ec56057d3',
        quality: '𖣔终极𖣔',
        name: '神圣(圣伤+) 橡木 法杖 毁灭(法伤+)',
    };
    // HV Utils 4.2.4: --color-equip-Ultimate: #dcf，并应用于整件装备的 .hvut-equip-Ultimate。
    const HVUTILS_ULTIMATE_BACKGROUND = '#dcf';
    const PANEL_ID = 'hv-ultimate-color-test-panel';
    const STYLE_ID = 'hv-ultimate-color-test-style';

    function getPageContext(url) {
        const parsedUrl = new URL(url);
        if (parsedUrl.hostname === 'forums.e-hentai.org') return '论坛';
        if (parsedUrl.hostname !== 'hentaiverse.org') return '非目标页面';
        if (parsedUrl.pathname.startsWith('/equip/')) return '装备详情页';
        if (parsedUrl.searchParams.get('s') === 'Character' && parsedUrl.searchParams.get('ss') === 'eq') return '角色装备页';
        return 'HentaiVerse 其他页面';
    }

    function readConfiguredColors(cssText) {
        const rule = cssText.match(/\.hv-eq-q-ultimate\s*\{([^}]+)\}/i)?.[1] || '';
        return {
            background: rule.match(/background\s*:\s*([^;]+)/i)?.[1].trim() || '',
            color: rule.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i)?.[1].trim() || '',
        };
    }

    function runNodeSelfTest() {
        const assert = (condition, message) => {
            if (!condition) throw new Error(message);
        };
        const configuredColors = readConfiguredColors(ULTIMATE_COLOR_CSS);
        assert(configuredColors.background === '#2b2b35', '必须读取 Ultimate 背景色');
        assert(configuredColors.color === '#f5f5f5', '必须读取 Ultimate 文字色');
        assert(HVUTILS_ULTIMATE_BACKGROUND === '#dcf', '必须使用 HV Utils 4.2.4 的 Ultimate 整件装备背景色');
        assert(getPageContext('https://forums.e-hentai.org/index.php?showuser=9133018') === '论坛', '必须识别论坛页面');
        assert(getPageContext('https://hentaiverse.org/?s=Character&ss=eq') === '角色装备页', '必须识别角色装备页');
        assert(getPageContext('https://hentaiverse.org/equip/284768906/385649fcd5') === '装备详情页', '必须识别装备详情页');
        assert(getPageContext('https://example.com/') === '非目标页面', '必须拒绝非目标页面');
        assert(EXAMPLE_EQUIPMENT.url.includes('/equip/311306864/4ec56057d3'), '必须使用指定预览装备');
        console.log('HV Ultimate 品质颜色测试脚本自检通过');
    }

    if (typeof document === 'undefined') {
        runNodeSelfTest();
        return;
    }

    function ensureStyle() {
        document.getElementById(STYLE_ID)?.remove();
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
${ULTIMATE_COLOR_CSS}
#${PANEL_ID} {
    position:fixed; right:14px; bottom:14px; z-index:2147483647; width:min(620px,calc(100vw - 28px));
    max-height:70vh; overflow:auto; box-sizing:border-box; padding:12px; border:1px solid #777;
    border-radius:6px; background:rgba(250,250,250,.97); color:#222; font:12px/1.45 Arial,sans-serif;
    box-shadow:0 3px 18px rgba(0,0,0,.28);
}
#${PANEL_ID} h3 { margin:0 0 6px; font-size:15px; }
#${PANEL_ID} p { margin:4px 0 8px; }
#${PANEL_ID} button { margin:0 6px 8px 0; padding:3px 8px; cursor:pointer; }
#${PANEL_ID} table { width:100%; border-collapse:collapse; table-layout:fixed; }
#${PANEL_ID} th, #${PANEL_ID} td { padding:4px; border:1px solid #aaa; text-align:left; vertical-align:top; overflow-wrap:anywhere; }
#${PANEL_ID} th:first-child { width:28%; }
#${PANEL_ID} .hv-ultimate-color-swatch { display:inline-block; width:13px; height:13px; margin-right:4px; border:1px solid #777; vertical-align:-2px; }
#${PANEL_ID} .hv-ultimate-preview-fixture { margin:7px 0; padding:8px; border:1px dashed #777; }
#${PANEL_ID} .hv-ultimate-preview-equipment { padding:4px; background-color:var(--color-equip-Ultimate,${HVUTILS_ULTIMATE_BACKGROUND}); }
#${PANEL_ID} .hv-ultimate-preview-fixture a { color:inherit; text-decoration:none; }
#${PANEL_ID} .hv-ultimate-preview-fixture .hv-eq-token { border-radius:2px; padding:0 2px; line-height:1.18; box-shadow:inset 0 0 0 1px rgba(0,0,0,.12); }
`;
        document.head.appendChild(style);
    }

    function describeElement(element) {
        if (!element) return { color: '无', background: '无' };
        const style = getComputedStyle(element);
        return { color: style.color, background: style.backgroundColor };
    }

    function getEquipmentElement(token) {
        return token.closest('.hvut-equip-Ultimate') || token.closest('a') || token.parentElement;
    }

    function getEquipmentContainer(equipmentElement) {
        return equipmentElement?.closest('.signature, td, #equip_extended, #stats_scrollable, #eqsb') || document.body;
    }

    function createColorCell(colors) {
        const cell = document.createElement('td');
        const swatch = document.createElement('span');
        swatch.className = 'hv-ultimate-color-swatch';
        swatch.style.background = colors.background;
        cell.append(swatch, `${colors.color} / ${colors.background}`);
        return cell;
    }

    function createReportRow(label, token, equipmentElement, containerElement) {
        const row = document.createElement('tr');
        const nameCell = document.createElement('td');
        nameCell.textContent = label;
        row.append(
            nameCell,
            createColorCell(describeElement(token)),
            createColorCell(describeElement(equipmentElement)),
            createColorCell(describeElement(containerElement)),
        );
        return row;
    }

    function createPreviewFixture() {
        const bodyStyle = getComputedStyle(document.body);
        const fixture = document.createElement('div');
        fixture.className = 'hv-ultimate-preview-fixture';
        fixture.style.color = bodyStyle.color;
        fixture.style.background = bodyStyle.backgroundColor;

        const equipmentElement = document.createElement('div');
        equipmentElement.className = 'hvut-equip-Ultimate hv-ultimate-preview-equipment';
        const link = document.createElement('a');
        link.href = EXAMPLE_EQUIPMENT.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';

        const token = document.createElement('font');
        token.className = 'hv-eq-token hv-eq-q-ultimate';
        token.textContent = EXAMPLE_EQUIPMENT.quality;
        link.append(token, ` ${EXAMPLE_EQUIPMENT.name}`);
        equipmentElement.appendChild(link);
        fixture.appendChild(equipmentElement);
        return { fixture, token, equipmentElement };
    }

    function buildReport(panel, preview) {
        panel.querySelector('table')?.remove();
        const table = document.createElement('table');
        const header = document.createElement('tr');
        for (const text of ['样本', 'Ultimate 文字 / 背景', '整件装备（HV Utils 品质层）文字 / 背景', '外层容器文字 / 背景']) {
            const cell = document.createElement('th');
            cell.textContent = text;
            header.appendChild(cell);
        }
        table.appendChild(header);

        const actualTokens = [...document.querySelectorAll('.hv-eq-q-ultimate')]
            .filter(token => !token.closest(`#${PANEL_ID}`));
        actualTokens.forEach((token, index) => {
            const equipmentElement = getEquipmentElement(token);
            const label = `${index + 1}. ${(equipmentElement?.textContent || token.textContent).trim().replace(/\s+/g, ' ').slice(0, 80)}`;
            table.appendChild(createReportRow(label, token, equipmentElement, getEquipmentContainer(equipmentElement)));
        });

        if (preview) {
            table.appendChild(createReportRow(
                '角色装备页预览：311306864',
                preview.token,
                preview.equipmentElement,
                document.body,
            ));
        }
        if (!actualTokens.length && !preview) {
            const emptyRow = document.createElement('tr');
            const emptyCell = document.createElement('td');
            emptyCell.colSpan = 4;
            emptyCell.textContent = '当前页面没有找到 .hv-eq-q-ultimate。请先启用 HV 综合汉化并切换到中文。';
            emptyRow.appendChild(emptyCell);
            table.appendChild(emptyRow);
        }
        panel.appendChild(table);
    }

    function initialize() {
        ensureStyle();
        document.getElementById(PANEL_ID)?.remove();

        const panel = document.createElement('section');
        panel.id = PANEL_ID;
        const heading = document.createElement('h3');
        heading.textContent = `Ultimate 配色测试｜${getPageContext(location.href)}`;
        const note = document.createElement('p');
        const configuredColors = readConfiguredColors(ULTIMATE_COLOR_CSS);
        const hvUtilsBackground = getComputedStyle(document.documentElement).getPropertyValue('--color-equip-Ultimate').trim() || HVUTILS_ULTIMATE_BACKGROUND;
        note.textContent = `品质块配置：文字 ${configuredColors.color}，背景 ${configuredColors.background}；HV Utils 4.2.4 整件装备背景：${hvUtilsBackground}。表格显示浏览器最终计算值；透明背景会显示为 rgba(0, 0, 0, 0)。`;
        const refreshButton = document.createElement('button');
        refreshButton.type = 'button';
        refreshButton.textContent = '重新读取计算色';
        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.textContent = '关闭面板';
        closeButton.addEventListener('click', () => panel.remove());
        panel.append(heading, note, refreshButton, closeButton);

        let preview = null;
        if (getPageContext(location.href) === '角色装备页') {
            preview = createPreviewFixture();
            panel.appendChild(preview.fixture);
        }
        refreshButton.addEventListener('click', () => buildReport(panel, preview));
        document.body.appendChild(panel);
        buildReport(panel, preview);
    }

    initialize();
})();
