// ==UserScript==
// @name         Verter v0.3.1
// @namespace    https://example.com/
// @version      0.3.1
// @description  Trading assistant overlay for Verter v0.3.1 based on PCS-8 v3.1
// @author       Anonymous
// @match        *://*/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    /* PASS:ENTRY */
    if (typeof window === 'undefined') {
        return;
    }

    /* PASS:SETUP */
    const rootWindow = window;
    const rootDocument = rootWindow.document;
    const requestFrame = rootWindow.requestAnimationFrame ? rootWindow.requestAnimationFrame.bind(rootWindow) : (cb) => rootWindow.setTimeout(cb, 16);
    const cancelFrame = rootWindow.cancelAnimationFrame ? rootWindow.cancelAnimationFrame.bind(rootWindow) : rootWindow.clearTimeout.bind(rootWindow);
    const setTimer = rootWindow.setTimeout.bind(rootWindow);
    const clearTimer = rootWindow.clearTimeout.bind(rootWindow);

    function createLogger(context) {
        const prefix = `[${context.NAME} ${context.VERSION}]`;
        return {
            info(message, ...args) {
                safeCall('log', prefix, message, args);
            },
            warn(message, ...args) {
                safeCall('warn', prefix, message, args);
            },
            error(message, ...args) {
                safeCall('error', prefix, message, args);
            }
        };
    }

    function safeCall(level, prefix, message, args) {
        try {
            const fn = console[level] || console.log;
            fn.call(console, `${prefix} ${message}`, ...args);
        } catch (error) {
            /* noop */
        }
    }

    function whenReady(handler) {
        if (rootDocument.readyState === 'loading') {
            rootDocument.addEventListener('DOMContentLoaded', handler, { once: true });
        } else {
            handler();
        }
    }

    /* PASS:CONSTANTS */
    const APP = Object.freeze({
        NAME: 'Verter',
        VERSION: '0.3.1'
    });
    const STORAGE_KEYS = Object.freeze({
        CONFIG: 'verter.cfg.v0.3.1',
        DATA: 'verter.state.v0.3.1'
    });
    const DEFAULT_CONFIG = Object.freeze({
        baseStake: 1,
        payoutPercent: 80,
        autoPauseLosses: 3,
        pauseMinutes: 3,
        manualPauseMinutes: 5,
        gateCooldownSec: 30,
        historyLimit: 120
    });
    const DEFAULT_DATA = Object.freeze({
        history: [],
        activeTrade: null,
        nextId: 1,
        pauseUntil: 0,
        gateUntil: 0,
        lossStreak: 0,
        winStreak: 0
    });
    const RESULT = Object.freeze({
        WIN: 'WIN',
        LOSS: 'LOSS',
        DRAW: 'DRAW'
    });
    const RESULT_TYPES = Object.freeze([RESULT.WIN, RESULT.LOSS, RESULT.DRAW]);
    const DOM_IDS = Object.freeze({
        PANEL: 'verter-panel',
        STYLE: 'verter-panel-style'
    });
    const logger = createLogger(APP);

    /* PASS:STATE */
    const runtime = {
        config: loadConfig(),
        data: loadData(),
        elements: {},
        flash: null,
        flashTimer: null,
        renderPending: false,
        renderHandle: 0,
        tickerHandle: 0
    };

    /* PASS:IO */
    function loadConfig() {
        const stored = readJson(STORAGE_KEYS.CONFIG);
        const config = Object.assign({}, DEFAULT_CONFIG);
        if (stored && typeof stored === 'object') {
            Object.keys(config).forEach((key) => {
                if (!(key in stored)) {
                    return;
                }
                const defaultValue = DEFAULT_CONFIG[key];
                const value = stored[key];
                if (typeof defaultValue === 'number') {
                    const numeric = Number(value);
                    if (Number.isFinite(numeric) && numeric >= 0) {
                        config[key] = numeric;
                    }
                } else if (typeof defaultValue === 'boolean') {
                    config[key] = Boolean(value);
                } else if (typeof defaultValue === 'string') {
                    config[key] = String(value);
                }
            });
        }
        return config;
    }

    function saveConfig() {
        writeJson(STORAGE_KEYS.CONFIG, runtime.config);
    }

    function loadData() {
        const stored = readJson(STORAGE_KEYS.DATA);
        const base = cloneData(DEFAULT_DATA);
        if (!stored || typeof stored !== 'object') {
            return base;
        }

        if (Array.isArray(stored.history)) {
            base.history = stored.history.map(normaliseHistoryItem).filter(Boolean);
        }
        base.activeTrade = normaliseActiveTrade(stored.activeTrade) || null;
        base.nextId = ensurePositiveInt(stored.nextId, base.history.length + 1);
        base.pauseUntil = ensurePositiveNumber(stored.pauseUntil);
        base.gateUntil = ensurePositiveNumber(stored.gateUntil);
        base.lossStreak = ensureNonNegativeInt(stored.lossStreak);
        base.winStreak = ensureNonNegativeInt(stored.winStreak);
        return base;
    }

    function saveData() {
        try {
            const limit = Math.max(5, ensureNonNegativeInt(runtime.config.historyLimit) || DEFAULT_CONFIG.historyLimit);
            if (runtime.data.history.length > limit) {
                runtime.data.history = runtime.data.history.slice(-limit);
            }
            const payload = {
                history: runtime.data.history.map((entry) => Object.assign({}, entry)),
                activeTrade: runtime.data.activeTrade ? Object.assign({}, runtime.data.activeTrade) : null,
                nextId: ensurePositiveInt(runtime.data.nextId, 1),
                pauseUntil: ensurePositiveNumber(runtime.data.pauseUntil),
                gateUntil: ensurePositiveNumber(runtime.data.gateUntil),
                lossStreak: ensureNonNegativeInt(runtime.data.lossStreak),
                winStreak: ensureNonNegativeInt(runtime.data.winStreak)
            };
            writeJson(STORAGE_KEYS.DATA, payload);
        } catch (error) {
            logger.warn('Unable to save data', error);
        }
    }

    function readJson(key) {
        try {
            const raw = rootWindow.localStorage.getItem(key);
            if (!raw) {
                return null;
            }
            return JSON.parse(raw);
        } catch (error) {
            logger.warn('Failed to read storage %s', key, error);
            return null;
        }
    }

    function writeJson(key, value) {
        try {
            rootWindow.localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
            logger.warn('Failed to write storage %s', key, error);
        }
    }

    function cloneData(template) {
        const result = {};
        Object.keys(template).forEach((key) => {
            const value = template[key];
            if (Array.isArray(value)) {
                result[key] = value.slice();
            } else if (value && typeof value === 'object') {
                result[key] = Object.assign({}, value);
            } else {
                result[key] = value;
            }
        });
        return result;
    }

    function normaliseHistoryItem(entry) {
        if (!entry || typeof entry !== 'object') {
            return null;
        }
        const result = typeof entry.result === 'string' ? entry.result.toUpperCase() : '';
        if (!RESULT_TYPES.includes(result)) {
            return null;
        }
        const openedAt = ensurePositiveNumber(entry.openedAt);
        const closedAt = ensurePositiveNumber(entry.closedAt);
        if (!openedAt || !closedAt || closedAt < openedAt) {
            return null;
        }
        const stake = toNumeric(entry.stake, DEFAULT_CONFIG.baseStake);
        const payout = toNumeric(entry.payout, DEFAULT_CONFIG.payoutPercent);
        const profit = toNumeric(entry.profit, calculateProfit(result, stake, payout));
        return {
            id: ensurePositiveInt(entry.id, 1),
            openedAt,
            closedAt,
            stake,
            payout,
            result,
            profit,
            note: typeof entry.note === 'string' ? entry.note : ''
        };
    }

    function normaliseActiveTrade(entry) {
        if (!entry || typeof entry !== 'object') {
            return null;
        }
        const openedAt = ensurePositiveNumber(entry.openedAt);
        if (!openedAt) {
            return null;
        }
        return {
            id: ensurePositiveInt(entry.id, 1),
            openedAt,
            stake: toNumeric(entry.stake, DEFAULT_CONFIG.baseStake),
            payout: toNumeric(entry.payout, DEFAULT_CONFIG.payoutPercent),
            note: typeof entry.note === 'string' ? entry.note : ''
        };
    }

    /* PASS:LOGIC */
    function ensurePositiveNumber(value) {
        const number = Number(value);
        return Number.isFinite(number) && number > 0 ? number : 0;
    }

    function ensureNonNegativeInt(value) {
        const number = Number(value);
        return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
    }

    function ensurePositiveInt(value, fallback) {
        const number = Number(value);
        if (Number.isFinite(number) && number > 0) {
            return Math.floor(number);
        }
        return Math.max(1, Math.floor(fallback || 1));
    }

    function toNumeric(value, fallback) {
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function calculateProfit(resultType, stake, payoutPercent) {
        const safeStake = Number.isFinite(stake) ? stake : 0;
        const safePayout = Number.isFinite(payoutPercent) ? payoutPercent : 0;
        if (resultType === RESULT.WIN) {
            return roundToTwo(safeStake * (safePayout / 100));
        }
        if (resultType === RESULT.LOSS) {
            return roundToTwo(-safeStake);
        }
        return 0;
    }

    function roundToTwo(value) {
        return Math.round(value * 100) / 100;
    }

    function setFlash(message, tone, ttl) {
        const duration = ensurePositiveInt(ttl, 3500);
        runtime.flash = {
            message: String(message || ''),
            tone: tone || 'info',
            expires: Date.now() + duration
        };
        if (runtime.flashTimer) {
            clearTimer(runtime.flashTimer);
        }
        runtime.flashTimer = setTimer(() => {
            if (runtime.flash && runtime.flash.expires <= Date.now()) {
                runtime.flash = null;
                scheduleRender();
            }
        }, duration);
        scheduleRender();
    }

    function startTrade() {
        const now = Date.now();
        if (runtime.data.activeTrade) {
            setFlash('Trade already active', 'warn');
            return;
        }
        if (runtime.data.pauseUntil && runtime.data.pauseUntil > now) {
            setFlash(`Pause active for ${formatDuration(runtime.data.pauseUntil - now)}`, 'warn');
            return;
        }
        if (runtime.data.gateUntil && runtime.data.gateUntil > now) {
            setFlash(`Gate cooldown ${formatDuration(runtime.data.gateUntil - now)}`, 'warn');
            return;
        }

        runtime.data.activeTrade = {
            id: runtime.data.nextId++,
            openedAt: now,
            stake: runtime.config.baseStake,
            payout: runtime.config.payoutPercent,
            note: ''
        };
        saveData();
        setFlash('Trade started', 'info');
        scheduleRender();
    }

    function recordResult(resultType) {
        if (!RESULT_TYPES.includes(resultType)) {
            return;
        }
        if (!runtime.data.activeTrade) {
            setFlash('No active trade', 'warn');
            return;
        }
        const now = Date.now();
        const trade = Object.assign({}, runtime.data.activeTrade, {
            closedAt: now,
            result: resultType
        });
        trade.profit = calculateProfit(resultType, trade.stake, trade.payout);
        runtime.data.history.push(trade);
        runtime.data.activeTrade = null;
        runtime.data.gateUntil = now + runtime.config.gateCooldownSec * 1000;

        if (resultType === RESULT.WIN) {
            runtime.data.winStreak += 1;
            runtime.data.lossStreak = 0;
        } else if (resultType === RESULT.LOSS) {
            runtime.data.lossStreak += 1;
            runtime.data.winStreak = 0;
            if (runtime.data.lossStreak >= runtime.config.autoPauseLosses) {
                runtime.data.pauseUntil = now + runtime.config.pauseMinutes * 60 * 1000;
                runtime.data.lossStreak = 0;
            }
        } else {
            runtime.data.winStreak = 0;
        }

        saveData();
        setFlash(`Recorded ${resultType.toLowerCase()}`, resultType === RESULT.WIN ? 'success' : resultType === RESULT.LOSS ? 'warn' : 'info');
        scheduleRender();
    }

    function resetStats() {
        runtime.data.history = [];
        runtime.data.activeTrade = null;
        runtime.data.nextId = 1;
        runtime.data.pauseUntil = 0;
        runtime.data.gateUntil = 0;
        runtime.data.lossStreak = 0;
        runtime.data.winStreak = 0;
        saveData();
        setFlash('Statistics reset', 'info');
        scheduleRender();
    }

    function triggerManualPause() {
        const minutes = Math.max(1, toNumeric(runtime.config.manualPauseMinutes, DEFAULT_CONFIG.manualPauseMinutes));
        runtime.data.pauseUntil = Date.now() + minutes * 60 * 1000;
        runtime.data.lossStreak = 0;
        saveData();
        setFlash(`Manual pause for ${formatDuration(minutes * 60 * 1000)}`, 'info');
        scheduleRender();
    }

    function clearPause() {
        runtime.data.pauseUntil = 0;
        saveData();
        setFlash('Pause cleared', 'info');
        scheduleRender();
    }

    function updateConfigField(field, rawValue) {
        if (!(field in DEFAULT_CONFIG)) {
            return;
        }
        const defaultValue = DEFAULT_CONFIG[field];
        let nextValue;
        if (typeof defaultValue === 'number') {
            nextValue = Number(rawValue);
            if (!Number.isFinite(nextValue) || nextValue < 0) {
                nextValue = defaultValue;
            }
        } else if (typeof defaultValue === 'boolean') {
            nextValue = Boolean(rawValue);
        } else {
            nextValue = String(rawValue || '');
        }
        runtime.config[field] = nextValue;
        saveConfig();
        scheduleRender();
    }

    function calculateSummary() {
        const summary = {
            wins: 0,
            losses: 0,
            draws: 0,
            profit: 0
        };
        runtime.data.history.forEach((trade) => {
            if (trade.result === RESULT.WIN) {
                summary.wins += 1;
            } else if (trade.result === RESULT.LOSS) {
                summary.losses += 1;
            } else if (trade.result === RESULT.DRAW) {
                summary.draws += 1;
            }
            summary.profit += Number(trade.profit) || 0;
        });
        summary.trades = summary.wins + summary.losses + summary.draws;
        summary.winRate = summary.trades ? (summary.wins / summary.trades) * 100 : 0;
        summary.last = runtime.data.history[runtime.data.history.length - 1] || null;
        summary.active = runtime.data.activeTrade;
        return summary;
    }

    function formatDuration(durationMs) {
        const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        if (minutes > 0) {
            return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
        }
        return `${seconds}s`;
    }

    function formatMoney(value) {
        const number = Number(value);
        if (!Number.isFinite(number)) {
            return '0.00';
        }
        return number.toFixed(2);
    }

    function formatClock(timestamp) {
        if (!timestamp) {
            return '—';
        }
        const date = new Date(timestamp);
        if (Number.isNaN(date.getTime())) {
            return '—';
        }
        return [
            String(date.getHours()).padStart(2, '0'),
            String(date.getMinutes()).padStart(2, '0'),
            String(date.getSeconds()).padStart(2, '0')
        ].join(':');
    }

    function isPauseActive(now) {
        return runtime.data.pauseUntil && runtime.data.pauseUntil > now;
    }

    function isGateLocked(now) {
        return runtime.data.gateUntil && runtime.data.gateUntil > now;
    }

    function toggleCollapse() {
        if (!runtime.elements.root) {
            return;
        }
        const state = runtime.elements.root.getAttribute('data-state');
        const next = state === 'collapsed' ? 'expanded' : 'collapsed';
        runtime.elements.root.setAttribute('data-state', next);
    }

    function scheduleRender() {
        if (runtime.renderPending) {
            return;
        }
        runtime.renderPending = true;
        runtime.renderHandle = requestFrame(() => {
            runtime.renderPending = false;
            runtime.renderHandle = 0;
            render();
        });
    }

    function render() {
        if (!runtime.elements.root) {
            return;
        }
        const now = Date.now();
        const summary = calculateSummary();

        runtime.elements.version.textContent = APP.VERSION;
        runtime.elements.winRate.textContent = `${summary.winRate.toFixed(1)}%`;
        runtime.elements.profit.textContent = formatMoney(summary.profit);
        runtime.elements.tradeTotal.textContent = String(summary.trades);
        runtime.elements.tradeWins.textContent = String(summary.wins);
        runtime.elements.tradeLosses.textContent = String(summary.losses);
        runtime.elements.tradeDraws.textContent = String(summary.draws);

        if (summary.active) {
            runtime.elements.activeTrade.textContent = `#${summary.active.id} • ${formatMoney(summary.active.stake)}`;
        } else {
            runtime.elements.activeTrade.textContent = 'None';
        }

        if (isGateLocked(now)) {
            runtime.elements.gateStatus.textContent = `LOCKED ${formatDuration(runtime.data.gateUntil - now)}`;
            runtime.elements.gateStatus.dataset.state = 'locked';
        } else {
            runtime.elements.gateStatus.textContent = 'READY';
            runtime.elements.gateStatus.dataset.state = 'ready';
        }

        if (isPauseActive(now)) {
            runtime.elements.pauseStatus.textContent = `PAUSE ${formatDuration(runtime.data.pauseUntil - now)}`;
            runtime.elements.pauseStatus.dataset.state = 'paused';
        } else {
            runtime.elements.pauseStatus.textContent = 'IDLE';
            runtime.elements.pauseStatus.dataset.state = 'idle';
        }

        runtime.elements.lossStreak.textContent = String(runtime.data.lossStreak);
        runtime.elements.winStreak.textContent = String(runtime.data.winStreak);

        runtime.elements.startBtn.disabled = Boolean(summary.active) || isPauseActive(now) || isGateLocked(now);
        runtime.elements.winBtn.disabled = !summary.active;
        runtime.elements.lossBtn.disabled = !summary.active;
        runtime.elements.drawBtn.disabled = !summary.active;

        runtime.elements.history.innerHTML = '';
        const recent = runtime.data.history.slice(-8).reverse();
        if (recent.length === 0) {
            const empty = rootDocument.createElement('li');
            empty.className = 'verter-panel__history-item verter-panel__history-item--empty';
            empty.textContent = 'No trades yet';
            runtime.elements.history.appendChild(empty);
        } else {
            recent.forEach((trade) => {
                const item = rootDocument.createElement('li');
                item.className = `verter-panel__history-item verter-result-${trade.result.toLowerCase()}`;
                item.textContent = `#${trade.id} ${trade.result} ${formatMoney(trade.profit)} @ ${formatClock(trade.closedAt)}`;
                runtime.elements.history.appendChild(item);
            });
        }

        Object.keys(runtime.elements.configInputs).forEach((field) => {
            const input = runtime.elements.configInputs[field];
            if (rootDocument.activeElement === input) {
                return;
            }
            input.value = runtime.config[field];
        });

        if (runtime.flash && runtime.flash.message) {
            runtime.elements.flash.textContent = runtime.flash.message;
            runtime.elements.flash.setAttribute('data-tone', runtime.flash.tone || 'info');
            runtime.elements.flash.style.display = '';
        } else {
            runtime.elements.flash.textContent = '';
            runtime.elements.flash.setAttribute('data-tone', 'info');
            runtime.elements.flash.style.display = 'none';
        }
    }

    /* PASS:RENDER */
    function createOverlay() {
        if (runtime.elements.root) {
            return;
        }
        if (!rootDocument.body) {
            logger.warn('Document body not ready');
            return;
        }
        injectStyles();
        const root = rootDocument.createElement('div');
        root.id = DOM_IDS.PANEL;
        root.className = 'verter-panel';
        root.setAttribute('data-state', 'expanded');
        root.innerHTML = [
            '<header class="verter-panel__header">',
            '  <span class="verter-panel__title">Verter <span data-field="version"></span></span>',
            '  <button type="button" class="verter-panel__toggle" data-action="toggle" aria-label="Toggle panel">⤢</button>',
            '</header>',
            '<section class="verter-panel__flash" data-field="flash"></section>',
            '<section class="verter-panel__section">',
            '  <div class="verter-panel__row"><span class="verter-panel__label">Active trade</span><span data-field="activeTrade"></span></div>',
            '  <div class="verter-panel__row"><span class="verter-panel__label">Gate</span><span data-field="gateStatus" data-state="ready"></span></div>',
            '  <div class="verter-panel__row"><span class="verter-panel__label">Pause</span><span data-field="pauseStatus" data-state="idle"></span></div>',
            '  <div class="verter-panel__row"><span class="verter-panel__label">Loss streak</span><span data-field="lossStreak"></span></div>',
            '  <div class="verter-panel__row"><span class="verter-panel__label">Win streak</span><span data-field="winStreak"></span></div>',
            '</section>',
            '<section class="verter-panel__section verter-panel__section--grid">',
            '  <label class="verter-panel__input"><span>Stake</span><input type="number" step="0.01" min="0" data-config="baseStake"></label>',
            '  <label class="verter-panel__input"><span>Payout %</span><input type="number" step="1" min="0" max="500" data-config="payoutPercent"></label>',
            '  <label class="verter-panel__input"><span>Gate (s)</span><input type="number" step="1" min="0" data-config="gateCooldownSec"></label>',
            '  <label class="verter-panel__input"><span>Auto pause losses</span><input type="number" step="1" min="0" data-config="autoPauseLosses"></label>',
            '  <label class="verter-panel__input"><span>Pause (min)</span><input type="number" step="1" min="1" data-config="pauseMinutes"></label>',
            '  <label class="verter-panel__input"><span>Manual pause (min)</span><input type="number" step="1" min="1" data-config="manualPauseMinutes"></label>',
            '</section>',
            '<section class="verter-panel__section verter-panel__section--actions">',
            '  <button type="button" data-action="start">Start trade</button>',
            '  <button type="button" data-action="win">Win</button>',
            '  <button type="button" data-action="loss">Loss</button>',
            '  <button type="button" data-action="draw">Draw</button>',
            '  <button type="button" data-action="manual-pause">Manual pause</button>',
            '  <button type="button" data-action="clear-pause">Clear pause</button>',
            '  <button type="button" data-action="reset">Reset stats</button>',
            '</section>',
            '<section class="verter-panel__section verter-panel__section--summary">',
            '  <div class="verter-panel__summary-item"><span class="verter-panel__summary-label">Trades</span><span data-field="tradeTotal"></span></div>',
            '  <div class="verter-panel__summary-item"><span class="verter-panel__summary-label">Wins</span><span data-field="tradeWins"></span></div>',
            '  <div class="verter-panel__summary-item"><span class="verter-panel__summary-label">Losses</span><span data-field="tradeLosses"></span></div>',
            '  <div class="verter-panel__summary-item"><span class="verter-panel__summary-label">Draws</span><span data-field="tradeDraws"></span></div>',
            '  <div class="verter-panel__summary-item"><span class="verter-panel__summary-label">Win rate</span><span data-field="winRate"></span></div>',
            '  <div class="verter-panel__summary-item"><span class="verter-panel__summary-label">Profit</span><span data-field="profit"></span></div>',
            '</section>',
            '<section class="verter-panel__section verter-panel__section--history">',
            '  <header class="verter-panel__subheader">Recent trades</header>',
            '  <ul class="verter-panel__history" data-field="history"></ul>',
            '</section>'
        ].join('');
        rootDocument.body.appendChild(root);

        const elements = {
            root,
            version: root.querySelector('[data-field="version"]'),
            flash: root.querySelector('[data-field="flash"]'),
            activeTrade: root.querySelector('[data-field="activeTrade"]'),
            gateStatus: root.querySelector('[data-field="gateStatus"]'),
            pauseStatus: root.querySelector('[data-field="pauseStatus"]'),
            lossStreak: root.querySelector('[data-field="lossStreak"]'),
            winStreak: root.querySelector('[data-field="winStreak"]'),
            startBtn: root.querySelector('[data-action="start"]'),
            winBtn: root.querySelector('[data-action="win"]'),
            lossBtn: root.querySelector('[data-action="loss"]'),
            drawBtn: root.querySelector('[data-action="draw"]'),
            manualPauseBtn: root.querySelector('[data-action="manual-pause"]'),
            clearPauseBtn: root.querySelector('[data-action="clear-pause"]'),
            resetBtn: root.querySelector('[data-action="reset"]'),
            toggleBtn: root.querySelector('[data-action="toggle"]'),
            tradeTotal: root.querySelector('[data-field="tradeTotal"]'),
            tradeWins: root.querySelector('[data-field="tradeWins"]'),
            tradeLosses: root.querySelector('[data-field="tradeLosses"]'),
            tradeDraws: root.querySelector('[data-field="tradeDraws"]'),
            winRate: root.querySelector('[data-field="winRate"]'),
            profit: root.querySelector('[data-field="profit"]'),
            history: root.querySelector('[data-field="history"]'),
            configInputs: {}
        };
        root.querySelectorAll('[data-config]').forEach((input) => {
            const field = input.getAttribute('data-config');
            elements.configInputs[field] = input;
        });
        runtime.elements = elements;

        bindEvents();
        scheduleRender();
    }

    function bindEvents() {
        const {
            root,
            startBtn,
            winBtn,
            lossBtn,
            drawBtn,
            resetBtn,
            manualPauseBtn,
            clearPauseBtn,
            toggleBtn,
            configInputs
        } = runtime.elements;
        if (!root) {
            return;
        }
        startBtn.addEventListener('click', () => startTrade());
        winBtn.addEventListener('click', () => recordResult(RESULT.WIN));
        lossBtn.addEventListener('click', () => recordResult(RESULT.LOSS));
        drawBtn.addEventListener('click', () => recordResult(RESULT.DRAW));
        resetBtn.addEventListener('click', () => resetStats());
        manualPauseBtn.addEventListener('click', () => triggerManualPause());
        clearPauseBtn.addEventListener('click', () => clearPause());
        toggleBtn.addEventListener('click', () => toggleCollapse());
        Object.keys(configInputs).forEach((field) => {
            const input = configInputs[field];
            const handler = (event) => updateConfigField(field, event.target.value);
            input.addEventListener('change', handler);
            input.addEventListener('blur', handler);
        });
    }

    function injectStyles() {
        if (rootDocument.getElementById(DOM_IDS.STYLE)) {
            return;
        }
        const style = rootDocument.createElement('style');
        style.id = DOM_IDS.STYLE;
        style.type = 'text/css';
        style.textContent = [
            `#${DOM_IDS.PANEL} { position: fixed; right: 20px; bottom: 20px; width: 320px; font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif; color: #f8f9fb; background: rgba(9, 13, 24, 0.95); border-radius: 16px; box-shadow: 0 18px 40px rgba(0, 0, 0, 0.4); z-index: 2147483647; overflow: hidden; backdrop-filter: blur(8px); }`,
            `#${DOM_IDS.PANEL}[data-state="collapsed"] { width: 220px; height: 46px; overflow: hidden; cursor: pointer; }`,
            `#${DOM_IDS.PANEL}[data-state="collapsed"] .verter-panel__section, #${DOM_IDS.PANEL}[data-state="collapsed"] .verter-panel__flash { display: none !important; }`,
            `.verter-panel__header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: rgba(255, 255, 255, 0.05); font-weight: 600; letter-spacing: 0.02em; }`,
            `.verter-panel__title { font-size: 14px; }`,
            `.verter-panel__toggle { background: none; border: none; color: inherit; font-size: 16px; cursor: pointer; padding: 4px 8px; border-radius: 6px; transition: background 120ms ease; }`,
            `.verter-panel__toggle:hover { background: rgba(255, 255, 255, 0.12); }`,
            `.verter-panel__flash { display: none; padding: 8px 16px; font-size: 13px; }`,
            `.verter-panel__flash[data-tone="warn"] { background: rgba(255, 193, 7, 0.12); color: #ffd770; }`,
            `.verter-panel__flash[data-tone="success"] { background: rgba(40, 167, 69, 0.15); color: #8ff7b0; }`,
            `.verter-panel__flash[data-tone="info"] { background: rgba(0, 123, 255, 0.12); color: #99caff; }`,
            `.verter-panel__section { padding: 12px 16px; border-top: 1px solid rgba(255, 255, 255, 0.06); }`,
            `.verter-panel__section--grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 12px; }`,
            `.verter-panel__section--actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }`,
            `.verter-panel__section--summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 12px; }`,
            `.verter-panel__section--history { padding-bottom: 16px; }`,
            `.verter-panel__subheader { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; opacity: 0.8; }`,
            `.verter-panel__row { display: flex; justify-content: space-between; align-items: center; font-size: 13px; padding: 2px 0; }`,
            `.verter-panel__label { opacity: 0.7; }`,
            `.verter-panel__input { display: flex; flex-direction: column; font-size: 12px; gap: 4px; }`,
            `.verter-panel__input input { background: rgba(255, 255, 255, 0.1); border: none; border-radius: 6px; padding: 6px 8px; color: inherit; font-size: 13px; outline: none; transition: background 120ms ease; }`,
            `.verter-panel__input input:focus { background: rgba(255, 255, 255, 0.18); }`,
            `.verter-panel__section--actions button { background: rgba(255, 255, 255, 0.1); border: none; border-radius: 8px; padding: 8px 10px; color: inherit; font-size: 13px; cursor: pointer; transition: background 120ms ease, transform 120ms ease; }`,
            `.verter-panel__section--actions button:hover:not(:disabled) { background: rgba(255, 255, 255, 0.18); transform: translateY(-1px); }`,
            `.verter-panel__section--actions button:disabled { opacity: 0.4; cursor: not-allowed; }`,
            `.verter-panel__summary-item { display: flex; justify-content: space-between; font-size: 13px; }`,
            `.verter-panel__summary-label { opacity: 0.75; }`,
            `.verter-panel__history { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; font-size: 12px; max-height: 140px; overflow-y: auto; }`,
            `.verter-panel__history-item { padding: 6px 8px; border-radius: 6px; background: rgba(255, 255, 255, 0.08); display: flex; justify-content: space-between; }`,
            `.verter-panel__history-item--empty { justify-content: center; opacity: 0.6; }`,
            `.verter-result-win { color: #8ff7b0; }`,
            `.verter-result-loss { color: #ff9f9f; }`,
            `.verter-result-draw { color: #f8f9fb; opacity: 0.8; }`,
            `.verter-panel__history::-webkit-scrollbar { width: 6px; }`,
            `.verter-panel__history::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.18); border-radius: 6px; }`,
            `@media (max-width: 720px) { #${DOM_IDS.PANEL} { width: calc(100% - 32px); right: 16px; left: 16px; bottom: 16px; } }`
        ].join('');
        rootDocument.head.appendChild(style);
    }

    /* PASS:BOOTSTRAP */
    whenReady(() => {
        createOverlay();
        runtime.tickerHandle = rootWindow.setInterval(() => {
            if (runtime.elements.root) {
                scheduleRender();
            }
        }, 1000);
        rootWindow.addEventListener('beforeunload', () => {
            if (runtime.renderHandle) {
                cancelFrame(runtime.renderHandle);
            }
            if (runtime.tickerHandle) {
                rootWindow.clearInterval(runtime.tickerHandle);
            }
            if (runtime.flashTimer) {
                clearTimer(runtime.flashTimer);
            }
        });
        logger.info('Boot complete');
        scheduleRender();
    });
})();
