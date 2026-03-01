// ===========================================================
//  InstaGhost — Smart Instagram Follower Removal Extension
//  Version : 1.0.0
//  Author  : For personal use only
//  Features: Multi-file JSON upload, Smart targeting, Safe list,
//             Pause/Resume/Stop, Custom scroll selector, Live logs,
//             Config panel with sliders, Dark modern UI
// ===========================================================

(function () {
    'use strict';

    // Configuration
    const DEFAULT_CONFIG = {
        DELAY_BETWEEN_REMOVALS: 2000,
        DELAY_AFTER_CONFIRMATION: 5000,
        MAX_RETRIES: 3,
        SCROLL_INTERVAL: 3000,
        SCROLL_INCREMENT: 800,
        MAX_FOLLOWERS: 1000,
        ADVANCE_SCROLLS: 0,
        AUTO_START: false
    };

    let CONFIG = { ...DEFAULT_CONFIG };

    // State tracking
    let state = {
        isRunning: false,
        removedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        totalProcessed: 0,
        startTime: null,
        currentUsername: '',
        isPaused: false,
        targetList: new Set(),
        safeList: new Set(),
        finalRemoveList: new Set(),
        processedSessionUsers: new Set(),
        customScrollContainer: null // Stores the user-selected container
    };

    // DOM Elements
    let uiContainer, logContainer, progressBar, statusText, statsContainer;
    let startBtn, stopBtn, pauseBtn, configBtn, targetBtn, testScrollBtn, selectScrollBtn;

    // --- UTILS ---
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    function addLog(message, type = 'info') {
        const time = new Date().toLocaleTimeString();
        const el = document.createElement('div');
        el.className = `log-entry log-${type}`;
        el.innerHTML = `<span class="log-time">[${time}]</span> <span class="log-message">${message}</span>`;
        if (logContainer) {
            logContainer.appendChild(el);
            logContainer.scrollTop = logContainer.scrollHeight;
        }
        console.log(`[${type.toUpperCase()}] ${message}`);
    }

    // --- SCROLL LOGIC ---
    function getScrollContainer() {
        if (state.customScrollContainer && state.customScrollContainer.isConnected) {
            return state.customScrollContainer;
        }
        const dialog = document.querySelector('div[role="dialog"]');
        if (dialog) {
            const divs = Array.from(dialog.querySelectorAll('div'));
            const scrollableDivs = divs.filter(d => {
                const style = window.getComputedStyle(d);
                return (style.overflowY === 'auto' || style.overflowY === 'scroll') && d.scrollHeight > d.clientHeight;
            });

            if (scrollableDivs.length > 0) {
                return scrollableDivs.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
            }
        }
        return null;
    }

    async function performScroll() {
        const container = getScrollContainer();
        if (!container) {
            addLog("❌ Error: No scrollable list found. Use '👆 Select List' button!", "error");
            return false;
        }

        const prevScroll = container.scrollTop;
        const prevHeight = container.scrollHeight;

        container.scrollTop += CONFIG.SCROLL_INCREMENT;
        container.dispatchEvent(new Event('scroll', { bubbles: true }));

        await sleep(1000);

        const moved = container.scrollTop !== prevScroll;
        const expanded = container.scrollHeight > prevHeight;

        return moved || expanded;
    }

    // --- INTERACTIVE SELECTOR ---
    function enableSelectorMode() {
        addLog("👆 Hover over the list and click to select it.", "warning");
        uiContainer.style.opacity = "0.8";

        const highlighter = document.createElement('div');
        highlighter.style.position = 'fixed';
        highlighter.style.border = '4px solid #FF0000';
        highlighter.style.zIndex = '9999999';
        highlighter.style.pointerEvents = 'none';
        highlighter.style.transition = 'all 0.1s';
        document.body.appendChild(highlighter);

        function moveHandler(e) {
            const target = e.target;
            const rect = target.getBoundingClientRect();
            highlighter.style.top = rect.top + 'px';
            highlighter.style.left = rect.left + 'px';
            highlighter.style.width = rect.width + 'px';
            highlighter.style.height = rect.height + 'px';
        }

        function clickHandler(e) {
            e.preventDefault();
            e.stopPropagation();

            const target = e.target;
            state.customScrollContainer = target;

            addLog(`✅ Container Selected! Class: ${target.className.substring(0, 20)}...`, "success");

            document.removeEventListener('mousemove', moveHandler, true);
            document.removeEventListener('click', clickHandler, true);
            highlighter.remove();
            uiContainer.style.opacity = "1";

            target.style.border = "2px solid #4CAF50";
            setTimeout(() => target.style.border = "", 1000);
        }

        document.addEventListener('mousemove', moveHandler, true);
        document.addEventListener('click', clickHandler, true);
    }

    // --- CORE FUNCTIONS ---
    function findRemoveButtons() {
        return Array.from(document.querySelectorAll('div[role="button"]'))
            .filter(b => b.textContent === 'Remove' && !b.closest('._a9-z'));
    }

    function getFollowerUsername(btn) {
        const parent = btn.closest('div.x1qnrgzn') || btn.closest('div[role="button"]')?.parentElement?.parentElement;
        if (!parent) return 'Unknown';
        const els = parent.querySelectorAll('span._ap3a, a[href*="/"]');
        for (const el of els) {
            const txt = el.textContent.trim();
            if (txt && !txt.includes('·') && txt !== 'Follow') return txt;
        }
        return 'Unknown';
    }

    // --- JSON PARSING ---
    function cleanJSON(str) {
        if (!str) return "";
        let cleaned = str.trim();
        const firstBracket = cleaned.search(/[[{]/);
        if (firstBracket !== -1) {
            const isArray = cleaned[firstBracket] === '[';
            const lastIndex = cleaned.lastIndexOf(isArray ? ']' : '}');
            if (lastIndex !== -1) cleaned = cleaned.substring(firstBracket, lastIndex + 1);
        }
        cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');
        return cleaned;
    }

    function parseInstagramJSON(jsonString, type) {
        try {
            const cleanStr = cleanJSON(jsonString);
            if (!cleanStr) return new Set();
            let data;
            try {
                data = JSON.parse(cleanStr);
            } catch (e) {
                const fixed = cleanStr.replace(/([{,]\s*)([a-zA-Z0-9_]+?)\s*:/g, '$1"$2":').replace(/'/g, '"');
                data = JSON.parse(fixed);
            }
            if (data.relationships_following) data = data.relationships_following;
            if (!Array.isArray(data)) {
                if (typeof data === 'object') {
                    const values = Object.values(data);
                    const foundArray = values.find(v => Array.isArray(v));
                    if (foundArray) data = foundArray;
                }
            }
            if (!Array.isArray(data)) return new Set();
            const usernames = new Set();
            data.forEach(item => {
                let u = null;
                if (item.string_list_data && item.string_list_data[0] && item.string_list_data[0].value) u = item.string_list_data[0].value;
                else if (item.title) u = item.title;
                if (u) usernames.add(u.toLowerCase().trim());
            });
            return usernames;
        } catch (e) {
            console.error(`Error parsing ${type} JSON: ${e.message}`);
            return new Set();
        }
    }

    // --- MAIN LOOP ---
    async function processFollowers() {
        if (state.isRunning && !state.isPaused) return;
        if (state.targetList.size === 0) {
            if (!confirm("⚠️ NO TARGET LIST LOADED!\n\nThis means the bot will remove EVERYONE visible in the list.\nAre you absolutely sure you want to continue?")) return;
        }
        state.isRunning = true;
        state.isPaused = false;
        state.startTime = Date.now();
        if (state.totalProcessed === 0) state.processedSessionUsers = new Set();
        updateUI();
        addLog('🚀 Starting process...', 'success');

        try {
            let consecutiveNoNewFollowers = 0;

            if (CONFIG.ADVANCE_SCROLLS > 0) {
                addLog(`Advance scrolling ${CONFIG.ADVANCE_SCROLLS} times to preload users...`, 'info');
                for (let i = 0; i < CONFIG.ADVANCE_SCROLLS; i++) {
                    if (!state.isRunning) break;
                    while (state.isPaused && state.isRunning) await sleep(1000);
                    await performScroll();
                    await sleep(1500); // Fixed delay between preload scrolls
                }
                addLog(`Finished advance scrolling. Starting removal...`, 'success');
            }

            while (state.isRunning && state.removedCount < (state.finalRemoveList.size || CONFIG.MAX_FOLLOWERS)) {
                while (state.isPaused && state.isRunning) await sleep(1000);
                if (!state.isRunning) break;

                const buttons = findRemoveButtons();
                const freshButtons = buttons.filter(btn => {
                    const u = getFollowerUsername(btn);
                    return !state.processedSessionUsers.has(u);
                });

                if (freshButtons.length === 0) {
                    addLog('No visible targets. Scrolling...', 'info');
                    const scrolled = await performScroll();
                    if (!scrolled) {
                        consecutiveNoNewFollowers++;
                        if (consecutiveNoNewFollowers >= 10) {
                            addLog('❌ Could not scroll/load more. Stopping.', 'error');
                            break;
                        }
                    } else {
                        consecutiveNoNewFollowers = 0;
                        await sleep(CONFIG.SCROLL_INTERVAL);
                    }
                    continue;
                }

                for (const button of freshButtons) {
                    if (!state.isRunning) break;
                    while (state.isPaused && state.isRunning) await sleep(1000);

                    const username = getFollowerUsername(button);
                    state.currentUsername = username;
                    state.processedSessionUsers.add(username);

                    let shouldRemove = false;
                    const cleanUser = username.toLowerCase();
                    if (state.targetList.size > 0) {
                        const isTarget = state.targetList.has(cleanUser);
                        const isSafe = state.safeList.has(cleanUser);
                        if (isTarget && !isSafe) shouldRemove = true;
                        else if (isTarget && isSafe) {
                            addLog(`🛡️ SAFE: ${username}`, 'warning');
                            state.skippedCount++;
                        }
                    } else shouldRemove = true;

                    if (shouldRemove) {
                        addLog(`Removing: ${username}`, 'info');
                        try {
                            button.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            button.click();
                            await sleep(1000);
                            const dialog = document.querySelector('._a9-v');
                            if (dialog) {
                                const confirmBtn = Array.from(dialog.querySelectorAll('button'))
                                    .find(b => b.textContent === 'Remove' || b.classList.contains('_a9-_'));
                                if (confirmBtn) {
                                    confirmBtn.click();
                                    await sleep(CONFIG.DELAY_AFTER_CONFIRMATION);
                                    state.removedCount++;
                                    addLog(`✓ Removed ${username}`, 'success');
                                }
                            }
                        } catch (e) {
                            addLog(`Error removing ${username}`, 'error');
                            state.failedCount++;
                        }
                    }
                    updateUI();
                }
                await performScroll();
                await sleep(1000);
            }
        } catch (error) {
            addLog(`Fatal Error: ${error.message}`, 'error');
        } finally {
            state.isRunning = false;
            updateUI();
            addLog('🏁 Process Stopped', 'info');
        }
    }

    // --- ENHANCED UI ---
    function createUI() {
        const old = document.getElementById('insta-remover-ui');
        if (old) old.remove();

        uiContainer = document.createElement('div');
        uiContainer.id = 'insta-remover-ui';
        uiContainer.innerHTML = `
            <style>
                #insta-remover-ui { 
                    position: fixed; top: 20px; right: 20px; width: 380px; 
                    background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(10px);
                    border-radius: 16px; box-shadow: 0 15px 50px rgba(0,0,0,0.5); 
                    z-index: 999999; font-family: 'Inter', system-ui, sans-serif; 
                    border: 1px solid rgba(255,255,255,0.1); overflow: hidden; color: #f8fafc;
                }
                .ui-head { 
                    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #d946ef 100%);
                    color: white; padding: 18px 20px; display: flex; justify-content: space-between; 
                    align-items: center; cursor: move; font-size: 16px; font-weight: 700;
                    letter-spacing: 0.5px;
                }
                .ui-body { padding: 22px; }
                .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 22px; }
                .stat { 
                    background: rgba(255,255,255,0.05); padding: 12px 6px; text-align: center; 
                    border-radius: 10px; border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                }
                .stat-value { font-weight: 800; color: #38bdf8; font-size: 18px; }
                .stat-label { font-size: 10px; color: #94a3b8; text-transform: uppercase; margin-top: 5px; font-weight: 600; }
                .status { text-align: center; margin: 10px 0 22px 0; font-size: 14px; font-weight: 600; color: #e2e8f0; }
                .btns { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 22px; }
                .btn { 
                    border: none; padding: 12px; border-radius: 8px; color: white; 
                    font-weight: 600; cursor: pointer; transition: all 0.2s; font-size: 13px;
                }
                .btn:hover:not(:disabled) { filter: brightness(1.1); transform: translateY(-1px); }
                .btn:active:not(:disabled) { transform: translateY(1px); }
                .btn:disabled { opacity: 0.5; cursor: not-allowed; }
                .btn-go { background: #10B981; } 
                .btn-stop { background: #EF4444; } 
                .btn-pause { background: #F59E0B; }
                .btn-data { background: #6366F1; grid-column: span 3; padding: 14px; font-size: 14px; }
                .btn-test { background: #8B5CF6; font-size: 12px; } 
                .btn-sel { background: #3B82F6; font-size: 12px; grid-column: span 2; }
                .btn-config { background: #eab308; color: #020617; grid-column: span 3; padding: 14px; font-size: 14px; }
                .logs { 
                    height: 160px; overflow-y: auto; background: rgba(0,0,0,0.3); border-radius: 10px; 
                    padding: 12px; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #cbd5e1; 
                    border: 1px solid rgba(255,255,255,0.05);
                }
                .log-entry { margin-bottom: 5px; line-height: 1.5; padding-bottom: 5px; border-bottom: 1px solid rgba(255,255,255,0.05); }
                .log-time { color: #64748b; margin-right: 6px; }
                .log-success { color: #4ade80; } .log-error { color: #f87171; } .log-warning { color: #fbbf24; }
                .log-info { color: #38bdf8; }
                /* Custom Scrollbar */
                .logs::-webkit-scrollbar { width: 6px; }
                .logs::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); border-radius: 4px; }
                .logs::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 4px; }
            </style>
            <div class="ui-head"><span>👻 Ghost Unfollower</span><span>⎌</span></div>
            <div class="ui-body">
                <div class="stats" id="stats"></div>
                <div class="status" id="status">⏹️ Ready</div>
                <div class="btns">
                    <button class="btn btn-go" id="btn-go">▶ Start</button>
                    <button class="btn btn-stop" id="btn-stop" disabled>⏹ Stop</button>
                    <button class="btn btn-pause" id="btn-pause" disabled>⏸ Pause</button>
                    <button class="btn btn-data" id="btn-data">📂 Upload JSON Data</button>
                    <button class="btn btn-sel" id="btn-sel">👆 Select Container</button>
                    <button class="btn btn-test" id="btn-test">⬇️ Test Scroll</button>
                    <button class="btn btn-config" id="btn-config">⚙️ Configuration</button>
                </div>
                <div class="logs" id="logs"></div>
            </div>
        `;
        document.body.appendChild(uiContainer);

        logContainer = document.getElementById('logs');
        statusText = document.getElementById('status');
        statsContainer = document.getElementById('stats');
        startBtn = document.getElementById('btn-go');
        stopBtn = document.getElementById('btn-stop');
        pauseBtn = document.getElementById('btn-pause');
        targetBtn = document.getElementById('btn-data');
        testScrollBtn = document.getElementById('btn-test');
        selectScrollBtn = document.getElementById('btn-sel');
        configBtn = document.getElementById('btn-config');

        startBtn.onclick = processFollowers;
        stopBtn.onclick = () => { state.isRunning = false; updateUI(); };
        pauseBtn.onclick = () => { state.isPaused = !state.isPaused; updateUI(); };
        targetBtn.onclick = showDataModal;
        selectScrollBtn.onclick = enableSelectorMode;
        configBtn.onclick = showConfigModal;

        testScrollBtn.onclick = async () => {
            addLog("🧪 Testing Scroll...", "info");
            const moved = await performScroll();
            if (moved) addLog("✅ Scroll successful!", "success");
            else addLog("⚠️ Container didn't move. Try '👆 Select Container'.", "warning");
        };

        const head = uiContainer.querySelector('.ui-head');
        let isDown = false, offX, offY;
        head.onmousedown = e => { isDown = true; offX = e.clientX - uiContainer.offsetLeft; offY = e.clientY - uiContainer.offsetTop; };
        document.onmousemove = e => { if (isDown) { uiContainer.style.left = (e.clientX - offX) + 'px'; uiContainer.style.top = (e.clientY - offY) + 'px'; } };
        document.onmouseup = () => isDown = false;

        updateUI();
    }

    function updateUI() {
        const remaining = state.finalRemoveList.size > 0
            ? state.finalRemoveList.size - state.removedCount
            : (state.targetList.size > 0 ? 0 : 'ALL');

        if (statsContainer) {
            statsContainer.innerHTML = `
                <div class="stat"><div class="stat-value">${state.removedCount}</div><div class="stat-label">Removed</div></div>
                <div class="stat"><div class="stat-value">${state.skippedCount}</div><div class="stat-label">Skipped</div></div>
                <div class="stat"><div class="stat-value">${remaining}</div><div class="stat-label">Remaining</div></div>
                <div class="stat"><div class="stat-value">${state.isRunning ? (state.isPaused ? '⏸️' : '▶️') : '⏹️'}</div><div class="stat-label">Status</div></div>
            `;
        }

        if (startBtn) startBtn.disabled = state.isRunning && !state.isPaused;
        if (stopBtn) stopBtn.disabled = !state.isRunning;

        if (targetBtn) {
            if (state.finalRemoveList.size > 0) {
                targetBtn.style.background = '#8B5CF6';
                targetBtn.innerHTML = `<span>🎯</span> Data Loaded (${state.finalRemoveList.size} Targets)`;
            } else {
                targetBtn.style.background = '#6366F1';
                targetBtn.innerHTML = `📂 Upload JSON Data`;
            }
        }
    }

    function showConfigModal() {
        const div = document.createElement('div');
        div.innerHTML = `
            <style>
                .modal-bg { position: fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); backdrop-filter: blur(8px); z-index:1000000; display:flex; justify-content:center; align-items:center; font-family: 'Inter', system-ui, sans-serif; }
                .modal { background:#0f172a; color: #f8fafc; padding: 30px; border-radius: 20px; width:480px; max-width:95%; max-height: 90vh; overflow-y: auto; box-shadow: 0 25px 60px rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.1); }
                .modal h3 { margin:0 0 25px 0; color:#e0e7ff; font-size: 22px; display: flex; align-items: center; gap: 10px; }
                .cfg-group { margin-bottom: 25px; background: #1e293b; padding: 15px; border-radius: 12px; border: 1px solid #334155; }
                .cfg-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
                .cfg-label { font-size: 14px; font-weight: 600; color: #cbd5e1; text-transform: capitalize; display: flex; align-items: center; gap: 8px;}
                .cfg-val-input { width: 80px; padding: 6px 10px; border: 1px solid #475569; border-radius: 6px; font-size: 13px; text-align: right; color: #f8fafc; background-color: #0f172a; font-family: monospace;}
                .cfg-slider { width: 100%; cursor: pointer; accent-color: #8b5cf6; }
                .cfg-checkbox { display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 600; color: #cbd5e1; cursor: pointer; margin-top: 15px; margin-bottom: 15px; text-transform: capitalize; background: #1e293b; padding: 15px; border-radius: 12px; border: 1px solid #334155; }
                .cfg-checkbox input { width: 18px; height: 18px; accent-color: #8b5cf6; cursor: pointer; }
                .m-btns { display: flex; justify-content: flex-end; gap: 12px; margin-top: 30px; }
                .m-btn { padding: 12px 24px; border:none; border-radius: 8px; cursor:pointer; font-weight:600; color:white; transition: all 0.2s; font-size: 14px; }
                .btn-cancel { background: #475569; } .btn-cancel:hover { background: #334155; }
                .btn-save { background: #8b5cf6; } .btn-save:hover { background: #7c3aed; }
                .btn-reset { background: #ef4444; } .btn-reset:hover { background: #dc2626; }
            </style>
            <div class="modal-bg">
                <div class="modal">
                    <h3><span style="font-size:24px">⚙️</span> Configuration Panel</h3>
                    
                    <div id="cfg-container"></div>

                    <div class="m-btns">
                        <button class="m-btn btn-reset" id="cfg-reset">↺ Restore Defaults</button>
                        <button class="m-btn btn-cancel" id="cfg-cancel">Cancel</button>
                        <button class="m-btn btn-save" id="cfg-save">✓ Save Settings</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(div);

        const icons = {
            DELAY_BETWEEN_REMOVALS: '⏳',
            DELAY_AFTER_CONFIRMATION: '🕰️',
            MAX_RETRIES: '🔄',
            SCROLL_INTERVAL: '⏱️',
            SCROLL_INCREMENT: '📜',
            MAX_FOLLOWERS: '👥',
            ADVANCE_SCROLLS: '🚀',
            AUTO_START: '▶️'
        };

        const container = div.querySelector('#cfg-container');
        container.innerHTML = Object.keys(DEFAULT_CONFIG).map(key => {
            const icon = icons[key] || '🔹';
            const labelText = key.toLowerCase().replace(/_/g, ' ');

            if (typeof DEFAULT_CONFIG[key] === 'boolean') {
                return `
                    <label class="cfg-checkbox">
                        <input type="checkbox" id="cfg-${key}" ${CONFIG[key] ? 'checked' : ''}>
                        <span>${icon} ${labelText}</span>
                    </label>
                `;
            }

            let max = 10000;
            if (key === 'MAX_RETRIES') max = 10;
            else if (key === 'MAX_FOLLOWERS') max = 5000;
            else if (key === 'SCROLL_INCREMENT') max = 3000;
            else if (key === 'ADVANCE_SCROLLS') max = 100;

            return `
                <div class="cfg-group">
                    <div class="cfg-header">
                        <span class="cfg-label">${icon} ${labelText}</span>
                        <input type="number" id="cfg-val-${key}" class="cfg-val-input" value="${CONFIG[key]}">
                    </div>
                    <input type="range" id="cfg-slider-${key}" class="cfg-slider" min="0" max="${max}" value="${CONFIG[key]}">
                </div>
            `;
        }).join('');

        Object.keys(DEFAULT_CONFIG).forEach(key => {
            if (typeof DEFAULT_CONFIG[key] === 'boolean') {
                const checkbox = div.querySelector('#cfg-' + key);
                if (checkbox) {
                    checkbox.addEventListener('change', (e) => {
                        CONFIG[key] = e.target.checked;
                    });
                }
                return;
            }
            const slider = div.querySelector('#cfg-slider-' + key);
            const input = div.querySelector('#cfg-val-' + key);

            if (slider && input) {
                slider.addEventListener('input', (e) => {
                    input.value = e.target.value;
                });
                input.addEventListener('input', (e) => {
                    slider.value = e.target.value;
                });
            }
        });

        div.querySelector('#cfg-cancel').onclick = () => div.remove();

        div.querySelector('#cfg-reset').onclick = () => {
            Object.keys(DEFAULT_CONFIG).forEach(key => {
                if (typeof DEFAULT_CONFIG[key] === 'boolean') {
                    const checkbox = div.querySelector('#cfg-' + key);
                    if (checkbox) checkbox.checked = DEFAULT_CONFIG[key];
                } else {
                    const slider = div.querySelector('#cfg-slider-' + key);
                    const input = div.querySelector('#cfg-val-' + key);
                    if (slider) slider.value = DEFAULT_CONFIG[key];
                    if (input) input.value = DEFAULT_CONFIG[key];
                }
            });
        };

        div.querySelector('#cfg-save').onclick = () => {
            Object.keys(DEFAULT_CONFIG).forEach(key => {
                if (typeof DEFAULT_CONFIG[key] === 'boolean') {
                    const checkbox = div.querySelector('#cfg-' + key);
                    if (checkbox) CONFIG[key] = checkbox.checked;
                } else {
                    const input = div.querySelector('#cfg-val-' + key);
                    if (input) CONFIG[key] = parseInt(input.value, 10);
                }
            });
            addLog("⚙️ Configuration updated.", "success");
            div.remove();
        };
    }

    function showDataModal() {
        const div = document.createElement('div');
        div.innerHTML = `
            <style>
                .modal-bg { position: fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); backdrop-filter: blur(8px); z-index:1000000; display:flex; justify-content:center; align-items:center; font-family: 'Inter', system-ui, sans-serif; }
                .modal { background:#0f172a; color: #f8fafc; padding: 30px; border-radius: 20px; width:480px; max-width:95%; max-height: 90vh; overflow-y: auto; box-shadow: 0 25px 60px rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.1); }
                .modal h3 { margin:0 0 25px 0; color:#e0e7ff; font-size: 22px; display: flex; align-items: center; gap: 10px; }
                .box { margin-bottom: 25px; background: #1e293b; padding: 20px; border-radius: 12px; border: 1px dashed #475569; }
                .box-label { font-weight: 600; margin-bottom: 14px; color: #cbd5e1; font-size: 14px; display: block; }
                input[type="file"] { display: none; }
                .upload-btn {
                    display: inline-flex; align-items: center; gap: 8px;
                    background: #334155; border: 1px solid #475569; padding: 10px 18px;
                    border-radius: 8px; font-weight: 600; color: #f8fafc; cursor: pointer;
                    font-size: 13px; transition: background 0.2s; user-select: none;
                }
                .upload-btn:hover { background: #475569; }
                .file-list { margin-top: 12px; display: flex; flex-direction: column; gap: 6px; }
                .file-pill {
                    background: #0f172a; border: 1px solid #334155; border-radius: 6px;
                    padding: 6px 12px; font-size: 12px; color: #94a3b8;
                    font-family: monospace; display: flex; align-items: center; gap: 6px;
                }
                .file-pill::before { content: '📄'; font-size: 12px; }
                .no-files { font-size: 12px; color: #475569; margin-top: 10px; font-style: italic; }
                .m-info { font-size: 12px; color: #64748b; margin-top: 10px; line-height: 1.5; }
                .m-btns { display: flex; justify-content: flex-end; gap: 12px; margin-top: 30px; }
                .m-btn { padding: 12px 24px; border:none; border-radius: 8px; cursor:pointer; font-weight:600; color:white; transition: all 0.2s; font-size: 14px; }
                .btn-cancel { background: #475569; } .btn-cancel:hover { background: #334155; }
                .btn-save { background: #8b5cf6; } .btn-save:hover { background: #7c3aed; }
                .btn-save:disabled { background: #5b21b6; color: #cbd5e1; cursor: not-allowed; }
            </style>
            <div class="modal-bg">
                <div class="modal">
                    <h3><span style="font-size:24px">📂</span> Upload Data</h3>
                    
                    <div class="box">
                        <span class="box-label">🎯 1. Target Followers JSON files</span>
                        <input type="file" id="file-targets" multiple accept=".json">
                        <label for="file-targets" class="upload-btn">📁 Choose Files</label>
                        <div class="file-list" id="targets-list"><div class="no-files">No files selected</div></div>
                        <div class="m-info">Select one or multiple JSON files downloaded from Instagram containing your followers data.</div>
                    </div>
                    
                    <div class="box">
                        <span class="box-label">🛡️ 2. Safe List (Following) JSON files</span>
                        <input type="file" id="file-safe" multiple accept=".json">
                        <label for="file-safe" class="upload-btn">📁 Choose Files</label>
                        <div class="file-list" id="safe-list"><div class="no-files">No files selected</div></div>
                        <div class="m-info">Select JSON files containing people you follow. These people will <b>NOT</b> be removed.</div>
                    </div>
                    
                    <div class="m-btns">
                        <button class="m-btn btn-cancel" id="m-cancel">Cancel</button>
                        <button class="m-btn btn-save" id="m-save">✓ Process Uploads</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(div);

        // Show selected file names as pill badges
        function updateFileList(inputId, listId) {
            const input = div.querySelector('#' + inputId);
            const list = div.querySelector('#' + listId);
            input.addEventListener('change', () => {
                if (input.files.length === 0) {
                    list.innerHTML = '<div class="no-files">No files selected</div>';
                } else {
                    list.innerHTML = Array.from(input.files)
                        .map(f => `<div class="file-pill">${f.name}</div>`)
                        .join('');
                }
            });
        }
        updateFileList('file-targets', 'targets-list');
        updateFileList('file-safe', 'safe-list');

        div.querySelector('#m-cancel').onclick = () => div.remove();

        div.querySelector('#m-save').onclick = async () => {
            const mSaveBtn = div.querySelector('#m-save');
            const targetFiles = div.querySelector('#file-targets').files;
            const safeFiles = div.querySelector('#file-safe').files;

            mSaveBtn.textContent = 'Processing...';
            mSaveBtn.disabled = true;

            const readFiles = async (files, listType) => {
                let mergedSet = new Set();
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    try {
                        const text = await file.text();
                        const parsed = parseInstagramJSON(text, listType);
                        parsed.forEach(v => mergedSet.add(v));
                    } catch (err) {
                        console.error("Error reading file", file.name, err);
                    }
                }
                return mergedSet;
            };

            try {
                const tList = await readFiles(targetFiles, 'Followers');
                const sList = await readFiles(safeFiles, 'Following');

                if (tList.size > 0 || Array.from(targetFiles).length > 0) {
                    state.targetList = tList;
                    state.safeList = sList;
                    state.finalRemoveList = new Set([...tList].filter(x => !sList.has(x)));
                    addLog('DATA LOADED SUCCESSFULLY!', 'success');
                    addLog('- Targets Identified: ' + tList.size, 'info');
                    addLog('- Safe(Following): ' + sList.size, 'info');
                    addLog('- Final Removals: ' + state.finalRemoveList.size, 'warning');
                    state.removedCount = 0;
                    updateUI();
                    div.remove();
                } else {
                    alert("Could not find any usernames in the uploaded files. Make sure they are correct Instagram JSON files.");
                    mSaveBtn.textContent = 'Process Uploads';
                    mSaveBtn.disabled = false;
                }
            } catch (err) {
                alert("Error reading files: " + err.message);
                mSaveBtn.textContent = 'Process Uploads';
                mSaveBtn.disabled = false;
            }
        };
    }

    createUI();
    addLog('👻 Ghost Unfollower injected.', 'success');
    addLog('1. Upload JSON Data 📂', 'info');
    addLog('2. Select Container 👆 (Important!)', 'warning');
    addLog('3. Test Scroll ⬇️', 'info');

})();
