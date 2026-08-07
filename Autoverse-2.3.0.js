// ==UserScript==
// @name         Autoverse
// @namespace    https://youtube.com/@Temptastrophe
// @version      2.3.0
// @description  Autoverse, a lightweight autoplayer for pianoverse.net
// @author       Temptastrophe
// @match        *://pianoverse.net/*
// @match        *://pianoverse.net/?r=*//
// @license      Apache-2.0
// @icon         https://avatars.githubusercontent.com/u/314318981?v=4
// @grant        none
// ==/UserScript==

/*
Copyright 2026 Temptastrophe

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://apache.org

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

(function () {
    'use strict';

    const KEYS = '1!2@34$5%6^78*9(0qQwWeErtTyYuiIoOpPasSdDfgGhHjJklLzZxcCvVbBnm'.split('');
    const MIDI_START_DELAY = 120;
    const SHIFT_CHARS = '!@#$%^&*()'.split('');
    const DIGIT_CHARS = '1234567890'.split('');

    const config = {
        release: 35,
        caps: true,
        type: 'down',
        utype: 'up',
        loop: false,
        times: 1,
        times_time: 12,
        shift: true,
        curlbracket_time: 90,
        hotkeys: {
            toggleGui: ['F8'],
            manual: ['='],
            midithrottle: ['🏠'],
            autoplay: ['-'],
            loadmidi: [']'],
            reset: ["'"],
            set: [';'],
            transposeUp: ['.'],
            transposeDown: [','],
            times: ['\\']
        }
    };

    let sheets = '';
    let current = 0;
    let manualMode = false;
    let midiThrottleMode = false;
    let autoplayRunning = false;
    let autoplayTimeout = null;
    let lastBPM = 120;
    let currentDelay = 500;

    let midiQueue = null;
    let midiSteps = null;
    let midiThrottleIndex = 0;
    let midiThrottlePending = false;
    let midiThrottleLastAt = 0;
    let midiAutoIdx = 0;
    let midiStart = 0;

    function beaut(s) {
        if (!s) return '';
        return s
            .replace(/[\r\n]+/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/\s+(?=[^{\]]*\})/g, '')
            .replace(/\s+(?=[^[\]]*\])/g, '')
            .trim();
    }

    function Increase(sheetsStr, transition) {
        transition = parseInt(transition) || 0;
        if (!transition) return sheetsStr;
        let results = '';
        for (const ch of sheetsStr) {
            const idx = KEYS.indexOf(ch);
            if (idx !== -1) {
                results += KEYS[Math.min(idx + transition, KEYS.length - 1)];
            } else {
                results += ch;
            }
        }
        return results;
    }

    // basic midi reader, nothin fancy
    function parseMidi(buf, semitoneShift) {
        semitoneShift = semitoneShift || 0;
        const b = new Uint8Array(buf);
        let i = 0;

        const u32 = () => ((b[i++] << 24) | (b[i++] << 16) | (b[i++] << 8) | b[i++]) >>> 0;
        const u16 = () => (b[i++] << 8) | b[i++];
        const u8 = () => b[i++];
        const vl = () => {
            let v = 0, x;
            do {
                x = u8();
                v = (v << 7) | (x & 0x7f);
            } while (x & 0x80);
            return v;
        };

        i = 4;
        u32();
        u16();
        const ntrk = u16();
        const tpb = u16();
        const tempos = [{ tick: 0, us: 500000 }];
        const notes = [];

        for (let t = 0; t < ntrk; t++) {
            i += 4;
            const end = i + u32();
            let tick = 0;
            let rs = 0;

            while (i < end) {
                tick += vl();
                const byte0 = b[i];
                if (byte0 & 0x80) {
                    rs = byte0;
                    i++;
                }
                const cmd = (rs >> 4) & 0xf;

                if (rs === 0xff) {
                    const mt = u8();
                    const ml = vl();
                    if (mt === 0x51 && ml === 3) {
                        tempos.push({
                            tick: tick,
                            us: (b[i] << 16) | (b[i + 1] << 8) | b[i + 2]
                        });
                    }
                    i += ml;
                } else if (rs === 0xf0 || rs === 0xf7) {
                    i += vl();
                } else if (cmd === 0x9) {
                    const note = u8();
                    const vel = u8();
                    if (vel > 0) notes.push({ tick: tick, note: note });
                } else if (cmd === 0x8 || cmd === 0xa || cmd === 0xb || cmd === 0xe) {
                    u8();
                    u8();
                } else if (cmd === 0xc || cmd === 0xd) {
                    u8();
                }
            }
            i = end;
        }

        tempos.sort((a, b) => a.tick - b.tick);

        function toMs(tick) {
            let ms = 0;
            let pt = 0;
            let us = 500000;
            for (let j = 0; j < tempos.length && tempos[j].tick <= tick; j++) {
                if (j > 0) {
                    ms += (tempos[j].tick - pt) / tpb * us / 1000;
                    pt = tempos[j].tick;
                }
                us = tempos[j].us;
            }
            return ms + (tick - pt) / tpb * us / 1000;
        }

        const MIDI_START = 48 - semitoneShift;
        return notes
            .map(n => ({ ms: toMs(n.tick), key: KEYS[n.note - MIDI_START] }))
            .filter(n => n.key != null)
            .sort((a, b) => a.ms - b.ms);
    }

    function normalizeMidiQueue(queue) {
        if (!queue || !queue.length) return queue;
        const firstMs = queue[0].ms;
        return queue.map(n => ({
            ms: Math.max(0, n.ms - firstMs + MIDI_START_DELAY),
            key: n.key
        }));
    }

    function buildMidiSteps(queue) {
        if (!queue || !queue.length) return [];
        const steps = [];
        let cur = [queue[0]];
        for (let i = 1; i < queue.length; i++) {
            if (queue[i].ms <= cur[0].ms + 12) {
                cur.push(queue[i]);
            } else {
                steps.push(cur);
                cur = [queue[i]];
            }
        }
        steps.push(cur);
        return steps;
    }

    function WAIT(key, time) {
        setTimeout(() => {
            const isShift = SHIFT_CHARS.includes(key);
            const isDigit = !isNaN(parseInt(key));
            let eventKey = key;
            let keyCode, code, shiftKey = false;

            if (isShift) {
                const n = SHIFT_CHARS.indexOf(key);
                eventKey = DIGIT_CHARS[n];
                keyCode = eventKey.charCodeAt(0);
                code = 'Digit' + eventKey;
                shiftKey = true;
            } else if (isDigit) {
                keyCode = key.charCodeAt(0);
                code = 'Digit' + key;
            } else {
                eventKey = config.caps ? key.toUpperCase() : key;
                keyCode = eventKey.charCodeAt(0);
                code = 'Key' + eventKey;
                shiftKey = config.shift && key === key.toUpperCase();
            }

            const base = {
                key: eventKey,
                keyCode: keyCode,
                code: code,
                which: keyCode,
                shiftKey: shiftKey,
                ctrlKey: false,
                metaKey: false,
                bubbles: true
            };

            document.dispatchEvent(new KeyboardEvent('key' + config.type, base));
            setTimeout(() => {
                document.dispatchEvent(new KeyboardEvent('key' + config.utype, base));
            }, config.release);
        }, time);
    }

    function press(key) {
        for (let i = 0; i < config.times; i++) {
            WAIT(key, i * config.times_time);
        }
    }

    function Conv(h) {
        if (!h) return;
        if (h.startsWith('[') && h.endsWith(']')) {
            h.slice(1, -1).split('').forEach(c => press(c));
        } else if (h.startsWith('{') && h.endsWith('}')) {
            playKey(h);
        } else if (h.length > 1) {
            for (const c of h) press(c);
        } else {
            press(h);
        }
    }

    function playKey(h) {
        if (h.startsWith('[') && h.endsWith(']')) {
            const parts = h.slice(1, -1).match(/{[^}]*}|\D|\d|\S+/gm);
            if (parts) parts.forEach(t => Conv(t));
        } else if (h.startsWith('{') && h.endsWith('}')) {
            beaut(h.slice(1, -1)).split(' ').forEach((t, i) => {
                setTimeout(() => Conv(t), i * config.curlbracket_time);
            });
        } else {
            Conv(h);
        }
    }

    function cont() {
        const parts = sheets.split(' ').filter(Boolean);
        if (current >= parts.length) {
            if (config.loop) current = 0;
            else return false;
        }
        playKey(parts[current++]);
        updateProgress();
        return true;
    }

    function stopAutoplay() {
        autoplayRunning = false;
        if (autoplayTimeout) {
            clearTimeout(autoplayTimeout);
            autoplayTimeout = null;
        }
        setStatus('Stopped');
        updateButtons();
    }

    function startSheetAutoplay() {
        if (autoplayRunning) {
            stopAutoplay();
            return;
        }
        if (!sheets.trim()) {
            setStatus('No sheet loaded');
            return;
        }
        currentDelay = Math.round(60000 / lastBPM);
        autoplayRunning = true;
        setStatus('Playing sheet @ ' + lastBPM + ' BPM');
        updateButtons();

        (function step() {
            if (!autoplayRunning) return;
            if (!cont()) {
                if (!config.loop) {
                    autoplayRunning = false;
                    setStatus('Finished');
                    updateButtons();
                    return;
                }
            }
            autoplayTimeout = setTimeout(step, currentDelay);
        })();
    }

    function startMidiAutoplay() {
        if (!midiQueue || !midiQueue.length) {
            setStatus('No MIDI loaded');
            return;
        }
        if (autoplayRunning) {
            stopAutoplay();
            return;
        }
        midiAutoIdx = 0;
        autoplayRunning = true;
        midiStart = performance.now();
        setStatus('Playing MIDI…');
        updateButtons();
        midiAutoStep();
    }

    function midiAutoStep() {
        if (!autoplayRunning || midiAutoIdx >= midiQueue.length) {
            autoplayRunning = false;
            setStatus(midiAutoIdx >= midiQueue.length ? 'MIDI finished' : 'Stopped');
            updateButtons();
            return;
        }
        const elapsed = performance.now() - midiStart;
        const delay = Math.max(0, midiQueue[midiAutoIdx].ms - elapsed);

        autoplayTimeout = setTimeout(() => {
            if (!autoplayRunning) return;
            const clusterMs = midiQueue[midiAutoIdx].ms;
            while (midiAutoIdx < midiQueue.length && midiQueue[midiAutoIdx].ms <= clusterMs + 12) {
                press(midiQueue[midiAutoIdx].key);
                midiAutoIdx++;
            }
            updateProgress();
            midiAutoStep();
        }, delay);
    }

    function pressAndAdvanceMidi() {
        if (!midiSteps || !midiSteps.length) {
            setStatus('No MIDI loaded');
            return;
        }
        if (midiThrottleIndex >= midiSteps.length) {
            setStatus('MIDI finished!! Reset to replay');
            midiThrottleIndex = 0;
            updateProgress();
            return;
        }
        if (midiThrottlePending) return;

        const now = performance.now();
        const currentStep = midiSteps[midiThrottleIndex];
        const midiGap = midiThrottleIndex > 0
            ? currentStep[0].ms - midiSteps[midiThrottleIndex - 1][0].ms
            : 0;
        const realElapsed = now - midiThrottleLastAt;
        const delay = Math.max(0, midiGap - realElapsed);

        midiThrottlePending = true;
        setTimeout(() => {
            midiThrottlePending = false;
            if (midiThrottleIndex >= midiSteps.length) return;
            const step = midiSteps[midiThrottleIndex];
            for (const n of step) press(n.key);
            midiThrottleLastAt = performance.now();
            midiThrottleIndex++;
            updateProgress();
        }, delay);
    }

    function loadMidi() {
        const octStr = prompt('Octave shift (0 = default, ±1, ±2…)', '0');
        if (octStr === null) return;
        const octave = parseInt(octStr) || 0;

        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = '.mid,.midi';
        inp.style.display = 'none';
        document.body.appendChild(inp);

        inp.onchange = e => {
            const file = e.target.files[0];
            document.body.removeChild(inp);
            if (!file) return;

            const reader = new FileReader();
            reader.onload = ev => {
                try {
                    midiQueue = normalizeMidiQueue(parseMidi(ev.target.result, octave * 12));
                    midiSteps = buildMidiSteps(midiQueue);
                    midiThrottleIndex = 0;
                    midiAutoIdx = 0;
                    midiThrottlePending = false;
                    midiThrottleLastAt = 0;
                    setStatus('MIDI: ' + file.name + ' (' + midiQueue.length + ' notes / ' + midiSteps.length + ' steps)');
                    updateProgress();
                    updateButtons();
                } catch (ex) {
                    setStatus('MIDI parse error: ' + ex.message);
                    midiQueue = null;
                    midiSteps = null;
                }
            };
            reader.readAsArrayBuffer(file);
        };
        inp.click();
    }

    function resetAll() {
        current = 0;
        midiAutoIdx = 0;
        midiThrottleIndex = 0;
        midiThrottlePending = false;
        midiThrottleLastAt = 0;
        stopAutoplay();
        setStatus('Reset');
        updateProgress();
    }

    // localstorage junk so the panel remembers where you left it
    const VP_STORE_KEY = 'vpAutoplayerUIState_v2';

    function saveUIState() {
        try {
            localStorage.setItem(VP_STORE_KEY, JSON.stringify({
                sheetText: sheetArea ? sheetArea.value : '',
                bpm: lastBPM,
                loop: config.loop,
                times: config.times,
                activeTab: activeTab,
                left: gui ? gui.style.left : null,
                top: gui ? gui.style.top : null,
                width: gui ? gui.style.width : null,
                height: gui ? gui.style.height : null
            }));
        } catch (e) {}
    }

    function loadUIState() {
        try {
            const raw = localStorage.getItem(VP_STORE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function readableHotkeyName(name) {
        return name
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, c => c.toUpperCase())
            .trim();
    }

    function keyLabel(k) {
        return k === ' ' ? 'Space' : k;
    }

    function renderHotkeyList() {
        return Object.entries(config.hotkeys).map(([name, keys]) => {
            const label = readableHotkeyName(name);
            const combo = keys.map(k => '<kbd>' + keyLabel(k) + '</kbd>').join(' / ');
            return '<div class="vp-hk-row"><span>' + label + '</span><span class="vp-hk-keys">' + combo + '</span></div>';
        }).join('');
    }

    const SHEETS_SITE = 'vp-sheets.arijan.dev';
    const SHEETS_URL = 'https://vp-sheets.arijan.dev/index/';
    const FOOTER_HTML = '<div class="hint">v2.3 · Made with 💛 by <a href="https://www.youtube.com/@Temptastrophe" target="_blank" rel="noopener noreferrer"><b>Temptastrophe</b></a></div>';

    let gui, statusEl, statusDotEl, progressEl, progressLabelEl, sheetArea, bpmInput, bpmSlider,
        loopCheck, timesInput, clockEl, charCountEl, keystripEl;
    let sheetsIframe = null;
    let sheetsTabLoaded = false;
    let activeTab = 'player';
    let tabButtons = {};
    let tabPanels = {};

    function switchTab(id) {
        if (!tabButtons[id] || !tabPanels[id]) return;
        activeTab = id;
        Object.keys(tabPanels).forEach(k => {
            const isActive = k === id;
            tabPanels[k].classList.toggle('active', isActive);
            tabButtons[k].classList.toggle('active', isActive);
        });
        if (id === 'sheets' && sheetsIframe && !sheetsTabLoaded) {
            sheetsIframe.src = SHEETS_URL;
            sheetsTabLoaded = true;
        }
        saveUIState();
    }

    function createGUI() {
        if (document.getElementById('vp-autoplayer-gui')) return;

        const saved = loadUIState();

        const style = document.createElement('style');
        style.textContent = `
            #vp-autoplayer-gui {
                --ink: #eef0f5;
                --ink-dim: #888c9a;
                --bg-0: #0a0a10;
                --bg-1: #101017;
                --bg-2: #17171f;
                --bg-3: #1d1d27;
                --brass: #b6903f;
                --brass-bright: #d8b568;
                --felt: #1f9d55;
                --felt-bright: #2ecc71;
                --red-felt: #e0505c;
                --line: rgba(255,255,255,0.08);
                --line-soft: rgba(255,255,255,0.05);

                position: fixed;
                top: 80px;
                right: 20px;
                width: 340px;
                min-width: 300px;
                min-height: 300px;
                resize: both;
                overflow: hidden;
                display: flex;
                flex-direction: column;
                background:
                    repeating-linear-gradient(115deg, rgba(255,255,255,0.015) 0px, rgba(255,255,255,0.015) 1px, transparent 1px, transparent 5px),
                    linear-gradient(180deg, var(--bg-1), var(--bg-0));
                color: var(--ink);
                border: 1px solid var(--line);
                border-radius: 10px;
                box-shadow: 0 20px 50px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,0,0,0.3);
                font-family: -apple-system, 'Segoe UI', system-ui, sans-serif;
                font-size: 13px;
                z-index: 999999;
                user-select: none;
            }
            #vp-autoplayer-gui.minimized { min-height: 0; resize: none; }
            #vp-autoplayer-gui.minimized .vp-tabs,
            #vp-autoplayer-gui.minimized .vp-body { display: none; }
            #vp-autoplayer-gui * { box-sizing: border-box; }
            #vp-autoplayer-gui ::selection { background: var(--brass); color: #0d0a04; }

            #vp-autoplayer-gui ::-webkit-scrollbar { width: 8px; height: 8px; }
            #vp-autoplayer-gui ::-webkit-scrollbar-track { background: transparent; }
            #vp-autoplayer-gui ::-webkit-scrollbar-thumb { background: var(--bg-3); border-radius: 8px; border: 1px solid var(--line-soft); }
            #vp-autoplayer-gui ::-webkit-scrollbar-thumb:hover { background: var(--brass); }

            #vp-autoplayer-gui .vp-header {
                background: linear-gradient(180deg, rgba(242,234,217,0.05), transparent);
                padding: 10px 12px 8px;
                cursor: grab;
                display: flex;
                align-items: center;
                justify-content: space-between;
                border-bottom: 1px solid var(--line);
                flex-shrink: 0;
            }
            #vp-autoplayer-gui .vp-header:active { cursor: grabbing; }
            #vp-autoplayer-gui .vp-title-wrap { display: flex; align-items: baseline; gap: 7px; min-width: 0; }
            #vp-autoplayer-gui .vp-clef {
                font-family: Georgia, 'Times New Roman', serif;
                font-size: 20px;
                color: var(--brass);
                line-height: 1;
                flex-shrink: 0;
            }
            #vp-autoplayer-gui .vp-title {
                font-family: Georgia, 'Times New Roman', serif;
                font-size: 14.5px;
                letter-spacing: 0.2px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            #vp-autoplayer-gui .vp-title b { color: var(--brass-bright); font-weight: 600; }
            #vp-autoplayer-gui .vp-mini-dot {
                display: none;
                width: 7px; height: 7px; border-radius: 50%;
                background: var(--ink-dim);
                margin-left: 8px;
                flex-shrink: 0;
            }
            #vp-autoplayer-gui.minimized .vp-mini-dot { display: inline-block; }
            #vp-autoplayer-gui .vp-header-btns { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
            #vp-autoplayer-gui .vp-header-btns button {
                background: transparent;
                border: none;
                color: var(--ink-dim);
                font-size: 14px;
                cursor: pointer;
                width: 22px; height: 22px;
                border-radius: 5px;
                line-height: 1;
            }
            #vp-autoplayer-gui .vp-header-btns button:hover { color: var(--ink); background: rgba(242,234,217,0.08); }

            #vp-autoplayer-gui .vp-keystrip {
                display: flex;
                height: 5px;
                flex-shrink: 0;
                border-bottom: 1px solid var(--line);
            }
            #vp-autoplayer-gui .vp-keystrip .k {
                flex: 1;
                background: var(--bg-2);
                border-right: 1px solid var(--bg-0);
                transition: background 0.4s ease;
            }
            #vp-autoplayer-gui .vp-keystrip .k.b { background: rgba(0,0,0,0.35); }
            #vp-autoplayer-gui.vp-playing .vp-keystrip .k {
                background: var(--brass);
                animation: vp-chase 1.6s ease-in-out infinite;
            }
            #vp-autoplayer-gui.vp-playing .vp-keystrip .k.b { background: var(--brass-bright); }
            @keyframes vp-chase {
                0%, 100% { opacity: 0.25; }
                50% { opacity: 1; }
            }

            #vp-autoplayer-gui .vp-tabs {
                display: flex;
                gap: 2px;
                padding: 8px 10px 0;
                border-bottom: 1px solid var(--line-soft);
                flex-shrink: 0;
            }
            #vp-autoplayer-gui .vp-tab-btn {
                position: relative;
                flex: 1;
                background: transparent;
                border: none;
                color: var(--ink-dim);
                font-family: inherit;
                font-size: 11.5px;
                font-weight: 500;
                letter-spacing: 0.3px;
                padding: 8px 4px 10px;
                cursor: pointer;
                transition: color 0.15s;
                border-radius: 6px 6px 0 0;
            }
            #vp-autoplayer-gui .vp-tab-btn:hover { color: var(--ink); background: rgba(255,255,255,0.03); }
            #vp-autoplayer-gui .vp-tab-btn.active { color: var(--brass-bright); }
            #vp-autoplayer-gui .vp-tab-btn::after {
                content: '';
                position: absolute;
                left: 14%; right: 14%; bottom: 0;
                height: 2px;
                border-radius: 2px 2px 0 0;
                background: transparent;
                transition: background 0.2s;
            }
            #vp-autoplayer-gui .vp-tab-btn.active::after {
                background: linear-gradient(90deg, var(--brass), var(--brass-bright));
            }

            #vp-autoplayer-gui .vp-body {
                flex: 1;
                min-height: 0;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }
            #vp-autoplayer-gui .vp-tab-panel {
                display: none;
                flex-direction: column;
                padding: 12px;
                overflow-y: auto;
                flex: 1;
                min-height: 0;
            }
            #vp-autoplayer-gui .vp-tab-panel.active { display: flex; }

            #vp-autoplayer-gui .vp-status-row {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 7px 10px;
                background: var(--bg-2);
                border: 1px solid var(--line);
                border-radius: 6px;
                margin-bottom: 10px;
            }
            #vp-autoplayer-gui .vp-status-dot {
                width: 8px; height: 8px; border-radius: 50%;
                background: var(--ink-dim);
                flex-shrink: 0;
                transition: background 0.3s ease;
            }
            #vp-autoplayer-gui .vp-status-dot.playing { background: var(--felt-bright); animation: vp-pulse 1.5s ease-in-out infinite; }
            #vp-autoplayer-gui .vp-status-dot.error { background: var(--red-felt); }
            #vp-autoplayer-gui .vp-status-dot.done { background: var(--brass); }
            @keyframes vp-pulse {
                0%, 100% { box-shadow: 0 0 0 0 rgba(46,204,113,0.55); }
                50% { box-shadow: 0 0 0 5px rgba(46,204,113,0); }
            }
            #vp-autoplayer-gui .status { flex: 1; color: var(--ink); font-size: 12px; }

            #vp-autoplayer-gui .vp-section-label {
                font-size: 10.5px;
                letter-spacing: 1px;
                text-transform: uppercase;
                color: var(--ink-dim);
                margin: 2px 0 7px;
            }

            #vp-autoplayer-gui textarea {
                width: 100%;
                height: 88px;
                background: var(--bg-2);
                border: 1px solid var(--line);
                border-radius: 6px;
                color: var(--ink);
                padding: 8px;
                font-family: 'SFMono-Regular', Consolas, monospace;
                font-size: 12px;
                resize: vertical;
            }
            #vp-autoplayer-gui textarea:focus { outline: none; border-color: var(--brass); }
            #vp-autoplayer-gui textarea::placeholder { color: var(--ink-dim); }

            #vp-autoplayer-gui .vp-sheet-actions {
                display: flex;
                align-items: center;
                gap: 6px;
                margin-top: 6px;
            }
            #vp-autoplayer-gui .vp-mini-btn {
                background: transparent;
                border: 1px solid var(--line);
                color: var(--ink-dim);
                border-radius: 5px;
                padding: 3px 8px;
                font-size: 11px;
                cursor: pointer;
            }
            #vp-autoplayer-gui .vp-mini-btn:hover { color: var(--ink); border-color: var(--brass); }
            #vp-autoplayer-gui .vp-char-count { margin-left: auto; font-size: 11px; color: var(--ink-dim); }

            #vp-autoplayer-gui .row {
                display: flex;
                gap: 8px;
                margin-top: 10px;
                align-items: center;
            }
            #vp-autoplayer-gui .row label { display: flex; align-items: center; gap: 5px; color: var(--ink-dim); font-size: 12px; }
            #vp-autoplayer-gui input[type="number"] {
                width: 56px;
                background: var(--bg-2);
                border: 1px solid var(--line);
                border-radius: 5px;
                color: var(--ink);
                padding: 5px 6px;
            }
            #vp-autoplayer-gui input[type="number"]:focus,
            #vp-autoplayer-gui input[type="checkbox"]:focus-visible { outline: 1px solid var(--brass); }
            #vp-autoplayer-gui input[type="range"] {
                flex: 1;
                accent-color: var(--brass);
            }

            #vp-autoplayer-gui button.vp-btn {
                flex: 1;
                background: var(--bg-2);
                border: 1px solid var(--line);
                color: var(--ink);
                border-radius: 6px;
                padding: 8px 6px;
                cursor: pointer;
                font-size: 12px;
                transition: border-color 0.15s, transform 0.1s, background 0.15s;
            }
            #vp-autoplayer-gui button.vp-btn:hover { border-color: var(--brass); transform: translateY(-1px); }
            #vp-autoplayer-gui button.vp-btn:active { transform: translateY(0); }
            #vp-autoplayer-gui button.vp-btn.active {
                background: linear-gradient(180deg, var(--felt-bright), var(--felt));
                border-color: var(--felt-bright);
                color: #0d140f;
                font-weight: 600;
            }
            #vp-autoplayer-gui button.vp-btn.small { flex: 0 0 40px; }

            #vp-autoplayer-gui .progress-wrap { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
            #vp-autoplayer-gui .progress {
                flex: 1;
                height: 5px;
                background: var(--bg-2);
                border-radius: 3px;
                overflow: hidden;
            }
            #vp-autoplayer-gui .progress-bar {
                height: 100%;
                background: linear-gradient(90deg, var(--brass), var(--brass-bright));
                width: 0%;
                transition: width 0.15s;
            }
            #vp-autoplayer-gui .vp-progress-label {
                font-size: 11px;
                color: var(--ink-dim);
                min-width: 34px;
                text-align: right;
                font-variant-numeric: tabular-nums;
            }

            #vp-autoplayer-gui .clock {
                margin-top: 6px;
                text-align: right;
                font-size: 11px;
                color: var(--ink-dim);
                font-variant-numeric: tabular-nums;
            }

            #vp-autoplayer-gui .vp-help-panel {
                padding: 0;
                font-size: 11.5px;
            }
            #vp-autoplayer-gui .vp-hk-row {
                display: flex;
                justify-content: space-between;
                gap: 10px;
                padding: 6px 2px;
                color: var(--ink-dim);
                border-bottom: 1px dashed var(--line);
            }
            #vp-autoplayer-gui .vp-hk-row:last-child { border-bottom: none; }
            #vp-autoplayer-gui .vp-hk-keys { color: var(--ink); text-align: right; }
            #vp-autoplayer-gui kbd {
                background: var(--bg-1);
                border: 1px solid var(--line);
                border-radius: 4px;
                padding: 1px 5px;
                font-size: 10.5px;
                font-family: inherit;
            }

            #vp-autoplayer-gui .hint {
                margin-top: 12px;
                font-size: 10.5px;
                color: var(--ink-dim);
                line-height: 1.4;
                text-align: center;
            }
            #vp-autoplayer-gui .hint b { color: var(--brass); font-weight: 600; }
            #vp-autoplayer-gui .hint a { color: var(--brass); text-decoration: none; }
            #vp-autoplayer-gui .hint a:hover { text-decoration: underline; color: var(--brass-bright); }

            #vp-autoplayer-gui .vp-setting-card {
                background: var(--bg-2);
                border: 1px solid var(--line);
                border-radius: 6px;
                padding: 10px;
                margin-bottom: 9px;
            }
            #vp-autoplayer-gui .vp-setting-desc {
                font-size: 10.5px;
                color: var(--ink-dim);
                margin-top: 4px;
                line-height: 1.4;
            }

            #vp-autoplayer-gui .vp-tab-panel.vp-sheets-panel { padding: 0; }
            #vp-autoplayer-gui .vp-sheets-toolbar {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 9px 12px;
                border-bottom: 1px solid var(--line);
                flex-shrink: 0;
            }
            #vp-autoplayer-gui .vp-sheets-toolbar .vp-sheets-site {
                flex: 1;
                font-size: 11px;
                color: var(--ink-dim);
                font-family: 'SFMono-Regular', Consolas, monospace;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            #vp-autoplayer-gui .vp-sheets-frame-wrap {
                flex: 1;
                min-height: 220px;
                position: relative;
                background: #fff;
            }
            #vp-autoplayer-gui iframe.vp-sheets-iframe {
                width: 100%;
                height: 100%;
                border: none;
                display: block;
            }
            #vp-autoplayer-gui .vp-sheets-note {
                flex-shrink: 0;
                padding: 7px 12px;
                font-size: 10.5px;
                color: var(--ink-dim);
                border-top: 1px solid var(--line);
                background: var(--bg-1);
            }

            .vp-toolbar-autoplayer-btn.active .icon,
            .vp-toolbar-autoplayer-btn.active .value {
                color: #b6903f;
            }
        `;
        document.head.appendChild(style);

        gui = document.createElement('div');
        gui.id = 'vp-autoplayer-gui';
        if (saved && saved.width) gui.style.width = saved.width;
        if (saved && saved.height) gui.style.height = saved.height;

        gui.innerHTML = `
            <div class="vp-header">
                <div class="vp-title-wrap">
                    <span class="vp-clef">𝄞</span>
                    <span class="vp-title" style="font-size: 16px;">Autoverse</span>
                    <span class="vp-mini-dot" id="vp-mini-dot"></span>
                </div>
                <div class="vp-header-btns">
                    <button id="vp-min" title="Minimize">–</button>
                    <button id="vp-close" title="Hide (F8)">×</button>
                </div>
            </div>
            <div class="vp-keystrip" id="vp-keystrip"></div>
            <div class="vp-tabs" id="vp-tabs">
                <button class="vp-tab-btn active" data-tab="player">Player</button>
                <button class="vp-tab-btn" data-tab="settings">Settings</button>
                <button class="vp-tab-btn" data-tab="sheets">Sheets</button>
                <button class="vp-tab-btn" data-tab="help">Help</button>
            </div>
            <div class="vp-body">

                <div class="vp-tab-panel active" data-panel="player">
                    <div class="vp-status-row">
                        <span class="vp-status-dot" id="vp-status-dot"></span>
                        <span class="status" id="vp-status">Ready</span>
                    </div>

                    <textarea id="vp-sheet" placeholder="Paste your sheet music here…&#10;[q w e] {r t y} etc.">${saved && saved.sheetText ? saved.sheetText : ''}</textarea>
                    <div class="vp-sheet-actions">
                        <button class="vp-mini-btn" id="vp-copy" title="Copy sheet text to clipboard">Copy</button>
                        <button class="vp-mini-btn" id="vp-paste" title="Paste sheet text from clipboard">Paste</button>
                        <button class="vp-mini-btn" id="vp-clear" title="Clear the sheet box">Clear</button>
                        <span class="vp-char-count" id="vp-char-count">0 tokens</span>
                    </div>

                    <div class="row">
                        <button class="vp-btn" id="vp-play" title="Play sheet or MIDI (${config.hotkeys.autoplay.join('/')})">Play</button>
                        <button class="vp-btn" id="vp-manual" title="Step through with any keypress (${config.hotkeys.manual.join('/')})">Manual</button>
                        <button class="vp-btn" id="vp-throttle" title="Step through MIDI, one press at a time (${config.hotkeys.midithrottle.join('/')})">Throttle</button>
                    </div>
                    <div class="row">
                        <button class="vp-btn" id="vp-midi" title="Load a .mid file (${config.hotkeys.loadmidi.join('/')})">Load MIDI</button>
                        <button class="vp-btn" id="vp-reset" title="Reset playback position (${config.hotkeys.reset.join('/')})">Reset</button>
                        <button class="vp-btn small" id="vp-trans-down" title="Transpose −1 (${config.hotkeys.transposeDown.join('/')})">−1</button>
                        <button class="vp-btn small" id="vp-trans-up" title="Transpose +1 (${config.hotkeys.transposeUp.join('/')})">+1</button>
                    </div>

                    <div class="progress-wrap">
                        <div class="progress"><div class="progress-bar" id="vp-progress"></div></div>
                        <div class="vp-progress-label" id="vp-progress-label">0%</div>
                    </div>
                    <div class="clock" id="vp-clock"></div>
                    ${FOOTER_HTML}
                </div>

                <div class="vp-tab-panel" data-panel="settings">
                    <div class="vp-section-label">Tempo &amp; Playback</div>
                    <div class="vp-setting-card">
                        <div class="row" style="margin-top:0">
                            <label>BPM <input type="number" id="vp-bpm" value="${saved && saved.bpm ? saved.bpm : 120}" min="20" max="400"></label>
                            <input type="range" id="vp-bpm-slider" min="20" max="400" value="${saved && saved.bpm ? saved.bpm : 120}">
                        </div>
                        <div class="vp-setting-desc">Controls the pace of sheet playback. MIDI files use their own embedded tempo instead.</div>
                    </div>
                    <div class="vp-setting-card">
                        <div class="row" style="margin-top:0">
                            <label><input type="checkbox" id="vp-loop" ${saved && saved.loop ? 'checked' : ''}> Loop when finished</label>
                        </div>
                        <div class="vp-setting-desc">Restarts the sheet automatically from the top instead of stopping at the end.</div>
                    </div>
                    <div class="vp-setting-card">
                        <div class="row" style="margin-top:0">
                            <label>Repeat each key <input type="number" id="vp-times" value="${saved && saved.times ? saved.times : 1}" min="1" max="8" style="width:44px"></label>
                        </div>
                        <div class="vp-setting-desc">Fires every keypress this many times, spaced a few ms apart and is useful on stubborn inputs.</div>
                    </div>
                    ${FOOTER_HTML}
                </div>

                <div class="vp-tab-panel vp-sheets-panel" data-panel="sheets">
                    <div class="vp-sheets-toolbar">
                        <span class="vp-sheets-site">${SHEETS_SITE}</span>
                        <button class="vp-mini-btn" id="vp-sheets-reload" title="Reload the embedded page">Reload</button>
                        <button class="vp-mini-btn" id="vp-sheets-open-tab" title="Open in a new browser tab">Open in tab</button>
                    </div>
                    <div class="vp-sheets-frame-wrap">
                        <iframe class="vp-sheets-iframe" id="vp-sheets-iframe" referrerpolicy="no-referrer"></iframe>
                    </div>
                    <div class="vp-sheets-note">Copy a sheet on the site, then switch to the <b>Player</b> tab and hit <b>Paste</b>. Some sites block embedding so <b>Open in tab</b> if it stays blank.</div>
                </div>

                <div class="vp-tab-panel" data-panel="help">
                    <div class="vp-section-label">Hotkeys</div>
                    <div class="vp-help-panel" id="vp-help-panel">
                        ${renderHotkeyList()}
                    </div>
                    ${FOOTER_HTML}
                </div>

            </div>
        `;
        document.body.appendChild(gui);
        gui.style.display = 'none';

        if (saved && saved.left) gui.style.left = saved.left;
        if (saved && saved.top) gui.style.top = saved.top;
        if (saved && saved.left) gui.style.right = 'auto';

        // little piano keystrip thing at the top, more for looks :P
        keystripEl = gui.querySelector('#vp-keystrip');
        const pattern = ['w','w','b','w','b','w','w','b','w','b','w','b','w','w','b','w','b','w'];
        pattern.forEach((type, idx) => {
            const k = document.createElement('div');
            k.className = 'k' + (type === 'b' ? ' b' : '');
            k.style.animationDelay = (idx * 0.07) + 's';
            keystripEl.appendChild(k);
        });

        statusEl = gui.querySelector('#vp-status');
        statusDotEl = gui.querySelector('#vp-status-dot');
        progressEl = gui.querySelector('#vp-progress');
        progressLabelEl = gui.querySelector('#vp-progress-label');
        sheetArea = gui.querySelector('#vp-sheet');
        bpmInput = gui.querySelector('#vp-bpm');
        bpmSlider = gui.querySelector('#vp-bpm-slider');
        loopCheck = gui.querySelector('#vp-loop');
        timesInput = gui.querySelector('#vp-times');
        clockEl = gui.querySelector('#vp-clock');
        charCountEl = gui.querySelector('#vp-char-count');
        sheetsIframe = gui.querySelector('#vp-sheets-iframe');

        if (saved && saved.sheetText) sheets = beaut(saved.sheetText);
        if (saved && saved.bpm) lastBPM = Math.max(20, Math.min(400, saved.bpm));
        if (saved && saved.loop) config.loop = true;
        if (saved && saved.times) config.times = Math.max(1, Math.min(8, saved.times));
        updateCharCount();

        gui.querySelectorAll('.vp-tab-btn').forEach(btn => {
            const id = btn.dataset.tab;
            tabButtons[id] = btn;
            btn.onclick = () => switchTab(id);
        });
        gui.querySelectorAll('.vp-tab-panel').forEach(panel => {
            tabPanels[panel.dataset.panel] = panel;
        });
        switchTab(saved && saved.activeTab && tabPanels[saved.activeTab] ? saved.activeTab : 'player');

        gui.querySelector('#vp-min').onclick = () => gui.classList.toggle('minimized');
        gui.querySelector('#vp-close').onclick = () => setGuiOpen(false);

        gui.querySelector('#vp-sheets-reload').onclick = () => {
            if (sheetsIframe) sheetsIframe.src = SHEETS_URL;
            sheetsTabLoaded = true;
        };
        gui.querySelector('#vp-sheets-open-tab').onclick = () => {
            window.open(SHEETS_URL, '_blank', 'noopener,noreferrer');
        };

        sheetArea.addEventListener('change', () => {
            sheets = beaut(sheetArea.value);
            current = 0;
            setStatus('Sheet updated');
            updateProgress();
            saveUIState();
        });
        sheetArea.addEventListener('blur', () => {
            sheets = beaut(sheetArea.value);
            saveUIState();
        });
        sheetArea.addEventListener('input', () => {
            updateCharCount();
        });

        gui.querySelector('#vp-copy').onclick = async () => {
            try {
                await navigator.clipboard.writeText(sheetArea.value);
                setStatus('Sheet copied to clipboard');
            } catch (e) {
                setStatus('Copy failed.. select manually');
            }
        };
        gui.querySelector('#vp-paste').onclick = async () => {
            try {
                const text = await navigator.clipboard.readText();
                if (!text.trim()) {
                    setStatus('Clipboard is empty');
                    return;
                }
                sheetArea.value = text;
                sheets = beaut(text);
                current = 0;
                updateCharCount();
                updateProgress();
                setStatus('Sheet pasted from clipboard');
                saveUIState();
            } catch (e) {
                setStatus('Paste blocked. Use Ctrl+V in the box');
            }
        };
        gui.querySelector('#vp-clear').onclick = () => {
            sheetArea.value = '';
            sheets = '';
            current = 0;
            updateCharCount();
            updateProgress();
            setStatus('Sheet cleared');
            saveUIState();
        };

        bpmInput.onchange = () => {
            lastBPM = Math.max(20, Math.min(400, parseInt(bpmInput.value) || 120));
            bpmInput.value = lastBPM;
            bpmSlider.value = lastBPM;
            currentDelay = Math.round(60000 / lastBPM);
            saveUIState();
        };
        bpmSlider.oninput = () => {
            bpmInput.value = bpmSlider.value;
            bpmInput.onchange();
        };

        loopCheck.onchange = () => {
            config.loop = loopCheck.checked;
            saveUIState();
        };

        timesInput.onchange = e => {
            config.times = Math.max(1, Math.min(8, parseInt(e.target.value) || 1));
            saveUIState();
        };

        gui.querySelector('#vp-play').onclick = () => {
            manualMode = false;
            midiThrottleMode = false;
            if (midiQueue && midiQueue.length) startMidiAutoplay();
            else startSheetAutoplay();
        };
        gui.querySelector('#vp-manual').onclick = () => {
            manualMode = !manualMode;
            if (manualMode) {
                midiThrottleMode = false;
                if (autoplayRunning) stopAutoplay();
            }
            setStatus(manualMode ? 'Manual mode ON' : 'Manual mode OFF');
            updateButtons();
        };
        gui.querySelector('#vp-throttle').onclick = () => {
            midiThrottleMode = !midiThrottleMode;
            if (midiThrottleMode) {
                manualMode = false;
                if (autoplayRunning) stopAutoplay();
                midiThrottlePending = false;
                midiThrottleLastAt = 0;
            }
            setStatus(midiThrottleMode ? 'Throttle ON' : 'Throttle OFF');
            updateButtons();
        };
        gui.querySelector('#vp-midi').onclick = loadMidi;
        gui.querySelector('#vp-reset').onclick = resetAll;
        gui.querySelector('#vp-trans-up').onclick = () => {
            sheets = beaut(Increase(sheets, 1));
            sheetArea.value = sheets;
            updateCharCount();
            setStatus('Transposed +1');
        };
        gui.querySelector('#vp-trans-down').onclick = () => {
            sheets = beaut(Increase(sheets, -1));
            sheetArea.value = sheets;
            updateCharCount();
            setStatus('Transposed −1');
        };

        // drag the header around, it doesnt go offscreen i don't think
        const header = gui.querySelector('.vp-header');
        let dragging = false;
        let ox = 0;
        let oy = 0;
        header.onmousedown = e => {
            if (e.target.tagName === 'BUTTON') return;
            dragging = true;
            ox = e.clientX - gui.offsetLeft;
            oy = e.clientY - gui.offsetTop;
            e.preventDefault();
        };
        document.addEventListener('mousemove', e => {
            if (!dragging) return;
            const maxLeft = window.innerWidth - gui.offsetWidth;
            const maxTop = window.innerHeight - 30;
            const left = Math.min(Math.max(0, e.clientX - ox), Math.max(0, maxLeft));
            const top = Math.min(Math.max(0, e.clientY - oy), Math.max(0, maxTop));
            gui.style.left = left + 'px';
            gui.style.top = top + 'px';
            gui.style.right = 'auto';
        });
        document.addEventListener('mouseup', () => {
            if (dragging) saveUIState();
            dragging = false;
        });
        header.addEventListener('dblclick', () => {
            gui.style.top = '80px';
            gui.style.right = '20px';
            gui.style.left = 'auto';
            saveUIState();
        });

        updateClock();
        setInterval(updateClock, 1000);

        updateProgress();
        updateButtons();
    }

    function setStatus(msg) {
        if (!statusEl) return;
        statusEl.textContent = msg;
        const lower = msg.toLowerCase();
        if (statusDotEl) {
            statusDotEl.className = 'vp-status-dot' +
                (lower.includes('error') ? ' error' :
                 lower.includes('playing') ? ' playing' :
                 lower.includes('finished') || lower.includes('reset') ? ' done' : '');
        }
    }

    function updateClock() {
        if (!clockEl) return;
        clockEl.textContent = new Date().toLocaleTimeString();
    }

    function updateCharCount() {
        if (!charCountEl || !sheetArea) return;
        const tokens = beaut(sheetArea.value).split(' ').filter(Boolean).length;
        charCountEl.textContent = tokens + ' token' + (tokens === 1 ? '' : 's');
    }

    function updateProgress() {
        if (!progressEl) return;
        let pct = 0;
        let frac = '';
        if (midiQueue && midiQueue.length) {
            const idx = autoplayRunning ? midiAutoIdx : midiThrottleIndex;
            pct = (idx / midiQueue.length) * 100;
            frac = idx + '/' + midiQueue.length;
        } else if (sheets) {
            const parts = sheets.split(' ').filter(Boolean);
            pct = parts.length ? (current / parts.length) * 100 : 0;
            frac = current + '/' + parts.length;
        }
        pct = Math.min(100, pct);
        progressEl.style.width = pct + '%';
        if (progressLabelEl) progressLabelEl.textContent = Math.round(pct) + '%';
        if (progressLabelEl && frac) progressLabelEl.title = frac;
    }

    function updateButtons() {
        if (!gui) return;
        gui.querySelector('#vp-play').classList.toggle('active', autoplayRunning);
        gui.querySelector('#vp-manual').classList.toggle('active', manualMode);
        gui.querySelector('#vp-throttle').classList.toggle('active', midiThrottleMode);
        gui.classList.toggle('vp-playing', autoplayRunning);
        const miniDot = gui.querySelector('#vp-mini-dot');
        if (miniDot) {
            miniDot.style.background = autoplayRunning
                ? 'var(--felt-bright)'
                : (manualMode || midiThrottleMode ? 'var(--brass)' : 'var(--ink-dim)');
        }
    }

    function setGuiOpen(open) {
        if (!gui) return;
        gui.style.display = open ? 'flex' : 'none';
        updateToolbarButtonState(open);
    }

    // button in the site toolbar
    let toolbarBtnEl = null;

    function findPianoverseToolbar() {
        return document.querySelector('.toolbar[aria-label="Piano settings"]');
    }

    function updateToolbarButtonState(open) {
        if (!toolbarBtnEl) return;
        toolbarBtnEl.classList.toggle('active', !!open);
        const valueEl = toolbarBtnEl.querySelector('.vp-tb-value');
        if (valueEl) valueEl.textContent = open ? 'On' : 'Off';
    }

    function buildToolbarButton() {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'item compact vp-toolbar-autoplayer-btn';
        btn.title = 'Toggle Autoverse (F8)';
        btn.innerHTML = `
            <i class="icon fas fa-music" aria-hidden="true"></i>
            <span class="stack">
                <span class="label">Autoverse</span>
                <span class="value vp-tb-value">Closed</span>
            </span>
        `;
        btn.addEventListener('click', () => {
            if (!gui) createGUI();
            setGuiOpen(gui.style.display === 'none');
        });
        return btn;
    }

    function injectPianoverseToolbarButton() {
        if (document.contains(toolbarBtnEl)) return;

        const toolbar = findPianoverseToolbar();
        if (!toolbar) return;

        const transposeBtn = toolbar.querySelector('.item.transpose');
        const host = transposeBtn ? transposeBtn.parentElement : toolbar.querySelector('.side-group.left .group');
        if (!host) return;

        toolbarBtnEl = buildToolbarButton();
        if (transposeBtn) transposeBtn.after(toolbarBtnEl);
        else host.appendChild(toolbarBtnEl);

        updateToolbarButtonState(gui ? gui.style.display !== 'none' : false);
    }

    // site is a spa so the toolbar can get rebuilt, keep re-adding the button
    const toolbarObserver = new MutationObserver(() => injectPianoverseToolbarButton());
    toolbarObserver.observe(document.documentElement, { childList: true, subtree: true });

    function isHotkey(key) {
        return Object.values(config.hotkeys).some(arr => arr.includes(key));
    }

    // block regular keys while in manual / throttle so the site doesnt also hear them
    ['keydown', 'keypress', 'keyup'].forEach(evtType => {
        window.addEventListener(evtType, e => {
            if (!e.isTrusted || e.repeat) return;

            const inManual = manualMode;
            const inThrottle = midiThrottleMode;
            const inAutoplay = autoplayRunning;

            if (!inManual && !inThrottle && !inAutoplay) return;

            if (inAutoplay && config.hotkeys.autoplay.includes(e.key)) return;
            if (inThrottle && config.hotkeys.midithrottle.includes(e.key)) return;
            if (inManual && isHotkey(e.key)) return;

            e.preventDefault();
            e.stopImmediatePropagation();

            if (evtType === 'keydown') {
                if (inManual) cont();
                else if (inThrottle) pressAndAdvanceMidi();
            }
        }, true);
    });

    window.addEventListener('keydown', e => {
        if (!e.isTrusted || e.repeat) return;

        if (config.hotkeys.toggleGui.includes(e.key)) {
            e.preventDefault();
            if (gui) {
                setGuiOpen(gui.style.display === 'none');
            }
            return;
        }

        if (config.hotkeys.manual.includes(e.key)) {
            e.preventDefault();
            e.stopImmediatePropagation();
            manualMode = !manualMode;
            if (manualMode) {
                midiThrottleMode = false;
                if (autoplayRunning) stopAutoplay();
            }
            setStatus(manualMode ? 'Manual ON' : 'Manual OFF');
            updateButtons();
            return;
        }

        if (config.hotkeys.midithrottle.includes(e.key)) {
            e.preventDefault();
            e.stopImmediatePropagation();
            midiThrottleMode = !midiThrottleMode;
            if (midiThrottleMode) {
                manualMode = false;
                if (autoplayRunning) stopAutoplay();
                midiThrottlePending = false;
                midiThrottleLastAt = 0;
            }
            setStatus(midiThrottleMode ? 'Throttle ON' : 'Throttle OFF');
            updateButtons();
            return;
        }

        if (config.hotkeys.autoplay.includes(e.key)) {
            e.preventDefault();
            e.stopImmediatePropagation();
            manualMode = false;
            midiThrottleMode = false;
            if (midiQueue && midiQueue.length) startMidiAutoplay();
            else startSheetAutoplay();
            return;
        }

        if (config.hotkeys.loadmidi.includes(e.key)) {
            e.preventDefault();
            e.stopImmediatePropagation();
            loadMidi();
            return;
        }

        if (config.hotkeys.reset.includes(e.key)) {
            e.preventDefault();
            e.stopImmediatePropagation();
            resetAll();
            return;
        }

        if (config.hotkeys.transposeUp.includes(e.key)) {
            e.preventDefault();
            sheets = beaut(Increase(sheets, 1));
            if (sheetArea) sheetArea.value = sheets;
            setStatus('Transposed +1');
            return;
        }

        if (config.hotkeys.transposeDown.includes(e.key)) {
            e.preventDefault();
            sheets = beaut(Increase(sheets, -1));
            if (sheetArea) sheetArea.value = sheets;
            setStatus('Transposed −1');
            return;
        }
    }, true);

    function init() {
        createGUI();
        injectPianoverseToolbarButton();
        setStatus('Ready');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
