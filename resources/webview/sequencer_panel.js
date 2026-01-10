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

    const timeLabel = global.document && global.document.getElementById
        ? global.document.getElementById('sequencer_time_label')
        : undefined;

    if (!host || typeof timelineModule === 'undefined' || !timelineModule.Timeline) {
        return;
    }

    const timeline = new timelineModule.Timeline({ id: host });
    timeline.setModel({ rows: [{ keyframes: [] }] });

    // Stage 0 (time-only): keep interactions limited to moving the playhead.
    try {
        if (typeof timeline.setInteractionMode === 'function') {
            timeline.setInteractionMode('none');
        }
    } catch {
        // ignore
    }

    try {
        if (typeof timeline.setOptions === 'function') {
            timeline.setOptions({
                groupsDraggable: false,
                keyframesDraggable: false,
                timelineDraggable: true,
            });
        }
    } catch {
        // ignore
    }

    // Optional non-standard tweaks can be injected by the host HTML.
    try {
        const hacks = global.ShaderToySequencerPanel && global.ShaderToySequencerPanel.hacks
            ? global.ShaderToySequencerPanel.hacks
            : undefined;
        if (hacks && typeof hacks.formatUnitsText === 'function') {
            timeline._formatUnitsText = hacks.formatUnitsText;
        }
    } catch {
        // ignore
    }

    let syncingTime = false;
    let paused = false;
    let lastAppliedTimeSeconds = NaN;
    let lastPostedTimeSeconds = NaN;
    let lastPostedAtMs = 0;

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

    setPausedUi(false);

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

    global.addEventListener('message', (event) => {
        const message = event && event.data ? event.data : undefined;
        if (!message || !message.command) {
            return;
        }

        switch (message.command) {
        case 'syncTime': {
            const timeSeconds = message.time || 0;
            setTimeLabel(timeSeconds);

            if (isFinite(lastAppliedTimeSeconds) && Math.abs(timeSeconds - lastAppliedTimeSeconds) < 0.0005) {
                return;
            }
            syncingTime = true;
            try {
                // setTime returns false when the timeline is actively being dragged.
                timeline.setTime(timeSeconds * 1000);
            } catch {
                // ignore
            }
            syncingTime = false;
            lastAppliedTimeSeconds = timeSeconds;
            return;
        }
        case 'syncPause': {
            setPausedUi(!!message.paused);
            return;
        }
        }
    });

    // Initialize label to 0.
    setTimeLabel(0);
})(typeof window !== 'undefined' ? window : globalThis);
