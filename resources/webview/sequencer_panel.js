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

    let outlineHost = global.document && global.document.getElementById
        ? global.document.getElementById('sequencer_outline')
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

    const snapStepSelect = global.document && global.document.getElementById
        ? global.document.getElementById('sequencer_snap_step')
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

    const ensureOutlineDom = () => {
        if (!global.document) {
            return;
        }

        // If the extension/webview hasn't been rebuilt/reloaded yet, the HTML may not include
        // our outline container. Inject it here to make the feature resilient.
        try {
            const existing = global.document.getElementById('sequencer_outline');
            if (existing) {
                outlineHost = existing;
                return;
            }

            let content = global.document.getElementById('content');
            if (!content) {
                content = global.document.createElement('div');
                content.id = 'content';

                const toolbar = global.document.getElementById('toolbar');
                if (toolbar && toolbar.parentElement) {
                    toolbar.parentElement.insertBefore(content, toolbar.nextSibling);
                } else if (host.parentElement) {
                    host.parentElement.insertBefore(content, host);
                } else {
                    global.document.body.appendChild(content);
                }
            }

            const outline = global.document.createElement('div');
            outline.id = 'sequencer_outline';
            outlineHost = outline;

            // Put outline before the timeline host.
            if (host.parentElement !== content) {
                content.appendChild(outline);
                content.appendChild(host);
            } else {
                content.insertBefore(outline, host);
            }

            // Minimal style injection if the HTML didn't include it.
            if (!global.document.getElementById('sequencer_outline_style')) {
                const style = global.document.createElement('style');
                style.id = 'sequencer_outline_style';
                style.textContent = `
                    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
                    body { display: flex; flex-direction: column; }
                    #content { flex: 1 1 auto; min-height: 0; display: flex; }
                    #sequencer_outline { flex: 0 0 220px; min-width: 160px; max-width: 360px; overflow: auto; background: #1e1e1e; border-right: 1px solid #333; font-family: Consolas, monospace; font-size: 12px; color: #ddd; }
                    #sequencer_outline .outline-header-spacer { height: 48px; border-bottom: 1px solid #333; }
                    #sequencer_outline .outline-item { height: 24px; line-height: 24px; padding: 0 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-bottom: 2px solid transparent; cursor: pointer; user-select: none; }
                    #sequencer_outline .outline-item.selected { background: rgba(156, 220, 254, 0.12); }
                    #sequencer { flex: 1 1 auto; min-width: 0; }
                `;
                global.document.head.appendChild(style);
            }
        } catch {
            // ignore
        }
    };

    ensureOutlineDom();

    const timeline = new timelineModule.Timeline({ id: host });
    timeline.setModel({ rows: [] });

    // Allow playhead drag + keyframe interactions.
    try {
        if (typeof timeline.setOptions === 'function') {
            timeline.setOptions({
                // Enable dragging the "strip between keys" (keyframe groups), like the upstream demo.
                groupsDraggable: true,
                keyframesDraggable: true,
                timelineDraggable: true,
                headerHeight: 48,
            });
        }
    } catch {
        // ignore
    }

    // Global snap/step setting for the time marker (and keyframe dragging).
    // animation-timeline-js operates in "val" units which we use as milliseconds.
    const SNAP_STEP_OPTIONS = [
        { sec: 0.05, label: '0.05s' },
        { sec: 0.1, label: '0.1s' },
        { sec: 0.2, label: '0.2s' },
        { sec: 0.25, label: '0.25s' },
        { sec: 0.5, label: '0.5s' },
        { sec: 1.0, label: '1.0s' },
    ];
    const DEFAULT_SNAP_STEP_SEC = 0.2;
    let currentSnapStepSec = DEFAULT_SNAP_STEP_SEC;
    let syncingSnapUi = false;

    // `timeline.setOptions()` resets internal zoom to `options.zoom`, but the widget's zoom
    // interactions do not necessarily update `options.zoom`. Preserve current zoom by
    // inferring it from public APIs (valToPx + options.stepPx/stepVal).
    const getCurrentZoom = () => {
        try {
            if (!timeline || typeof timeline.getOptions !== 'function' || typeof timeline.valToPx !== 'function') {
                return undefined;
            }
            const opt = timeline.getOptions() || {};
            const stepPx = Number(opt.stepPx);
            const stepVal = Number(opt.stepVal);
            if (!isFinite(stepPx) || stepPx <= 0 || !isFinite(stepVal) || stepVal <= 0) {
                return undefined;
            }
            const px0 = Number(timeline.valToPx(0));
            const pxStep = Number(timeline.valToPx(stepVal));
            const deltaPx = pxStep - px0;
            if (!isFinite(deltaPx) || deltaPx === 0) {
                return undefined;
            }
            const zoom = stepPx / deltaPx;
            return (isFinite(zoom) && zoom > 0) ? zoom : undefined;
        } catch {
            return undefined;
        }
    };

    const applyTimelineSnapStepSec = (stepSec) => {
        const sec = (typeof stepSec === 'number' && isFinite(stepSec) && stepSec > 0) ? stepSec : DEFAULT_SNAP_STEP_SEC;
        currentSnapStepSec = sec;
        try {
            if (timeline && typeof timeline.setOptions === 'function') {
                // Preserve view state so Snap changes don't "jump" the timeline.
                const prevScrollLeft = (typeof timeline.scrollLeft === 'number') ? timeline.scrollLeft : undefined;
                const prevScrollTop = (typeof timeline.scrollTop === 'number') ? timeline.scrollTop : undefined;
                const prevTimeMs = (typeof timeline.getTime === 'function') ? Number(timeline.getTime()) : undefined;

                // Preserve zoom.
                const zoom = getCurrentZoom();

                // Tick marks (major/minor gauge lines) are handled by our snap-aligned
                // `_renderTicks` override (installed below). Here we only apply interaction
                // snapping (playhead + dragging) via snapStep.

                timeline.setOptions({
                    snapEnabled: true,
                    snapStep: Math.round(sec * 1000),
                    ...(typeof zoom === 'number' ? { zoom } : {}),
                });

                // Restore scroll/time best-effort.
                try {
                    if (typeof prevScrollLeft === 'number' && isFinite(prevScrollLeft)) {
                        timeline.scrollLeft = prevScrollLeft;
                    }
                    if (typeof prevScrollTop === 'number' && isFinite(prevScrollTop)) {
                        timeline.scrollTop = prevScrollTop;
                    }
                } catch {
                    // ignore
                }
                try {
                    if (typeof prevTimeMs === 'number' && isFinite(prevTimeMs) && typeof timeline.setTime === 'function') {
                        timeline.setTime(prevTimeMs);
                    }
                } catch {
                    // ignore
                }
            }
        } catch {
            // ignore
        }
    };

    const setSnapUiFromProject = () => {
        if (!snapStepSelect) {
            return;
        }

        // Determine the effective step (project override, else default).
        let effectiveSec = DEFAULT_SNAP_STEP_SEC;
        try {
            const snap = project && project.snapSettings ? project.snapSettings : undefined;
            if (snap && typeof snap.stepSec === 'number' && isFinite(snap.stepSec) && snap.stepSec > 0) {
                effectiveSec = snap.stepSec;
            }
        } catch {
            // ignore
        }

        currentSnapStepSec = effectiveSec;

        // Coerce to one of the supported UI options.
        let chosen = SNAP_STEP_OPTIONS[1];
        try {
            for (const o of SNAP_STEP_OPTIONS) {
                if (Math.abs(o.sec - effectiveSec) < 1e-6) {
                    chosen = o;
                    break;
                }
            }
        } catch {
            // ignore
        }

        syncingSnapUi = true;
        try {
            snapStepSelect.value = String(chosen.sec);
        } catch {
            // ignore
        }
        syncingSnapUi = false;

        applyTimelineSnapStepSec(chosen.sec);
    };

    const initSnapUi = () => {
        if (!snapStepSelect) {
            return;
        }
        try {
            snapStepSelect.innerHTML = '';
            for (const o of SNAP_STEP_OPTIONS) {
                const opt = global.document.createElement('option');
                opt.value = String(o.sec);
                opt.textContent = o.label;
                snapStepSelect.appendChild(opt);
            }
        } catch {
            // ignore
        }

        // Default selection until a project arrives.
        syncingSnapUi = true;
        try {
            snapStepSelect.value = String(DEFAULT_SNAP_STEP_SEC);
        } catch {
            // ignore
        }
        syncingSnapUi = false;
        applyTimelineSnapStepSec(DEFAULT_SNAP_STEP_SEC);

        snapStepSelect.addEventListener('change', () => {
            if (syncingSnapUi) {
                return;
            }
            const stepSec = Number(String(snapStepSelect.value || '').trim());
            if (!isFinite(stepSec) || stepSec <= 0) {
                return;
            }

            // Apply locally immediately.
            applyTimelineSnapStepSec(stepSec);

            // Best-effort keep local project in sync.
            try {
                if (project) {
                    project = {
                        ...project,
                        snapSettings: {
                            enabled: true,
                            stepSec,
                        },
                    };
                }
            } catch {
                // ignore
            }

            // Persist to extension host.
            if (vscode) {
                try {
                    vscode.postMessage({ command: 'sequencerSetSnapSettings', stepSec });
                } catch {
                    // ignore
                }
            }
        });
    };

    let project = undefined;

    // Outline list (implemented separately from the widget, per upstream README guidance).
    // We keep outline scrolling in sync with the timeline's vertical scroll.
    let outlineHeaderSpacer = undefined;
    let outlineItemByTrackId = {};
    let syncingOutlineScroll = false;
    let syncingTimelineScroll = false;

    const getTrackById = (trackId) => {
        const id = String(trackId || '');
        if (!id || !project || !Array.isArray(project.tracks)) {
            return undefined;
        }
        return project.tracks.find((t) => t && String(t.id || '') === id);
    };

    const getTrackUi = (trackId) => {
        const t = getTrackById(trackId);
        const ui = t && t.ui ? t.ui : {};
        return {
            // Default-on behavior for visualization & dragging.
            valueLine: ui.valueLine !== false,
            locked: ui.locked === true,
            dragEnabled: ui.dragEnabled !== false,
        };
    };

    const applyTrackUiPatchLocal = (trackId, patch) => {
        const id = String(trackId || '');
        if (!id || !project || !Array.isArray(project.tracks) || !patch) {
            return;
        }
        project = {
            ...project,
            tracks: project.tracks.map((t) => {
                if (!t || String(t.id || '') !== id) {
                    return t;
                }
                return {
                    ...t,
                    ui: {
                        ...(t.ui || {}),
                        ...(typeof patch.valueLine === 'boolean' ? { valueLine: patch.valueLine } : {}),
                        ...(typeof patch.locked === 'boolean' ? { locked: patch.locked } : {}),
                        ...(typeof patch.dragEnabled === 'boolean' ? { dragEnabled: patch.dragEnabled } : {}),
                    }
                };
            })
        };
    };

    const postTrackUiPatch = (trackId, patch) => {
        if (!vscode) {
            return;
        }
        try {
            vscode.postMessage({ command: 'sequencerSetTrackUi', trackId, ui: patch });
        } catch {
            // ignore
        }
    };

    // Per-track group dragging toggle. The widget's groupsDraggable flag is global; we emulate
    // per-row control by only assigning keyframe.group for tracks that opt in.
    const isGroupDragEnabled = (trackId) => {
        const ui = getTrackUi(trackId);
        return ui.dragEnabled && !ui.locked;
    };

    const toggleGroupDragForTrack = (trackId) => {
        const id = String(trackId || '');
        if (!id) {
            return;
        }
        const ui = getTrackUi(id);
        if (ui.locked) {
            return;
        }
        const next = !ui.dragEnabled;
        applyTrackUiPatchLocal(id, { dragEnabled: next });
        postTrackUiPatch(id, { dragEnabled: next });
        rebuildTimelineModel();
    };

    const syncOutlineScrollFromTimeline = () => {
        if (!outlineHost || syncingTimelineScroll) {
            return;
        }
        syncingOutlineScroll = true;
        try {
            const st = typeof timeline.scrollTop === 'number' ? timeline.scrollTop : 0;
            outlineHost.scrollTop = st;
        } catch {
            // ignore
        }
        syncingOutlineScroll = false;
    };

    const syncTimelineScrollFromOutline = () => {
        if (!outlineHost || syncingOutlineScroll) {
            return;
        }
        syncingTimelineScroll = true;
        try {
            const st = typeof outlineHost.scrollTop === 'number' ? outlineHost.scrollTop : 0;
            timeline.scrollTop = st;
        } catch {
            // ignore
        }
        syncingTimelineScroll = false;
    };

    try {
        if (outlineHost) {
            outlineHost.addEventListener('scroll', syncTimelineScrollFromOutline, { passive: true });
        }
    } catch {
        // ignore
    }

    const getTimelineHeaderHeightPx = () => {
        try {
            const opt = (timeline && typeof timeline.getOptions === 'function') ? (timeline.getOptions() || {}) : {};
            const hh = opt.headerHeight;
            if (typeof hh === 'number' && isFinite(hh) && hh > 0) {
                return hh;
            }
        } catch {
            // ignore
        }
        return 48;
    };

    const rebuildOutline = () => {
        if (!outlineHost) {
            return;
        }
        outlineHost.innerHTML = '';
        outlineItemByTrackId = {};

        // Spacer so the outline aligns with the timeline's header area.
        outlineHeaderSpacer = global.document.createElement('div');
        outlineHeaderSpacer.className = 'outline-header-spacer';
        outlineHeaderSpacer.style.height = getTimelineHeaderHeightPx() + 'px';
        outlineHost.appendChild(outlineHeaderSpacer);

        if (!project || !Array.isArray(project.tracks)) {
            return;
        }

        for (const t of project.tracks) {
            const trackId = t && t.id ? String(t.id) : '';
            if (!trackId) {
                continue;
            }
            const uniformName = t && t.target && t.target.uniformName ? String(t.target.uniformName) : '';
            const label = uniformName || (t && t.name ? String(t.name) : trackId);

            const ui = getTrackUi(trackId);

            const getRowState = () => {
                const s = getTrackUi(trackId);
                if (s.locked) {
                    return 'L';
                }
                if (!s.dragEnabled) {
                    return 'D';
                }
                return 'N';
            };

            const item = global.document.createElement('div');
            item.className = 'outline-item';
            item.dataset.trackId = trackId;

            // Resilient layout even if CSS didn't reload yet.
            try {
                item.style.display = 'flex';
                item.style.alignItems = 'center';
                item.style.gap = '6px';
            } catch {
                // ignore
            }

            item.title = 'Click: select track. Shift+Click: toggle N↔D.';

            const controls = global.document.createElement('div');
            controls.className = 'outline-controls';

            try {
                controls.style.display = 'flex';
                controls.style.alignItems = 'center';
                controls.style.gap = '2px';
                controls.style.flex = '0 0 auto';
            } catch {
                // ignore
            }

            const mkBtn = (text, title) => {
                const b = global.document.createElement('button');
                b.className = 'outline-btn';
                b.type = 'button';
                b.textContent = text;
                b.title = title;

                // Inline styles so "pressed" state is visible even without updated CSS.
                try {
                    b.style.width = '18px';
                    b.style.height = '18px';
                    b.style.padding = '0';
                    b.style.margin = '0';
                    b.style.border = '1px solid #333';
                    b.style.borderRadius = '3px';
                    b.style.background = '#252526';
                    b.style.color = '#ddd';
                    b.style.fontFamily = 'Consolas, monospace';
                    b.style.fontSize = '10px';
                    b.style.lineHeight = '16px';
                    b.style.cursor = 'pointer';
                } catch {
                    // ignore
                }
                return b;
            };

            const applyBtnState = (btn, isOn) => {
                try {
                    btn.classList.toggle('on', !!isOn);
                    btn.classList.toggle('off', !isOn);
                } catch {
                    // ignore
                }
                try {
                    if (isOn) {
                        btn.style.background = 'rgba(156, 220, 254, 0.18)';
                        btn.style.borderColor = 'rgba(156, 220, 254, 0.35)';
                        btn.style.color = '#9cdcfe';
                        btn.style.opacity = '1';
                    } else {
                        btn.style.background = '#252526';
                        btn.style.borderColor = '#333';
                        btn.style.color = '#ddd';
                        btn.style.opacity = '0.55';
                    }
                } catch {
                    // ignore
                }
            };

            const btnV = mkBtn('V', 'Toggle value line visualization for this row');
            applyBtnState(btnV, ui.valueLine);
            btnV.addEventListener('click', (ev) => {
                try { ev.preventDefault(); ev.stopPropagation(); } catch { /* ignore */ }
                setSelectedTrackId(trackId);
                const next = !getTrackUi(trackId).valueLine;
                applyTrackUiPatchLocal(trackId, { valueLine: next });
                postTrackUiPatch(trackId, { valueLine: next });
                rebuildOutline();
                try { timeline.redraw(); } catch { /* ignore */ }
            });

            const btnState = mkBtn(getRowState(), 'Cycle row state: N (normal) → D (no drag) → L (locked)');

            const applyRowStateUi = () => {
                const s = getRowState();
                // Keep button readable: "L" is highlighted, "N" and "D" are dimmer.
                applyBtnState(btnState, s === 'L');
                try {
                    btnState.textContent = s;
                } catch {
                    // ignore
                }
                try {
                    btnState.style.opacity = (s === 'D') ? '0.75' : '';
                } catch {
                    // ignore
                }
            };

            applyRowStateUi();

            btnState.addEventListener('click', (ev) => {
                try { ev.preventDefault(); ev.stopPropagation(); } catch { /* ignore */ }
                setSelectedTrackId(trackId);

                const cur = getRowState();
                const next = cur === 'N' ? 'D' : (cur === 'D' ? 'L' : 'N');

                if (next === 'N') {
                    applyTrackUiPatchLocal(trackId, { locked: false, dragEnabled: true });
                    postTrackUiPatch(trackId, { locked: false, dragEnabled: true });
                } else if (next === 'D') {
                    applyTrackUiPatchLocal(trackId, { locked: false, dragEnabled: false });
                    postTrackUiPatch(trackId, { locked: false, dragEnabled: false });
                } else {
                    // Locked: keep dragEnabled true so unlock returns to normal.
                    applyTrackUiPatchLocal(trackId, { locked: true, dragEnabled: true });
                    postTrackUiPatch(trackId, { locked: true, dragEnabled: true });
                }

                applyRowStateUi();
                rebuildTimelineModel();
                refreshEditButtonsEnabledState();
            });

            controls.appendChild(btnV);
            controls.appendChild(btnState);

            const labelEl = global.document.createElement('div');
            labelEl.className = 'outline-label';
            labelEl.textContent = label;

            try {
                labelEl.style.flex = '1 1 auto';
                labelEl.style.minWidth = '0';
                labelEl.style.whiteSpace = 'nowrap';
                labelEl.style.overflow = 'hidden';
                labelEl.style.textOverflow = 'ellipsis';
            } catch {
                // ignore
            }

            item.appendChild(controls);
            item.appendChild(labelEl);

            item.addEventListener('click', (ev) => {
                if (ev && ev.shiftKey) {
                    const s = getRowState();
                    // Shift toggles N↔D, but never changes locked.
                    if (s !== 'L') {
                        const toD = s === 'N';
                        applyTrackUiPatchLocal(trackId, { dragEnabled: !toD });
                        postTrackUiPatch(trackId, { dragEnabled: !toD });
                        rebuildTimelineModel();
                        applyRowStateUi();
                    }
                    return;
                }

                setSelectedTrackId(trackId);
                refreshValueUiFromCurrentTrack();
                updateOutlineSelection();

                // Scroll the timeline to the selected row using default layout assumptions.
                // Row i is placed at headerHeight - scrollTop; to align row i at headerHeight we set scrollTop = i * (rowHeight + marginBottom).
                try {
                    if (timeline && typeof timeline.getOptions === 'function') {
                        const opt = timeline.getOptions() || {};
                        const rs = opt.rowsStyle || {};
                        const rowH = (typeof rs.height === 'number' && isFinite(rs.height)) ? rs.height : 24;
                        const rowMb = (typeof rs.marginBottom === 'number' && isFinite(rs.marginBottom)) ? rs.marginBottom : 2;
                        const idx = project.tracks.findIndex((x) => x && x.id === trackId);
                        if (idx >= 0) {
                            timeline.scrollTop = Math.max(0, Math.floor(idx * (rowH + rowMb)));
                        }
                    }
                } catch {
                    // ignore
                }
            });

            outlineItemByTrackId[trackId] = item;
            outlineHost.appendChild(item);
        }

        updateOutlineSelection();
        refreshEditButtonsEnabledState();
    };

    const updateOutlineSelection = () => {
        if (!outlineHost) {
            return;
        }
        const trackId = getSelectedTrackId();
        try {
            for (const id in outlineItemByTrackId) {
                const el = outlineItemByTrackId[id];
                if (!el) {
                    continue;
                }
                if (id === trackId) {
                    el.classList.add('selected');
                } else {
                    el.classList.remove('selected');
                }
            }
        } catch {
            // ignore
        }
    };

    // Scope visualization overlay (no widget source edits):
    // - Vertical marker at scope end
    // - Gray-out outside the scope range
    let scopeOverlayRoot = undefined;
    let scopeShadeLeft = undefined;
    let scopeShadeRight = undefined;
    let scopeLineStart = undefined;
    let scopeLineEnd = undefined;
    let scopeOverlayUpdateQueued = false;

    let currentScopeStartSec = 0;
    let currentScopeEndSec = 10;

    const ensureScopeOverlay = () => {
        if (scopeOverlayRoot) {
            return;
        }
        try {
            if (host && (!host.style.position || host.style.position === 'static')) {
                host.style.position = 'relative';
            }
        } catch {
            // ignore
        }

        try {
            scopeOverlayRoot = global.document.createElement('div');
            scopeOverlayRoot.style.position = 'absolute';
            scopeOverlayRoot.style.left = '0';
            scopeOverlayRoot.style.top = '0';
            scopeOverlayRoot.style.right = '0';
            scopeOverlayRoot.style.bottom = '0';
            scopeOverlayRoot.style.pointerEvents = 'none';
            scopeOverlayRoot.style.zIndex = '10';
            scopeOverlayRoot.style.display = 'none';

            scopeShadeLeft = global.document.createElement('div');
            scopeShadeLeft.style.position = 'absolute';
            scopeShadeLeft.style.left = '0';
            scopeShadeLeft.style.top = '0';
            scopeShadeLeft.style.bottom = '0';
            scopeShadeLeft.style.width = '0';
            scopeShadeLeft.style.background = 'rgba(128, 128, 128, 0.18)';

            scopeShadeRight = global.document.createElement('div');
            scopeShadeRight.style.position = 'absolute';
            scopeShadeRight.style.top = '0';
            scopeShadeRight.style.bottom = '0';
            scopeShadeRight.style.left = '0';
            scopeShadeRight.style.width = '0';
            scopeShadeRight.style.background = 'rgba(128, 128, 128, 0.18)';

            scopeLineStart = global.document.createElement('div');
            scopeLineStart.style.position = 'absolute';
            scopeLineStart.style.top = '0';
            scopeLineStart.style.bottom = '0';
            scopeLineStart.style.width = '1px';
            scopeLineStart.style.background = 'rgba(200, 200, 200, 0.55)';
            scopeLineStart.style.display = 'none';

            scopeLineEnd = global.document.createElement('div');
            scopeLineEnd.style.position = 'absolute';
            scopeLineEnd.style.top = '0';
            scopeLineEnd.style.bottom = '0';
            scopeLineEnd.style.width = '2px';
            scopeLineEnd.style.background = 'rgba(200, 200, 200, 0.75)';
            scopeLineEnd.style.display = 'none';

            scopeOverlayRoot.appendChild(scopeShadeLeft);
            scopeOverlayRoot.appendChild(scopeShadeRight);
            scopeOverlayRoot.appendChild(scopeLineStart);
            scopeOverlayRoot.appendChild(scopeLineEnd);
            host.appendChild(scopeOverlayRoot);
        } catch {
            // ignore
            scopeOverlayRoot = undefined;
        }
    };

    const clamp = (x, min, max) => Math.min(max, Math.max(min, x));

    const almostEqual = (a, b, eps = 1e-6) => {
        if (typeof a !== 'number' || typeof b !== 'number' || !isFinite(a) || !isFinite(b)) {
            return false;
        }
        return Math.abs(a - b) <= eps;
    };

    // Snap-aligned tick renderer (major + minor lines)
    //
    // Motivation:
    // The upstream widget draws minor ticks as: for each major tick i, draw x = i + smallStep ... < i + majorStep.
    // If smallStep does not evenly divide majorStep, minors will "restart" after each major tick (e.g. 0.5 + 0.2 = 0.7).
    //
    // To keep the gauge visually consistent with our Snap dropdown, we override _renderTicks so that:
    // - majorStep is always derived from Snap using integer multiples and allowed integer divisions (e.g. 0.5 -> 0.25/0.1/0.05)
    // - minorStep is only chosen from valid subdivisions (never e.g. 0.2 within 0.5)
    // - both are aligned to a global zero-origin grid
    const installSnapAlignedTicksRenderer = () => {
        if (!timeline || typeof timeline._renderTicks !== 'function') {
            return;
        }

        // Avoid double-install.
        if (timeline.__snapAlignedTicksInstalled) {
            return;
        }
        timeline.__snapAlignedTicksInstalled = true;

        const originalRenderTicks = timeline._renderTicks.bind(timeline);
        timeline.__originalRenderTicks = originalRenderTicks;

        const getStepPx = () => {
            try {
                const opt = timeline.getOptions ? (timeline.getOptions() || {}) : {};
                const stepPx = Number(opt.stepPx);
                return (isFinite(stepPx) && stepPx > 0) ? stepPx : 0;
            } catch {
                return 0;
            }
        };

        const getCanvasClientWidth = () => {
            try {
                if (typeof timeline._canvasClientWidth === 'function') {
                    return Number(timeline._canvasClientWidth());
                }
            } catch {
                // ignore
            }
            try {
                if (timeline._canvas && typeof timeline._canvas.clientWidth === 'number') {
                    return Number(timeline._canvas.clientWidth);
                }
            } catch {
                // ignore
            }
            return host ? (host.clientWidth || 0) : 0;
        };

        const getLeftMargin = () => {
            try {
                if (typeof timeline._leftMargin === 'function') {
                    return Number(timeline._leftMargin()) || 0;
                }
            } catch {
                // ignore
            }
            try {
                const opt = timeline.getOptions ? (timeline.getOptions() || {}) : {};
                const lm = Number(opt.leftMargin);
                return (isFinite(lm) && lm >= 0) ? lm : 0;
            } catch {
                return 0;
            }
        };

        const valToPxDelta = (valMs) => {
            try {
                if (!timeline || typeof timeline.valToPx !== 'function') {
                    return NaN;
                }
                const px0 = Number(timeline.valToPx(0));
                const px1 = Number(timeline.valToPx(valMs));
                const d = px1 - px0;
                return isFinite(d) ? Math.abs(d) : NaN;
            } catch {
                return NaN;
            }
        };

        const uniqueSorted = (arr) => {
            const out = [];
            const seen = new Set();
            for (const x of arr) {
                const v = Number(x);
                if (!isFinite(v) || v <= 0) {
                    continue;
                }
                // Key by rounded microseconds to keep stability.
                const k = String(Math.round(v * 1e6));
                if (seen.has(k)) {
                    continue;
                }
                seen.add(k);
                out.push(v);
            }
            out.sort((a, b) => a - b);
            return out;
        };

        const getAllowedMajorStepsSecForSnap = (snapSec) => {
            const sec = (typeof snapSec === 'number' && isFinite(snapSec) && snapSec > 0) ? snapSec : DEFAULT_SNAP_STEP_SEC;

            // Allowed integer divisions (zoom-in ladder) per Snap.
            // Divisors are chosen to match your stated rules.
            let divisors = [1];
            if (almostEqual(sec, 1.0)) {
                divisors = [1, 2, 4, 5, 10, 20]; // 1, 0.5, 0.25, 0.2, 0.1, 0.05
            } else if (almostEqual(sec, 0.5)) {
                divisors = [1, 2, 5, 10]; // 0.5, 0.25, 0.1, 0.05
            } else if (almostEqual(sec, 0.25)) {
                divisors = [1, 5]; // 0.25, 0.05
            } else if (almostEqual(sec, 0.2)) {
                divisors = [1, 2, 4]; // 0.2, 0.1, 0.05
            } else if (almostEqual(sec, 0.1)) {
                divisors = [1, 2]; // 0.1, 0.05
            } else if (almostEqual(sec, 0.05)) {
                divisors = [1];
            }

            const down = divisors.map((d) => sec / d);

            // Zoom-out ladder as integer multiples.
            // Keep it bounded to avoid huge steps.
            const mult = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
            const up = mult.map((m) => sec * m);

            return uniqueSorted([...down, ...up]);
        };

        const isIntegerMultiple = (a, b) => {
            // True if a = k*b for integer k (within epsilon)
            if (!isFinite(a) || !isFinite(b) || a <= 0 || b <= 0) {
                return false;
            }
            const k = a / b;
            const kr = Math.round(k);
            return Math.abs(k - kr) < 1e-6;
        };

        const getAllowedMinorStepsSecForMajor = (majorSec) => {
            const m = Number(majorSec);
            if (!isFinite(m) || m <= 0) {
                return [];
            }

            // Your explicit table for the common range.
            if (almostEqual(m, 1.0)) {
                return [0.5, 0.25, 0.2, 0.1, 0.05];
            }
            if (almostEqual(m, 0.5)) {
                return [0.25, 0.1, 0.05];
            }
            if (almostEqual(m, 0.25)) {
                return [0.05];
            }
            if (almostEqual(m, 0.2)) {
                return [0.1, 0.05];
            }
            if (almostEqual(m, 0.1)) {
                return [0.05];
            }
            if (almostEqual(m, 0.05)) {
                return [];
            }

            // Generic fallback for larger majors (zoomed out): prefer clean integer divisions.
            const candidates = [];
            for (const d of [2, 4, 5, 10, 20]) {
                candidates.push(m / d);
            }
            // Also allow the "standard" ladder down to 0.05 when it divides.
            for (const s of [1.0, 0.5, 0.25, 0.2, 0.1, 0.05]) {
                candidates.push(s);
            }

            return uniqueSorted(candidates.filter((x) => x > 0 && x < m && isIntegerMultiple(m, x)));
        };

        const pickClosest = (target, candidates) => {
            let best = undefined;
            let bestDist = Number.POSITIVE_INFINITY;
            for (const c of candidates) {
                const d = Math.abs(c - target);
                if (d < bestDist) {
                    bestDist = d;
                    best = c;
                }
            }
            return best;
        };

        const pickMinorStepSec = (majorSec, desiredPx = 18) => {
            const candidates = getAllowedMinorStepsSecForMajor(majorSec);
            if (!candidates || candidates.length === 0) {
                return undefined;
            }

            // Pick the candidate whose on-screen spacing is closest to desiredPx,
            // but avoid becoming too dense.
            let best = undefined;
            let bestScore = Number.POSITIVE_INFINITY;
            for (const c of candidates) {
                const px = valToPxDelta(Math.round(c * 1000));
                if (!isFinite(px) || px <= 0) {
                    continue;
                }
                if (px < 6) {
                    continue;
                }
                const score = Math.abs(px - desiredPx);
                if (score < bestScore) {
                    bestScore = score;
                    best = c;
                }
            }
            return best;
        };

        timeline._renderTicks = () => {
            try {
                if (!timeline._ctx || !timeline._ctx.canvas) {
                    return;
                }

                const opt = timeline.getOptions ? (timeline.getOptions() || {}) : {};
                const stepPx = getStepPx();
                if (!stepPx) {
                    // Widget can't convert val<->px, fall back to default.
                    return originalRenderTicks();
                }

                const headerHeight = getTimelineHeaderHeightPx();
                const tickHeight = headerHeight / 2;
                const smallTickHeight = headerHeight / 1.3;

                const screenWidth = Math.max(0, getCanvasClientWidth() - getLeftMargin());
                if (screenWidth <= 0) {
                    return;
                }

                let from = timeline.pxToVal ? timeline.pxToVal(timeline.scrollLeft) : NaN;
                let to = timeline.pxToVal ? timeline.pxToVal(timeline.scrollLeft + screenWidth) : NaN;
                if (!isFinite(from) || !isFinite(to) || from === to) {
                    return;
                }
                if (to < from) {
                    const tmp = to;
                    to = from;
                    from = tmp;
                }

                const valDistance = Math.abs(to - from);
                if (!(valDistance > 0)) {
                    return;
                }

                // Determine target major step in ms using the same idea as upstream:
                // majorVal ~= visibleRange / (screenWidth / stepPx)
                const targetMajorMs = valDistance / (screenWidth / stepPx);

                const snapSec = (typeof currentSnapStepSec === 'number' && isFinite(currentSnapStepSec) && currentSnapStepSec > 0)
                    ? currentSnapStepSec
                    : DEFAULT_SNAP_STEP_SEC;
                const majorCandidatesSec = getAllowedMajorStepsSecForSnap(snapSec);
                const majorSec = pickClosest(targetMajorMs / 1000, majorCandidatesSec);
                const majorMs = Math.max(1, Math.round((majorSec || snapSec) * 1000));

                // Select minor step from allowed subdivisions of the chosen major.
                const minorSec = pickMinorStepSec(majorMs / 1000, 18);
                const minorMs = (typeof minorSec === 'number' && isFinite(minorSec) && minorSec > 0)
                    ? Math.round(minorSec * 1000)
                    : 0;

                // Anchor ticks to a global 0-based grid.
                const fromVal = Math.floor(from / majorMs) * majorMs;
                const toVal = Math.ceil(to / majorMs) * majorMs + majorMs;

                const ctx = timeline._ctx;
                ctx.save();
                try {
                    let lastTextStart = 0;

                    for (let i = fromVal; i <= toVal; i += majorMs) {
                        const px = (typeof timeline._toScreenPx === 'function')
                            ? timeline._toScreenPx(i)
                            : timelineToScreenPx(i);
                        const sharpPos = (typeof timeline._getSharp === 'function')
                            ? timeline._getSharp(px)
                            : Math.round(px);

                        ctx.save();
                        try {
                            ctx.beginPath();
                            if (typeof ctx.setLineDash === 'function') {
                                ctx.setLineDash([4]);
                            }
                            ctx.lineWidth = 1;
                            if (opt.tickColor) {
                                ctx.strokeStyle = opt.tickColor;
                            }
                            ctx.moveTo(sharpPos, tickHeight);
                            ctx.lineTo(sharpPos, headerHeight);
                            ctx.stroke();

                            // Labels
                            if (opt.labelsColor) {
                                ctx.fillStyle = opt.labelsColor;
                            }
                            if (opt.font) {
                                ctx.font = opt.font;
                            }
                            const text = (typeof timeline._formatUnitsText === 'function')
                                ? timeline._formatUnitsText(i)
                                : String(i);
                            const textSize = ctx.measureText(text);
                            const textX = sharpPos - textSize.width / 2;
                            if (isNaN(lastTextStart) || lastTextStart <= textX) {
                                lastTextStart = textX + textSize.width;
                                ctx.fillText(text, textX, 10);
                            }
                        } finally {
                            ctx.restore();
                        }

                        // Minor ticks must divide major tick interval.
                        if (!minorMs || minorMs <= 0 || minorMs >= majorMs) {
                            continue;
                        }
                        const stepsPerMajor = Math.round(majorMs / minorMs);
                        if (stepsPerMajor <= 1 || stepsPerMajor > 64) {
                            continue;
                        }

                        for (let x = i + minorMs; x < i + majorMs; x += minorMs) {
                            const px2 = (typeof timeline._toScreenPx === 'function')
                                ? timeline._toScreenPx(x)
                                : timelineToScreenPx(x);
                            const sharpPos2 = (typeof timeline._getSharp === 'function')
                                ? timeline._getSharp(px2)
                                : Math.round(px2);
                            ctx.beginPath();
                            ctx.lineWidth = (typeof timeline._pixelRatio === 'number' && isFinite(timeline._pixelRatio) && timeline._pixelRatio > 0)
                                ? timeline._pixelRatio
                                : 1;
                            if (opt.tickColor) {
                                ctx.strokeStyle = opt.tickColor;
                            }
                            ctx.moveTo(sharpPos2, smallTickHeight);
                            ctx.lineTo(sharpPos2, headerHeight);
                            ctx.stroke();
                        }
                    }
                } finally {
                    ctx.restore();
                }
            } catch {
                // Safety: never break rendering; fall back to upstream.
                try {
                    return originalRenderTicks();
                } catch {
                    // ignore
                }
            }
        };
    };

    // Per-row value segments (between adjacent keys) as a tiny line inside the row.
    // Implemented via overlay canvas (no widget source edits). This avoids any chance of
    // leaking canvas state into the widget and also avoids stale pixels when per-row V is toggled.
    let valueLineRendererInstalled = false;
    const installValueLineRenderer = () => {
        if (valueLineRendererInstalled) {
            return;
        }
        valueLineRendererInstalled = true;

        try {
            if (!timeline || typeof timeline._renderKeyframe !== 'function') {
                return;
            }
        } catch {
            return;
        }

        const originalRenderKeyframe = timeline._renderKeyframe;
        const originalRedraw = typeof timeline.redraw === 'function' ? timeline.redraw.bind(timeline) : undefined;

        // Cache last-seen row layout/model from widget rendering.
        const rowStateByTrackId = new Map();

        // Cursor override: the widget has a global "groupsDraggable" option, so it may show the
        // group-drag cursor even for rows where we emulate "no-drag". We override the cursor
        // to the normal arrow for D/L rows.
        let cursorOverrideInstalled = false;
        let cursorForced = false;

        // Overlay canvas that we fully clear and redraw each timeline redraw.
        let overlayCanvas = undefined;
        let overlayCtx = undefined;
        let overlayPending = false;

        const getCursorElement = () => {
            try {
                const c = host && host.querySelector ? host.querySelector('canvas') : undefined;
                return c || host;
            } catch {
                return host;
            }
        };

        const getMouseLocalY = (ev, el) => {
            try {
                const r = el && typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : undefined;
                if (r && typeof ev.clientY === 'number') {
                    return ev.clientY - r.top;
                }
            } catch {
                // ignore
            }
            try {
                if (typeof ev.offsetY === 'number') {
                    return ev.offsetY;
                }
            } catch {
                // ignore
            }
            return NaN;
        };

        const findTrackIdAtY = (y) => {
            if (!isFinite(y)) {
                return undefined;
            }
            try {
                for (const [trackId, state] of rowStateByTrackId.entries()) {
                    const rowSize = state && state.rowSize ? state.rowSize : undefined;
                    if (!rowSize) {
                        continue;
                    }
                    const top = rowSize.y;
                    const h = rowSize.height;
                    if (typeof top === 'number' && typeof h === 'number' && isFinite(top) && isFinite(h) && y >= top && y < (top + h)) {
                        return trackId;
                    }
                }
            } catch {
                // ignore
            }
            return undefined;
        };

        const isResizeCursor = (cursor) => {
            const c = String(cursor || '').toLowerCase();
            return c === 'ew-resize' || c === 'col-resize' || c === 'e-resize' || c === 'w-resize';
        };

        const installCursorOverride = () => {
            if (cursorOverrideInstalled || !host) {
                return;
            }
            cursorOverrideInstalled = true;

            const onMove = (ev) => {
                const el = getCursorElement();
                if (!el) {
                    return;
                }

                const y = getMouseLocalY(ev, el);
                const trackId = findTrackIdAtY(y);
                const ui = trackId ? getTrackUi(trackId) : undefined;
                const wantDefault = !!(ui && (ui.locked || !ui.dragEnabled));

                if (!wantDefault) {
                    if (cursorForced) {
                        cursorForced = false;
                        try {
                            el.style.cursor = '';
                        } catch {
                            // ignore
                        }
                    }
                    return;
                }

                // Only override if the widget is trying to show a drag-resize cursor.
                let current = '';
                try {
                    current = el.style && typeof el.style.cursor === 'string' ? el.style.cursor : '';
                } catch {
                    current = '';
                }
                if (!current) {
                    try {
                        current = global.getComputedStyle ? String(global.getComputedStyle(el).cursor || '') : '';
                    } catch {
                        current = '';
                    }
                }

                if (!isResizeCursor(current) && !cursorForced) {
                    return;
                }

                cursorForced = true;
                try {
                    // Run after the widget's handler (which may set cursor each move).
                    setTimeout(() => {
                        try {
                            el.style.cursor = 'default';
                        } catch {
                            // ignore
                        }
                    }, 0);
                } catch {
                    // ignore
                }
            };

            const onLeave = () => {
                const el = getCursorElement();
                if (!el) {
                    return;
                }
                if (cursorForced) {
                    cursorForced = false;
                    try {
                        el.style.cursor = '';
                    } catch {
                        // ignore
                    }
                }
            };

            try {
                host.addEventListener('mousemove', onMove, { passive: true });
                host.addEventListener('mouseleave', onLeave, { passive: true });
            } catch {
                // ignore
            }
        };

        const ensureOverlayCanvas = () => {
            if (!global.document || !host) {
                return;
            }

            if (!overlayCanvas) {
                overlayCanvas = global.document.createElement('canvas');
                overlayCanvas.className = 'sequencer-value-line-overlay';
                try {
                    overlayCanvas.style.position = 'absolute';
                    overlayCanvas.style.left = '0';
                    overlayCanvas.style.top = '0';
                    overlayCanvas.style.right = '0';
                    overlayCanvas.style.bottom = '0';
                    overlayCanvas.style.pointerEvents = 'none';
                    overlayCanvas.style.zIndex = '10';
                } catch {
                    // ignore
                }

                // Host is an element; ensure it can contain an absolutely-positioned overlay.
                try {
                    const cs = global.getComputedStyle ? global.getComputedStyle(host) : undefined;
                    if (!cs || cs.position === 'static') {
                        host.style.position = 'relative';
                    }
                } catch {
                    // ignore
                }

                try {
                    host.appendChild(overlayCanvas);
                } catch {
                    // ignore
                }
            }

            if (!overlayCtx && overlayCanvas) {
                try {
                    overlayCtx = overlayCanvas.getContext('2d');
                } catch {
                    overlayCtx = undefined;
                }
            }

            try {
                const w = host.clientWidth || 0;
                const h = host.clientHeight || 0;
                if (w > 0 && h > 0) {
                    // Match device pixel ratio for crisp lines.
                    const dpr = (typeof global.devicePixelRatio === 'number' && isFinite(global.devicePixelRatio) && global.devicePixelRatio > 0) ? global.devicePixelRatio : 1;
                    const nextW = Math.floor(w * dpr);
                    const nextH = Math.floor(h * dpr);
                    if (overlayCanvas.width !== nextW || overlayCanvas.height !== nextH) {
                        overlayCanvas.width = nextW;
                        overlayCanvas.height = nextH;
                        overlayCanvas.style.width = w + 'px';
                        overlayCanvas.style.height = h + 'px';
                    }
                }
            } catch {
                // ignore
            }
        };

        const getRowGroupBounds = (rowSize) => {
            const rowTop = rowSize.y;
            const rowH = rowSize.height;
            const opt = (timeline && typeof timeline.getOptions === 'function') ? (timeline.getOptions() || {}) : {};
            const groupsStyle = opt.groupsStyle || {};
            const rowsStyle = opt.rowsStyle || {};
            const rowGroupsStyle = rowsStyle.groupsStyle || {};

            const heightRaw = (typeof rowGroupsStyle.height !== 'undefined') ? rowGroupsStyle.height : groupsStyle.height;
            const marginTopRaw = (typeof rowGroupsStyle.marginTop !== 'undefined') ? rowGroupsStyle.marginTop : groupsStyle.marginTop;

            const isAutoHeight = heightRaw === 'auto' || typeof heightRaw === 'undefined' || heightRaw === null;
            const isAutoMargin = marginTopRaw === 'auto';

            let groupH = isAutoHeight ? Math.floor(rowH) : heightRaw;
            if (typeof groupH === 'string') {
                groupH = parseInt(groupH, 10);
            }
            if (typeof groupH !== 'number' || !isFinite(groupH)) {
                groupH = Math.floor(rowH);
            }
            if (groupH > rowH) {
                groupH = rowH;
            }

            let groupMarginTop = marginTopRaw;
            if (typeof groupMarginTop === 'string') {
                groupMarginTop = isAutoMargin ? (rowH - groupH) / 2 : (parseInt(groupMarginTop, 10) || 0);
            }
            if (typeof groupMarginTop !== 'number' || !isFinite(groupMarginTop)) {
                groupMarginTop = isAutoMargin ? (rowH - groupH) / 2 : 0;
            }

            if (isAutoHeight || isAutoMargin) {
                groupH = groupH - 2 * groupMarginTop;
            }
            if (groupH <= 0) {
                return undefined;
            }

            return {
                top: rowTop + groupMarginTop,
                height: groupH,
            };
        };

        const drawOverlay = () => {
            overlayPending = false;
            ensureOverlayCanvas();
            if (!overlayCanvas || !overlayCtx) {
                return;
            }

            const ctx = overlayCtx;
            const w = overlayCanvas.width || 0;
            const h = overlayCanvas.height || 0;
            if (w <= 0 || h <= 0) {
                return;
            }

            // Clear fully (overlay is dedicated to value lines).
            try {
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.clearRect(0, 0, w, h);
            } catch {
                // ignore
            }

            // Scale to CSS pixels.
            const dpr = (typeof global.devicePixelRatio === 'number' && isFinite(global.devicePixelRatio) && global.devicePixelRatio > 0) ? global.devicePixelRatio : 1;
            try {
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            } catch {
                // ignore
            }

            // Draw per-row enabled segments.
            for (const [trackId, state] of rowStateByTrackId.entries()) {
                try {
                    const ui = getTrackUi(trackId);
                    if (!ui.valueLine) {
                        continue;
                    }

                    const rowModel = state && state.rowModel ? state.rowModel : undefined;
                    const rowSize = state && state.rowSize ? state.rowSize : undefined;
                    if (!rowModel || !rowSize) {
                        continue;
                    }

                    const minV = rowModel.valueMin;
                    const maxV = rowModel.valueMax;
                    if (typeof minV !== 'number' || !isFinite(minV) || typeof maxV !== 'number' || !isFinite(maxV) || maxV === minV) {
                        continue;
                    }

                    const keys = rowModel.keyframes;
                    if (!Array.isArray(keys) || keys.length < 2) {
                        continue;
                    }

                    const gb = getRowGroupBounds(rowSize);
                    if (!gb) {
                        continue;
                    }

                    const pad = 2;
                    const yMin = gb.top + pad;
                    const yMax = gb.top + gb.height - pad;
                    if (!(yMax > yMin)) {
                        continue;
                    }

                    const toNorm = (v) => clamp((v - minV) / (maxV - minV), 0, 1);
                    const toY = (v) => yMin + (1 - toNorm(v)) * (yMax - yMin);

                    const interpolation = rowModel.interpolation || 'linear';
                    const isStep = interpolation === 'step';

                    // Clip to the group-bar region so lines never bleed into label areas.
                    const clipW = (typeof rowSize.width === 'number' && isFinite(rowSize.width)) ? rowSize.width : (host ? (host.clientWidth || 0) : 0);
                    ctx.save();
                    try {
                        if (clipW > 0) {
                            ctx.beginPath();
                            ctx.rect(0, gb.top, clipW, gb.height);
                            ctx.clip();
                        }

                        ctx.globalAlpha = 1;
                        ctx.strokeStyle = 'rgba(200, 200, 200, 0.75)';
                        ctx.lineWidth = 1;
                        ctx.lineCap = 'round';
                        if (typeof ctx.setLineDash === 'function') {
                            ctx.setLineDash([]);
                        }

                        for (let i = 0; i < keys.length - 1; i++) {
                            const k0 = keys[i];
                            const k1 = keys[i + 1];
                            if (!k0 || !k1) {
                                continue;
                            }
                            const x0 = timelineToScreenPx(k0.val);
                            const x1 = timelineToScreenPx(k1.val);
                            const v0 = k0.value;
                            const v1 = k1.value;
                            if (!isFinite(x0) || !isFinite(x1) || typeof v0 !== 'number' || !isFinite(v0) || typeof v1 !== 'number' || !isFinite(v1)) {
                                continue;
                            }

                            const y0 = toY(v0);
                            const y1 = isStep ? y0 : toY(v1);

                            ctx.beginPath();
                            ctx.moveTo(x0, y0);
                            ctx.lineTo(x1, y1);
                            ctx.stroke();
                        }
                    } finally {
                        ctx.restore();
                    }
                } catch {
                    // ignore
                }
            }
        };

        const scheduleOverlay = () => {
            if (overlayPending) {
                return;
            }
            overlayPending = true;
            try {
                requestAnimationFrame(() => drawOverlay());
            } catch {
                overlayPending = false;
            }
        };

        // Wrap redraw so we draw overlay after the widget refreshes.
        if (originalRedraw) {
            timeline.redraw = () => {
                try {
                    // NOTE: We intentionally do NOT mutate tick/grid options during redraw.
                    // Keep tick spacing/labeling fully controlled by the timeline widget.
                    originalRedraw();
                } finally {
                    scheduleOverlay();
                }
            };
        }

        // Collect row layout/model from keyframe render calls.
        timeline._renderKeyframe = (ctx, keyframeVm) => {
            try {
                const rowVm = keyframeVm && keyframeVm.rowViewModel ? keyframeVm.rowViewModel : undefined;
                const rowModel = rowVm && rowVm.model ? rowVm.model : undefined;
                const rowSize = rowVm && rowVm.size ? rowVm.size : undefined;
                const trackId = rowModel && rowModel.id ? String(rowModel.id) : '';
                if (trackId && rowModel && rowSize) {
                    rowStateByTrackId.set(trackId, { rowModel, rowSize });
                }
            } catch {
                // ignore
            }

            const r = originalRenderKeyframe(ctx, keyframeVm);
            return r;
        };

        // Best effort: redraw overlay on resize.
        try {
            global.addEventListener('resize', () => scheduleOverlay());
        } catch {
            // ignore
        }

        // Initial paint (best-effort). The widget will usually call redraw soon anyway,
        // but this avoids cases where the overlay stays empty until the next interaction.
        try {
            scheduleOverlay();
        } catch {
            // ignore
        }

        // Also install cursor override (best-effort).
        try {
            installCursorOverride();
        } catch {
            // ignore
        }
    };

    const timelineToScreenPx = (valMs) => {
        try {
            if (timeline && typeof timeline._toScreenPx === 'function') {
                return timeline._toScreenPx(valMs);
            }
        } catch {
            // ignore
        }
        try {
            const leftMargin = timeline && typeof timeline._leftMargin === 'function' ? (timeline._leftMargin() || 0) : 0;
            const scrollLeft = timeline && typeof timeline.scrollLeft === 'number' ? (timeline.scrollLeft || 0) : 0;
            const px = timeline && typeof timeline.valToPx === 'function' ? timeline.valToPx(valMs) : valMs;
            return px - scrollLeft + leftMargin;
        } catch {
            return NaN;
        }
    };

    installValueLineRenderer();
    installSnapAlignedTicksRenderer();

    const updateScopeOverlay = () => {
        ensureScopeOverlay();
        if (!scopeOverlayRoot || !host) {
            return;
        }

        let startSec = currentScopeStartSec;
        let endSec = currentScopeEndSec;
        try {
            const p = project || {};
            const scope = p.timeScope;
            if (scope && typeof scope.startSec === 'number' && typeof scope.endSec === 'number') {
                startSec = scope.startSec;
                endSec = scope.endSec;
            }
        } catch {
            // ignore
        }

        if (!isFinite(startSec) || !isFinite(endSec) || endSec <= startSec) {
            scopeOverlayRoot.style.display = 'none';
            return;
        }

        const width = host.clientWidth || 0;
        if (width <= 0) {
            scopeOverlayRoot.style.display = 'none';
            return;
        }

        const xStart = timelineToScreenPx(startSec * 1000);
        const xEnd = timelineToScreenPx(endSec * 1000);
        if (!isFinite(xStart) || !isFinite(xEnd)) {
            scopeOverlayRoot.style.display = 'none';
            return;
        }

        scopeOverlayRoot.style.display = 'block';

        const leftShadeW = clamp(Math.floor(xStart), 0, width);
        scopeShadeLeft.style.width = leftShadeW + 'px';

        const rightShadeLeft = clamp(Math.floor(xEnd), 0, width);
        scopeShadeRight.style.left = rightShadeLeft + 'px';
        scopeShadeRight.style.width = Math.max(0, width - rightShadeLeft) + 'px';

        if (xStart >= -2 && xStart <= width + 2) {
            scopeLineStart.style.left = Math.floor(xStart) + 'px';
            scopeLineStart.style.display = 'block';
        } else {
            scopeLineStart.style.display = 'none';
        }

        if (xEnd >= -2 && xEnd <= width + 2) {
            scopeLineEnd.style.left = Math.floor(xEnd) + 'px';
            scopeLineEnd.style.display = 'block';
        } else {
            scopeLineEnd.style.display = 'none';
        }
    };

    const scheduleScopeOverlayUpdate = () => {
        if (scopeOverlayUpdateQueued) {
            return;
        }
        scopeOverlayUpdateQueued = true;
        try {
            global.requestAnimationFrame(() => {
                scopeOverlayUpdateQueued = false;
                updateScopeOverlay();
            });
        } catch {
            scopeOverlayUpdateQueued = false;
            updateScopeOverlay();
        }
    };

    try {
        global.addEventListener('resize', scheduleScopeOverlayUpdate, { passive: true });
        host.addEventListener('wheel', scheduleScopeOverlayUpdate, { passive: true });
        host.addEventListener('pointermove', scheduleScopeOverlayUpdate, { passive: true });
        host.addEventListener('pointerup', scheduleScopeOverlayUpdate, { passive: true });
        host.addEventListener('pointercancel', scheduleScopeOverlayUpdate, { passive: true });
    } catch {
        // ignore
    }

    try {
        if (typeof timeline.onScroll === 'function') {
            timeline.onScroll(() => {
                scheduleScopeOverlayUpdate();
                syncOutlineScrollFromTimeline();
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

    const refreshEditButtonsEnabledState = () => {
        const trackId = getSelectedTrackId();
        const locked = trackId ? getTrackUi(trackId).locked : false;

        const apply = (btn) => {
            if (!btn) {
                return;
            }
            try {
                btn.disabled = !!locked;
            } catch {
                // ignore
            }
        };

        apply(addKeyButton);
        apply(updateKeyButton);
        apply(deleteKeyButton);
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

        updateOutlineSelection();
        refreshEditButtonsEnabledState();
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

        rebuildOutline();
    };

    const rebuildTimelineModel = () => {
        if (!project || !project.tracks) {
            timeline.setModel({ rows: [] });
            scheduleScopeOverlayUpdate();
            return;
        }
        const rows = project.tracks.map((t) => {
            const minValue = (typeof t.minValue === 'number' && isFinite(t.minValue)) ? t.minValue : undefined;
            const maxValue = (typeof t.maxValue === 'number' && isFinite(t.maxValue)) ? t.maxValue : undefined;
            const interpolation = t.interpolation || (project.defaults ? project.defaults.interpolation : undefined) || 'linear';

            const keyframes = (t.keys || []).map((k, i) => {
                return {
                    id: k.id,
                    trackId: t.id,
                    // Group id controls the draggable "strip" behavior.
                    group: isGroupDragEnabled(t.id) ? t.id : undefined,
                    val: Math.round((k.t || 0) * 1000),
                    value: k.v,
                    keyIndex: i,
                    selected: false,
                };
            });
            return {
                id: t.id,
                name: t.name,
                title: t.name,
                valueMin: minValue,
                valueMax: maxValue,
                interpolation,
                keyframes,
            };
        });
        timeline.setModel({ rows });
        scheduleScopeOverlayUpdate();

        rebuildOutline();
        syncOutlineScrollFromTimeline();
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
            try {
                playPauseButton.classList.toggle('on', paused);
            } catch {
                // ignore
            }
        }
    };

    const setLoopUi = (isLoop) => {
        loopEnabled = !!isLoop;
        if (loopButton) {
            loopButton.textContent = loopEnabled ? 'Loop: On' : 'Loop: Off';
            try {
                loopButton.classList.toggle('on', loopEnabled);
            } catch {
                // ignore
            }
        }
    };

    const setScopeUi = (startSec, endSec) => {
        if (typeof startSec === 'number' && isFinite(startSec)) {
            currentScopeStartSec = startSec;
        }
        if (typeof endSec === 'number' && isFinite(endSec)) {
            currentScopeEndSec = endSec;
        }
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

        scheduleScopeOverlayUpdate();
    };

    setPausedUi(false);
    setLoopUi(true);
    setScopeUi(0, 10);
    initSnapUi();

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

        currentScopeStartSec = startSec;
        currentScopeEndSec = endSec;
        scheduleScopeOverlayUpdate();
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

        scheduleScopeOverlayUpdate();
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

        const ui = getTrackUi(trackId);
        if (ui.locked || !ui.dragEnabled) {
            // Revert the local drag visual by rebuilding from the persisted project.
            rebuildTimelineModel();
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
            refreshEditButtonsEnabledState();
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
            setSnapUiFromProject();
            refreshValueUiFromCurrentTrack();
            refreshEditButtonsEnabledState();
            scheduleScopeOverlayUpdate();
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
            refreshEditButtonsEnabledState();
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

            const ui = getTrackUi(trackId);
            if (ui.locked) {
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

            const ui = getTrackUi(selectedKey.trackId);
            if (ui.locked) {
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

            const ui = getTrackUi(selectedKey.trackId);
            if (ui.locked) {
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

    // Initialize scope overlay.
    scheduleScopeOverlayUpdate();
})(typeof window !== 'undefined' ? window : globalThis);
