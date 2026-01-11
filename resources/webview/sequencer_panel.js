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

    const valueLineButton = global.document && global.document.getElementById
        ? global.document.getElementById('sequencer_value_line')
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

    let project = undefined;

    // Outline list (implemented separately from the widget, per upstream README guidance).
    // We keep outline scrolling in sync with the timeline's vertical scroll.
    let outlineHeaderSpacer = undefined;
    let outlineItemByTrackId = {};
    let syncingOutlineScroll = false;
    let syncingTimelineScroll = false;

    // Per-track group dragging toggle. The widget's groupsDraggable flag is global; we emulate
    // per-row control by only assigning keyframe.group for tracks that opt in.
    // (Default: enabled for all tracks.)
    let groupDragEnabledByTrackId = {};

    const isGroupDragEnabled = (trackId) => {
        const k = String(trackId || '');
        if (!k) {
            return true;
        }
        return groupDragEnabledByTrackId[k] !== false;
    };

    const toggleGroupDragForTrack = (trackId) => {
        const k = String(trackId || '');
        if (!k) {
            return;
        }
        const next = !isGroupDragEnabled(k);
        groupDragEnabledByTrackId[k] = next;
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

            const item = global.document.createElement('div');
            item.className = 'outline-item';
            item.textContent = label;
            item.dataset.trackId = trackId;

            item.title = 'Click: select track. Shift+Click: toggle group drag for this row.';

            item.addEventListener('click', (ev) => {
                if (ev && ev.shiftKey) {
                    toggleGroupDragForTrack(trackId);
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

    let valueLineEnabled = true;
    const setValueLineUi = (enabled) => {
        valueLineEnabled = !!enabled;
        if (valueLineButton) {
            valueLineButton.textContent = valueLineEnabled ? 'Value line: On' : 'Value line: Off';
        }
        try {
            if (timeline && typeof timeline.redraw === 'function') {
                timeline.redraw();
            }
        } catch {
            // ignore
        }
    };

    // Draw per-row value segments (between adjacent keys) as a tiny line inside the row.
    // Implemented via runtime method override on the timeline instance (no widget source edits).
    // The line is drawn before the key marker so the marker stays on top.
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

        const getKeyframeCenterX = (keyframeVm) => {
            if (!keyframeVm || !keyframeVm.size) {
                return NaN;
            }
            const s = keyframeVm.size;
            const shape = keyframeVm.shape;
            if (shape === 'rect') {
                const w = (typeof s.width === 'number' && isFinite(s.width)) ? s.width : 0;
                return (typeof s.x === 'number' && isFinite(s.x)) ? (s.x + w / 2) : NaN;
            }
            return (typeof s.x === 'number' && isFinite(s.x)) ? s.x : NaN;
        };

        const drawValueSegment = (ctx, keyframeVm) => {
            if (!valueLineEnabled) {
                return;
            }
            if (!ctx || !keyframeVm || !keyframeVm.rowViewModel || !keyframeVm.model) {
                return;
            }

            const rowModel = keyframeVm.rowViewModel.model;
            const rowSize = keyframeVm.rowViewModel.size;
            const keyModel = keyframeVm.model;

            if (!rowModel || !rowSize) {
                return;
            }

            const minV = rowModel.valueMin;
            const maxV = rowModel.valueMax;
            if (typeof minV !== 'number' || !isFinite(minV) || typeof maxV !== 'number' || !isFinite(maxV) || maxV === minV) {
                return;
            }

            const rowKeys = rowModel.keyframes;
            if (!Array.isArray(rowKeys) || rowKeys.length < 2) {
                return;
            }

            let idx = -1;
            if (typeof keyModel.keyIndex === 'number' && isFinite(keyModel.keyIndex)) {
                idx = keyModel.keyIndex;
            } else {
                const keyId = keyModel.id;
                if (typeof keyId === 'string') {
                    idx = rowKeys.findIndex((k) => k && k.id === keyId);
                }
            }
            if (idx < 0 || idx >= rowKeys.length - 1) {
                return;
            }

            const nextKey = rowKeys[idx + 1];
            if (!nextKey || typeof nextKey.val !== 'number' || !isFinite(nextKey.val)) {
                return;
            }

            const v0 = keyModel.value;
            const v1 = nextKey.value;
            if (typeof v0 !== 'number' || !isFinite(v0) || typeof v1 !== 'number' || !isFinite(v1)) {
                return;
            }

            const x0 = getKeyframeCenterX(keyframeVm);
            const x1 = timelineToScreenPx(nextKey.val);
            if (!isFinite(x0) || !isFinite(x1)) {
                return;
            }

            const rowTop = rowSize.y;
            const rowH = rowSize.height;
            if (typeof rowTop !== 'number' || !isFinite(rowTop) || typeof rowH !== 'number' || !isFinite(rowH) || rowH <= 0) {
                return;
            }

            // Keep the line within the inner "row bar" (group bounds) region rather than the full row.
            // The widget draws group bounds as a smaller strip inside the row (default marginTop=4, height='auto' => rowH-8).
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

            // Mirror widget logic: when either height or margin is auto, shrink group by 2*marginTop.
            if (isAutoHeight || isAutoMargin) {
                groupH = groupH - 2 * groupMarginTop;
            }
            if (groupH <= 0) {
                return;
            }

            const groupTop = rowTop + groupMarginTop;

            // Keep the line away from the group-bar edges.
            const pad = 2;
            const yMin = groupTop + pad;
            const yMax = groupTop + groupH - pad;
            if (!(yMax > yMin)) {
                return;
            }

            const toNorm = (v) => clamp((v - minV) / (maxV - minV), 0, 1);
            // Bottom = min, top = max.
            const toY = (v) => yMin + (1 - toNorm(v)) * (yMax - yMin);

            const y0 = toY(v0);
            const interpolation = rowModel.interpolation || 'linear';
            const isStep = interpolation === 'step';
            const y1 = isStep ? y0 : toY(v1);

            ctx.save();
            try {
                const clipW = (typeof rowSize.width === 'number' && isFinite(rowSize.width)) ? rowSize.width : 0;
                if (clipW > 0) {
                    ctx.beginPath();
                    ctx.rect(0, groupTop, clipW, groupH);
                    ctx.clip();
                }

                ctx.strokeStyle = 'rgba(200, 200, 200, 0.75)';
                ctx.lineWidth = 1;
                ctx.lineCap = 'round';
                if (typeof ctx.setLineDash === 'function') {
                    ctx.setLineDash([]);
                }

                ctx.beginPath();
                ctx.moveTo(x0, y0);
                if (isStep) {
                    ctx.lineTo(x1, y0);
                } else {
                    ctx.lineTo(x1, y1);
                }
                ctx.stroke();
            } finally {
                ctx.restore();
            }
        };

        timeline._renderKeyframe = (ctx, keyframeVm) => {
            try {
                drawValueSegment(ctx, keyframeVm);
            } catch {
                // ignore
            }
            return originalRenderKeyframe(ctx, keyframeVm);
        };
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
        }
    };

    const setLoopUi = (isLoop) => {
        loopEnabled = !!isLoop;
        if (loopButton) {
            loopButton.textContent = loopEnabled ? 'Loop: On' : 'Loop: Off';
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
    setValueLineUi(true);

    if (valueLineButton) {
        valueLineButton.addEventListener('click', () => {
            setValueLineUi(!valueLineEnabled);
        });
    }

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

    // Initialize scope overlay.
    scheduleScopeOverlayUpdate();
})(typeof window !== 'undefined' ? window : globalThis);
