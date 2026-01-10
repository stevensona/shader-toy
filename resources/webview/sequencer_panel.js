(function (global) {
    'use strict';

    /* eslint-disable no-undef */

    const getVscodeApi = () => {
        try {
            if (typeof global.acquireVsCodeApi === 'function') {
                return global.acquireVsCodeApi();
            }
        } catch {
            // ignore
        }
        return undefined;
    };

    const vscode = getVscodeApi();
    const host = global.document && global.document.getElementById
        ? global.document.getElementById('sequencer')
        : undefined;

    const playPauseButton = global.document && global.document.getElementById
        ? global.document.getElementById('sequencer_play_pause')
        : undefined;

    const loopButton = global.document && global.document.getElementById
        ? global.document.getElementById('sequencer_loop')
        : undefined;

    const exportButton = global.document && global.document.getElementById
        ? global.document.getElementById('sequencer_export')
        : undefined;

    const importButton = global.document && global.document.getElementById
        ? global.document.getElementById('sequencer_import')
        : undefined;

    const timeLabel = global.document && global.document.getElementById
        ? global.document.getElementById('sequencer_time_label')
        : undefined;

    const scopeStartInput = global.document && global.document.getElementById
        ? global.document.getElementById('sequencer_scope_start')
        : undefined;

    const scopeEndInput = global.document && global.document.getElementById
        ? global.document.getElementById('sequencer_scope_end')
        : undefined;

    const trackSelect = global.document && global.document.getElementById
        ? global.document.getElementById('sequencer_track_select')
        : undefined;

    const valueInput = global.document && global.document.getElementById
        ? global.document.getElementById('sequencer_value_input')
        : undefined;

    const addKeyButton = global.document && global.document.getElementById
        ? global.document.getElementById('sequencer_add_key')
        : undefined;

    const updateKeyButton = global.document && global.document.getElementById
        ? global.document.getElementById('sequencer_update_key')
        : undefined;

    const deleteKeyButton = global.document && global.document.getElementById
        ? global.document.getElementById('sequencer_delete_key')
        : undefined;

    const keyIdLabel = global.document && global.document.getElementById
        ? global.document.getElementById('sequencer_key_id')
        : undefined;

    if (!host || typeof timelineModule === 'undefined' || !timelineModule.Timeline) {
        return;
    }

    const timeline = new timelineModule.Timeline({ id: host });
    timeline.setModel({ rows: [] });

    // Allow playhead drag + keyframe interactions.
    try {
        if (typeof timeline.setOptions === 'function') {
            timeline.setOptions({
                groupsDraggable: false,
                keyframesDraggable: true,
                timelineDraggable: true,
                headerHeight: 48,
            });
        }
    } catch {
        // ignore
    }

    let syncingTime = false;
    let paused = false;
    let lastAppliedTimeSeconds = NaN;
    let lastPostedTimeSeconds = NaN;
    let lastPostedAtMs = 0;

    let isScrubbing = false;

    let currentTimeSeconds = 0;
    let project = undefined;
    let valuesByTrackId = {};
    let selectedKey = undefined; // { trackId, keyId }

    let loopEnabled = true;

    const beginScrub = () => {
        if (isScrubbing) {
            return;
        }
        isScrubbing = true;
        if (vscode) {
            try {
                vscode.postMessage({ command: 'sequencerBeginScrub' });
            } catch {
                // ignore
            }
        }
    };

    const endScrub = () => {
        if (!isScrubbing) {
            return;
        }
        isScrubbing = false;
        if (vscode) {
            try {
                vscode.postMessage({ command: 'sequencerEndScrub' });
            } catch {
                // ignore
            }
        }
    };

    // Treat any pointer interaction with the timeline area as a scrub/edit session.
    try {
        host.addEventListener('pointerdown', beginScrub, { passive: true });
        global.addEventListener('pointerup', endScrub, { passive: true });
        global.addEventListener('pointercancel', endScrub, { passive: true });
        global.addEventListener('blur', endScrub, { passive: true });
    } catch {
        // ignore
    }

    const getSelectedTrackId = () => {
        if (!trackSelect) {
            return '';
        }
        return String(trackSelect.value || '');
    };

    const setSelectedTrackId = (trackId) => {
        if (!trackSelect) {
            return;
        }
        try {
            trackSelect.value = trackId;
        } catch {
            // ignore
        }
    };

    const setValueInput = (val) => {
        if (!valueInput) {
            return;
        }
        try {
            valueInput.value = (typeof val === 'number' && isFinite(val)) ? String(val) : '';
        } catch {
            // ignore
        }
    };

    const setSelectedKeyUi = (info) => {
        selectedKey = info;
        if (keyIdLabel) {
            keyIdLabel.textContent = info && info.keyId ? `key: ${info.keyId}` : '';
        }
    };

    const findKeyValueInProject = (trackId, keyId) => {
        try {
            if (!project || !project.tracks) {
                return undefined;
            }
            const t = project.tracks.find((x) => x.id === trackId);
            if (!t || !t.keys) {
                return undefined;
            }
            const k = t.keys.find((x) => x.id === keyId);
            return k ? k.v : undefined;
        } catch {
            return undefined;
        }
    };

    const rebuildTrackSelect = () => {
        if (!trackSelect) {
            return;
        }
        const previous = getSelectedTrackId();
        trackSelect.innerHTML = '';
        if (!project || !project.tracks) {
            return;
        }
        for (const t of project.tracks) {
            const opt = global.document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.name;
            trackSelect.appendChild(opt);
        }
        if (previous) {
            setSelectedTrackId(previous);
        }
        if (!getSelectedTrackId() && project.tracks.length > 0) {
            setSelectedTrackId(project.tracks[0].id);
        }
    };

    const rebuildTimelineModel = () => {
        if (!project || !project.tracks) {
            timeline.setModel({ rows: [] });
            return;
        }
        const rows = project.tracks.map((t) => {
            const keyframes = (t.keys || []).map((k) => {
                return {
                    id: k.id,
                    trackId: t.id,
                    val: Math.round((k.t || 0) * 1000),
                    selected: false,
                };
            });
            return {
                id: t.id,
                name: t.name,
                title: t.name,
                keyframes,
            };
        });
        timeline.setModel({ rows });
    };

    const refreshValueUiFromCurrentTrack = () => {
        const trackId = getSelectedTrackId();
        if (!trackId) {
            return;
        }
        if (selectedKey && selectedKey.trackId === trackId) {
            const v = findKeyValueInProject(selectedKey.trackId, selectedKey.keyId);
            if (typeof v === 'number' && isFinite(v)) {
                setValueInput(v);
                return;
            }
        }
        const v = valuesByTrackId && typeof valuesByTrackId[trackId] === 'number' ? valuesByTrackId[trackId] : undefined;
        if (typeof v === 'number' && isFinite(v)) {
            setValueInput(v);
        }
    };

    const setTimeLabel = (timeSeconds) => {
        if (!timeLabel) {
            return;
        }
        const t = (typeof timeSeconds === 'number' && isFinite(timeSeconds)) ? timeSeconds : 0;
        timeLabel.textContent = t.toFixed(2) + ' s';
    };

    const setPausedUi = (isPaused) => {
        paused = !!isPaused;
        if (playPauseButton) {
            playPauseButton.textContent = paused ? 'Play' : 'Pause';
        }
    };

    const setLoopUi = (isLoop) => {
        loopEnabled = !!isLoop;
        if (loopButton) {
            loopButton.textContent = loopEnabled ? 'Loop: On' : 'Loop: Off';
        }
    };

    const setScopeUi = (startSec, endSec) => {
        if (scopeStartInput) {
            try {
                scopeStartInput.value = (typeof startSec === 'number' && isFinite(startSec)) ? String(startSec) : '0';
            } catch {
                // ignore
            }
        }
        if (scopeEndInput) {
            try {
                scopeEndInput.value = (typeof endSec === 'number' && isFinite(endSec)) ? String(endSec) : '10';
            } catch {
                // ignore
            }
        }
    };

    setPausedUi(false);
    setLoopUi(true);
    setScopeUi(0, 10);

    if (playPauseButton) {
        playPauseButton.addEventListener('click', () => {
            const nextPaused = !paused;
            setPausedUi(nextPaused);
            if (vscode) {
                try {
                    vscode.postMessage({ command: 'sequencerSetPaused', paused: nextPaused });
                } catch {
                    // ignore
                }
            }
        });
    }

    if (loopButton) {
        loopButton.addEventListener('click', () => {
            const nextLoop = !loopEnabled;
            setLoopUi(nextLoop);
            if (vscode) {
                try {
                    vscode.postMessage({ command: 'sequencerSetLoop', loop: nextLoop });
                } catch {
                    // ignore
                }
            }
        });
    }

    const postScopeToHost = () => {
        if (!vscode) {
            return;
        }
        const startSec = scopeStartInput ? Number(String(scopeStartInput.value || '').trim()) : NaN;
        const endSec = scopeEndInput ? Number(String(scopeEndInput.value || '').trim()) : NaN;
        if (!isFinite(startSec) || !isFinite(endSec)) {
            return;
        }
        try {
            vscode.postMessage({ command: 'sequencerSetScope', startSec, endSec });
        } catch {
            // ignore
        }
    };

    if (scopeStartInput) {
        scopeStartInput.addEventListener('change', postScopeToHost);
        scopeStartInput.addEventListener('keydown', (e) => {
            if (e && e.key === 'Enter') {
                postScopeToHost();
            }
        });
    }
    if (scopeEndInput) {
        scopeEndInput.addEventListener('change', postScopeToHost);
        scopeEndInput.addEventListener('keydown', (e) => {
            if (e && e.key === 'Enter') {
                postScopeToHost();
            }
        });
    }

    if (exportButton) {
        exportButton.addEventListener('click', () => {
            if (!vscode) {
                return;
            }
            try {
                vscode.postMessage({ command: 'sequencerExportProject' });
            } catch {
                // ignore
            }
        });
    }

    if (importButton) {
        importButton.addEventListener('click', () => {
            if (!vscode) {
                return;
            }
            try {
                vscode.postMessage({ command: 'sequencerImportProject' });
            } catch {
                // ignore
            }
        });
    }

    timeline.onTimeChanged((event) => {
        if (!event || syncingTime) {
            return;
        }

        try {
            if (timelineModule.TimelineEventSource && event.source !== timelineModule.TimelineEventSource.User) {
                return;
            }
        } catch {
            // ignore
        }

        const newTimeSeconds = (event.val || 0) / 1000.0;
        currentTimeSeconds = newTimeSeconds;
        setTimeLabel(newTimeSeconds);

        if (vscode) {
            try {
                const now = Date.now();
                const shouldSend =
                    !isFinite(lastPostedTimeSeconds) ||
                    (now - lastPostedAtMs) >= 30 ||
                    Math.abs(newTimeSeconds - lastPostedTimeSeconds) >= 0.02;

                if (shouldSend) {
                    vscode.postMessage({ command: 'sequencerSetTime', time: newTimeSeconds });
                    lastPostedAtMs = now;
                    lastPostedTimeSeconds = newTimeSeconds;
                }
            } catch {
                // ignore
            }
        }
    });

    timeline.onKeyframeChanged((event) => {
        if (!event) {
            return;
        }
        try {
            if (timelineModule.TimelineEventSource && event.source !== timelineModule.TimelineEventSource.User) {
                return;
            }
        } catch {
            // ignore
        }

        const target = event.target;
        const keyframe = target && target.keyframe ? target.keyframe : undefined;
        const trackId = keyframe ? String(keyframe.trackId || '') : '';
        const keyId = keyframe ? String(keyframe.id || '') : '';
        if (!trackId || !keyId) {
            return;
        }
        const newTimeSeconds = (event.val || 0) / 1000.0;
        if (vscode) {
            try {
                vscode.postMessage({ command: 'sequencerMoveKey', trackId, keyId, t: newTimeSeconds });
            } catch {
                // ignore
            }
        }
    });

    timeline.onSelected((event) => {
        const selected = event && event.selected ? event.selected : [];
        if (!Array.isArray(selected) || selected.length === 0) {
            setSelectedKeyUi(undefined);
            refreshValueUiFromCurrentTrack();
            return;
        }
        const k = selected[0];
        const trackId = String(k.trackId || '');
        const keyId = String(k.id || '');
        if (trackId && keyId) {
            setSelectedTrackId(trackId);
            setSelectedKeyUi({ trackId, keyId });
            const v = findKeyValueInProject(trackId, keyId);
            if (typeof v === 'number' && isFinite(v)) {
                setValueInput(v);
            }
        }
    });

    global.addEventListener('message', (event) => {
        const message = event && event.data ? event.data : undefined;
        if (!message || !message.command) {
            return;
        }

        switch (message.command) {
        case 'syncTime': {
            const timeSeconds = message.time || 0;
            if (isFinite(lastAppliedTimeSeconds) && Math.abs(timeSeconds - lastAppliedTimeSeconds) < 0.0005) {
                return;
            }
            syncingTime = true;
            let applied = true;
            try {
                // setTime returns false when the timeline is actively being dragged.
                const r = timeline.setTime(timeSeconds * 1000);
                if (r === false) {
                    applied = false;
                }
            } catch {
                // ignore
            }
            syncingTime = false;
            if (!applied) {
                // While scrubbing/dragging, keep displaying the user-controlled time.
                return;
            }
            currentTimeSeconds = timeSeconds;
            setTimeLabel(timeSeconds);
            lastAppliedTimeSeconds = timeSeconds;
            return;
        }
        case 'syncPause': {
            setPausedUi(!!message.paused);
            return;
        }
        case 'sequencerProject': {
            project = message.project;

            // Update scope/loop UI.
            try {
                const p = project || {};
                const loop = typeof p.loop === 'boolean' ? p.loop : true;
                setLoopUi(loop);
                const scope = p.timeScope;
                if (scope && typeof scope.startSec === 'number' && typeof scope.endSec === 'number') {
                    setScopeUi(scope.startSec, scope.endSec);
                } else if (typeof p.durationSec === 'number' && isFinite(p.durationSec)) {
                    setScopeUi(0, p.durationSec);
                }
            } catch {
                // ignore
            }

            rebuildTrackSelect();
            rebuildTimelineModel();
            refreshValueUiFromCurrentTrack();
            return;
        }
        case 'sequencerTrackValues': {
            valuesByTrackId = message.values || {};
            refreshValueUiFromCurrentTrack();
            return;
        }
        }
    });

    if (trackSelect) {
        trackSelect.addEventListener('change', () => {
            setSelectedKeyUi(undefined);
            refreshValueUiFromCurrentTrack();
        });
    }

    const parseNumericInput = () => {
        if (!valueInput) {
            return NaN;
        }
        const raw = String(valueInput.value || '').trim();
        const v = Number(raw);
        return v;
    };

    if (addKeyButton) {
        addKeyButton.addEventListener('click', () => {
            const trackId = getSelectedTrackId();
            if (!trackId || !vscode) {
                return;
            }
            let v = parseNumericInput();
            if (!isFinite(v) && valuesByTrackId && typeof valuesByTrackId[trackId] === 'number') {
                v = valuesByTrackId[trackId];
            }
            if (!isFinite(v)) {
                v = 0;
            }
            try {
                vscode.postMessage({ command: 'sequencerAddKey', trackId, t: currentTimeSeconds, v });
            } catch {
                // ignore
            }
        });
    }

    if (updateKeyButton) {
        updateKeyButton.addEventListener('click', () => {
            if (!selectedKey || !vscode) {
                return;
            }
            const v = parseNumericInput();
            if (!isFinite(v)) {
                return;
            }
            try {
                vscode.postMessage({ command: 'sequencerSetKeyValue', trackId: selectedKey.trackId, keyId: selectedKey.keyId, v });
            } catch {
                // ignore
            }
        });
    }

    if (deleteKeyButton) {
        deleteKeyButton.addEventListener('click', () => {
            if (!selectedKey || !vscode) {
                return;
            }
            try {
                vscode.postMessage({ command: 'sequencerDeleteKey', trackId: selectedKey.trackId, keyId: selectedKey.keyId });
            } catch {
                // ignore
            }
        });
    }

    // Initialize label to 0.
    setTimeLabel(0);
})(typeof window !== 'undefined' ? window : globalThis);
