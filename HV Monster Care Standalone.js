// ==UserScript==
// @name         HV Monster Care Standalone
// @namespace    hv-monster-care-standalone
// @version      0.1.3
// @author       yoshiko
// @description  Standalone Monster Lab gift/feed/drug maintenance with copyable debug logs.
// @match        http*://hentaiverse.org/*
// @match        http*://alt.hentaiverse.org/*
// @match        http*://*.hentaiverse.org/*
// @exclude      http*://hentaiverse.org/equip/*
// @exclude      http*://alt.hentaiverse.org/equip/*
// @exclude      http*://*.hentaiverse.org/equip/*
// @grant        GM_setClipboard
// @grant        GM.setClipboard
// @grant        unsafeWindow
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  const SCRIPT_NAME = "HV Monster Care";
  const STORE = Object.freeze({
    settings: "hvmc_settings_v1",
    state: "hvmc_state_v1",
    logs: "hvmc_logs_v1"
  });
  const MONSTER_LAB_URL = "?s=Bazaar&ss=ml";
  const LOCK_TTL_MS = 2 * 60 * 1000;
  const LOG_LIMIT = 120;

  const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    minHours: 60,
    maxHours: 72,
    feedAllName: "feed_all",
    feedAllValue: "food",
    sootheAllName: "feed_all",
    sootheAllValue: "drugs",
    requestDelayMs: 700,
    showPanel: true
  });

  const runtime = {
    busy: false,
    status: "",
    panel: null,
    statusNode: null
  };

  installDebugApi();

  if (!isHvHost()) return;
  if (isIsekaiPage()) {
    log("debug", "Skip isekai page");
    return;
  }

  const settings = readSettings();
  if (settings.showPanel && isMonsterLabPage()) {
    createPanel();
  }

  if (settings.enabled && !isBattleOrRiddlePage()) {
    setTimeout(() => {
      autoRunIfDue().catch((error) => {
        recordError("Auto maintenance failed", error);
        setStatus("自动维护失败，控制台输入 HVMonsterCareDebug() 查看。", "error");
      });
    }, 1500 + Math.floor(Math.random() * 1500));
  }

  async function autoRunIfDue() {
    const currentSettings = readSettings();
    if (!currentSettings.enabled) return false;

    const state = readState();
    const intervalMs = getNextIntervalMs(currentSettings, false);
    if (state.lastRunAt && Date.now() - state.lastRunAt < intervalMs) {
      log("debug", "Maintenance is not due", {
        lastRunAt: state.lastRunAt,
        nextDueAt: state.lastRunAt + intervalMs
      });
      refreshPanel();
      return false;
    }

    return runWithLock("full", "auto", { updateTimer: true });
  }

  async function runWithLock(action, trigger, options = {}) {
    if (runtime.busy) {
      log("warn", "Runtime is already busy", { action, trigger });
      return false;
    }

    const lock = acquireLock(`${trigger}:${action}`, { force: Boolean(options.forceLock) });
    if (!lock.token) {
      log("warn", "Another maintenance run is locked", { action, trigger, blockedBy: lock.blockedBy });
      return false;
    }

    runtime.busy = true;
    refreshPanel();

    try {
      const result = await performAction(action, trigger);
      if (options.updateTimer && result && result.actions && result.actions.length > 0) {
        markMaintenanceCompleted(result);
      }
      return result;
    } catch (error) {
      markMaintenanceFailed(error);
      throw error;
    } finally {
      runtime.busy = false;
      releaseLock(lock.token);
      refreshPanel();
    }
  }

  async function performAction(action, trigger) {
    const currentSettings = readSettings();
    const startedAt = Date.now();
    const result = {
      action,
      trigger,
      startedAt,
      actions: [],
      messages: []
    };

    log("info", "Maintenance started", { action, trigger });
    setStatus("怪物维护运行中...");

    let detectionDoc = isMonsterLabPage() ? document : null;

    if (action === "full" || action === "collect") {
      const doc = await collectGifts(trigger);
      detectionDoc = doc || detectionDoc;
      appendActionResult(result, "collect", doc);
      if (action !== "collect") await requestPause(currentSettings);
    }

    if (action === "full" || action === "feed") {
      const doc = await feedAll(detectionDoc, trigger);
      detectionDoc = doc || detectionDoc;
      appendActionResult(result, "feed", doc);
      if (action !== "feed") await requestPause(currentSettings);
    }

    if (action === "full" || action === "soothe" || action === "drug") {
      const doc = await sootheAll(detectionDoc, trigger);
      detectionDoc = doc || detectionDoc;
      appendActionResult(result, "soothe", doc);
    }

    setStatus("怪物维护完成。");

    result.finishedAt = Date.now();
    log("info", "Maintenance finished", {
      action,
      trigger,
      actions: result.actions,
      elapsedMs: result.finishedAt - result.startedAt
    });
    return result;
  }

  async function collectGifts(trigger) {
    setStatus("正在收取怪物礼物...");
    const doc = await requestDocument(MONSTER_LAB_URL);
    updatePageMessageBox(doc);
    logMessages("Gift collection response", doc);
    return doc;
  }

  async function feedAll(doc) {
    const currentSettings = readSettings();

    const param = detectBatchParam(doc, "feed", currentSettings);
    setStatus(`正在喂食全部怪物 (${param.name}=${param.value})...`);
    const params = new URLSearchParams();
    params.set(param.name, param.value);
    const responseDoc = await requestDocument(MONSTER_LAB_URL, params);
    updatePageMessageBox(responseDoc);
    logMessages("Feed all response", responseDoc, param);
    return responseDoc;
  }

  async function sootheAll(doc) {
    const currentSettings = readSettings();
    const param = detectBatchParam(doc, "soothe", currentSettings);
    setStatus(`正在安抚全部怪物 (${param.name}=${param.value})...`);
    const params = new URLSearchParams();
    params.set(param.name, param.value);
    const responseDoc = await requestDocument(MONSTER_LAB_URL, params);
    updatePageMessageBox(responseDoc);
    logMessages("Soothe all response", responseDoc, param);
    return responseDoc;
  }

  function appendActionResult(result, action, doc) {
    if (!doc) return;
    const messages = extractMessages(doc);
    result.actions.push(action);
    if (messages.length) {
      result.messages.push({ action, messages });
    }
  }

  async function requestPause(settings) {
    const base = Math.max(0, Number(settings.requestDelayMs) || 0);
    await sleep(base + Math.floor(Math.random() * 350));
  }

  async function requestDocument(path, params) {
    const body = params ? params.toString() : "";
    const method = body ? "POST" : "GET";
    const url = absoluteUrl(path);
    const headers = {
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    };

    if (body) {
      headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
    }

    log("debug", "HTTP request", { method, url, body });

    const response = await fetch(url, {
      method,
      credentials: "include",
      headers,
      body: body || undefined
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    if (text.trim() === "state lock limiter in effect") {
      throw new Error("state lock limiter in effect");
    }

    const doc = new DOMParser().parseFromString(text, "text/html");
    return doc;
  }

  function detectBatchParam(doc, type, settings) {
    if (!doc || !doc.querySelectorAll) {
      return defaultBatchParam(type, settings);
    }

    if (type === "feed") {
      const detected = detectNamedControl(doc, settings.feedAllName, settings.feedAllValue);
      return detected || defaultBatchParam(type, settings);
    }

    return defaultBatchParam(type, settings);
  }

  function detectNamedControl(doc, name, fallbackValue) {
    const selector = `input[name="${cssEscape(name)}"], button[name="${cssEscape(name)}"]`;
    const control = doc.querySelector(selector);
    if (!control) return null;

    const rawValue = (control.getAttribute("value") || "").trim();
    return {
      name,
      value: isUsefulActionValue(rawValue) ? rawValue : fallbackValue
    };
  }

  function detectControlByNameAndValue(doc, name, valuePattern, fallbackValue) {
    const selector = `input[name="${cssEscape(name)}"], button[name="${cssEscape(name)}"]`;
    const controls = Array.from(doc.querySelectorAll(selector));
    const found = controls.find((control) => valuePattern.test((control.getAttribute("value") || "").trim()));
    if (!found) return null;

    const rawValue = (found.getAttribute("value") || "").trim();
    return {
      name,
      value: isUsefulActionValue(rawValue) ? rawValue : fallbackValue
    };
  }

  function defaultBatchParam(type, settings) {
    if (type === "feed") {
      return { name: settings.feedAllName, value: settings.feedAllValue };
    }
    return { name: settings.sootheAllName, value: settings.sootheAllValue };
  }

  function isUsefulActionValue(value) {
    return /^(food|drugs?|pill|pills)$/i.test(value);
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(String(value));
    }
    return String(value).replace(/"/g, '\\"');
  }

  function absoluteUrl(path) {
    return new URL(path, `${location.origin}/`).href;
  }

  function updatePageMessageBox(doc) {
    if (!isMonsterLabPage() || !doc) return;

    const incoming = doc.querySelector("#messagebox_outer");
    if (!incoming) return;

    const current = document.querySelector("#messagebox_outer");
    if (current && current.parentNode) {
      current.replaceWith(document.importNode(incoming, true));
      return;
    }

    const host = document.querySelector("#mainpane") || document.body;
    if (host) {
      host.appendChild(document.importNode(incoming, true));
    }
  }

  function extractMessages(doc) {
    if (!doc || !doc.querySelectorAll) return [];
    const nodes = Array.from(doc.querySelectorAll("#messagebox_inner > p, #messagebox_inner p"));
    return nodes
      .map((node) => (node.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
  }

  function logMessages(label, doc, extra) {
    const messages = extractMessages(doc);
    if (messages.length) {
      log("info", label, { messages, extra });
    } else {
      log("info", label, { messages: [], extra });
    }
  }

  function getNextIntervalMs(settings, forceRefresh) {
    const minMs = Math.max(1, Number(settings.minHours) || DEFAULT_SETTINGS.minHours) * 3600 * 1000;
    const maxHours = Math.max(Number(settings.maxHours) || DEFAULT_SETTINGS.maxHours, Number(settings.minHours) || DEFAULT_SETTINGS.minHours);
    const maxMs = maxHours * 3600 * 1000;
    const state = readState();

    if (forceRefresh || !Number.isFinite(Number(state.nextIntervalMs)) || state.nextIntervalMs < minMs || state.nextIntervalMs > maxMs) {
      state.nextIntervalMs = Math.round(minMs + Math.random() * (maxMs - minMs));
      writeState(state);
    }

    return Number(state.nextIntervalMs);
  }

  function markMaintenanceCompleted(result) {
    const currentSettings = readSettings();
    const state = readState();
    state.lastRunAt = Date.now();
    state.nextIntervalMs = getRandomIntervalMs(currentSettings);
    state.lastResult = {
      ok: true,
      at: state.lastRunAt,
      trigger: result.trigger,
      action: result.action,
      actions: result.actions,
      messages: result.messages
    };
    delete state.lastError;
    writeState(state);
    refreshPanel();
  }

  function markMaintenanceFailed(error) {
    const state = readState();
    state.lastError = {
      at: Date.now(),
      error: errorToObject(error)
    };
    writeState(state);
  }

  function getRandomIntervalMs(settings) {
    const minHours = Math.max(1, Number(settings.minHours) || DEFAULT_SETTINGS.minHours);
    const maxHours = Math.max(minHours, Number(settings.maxHours) || DEFAULT_SETTINGS.maxHours);
    const minMs = minHours * 3600 * 1000;
    const maxMs = maxHours * 3600 * 1000;
    return Math.round(minMs + Math.random() * (maxMs - minMs));
  }

  function acquireLock(reason, options = {}) {
    const now = Date.now();
    const state = readState();
    const existing = getLockDebugInfo(state.lock, now);

    if (existing.active && !options.force) {
      return { token: "", blockedBy: existing };
    }

    if (existing.active && options.force) {
      log("warn", "Maintenance lock overridden", { reason, previousLock: existing });
    } else if (existing.present && (existing.expired || existing.invalid)) {
      log("debug", "Maintenance lock cleared", { reason, previousLock: existing });
    }

    const token = `${now}-${Math.random().toString(36).slice(2)}`;
    state.lock = {
      token,
      reason,
      createdAt: now,
      expiresAt: now + LOCK_TTL_MS
    };
    writeState(state);

    const verify = readState();
    return verify.lock && verify.lock.token === token
      ? { token, overrode: existing.active && Boolean(options.force), previousLock: existing.active ? existing : null }
      : { token: "", blockedBy: getLockDebugInfo(verify.lock) };
  }

  function getLockDebugInfo(lock, now = Date.now()) {
    if (!lock) {
      return { present: false, active: false, expired: false, invalid: false };
    }

    const isObject = typeof lock === "object";
    const token = isObject && typeof lock.token === "string" ? lock.token : "";
    const expiresAt = isObject ? Number(lock.expiresAt) : NaN;
    const createdAt = isObject ? Number(lock.createdAt) : NaN;
    const valid = Boolean(token) && Number.isFinite(expiresAt);

    return {
      present: true,
      active: valid && expiresAt > now,
      expired: valid && expiresAt <= now,
      invalid: !valid,
      token: token || "",
      reason: isObject && lock.reason ? String(lock.reason) : "",
      createdAt: Number.isFinite(createdAt) ? createdAt : null,
      expiresAt: Number.isFinite(expiresAt) ? expiresAt : null,
      expiresInMs: valid ? expiresAt - now : null,
      raw: normalizeLogData(lock)
    };
  }

  function releaseLock(token) {
    if (!token) return;
    const state = readState();
    if (state.lock && state.lock.token === token) {
      delete state.lock;
      writeState(state);
    }
  }

  function readSettings() {
    return normalizeSettings(readJson(STORE.settings, {}));
  }

  function writeSettings(next) {
    const settings = normalizeSettings(next);
    writeJson(STORE.settings, settings);
    refreshPanel();
    return settings;
  }

  function normalizeSettings(raw) {
    const candidate = Object.assign({}, DEFAULT_SETTINGS, raw || {});
    const minHours = positiveNumber(candidate.minHours, DEFAULT_SETTINGS.minHours);
    const maxHours = Math.max(minHours, positiveNumber(candidate.maxHours, DEFAULT_SETTINGS.maxHours));
    const storedSootheName = String(candidate.sootheAllName || DEFAULT_SETTINGS.sootheAllName);
    const storedSootheValue = String(candidate.sootheAllValue || DEFAULT_SETTINGS.sootheAllValue);
    const sootheAllName = storedSootheName === "drug_all" && storedSootheValue === "drugs"
      ? DEFAULT_SETTINGS.sootheAllName
      : storedSootheName;

    return {
      enabled: Boolean(candidate.enabled),
      minHours,
      maxHours,
      feedAllName: String(candidate.feedAllName || DEFAULT_SETTINGS.feedAllName),
      feedAllValue: String(candidate.feedAllValue || DEFAULT_SETTINGS.feedAllValue),
      sootheAllName,
      sootheAllValue: storedSootheValue,
      requestDelayMs: Math.max(0, Number(candidate.requestDelayMs) || DEFAULT_SETTINGS.requestDelayMs),
      showPanel: Boolean(candidate.showPanel)
    };
  }

  function positiveNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  function readState() {
    const state = readJson(STORE.state, {});
    return state && typeof state === "object" ? state : {};
  }

  function writeState(state) {
    writeJson(STORE.state, state || {});
  }

  function readLogs() {
    const logs = readJson(STORE.logs, []);
    return Array.isArray(logs) ? logs : [];
  }

  function writeLogs(logs) {
    writeJson(STORE.logs, Array.isArray(logs) ? logs.slice(-LOG_LIMIT) : []);
  }

  function readJson(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      console.warn(`[${SCRIPT_NAME}] Failed to read ${key}`, error);
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn(`[${SCRIPT_NAME}] Failed to write ${key}`, error);
    }
  }

  function log(level, message, data) {
    const entry = {
      at: Date.now(),
      level,
      message,
      data: normalizeLogData(data)
    };
    const logs = readLogs();
    logs.push(entry);
    writeLogs(logs);

    const text = `[${SCRIPT_NAME}] ${message}`;
    if (level === "error") {
      console.error(text, data || "");
    } else if (level === "warn") {
      console.warn(text, data || "");
    } else if (level === "debug") {
      console.debug(text, data || "");
    } else {
      console.log(text, data || "");
    }
  }

  function recordError(message, error) {
    log("error", message, errorToObject(error));
  }

  function normalizeLogData(data) {
    if (data === undefined) return undefined;
    if (data instanceof Error) return errorToObject(data);
    try {
      return JSON.parse(JSON.stringify(data));
    } catch {
      return String(data);
    }
  }

  function errorToObject(error) {
    if (!error) return { message: "Unknown error" };
    return {
      name: error.name || "Error",
      message: error.message || String(error),
      stack: error.stack || ""
    };
  }

  function createPanel() {
    if (runtime.panel || !document.body) return;

    injectPanelStyle();

    const panel = el("div", { id: "hvmc-panel" });
    const title = el("div", { className: "hvmc-title", textContent: "Monster Care" });

    const buttons = el("div", { className: "hvmc-buttons" });
    buttons.append(
      button("run", "立即维护"),
      button("copy-debug", "调试信息"),
      button("set-interval", "设置间隔时间")
    );

    const status = el("div", { className: "hvmc-status" });
    runtime.statusNode = status;

    panel.append(title, buttons, status);
    document.body.appendChild(panel);
    runtime.panel = panel;

    panel.addEventListener("click", onPanelClick);
    refreshPanel();
  }

  function injectPanelStyle() {
    if (document.getElementById("hvmc-style")) return;

    const style = el("style", { id: "hvmc-style" });
    style.textContent = [
      "#hvmc-panel{position:fixed;right:12px;bottom:12px;z-index:9999;width:180px;padding:8px;border:1px solid #8a7b5f;background:#f3ead5;color:#3d2f1b;font:12px/1.35 Arial,Tahoma,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.22);}",
      "#hvmc-panel .hvmc-title{font-weight:bold;margin-bottom:5px;text-align:center;}",
      "#hvmc-panel .hvmc-buttons{display:grid;grid-template-columns:1fr;gap:4px;}",
      "#hvmc-panel button{padding:3px 4px;border:1px solid #8a7b5f;background:#fff7de;color:#3d2f1b;font-size:12px;cursor:pointer;white-space:nowrap;}",
      "#hvmc-panel button:hover{background:#fff1bd;}",
      "#hvmc-panel button:disabled{opacity:.55;cursor:default;}",
      "#hvmc-panel .hvmc-status{margin-top:6px;min-height:30px;white-space:pre-wrap;word-break:break-word;}"
    ].join("\n");
    document.head.appendChild(style);
  }

  function button(action, text) {
    return el("button", {
      type: "button",
      textContent: text,
      dataset: { hvmcAction: action }
    });
  }

  async function onPanelClick(event) {
    const target = event.target.closest("[data-hvmc-action]");
    if (!target) return;

    const action = target.dataset.hvmcAction;
    try {
      if (action === "copy-debug") {
        await copyDebugReport();
      } else if (action === "set-interval") {
        configureInterval();
      } else if (action === "run") {
        await runWithLock("full", "manual", { updateTimer: true, forceLock: true });
      } else {
        await runWithLock(action, "manual", { updateTimer: false });
      }
    } catch (error) {
      recordError(`Manual action failed: ${action}`, error);
      setStatus("手动操作失败，已写入调试日志。", "error");
    }
  }

  function configureInterval() {
    const settings = readSettings();
    const current = formatIntervalRange(settings);
    const input = prompt("设置怪物维护间隔小时。输入 60-72 表示随机范围，输入 72 表示固定 72 小时。", current);
    if (input === null) return;

    const parsed = parseIntervalInput(input);
    if (!parsed) {
      log("warn", "Invalid interval input", { input });
      setStatus("间隔格式无效，请输入 60-72 或 72。");
      return;
    }

    const nextSettings = writeSettings(Object.assign({}, settings, parsed));
    const state = readState();
    state.nextIntervalMs = getRandomIntervalMs(nextSettings);
    writeState(state);
    log("info", "Interval updated", { minHours: nextSettings.minHours, maxHours: nextSettings.maxHours, nextIntervalMs: state.nextIntervalMs });
    setStatus(`间隔已设置为 ${formatIntervalRange(nextSettings)} 小时。`);
  }

  function parseIntervalInput(input) {
    const text = String(input || "")
      .trim()
      .replace(/[~～—–－]/g, "-")
      .replace(/[至到]/g, "-");
    const match = text.match(/^(\d+(?:\.\d+)?)\s*(?:-\s*(\d+(?:\.\d+)?))?$/);
    if (!match) return null;

    const minHours = Number(match[1]);
    const maxHours = Number(match[2] || match[1]);
    if (!Number.isFinite(minHours) || !Number.isFinite(maxHours) || minHours <= 0 || maxHours <= 0 || maxHours < minHours) {
      return null;
    }

    return { minHours, maxHours };
  }

  function formatIntervalRange(settings) {
    const minHours = Number(settings.minHours);
    const maxHours = Number(settings.maxHours);
    return minHours === maxHours ? String(minHours) : `${minHours}-${maxHours}`;
  }

  function refreshPanel() {
    if (!runtime.panel) return;

    runtime.panel.querySelectorAll("button").forEach((btn) => {
      btn.disabled = runtime.busy;
    });

    if (runtime.statusNode) {
      runtime.statusNode.textContent = runtime.status || buildPanelStatus();
    }
  }

  function buildPanelStatus() {
    const state = readState();
    const settings = readSettings();
    const intervalMs = getNextIntervalMs(settings, false);
    const last = state.lastRunAt ? formatTime(state.lastRunAt) : "未运行";
    const next = state.lastRunAt ? formatTime(state.lastRunAt + intervalMs) : "现在";
    const lastError = state.lastError ? "\n上次有错误" : "";
    return `上次: ${last}\n下次: ${next}${lastError}`;
  }

  function setStatus(text, level) {
    runtime.status = text || "";
    if (level === "error") {
      log("error", "Status error", { text });
    }
    refreshPanel();
  }

  function el(tagName, props, ...children) {
    const node = document.createElement(tagName);
    Object.entries(props || {}).forEach(([key, value]) => {
      if (key === "dataset") {
        Object.entries(value || {}).forEach(([dataKey, dataValue]) => {
          node.dataset[dataKey] = dataValue;
        });
      } else if (key in node) {
        node[key] = value;
      } else {
        node.setAttribute(key, value);
      }
    });
    children.forEach((child) => {
      if (child) node.appendChild(child);
    });
    return node;
  }

  function installDebugApi() {
    const api = {
      runNow: () => runWithLock("full", "console", { updateTimer: true, forceLock: true }),
      collectGifts: () => runWithLock("collect", "console", { updateTimer: false, forceLock: true }),
      feedAll: () => runWithLock("feed", "console", { updateTimer: false, forceLock: true }),
      drugAll: () => runWithLock("soothe", "console", { updateTimer: false, forceLock: true }),
      sootheAll: () => runWithLock("soothe", "console", { updateTimer: false, forceLock: true }),
      debugText: buildDebugReport,
      copyDebug: copyDebugReport,
      logs: readLogs,
      state: readState,
      settings(next) {
        if (next && typeof next === "object") {
          return writeSettings(Object.assign({}, readSettings(), next));
        }
        return readSettings();
      },
      resetTimer() {
        const settings = readSettings();
        const state = readState();
        state.lastRunAt = 0;
        state.nextIntervalMs = getRandomIntervalMs(settings);
        writeState(state);
        log("info", "Timer reset from console");
        refreshPanel();
        return state;
      }
    };

    const targetWindow = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    targetWindow.HVMonsterCare = api;
    targetWindow.HVMonsterCareDebug = function () {
      const text = buildDebugReport();
      console.log(text);
      return text;
    };
    targetWindow.HVMonsterCareCopyDebug = function () {
      return copyDebugReport();
    };
  }

  function buildDebugReport() {
    const settings = readSettings();
    const state = readState();
    const logs = readLogs();
    const intervalMs = getNextIntervalMs(settings, false);
    const report = {
      script: SCRIPT_NAME,
      version: "0.1.3",
      generatedAt: new Date().toISOString(),
      location: location.href,
      isMonsterLabPage: isMonsterLabPage(),
      isBattleOrRiddlePage: isBattleOrRiddlePage(),
      settings,
      state: Object.assign({}, state, {
        nextDueAt: state.lastRunAt ? state.lastRunAt + intervalMs : Date.now()
      }),
      lock: getLockDebugInfo(state.lock),
      userAgent: navigator.userAgent,
      logs
    };
    return JSON.stringify(report, null, 2);
  }

  async function copyDebugReport() {
    const text = buildDebugReport();
    try {
      await copyText(text);
      log("info", "Debug report copied");
      setStatus("调试信息已复制。");
    } catch (error) {
      recordError("Failed to copy debug report", error);
      console.log(text);
      setStatus("复制失败，已输出到控制台。", "error");
    }
    return text;
  }

  async function copyText(text) {
    if (typeof GM_setClipboard === "function") {
      GM_setClipboard(text, "text");
      return true;
    }
    if (typeof GM !== "undefined" && GM && typeof GM.setClipboard === "function") {
      await GM.setClipboard(text, "text");
      return true;
    }
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(text);
      return true;
    }
    throw new Error("No clipboard API available");
  }

  function isHvHost() {
    return /(^|\.)hentaiverse\.org$/i.test(location.hostname);
  }

  function isIsekaiPage() {
    return /\/isekai(?:\/|$)/i.test(location.pathname);
  }

  function isMonsterLabPage() {
    const url = new URL(location.href);
    return url.searchParams.get("s") === "Bazaar" && url.searchParams.get("ss") === "ml";
  }

  function isBattleOrRiddlePage() {
    return Boolean(document.querySelector("#battle_main, #battle_top, #textlog, #riddleform, #riddlecounter"));
  }

  function formatTime(timestamp) {
    if (!timestamp) return "";
    return new Date(timestamp).toLocaleString();
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
